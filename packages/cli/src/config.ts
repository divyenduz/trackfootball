import {
  createDiscordMessage as sendDiscordMessage,
  type DiscordMessage,
  type StravaOAuthConfig,
} from '@trackfootball/service'
import invariant from 'tiny-invariant'

export function getStravaOAuthConfig(): StravaOAuthConfig {
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  invariant(clientId, 'STRAVA_CLIENT_ID must be set')
  invariant(clientSecret, 'STRAVA_CLIENT_SECRET must be set')
  return { clientId, clientSecret }
}

export async function createDiscordMessage(message: DiscordMessage) {
  const webhookUrl =
    process.env.DISCORD_TRACKFOOTBALL_APPLICATION_EVENTS_WEBHOOK
  if (!webhookUrl) {
    console.error(
      'DISCORD_TRACKFOOTBALL_APPLICATION_EVENTS_WEBHOOK must be set; skipping Discord notification',
    )
    return false
  }
  return sendDiscordMessage({ webhookUrl, ...message })
}
