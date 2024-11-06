import { NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { ScrambledBytes } from './ScrambledBytes.ts';

const scrambledBytesSchema = z.custom<ScrambledBytes>((value) => value instanceof ScrambledBytes);

export interface KnoxKey {
  name: string;
  sec: ScrambledBytes;
  created_at: Date;
}

const keySchema: z.ZodType<KnoxKey> = z.object({
  name: z.string(),
  sec: scrambledBytesSchema,
  created_at: z.coerce.date(),
});

export interface KnoxAuthorization {
  key: string;
  secret: string;
  relays: string[];
  pubkeys: string[];
  max_uses?: number;
  bunker_sec: ScrambledBytes;
  created_at: Date;
  expires_at?: Date;
}

const authorizationSchema: z.ZodType<KnoxAuthorization> = z.object({
  key: z.string(),
  secret: z.string(),
  relays: z.string().url().array().transform((relays) => [...new Set(relays)]),
  pubkeys: n.id().array().transform((pubkeys) => [...new Set(pubkeys)]),
  max_uses: z.number().positive().int().optional(),
  bunker_sec: scrambledBytesSchema,
  created_at: z.coerce.date(),
  expires_at: z.coerce.date().optional(),
});

export interface KnoxState {
  keys: KnoxKey[];
  authorizations: KnoxAuthorization[];
  version: number;
}

export const stateSchema: z.ZodType<KnoxState, z.ZodTypeDef, unknown> = z.object({
  keys: filteredArray(keySchema),
  authorizations: filteredArray(authorizationSchema),
  version: z.number().positive(),
}).transform((state) => {
  // Remove keys with duplicate names.
  const keyNames = new Set<string>();
  state.keys = state.keys.filter((key) => {
    if (keyNames.has(key.name)) {
      return false;
    }
    keyNames.add(key.name);
    return true;
  });

  // Remove invalid authorizations.
  state.authorizations = state.authorizations.filter((auth) => {
    // Remove expired authorizations.
    if (auth.expires_at && auth.expires_at < new Date()) {
      return false;
    }
    // Remove authorizations with missing keys.
    const key = state.keys.find((key) => key.name === auth.key);
    if (!key) {
      return false;
    }
    return true;
  });

  return state;
});

/** Validates individual items in an array, dropping any that aren't valid. */
function filteredArray<T extends z.ZodTypeAny>(schema: T) {
  return z.any().array().catch([])
    .transform((arr) => (
      arr.map((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? parsed.data : undefined;
      }).filter((item): item is z.infer<T> => Boolean(item))
    ));
}
