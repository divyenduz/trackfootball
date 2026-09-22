import { buildCommand } from '@stricli/core'
import { createRepository } from '@trackfootball/postgres'
import { CLI_NAME } from 'src/constants'
import { LocalContext } from 'src/context'
import invariant from 'tiny-invariant'
import postgres from 'postgres'
import { fetchStravaActivity } from '@trackfootball/service'
import { getStravaOAuthConfig } from 'src/config'
import * as readline from 'readline/promises'

type Flags = {}

const help = `${CLI_NAME} activity delete [id] | delete one activity by id, or delete all non-Run/Soccer uncompleted posts if no id provided`

async function cmd(this: LocalContext, {}: Flags, idArg?: string) {
  invariant(process.env.DATABASE_URL, 'DATABASE_URL must be set')
  const sql = postgres(process.env.DATABASE_URL)
  const repository = await createRepository(sql)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const deleteOne = async (postId: number) => {
    const post = await repository.getPostById(postId)
    invariant(post, `Activity with id ${postId} not found`)
    console.log(`Deleting Post ${postId}...`)

    const activityId = Number.parseInt(post.key)
    const webhook = Number.isFinite(activityId)
      ? await repository.findStravaWebhookEventByActivityId(activityId)
      : undefined

    await repository.deletePostBy(activityId)
    console.log(`✓ Deleted Post ${postId}`)

    if (webhook) {
      await repository.deleteStravaWebhookEvent(webhook.id)
      console.log(
        `✓ Deleted StravaWebhookEvent ${webhook.id} for activity ${activityId}`,
      )
    }
  }

  try {
    if (idArg) {
      const postId = Number.parseInt(idArg)
      invariant(!Number.isNaN(postId), `Invalid activity ID: ${idArg}`)

      const answer = await rl.question(
        `Are you sure you want to permanently delete activity ${postId}? (y/n): `,
      )
      if (answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled.')
        return
      }

      await deleteOne(postId)
      console.log('\n✓ Completed delete.')
      return
    }

    const uncompletedPosts = await sql`
      SELECT id, "text", status, "key"
      FROM "Post"
      WHERE status <> 'COMPLETED'
      ORDER BY id DESC
    `

    if (uncompletedPosts.length === 0) {
      console.log('No uncompleted posts found.')
      return
    }

    console.log(`Found ${uncompletedPosts.length} uncompleted posts:`)
    uncompletedPosts.forEach((post) => {
      const text = post.text ?? ''
      console.log(
        `  - ID: ${post.id}, Status: ${post.status}, Text: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
      )
    })

    const answer = await rl.question(
      `\nProceed to scan and delete non-Run/Soccer activities among these ${uncompletedPosts.length} posts? (y/n): `,
    )
    if (answer.toLowerCase() !== 'y') {
      console.log('Operation cancelled.')
      return
    }

    let processed = 0,
      deleted = 0,
      kept = 0,
      failed = 0

    for (const row of uncompletedPosts) {
      const postId = row.id as number
      processed++
      console.log(
        `\n[${processed}/${uncompletedPosts.length}] Evaluating post ${postId}...`,
      )

      try {
        const post = await repository.getPostById(postId)
        if (!post) {
          console.warn(`Post ${postId} not found, skipping.`)
          kept++
          continue
        }

        const user = await repository.getUser(post.userId)
        invariant(user, `User not found for post ${postId}`)

        const activityId = Number.parseInt(post.key)
        if (!Number.isFinite(activityId)) {
          console.warn(
            `Invalid Strava activity id for post ${postId}, skipping.`,
          )
          kept++
          continue
        }

        const stravaActivity = await fetchStravaActivity(
          repository,
          activityId,
          user.id,
          getStravaOAuthConfig(),
        )
        const kind = stravaActivity?.type
        if (!kind) {
          console.warn(
            `No Strava type for post ${postId} (activity ${activityId}), skipping.`,
          )
          kept++
          continue
        }

        if (kind === 'Run' || kind === 'Soccer') {
          console.log(`Keeping post ${postId}: type=${kind}`)
          kept++
          continue
        }

        console.log(`Deleting post ${postId}: type=${kind}`)
        await deleteOne(postId)
        deleted++
      } catch (e) {
        console.error(`Error while evaluating/deleting post ${postId}:`, e)
        failed++
      }
    }

    console.log(
      `\n✓ Completed. Processed=${processed}, Deleted=${deleted}, Kept=${kept}, Failed=${failed}.`,
    )
  } finally {
    rl.close()
    sql.end()
  }
}

export const ActivityDeleteCommand = buildCommand({
  docs: {
    brief: help,
  },
  parameters: {
    flags: {},
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'activity id to delete',
          parse: String,
          optional: true,
        },
      ],
    },
  },
  func: cmd,
})
