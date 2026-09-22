export type RequestConfig<TData = unknown> = {
  url?: string
  method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE'
  params?: object
  data?: TData | FormData
  responseType?:
    'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream'
  signal?: AbortSignal
  headers?: HeadersInit
}

type ResponseConfig<TData = unknown> = {
  data: TData
  status: number
  statusText: string
}

export type ResponseErrorConfig<TError = unknown> = {
  error: TError
  status: number
  statusText: string
}

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

async function parseResponse<TData>(
  response: Response,
  responseType: RequestConfig['responseType'],
): Promise<TData | undefined> {
  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return undefined
  }

  if (responseType === 'blob') {
    return (await response.blob()) as unknown as TData
  }
  if (responseType === 'text') {
    return (await response.text()) as unknown as TData
  }
  if (responseType === 'arraybuffer') {
    return (await response.arrayBuffer()) as unknown as TData
  }

  const text = await response.text()
  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text) as TData
  } catch (error) {
    if (!response.ok) {
      return text as TData
    }
    throw error
  }
}

const client = async <TData, TError = unknown, TVariables = unknown>(
  config: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData>> => {
  // Build URL with query params if present
  const url = new URL(config.url || '')
  if (config.params) {
    Object.entries(config.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value))
      }
    })
  }

  // Prepare request options
  const options: RequestInit = {
    method: config.method,
    headers: config.headers || {},
    signal: config.signal ?? AbortSignal.timeout(30_000),
  }

  // Add body for non-GET requests
  if (config.data && config.method !== 'GET') {
    if (config.data instanceof FormData) {
      options.body = config.data
    } else {
      options.body = JSON.stringify(config.data)

      // Create a proper Headers object to handle types safely
      const headers = new Headers(options.headers)
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      options.headers = headers
    }
  }

  const response = await fetch(url.toString(), options)

  const data = await parseResponse<TData>(response, config.responseType)
  if (!response.ok) {
    throw new HttpError(
      response.status,
      response.statusText,
      data,
      response.headers.get('retry-after'),
    )
  }

  return {
    data: data as TData,
    status: response.status,
    statusText: response.statusText,
  }
}

export type Client = typeof client

export default client
