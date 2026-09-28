# TrackFootball

Track and visualize your football (soccer) activities using GPS data.

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
  service/      # Business logic and geo processing
  postgres/     # Database layer
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

### Activity imports

The Strava integration is unavailable. On 2026-09-28, an actual user-1 probe
successfully refreshed the token (HTTP 200), but
`GET /api/v3/athlete/activities?per_page=1` returned HTTP 403 with
`Application.Status` reported as `Inactive`. This observation does not identify
the cause of the application status.

FIT and GPX file uploads are forthcoming as the replacement import path.

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
