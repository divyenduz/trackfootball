export type RequestConfig<TData = unknown> = {
  url?: string
  method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE'
  params?: object
  data?: TData | FormData
  responseType?:
    | 'arraybuffer'
    | 'blob'
    | 'document'
    | 'json'
    | 'text'
    | 'stream'
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

  // Parse response based on responseType
  let data: TData
  if (config.responseType === 'blob') {
    data = (await response.blob()) as unknown as TData
  } else if (config.responseType === 'text') {
    data = (await response.text()) as unknown as TData
  } else if (config.responseType === 'arraybuffer') {
    data = (await response.arrayBuffer()) as unknown as TData
  } else {
    // Default to JSON
    data = (await response.json()) as TData
  }

  return {
    data,
    status: response.status,
    statusText: response.statusText,
  }
}

export default client
