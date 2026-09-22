'use client'

import type { Post, User } from '@trackfootball/postgres'
import { useState, useRef, useEffect } from 'react'
import { getFeed } from './feed'

type FeedPost = Awaited<ReturnType<typeof getFeed>>['posts'][number]

interface FeedWithUser extends FeedPost {
  User: User
}

interface FeedContainerProps {
  initialPosts: FeedWithUser[]
  initialNextCursor: number | null
  currentUser: User | null
}

export function FeedContainer({
  initialPosts,
  initialNextCursor,
  currentUser,
}: FeedContainerProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const actionsButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && openDropdown !== null) {
        setOpenDropdown(null)
        actionsButtonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openDropdown])

  const loadMore = async () => {
    if (!nextCursor || loading) return

    setError(null)
    setLoading(true)
    try {
      const data = await getFeed(nextCursor)
      setPosts((prev) => [...prev, ...data.posts])
      setNextCursor(data.nextCursor)
    } catch (error) {
      console.error('Error loading more posts:', error)
      setError('We could not load more activities. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (postId: number) => {
    if (confirm('Are you sure you want to delete this activity?')) {
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          setPosts(posts.filter((p) => p.id !== postId))
          setOpenDropdown(null)
        } else {
          setError('We could not delete this activity. Please try again.')
        }
      } catch (error) {
        console.error('Error deleting post:', error)
        setError('We could not delete this activity. Please try again.')
      }
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDistance = (meters: number) => {
    return (meters / 1000).toFixed(2)
  }

  const formatSpeed = (mps: number) => {
    return (mps * 3.6).toFixed(1) + ' km/h'
  }

  const formatDateTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days === 0) {
      if (hours === 0) {
        const mins = Math.floor(diff / (1000 * 60))
        return mins <= 1 ? 'Just now' : `${mins} minutes ago`
      }
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`
    } else if (days === 1) {
      return `Yesterday at ${date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`
    } else if (days < 7) {
      return `${days} days ago`
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      })
    }
  }

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const f = firstName?.[0] || ''
    const l = lastName?.[0] || ''
    return (f + l).toUpperCase() || 'U'
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-cardinal-900">
          Latest activity
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
          Dashboard
        </h1>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {posts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            No activities yet
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            New football activities will appear here.
          </p>
        </div>
      )}

      {posts.map((post) => (
        <article
          className="relative rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
          key={post.id}
        >
          <a
            href={`/activity/${post.id}`}
            className="block rounded-xl text-gray-900"
          >
            <div className="border-b border-gray-100 p-4 pb-3 pr-16">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white">
                  {getInitials(post.User.firstName, post.User.lastName)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold text-gray-900">
                    {post.User.firstName} {post.User.lastName}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {formatDateTime(new Date(post.createdAt))}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 pb-2 pt-3">
              <h2 className="break-words text-lg font-semibold text-gray-900">
                {post.text || 'Football Activity'}
              </h2>
            </div>

            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Time
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-gray-900">
                    {post.elapsedTime ? formatTime(post.elapsedTime) : '--'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Distance
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-gray-900">
                    {post.totalDistance
                      ? `${formatDistance(post.totalDistance)} km`
                      : '-- km'}
                  </div>
                </div>
              </div>
            </div>
          </a>

          <div
            className="absolute right-3 top-3"
            ref={openDropdown === post.id ? dropdownRef : null}
          >
            <button
              ref={openDropdown === post.id ? actionsButtonRef : null}
              type="button"
              aria-label={`Actions for ${post.text || 'Football Activity'}`}
              aria-controls={`activity-actions-${post.id}`}
              aria-expanded={openDropdown === post.id}
              className="flex size-11 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              onClick={() => {
                setOpenDropdown(openDropdown === post.id ? null : post.id)
              }}
            >
              <svg
                aria-hidden="true"
                className="size-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {openDropdown === post.id && (
              <div
                id={`activity-actions-${post.id}`}
                className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              >
                <a
                  href={`https://strava.com/activities/${post.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block min-h-11 w-full px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  View in Strava
                </a>
                {currentUser?.type === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => handleDelete(post.id)}
                    className="min-h-11 w-full px-4 py-3 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
                  >
                    Delete activity
                  </button>
                )}
              </div>
            )}
          </div>
        </article>
      ))}

      {nextCursor && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="min-h-11 rounded-lg border border-gray-900 px-6 py-2 font-medium text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}
