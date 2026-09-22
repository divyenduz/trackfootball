# TrackFootball

Track and visualize your football (soccer) activities using GPS data from Strava.

**[trackfootball.app](https://trackfootball.app)**

## Tech Stack

- **App**: React + [RedwoodSDK](https://rwsdk.com) on Cloudflare Workers
- **Database**: PostgreSQL
- **Language**: TypeScript
- **Monorepo**: pnpm workspaces

## Project Structure

```
packages/
  rw-app/       # Web app (React + Cloudflare Workers + Vite)
  service/      # Business logic (geo processing, Strava integration)
  postgres/     # Database layer
  open-api/     # Generated API client (Kubb)
  cli/          # CLI tools
```

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm
- PostgreSQL

### Setup

```sh
cp .env-sample .env  # configure your environment variables
pnpm install
pnpm run dev
```

### Strava webhook setup

Webhook delivery uses a secret URL path because Strava does not sign delivery
requests. Configure `STRAVA_WEBHOOK_CALLBACK_SECRET` with a URL-safe,
high-entropy secret, then register this callback URL with Strava:

```text
https://trackfootball.app/api/social/strava/webhook/callback/<secret>
```

Keep `STRAVA_WEBHOOK_VERIFY_TOKEN` for Strava's GET subscription handshake.
After Strava creates the subscription, configure the returned positive integer
as `STRAVA_WEBHOOK_SUBSCRIPTION_ID`. The Worker cron retries authenticated,
unfinished events every five minutes; events received by the old unauthenticated
endpoint are deliberately excluded from automatic replay.

To retry an authenticated event after automatic retries are exhausted, run
`trackfootball webhook reprocess <event-id>`. Explicit `ERRORED` events are
atomically returned to the retry queue before processing.

### Commands

| Command            | Description                  |
| ------------------ | ---------------------------- |
| `pnpm run dev`     | Start development server     |
| `pnpm run build`   | Build all packages           |
| `pnpm run test`    | Run all tests                |
| `pnpm run lint`    | Typecheck all packages       |
| `pnpm run release` | Deploy to Cloudflare Workers |

## License

MIT
