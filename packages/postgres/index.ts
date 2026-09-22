import postgres from 'postgres'

import * as postRepo from './repository/post'
import * as fieldRepo from './repository/field'

import * as userRepo from './repository/user'
import * as stravaWebhookEventRepo from './repository/stravaWebhookEvent'
import * as socialLoginRepo from './repository/socialLogin'
export * from './types'

export function getSql(connectionString: string) {
  const sql = postgres(connectionString, {
    max: 10,
  })
  return sql
}

export function createRepository(sql: ReturnType<typeof postgres>) {
  return {
    createPost: (input: Parameters<typeof postRepo.createPost>[1]) =>
      postRepo.createPost(sql, input),

    getPostById: (id: Parameters<typeof postRepo.getPostById>[1]) =>
      postRepo.getPostById(sql, id),
    getPostWithUserAndFields: (
      id: Parameters<typeof postRepo.getPostWithUserAndFields>[1],
    ) => postRepo.getPostWithUserAndFields(sql, id),
    getPostByStravaId: (
      stravaId: Parameters<typeof postRepo.getPostByStravaId>[1],
    ) => postRepo.getPostByStravaId(sql, stravaId),
    getPostByStravaIdForUser: (
      stravaId: Parameters<typeof postRepo.getPostByStravaIdForUser>[1],
      userId: Parameters<typeof postRepo.getPostByStravaIdForUser>[2],
    ) => postRepo.getPostByStravaIdForUser(sql, stravaId, userId),
    updatePostTitle: (
      stravaId: Parameters<typeof postRepo.updatePostTitle>[1],
      title: Parameters<typeof postRepo.updatePostTitle>[2],
    ) => postRepo.updatePostTitle(sql, stravaId, title),
    updatePostTitleForUser: (
      stravaId: Parameters<typeof postRepo.updatePostTitleForUser>[1],
      userId: Parameters<typeof postRepo.updatePostTitleForUser>[2],
      title: Parameters<typeof postRepo.updatePostTitleForUser>[3],
    ) => postRepo.updatePostTitleForUser(sql, stravaId, userId, title),
    deletePostBy: (stravaId: Parameters<typeof postRepo.deletePostBy>[1]) =>
      postRepo.deletePostBy(sql, stravaId),
    deletePostByStravaIdForUser: (
      stravaId: Parameters<typeof postRepo.deletePostByStravaIdForUser>[1],
      userId: Parameters<typeof postRepo.deletePostByStravaIdForUser>[2],
    ) => postRepo.deletePostByStravaIdForUser(sql, stravaId, userId),
    getFeed: (
      cursor?: Parameters<typeof postRepo.getFeed>[1],
      limit?: Parameters<typeof postRepo.getFeed>[2],
    ) => postRepo.getFeed(sql, cursor, limit),
    updatePostFieldId: (
      postId: Parameters<typeof postRepo.updatePostFieldId>[1],
      fieldId: Parameters<typeof postRepo.updatePostFieldId>[2],
    ) => postRepo.updatePostFieldId(sql, postId, fieldId),
    getPostByIdWithoutField: (
      postId: Parameters<typeof postRepo.getPostByIdWithoutField>[1],
    ) => postRepo.getPostByIdWithoutField(sql, postId),
    updatePostStatus: (
      postId: Parameters<typeof postRepo.updatePostStatus>[1],
      status: Parameters<typeof postRepo.updatePostStatus>[2],
    ) => postRepo.updatePostStatus(sql, postId, status),
    updatePostComplete: (
      input: Parameters<typeof postRepo.updatePostComplete>[1],
    ) => postRepo.updatePostComplete(sql, input),

    getFieldsByUsage: (
      usage: Parameters<typeof fieldRepo.getFieldsByUsage>[1],
    ) => fieldRepo.getFieldsByUsage(sql, usage),
    getFieldsByName: (name: Parameters<typeof fieldRepo.getFieldsByName>[1]) =>
      fieldRepo.getFieldsByName(sql, name),

    getUser: (id: Parameters<typeof userRepo.getUser>[1]) =>
      userRepo.getUser(sql, id),

    getUserStravaSocialLogin: (
      userId: Parameters<typeof userRepo.getUserStravaSocialLogin>[1],
    ) => userRepo.getUserStravaSocialLogin(sql, userId),
    getUserBy: (where: Parameters<typeof userRepo.getUserBy>[1]) =>
      userRepo.getUserBy(sql, where),
    getUserByAuth0Sub: (
      auth0Sub: Parameters<typeof userRepo.getUserByAuth0Sub>[1],
    ) => userRepo.getUserByAuth0Sub(sql, auth0Sub),
    getUserByEmail: (email: Parameters<typeof userRepo.getUserByEmail>[1]) =>
      userRepo.getUserByEmail(sql, email),
    createUserFromAuthSession: (
      authUser: Parameters<typeof userRepo.createUserFromAuthSession>[1],
    ) => userRepo.createUserFromAuthSession(sql, authUser),
    deleteStravaSocialLogin: (
      userId: Parameters<typeof userRepo.deleteStravaSocialLogin>[1],
    ) => userRepo.deleteStravaSocialLogin(sql, userId),

    createStravaWebhookEvent: (
      input: Parameters<
        typeof stravaWebhookEventRepo.createStravaWebhookEvent
      >[1],
    ) => stravaWebhookEventRepo.createStravaWebhookEvent(sql, input),
    updateStravaWebhookEventStatus: (
      id: Parameters<
        typeof stravaWebhookEventRepo.updateStravaWebhookEventStatus
      >[1],
      status: Parameters<
        typeof stravaWebhookEventRepo.updateStravaWebhookEventStatus
      >[2],
    ) => stravaWebhookEventRepo.updateStravaWebhookEventStatus(sql, id, status),
    deleteStravaWebhookEvent: (
      id: Parameters<typeof stravaWebhookEventRepo.deleteStravaWebhookEvent>[1],
    ) => stravaWebhookEventRepo.deleteStravaWebhookEvent(sql, id),
    getRetryableStravaWebhookEvents: (
      limit: Parameters<
        typeof stravaWebhookEventRepo.getRetryableStravaWebhookEvents
      >[1],
    ) => stravaWebhookEventRepo.getRetryableStravaWebhookEvents(sql, limit),
    claimStravaWebhookEvent: (
      id: Parameters<typeof stravaWebhookEventRepo.claimStravaWebhookEvent>[1],
      claim: Parameters<
        typeof stravaWebhookEventRepo.claimStravaWebhookEvent
      >[2],
    ) => stravaWebhookEventRepo.claimStravaWebhookEvent(sql, id, claim),
    completeClaimedStravaWebhookEvent: (
      id: Parameters<
        typeof stravaWebhookEventRepo.completeClaimedStravaWebhookEvent
      >[1],
      claim: Parameters<
        typeof stravaWebhookEventRepo.completeClaimedStravaWebhookEvent
      >[2],
    ) =>
      stravaWebhookEventRepo.completeClaimedStravaWebhookEvent(sql, id, claim),
    failClaimedStravaWebhookEvent: (
      id: Parameters<
        typeof stravaWebhookEventRepo.failClaimedStravaWebhookEvent
      >[1],
      claim: Parameters<
        typeof stravaWebhookEventRepo.failClaimedStravaWebhookEvent
      >[2],
      failure: Parameters<
        typeof stravaWebhookEventRepo.failClaimedStravaWebhookEvent
      >[3],
      terminal: Parameters<
        typeof stravaWebhookEventRepo.failClaimedStravaWebhookEvent
      >[4],
    ) =>
      stravaWebhookEventRepo.failClaimedStravaWebhookEvent(
        sql,
        id,
        claim,
        failure,
        terminal,
      ),
    findStravaWebhookEventByActivityId: (
      activityId: Parameters<
        typeof stravaWebhookEventRepo.findStravaWebhookEventByActivityId
      >[1],
    ) =>
      stravaWebhookEventRepo.findStravaWebhookEventByActivityId(
        sql,
        activityId,
      ),

    updateSocialLoginTokens: (
      platformId: Parameters<typeof socialLoginRepo.updateSocialLoginTokens>[1],
      accessToken: Parameters<
        typeof socialLoginRepo.updateSocialLoginTokens
      >[2],
      refreshToken: Parameters<
        typeof socialLoginRepo.updateSocialLoginTokens
      >[3],
      expiresAt: Parameters<typeof socialLoginRepo.updateSocialLoginTokens>[4],
    ) =>
      socialLoginRepo.updateSocialLoginTokens(
        sql,
        platformId,
        accessToken,
        refreshToken,
        expiresAt,
      ),
    upsertSocialLogin: (
      input: Parameters<typeof socialLoginRepo.upsertSocialLogin>[1],
    ) => socialLoginRepo.upsertSocialLogin(sql, input),
  }
}
