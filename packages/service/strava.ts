import type { PostType } from '@trackfootball/postgres'

import invariant from 'tiny-invariant'
import { createDiscordMessage } from './discord'
import {
  getActivityById,
  getActivityStreams,
  getLoggedInAthleteActivities,
} from '@trackfootball/open-api'
import { match } from 'ts-pattern'
import { GeoData } from './geoData'
import { postAddField } from './addField'
import { createRepository } from '@trackfootball/postgres'

import { env } from '@trackfootball/rw-app/src/env'

export class IgnorableActivityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IgnorableActivityError'
  }
}

export const SUPPORTED_ACTIVITY_TYPES = ['Run', 'Soccer']

export const stringify = (value: number | string): string => {
  if (typeof value === 'number') {
    return value.toString()
  }
  return value
}

export async function importStravaActivity(
  repository: ReturnType<typeof createRepository>,
  ownerId: number,
  activityId: number,
  source: 'WEBHOOK' | 'MANUAL',
) {
  const user = await repository.getUserBy(stringify(ownerId))
  if (!user) {
    await createDiscordMessage({
      heading: `New Activity Creation Failed - No Social Login For User (${source})`,
      name: `${ownerId}/${activityId}`,
      description: `
      User has no Strava social login configured
      Strava Owner: ${ownerId}
      Activity ID: ${activityId}
      Athlete Link: https://strava.com/athletes/${ownerId}
      Activity Link: https://strava.com/activities/${activityId}`,
    })
    throw new Error(
      `User has no Strava social login configured for owner ${ownerId}`,
    )
  }

  const existingPost = await repository.getPostByStravaId(activityId)
  if (existingPost?.geoJson) {
    return
  }

  const activity = await fetchStravaActivity(repository, activityId, user.id)

  const activityType = activity.type
  if (!activityType) {
    throw new IgnorableActivityError(`Activity ${activityId} has no type`)
  }

  const isGeoDataAvailable = Boolean(activity.map?.polyline)
  if (!isGeoDataAvailable) {
    throw new IgnorableActivityError(`Activity ${activityId} has no geo data`)
  }

  if (!SUPPORTED_ACTIVITY_TYPES.includes(activityType)) {
    throw new IgnorableActivityError(
      `Activity type ${activityType} not supported`,
    )
  }

  const activityName = activity.name
  invariant(activityName, 'activity must have a name')

  const post = existingPost ?? await (async () => {
    const data = {
      type: 'STRAVA_ACTIVITY' as PostType,
      key: stringify(activityId),
      text: activityName,
      userId: user.id,
    }

    const created = await repository.createPost(data)

    if (!created) {
      throw new Error(`Failed to create post for activity ${activityId}`)
    }

    return created
  })()

  await fetchCompletePost(repository, {
    postId: post.id,
  })
  const updatedPost = await repository.getPostWithUserAndFields(post.id)

  await createDiscordMessage({
    heading: `New Activity Created (${source})`,
    name: `${post.text}`,
    description: `
      ID: ${post.id} / Strava ID: ${activityId}
      Activity Time: ${updatedPost?.startTime}
      User: ${user.firstName} ${user.lastName}
      Link: ${env.HOMEPAGE_URL}/activity/${post.id}`,
  })
}

type Athlete = {
  id: number
  username: string
  resource_state: number
  firstname: string
  lastname: string
  city: string
  state: string
  country: string
  sex: string
  premium: boolean
  summit: boolean
  created_at: string
  updated_at: string
  badge_type_id: number
  profile_medium: string
  profile: string
  friend: any
  follower: any
}

type TokenExchangeResponse = {
  token_type: string
  expires_at: number
  expires_in: number
  refresh_token: string
  access_token: string
  athlete: Athlete
}

