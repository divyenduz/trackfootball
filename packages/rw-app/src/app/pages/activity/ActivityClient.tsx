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

const formatDistance = (meters: number) => {
  return `${(meters / 1000).toFixed(2)} km`
}

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}h ${mins}m`
  }

  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatSpeed = (metersPerSecond: number) => {
  if (!metersPerSecond) {
    return '--'
  }
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`
}

export function ActivityClient({ post }: { post: ActivityPost }) {
  invariant(post, `Post with id ${post.id} not found`)

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm font-medium text-gray-600">Start time</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            {post.startTime
              ? new Date(post.startTime).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : '--'}
          </div>
        </div>

        {post.Field && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <div className="font-medium text-gray-900">Field</div>
            <div>
              {post.Field.name} · {post.Field.usage}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-600">
            Total distance
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
            {post.totalDistance ? formatDistance(post.totalDistance) : '--'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-600">Elapsed time</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
            {post.elapsedTime ? formatDuration(post.elapsedTime) : '--'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-600">Average speed</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
            {formatSpeed(post.averageSpeed)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-600">Max speed</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
            {formatSpeed(post.maxSpeed)}
          </div>
        </div>
      </div>
    </div>
  )
}
