import { RequestInfo } from 'rwsdk/worker'
import { ShowToOwner } from '@/components/atoms/ShowToOwner'
import {
  CheckStravaState,
  ConnectWithStravaWidget,
} from '@/components/organisms/ConnectWithStravaWidget'
import { env } from 'cloudflare:workers'
import { checkStravaToken } from './checkStravaToken'

export async function Athlete({ ctx, params }: RequestInfo) {
  const athlete = await ctx.repository.getUser(parseInt(params.id, 10))

  if (!athlete) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
          Athlete not found
        </h1>
        <p className="mt-2 text-gray-600">
          This athlete profile is no longer available.
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

  const athleteSocialLogin = await ctx.repository.getUserStravaSocialLogin(
    athlete.id,
  )

  const stravaState = (await checkStravaToken({
    ...athlete,
    socialLogin: athleteSocialLogin ? [athleteSocialLogin] : [],
  })) as CheckStravaState

  const athleteName =
    [athlete.firstName, athlete.lastName].filter(Boolean).join(' ') || 'Athlete'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <title>{`${athleteName} - Athlete Profile | TrackFootball.app`}</title>
      <meta
        name="description"
        content={`View ${athleteName}'s football profile and activities. Track performance, analyze game data and connect on TrackFootball.`}
      />
      <div className="mb-8">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-cardinal-900">
          Athlete profile
        </p>
        <h1 className="break-words text-3xl font-semibold tracking-tight text-gray-950">
          {athleteName}
        </h1>
      </div>

      <ShowToOwner ownerId={athlete.id} userId={ctx.user?.id}>
        <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Strava connection
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-gray-600">
              Keep your football activities in sync with your athlete profile.
            </p>
          </div>
          <ConnectWithStravaWidget
            redirectTo="athlete"
            backendApiUrl={env.BACKEND_API}
            checkStravaState={stravaState}
          />
        </section>
      </ShowToOwner>
    </div>
  )
}
