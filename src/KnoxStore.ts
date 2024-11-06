import { produce } from 'immer';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { BunkerError } from './BunkerError.ts';
import { KnoxAuthorization, KnoxKey, type KnoxState } from './KnoxState.ts';
import { ScrambledBytes } from './ScrambledBytes.ts';
import { ConnectError } from './ConnectError.ts';

export class KnoxStore {
  private store: StoreApi<KnoxState>;

  constructor(initialState?: KnoxState) {
    this.store = createStore<KnoxState>()(
      () => (initialState ?? {
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

    this.setState((state) => {
      return produce(state, (draft) => {
        draft.keys.push({
          name,
          sec: new ScrambledBytes(sec),
          created_at: new Date(),
        });
      });
    });
  }

  get keys(): KnoxKey[] {
    return this.getState().keys;
  }

  get authorizations(): KnoxAuthorization[] {
    return this.getState().authorizations;
  }

  get version(): number {
    return this.getState().version;
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
      key: key.name,
      secret,
      relays: opts.relays,
      pubkeys: [],
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

    this.setState((state) => {
      return produce(state, (draft) => {
        draft.authorizations.push(authorization);
      });
    });

    return uri;
  }

  authorize(pubkey: string, secret: string): void {
    this.setState((state) => {
      return produce(state, (draft) => {
        const authorization = draft.authorizations.find((auth) => auth.secret === secret);

        if (!authorization) {
          throw new ConnectError('Authorization not found.');
        }

        if (authorization.pubkeys.includes(pubkey)) {
          return;
        }

        if (authorization.pubkeys.length >= (authorization.max_uses ?? Infinity)) {
          throw new ConnectError('Max uses exceeded.');
        }

        if (authorization.expires_at && Date.now() > authorization.expires_at.getTime()) {
          throw new ConnectError('Authorization expired.');
        }

        authorization.pubkeys.push(pubkey);
      });
    });
  }

  setState(state: ((state: KnoxState) => KnoxState) | KnoxState): void {
    return this.store.setState(state);
  }

  getState(): KnoxState {
    return this.store.getState();
  }
}
