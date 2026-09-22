import { defineApp } from 'rwsdk/worker'
import { route, render, layout } from 'rwsdk/router'
import { Document } from '@/app/Document'
import { setCommonHeaders } from '@/app/headers'
import { Home } from './app/pages/Home'
import { AppLayout } from '@/layouts/AppLayout'
import { Dashboard } from './app/pages/dashboard/Dashboard'
import { env } from 'cloudflare:workers'
import invariant from 'tiny-invariant'
import { Sql } from 'postgres'
import { createRepository, getSql } from '@trackfootball/postgres'
import { Athlete } from './app/pages/athlete/Athlete'
import { Activity } from './app/pages/activity/Activity'
import { createAuth } from './auth/auth'
import { StravaAuthCallback } from './app/pages/strava/StravaAuthCallback'
import { StravaWebhookCallback } from './app/pages/strava/StravaWebhookCallback'
import {
  isStravaWebhookPath,
  isValidStravaWebhookPath,
} from './app/pages/strava/StravaWebhookCallback'
import { Privacy } from './app/pages/compliance/Privacy'
import { Terms } from './app/pages/compliance/Terms'
import type { User } from '@trackfootball/postgres'
import {
  createDiscordMessage,
  processRetryableStravaWebhookEvents,
} from '@trackfootball/service'

export type AppContext = {
  user: User | null
  sql: Sql
  repository: ReturnType<typeof createRepository>
}

function needsAuth({ ctx }: { ctx: AppContext }) {
  if (!ctx.user) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/' },
    })
  }
}

type StravaWebhookBindings = {
  STRAVA_WEBHOOK_CALLBACK_SECRET: string
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: string
}

const app = defineApp([
  setCommonHeaders(),
  async ({ ctx, request }) => {
    const url = new URL(request.url)
    const webhookBindings = env as typeof env & StravaWebhookBindings
    const webhookRequest = isStravaWebhookPath(url.pathname)
    if (
      webhookRequest &&
      !isValidStravaWebhookPath(
        url.pathname,
        webhookBindings.STRAVA_WEBHOOK_CALLBACK_SECRET,
      )
    ) {
      return new Response('Not Found', { status: 404 })
    }

    invariant(env.DATABASE_URL, 'DATABASE_URL is required')
    const sql = getSql(env.DATABASE_URL)
    const repository = createRepository(sql)
    ctx.repository = repository

    ctx.user = null

    if (webhookRequest) {
      return
    }

    if (
      env.UNSAFE_AUTH_BYPASS_USER === '1' ||
      env.UNSAFE_AUTH_BYPASS_USER === 'true'
    ) {
      ctx.user = {
        id: 1,
        createdAt: new Date('2021-05-05T12:41:06.248Z'),
        updatedAt: new Date('2025-06-14T19:07:43.754Z'),
        email: 'john.doe@mail.com',
        firstName: 'John',
        lastName: 'Doe',
        locale: 'en',
        picture: 'https://i.pravatar.cc/150?u=jd@mail.com',
        auth0Sub: 'google-oauth2|104619003144932489723',
        emailVerified: true,
        type: 'ADMIN',
      } as User
      return
    }

    const auth = createAuth()
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (session?.user) {
      let domainUser = await repository.getUserByEmail(session.user.email)

      if (!domainUser) {
        domainUser = await repository.createUserFromAuthSession({
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
        })
      }

      ctx.user = domainUser
    }

    if (
      !ctx.user &&
      url.pathname.startsWith('/api') &&
      !url.pathname.startsWith('/api/auth')
    ) {
      console.log('Unauthorized API request to:', url.pathname)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate':
            'Bearer error="invalid_token", error_description="expired or invalid session"',
        },
      })
    }
  },
  route('/api/auth/*', ({ request }) => {
    const auth = createAuth()
    return auth.handler(request)
  }),
  render(Document, [
    layout(AppLayout, [
      route('/', ({ ctx }) => {
        if (ctx.user) {
          return new Response(null, {
            status: 302,
            headers: { Location: '/dashboard' },
          })
        }
        return new Response(null, {
          status: 302,
          headers: { Location: '/home' },
        })
      }),
      route('/home', Home),
      route('/dashboard', [needsAuth, Dashboard]),
      route('/athlete/:id', [Athlete]),
      route('/activity/:id', [Activity]),
      route('/api/social/strava/callback', [StravaAuthCallback]),
      route('/api/social/strava/webhook/callback/:secret', [
        StravaWebhookCallback,
      ]),
      route('/privacy', [Privacy]),
      route('/terms', [Terms]),
    ]),
  ]),
])

async function processWebhookRetries() {
  const bindings = env as typeof env & StravaWebhookBindings
  const subscriptionId = Number(bindings.STRAVA_WEBHOOK_SUBSCRIPTION_ID)
  invariant(Number.isSafeInteger(subscriptionId) && subscriptionId > 0)
  const sql = getSql(env.DATABASE_URL)
  try {
    await processRetryableStravaWebhookEvents({
      repository: createRepository(sql),
      createDiscordMessage,
      env: {
        HOMEPAGE_URL: env.HOMEPAGE_URL,
        STRAVA_WEBHOOK_SUBSCRIPTION_ID: subscriptionId,
      },
    })
  } finally {
    await sql.end()
  }
}

export default {
  fetch: app.fetch,
  scheduled: processWebhookRetries,
}
