import { HttpError } from '@trackfootball/open-api'
import type {
  StravaWebhookEvent,
  createRepository,
} from '@trackfootball/postgres'
import { match } from 'ts-pattern'
import { ZodError } from 'zod'

import { createDiscordMessage as defaultCreateDiscordMessage } from './discord'
import {
  fetchStravaActivity as defaultFetchStravaActivity,
  IgnorableActivityError,
  importStravaActivity as defaultImportStravaActivity,
} from './strava'
import { stravaEventSchema } from './stravaSchemas'

const MAX_ATTEMPTS = 5

class TerminalWebhookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TerminalWebhookError'
  }
}

export type WebhookProcessorDeps = {
  repository: ReturnType<typeof createRepository>
  createDiscordMessage?: typeof defaultCreateDiscordMessage
  fetchStravaActivity?: typeof defaultFetchStravaActivity
  importStravaActivity?: typeof defaultImportStravaActivity
  env: {
    HOMEPAGE_URL?: string
    STRAVA_WEBHOOK_SUBSCRIPTION_ID: number
  }
}

export type WebhookProcessingResult =
  | { status: 'COMPLETED' | 'IGNORED'; eventId: number }
  | { status: 'RETRYING' | 'ERRORED'; eventId: number; error: string }
  | { status: 'SKIPPED'; eventId: number }

function errorDescription(error: unknown) {
  if (error instanceof HttpError) {
    return `http-${error.status}`
  }
  if (error instanceof ZodError) {
    return 'invalid-payload'
  }
  if (error instanceof Error) {
    return `${error.name}:${error.message}`.slice(0, 240)
  }
  return 'unknown-error'
}

function claimCount(event: StravaWebhookEvent) {
  return (event.errors ?? []).filter((entry) => entry.startsWith('claim:v1:'))
    .length
}

