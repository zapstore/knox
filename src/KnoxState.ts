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
  relays: z.string().url().array(),
  pubkeys: n.id().array(),
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

export const stateSchema: z.ZodType<KnoxState> = z.object({
  keys: keySchema.array(),
  authorizations: authorizationSchema.array(),
  version: z.number().positive(),
});
