import { afterEach, describe, expect, it, vi } from 'vitest'

import client, { HttpError } from './fetch'

describe('OpenAPI HTTP client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws an HTTP error with JSON response details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: 'rate limited' },
            { status: 429, headers: { 'Retry-After': '30' } },
          ),
        ),
    )

    const result = client({ method: 'GET', url: 'https://example.com' })

    await expect(result).rejects.toMatchObject({
      name: 'HttpError',
      status: 429,
      body: { message: 'rate limited' },
      retryAfter: '30',
    } satisfies Partial<HttpError>)
  })

  it('preserves status when an error response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>unavailable</html>', {
          status: 503,
          statusText: 'Unavailable',
        }),
      ),
    )

    await expect(
      client({ method: 'GET', url: 'https://example.com' }),
    ).rejects.toMatchObject({
      status: 503,
      body: '<html>unavailable</html>',
    })
  })

  it('accepts an empty successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    )

    await expect(
      client({ method: 'DELETE', url: 'https://example.com' }),
    ).resolves.toMatchObject({ status: 204, data: undefined })
  })

  it('does not hide malformed successful JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
    )

    await expect(
      client({ method: 'GET', url: 'https://example.com' }),
    ).rejects.toBeInstanceOf(SyntaxError)
  })
})
