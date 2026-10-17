import { z } from 'zod';

/** Error envelope returned by every non-2xx response. */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const Id = z.string().min(1).max(64);
export const IsoDate = z.string().describe('ISO 8601 timestamp');

export const IdParams = z.object({ id: Id });

export const Ok = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof Ok>;

export const Page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
