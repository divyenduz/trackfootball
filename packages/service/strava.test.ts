import { HttpError } from '@trackfootball/open-api'
import type { createRepository } from '@trackfootball/postgres'
import { describe, expect, it, vi } from 'vitest'

import {
  checkStravaAccessToken,
  tokenExchange,
  tokenRefresh,
} from './strava'

const config = { clientId: 'client', clientSecret: 'secret' }

describe('Strava OAuth', () => {
  it('preserves a provider HTTP failure instead of casting it as tokens', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: 'authorization failed' }, { status: 401 }),
      )

    await expect(tokenExchange('code', config, fetchFn)).rejects.toMatchObject({
      name: 'HttpError',
      status: 401,
      body: { message: 'authorization failed' },
    } satisfies Partial<HttpError>)
  })

  it('rejects a malformed successful token refresh', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        Response.json({ access_token: 'access-without-refresh-token' }),
      )

    await expect(tokenRefresh('refresh', config, fetchFn)).rejects.toThrow()
  })

  it('returns validated refresh credentials', async () => {
    const payload = {
      token_type: 'Bearer',
      expires_at: 1_800_000_000,
      expires_in: 21_600,
      refresh_token: 'new-refresh',
      access_token: 'new-access',
    }
    const fetchFn = vi.fn().mockResolvedValue(Response.json(payload))

    await expect(tokenRefresh('refresh', config, fetchFn)).resolves.toEqual(
      payload,
    )
  })

  it('reports a missing access token as not working', async () => {
    const repository = {
      getUser: vi.fn().mockResolvedValue({ id: 42 }),
      getUserStravaSocialLogin: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof createRepository>

    await expect(checkStravaAccessToken(repository, 42)).resolves.toBe(false)
    expect(repository.getUserStravaSocialLogin).toHaveBeenCalledWith(42)
  })
})
