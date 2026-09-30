import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRepository } from '@trackfootball/postgres'
import { uploadActivity } from './uploadActivity'

// Explicitly opt in to a local disposable database; never use DATABASE_URL.
const url = process.env.TEST_DATABASE_URL
describe.skipIf(!url)('upload PostgreSQL integration', () => {
  let admin: ReturnType<typeof postgres>
  let sql: ReturnType<typeof postgres>
  let repository: ReturnType<typeof createRepository>
  const database = `upload_test_${randomUUID().replaceAll('-', '')}`
  const origin = 'https://trackfootball.test'
  const gpx =
    '<gpx><trk><trkseg><trkpt lat="0" lon="13"><time>2026-09-28T10:00:00Z</time><extensions><hr>100</hr></extensions></trkpt><trkpt lat="0" lon="13.001"><time>2026-09-28T10:00:10Z</time></trkpt></trkseg><trkseg><trkpt lat="0" lon="14"><time>2026-09-28T10:00:30Z</time><extensions><hr>160</hr></extensions></trkpt><trkpt lat="0" lon="14.002"><time>2026-09-28T10:00:50Z</time><extensions><hr>190</hr></extensions></trkpt></trkseg></trk></gpx>'
  const upload = (userId: number, body = gpx) =>
    uploadActivity(
      new Request(
        `${origin}/api/activities/upload?filename=match.gpx&title=Test%20match`,
        {
          method: 'POST',
          body,
          headers: { origin },
        },
      ),
      { origin, userId, repository, allowUpload: async () => true },
    )

  beforeAll(async () => {
    const target = new URL(url!)
    if (!['localhost', '127.0.0.1'].includes(target.hostname))
      throw new Error(
        'TEST_DATABASE_URL must point to a local disposable PostgreSQL server',
      )
    admin = postgres(target.toString(), { max: 1 })
    await admin.unsafe(`CREATE DATABASE ${database}`)
    target.pathname = `/${database}`
    sql = postgres(target.toString())
    const schema = readFileSync(
      new URL('../postgres/schema.sql', import.meta.url),
      'utf8',
    )
      .replace('SET transaction_timeout = 0;', '')
      .replace("SELECT pg_catalog.set_config('search_path', '', false);", '')
      .replace(
        "'STRAVA_ACTIVITY',\n    'UPLOADED_ACTIVITY'",
        "'STRAVA_ACTIVITY'",
      )
    await sql.unsafe(schema)
    // Start from the old enum and prove the additive migration is repeatable.
    const migration = readFileSync(
      new URL(
        '../postgres/migrations/20260928_activity_upload.sql',
        import.meta.url,
      ),
      'utf8',
    )
    await sql.unsafe(migration)
    await sql.unsafe(migration)
    await sql`INSERT INTO "User" (id, "updatedAt", "firstName") VALUES (1, now(), 'Test'), (2, now(), 'Other')`
    repository = createRepository(sql)
  }, 20_000)

  afterAll(async () => {
    await sql?.end()
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${database}`)
      await admin.end()
    }
  })

  it('persists once under concurrent retries, isolates owners and aggregates all segments', async () => {
    const responses = await Promise.all([upload(1), upload(1), upload(1)])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201])
    const results = await Promise.all(responses.map((r) => r.json()))
    expect(new Set(results.map((r) => r.id)).size).toBe(1)
    const detail = await repository.getPostWithUserAndFields(results[0].id)
    expect(detail).toMatchObject({
      status: 'COMPLETED',
      type: 'UPLOADED_ACTIVITY',
      userId: 1,
      text: 'Test match',
      elapsedTime: 50,
      numberOfCoordinates: 4,
      maxHeartRate: 190,
      averageHeartRate: 150,
      sprints: [],
      runs: [],
    })
    expect(detail!.totalDistance).toBeCloseTo(333.58524, 3)
    const other = await (await upload(2)).json()
    expect(other.id).not.toBe(results[0].id)
    expect((await repository.getPostById(other.id))?.userId).toBe(2)
    expect((await repository.getFeed()).posts).toHaveLength(2)
  })

  it('leaves no partial rows for parse errors or database rejection', async () => {
    const [before] = await sql`SELECT count(*)::int AS count FROM "Post"`
    expect((await upload(1, '<gpx/>')).status).toBe(400)
    expect((await upload(999)).status).toBe(500) // FK failure must roll back the insert.
    const [after] = await sql`SELECT count(*)::int AS count FROM "Post"`
    expect(after.count).toBe(before.count)
  })
})
