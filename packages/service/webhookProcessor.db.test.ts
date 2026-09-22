/**
 * PostgreSQL-backed concurrency tests for the Strava webhook claim/retry
 * state machine.
 *
 * These tests run only when TEST_DATABASE_URL points at a scratch database
 * (never production). The suite creates the StravaWebhookEvent table if it
 * is missing and truncates it around every test.
 */
import {
  createRepository,
  getSql,
  type StravaWebhookEvent,
} from '@trackfootball/postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  processStravaWebhookEvent,
  reprocessStravaWebhookEvent,
} from './webhookProcessor'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const describeDb = TEST_DATABASE_URL ? describe : describe.skip

const SUBSCRIPTION_ID = 303

const body = {
  object_id: 101,
  owner_id: 202,
  subscription_id: SUBSCRIPTION_ID,
  event_time: 1_700_000_000,
  object_type: 'activity',
  aspect_type: 'create',
  updates: {},
}

const env = {
  HOMEPAGE_URL: 'https://example.com',
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: SUBSCRIPTION_ID,
}

const stravaOAuth = { clientId: 'client', clientSecret: 'secret' }

describeDb('Strava webhook processing (PostgreSQL)', () => {
  const sql = getSql(TEST_DATABASE_URL!)
  const repository = createRepository(sql)

  async function insertEvent(
    overrides: Partial<{
      status: 'PENDING' | 'ERRORED' | 'COMPLETED'
      errors: string[]
    }> = {},
  ): Promise<StravaWebhookEvent> {
    return repository.createStravaWebhookEvent({
      status: overrides.status ?? 'PENDING',
      body: JSON.stringify(body),
      errors: overrides.errors ?? [`accepted:v1:${SUBSCRIPTION_ID}`],
    })
  }

  async function getEvent(id: number): Promise<StravaWebhookEvent> {
    const rows = await sql<
      StravaWebhookEvent[]
    >`SELECT * FROM "StravaWebhookEvent" WHERE id = ${id}`
    const row = rows[0]
    expect(row).toBeDefined()
    return row!
  }

  beforeAll(async () => {
    await sql`
      DO $$
      BEGIN
        CREATE TYPE public."StravaWebhookEventStatus" AS ENUM ('PENDING', 'ERRORED', 'COMPLETED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END
      $$
    `
    await sql`
      CREATE TABLE IF NOT EXISTS public."StravaWebhookEvent" (
        id SERIAL PRIMARY KEY,
        "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamp(3) without time zone NOT NULL,
        status public."StravaWebhookEventStatus" NOT NULL,
        body text NOT NULL,
        errors text[]
      )
    `
  })

  beforeEach(async () => {
    await sql`TRUNCATE public."StravaWebhookEvent"`
  })

  afterAll(async () => {
    await sql.end()
  })

  it('lets exactly one of two concurrent processors claim an event', async () => {
    const sourceEvent = await insertEvent()
    const importStravaActivity = vi.fn().mockResolvedValue(undefined)
    const deps = {
      repository,
      stravaOAuth,
      env,
      importStravaActivity,
    }

    const results = await Promise.all([
      processStravaWebhookEvent(sourceEvent, deps),
      processStravaWebhookEvent(sourceEvent, deps),
    ])
    const statuses = results.map((result) => result.status).sort()

    expect(statuses).toEqual(['COMPLETED', 'SKIPPED'])
    expect(importStravaActivity).toHaveBeenCalledOnce()

    const persisted = await getEvent(sourceEvent.id)
    expect(persisted.status).toBe('COMPLETED')
    expect(
      persisted.errors?.filter((entry) => entry.startsWith('claim:v1:')),
    ).toHaveLength(1)
  })

  it('honours an in-flight lease and reclaims it once expired', async () => {
    const sourceEvent = await insertEvent({
      errors: [`accepted:v1:${SUBSCRIPTION_ID}`, 'claim:v1:in-flight:1'],
    })
    const importStravaActivity = vi.fn().mockResolvedValue(undefined)
    const deps = {
      repository,
      stravaOAuth,
      env,
      importStravaActivity,
    }

    const blocked = await processStravaWebhookEvent(sourceEvent, deps)
    expect(blocked.status).toBe('SKIPPED')
    expect(importStravaActivity).not.toHaveBeenCalled()

    await sql`
      UPDATE "StravaWebhookEvent"
      SET "updatedAt" = NOW() - INTERVAL '11 minutes'
      WHERE id = ${sourceEvent.id}
    `

    const reclaimed = await processStravaWebhookEvent(sourceEvent, deps)
    expect(reclaimed.status).toBe('COMPLETED')
    expect(importStravaActivity).toHaveBeenCalledOnce()
    expect((await getEvent(sourceEvent.id)).status).toBe('COMPLETED')
  })

  it('completes only with the latest claim token', async () => {
    const sourceEvent = await insertEvent()
    const claim = 'claim:v1:test:1'

    const claimed = await repository.claimStravaWebhookEvent(
      sourceEvent.id,
      claim,
    )
    expect(claimed).not.toBeNull()

    await expect(
      repository.completeClaimedStravaWebhookEvent(
        sourceEvent.id,
        'claim:v1:stale:0',
      ),
    ).resolves.toBe(false)
    await expect(
      repository.failClaimedStravaWebhookEvent(
        sourceEvent.id,
        'claim:v1:stale:0',
        'failure:v1:test',
        true,
      ),
    ).resolves.toBe(false)

    await expect(
      repository.completeClaimedStravaWebhookEvent(sourceEvent.id, claim),
    ).resolves.toBe(true)
    expect((await getEvent(sourceEvent.id)).status).toBe('COMPLETED')
  })

  it('requeues an errored event exactly once at the repository level', async () => {
    const erroredEvent = await insertEvent({
      status: 'ERRORED',
      errors: [
        `accepted:v1:${SUBSCRIPTION_ID}`,
        'claim:v1:failed:5',
        'failure:v1:http-500',
      ],
    })

    await expect(
      repository.requeueStravaWebhookEvent(erroredEvent.id),
    ).resolves.toMatchObject({ status: 'PENDING' })
    await expect(
      repository.requeueStravaWebhookEvent(erroredEvent.id),
    ).resolves.toBeNull()

    const persisted = await getEvent(erroredEvent.id)
    expect(persisted.errors).toContain('requeue:v1:operator')
  })

  it('reprocesses an errored event after an operator requeue', async () => {
    const erroredEvent = await insertEvent({
      status: 'ERRORED',
      errors: [
        `accepted:v1:${SUBSCRIPTION_ID}`,
        'claim:v1:failed:5',
        'failure:v1:http-500',
      ],
    })

    const importStravaActivity = vi.fn().mockResolvedValue(undefined)
    const result = await reprocessStravaWebhookEvent(erroredEvent, {
      repository,
      stravaOAuth,
      env,
      importStravaActivity,
    })

    expect(result.status).toBe('COMPLETED')
    expect(importStravaActivity).toHaveBeenCalledOnce()

    const persisted = await getEvent(erroredEvent.id)
    expect(persisted.status).toBe('COMPLETED')
    expect(persisted.errors).toContain('requeue:v1:operator')
  })

  it('skips reprocessing events that are not pending or errored', async () => {
    const completedEvent = await insertEvent({ status: 'COMPLETED' })
    const importStravaActivity = vi.fn().mockResolvedValue(undefined)

    const result = await reprocessStravaWebhookEvent(completedEvent, {
      repository,
      stravaOAuth,
      env,
      importStravaActivity,
    })

    expect(result.status).toBe('SKIPPED')
    expect(importStravaActivity).not.toHaveBeenCalled()
  })
})
