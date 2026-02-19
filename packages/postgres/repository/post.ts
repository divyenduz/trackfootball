import { type Field, type Post, type PostType, type User } from '../types'
import type { FeatureCollection, LineString } from 'geojson'
import invariant from 'tiny-invariant'
import { Sql } from 'postgres'

const stringify = (value: number | string): string => {
  if (typeof value === 'number') {
    return value.toString()
  }
  return value
}

interface CreatePostInput {
  type: PostType
  key: string
  text: string
  userId: number
}

export async function createPost(sql: Sql, input: CreatePostInput) {
  const data = {
    ...input,
    updatedAt: sql`now()`,
  }

  const posts = await sql<Post[]>`
      INSERT INTO "Post" ${
        //@ts-expect-error
        sql(data)
      }
      ON CONFLICT ("key", "type") DO UPDATE SET
        "geoJson" = EXCLUDED."geoJson"
      RETURNING *
      `

  const post = posts[0]
  return post
}

async function getPostMeta(sql: Sql, id: number) {
  const postsMeta: Array<{
    number_of_coordinates: number
    max_heart_rate: number
    average_heart_rate: number
    number_of_sprints: number
    number_of_runs: number
  }> = await sql`
  WITH heart_rates AS (
    SELECT jsonb_array_elements_text("geoJson" -> 'features' -> 0 -> 'properties' -> 'heartRates')::int as heart_rate FROM "Post" WHERE id=${id}
  ),
  heart_rate_agg AS (
    SELECT max(heart_rate) AS max_heart_rate, floor(avg(heart_rate)) AS average_heart_rate FROM heart_rates
  ),
  post_data AS (
    SELECT
      jsonb_array_length("geoJson" -> 'features' -> 0 -> 'geometry' -> 'coordinates') as number_of_coordinates,
      jsonb_array_length("Post"."sprints") as number_of_sprints,
      jsonb_array_length("Post"."runs") as number_of_runs
    FROM "Post" WHERE id=${id}
  )
  SELECT max_heart_rate, average_heart_rate, number_of_coordinates, number_of_sprints, number_of_runs from heart_rate_agg, post_data;
    `
  const postMeta = postsMeta[0]

  return {
    numberOfCoordinates: postMeta?.number_of_coordinates || 0,
    maxHeartRate: postMeta?.max_heart_rate || 0,
    averageHeartRate: postMeta?.average_heart_rate || 0,
    numberOfSprints: postMeta?.number_of_sprints || 0,
    numberOfRuns: postMeta?.number_of_runs || 0,
  }
}

type TypedPost = Post & {
  geoJson: FeatureCollection<LineString>
  sprints: Array<FeatureCollection<LineString>>
  runs: Array<FeatureCollection<LineString>>
}

export async function getPostById(sql: Sql, id: number): Promise<Post | null> {
  const posts: Post[] = await sql`
    SELECT * FROM "Post"
    WHERE "id" = ${id}
    `
  return posts[0] || null
}

export async function getPostWithUserAndFields(sql: Sql, id: number) {
  const posts: TypedPost[] = await sql`
    SELECT * from "Post"
    WHERE "id" = ${id}
    `
  const post = posts[0]

  if (!post) {
    return null
  }

  const users: Array<Pick<User, 'id' | 'firstName' | 'lastName' | 'picture'>> =
    await sql`
    SELECT "id", "firstName", "lastName", "picture" from "User"
    WHERE "id" = ${post.userId}
    `
  const user = users[0]
  invariant(user, `expected post to have a user`)

  const fields: Field[] = await sql`
    SELECT * from "Field"
    WHERE "id" = ${post.fieldId}
    `
  const field = fields[0]

  const postWithData = {
    ...post,
    User: user,
    Field: field,
  }

  if (!postWithData) {
    return null
  }

  const postMeta = await getPostMeta(sql, id)
  return {
    ...postWithData!,
    ...postMeta,
  }
}

export async function getPostByStravaId(sql: Sql, stravaId: number) {
  const posts: TypedPost[] = await sql`
    SELECT * from "Post"
    WHERE "key" = ${stringify(stravaId)}
    `
  const post = posts[0]

  if (!post) {
    return null
  }

  return post
}

