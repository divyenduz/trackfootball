# TrackFootball.app Agent Instructions

## Development

The app may already be running in an Amp orb. From the repository root, run `amp orb services ensure` to reuse the supervised app service or start it when missing, wait for readiness, and obtain its portal URL. Use the exact portal URL returned by Amp; do not launch a second dev server directly or ask the user to start it.

If the service does not become ready, inspect `amp orb service status app` and `amp orb service logs app` before changing anything. If required runtime configuration is missing, use the project's Amp environment variables or secrets; do not invent credential values. The browser may retain an authenticated session, but verify that rather than assuming it is logged in.

## Commands

- **Dev**: `pnpm run dev` (starts the Vite app outside an Amp orb); use `amp orb services ensure` in an orb
- **Build**: `pnpm run build` (builds all packages)
- **Test**: `pnpm run test` (runs all tests), `pnpm --filter @trackfootball/service test` (single package test)
- **Lint**: `pnpm run lint` (TypeScript check all packages), `pnpm --filter <package> lint` (single package)
- **Release**: `pnpm run release` (deploys rw-app to Cloudflare Workers)

## Feature Verification

After building a feature, test the rendered home page (`/home`), dashboard feed (`/dashboard`), and at least one concrete activity page (`/activity/:id`) before considering the work complete. Commit the completed feature after these checks pass.

For every UI change, always verify responsiveness at representative desktop, tablet, and narrow mobile widths. Check the affected states for horizontal overflow, clipping, overlap, and unintended wrapping; report the tested viewport sizes and results.

Always give the user direct proof that the changed behavior works. Report the executed checks and their decisive output; do not treat a successful build or deployment workflow as proof that the application works. After shipping a change, verify the live production application independently and report concrete evidence such as the requested URL, final URL, HTTP status, and relevant rendered content or browser state. If authentication or unavailable data prevents a production check, state exactly what could and could not be verified.

## Architecture

- **Monorepo** with pnpm workspaces, packages in `packages/`
- **Main app**: `rw-app` (React + Cloudflare Workers + Vite)
- **Database**: PostgreSQL with custom functions (see README.md SQL section)
- **Key packages**: `service` (business logic), `postgres` (DB layer), `rw-app` (UI)
- **Testing**: Vitest for unit tests (package-level `__tests__` directories)

## Code Style

- **TypeScript**: Strict mode, ES2021+, React JSX
- **Prettier**: Single quotes, no semicolons, custom import order (@core, @server, @ui, relative)
- **Imports**: Use workspace aliases `@trackfootball/*`, path aliases `@/*` for src
- **Conventions**: Use `tiny-invariant` for assertions, `ts-pattern` for pattern matching
- **Types**: Handwritten in `@trackfootball/postgres` using zod schemas with inferred TypeScript

IMPORTANT Follow the functional core. Most 'inner' code should be stateless with a thin imperative layer at the boundaries.

## Refactoring

Many tasks will involve refactoring, whenever you do that, do not make too many changes at once. Focus on the primary task, if you have to change another place, ask first and use a TODO to "mark" a part of the existing codebase as something that would need refactor.

Remember to follow the functional core, imperative shell principle. Most 'inner' code should be stateless with a thin imperative layer at the boundaries.