export async function tokenExchange(
  code: string,
): Promise<TokenExchangeResponse> {
  const stravaClientId = env.STRAVA_CLIENT_ID
  const stravaClientSecret = env.STRAVA_CLIENT_SECRET
  const link = 'https://www.strava.com/api/v3/oauth/token'

  const form = new FormData()
  invariant(stravaClientId, `stravaClientId not set`)
  invariant(stravaClientSecret, `stravaClientSecret not set`)
  form.append('client_id', stravaClientId)
  form.append('client_secret', stravaClientSecret)
  form.append('code', code)
  form.append('grant_type', 'authorization_code')

  const r = await fetch(link, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  const tokenExchangeResponse = await r.json()
  return tokenExchangeResponse as TokenExchangeResponse
}

export async function tokenRefresh(
  refreshToken: string,
): Promise<Omit<TokenExchangeResponse, 'athlete'>> {
  const stravaClientId = env.STRAVA_CLIENT_ID
  const stravaClientSecret = env.STRAVA_CLIENT_SECRET
  const link = 'https://www.strava.com/api/v3/oauth/token'

  invariant(stravaClientId, `stravaClientId not set`)
  invariant(stravaClientSecret, `stravaClientSecret not set`)

  const form = new FormData()
  form.append('client_id', stravaClientId)
  form.append('client_secret', stravaClientSecret)
  form.append('refresh_token', refreshToken)
  form.append('grant_type', 'refresh_token')

  const r = await fetch(link, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  const tokenRefreshResponse = await r.json()
  return tokenRefreshResponse as TokenExchangeResponse
}

export type Maybe<T = string, E = null> = T | E

/**
 *
 * @param userId user id in our database
 * @returns Strava access token, refreshed if needed
 */
export async function getStravaToken(
  repository: ReturnType<typeof createRepository>,
  userId: number,
): Promise<Maybe> {
  const now = new Date()

  const user = await repository.getUser(userId)
  if (!user) {
    console.error(`getStravaToken: User with id ${userId} not found`)
    return null
  }

  const stravaSocialLogin = await repository.getUserStravaSocialLogin(userId)
  if (!stravaSocialLogin) {
    console.error(
      `getStravaToken: Strava social login with user id ${userId} not found`,
    )
    return null
  }

  const userStravaId = stravaSocialLogin.platformId
  const expiresAt = stravaSocialLogin.expiresAt
  const refreshToken = stravaSocialLogin.refreshToken
  const accessToken = stravaSocialLogin.accessToken

  if (new Date(expiresAt!).getTime() < now.getTime()) {
    try {
      const tokenRefreshResponse = await tokenRefresh(refreshToken!)

      //@ts-expect-error
      if (tokenRefreshResponse.errors?.length > 0) {
        console.error(
          `Failed to refresh Strava token: `,
          //@ts-expect-error
          tokenRefreshResponse.message,
          ` Errors: `,
          //@ts-expect-error
          tokenRefreshResponse.errors,
        )
        return null
      }

      const expiresAt = new Date(tokenRefreshResponse.expires_at * 1000)

      await repository.updateSocialLoginTokens(
        userStravaId!.toString(),
        tokenRefreshResponse.access_token,
        tokenRefreshResponse.refresh_token,
        expiresAt,
      )

      return tokenRefreshResponse.access_token
    } catch (e) {
      console.error(`Failed to refresh Strava token: `, e)
      return null
    }
  } else {
    return accessToken!
  }
}

async function getStravaAccessTokenHeaders(
  repository: ReturnType<typeof createRepository>,
  userId: number,
) {
  const stravaAccessToken = await getStravaToken(repository, userId)
  return {
    Authorization: `Bearer ${stravaAccessToken}`,
  }
}

export async function checkStravaAccessToken(
  repository: ReturnType<typeof createRepository>,
  userId: number,
) {
  const stravaAccessTokenHeaders = await getStravaAccessTokenHeaders(
    repository,
    userId,
  )
  try {
    await getLoggedInAthleteActivities(
      {
        per_page: 1,
      },
      {
        headers: stravaAccessTokenHeaders,
      },
    )
    return true
  } catch (e) {
    console.error('Error: strava check failed')
    console.error(e)
    return false
  }
}

export async function fetchStravaActivity(
  repository: ReturnType<typeof createRepository>,
  activityId: number,
  userId: number,
) {
  const stravaAccessTokenHeaders = await getStravaAccessTokenHeaders(
    repository,
    userId,
  )
  const activity = await getActivityById(
    activityId,
    {
      include_all_efforts: false,
    },
    {
      headers: stravaAccessTokenHeaders,
    },
  )
  return activity
}

export async function fetchStravaActivityGeoJson(
  repository: ReturnType<typeof createRepository>,
  activityId: number,
  userId: number,
) {
  const stravaAccessTokenHeaders = await getStravaAccessTokenHeaders(
    repository,
    userId,
  )
  const activityStreams = await getActivityStreams(
    activityId,
    {
      keys: ['latlng', 'time', 'heartrate'],
      key_by_type: true,
    },
    {
      headers: stravaAccessTokenHeaders,
    },
  )

  const activity = await fetchStravaActivity(repository, activityId, userId)
  const activityName = activity.name
  invariant(activityName, 'activity must have a name')
  const activityStartDate = activity.start_date
  invariant(activityStartDate, 'activity must have a start date')
  const geoJson = match(Boolean(activityStreams))
    .with(true, () =>
      new GeoData(
        activityName,
        JSON.stringify(activityStreams),
        'StravaActivityStream',
        new Date(activityStartDate),
      ).toGeoJson(),
    )
    .otherwise(() => null)

  return geoJson
}

interface FetchCompletePostArgs {
  postId: number
}

export async function fetchCompletePost(
  repository: ReturnType<typeof createRepository>,
  { postId }: FetchCompletePostArgs,
) {
  {
    const post = await repository.getPostByIdWithoutField(postId)

    if (!post) {
      console.error(`post.fetchComplete: post ${postId} not found`)
      return
    }

    await repository.updatePostStatus(post.id, 'PROCESSING')

    const geoJson = await fetchStravaActivityGeoJson(
      repository,
      parseInt(post.key),
      post.userId,
    )

    if (geoJson instanceof Error) {
      throw geoJson
    }

    if (!geoJson) {
      throw new Error(`No geoJson found for Post id: ${postId}`)
    }

    const activity = await fetchStravaActivity(
      repository,
      parseInt(post.key),
      post.userId,
    )

    const updatedPost = await repository.updatePostComplete({
      id: post.id,
      geoJson: geoJson as any,
      totalDistance: activity.distance ?? 0,
      startTime: activity.start_date
        ? new Date(activity.start_date)
        : new Date(),
      elapsedTime: activity.elapsed_time ?? 0,
      // Note Sprint/runs are intentionally empty: geojson-based detection moved out
      // while we design the future XY-based analysis pipeline.
      totalSprintTime: 0,
      sprints: [],
      runs: [],
      maxSpeed: activity.max_speed ?? 0,
      averageSpeed: activity.average_speed ?? 0,
    })

    await postAddField(repository, {
      postId: post.id,
    })

    return { post: updatedPost }
  }
}
