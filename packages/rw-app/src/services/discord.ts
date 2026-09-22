import {
  createDiscordMessage as sendDiscordMessage,
  type DiscordMessage,
} from '@trackfootball/service'
import { env } from 'cloudflare:workers'

export async function createDiscordMessage(message: DiscordMessage) {
  const webhookUrl = env.DISCORD_TRACKFOOTBALL_APPLICATION_EVENTS_WEBHOOK
  if (!webhookUrl) {
    console.error(
      'DISCORD_TRACKFOOTBALL_APPLICATION_EVENTS_WEBHOOK is not configured; skipping Discord notification',
    )
    return false
  }
  return sendDiscordMessage({ webhookUrl, ...message })
}
