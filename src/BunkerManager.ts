import { NPool, NRelay1, NSecSigner } from '@nostrify/nostrify';
import chalk from 'chalk';

import { ConnectError } from './ConnectError.ts';
import { KnoxAuthorization, KnoxKey } from './KnoxState.ts';
import { NBunker } from './NBunker.ts';

export class BunkerManager {
  /** One pool for all authorizations. */
  private pool: NPool<NRelay1>;

  /** Map of all bunkers, keyed by authorization secret. */
  private bunkers = new Map<string, NBunker>();

  constructor() {
    this.pool = new NPool({
      open: (url) => new NRelay1(url),
      eventRouter: (_event) => Promise.resolve([]),
      reqRouter: (_filters) => Promise.resolve(new Map()),
    });
  }

  bunker(authorization: KnoxAuthorization, key: KnoxKey): void {
    // FIXME: Keys should be scrambled or encrypted in memory.
    const userSigner = new NSecSigner(key.sec.unscramble());
    const bunkerSigner = new NSecSigner(authorization.bunker_sec.unscramble());

    // Create a new sub-pool for this authorization.
    const relay = new NPool({
      open: (url) => this.pool.relay(url), // Relays taken from main pool.
      eventRouter: () => Promise.resolve(authorization.relays),
      reqRouter: (filters) => Promise.resolve(new Map(authorization.relays.map((relay) => [relay, filters]))),
    });

    const session = new NBunker({
      relay,
      bunkerSigner,
      userSigner,
      async onConnect(request, event) {
        const [, secret] = request.params;

        if (secret === authorization.secret) {
          await using trx = await transaction(crypt);
          try {
            trx.store.authorize(event.pubkey, secret);
            session.authorize(event.pubkey);
          } catch (error) {
            if (error instanceof ConnectError) {
              return { id: request.id, result: '', error: error.message };
            } else {
              console.error(error);
              return { id: request.id, result: '', error: 'Internal error' };
            }
          }
          return { id: request.id, result: 'ack' };
        } else {
          return { id: request.id, result: '', error: 'Invalid secret' };
        }
      },
      onRequest(request, event) {
        console.debug(event.id, 'Request:', request);
      },
      onResponse(response, event) {
        console.debug(event.id, 'Response:', response);
      },
      onError(error, event) {
        console.warn('Error:', event.id, error);
      },
    });

    for (const pubkey of authorization.pubkeys) {
      session.authorize(pubkey);
    }

    console.log(
      chalk.green('up'),
      chalk.bold(authorization.key),
      chalk.dim(authorization.secret),
      chalk.dim(authorization.relays.join(', ')),
    );

    this.bunkers.set(authorization.secret, session);
  }
}
