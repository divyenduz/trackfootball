import type { StravaWebhookEvent, StravaWebhookEventStatus } from '../types'
import { Sql } from 'postgres'
import invariant from 'tiny-invariant'

interface CreateStravaWebhookEventInput {
  status: StravaWebhookEventStatus
  body: string
  errors: string[]
}

const retryableWhere = (sql: Sql) => sql`
  "status" = 'PENDING'
  AND "errors"[1] LIKE 'accepted:v1:%'
  AND (
    "errors"[cardinality("errors")] LIKE 'accepted:v1:%'
    OR "errors"[cardinality("errors")] LIKE 'requeue:v1:%'
    OR (
      "errors"[cardinality("errors")] LIKE 'failure:v1:%'
      AND "updatedAt" < NOW() - INTERVAL '5 minutes'
    )
    OR (
      "errors"[cardinality("errors")] LIKE 'claim:v1:%'
      AND "updatedAt" < NOW() - INTERVAL '10 minutes'
    )
  )
`

export async function createStravaWebhookEvent(
  sql: Sql,
  input: CreateStravaWebhookEventInput,
): Promise<StravaWebhookEvent> {
  const data = {
    ...input,
    updatedAt: sql`now()`,
  }

  const stravaWebhookEvents: StravaWebhookEvent[] = await sql`
    INSERT INTO "public"."StravaWebhookEvent" ${
      //@ts-expect-error
      sql(data)
    }
    RETURNING *
  `
  const stravaWebhookEvent = stravaWebhookEvents[0]
  invariant(stravaWebhookEvent, 'expected createStravaWebhookEvent to exist')
  return stravaWebhookEvent
}

export async function updateStravaWebhookEventStatus(
  sql: Sql,
  id: number,
  status: StravaWebhookEventStatus,
): Promise<void> {
  await sql`
    UPDATE "StravaWebhookEvent" 
    SET "status" = ${status}, "updatedAt" = NOW()
    WHERE "id" = ${id}
  `
}

export async function getRetryableStravaWebhookEvents(
  sql: Sql,
  limit: number,
): Promise<StravaWebhookEvent[]> {
  return sql<StravaWebhookEvent[]>`
    SELECT * FROM "StravaWebhookEvent"
    WHERE ${retryableWhere(sql)}
    ORDER BY "createdAt" ASC
    LIMIT ${limit}
  `
}

export async function requeueStravaWebhookEvent(
  sql: Sql,
  id: number,
): Promise<StravaWebhookEvent | null> {
  const events = await sql<StravaWebhookEvent[]>`
    UPDATE "StravaWebhookEvent"
    SET "status" = 'PENDING',
        "errors" = array_append(
          COALESCE("errors", ARRAY[]::text[]),
          'requeue:v1:operator'
        ),
        "updatedAt" = NOW()
    WHERE "id" = ${id}
      AND "status" = 'ERRORED'
      AND "errors"[1] LIKE 'accepted:v1:%'
    RETURNING *
  `
  return events[0] ?? null
}

export async function claimStravaWebhookEvent(
  sql: Sql,
  id: number,
  claim: string,
): Promise<StravaWebhookEvent | null> {
  const events = await sql<StravaWebhookEvent[]>`
    UPDATE "StravaWebhookEvent"
    SET "errors" = array_append(COALESCE("errors", ARRAY[]::text[]), ${claim}),
        "updatedAt" = NOW()
    WHERE "id" = ${id} AND ${retryableWhere(sql)}
    RETURNING *
  `
  return events[0] ?? null
}

export async function completeClaimedStravaWebhookEvent(
  sql: Sql,
  id: number,
  claim: string,
): Promise<boolean> {
  const events = await sql<StravaWebhookEvent[]>`
    UPDATE "StravaWebhookEvent"
    SET "status" = 'COMPLETED', "updatedAt" = NOW()
    WHERE "id" = ${id}
      AND "status" = 'PENDING'
      AND "errors"[cardinality("errors")] = ${claim}
    RETURNING *
  `
  return Boolean(events[0])
}

export async function failClaimedStravaWebhookEvent(
  sql: Sql,
  id: number,
  claim: string,
  failure: string,
  terminal: boolean,
): Promise<boolean> {
  const events = await sql<StravaWebhookEvent[]>`
    UPDATE "StravaWebhookEvent"
    SET "status" = ${terminal ? 'ERRORED' : 'PENDING'},
        "errors" = array_append("errors", ${failure}),
        "updatedAt" = NOW()
    WHERE "id" = ${id}
      AND "status" = 'PENDING'
      AND "errors"[cardinality("errors")] = ${claim}
    RETURNING *
  `
  return Boolean(events[0])
}

export async function deleteStravaWebhookEvent(
  sql: Sql,
  id: number,
): Promise<void> {
  await sql`
    DELETE FROM "StravaWebhookEvent" 
    WHERE "id" = ${id}
  `
}

export async function findStravaWebhookEventByActivityId(
  sql: Sql,
  activityId: number,
): Promise<StravaWebhookEvent | null> {
  const events: StravaWebhookEvent[] = await sql`
    SELECT * FROM "StravaWebhookEvent" 
    WHERE "body"::jsonb ->> 'object_id' = ${activityId.toString()}
    AND "status" = 'PENDING'
    LIMIT 1
  `

  return events[0] || null
}
