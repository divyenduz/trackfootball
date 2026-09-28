import { describe, expect, it, vi } from 'vitest'
import { uploadActivity } from './uploadActivity'
import { MAX_ACTIVITY_BYTES } from './activityFile'

const data =
  '<gpx><trk><trkseg><trkpt lat="52" lon="13"><time>2026-09-28T10:00:00Z</time></trkpt><trkpt lat="52.001" lon="13"><time>2026-09-28T10:00:20Z</time></trkpt></trkseg></trk></gpx>'
const origin = 'https://trackfootball.test'
const request = (body = data, headers: Record<string, string> = {}) =>
  new Request(
    `${origin}/api/activities/upload?filename=match.gpx&userId=999&title=Evening%20match`,
    {
      method: 'POST',
      body,
      headers: { origin, 'x-publish-activity': 'public', ...headers },
    },
  )
const dependencies = () => ({
  userId: 7 as number | null,
  origin,
  allowUpload: vi.fn(async () => true),
  repository: {
    createUploadedPost: vi.fn(async () => ({ id: 42, duplicate: false })),
  },
})

describe('activity upload boundary', () => {
  it('uses authenticated ownership and returns created and duplicate results', async () => {
    const deps = dependencies()
    const response = await uploadActivity(request(), deps)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 42, duplicate: false })
    expect(deps.repository.createUploadedPost).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        text: 'Evening match',
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        elapsedTime: 20,
      }),
    )
    deps.repository.createUploadedPost.mockResolvedValue({
      id: 42,
      duplicate: true,
    })
    const repeated = await uploadActivity(request(), deps)
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toEqual({ id: 42, duplicate: true })
  })

  it('rejects anonymous, cross-origin, missing-consent and rate-limited requests before persistence', async () => {
    const deps = dependencies()
    expect(
      (await uploadActivity(request(), { ...deps, userId: null })).status,
    ).toBe(401)
    expect(
      (
        await uploadActivity(
          request(data, { origin: 'https://evil.test' }),
          deps,
        )
      ).status,
    ).toBe(403)
    expect(
      (await uploadActivity(request(data, { origin: '' }), deps)).status,
    ).toBe(403)
    expect(
      (await uploadActivity(request(data, { 'x-publish-activity': '' }), deps))
        .status,
    ).toBe(400)
    deps.allowUpload.mockResolvedValue(false)
    expect((await uploadActivity(request(), deps)).status).toBe(429)
    expect(deps.repository.createUploadedPost).not.toHaveBeenCalled()
  })

  it('limits actual body size even when Content-Length is absent or dishonest', async () => {
    const deps = dependencies()
    expect(
      (
        await uploadActivity(
          request('a'.repeat(MAX_ACTIVITY_BYTES + 1), {
            'content-length': '1',
          }),
          deps,
        )
      ).status,
    ).toBe(413)
    expect(
      (
        await uploadActivity(
          request(data, { 'content-length': String(MAX_ACTIVITY_BYTES + 1) }),
          deps,
        )
      ).status,
    ).toBe(413)
    expect(deps.repository.createUploadedPost).not.toHaveBeenCalled()
  })

  it('rejects malformed files without persisting a partial post', async () => {
    const deps = dependencies()
    const response = await uploadActivity(request('<gpx/>'), deps)
    expect(response.status).toBe(400)
    expect(deps.repository.createUploadedPost).not.toHaveBeenCalled()
    expect((await uploadActivity(new Request(origin), deps)).status).toBe(405)
  })

  it('does not disclose database errors', async () => {
    const deps = dependencies()
    deps.repository.createUploadedPost.mockRejectedValue(
      new Error('private connection details'),
    )
    const response = await uploadActivity(request(), deps)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private connection')
  })
})
