import { z } from 'zod'

const positiveIdSchema = z.number().int().positive()

const activityUpdatesSchema = z
  .object({
    title: z.string().optional(),
    type: z.string().optional(),
    private: z.enum(['true', 'false']).optional(),
  })
  .passthrough()

const stravaEventBaseSchema = z.object({
  object_id: positiveIdSchema,
  owner_id: positiveIdSchema,
  subscription_id: positiveIdSchema,
  event_time: z.number().int().nonnegative(),
})

const stravaActivityEventSchema = stravaEventBaseSchema.extend({
  object_type: z.literal('activity'),
  aspect_type: z.enum(['create', 'update', 'delete']),
  updates: activityUpdatesSchema.optional().default({}),
})

const stravaAthleteEventSchema = stravaEventBaseSchema
  .extend({
    object_type: z.literal('athlete'),
    aspect_type: z.literal('update'),
    updates: z.object({ authorized: z.literal('false') }).passthrough(),
  })
  .refine((event) => event.object_id === event.owner_id, {
    message: 'Athlete event object and owner must match',
  })

export const stravaEventSchema = z.discriminatedUnion('object_type', [
  stravaActivityEventSchema,
  stravaAthleteEventSchema,
])
export type StravaEvent = z.infer<typeof stravaEventSchema>

const tokenSchema = z.object({
  token_type: z.string(),
  expires_at: z.number().int().positive(),
  expires_in: z.number().int().nonnegative(),
  refresh_token: z.string().min(1),
  access_token: z.string().min(1),
})

export const tokenRefreshResponseSchema = tokenSchema
export const tokenExchangeResponseSchema = tokenSchema.extend({
  athlete: z.object({ id: positiveIdSchema }).passthrough(),
})

export const stravaActivitySchema = z
  .object({
    id: positiveIdSchema,
    athlete: z.object({ id: positiveIdSchema }).passthrough(),
    type: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    start_date: z.string().datetime().nullable().optional(),
    distance: z.number().nullable().optional(),
    elapsed_time: z.number().nullable().optional(),
    max_speed: z.number().nullable().optional(),
    average_speed: z.number().nullable().optional(),
    map: z
      .object({ polyline: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

const streamMetadataSchema = z.object({
  series_type: z.enum(['distance', 'time']).optional(),
  original_size: z.number().int().nonnegative().optional(),
  resolution: z.enum(['low', 'medium', 'high']).optional(),
})

export const stravaActivityStreamsSchema = z
  .object({
    latlng: streamMetadataSchema.extend({
      data: z.array(z.tuple([z.number(), z.number()])).min(2),
    }),
    time: streamMetadataSchema.extend({
      data: z.array(z.number().nonnegative()).min(2),
    }),
    heartrate: streamMetadataSchema
      .extend({ data: z.array(z.number().nonnegative()) })
      .optional(),
  })
  .passthrough()
