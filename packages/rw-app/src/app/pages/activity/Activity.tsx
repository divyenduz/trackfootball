import { RequestInfo } from 'rwsdk/worker'
import { ActivityClient } from './ActivityClient'

export async function Activity({ ctx, params }: RequestInfo) {
  const post = await ctx.repository.getPostWithUserAndFields(
    parseInt(params.id, 10),
  )

  const backHref = ctx.user ? '/dashboard' : '/home'
  const backLabel = ctx.user ? 'Back to dashboard' : 'TrackFootball home'

  if (!post) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
          Activity not found
        </h1>
        <p className="mt-2 text-gray-600">
          This activity may have been removed or is no longer available.
        </p>
        <a
          className="mt-6 inline-flex min-h-11 items-center rounded-lg font-semibold text-cardinal-900 underline underline-offset-4"
          href={backHref}
        >
          {backLabel}
        </a>
      </div>
    )
  }

  const activityTitle = post.text.trim() || 'Football Activity'
  const athleteName =
    [post.User.firstName, post.User.lastName]
      .map((name) => name?.trim())
      .filter(Boolean)
      .join(' ') || 'an athlete'

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <title>{`${activityTitle} - Activity | TrackFootball.app`}</title>
      <meta
        name="description"
        content={`View ${athleteName}'s football activity: ${activityTitle}. Analyze performance metrics and training data on TrackFootball.`}
      />
      <nav
        aria-label="Activity navigation"
        className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 sm:mb-5"
      >
        <a
          href={backHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-gray-700 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-950"
        >
          <span aria-hidden="true">←</span>
          {backLabel}
        </a>
        <a
          href={`https://strava.com/activities/${post.key}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-cardinal-900 underline decoration-cardinal-900/30 underline-offset-4"
        >
          View in Strava
          <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </nav>
      <ActivityClient post={post} />
    </div>
  )
}
