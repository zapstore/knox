import { NSchema as n } from '@nostrify/nostrify';
import { produce } from 'immer';
import { getPublicKey } from 'nostr-tools';
import * as nip49 from 'nostr-tools/nip49';
import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { decrypt, encrypt } from './crypto.ts';

interface KnoxKey {
  name: string;
  pubkey: string;
  sec: `ncryptsec1${string}`;
  inserted_at: Date;
}

const keySchema: z.ZodType<KnoxKey> = z.object({
  name: z.string(),
  pubkey: n.id(),
  sec: n.bech32('ncryptsec'),
  inserted_at: z.coerce.date(),
});

interface KnoxConnection {
  /** User pubkey. Events will be signed by this pubkey. */
  pubkey: string;
  /** Pubkey of the app authorized to sign events with this connection. */
  authorized_pubkey: string;
  /** Pubkey for this connection. Secret key is stored in the keyring. NIP-46 responses will be signed by this key. */
  bunker_sec: `ncryptsec1${string}`;
  /** List of relays to connect to. */
  relays: string[];
}

const connectionSchema: z.ZodType<KnoxConnection> = z.object({
  pubkey: n.id(),
  authorized_pubkey: n.id(),
  bunker_sec: n.bech32('ncryptsec'),
  relays: z.string().url().array(),
});

interface KnoxState {
  keys: KnoxKey[];
  connections: KnoxConnection[];
  version: number;
}

const stateSchema: z.ZodType<KnoxState> = z.object({
  keys: keySchema.array(),
  connections: connectionSchema.array(),
  version: z.number().positive(),
});

export class KnoxStore {
  private store: StoreApi<KnoxState>;
  #passphrase: string;

  constructor(private path: string, passphrase: string) {
    this.#passphrase = passphrase;
    this.store = this.createStore();
  }

  createStore(): StoreApi<KnoxState> {
    return createStore<KnoxState>()(
      () => ({
        keys: [],
        connections: [],
        version: 1,
      }),
    );
  }

  addKey(name: string, seckey: Uint8Array, password: string): void {
    const pubkey = getPublicKey(seckey);
    const sec = nip49.encrypt(seckey, password);

    for (const key of this.store.getState().keys) {
      if (key.name === name) {
        throw new Error(`Secret key with name "${name}" already exists.`);
      }
      if (key.pubkey === pubkey) {
        throw new Error(`Secret key with pubkey "${key.pubkey}" already exists.`);
      }
    }

    this.store.setState((state) => {
      return produce(state, (draft) => {
        draft.keys.push({
          name,
          pubkey,
          sec,
          inserted_at: new Date(),
        });
      });
    });
  }

  static async createNew(path: string, passphrase: string): Promise<KnoxStore> {
    const store = new KnoxStore(path, passphrase);
    await store.save({ write: true, createNew: true });

    return store;
  }

  async load(opts?: Deno.ReadFileOptions): Promise<void> {
    const enc = await Deno.readFile(this.path, opts);
    const dec = decrypt(enc, this.#passphrase);
    const text = new TextDecoder().decode(dec);
    const state = stateSchema.parse(JSON.parse(text));

    this.store.setState(state);
  }

  async save(opts?: Deno.OpenOptions): Promise<void> {
    using file = await Deno.open(this.path, opts);
    await file.lock(true);

    const state = this.store.getState();
    const data = JSON.stringify(state, null, 2);
    const dec = new TextEncoder().encode(data);
    const enc = encrypt(dec, this.#passphrase);

    const writer = file.writable.getWriter();
    await writer.write(enc);
    await writer.close();
  }

  /** Connect to a bunker using the authorization secret. */
  connect(connection: KnoxConnection): void {
    this.store.setState((state) => {
      return produce(state, (draft) => {
        draft.connections.push(connection);
      });
    });
  }

  listen(listener: (state: KnoxState, prevState: KnoxState) => void): () => void {
    return this.store.subscribe(listener);
  }

  close(): void {
  }

  [Symbol.dispose]() {
    this.close();
  }
}
