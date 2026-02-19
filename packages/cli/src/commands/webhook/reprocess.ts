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
      const rows = await sql<
        Array<{
          id: number
          body: string
          status: string
          errors: unknown[]
        }>
      >`SELECT id, body, status, errors FROM "StravaWebhookEvent" WHERE id = ${id}`

      if (!rows.length) {
        console.warn(`Event ${id} not found, skipping.`)
        errorCount++
        continue
      }

      const event = rows[0]
      invariant(event, 'Event should be defined')

      console.log(`  Processing event ${id}...`)
      //@ts-ignore FIXME
      await processStravaWebhookEvent(event, {
        repository,
        createDiscordMessage,
        env: {
          HOMEPAGE_URL: process.env.HOMEPAGE_URL,
        },
      })

      console.log(`✓ Event ${id} processed successfully`)
      successCount++
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
