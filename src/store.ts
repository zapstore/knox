import { NSchema as n } from '@nostrify/nostrify';
import { assertEquals } from '@std/assert/equals';
import { produce } from 'immer';
import { z } from 'zod';
import { createStore } from 'zustand/vanilla';
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

interface KnoxActions {
  connect(connection: KnoxConnection): void;
}

export const store = createStore<KnoxState & KnoxActions>()(
  persist(
    (setState) => ({
      keys: [],
      connections: [],
      version: 1,

      /** Connect to a bunker using the authorization secret. */
      connect(connection: KnoxConnection): void {
        setState((state) => {
          return produce(state, (draft) => {
            draft.connections.push(connection);
          });
        });
      },
    }),
    {
      name: 'bunker.json',
      version: 1,
      storage: {
        async getItem(name) {
          const text = await Deno.readTextFile(name);
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

async function watch() {
  const watcher = Deno.watchFs('bunker.json');

  for await (const event of watcher) {
    if (event.kind === 'modify') {
      const text = await Deno.readTextFile('bunker.json');
      const state = stateSchema.parse(JSON.parse(text));
      try {
        const { keys, connections, version } = store.getState();
        assertEquals(state, { keys, connections, version });
      } catch {
        store.setState(state);
      }
    }
  }
}

store.setState({}); // Create bunker.json if it doesn't exist
watch();

store.subscribe((state, _prevState) => {
  console.log('State changed:', state);
});
