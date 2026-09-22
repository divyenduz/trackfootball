import { HttpError } from '@trackfootball/open-api'
import type {
  StravaWebhookEvent,
  createRepository,
} from '@trackfootball/postgres'
import { describe, expect, it, vi } from 'vitest'

import { IgnorableActivityError } from './strava'
import {
  processStravaWebhookEvent,
  reprocessStravaWebhookEvent,
} from './webhookProcessor'

const body = {
  object_id: 101,
  owner_id: 202,
  subscription_id: 303,
  event_time: 1_700_000_000,
  object_type: 'activity',
  aspect_type: 'create',
  updates: {},
}

function event(
  overrides: Partial<StravaWebhookEvent> = {},
): StravaWebhookEvent {
  return {
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'PENDING',
    body: JSON.stringify(body),
    errors: ['accepted:v1:303'],
    ...overrides,
  }
}

function repositoryFor(sourceEvent: StravaWebhookEvent) {
  const repository = {
    claimStravaWebhookEvent: vi.fn(
      async (_id: number, claim: string): Promise<StravaWebhookEvent> => ({
        ...sourceEvent,
        errors: [...(sourceEvent.errors ?? []), claim],
      }),
    ),
    completeClaimedStravaWebhookEvent: vi.fn().mockResolvedValue(true),
    failClaimedStravaWebhookEvent: vi.fn().mockResolvedValue(true),
  }
  return repository as unknown as ReturnType<typeof createRepository>
}

const env = {
  HOMEPAGE_URL: 'https://example.com',
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: 303,
}

describe('Strava webhook processing', () => {
  it('keeps transport failures retryable', async () => {
    const sourceEvent = event()
    const repository = repositoryFor(sourceEvent)
    const importStravaActivity = vi
      .fn()
      .mockRejectedValue(new HttpError(429, 'Too Many Requests', {}, '30'))

    const result = await processStravaWebhookEvent(sourceEvent, {
      repository,
      env,
      importStravaActivity,
    })

    expect(result).toMatchObject({ status: 'RETRYING', error: 'http-429' })
    expect(repository.completeClaimedStravaWebhookEvent).not.toHaveBeenCalled()
    expect(repository.failClaimedStravaWebhookEvent).toHaveBeenCalledWith(
      sourceEvent.id,
      expect.stringMatching(/^claim:v1:/),
      'failure:v1:http-429',
      false,
    )
  })

  it('completes a validated but unsupported activity as ignored', async () => {
    const sourceEvent = event()
    const repository = repositoryFor(sourceEvent)

    const result = await processStravaWebhookEvent(sourceEvent, {
      repository,
      env,
      importStravaActivity: vi
        .fn()
        .mockRejectedValue(new IgnorableActivityError('unsupported type')),
    })

    expect(result.status).toBe('IGNORED')
    expect(repository.completeClaimedStravaWebhookEvent).toHaveBeenCalledOnce()
    expect(repository.failClaimedStravaWebhookEvent).not.toHaveBeenCalled()
  })

  it('terminally rejects malformed persisted payloads', async () => {
    const sourceEvent = event({
      body: JSON.stringify({ object_type: 'activity' }),
    })
    const repository = repositoryFor(sourceEvent)

    const result = await processStravaWebhookEvent(sourceEvent, {
      repository,
      env,
      importStravaActivity: vi.fn(),
    })

    expect(result).toMatchObject({
      status: 'ERRORED',
      error: 'TerminalWebhookError:Invalid webhook payload',
    })
    expect(repository.failClaimedStravaWebhookEvent).toHaveBeenCalledWith(
      sourceEvent.id,
      expect.stringMatching(/^claim:v1:/),
      'failure:v1:TerminalWebhookError:Invalid webhook payload',
      true,
    )
  })

  it('resumes an incomplete post and uses the current Strava title', async () => {
    const sourceEvent = event({
      body: JSON.stringify({
        ...body,
        aspect_type: 'update',
        updates: { title: 'Stale webhook title' },
      }),
    })
    const repository = repositoryFor(sourceEvent)
    const user = { id: 12 }
    const incompletePost = {
      id: 34,
      userId: user.id,
      status: 'PROCESSING',
      geoJson: null,
    }
    Object.assign(repository, {
      getUserBy: vi.fn().mockResolvedValue(user),
      getPostByStravaIdForUser: vi.fn().mockResolvedValue(incompletePost),
      updatePostTitleForUser: vi.fn().mockResolvedValue({
        ...incompletePost,
        text: 'Latest title',
      }),
    })
    const importStravaActivity = vi.fn().mockResolvedValue(undefined)
    const fetchStravaActivity = vi.fn().mockResolvedValue({
      name: 'Current Strava title',
    })

    const result = await processStravaWebhookEvent(sourceEvent, {
      repository,
      env,
      fetchStravaActivity,
      importStravaActivity,
    })

    expect(importStravaActivity).toHaveBeenCalledWith(
      repository,
      body.owner_id,
      body.object_id,
      'WEBHOOK',
    )
    expect(fetchStravaActivity).toHaveBeenCalledWith(
      repository,
      body.object_id,
      user.id,
    )
    expect(repository.updatePostTitleForUser).toHaveBeenCalledWith(
      body.object_id,
      user.id,
      'Current Strava title',
    )
    expect(result.status).toBe('COMPLETED')
  })

  it('requeues an authenticated errored event for an operator retry', async () => {
    const erroredEvent = event({ status: 'ERRORED' })
    const requeuedEvent = event({
      status: 'PENDING',
      errors: [...(erroredEvent.errors ?? []), 'requeue:v1:operator'],
    })
    const repository = repositoryFor(requeuedEvent)
    Object.assign(repository, {
      requeueStravaWebhookEvent: vi.fn().mockResolvedValue(requeuedEvent),
    })
    const importStravaActivity = vi.fn().mockResolvedValue(undefined)

    const result = await reprocessStravaWebhookEvent(erroredEvent, {
      repository,
      env,
      importStravaActivity,
    })

    expect(repository.requeueStravaWebhookEvent).toHaveBeenCalledWith(
      erroredEvent.id,
    )
    expect(importStravaActivity).toHaveBeenCalledOnce()
    expect(result.status).toBe('COMPLETED')
  })
})
