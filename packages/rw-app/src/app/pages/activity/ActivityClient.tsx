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
    </article>
  )
}
