'use client'

import type { Post } from '@trackfootball/postgres'
import invariant from 'tiny-invariant'

type ActivityPost = Post & {
  User: {
    firstName: string | null
    lastName: string | null
  }
  Field: {
    name: string
    usage: string
  } | null
}

const isAvailable = (value: number) => Number.isFinite(value) && value > 0

const formatDistance = (meters: number) => {
  return `${(meters / 1000).toFixed(2)} km`
}

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`
  }

  return `${mins}m ${secs.toString().padStart(2, '0')}s`
}

const formatSpeed = (metersPerSecond: number) => {
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`
}

const getAthleteName = (firstName: string | null, lastName: string | null) => {
  return (
    [firstName, lastName]
      .map((name) => name?.trim())
      .filter(Boolean)
      .join(' ') || 'Athlete'
  )
}

const getInitials = (firstName: string | null, lastName: string | null) => {
  const initials = [firstName, lastName]
    .map((name) => name?.trim().charAt(0))
    .filter(Boolean)
    .join('')

  return initials.toUpperCase() || 'A'
}

const formatStartTime = (startTime: Date | null) => {
  if (!startTime || Number.isNaN(startTime.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(startTime)
}

const getRoutePoints = (geoJson: Post['geoJson']) => {
  const allCoordinates =
    geoJson?.features
      .flatMap((feature) => feature.geometry.coordinates)
      .map(([longitude, latitude]) => ({ longitude, latitude }))
      .filter(
        ({ longitude, latitude }) =>
          Number.isFinite(longitude) && Number.isFinite(latitude),
      ) ?? []

  if (allCoordinates.length < 2) return null

  const sampleEvery = Math.max(1, Math.ceil(allCoordinates.length / 1_000))
  const coordinates = allCoordinates.filter(
    (_, index) =>
      index % sampleEvery === 0 || index === allCoordinates.length - 1,
  )

  const width = 640
  const height = 320
  const padding = 28
  const meanLatitude =
    coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) /
    coordinates.length
  const longitudeScale = Math.cos((meanLatitude * Math.PI) / 180)
  const projected = coordinates.map(({ longitude, latitude }) => ({
    x: longitude * longitudeScale,
    y: latitude,
  }))
  const xs = projected.map(({ x }) => x)
  const ys = projected.map(({ y }) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const routeWidth = maxX - minX
  const routeHeight = maxY - minY

  if (routeWidth === 0 && routeHeight === 0) return null

  const scale = Math.min(
    (width - padding * 2) / (routeWidth || 1),
    (height - padding * 2) / (routeHeight || 1),
  )
  const offsetX = (width - routeWidth * scale) / 2
  const offsetY = (height - routeHeight * scale) / 2

  return projected.map(({ x, y }) => ({
    x: offsetX + (x - minX) * scale,
    y: height - (offsetY + (y - minY) * scale),
  }))
}

export function ActivityClient({ post }: { post: ActivityPost }) {
  invariant(post, `Post with id ${post.id} not found`)

  const activityTitle = post.text.trim() || 'Football Activity'
  const athleteName = getAthleteName(post.User.firstName, post.User.lastName)
  const startTime = formatStartTime(post.startTime)
  const metrics = [
    {
      label: 'Distance',
      value: isAvailable(post.totalDistance)
        ? formatDistance(post.totalDistance)
        : null,
      primary: true,
    },
    {
      label: 'Elapsed time',
      value: isAvailable(post.elapsedTime)
        ? formatDuration(post.elapsedTime)
        : null,
      primary: true,
    },
    {
      label: 'Average speed',
      value: isAvailable(post.averageSpeed)
        ? formatSpeed(post.averageSpeed)
        : null,
      primary: false,
    },
    {
      label: 'Max speed',
      value: isAvailable(post.maxSpeed) ? formatSpeed(post.maxSpeed) : null,
      primary: false,
    },
  ]
  const primaryMetrics = metrics.filter((metric) => metric.primary)
  const supportingMetrics = metrics.filter((metric) => !metric.primary)
  const hasMetrics = metrics.some((metric) => metric.value)
  const routePoints = getRoutePoints(post.geoJson)

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="p-5 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cardinal-900">
          Activity
        </p>
        <h1 className="mt-2 break-words text-2xl font-semibold leading-tight tracking-tight text-gray-950 sm:text-3xl">
          {activityTitle}
        </h1>

        <div className="mt-6 flex min-w-0 items-start gap-3 sm:mt-7">
          <div
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white shadow-sm ring-2 ring-white sm:size-12"
          >
            {getInitials(post.User.firstName, post.User.lastName)}
          </div>
          <div className="min-w-0">
            <p className="break-words font-semibold text-gray-950">
              {athleteName}
            </p>
            <div className="mt-1 space-y-1 text-sm leading-5 text-gray-600">
              <p>
                {startTime && post.startTime ? (
                  <>
                    Started{' '}
                    <time dateTime={post.startTime.toISOString()}>
                      {startTime}
                    </time>
                  </>
                ) : (
                  'Start time unavailable'
                )}
              </p>
              {post.Field && (
                <p className="break-words">Field: {post.Field.name}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <section
        aria-labelledby="activity-summary-heading"
        className="border-t border-gray-200 bg-gray-50/70 p-5 sm:p-8"
      >
        <h2
          id="activity-summary-heading"
          className="text-sm font-semibold text-gray-950"
        >
          Activity summary
        </h2>

        {hasMetrics ? (
          <dl className="mt-5">
            <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
              {primaryMetrics.map((metric) => (
                <div key={metric.label} className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    {metric.label}
                  </dt>
                  <dd className="mt-1 break-words text-3xl font-semibold tabular-nums tracking-tight text-gray-950 sm:text-4xl">
                    {metric.value || (
                      <span className="text-gray-400" aria-label="Unavailable">
                        —
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 border-t border-gray-200 pt-1 sm:grid-cols-2 sm:gap-8 sm:pt-5">
              {supportingMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="flex min-w-0 items-baseline justify-between gap-4 border-b border-gray-200 py-3 last:border-b-0 sm:block sm:border-b-0 sm:py-0"
                >
                  <dt className="text-sm font-medium text-gray-600">
                    {metric.label}
                  </dt>
                  <dd className="break-words text-right text-lg font-semibold tabular-nums text-gray-950 sm:mt-1 sm:text-left sm:text-xl">
                    {metric.value || (
                      <span className="text-gray-400" aria-label="Unavailable">
                        —
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            Performance data is unavailable for this activity.
          </p>
        )}
      </section>

      {routePoints && (
        <section
          aria-labelledby="activity-route-heading"
          className="border-t border-gray-200 p-5 sm:p-8"
        >
          <h2
            id="activity-route-heading"
            className="text-sm font-semibold text-gray-950"
          >
            Route trace
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            GPS path recorded during this activity.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-slate-50">
            <svg
              viewBox="0 0 640 320"
              className="block aspect-[2/1] w-full"
              role="img"
              aria-labelledby="activity-route-title activity-route-description"
            >
              <title id="activity-route-title">Activity route trace</title>
              <desc id="activity-route-description">
                The GPS path from the start to the end of this activity.
              </desc>
              <polyline
                points={routePoints
                  .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
                  .join(' ')}
                fill="none"
                stroke="#9f1239"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={routePoints[0]?.x}
                cy={routePoints[0]?.y}
                r="7"
                fill="#15803d"
                stroke="white"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={routePoints.at(-1)?.x}
                cy={routePoints.at(-1)?.y}
                r="7"
                fill="#9f1239"
                stroke="white"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="mt-3 flex gap-5 text-xs font-medium text-gray-600">
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-green-700" /> Start
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-cardinal-800" /> Finish
            </span>
          </div>
        </section>
      )}
    </article>
  )
}
