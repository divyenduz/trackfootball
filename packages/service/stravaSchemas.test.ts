import { describe, expect, it } from 'vitest'

import { stravaEventSchema, tokenExchangeResponseSchema } from './stravaSchemas'

const eventBase = {
  object_id: 101,
  owner_id: 202,
  subscription_id: 303,
  event_time: 1_700_000_000,
}

describe('Strava boundary schemas', () => {
  it('accepts sparse activity updates and string privacy values', () => {
    expect(
      stravaEventSchema.parse({
        ...eventBase,
        object_type: 'activity',
        aspect_type: 'update',
        updates: { private: 'true' },
      }),
    ).toMatchObject({ updates: { private: 'true' } })
  })

  it('rejects athlete events whose object does not match the owner', () => {
    expect(() =>
      stravaEventSchema.parse({
        ...eventBase,
        object_type: 'athlete',
        aspect_type: 'update',
        updates: { authorized: 'false' },
      }),
    ).toThrow()
  })

  it('rejects an OAuth success payload without an athlete identity', () => {
    expect(() =>
      tokenExchangeResponseSchema.parse({
        token_type: 'Bearer',
        expires_at: 1_800_000_000,
        expires_in: 21_600,
        refresh_token: 'refresh',
        access_token: 'access',
      }),
    ).toThrow()
  })
})
