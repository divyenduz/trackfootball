import { buildCommand } from '@stricli/core'
import { createRepository } from '@trackfootball/postgres'
import { CLI_NAME } from 'src/constants'
import { LocalContext } from 'src/context'
import invariant from 'tiny-invariant'
import postgres from 'postgres'
import {
  createDiscordMessage,
  processStravaWebhookEvent,
} from '@trackfootball/service'
import type { StravaWebhookEvent } from '@trackfootball/postgres'
import * as readline from 'readline/promises'

type Flags = {
  yes?: boolean
}

const help = `${CLI_NAME} webhook reprocess [ids...] | reprocess PENDING Strava webhook events`

async function cmd(
  this: LocalContext,
  { yes }: Flags,
  ...eventIdArgs: string[]
) {
  invariant(process.env.DATABASE_URL, 'DATABASE_URL must be set')
  const subscriptionId = Number(process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID)
  invariant(
    Number.isSafeInteger(subscriptionId) && subscriptionId > 0,
    'STRAVA_WEBHOOK_SUBSCRIPTION_ID must be a positive integer',
  )
  console.log('Connecting to database...')
  const sql = postgres(process.env.DATABASE_URL, {
    connect_timeout: 10,
    idle_timeout: 30,
  })
  const repository = createRepository(sql)

  let eventIds: number[] = []

  if (eventIdArgs.length === 0) {
    console.log('Querying for PENDING webhook events...')
    const pendingEvents = await sql<
      Array<{ id: number; body: string; status: string }>
    >`
      SELECT id, body, status 
      FROM "StravaWebhookEvent" 
      WHERE status = 'PENDING'
      AND "errors"[1] LIKE 'accepted:v1:%'
      ORDER BY id ASC
    `

    if (pendingEvents.length === 0) {
      console.log('No PENDING webhook events found.')
      await sql.end()
      return
    }

    console.log(`Found ${pendingEvents.length} PENDING webhook events:`)
    pendingEvents.forEach((event) => {
      const bodyPreview =
        event.body.substring(0, 100) + (event.body.length > 100 ? '...' : '')
      console.log(`  - ID: ${event.id}, Status: ${event.status}`)
      console.log(`    Body: ${bodyPreview}`)
    })

    if (!yes) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const answer = await rl.question(
        `\nDo you want to reprocess all ${pendingEvents.length} PENDING webhook events? (y/n): `,
      )
      rl.close()

      if (answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled.')
        await sql.end()
        return
      }
    }

    eventIds = pendingEvents.map((event) => event.id)
  } else {
    eventIds = eventIdArgs.map((id) => {
      const parsed = parseInt(id, 10)
      invariant(!isNaN(parsed), `Invalid event ID: ${id}`)
      return parsed
    })
  }

  console.log(`\nReprocessing ${eventIds.length} webhook events...`)

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < eventIds.length; i++) {
    const id = eventIds[i]
    invariant(id !== undefined, 'Event ID should be defined')
    console.log(`\n[${i + 1}/${eventIds.length}] Processing event ${id}...`)

    try {
      console.log(`  Fetching event ${id} from database...`)
      const rows = await sql<StravaWebhookEvent[]>`
        SELECT * FROM "StravaWebhookEvent" WHERE id = ${id}
      `

      if (!rows.length) {
        console.warn(`Event ${id} not found, skipping.`)
        errorCount++
        continue
      }

      const event = rows[0]
      invariant(event, 'Event should be defined')
      if (!event.errors?.[0]?.startsWith('accepted:v1:')) {
        console.warn(
          `Event ${id} predates authenticated webhook ingress and was not reprocessed.`,
        )
        errorCount++
        continue
      }

      console.log(`  Processing event ${id}...`)
      const result = await processStravaWebhookEvent(event, {
        repository,
        createDiscordMessage,
        env: {
          HOMEPAGE_URL: process.env.HOMEPAGE_URL,
          STRAVA_WEBHOOK_SUBSCRIPTION_ID: subscriptionId,
        },
      })

      if (result.status === 'COMPLETED' || result.status === 'IGNORED') {
        console.log(`✓ Event ${id} processed successfully (${result.status})`)
        successCount++
      } else {
        console.error(`✗ Event ${id} was not completed (${result.status})`)
        errorCount++
      }
    } catch (e) {
      console.error(`✗ Error processing event ${id}:`, e)
      errorCount++
    }
  }

  await sql.end({ timeout: 5 })

  console.log(
    `\n✓ Completed processing ${eventIds.length} event(s): ${successCount} succeeded, ${errorCount} failed.`,
  )
}

export const WebhookReprocessCommand = buildCommand({
  docs: {
    brief: help,
  },
  parameters: {
    flags: {
      yes: {
        brief: 'Skip confirmation prompt',
        kind: 'boolean',
        optional: true,
      },
    },
    positional: {
      kind: 'array',
      parameter: {
        brief: 'webhook event id(s) to reprocess',
        parse: String,
      },
    },
  },
  func: cmd,
})
