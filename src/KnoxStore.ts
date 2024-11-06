import { NSchema as n } from '@nostrify/nostrify';
import { produce } from 'immer';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { BunkerCrypt } from './BunkerCrypt.ts';
import { BunkerError } from './BunkerError.ts';
import { ScrambledBytes } from './ScrambledBytes.ts';

const scrambledBytesSchema = z.custom<ScrambledBytes>((value) => value instanceof ScrambledBytes);

interface KnoxKey {
  name: string;
  sec: ScrambledBytes;
  created_at: Date;
}

const keySchema: z.ZodType<KnoxKey> = z.object({
  name: z.string(),
  sec: scrambledBytesSchema,
  created_at: z.coerce.date(),
});

interface KnoxAuthorization {
  key_name: string;
  secret: string;
  relays: string[];
  authorized_pubkeys: string[];
  max_uses?: number;
  bunker_sec: ScrambledBytes;
  created_at: Date;
  expires_at?: Date;
}

const authorizationSchema: z.ZodType<KnoxAuthorization> = z.object({
  key_name: z.string(),
  secret: z.string(),
  relays: z.string().url().array(),
  authorized_pubkeys: n.id().array(),
  max_uses: z.number().positive().int().optional(),
  bunker_sec: scrambledBytesSchema,
  created_at: z.coerce.date(),
  expires_at: z.coerce.date().optional(),
});

interface KnoxState {
  keys: KnoxKey[];
  authorizations: KnoxAuthorization[];
  version: number;
}

const stateSchema: z.ZodType<KnoxState> = z.object({
  keys: keySchema.array(),
  authorizations: authorizationSchema.array(),
  version: z.number().positive(),
});

export class KnoxStore {
  private store: StoreApi<KnoxState>;

  constructor(private file: Deno.FsFile, private crypt: BunkerCrypt) {
    this.store = this.createStore();
  }

  createStore(): StoreApi<KnoxState> {
    return createStore<KnoxState>()(
      () => ({
        keys: [],
        authorizations: [],
        version: 1,
      }),
    );
  }

  addKey(name: string, sec: Uint8Array): void {
    for (const key of this.getState().keys) {
      if (key.name === name) {
        throw new BunkerError(`Key "${name}" already exists.`);
      }
    }

    this.store.setState((state) => {
      return produce(state, (draft) => {
        draft.keys.push({
          name,
          sec: new ScrambledBytes(sec),
          created_at: new Date(),
        });
      });
    });
  }

  listKeys(): KnoxKey[] {
    return this.getState().keys;
  }

  getKey(name: string): KnoxKey | undefined {
    return this.getState().keys.find((key) => key.name === name);
  }

  generateUri(opts: { name: string; relays: string[]; maxUses?: number; expiresAt?: Date }): URL {
    const key = this.getState().keys.find((key) => key.name === opts.name);
    if (!key) {
      throw new BunkerError(`Key "${opts.name}" not found.`);
    }

    const secret = crypto.randomUUID();

    const bunkerSeckey = generateSecretKey();
    const bunkerPubkey = getPublicKey(bunkerSeckey);

    const authorization: KnoxAuthorization = {
      key_name: key.name,
      secret,
      relays: opts.relays,
      authorized_pubkeys: [],
      bunker_sec: new ScrambledBytes(bunkerSeckey),
      created_at: new Date(),
      expires_at: opts.expiresAt,
      max_uses: opts.maxUses,
    };

    const uri = new URL(`bunker://${bunkerPubkey}`);

    for (const relay of opts.relays) {
      uri.searchParams.append('relay', relay);
    }

    uri.searchParams.set('secret', secret);

    this.store.setState((state) => {
      return produce(state, (draft) => {
        draft.authorizations.push(authorization);
      });
    });

    return uri;
  }

  authorize(pubkey: string, secret: string): void {
    this.store.setState((state) => {
      return produce(state, (draft) => {
        const authorization = draft.authorizations.find((auth) => auth.secret === secret);
        authorization?.authorized_pubkeys.push(pubkey);
      });
    });
  }

  getAuthorizations(): KnoxAuthorization[] {
    return this.getState().authorizations;
  }

  getState(): KnoxState {
    return this.store.getState();
  }

  /** Low-level function to read the bunker file. */
  static async readBunker(file: Deno.FsFile, crypt: BunkerCrypt): Promise<KnoxState> {
    const response = new Response(file.readable);
    const buffer = await response.arrayBuffer();

    const enc = new Uint8Array(buffer);
    const dec = crypt.decrypt(enc);

    const text = new TextDecoder().decode(dec);
    const data = JSON.parse(text, KnoxStore.reviver);

    return stateSchema.parse(data);
  }

  /** Low-level function to write the bunker file. */
  static async writeBunker(file: Deno.FsFile, state: KnoxState, crypt: BunkerCrypt): Promise<void> {
    const data = JSON.stringify(state, KnoxStore.replacer, 2);
    const dec = new TextEncoder().encode(data);
    const enc = crypt.encrypt(dec);

    const writer = file.writable.getWriter();
    await file.truncate();
    await writer.write(enc);
    await writer.close();
  }

  async load(): Promise<void> {
    const state = await KnoxStore.readBunker(this.file, this.crypt);
    this.store.setState(state);
  }

  async save(): Promise<void> {
    const state = this.getState();
    await KnoxStore.writeBunker(this.file, state, this.crypt);
  }

  private static reviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('nsec1')) {
      const { data: bytes } = nip19.decode(value as `nsec1${string}`);
      return new ScrambledBytes(bytes);
    }

    return value;
  }

  private static replacer(_key: string, value: unknown): unknown {
    if (value instanceof ScrambledBytes) {
      using bytes = value.unscramble();
      return nip19.nsecEncode(bytes);
    }

    return value;
  }

  listen(
    listener: (state: KnoxState, prevState: KnoxState) => void,
    opts?: { signal?: AbortSignal },
  ): { close: () => void; [Symbol.dispose]: () => void } {
    const close = this.store.subscribe(listener);
    opts?.signal?.addEventListener('abort', onClose);

    function onClose() {
      opts?.signal?.removeEventListener('abort', onClose);
      close();
    }

    return {
      close,
      [Symbol.dispose]: close,
    };
  }
}
