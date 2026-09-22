import { RequestInfo } from 'rwsdk/worker'
import { ActivityClient } from './ActivityClient'

export async function Activity({ ctx, params }: RequestInfo) {
  const post = await ctx.repository.getPostWithUserAndFields(
    parseInt(params.id, 10),
  )

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
          href="/dashboard"
        >
          Return to dashboard
        </a>
      </div>
    )
  }

  const activityTitle = post.text || 'Football Activity'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <title>{`${activityTitle} - Activity | TrackFootball.app`}</title>
      <meta
        name="description"
        content={`View ${post.User.firstName} ${post.User.lastName}'s football activity: ${activityTitle}. Analyze performance metrics and training data on TrackFootball.`}
      />
      <div className="mb-6 sm:mb-8">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-cardinal-900">
          Activity
        </p>
        <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight text-gray-950 sm:text-3xl">
          {activityTitle}
        </h1>
        <p className="mt-2 text-base text-gray-600">
          {post.User.firstName} {post.User.lastName}
        </p>
      </div>
      <ActivityClient post={post} />
    </div>
  )
}
