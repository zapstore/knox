import { produce } from 'immer';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type BunkerCrypt } from './BunkerCrypt.ts';
import { BunkerError } from './BunkerError.ts';
import { KnoxFS } from './KnoxFS.ts';
import { KnoxAuthorization, KnoxKey, type KnoxState } from './KnoxState.ts';
import { ScrambledBytes } from './ScrambledBytes.ts';

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

  async load(): Promise<void> {
    const state = await KnoxFS.read(this.file, this.crypt);
    this.store.setState(state);
  }

  async save(): Promise<void> {
    const state = this.getState();
    await KnoxFS.write(this.file, state, this.crypt);
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
