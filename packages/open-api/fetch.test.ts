import { describe, expect, it } from 'vitest'

import { HttpError } from './fetch'

describe('HttpError', () => {
  it('carries status, statusText, body and retryAfter', () => {
    const error = new HttpError(
      429,
      'Too Many Requests',
      { message: 'rate limited' },
      '30',
    )

    expect(error).toMatchObject({
      name: 'HttpError',
      message: 'HTTP 429 Too Many Requests',
      status: 429,
      statusText: 'Too Many Requests',
      body: { message: 'rate limited' },
      retryAfter: '30',
    })
  })
})
