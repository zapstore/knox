import { NSchema as n } from '@nostrify/nostrify';
import { assertEquals } from '@std/assert/equals';
import { produce } from 'immer';
import { getPublicKey } from 'nostr-tools';
import * as nip49 from 'nostr-tools/nip49';
import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { persist } from 'zustand/middleware';

interface KnoxKey {
  name: string;
  pubkey: string;
  ncryptsec: `ncryptsec1${string}`;
  inserted_at: Date;
}

const keySchema: z.ZodType<KnoxKey> = z.object({
  name: z.string(),
  pubkey: n.id(),
  ncryptsec: n.bech32('ncryptsec'),
  inserted_at: z.coerce.date(),
});

interface KnoxConnection {
  /** User pubkey. Events will be signed by this pubkey. */
  pubkey: string;
  /** Pubkey of the app authorized to sign events with this connection. */
  authorized_pubkey: string;
  /** Pubkey for this connection. Secret key is stored in the keyring. NIP-46 responses will be signed by this key. */
  bunker_ncryptsec: `ncryptsec1${string}`;
  /** List of relays to connect to. */
  relays: string[];
}

const connectionSchema: z.ZodType<KnoxConnection> = z.object({
  pubkey: n.id(),
  authorized_pubkey: n.id(),
  bunker_ncryptsec: n.bech32('ncryptsec'),
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
  private watcher?: Deno.FsWatcher;

  constructor(private path: string) {
    this.store = this.createStore();
    this.store.setState({}); // Create bunker.json if it doesn't exist
    this.watch();
  }

  createStore(): StoreApi<KnoxState> {
    return createStore<KnoxState>()(
      persist(
        (_setState) => ({
          keys: [],
          connections: [],
          version: 1,
        }),
        {
          name: this.path,
          version: 1,
          storage: {
            getItem(name) {
              const text = Deno.readTextFileSync(name);
              const state = stateSchema.parse(JSON.parse(text));

              return { state, version: state.version };
            },
            async setItem(name, { state }) {
              using file = await Deno.open(name, { write: true, create: true });
              await file.lock(true);

              const data = JSON.stringify(state, null, 2);
              const buffer = new TextEncoder().encode(data);

              const writer = file.writable.getWriter();
              await writer.write(buffer);
              await writer.close();
            },
            async removeItem(name) {
              await Deno.remove(name);
            },
          },
        },
      ),
    );
  }

  addKey(name: string, seckey: Uint8Array, password: string): void {
    const pubkey = getPublicKey(seckey);
    const ncryptsec = nip49.encrypt(seckey, password);

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
          ncryptsec,
          inserted_at: new Date(),
        });
      });
    });
  }

  /** Connect to a bunker using the authorization secret. */
  connect(connection: KnoxConnection): void {
    this.store.setState((state) => {
      return produce(state, (draft) => {
        draft.connections.push(connection);
      });
    });
  }

  private async watch() {
    // Wait for file to be ready.
    while (!this.watcher) {
      try {
        this.watcher = Deno.watchFs(this.path);
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }

    for await (const event of this.watcher) {
      if (event.kind === 'modify') {
        const text = await Deno.readTextFile(this.path);
        const state = stateSchema.parse(JSON.parse(text));
        try {
          const { keys, connections, version } = this.store.getState();
          assertEquals(state, { keys, connections, version });
        } catch {
          this.store.setState(state);
        }
      }
    }
  }

  subscribe(listener: (state: KnoxState, prevState: KnoxState) => void): () => void {
    return this.store.subscribe(listener);
  }

  close(): void {
    this.watcher?.close();
  }

  [Symbol.dispose]() {
    this.close();
  }
}
