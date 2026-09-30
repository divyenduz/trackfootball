import type { createRepository } from '@trackfootball/postgres'
import {
  ActivityFileError,
  MAX_ACTIVITY_BYTES,
  parseActivityFile,
} from './activityFile'

export async function uploadActivity(
  request: Request,
  deps: {
    userId: number | null
    origin: string
    repository: Pick<ReturnType<typeof createRepository>, 'createUploadedPost'>
    allowUpload: (userId: number) => Promise<boolean>
  },
) {
  const error = (message: string, status: number) =>
    Response.json({ error: message }, { status })
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  if (!deps.userId) return error('Sign in to upload an activity.', 401)
  if (request.headers.get('origin') !== new URL(deps.origin).origin)
    return error('Upload from the TrackFootball website.', 403)
  const url = new URL(request.url)
  const filename = url.searchParams.get('filename') ?? ''
  const text = url.searchParams.get('title')?.trim() || 'Football activity'
  if (text.length > 200)
    return error('Use a title of at most 200 characters.', 400)
  if (!/\.(fit|gpx)$/i.test(filename))
    return error('Choose a .fit or .gpx file.', 400)
  if (Number(request.headers.get('content-length')) > MAX_ACTIVITY_BYTES)
    return error('The file exceeds 5 MiB.', 413)
  if (!(await deps.allowUpload(deps.userId)))
    return error('Too many uploads. Please wait a minute and try again.', 429)
  if (!request.body) return error('Choose a non-empty file.', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_ACTIVITY_BYTES) {
        await reader.cancel()
        return error('The file exceeds 5 MiB.', 413)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const activity = parseActivityFile(bytes, filename)
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const digest = Array.from(hash, (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('')
    const result = await deps.repository.createUploadedPost({
      ...activity,
      userId: deps.userId,
      digest,
      text,
    })
    return Response.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (cause) {
    if (cause instanceof ActivityFileError) return error(cause.message, 400)
    // Do not log request content, GPS samples, or credentials.
    console.error(
      'Activity upload failed',
      cause instanceof Error ? cause.name : 'UnknownError',
    )
    return error('We could not save your activity. Please try again.', 500)
  } finally {
    reader.releaseLock()
  }
}
