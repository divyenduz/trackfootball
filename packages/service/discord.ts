export interface DiscordMessage {
  heading?: string
  name: string
  description: string
}

export type DiscordMessageSender = (message: DiscordMessage) => Promise<unknown>

interface CreateDiscordMessageArgs extends DiscordMessage {
  webhookUrl: string
}

export async function createDiscordMessage({
  webhookUrl,
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
    await fetch(webhookUrl, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    console.error(e)
  }

  return true
}
