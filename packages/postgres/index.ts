import postgres from 'postgres'

import * as postRepo from './repository/post'
import * as fieldRepo from './repository/field'

import * as userRepo from './repository/user'
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

    getUserByAuth0Sub: (
      auth0Sub: Parameters<typeof userRepo.getUserByAuth0Sub>[1],
    ) => userRepo.getUserByAuth0Sub(sql, auth0Sub),
    getUserByEmail: (email: Parameters<typeof userRepo.getUserByEmail>[1]) =>
      userRepo.getUserByEmail(sql, email),
    createUserFromAuthSession: (
      authUser: Parameters<typeof userRepo.createUserFromAuthSession>[1],
    ) => userRepo.createUserFromAuthSession(sql, authUser),
  }
}
