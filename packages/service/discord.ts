import { env } from '@trackfootball/rw-app/src/env'

interface CreateDiscordMessageArgs {
  heading?: string
  name: string
  description: string
}

export async function createDiscordMessage({
  heading,
  name,
  description,
}: CreateDiscordMessageArgs) {
  const content = `
      ## ${heading}
      
      Name: ${name}
      Time: ${new Date().toLocaleDateString()}
      Description: ${description}
          `

  const form = new FormData()
  form.append('content', content)

  try {
    await fetch(env.DISCORD_TRACKFOOTBALL_APPLICATION_EVENTS_WEBHOOK, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    console.error(e)
  }

  return true
}
