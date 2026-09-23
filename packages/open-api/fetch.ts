export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    public readonly retryAfter: string | null,
  ) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`)
    this.name = 'HttpError'
  }
}
