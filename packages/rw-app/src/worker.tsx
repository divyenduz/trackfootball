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
import { Privacy } from './app/pages/compliance/Privacy'
import { Terms } from './app/pages/compliance/Terms'
import type { User } from '@trackfootball/postgres'
import { uploadActivity } from '@trackfootball/service'
import { Upload } from './app/pages/upload/Upload'

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

const app = defineApp([
  setCommonHeaders(),
  async ({ ctx, request }) => {
    const url = new URL(request.url)
    invariant(env.DATABASE_URL, 'DATABASE_URL is required')
    const sql = getSql(env.DATABASE_URL)
    const repository = createRepository(sql)
    ctx.repository = repository

    ctx.user = null

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
  route('/api/activities/upload', ({ request, ctx }) =>
    uploadActivity(request, {
      userId: ctx.user?.id ?? null,
      origin: env.HOMEPAGE_URL,
      repository: ctx.repository,
      allowUpload: async (userId) =>
        (await env.UPLOAD_RATE_LIMITER.limit({ key: String(userId) })).success,
    }),
  ),
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
      route('/upload', [needsAuth, Upload]),
      route('/athlete/:id', [Athlete]),
      route('/activity/:id', [Activity]),
      route('/privacy', [Privacy]),
      route('/terms', [Terms]),
    ]),
  ]),
])

export default {
  fetch: app.fetch,
}
