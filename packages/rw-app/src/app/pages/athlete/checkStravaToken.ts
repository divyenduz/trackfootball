'use server'

import type { SocialLogin, User } from '@trackfootball/postgres'
import { checkStravaAccessToken } from '@trackfootball/service'
import { requestInfo } from 'rwsdk/worker'

export async function checkStravaToken(
  user: User & {
    socialLogin: SocialLogin[]
  },
) {
  const socialLogin = user.socialLogin.find(
    (entry) => entry.platform === 'STRAVA',
  )
  if (!socialLogin) {
    return 'NOT_CONNECTED' as const
  }

  const working = await checkStravaAccessToken(
    requestInfo.ctx.repository,
    user.id,
  )
  return working ? ('WORKING' as const) : ('NOT_WORKING' as const)
}
