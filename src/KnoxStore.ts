import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { BunkerError } from './BunkerError.ts';
import { ConnectError } from './ConnectError.ts';
import { KnoxAuthorization, type KnoxState } from './KnoxState.ts';
import { ScrambledBytes } from './ScrambledBytes.ts';

export class KnoxStore {
  constructor(private update: (updateFn: (state: KnoxState) => KnoxState) => Promise<void>) {}

  async addKey(name: string, sec: Uint8Array): Promise<void> {
    await this.update((state) => {
      for (const key of state.keys) {
        if (key.name === name) {
          throw new BunkerError(`Key "${name}" already exists.`);
        }
      }

      state.keys.push({
        name,
        sec: new ScrambledBytes(sec),
        created_at: new Date(),
      });

      return state;
    });
  }

  async generateUri(opts: { key: string; relays: string[]; maxUses?: number; expiresAt?: Date }): Promise<URL> {
    let uri: URL;

    await this.update((state) => {
      const key = state.keys.find((key) => key.name === opts.key);
      if (!key) {
        throw new BunkerError(`Key "${opts.key}" not found.`);
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

      uri = new URL(`bunker://${bunkerPubkey}`);

      for (const relay of opts.relays) {
        uri.searchParams.append('relay', relay);
      }

      uri.searchParams.set('secret', secret);

      state.authorizations.push(authorization);

      return state;
    });

    return uri!;
  }

  async authorize(pubkey: string, secret: string): Promise<void> {
    await this.update((state) => {
      const authorization = state.authorizations.find((auth) => auth.secret === secret);

      if (!authorization) {
        throw new ConnectError('Authorization not found.');
      }

      if (authorization.pubkeys.includes(pubkey)) {
        return state;
      }

      if (authorization.pubkeys.length >= (authorization.max_uses ?? Infinity)) {
        throw new ConnectError('Max uses exceeded.');
      }

      if (authorization.expires_at && Date.now() > authorization.expires_at.getTime()) {
        throw new ConnectError('Authorization expired.');
      }

      authorization.pubkeys.push(pubkey);

      return state;
    });
  }
}
