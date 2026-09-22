import {
  createDiscordMessage,
  processStravaWebhookEvent,
  stravaEventSchema,
} from '@trackfootball/service'
import { DefaultAppContext } from 'rwsdk/worker'
import invariant from 'tiny-invariant'
import { env } from 'cloudflare:workers'

const WEBHOOK_PATH_PREFIX = '/api/social/strava/webhook/callback/'

type StravaWebhookBindings = {
  STRAVA_WEBHOOK_CALLBACK_SECRET: string
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: string
}

function getWebhookSecret() {
  const bindings = env as typeof env & StravaWebhookBindings
  invariant(
    bindings.STRAVA_WEBHOOK_CALLBACK_SECRET,
    'STRAVA_WEBHOOK_CALLBACK_SECRET is required',
  )
  return bindings.STRAVA_WEBHOOK_CALLBACK_SECRET
}

function getSubscriptionId() {
  const bindings = env as typeof env & StravaWebhookBindings
  const subscriptionId = Number(bindings.STRAVA_WEBHOOK_SUBSCRIPTION_ID)
  invariant(
    Number.isSafeInteger(subscriptionId) && subscriptionId > 0,
    'STRAVA_WEBHOOK_SUBSCRIPTION_ID must be a positive integer',
  )
  return subscriptionId
}

export function isValidStravaWebhookPath(pathname: string, secret: string) {
  return pathname === `${WEBHOOK_PATH_PREFIX}${secret}`
}

export function isStravaWebhookPath(pathname: string) {
  return pathname.startsWith(WEBHOOK_PATH_PREFIX)
}

export async function StravaWebhookCallback({
  request,
  ctx,
  cf,
}: {
  request: Request
  ctx: DefaultAppContext
  cf: ExecutionContext
}) {
  const callbackSecret = getWebhookSecret()
  if (
    !isValidStravaWebhookPath(new URL(request.url).pathname, callbackSecret)
  ) {
    return new Response('Not Found', { status: 404 })
  }

  if (request.method === 'GET') {
    const { searchParams } = new URL(request.url)
    const hubChallenge = searchParams.get('hub.challenge')
    const hubVerifyToken = searchParams.get('hub.verify_token')
    const hubMode = searchParams.get('hub.mode')

    const expectedVerifyToken = env.STRAVA_WEBHOOK_VERIFY_TOKEN
    invariant(expectedVerifyToken, 'STRAVA_WEBHOOK_VERIFY_TOKEN is required')

    if (
      hubMode === 'subscribe' &&
      hubVerifyToken === expectedVerifyToken &&
      hubChallenge
    ) {
      console.info('Strava webhook subscription verified')
      return Response.json({ 'hub.challenge': hubChallenge })
    }

    return Response.json(
      { error: 'Invalid verification request' },
      { status: 403 },
    )
  }
  if (request.method === 'POST') {
    const subscriptionId = getSubscriptionId()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsedBody = stravaEventSchema.safeParse(body)
    if (!parsedBody.success) {
      return Response.json(
        { error: 'Invalid webhook payload' },
        { status: 400 },
      )
    }
    if (parsedBody.data.subscription_id !== subscriptionId) {
      return Response.json(
        { error: 'Unexpected subscription' },
        { status: 403 },
      )
    }

    const stravaWebhookEvent = await ctx.repository.createStravaWebhookEvent({
      status: 'PENDING',
      body: JSON.stringify(parsedBody.data),
      errors: [`accepted:v1:${subscriptionId}`],
    })

    cf.waitUntil(
      processStravaWebhookEvent(stravaWebhookEvent, {
        repository: ctx.repository,
        createDiscordMessage,
        env: {
          HOMEPAGE_URL: env.HOMEPAGE_URL,
          STRAVA_WEBHOOK_SUBSCRIPTION_ID: subscriptionId,
        },
      }).catch((e) => {
        console.error(`Error while processing event`, e)
      }),
    )

    return Response.json({ ok: true })
  }
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'GET, POST' },
  })
}
