import { defineConfig } from 'vite'
import { redwood } from 'rwsdk/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    allowedHosts: process.env.AMP_ORB ? true : undefined,
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'worker' },
    }),
    redwood(),
    tailwindcss(),
  ],
})
