import type { ZodSchema } from 'zod';
import { badRequest } from './http.js';

/** Parse + validate data with a zod schema, throwing a 400 HttpError on failure. */
export function parse<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}
