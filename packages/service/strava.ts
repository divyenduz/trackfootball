import type { PostType } from '@trackfootball/postgres'

import invariant from 'tiny-invariant'
import {
  getActivityById,
  getActivityStreams,
  getLoggedInAthleteActivities,
  HttpError,
} from '@trackfootball/open-api'
import { match } from 'ts-pattern'
import { GeoData } from './geoData'
import { postAddField } from './addField'
import { createRepository } from '@trackfootball/postgres'
import type { DiscordMessageSender } from './discord'
import {
  stravaActivitySchema,
  stravaActivityStreamsSchema,
  tokenExchangeResponseSchema,
  tokenRefreshResponseSchema,
} from './stravaSchemas'

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

export type StravaOAuthConfig = {
  clientId: string
  clientSecret: string
}

async function readOAuthResponse(response: Response) {
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new HttpError(
      response.status,
      response.statusText,
      body,
      response.headers.get('retry-after'),
    )
  }
  return body
}

export type ImportStravaActivityDeps = {
  stravaOAuth: StravaOAuthConfig
  homepageUrl?: string
  createDiscordMessage?: DiscordMessageSender
}

export async function importStravaActivity(
  repository: ReturnType<typeof createRepository>,
  ownerId: number,
  activityId: number,
  source: 'WEBHOOK' | 'MANUAL',
  deps: ImportStravaActivityDeps,
) {
  const { stravaOAuth, homepageUrl, createDiscordMessage } = deps
  const user = await repository.getUserBy(stringify(ownerId))
  if (!user) {
    await createDiscordMessage?.({
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
  if (existingPost && existingPost.userId !== user.id) {
    throw new Error(`Activity ${activityId} belongs to another user`)
  }
  if (existingPost?.status === 'COMPLETED' && existingPost.geoJson) {
    return
  }

  const activity = await fetchStravaActivity(
    repository,
    activityId,
    user.id,
    stravaOAuth,
  )

  if (activity.id !== activityId || activity.athlete.id !== ownerId) {
    throw new Error(`Strava activity ${activityId} ownership mismatch`)
  }

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

  const post =
    existingPost ??
    (await (async () => {
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
    })())

  if (post.userId !== user.id) {
    throw new Error(`Activity ${activityId} belongs to another user`)
  }

  await fetchCompletePost(repository, {
    postId: post.id,
    stravaOAuth,
  })
  const updatedPost = await repository.getPostWithUserAndFields(post.id)

  await createDiscordMessage?.({
    heading: `New Activity Created (${source})`,
    name: `${post.text}`,
    description: `
      ID: ${post.id} / Strava ID: ${activityId}
      Activity Time: ${updatedPost?.startTime}
      User: ${user.firstName} ${user.lastName}
      Link: ${homepageUrl}/activity/${post.id}`,
  })
}

export async function tokenExchange(
  code: string,
  config: StravaOAuthConfig,
  fetchFn: typeof fetch = fetch,
) {
  const link = 'https://www.strava.com/api/v3/oauth/token'

  const form = new FormData()
  form.append('client_id', config.clientId)
  form.append('client_secret', config.clientSecret)
  form.append('code', code)
  form.append('grant_type', 'authorization_code')

  const response = await fetchFn(link, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  return tokenExchangeResponseSchema.parse(await readOAuthResponse(response))
}

export async function tokenRefresh(
  refreshToken: string,
  config: StravaOAuthConfig,
  fetchFn: typeof fetch = fetch,
) {
  const link = 'https://www.strava.com/api/v3/oauth/token'

  const form = new FormData()
  form.append('client_id', config.clientId)
  form.append('client_secret', config.clientSecret)
  form.append('refresh_token', refreshToken)
  form.append('grant_type', 'refresh_token')

  const response = await fetchFn(link, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  return tokenRefreshResponseSchema.parse(await readOAuthResponse(response))
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
  config: StravaOAuthConfig,
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

  if (!expiresAt || !refreshToken || !accessToken) {
    return null
  }

  if (expiresAt.getTime() < now.getTime()) {
    try {
      const tokenRefreshResponse = await tokenRefresh(refreshToken, config)

      const expiresAt = new Date(tokenRefreshResponse.expires_at * 1000)

      await repository.updateSocialLoginTokens(
        userStravaId,
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

async function getStravaAccessToken(
  repository: ReturnType<typeof createRepository>,
  userId: number,
  config: StravaOAuthConfig,
) {
  const stravaAccessToken = await getStravaToken(repository, userId, config)
  if (!stravaAccessToken) {
    throw new Error(`No Strava access token for user ${userId}`)
  }
  return stravaAccessToken
}

export async function checkStravaAccessToken(
  repository: ReturnType<typeof createRepository>,
  userId: number,
  config: StravaOAuthConfig,
) {
  try {
    const stravaAccessToken = await getStravaAccessToken(
      repository,
      userId,
      config,
    )
    await getLoggedInAthleteActivities({
      query: {
        per_page: 1,
      },
      auth: stravaAccessToken,
    })
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
  config: StravaOAuthConfig,
) {
  const stravaAccessToken = await getStravaAccessToken(
    repository,
    userId,
    config,
  )
  const activity = await getActivityById({
    path: { id: activityId },
    query: {
      include_all_efforts: false,
    },
    auth: stravaAccessToken,
  })
  return stravaActivitySchema.parse(activity)
}

export async function fetchStravaActivityGeoJson(
  repository: ReturnType<typeof createRepository>,
  activityId: number,
  userId: number,
  config: StravaOAuthConfig,
) {
  const stravaAccessToken = await getStravaAccessToken(
    repository,
    userId,
    config,
  )
  const activityStreams = stravaActivityStreamsSchema.parse(
    await getActivityStreams({
      path: { id: activityId },
      query: {
        keys: ['latlng', 'time', 'heartrate'],
        key_by_type: true,
      },
      auth: stravaAccessToken,
    }),
  )

  const activity = await fetchStravaActivity(
    repository,
    activityId,
    userId,
    config,
  )
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
  stravaOAuth: StravaOAuthConfig
}

export async function fetchCompletePost(
  repository: ReturnType<typeof createRepository>,
  { postId, stravaOAuth }: FetchCompletePostArgs,
) {
  {
    const post = await repository.getPostById(postId)

    if (!post) {
      console.error(`post.fetchComplete: post ${postId} not found`)
      return
    }

    if (post.status === 'COMPLETED' && post.geoJson) {
      return { post }
    }

    await repository.updatePostStatus(post.id, 'PROCESSING')

    const geoJson = await fetchStravaActivityGeoJson(
      repository,
      parseInt(post.key),
      post.userId,
      stravaOAuth,
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
      stravaOAuth,
    )

    await repository.updatePostComplete({
      id: post.id,
      geoJson,
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

    await repository.updatePostStatus(post.id, 'COMPLETED')
    const updatedPost = await repository.getPostById(post.id)

    return { post: updatedPost }
  }
}