export async function processStravaWebhookEvent(
  event: StravaWebhookEvent,
  deps: WebhookProcessorDeps,
): Promise<WebhookProcessingResult> {
  const { repository, env } = deps
  const importStravaActivity =
    deps.importStravaActivity ?? defaultImportStravaActivity
  const fetchStravaActivity =
    deps.fetchStravaActivity ?? defaultFetchStravaActivity
  const createDiscordMessage =
    deps.createDiscordMessage ?? defaultCreateDiscordMessage
  const attempt = claimCount(event) + 1
  const claim = `claim:v1:${crypto.randomUUID()}:${attempt}`
  const claimedEvent = await repository.claimStravaWebhookEvent(event.id, claim)

  if (!claimedEvent) {
    return { status: 'SKIPPED', eventId: event.id }
  }

  try {
    let body
    try {
      body = stravaEventSchema.parse(JSON.parse(claimedEvent.body))
    } catch {
      throw new TerminalWebhookError('Invalid webhook payload')
    }
    if (body.subscription_id !== env.STRAVA_WEBHOOK_SUBSCRIPTION_ID) {
      throw new TerminalWebhookError('Unexpected Strava subscription')
    }

    await match(body)
      .with(
        { object_type: 'activity', aspect_type: 'create' },
        async ({ owner_id: ownerId, object_id: activityId }) => {
          await importStravaActivity(repository, ownerId, activityId, 'WEBHOOK')
        },
      )
      .with(
        { object_type: 'activity', aspect_type: 'update' },
        async (activityUpdateEvent) => {
          const user = await repository.getUserBy(
            String(activityUpdateEvent.owner_id),
          )
          if (!user) {
            await createDiscordMessage({
              heading:
                'Activity Update Failed - No Social Login For User (Webhook)',
              name: `${activityUpdateEvent.owner_id}/${activityUpdateEvent.object_id}`,
              description: `Strava owner ${activityUpdateEvent.owner_id} is not connected`,
            })
            throw new Error('Strava owner is not connected')
          }

          const ownedPost = await repository.getPostByStravaIdForUser(
            activityUpdateEvent.object_id,
            user.id,
          )
          if (!ownedPost) {
            const postForAnotherUser = await repository.getPostByStravaId(
              activityUpdateEvent.object_id,
            )
            if (postForAnotherUser) {
              throw new TerminalWebhookError('Activity ownership mismatch')
            }
            await importStravaActivity(
              repository,
              activityUpdateEvent.owner_id,
              activityUpdateEvent.object_id,
              'WEBHOOK',
            )
            return
          }

          if (ownedPost.status !== 'COMPLETED' || !ownedPost.geoJson) {
            await importStravaActivity(
              repository,
              activityUpdateEvent.owner_id,
              activityUpdateEvent.object_id,
              'WEBHOOK',
            )
          }

          if (activityUpdateEvent.updates.title) {
            const currentActivity = await fetchStravaActivity(
              repository,
              activityUpdateEvent.object_id,
              user.id,
            )
            if (!currentActivity.name) {
              throw new Error('Strava activity has no title')
            }
            const updated = await repository.updatePostTitleForUser(
              activityUpdateEvent.object_id,
              user.id,
              currentActivity.name,
            )
            if (!updated) {
              throw new Error('Owned activity title update failed')
            }
          }
        },
      )
      .with(
        { object_type: 'activity', aspect_type: 'delete' },
        async (activityDeleteEvent) => {
          const user = await repository.getUserBy(
            String(activityDeleteEvent.owner_id),
          )
          if (!user) {
            throw new Error('Strava owner is not connected')
          }

          const post = await repository.deletePostByStravaIdForUser(
            activityDeleteEvent.object_id,
            user.id,
          )
          if (!post) {
            const postForAnotherUser = await repository.getPostByStravaId(
              activityDeleteEvent.object_id,
            )
            if (postForAnotherUser) {
              throw new TerminalWebhookError('Activity ownership mismatch')
            }
            return
          }

          await createDiscordMessage({
            heading: 'Activity Deleted (Webhook)',
            name: post.text,
            description: `ID: ${post.id} / Strava ID: ${activityDeleteEvent.object_id}\nLink: ${env.HOMEPAGE_URL}/activity/${post.id}`,
          })
        },
      )
      .with(
        { object_type: 'athlete', aspect_type: 'update' },
        async (athleteUpdateEvent) => {
          await repository.deleteStravaSocialLogin(athleteUpdateEvent.owner_id)
          await createDiscordMessage({
            heading: 'Athlete Social Login Deleted (Webhook)',
            name: String(athleteUpdateEvent.owner_id),
            description: '',
          })
        },
      )
      .exhaustive()

    const completed = await repository.completeClaimedStravaWebhookEvent(
      event.id,
      claim,
    )
    return { status: completed ? 'COMPLETED' : 'SKIPPED', eventId: event.id }
  } catch (error) {
    if (error instanceof IgnorableActivityError) {
      await repository.completeClaimedStravaWebhookEvent(event.id, claim)
      return { status: 'IGNORED', eventId: event.id }
    }

    const description = errorDescription(error)
    const terminal =
      error instanceof TerminalWebhookError || attempt >= MAX_ATTEMPTS
    await repository.failClaimedStravaWebhookEvent(
      event.id,
      claim,
      `failure:v1:${description}`,
      terminal,
    )
    console.error(
      `Webhook processing failed for event ${event.id}: ${description}`,
    )
    return {
      status: terminal ? 'ERRORED' : 'RETRYING',
      eventId: event.id,
      error: description,
    }
  }
}

export async function reprocessStravaWebhookEvent(
  event: StravaWebhookEvent,
  deps: WebhookProcessorDeps,
): Promise<WebhookProcessingResult> {
  if (event.status === 'PENDING') {
    return processStravaWebhookEvent(event, deps)
  }
  if (event.status !== 'ERRORED') {
    return { status: 'SKIPPED', eventId: event.id }
  }

  const requeued = await deps.repository.requeueStravaWebhookEvent(event.id)
  if (!requeued) {
    return { status: 'SKIPPED', eventId: event.id }
  }
  return processStravaWebhookEvent(requeued, deps)
}

export async function processRetryableStravaWebhookEvents(
  deps: WebhookProcessorDeps,
  limit = 10,
) {
  const events = await deps.repository.getRetryableStravaWebhookEvents(limit)
  return Promise.all(
    events.map((event) => processStravaWebhookEvent(event, deps)),
  )
}