export async function updatePostTitle(
  sql: Sql,
  stravaId: number,
  title: string,
) {
  const posts: Post[] = await sql`
    UPDATE "Post"
    SET "text" = ${title}
    WHERE "key" = ${stringify(stravaId)}
    RETURNING *
    `
  const post = posts[0]

  return post
}

export async function deletePostBy(
  sql: Sql,
  stravaId: number,
): Promise<Post | null> {
  const key = `${stravaId}`
  const posts: Post[] = await sql`
    DELETE FROM "Post"
    WHERE "key" = ${key}
    RETURNING *
    `
  if (posts.length > 0) {
    const post = posts[0]
    invariant(post, 'expected post to exist')
    return post
  } else {
    return null
  }
}

type FeedItemType = Omit<Post, 'geoJson' | 'sprints' | 'runs'> & {
  Field: Field
  User: User
}

export async function getFeed(
  sql: Sql,
  cursor: number = 0,
  limit: number = 20,
) {
  const maxPostIds: { max: number }[] = await sql`SELECT MAX("id") FROM "Post"`
  const maxPostId = maxPostIds[0]
  invariant(maxPostId, `expected maxPostId to exist`)
  const maxPostIdValue = maxPostId.max

  const posts: FeedItemType[] = await sql`
    SELECT row_to_json("Field".*::"Field") as "Field", row_to_json("User".*::"User") as "User", 
    "Post"."id", "Post"."createdAt", "Post"."updatedAt", "Post"."type", "Post"."text", "Post"."key", "Post"."totalDistance", "Post"."elapsedTime", "Post"."totalSprintTime", "Post"."maxSpeed", "Post"."averageSpeed", "Post"."userId", "Post"."startTime", "Post"."fieldId", "Post"."image", "Post"."halfTime", "Post"."status", "Post"."statusInfo" FROM "Post"
    LEFT JOIN "Field" ON "Post"."fieldId" = "Field"."id"
    INNER JOIN "User" ON "Post"."userId" = "User"."id"
    WHERE "Post"."id" <= ${cursor || maxPostIdValue}
    ORDER BY "Post"."startTime" DESC
    LIMIT ${limit + 1}
    `

  let nextCursor: typeof cursor | null = null
  if (posts.length > limit) {
    const nextItem = posts.pop()
    nextCursor = nextItem!.id
  }

  return { posts, nextCursor }
}

export async function updatePostFieldId(
  sql: Sql,
  postId: number,
  fieldId: number,
): Promise<Post | null> {
  const posts: Post[] = await sql`
    UPDATE "Post"
    SET "fieldId" = ${fieldId}
    WHERE "id" = ${postId}
    RETURNING *
  `
  if (posts.length > 0) {
    const post = posts[0]
    invariant(post, 'expected post to exist')
    return post
  } else {
    return null
  }
}

export async function getPostByIdWithoutField(
  sql: Sql,
  postId: number,
): Promise<Post | null> {
  const posts: Post[] = await sql`
    SELECT * FROM "Post"
    WHERE "id" = ${postId} AND "fieldId" IS NULL
  `
  return posts[0] || null
}

export async function updatePostStatus(
  sql: Sql,
  postId: number,
  status: string,
): Promise<void> {
  await sql`
    UPDATE "Post"
    SET "status" = ${status}
    WHERE "id" = ${postId}
  `
}

interface UpdatePostCompleteInput {
  id: number
  geoJson: any
  totalDistance: number
  startTime: Date
  elapsedTime: number
  totalSprintTime: number
  sprints: any
  runs: any
  maxSpeed: number
  averageSpeed: number
}

export async function updatePostComplete(
  sql: Sql,
  input: UpdatePostCompleteInput,
): Promise<Post | null> {
  const posts: Post[] = await sql`
    WITH PostModified AS (
      UPDATE "Post"
      SET "status" = 'COMPLETED',
      "geoJson" = ${input.geoJson},
      "totalDistance" = ${input.totalDistance},
      "startTime" = ${input.startTime},
      "elapsedTime" = ${input.elapsedTime},
      "totalSprintTime" = ${input.totalSprintTime},
      "sprints" = ${input.sprints},
      "runs" = ${input.runs},
      "maxSpeed" = ${input.maxSpeed},
      "averageSpeed" = ${input.averageSpeed}
      WHERE "id" = ${input.id}
      RETURNING *
    )
    SELECT * FROM PostModified
  `
  return posts[0] ?? null
}
