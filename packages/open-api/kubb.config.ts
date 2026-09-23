import { adapterOas } from '@kubb/adapter-oas'
import { pluginFetch } from '@kubb/plugin-fetch'
import { pluginTs } from '@kubb/plugin-ts'
import { bundle, createConfig } from '@redocly/openapi-core'
import { defineConfig } from 'kubb'

const STRAVA_SPEC_URL = 'https://developers.strava.com/swagger/swagger.json'

// The Strava spec spreads its schemas across external files (activity.json,
// athlete.json, ...). Kubb v5's adapter rewrites those to internal
// '#/paths/...' pointers it cannot resolve, so we pre-bundle the spec into a
// self-contained document with all refs hoisted to named #/definitions
// entries (as recommended by the KUBB_REF_NOT_FOUND diagnostic).
export default defineConfig(async () => {
  const redoclyConfig = await createConfig({})
  const {
    bundle: { parsed: spec },
  } = await bundle({ ref: STRAVA_SPEC_URL, config: redoclyConfig })

  return {
    input: spec,
    output: {
      path: './services/strava',
      clean: true,
      format: 'prettier',
    },
    adapter: adapterOas({
      validate: true,
      server: { index: 0 },
      contentType: 'application/json',
      // Preserve the v4 generated types: v5 defaults integerType to 'bigint'.
      integerType: 'number',
      dateType: 'string',
      unknownType: 'unknown',
      enumSuffix: 'Enum',
    }),
    plugins: [
      pluginTs({
        output: {
          path: './generated/types.ts',
        },
        enum: { type: 'asConst' },
        optionalType: 'questionTokenAndUndefined',
      }),
      pluginFetch({
        baseURL: 'https://www.strava.com/api/v3',
        output: {
          path: './generated/client.ts',
        },
        // Preserve the v4 dataReturnType: 'data' behavior: generated functions
        // resolve to the bare success body and throw ResponseError on non-2xx.
        returnType: 'data',
      }),
    ],
  }
})
