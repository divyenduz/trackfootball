/*
 * TODO: Introduce branded ID types to prevent mixing up entity IDs.
 *
 * Previously, Kanel-generated types used branded types to distinguish IDs:
 *   type UserId = number & { __brand: 'public.User' }
 *   type PostId = number & { __brand: 'public.Post' }
 * This prevented passing a UserId where a PostId was expected at compile time.
 *
 * Currently, all IDs are plain z.number() which means any number is assignable
 * to any entity's id field — e.g. repo.getPostById(user.id) compiles fine.
 *
 * Zod supports this via .brand():
 *   export const postIdSchema = z.number().int().positive().brand<'PostId'>()
 *   export type PostId = z.infer<typeof postIdSchema>
 *   // PostId = number & { [z.BRAND]: 'PostId' }
 *
 * Migration approach:
 * 1. Define branded schemas (postIdSchema, userIdSchema, fieldIdSchema, etc.)
 * 2. Use branded types in repository function signatures (highest leverage):
 *      getPostById(sql, id: PostId) instead of id: number
 * 3. Brand FK fields on entity schemas (Post.userId -> userIdSchema, Post.fieldId -> fieldIdSchema)
 * 4. Parse external inputs (HTTP params, webhook payloads) with branded schemas:
 *      const postId = postIdSchema.parse(Number(req.params.id))
 * 5. For DB-returned rows, either cast (post.id as PostId) or parse full rows
 *
 * The brand is a no-op at runtime (no wrapping), so the only cost is migration.
 */

import type { FeatureCollection, LineString } from 'geojson'
import { z } from 'zod'

const positionSchema = z.array(z.number()).min(2)

const lineStringGeometrySchema = z
  .object({
    type: z.literal('LineString'),
    coordinates: z.array(positionSchema).min(2),
    bbox: z.array(z.number()).optional(),
  })
  .passthrough()

const lineStringFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    geometry: lineStringGeometrySchema,
    properties: z.record(z.string(), z.unknown()).nullable().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    bbox: z.array(z.number()).optional(),
  })
  .passthrough()

export const featureCollectionLineStringSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(lineStringFeatureSchema),
    bbox: z.array(z.number()).optional(),
  })
  .passthrough() as unknown as z.ZodType<FeatureCollection<LineString>>

export const platformSchema = z.enum(['STRAVA'])
export type Platform = z.infer<typeof platformSchema>

export const postTypeSchema = z.enum(['STRAVA_ACTIVITY'])
export type PostType = z.infer<typeof postTypeSchema>

export const postStatusSchema = z.enum([
  'ERROR',
  'COMPLETED',
  'PROCESSING',
  'INIT',
])
export type PostStatus = z.infer<typeof postStatusSchema>

export const fieldUsageSchema = z.enum([
  'TOP_HALF',
  'BOTTOM_HALF',
  'FULL_FIELD',
])
export type FieldUsage = z.infer<typeof fieldUsageSchema>

export const userTypeSchema = z.enum(['USER', 'ADMIN'])
export type UserType = z.infer<typeof userTypeSchema>

export const userSchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  locale: z.string(),
  picture: z.string().nullable(),
  auth0Sub: z.string().nullable(),
  emailVerified: z.boolean(),
  type: userTypeSchema,
})
export type User = z.infer<typeof userSchema>

export const publicUserSchema = userSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  picture: true,
})
export type PublicUser = z.infer<typeof publicUserSchema>

export const fieldSchema = z.object({
  id: z.number(),
  name: z.string(),
  topLeft: z.array(z.number()),
  topRight: z.array(z.number()),
  bottomRight: z.array(z.number()),
  bottomLeft: z.array(z.number()),
  city: z.string(),
  usage: fieldUsageSchema,
  address: z.string().nullable(),
  zoom: z.number(),
})
export type Field = z.infer<typeof fieldSchema>

export const socialLoginSchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  platform: platformSchema,
  platformId: z.string(),
  platformMeta: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  userId: z.number(),
  expiresAt: z.coerce.date().nullable(),
  platformScope: z.string(),
})
export type SocialLogin = z.infer<typeof socialLoginSchema>

export const stravaWebhookEventStatusSchema = z.enum([
  'PENDING',
  'ERRORED',
  'COMPLETED',
])
export type StravaWebhookEventStatus = z.infer<
  typeof stravaWebhookEventStatusSchema
>

export const stravaWebhookEventSchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  status: stravaWebhookEventStatusSchema,
  body: z.string(),
  errors: z.array(z.string()).nullable(),
})
export type StravaWebhookEvent = z.infer<typeof stravaWebhookEventSchema>

export const postSchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  type: postTypeSchema,
  text: z.string(),
  key: z.string(),
  geoJson: featureCollectionLineStringSchema.nullable(),
  totalDistance: z.number(),
  elapsedTime: z.number(),
  totalSprintTime: z.number(),
  maxSpeed: z.number(),
  averageSpeed: z.number(),
  userId: z.number(),
  sprints: z.array(featureCollectionLineStringSchema),
  runs: z.array(featureCollectionLineStringSchema),
  startTime: z.coerce.date().nullable(),
  fieldId: z.number().nullable(),
  image: z.string().nullable(),
  halfTime: z.number(),
  status: postStatusSchema,
  statusInfo: z.string(),
})
export type Post = z.infer<typeof postSchema>

export type StravaWebhookEventSerializable = Omit<
  StravaWebhookEvent,
  'createdAt' | 'updatedAt' | 'errors'
> & {
  createdAt: string
  updatedAt: string
  errors: string[] | null
}

export const serializeStravaWebhookEvent = (
  event: StravaWebhookEvent,
): StravaWebhookEventSerializable => ({
  ...event,
  createdAt: event.createdAt.toISOString(),
  updatedAt: event.updatedAt.toISOString(),
  errors: (event.errors ?? []).map((error) => {
    try {
      return JSON.stringify(error)
    } catch (stringifyError) {
      return String(error)
    }
  }),
})
