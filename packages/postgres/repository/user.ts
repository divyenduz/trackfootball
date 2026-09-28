import type { User } from '../types'
import { Sql } from 'postgres'
import invariant from 'tiny-invariant'

export async function getUser(sql: Sql, id: number): Promise<User | null> {
  const users: User[] = await sql`SELECT * FROM "User" WHERE "id" = ${id}`
  return users[0] || null
}

export async function getUserByAuth0Sub(
  sql: Sql,
  auth0Sub: string,
): Promise<User | null> {
  const users: User[] = await sql`
  SELECT * FROM "User"
  WHERE "User"."auth0Sub" = ${auth0Sub}
  `
  return users[0] || null
}

export async function getUserByEmail(
  sql: Sql,
  email: string,
): Promise<User | null> {
  const users: User[] = await sql`
  SELECT * FROM "User"
  WHERE "User"."email" = ${email}
  `
  return users[0] || null
}

export async function createUserFromAuthSession(
  sql: Sql,
  authUser: {
    email: string
    name: string
    image?: string | null
  },
): Promise<User> {
  const firstName = authUser.name?.split(' ')[0] ?? null
  const lastName = authUser.name?.split(' ').slice(1).join(' ') ?? null
  const users: User[] = await sql`
    INSERT INTO "User" ("email", "firstName", "lastName", "picture", "locale", "emailVerified", "type", "createdAt", "updatedAt")
    VALUES (${authUser.email}, ${firstName}, ${lastName}, ${authUser.image ?? null}, 'en', true, 'USER', NOW(), NOW())
    ON CONFLICT ("email") DO UPDATE SET "updatedAt" = NOW()
    RETURNING *
  `
  invariant(users[0], 'Failed to create user from auth session')
  return users[0]
}
