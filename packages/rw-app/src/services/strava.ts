import type { StravaOAuthConfig } from '@trackfootball/service'
import { env } from 'cloudflare:workers'
import invariant from 'tiny-invariant'

export function getStravaOAuthConfig(): StravaOAuthConfig {
  invariant(env.STRAVA_CLIENT_ID, 'STRAVA_CLIENT_ID is required')
  invariant(env.STRAVA_CLIENT_SECRET, 'STRAVA_CLIENT_SECRET is required')
  return {
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
  }
}
