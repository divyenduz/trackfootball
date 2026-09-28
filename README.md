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

FIT and GPX uploads are the only supported import path. Sign in, choose
**Upload activity** on the dashboard, and select an original recording from
your watch or GPS app. Confirm public sharing before uploading: the activity,
athlete name, metrics, and GPS route are visible in the feed and activity page.

- One uncompressed `.fit` or `.gpx` file per upload, at most 5 MiB, 50,000 GPS
  samples, and 100 track segments. Every segment needs at least two points.
- Timestamped GPS recordings only; planned routes, indoor/no-GPS recordings,
  multi-track GPX and multisport FIT files are not supported.
- Distance and speeds are calculated from GPS samples, not device summary
  fields. Segment breaks and FIT timer pauses are not joined. Elapsed time
  includes pauses; average speed uses elapsed time. GPS noise can affect speed.
- Identical file bytes uploaded by the same account reopen the existing
  activity. Different exports of the same workout are not deduplicated.
- Raw files are not retained; normalized GPS/time/heart-rate samples and summary
  metrics are stored. Uploads are limited to 10 requests per minute per user.

Before deploying uploads, apply
`packages/postgres/migrations/20260928_activity_upload.sql` to the target database
with the database owner's approval. It adds the `UPLOADED_ACTIVITY` enum value;
no historical records or tables are deleted. Existing Strava data retention
must be reviewed separately against applicable terms. OAuth, webhook ingestion,
retry jobs, and Strava CLI commands have been removed.

### Upload verification

`pnpm run test` runs parser and request-boundary tests. For database tests, set
`TEST_DATABASE_URL` to a **local disposable PostgreSQL server** and run
`pnpm --filter @trackfootball/service test`. The database tests create and drop
their own temporary database, apply the migration twice, and exercise concurrent
uploads and ownership isolation. They never use `DATABASE_URL`.

`packages/service/fixtures/match.gpx` is a synthetic two-segment recording for
browser checks. Do not submit test uploads to a shared or production database.

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
