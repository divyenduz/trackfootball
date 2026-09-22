import { buildCommand } from '@stricli/core'
import { createRepository } from '@trackfootball/postgres'
import { CLI_NAME } from 'src/constants'

import { LocalContext } from 'src/context'
import invariant from 'tiny-invariant'
import postgres from 'postgres'
import { fetchCompletePost, fetchStravaActivity } from '@trackfootball/service'
import * as readline from 'readline/promises'

type Flags = {}

const help = `${CLI_NAME} activity refresh [ids...] | refresh one or more activities, or all uncompleted posts if no ids provided`

async function cmd(this: LocalContext, {}: Flags, ...activityIdArgs: string[]) {
  invariant(process.env.DATABASE_URL, 'DATABASE_URL must be set')
  const sql = postgres(process.env.DATABASE_URL)
  const repository = await createRepository(sql)

  let activityIds: number[] = []

  if (activityIdArgs.length === 0) {
    // No arguments provided, fetch all uncompleted posts
    const uncompletedPosts = await sql`
      SELECT id, "text", status 
      FROM "Post" 
      WHERE status <> 'COMPLETED'
      ORDER BY id DESC
    `

    if (uncompletedPosts.length === 0) {
      console.log('No uncompleted posts found.')
      sql.end()
      return
    }

    console.log(`Found ${uncompletedPosts.length} uncompleted posts:`)
    uncompletedPosts.forEach((post) => {
      console.log(
        `  - ID: ${post.id}, Status: ${post.status}, Text: ${post.text?.substring(0, 50)}${post.text?.length > 50 ? '...' : ''}`,
      )
    })

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const answer = await rl.question(
      `\nDo you want to refresh all ${uncompletedPosts.length} uncompleted posts? (y/n): `,
    )
    rl.close()

    if (answer.toLowerCase() !== 'y') {
      console.log('Operation cancelled.')
      sql.end()
      return
    }

    activityIds = uncompletedPosts.map((post) => post.id as number)
  } else {
    // Arguments provided, parse them
    activityIds = activityIdArgs.map((id) => {
      const parsed = parseInt(id)
      invariant(!isNaN(parsed), `Invalid activity ID: ${id}`)
      return parsed
    })
  }

  console.log(`\nRefreshing ${activityIds.length} activities...`)

  for (let i = 0; i < activityIds.length; i++) {
    const activityId = activityIds[i]
    invariant(activityId !== undefined, 'Activity ID should be defined')
    console.log(
      `\n[${i + 1}/${activityIds.length}] Processing activity ${activityId}...`,
    )
    try {
      const activity = await repository.getPostById(activityId)
      invariant(activity, `Activity with id ${activityId} not found`)

      console.log(activity)
      const user = await repository.getUser(activity.userId)
      invariant(user, `User not found for activity with id ${activityId}`)

      const stravaActivity = await fetchStravaActivity(
        repository,
        parseInt(activity.key),
        user.id,
      )
      invariant(
        stravaActivity,
        `Strava activity not found for activity with id ${activityId}`,
      )
      console.log(stravaActivity)

      const activityType = stravaActivity.type
      invariant(
        activityType,
        `Activity with id ${activityId} has no type, found ${stravaActivity.type}`,
      )

      const isGeoDataAvailable = Boolean(stravaActivity.map?.polyline)
      invariant(isGeoDataAvailable, `activity must have geo data`)

      if (!['Run', 'Soccer'].includes(activityType)) {
        invariant(
          false,
          `Activity type ${activityType} not supported for activity with id ${activityId}`,
        )
      }

      const activityName = stravaActivity.name
      invariant(activityName, 'activity must have a name')

      await fetchCompletePost(repository, {
        postId: activity.id,
      })
      const updatedPost = await repository.getPostWithUserAndFields(activity.id)
      invariant(
        updatedPost,
        `Updated post not found for activity with id ${activityId}`,
      )

      console.log(
        `Activity with id ${updatedPost.id} has been refreshed successfully`,
      )
    } catch (e) {
      console.error(`Error refreshing activity ${activityId}:`, e)
    }
  }

  sql.end()
  console.log(
    `\n✓ Completed processing ${activityIds.length} ${activityIds.length === 1 ? 'activity' : 'activities'}.`,
  )
}

export const ActivityRefreshCommand = buildCommand({
  docs: {
    brief: help,
  },
  parameters: {
    flags: {},
    positional: {
      kind: 'array',
      parameter: {
        brief: 'activity id(s) to refresh',
        parse: String,
      },
    },
  },
  func: cmd,
})
