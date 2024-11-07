import { program } from '@commander-js/extra-typings';
import { NPool, NRelay1, NSecSigner } from '@nostrify/nostrify';
import { promptSecret } from '@std/cli';
import chalk from 'chalk';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { BunkerCrypt } from './BunkerCrypt.ts';
import { BunkerError } from './BunkerError.ts';
import { KnoxFS } from './KnoxFS.ts';
import { KnoxStore } from './KnoxStore.ts';
import { NBunker } from './NBunker.ts';
import { KnoxAuthorization, KnoxKey, KnoxState } from './KnoxState.ts';

const knox = program
  .name('knox')
  .description('Nostr bunker with encrypted storage.')
  .version('0.0.1')
  .option('-f, --file <file>', 'path to the bunker file', 'knox.bunker');

knox.command('init')
  .description('initialize a new bunker')
  .action(async () => {
    const { file: path } = knox.opts();

    if (await fileExists(path)) {
      throw new BunkerError('Bunker file already exists');
    }

    using file = await Deno.open(path, { createNew: true, write: true });
    await file.lock(true);

    using crypt = promptPassphrase('Enter a new passphrase:');

    const state: KnoxState = {
      keys: [],
      authorizations: [],
      version: 1,
    };

    await KnoxFS.write(path, state, crypt);
  });

knox.command('add')
  .description('add a new key to the bunker')
  .argument('<name>', 'name of the key')
  .action(async (name) => {
    using bunker = await openBunker();
    const key = promptSecret('Enter secret key (leave blank to generate):', { clear: true });

    let sec: Uint8Array | undefined;
    if (!key) {
      sec = generateSecretKey();
    } else {
      try {
        const decoded = nip19.decode(key);
        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec');
        }
        sec = decoded.data;
      } catch {
        throw new BunkerError('Invalid secret key');
      }
    }

    await bunker.store.addKey(name, sec);
  });

knox.command('remove')
  .description('remove a key from the bunker')
  .argument('<name>', 'name of the key')
  .action(async (name) => {
    using bunker = await openBunker();
    await bunker.store.removeKey(name);
  });

knox.command('uri')
  .description('generate a bunker URI for a key')
  .argument('<name>', 'name of the key')
  .argument('<relay...>', 'relays to use')
  .option('-n, --uses <count>', 'maximum number of uses', '1')
  .option('--expires <date>', 'expiration date')
  .action(async (key, relays, opts) => {
    if (opts.expires && !Date.parse(opts.expires)) {
      throw new BunkerError('Invalid expiration date');
    }
    if (opts.uses && !Number.isInteger(Number(opts.uses))) {
      throw new BunkerError('Invalid number of uses');
    }
    relays = relays.map((relay) => {
      try {
        const url = new URL(relay);
        if (url.protocol !== 'wss:') {
          throw new Error('Invalid protocol');
        }
        return url.toString();
      } catch {
        throw new BunkerError(`Invalid relay URL "${relay}"`);
      }
    });

    using bunker = await openBunker();

    const uri = await bunker.store.generateUri({
      key,
      relays,
      maxUses: opts.uses ? Number(opts.uses) : undefined,
      expiresAt: opts.expires ? new Date(opts.expires) : undefined,
    });

    console.log(uri.toString());
  });

knox.command('status')
  .description('show the status of the bunker')
  .action(async () => {
    using bunker = await openBunker();
    const { state } = bunker;

    function printKey(name: string, tags: string[]) {
      if (tags.length) {
        console.log(chalk.bold(name), chalk.dim('(') + tags.join(chalk.dim(', ')) + chalk.dim(')'));
      } else {
        console.log(chalk.bold(name));
      }
    }

    for (const key of state.keys) {
      const tags: string[] = [];
      const authorizations = state.authorizations.filter((auth) => auth.key === key.name);

      if (!authorizations.length) {
        printKey(key.name, [chalk.dim('new')]);
        continue;
      }

      let unusedUris = 0;
      let unusedSlots = 0;
      let hasUnlimited = false;

      for (const { pubkeys, max_uses } of authorizations) {
        if (typeof max_uses !== 'number') {
          hasUnlimited = true;
          break;
        }
        if (!pubkeys.length) {
          unusedUris++;
        }

        unusedSlots += Math.max(0, max_uses - pubkeys.length);
      }

      if (hasUnlimited) {
        printKey(key.name, [chalk.yellow('unlimited')]);
        continue;
      }

      if (unusedUris) {
        tags.push(chalk.yellow(`${unusedUris} unused URIs`));
      }

      if (unusedSlots && unusedSlots !== unusedUris) {
        tags.push(chalk.yellow(`${unusedSlots} unused slots`));
      }

      if (!tags.length) {
        printKey(key.name, [chalk.green('connected')]);
        continue;
      }

      printKey(key.name, tags);
    }
  });

knox.command('start')
  .description('start the bunker daemon')
  .action(async () => {
    const { path, crypt, state, store } = await openBunker();

    if (!state.authorizations.length) {
      console.error('No authorizations found. Run "knox uri" to generate one.');
      return;
    }

    console.log('Starting bunker daemon...');
    console.log('Press Ctrl+C to stop.');
    console.log('');

    /** One pool for all authorizations. */
    const pool = new NPool({
      open: (url) => new NRelay1(url),
      eventRouter: (_event) => Promise.resolve([]),
      reqRouter: (_filters) => Promise.resolve(new Map()),
    });

    /** Map of all bunkers, keyed by authorization secret. */
    const bunkers = new Map<string, NBunker>();

    // Loop through all authorizations and create a bunker instance for each.
    for (const authorization of state.authorizations) {
      const key = state.keys.find((key) => key.name === authorization.key);
      if (!key) {
        console.error(`Key "${authorization.key}" not found`);
        continue;
      }

      startBunkerSession(authorization, key);
    }

    function startBunkerSession(authorization: KnoxAuthorization, key: KnoxKey): void {
      // FIXME: Keys should be scrambled or encrypted in memory.
      const userSigner = new NSecSigner(key.sec.unscramble());
      const bunkerSigner = new NSecSigner(authorization.bunker_sec.unscramble());

      // Create a new sub-pool for this authorization.
      const relay = new NPool({
        open: (url) => pool.relay(url), // Relays taken from main pool.
        eventRouter: () => Promise.resolve(authorization.relays),
        reqRouter: (filters) => Promise.resolve(new Map(authorization.relays.map((relay) => [relay, filters]))),
      });

      const session = new NBunker({
        relay,
        bunkerSigner,
        userSigner,
        authorizedPubkeys: new Set(authorization.pubkeys),
        async onConnect(request, event) {
          const [, secret] = request.params;

          if (secret === authorization.secret) {
            try {
              await store.authorize(event.pubkey, secret);
              session.authorize(event.pubkey);
            } catch (error) {
              if (error instanceof BunkerError) {
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
          console.debug(
            'request',
            chalk.bold(key.name),
            chalk.bold(request.method),
            chalk.dim(request.id),
            chalk.dim(event.id),
          );
        },
        onResponse(response, event) {
          console.debug('response', chalk.bold(key.name), chalk.bold(response.id), chalk.dim(event.id));
        },
        onError(error, event) {
          console.error('error', chalk.bold(key.name), chalk.dim(event.id), error);
        },
      });

      console.log(
        chalk.green('up'),
        chalk.bold(authorization.key),
        chalk.dim(authorization.secret),
        chalk.dim(authorization.relays.join(', ')),
      );

      bunkers.set(authorization.secret, session);
    }

    for await (const fsEvent of Deno.watchFs(path)) {
      if (['remove', 'rename'].includes(fsEvent.kind)) {
        console.error('Bunker file removed or renamed. Exiting...');
        Deno.exit(1);
      }
      if (fsEvent.kind === 'modify') {
        using file = await Deno.open(path, { read: true });
        await file.lock(true);

        const state = await KnoxFS.read(path, crypt);

        const prevIds = new Set(bunkers.keys());
        const nextIds = new Set(state.authorizations.map((auth) => auth.secret));

        const added = nextIds.difference(prevIds);
        const removed = prevIds.difference(nextIds);

        console.log(
          chalk.blue('changed'),
          added.size ? chalk.green(`${added.size} added`) : '',
          removed.size ? chalk.red(`${removed.size} removed`) : '',
        );

        for (const id of added) {
          const authorization = state.authorizations.find((auth) => auth.secret === id);
          if (!authorization) {
            continue;
          }

          const key = state.keys.find((key) => key.name === authorization.key);
          if (!key) {
            console.error(`Key "${authorization.key}" not found`);
            continue;
          }

          startBunkerSession(authorization, key);
        }

        for (const id of removed) {
          const session = bunkers.get(id);
          if (session) {
            session.close();
            bunkers.delete(id);
          }
          const authorization = state.authorizations.find((auth) => auth.secret === id);
          if (authorization) {
            console.log(
              chalk.green('down'),
              chalk.bold(authorization.key),
              chalk.dim(authorization.secret),
              chalk.dim(authorization.relays.join(', ')),
            );
          } else {
            console.log(chalk.red('down'), chalk.dim(id));
          }
        }

        // Update the authorized pubkeys for each session.
        for (const authorization of state.authorizations) {
          const session = bunkers.get(authorization.secret);
          if (session) {
            session.authorizedPubkeys = new Set(authorization.pubkeys);
          }
        }
      }
    }
  });

knox.command('export')
  .description('export keys from the bunker')
  .option('--format <format>', 'output format (csv, jsonl)', 'csv')
  .option('--keys', 'output keys only')
  .option('--insecure', 'output keys without encryption (not recommended)')
  .action(async ({ format, keys: keysOnly, insecure }) => {
    if (!['csv', 'jsonl'].includes(format)) {
      throw new BunkerError(`Invalid format "${format}". Supported formats: csv, jsonl`);
    }

    using bunker = await openBunker();
    const { state, crypt } = bunker;

    for (const key of state.keys) {
      using bytes = key.sec.unscramble();

      const name = key.name;
      const sec = insecure ? nip19.nsecEncode(bytes) : crypt.encryptKey(bytes);
      const created_at = key.created_at.toISOString();

      if (keysOnly) {
        console.log(sec);
        continue;
      }

      switch (format) {
        case 'jsonl':
          console.log(JSON.stringify({ name, sec, created_at }));
          break;
        case 'csv':
          console.log(`${name},${sec},${created_at}`);
          break;
      }
    }
  });

/** Prompt the user to unlock and open the store. Most subcommands (except `init`) call this. */
async function openBunker() {
  const { file: path } = knox.opts();
  await assertBunkerExists(path);

  const crypt = promptPassphrase('Enter unlock passphrase:');
  const state = await KnoxFS.read(path, crypt);
  const store = new KnoxStore((updateFn) => KnoxFS.update(path, crypt, updateFn));

  return {
    path,
    state,
    store,
    crypt,
    [Symbol.dispose]: () => {
      crypt[Symbol.dispose]();
    },
  };
}

/** Prompt for the user's passphrase and return a BunkerCrypt instance. */
function promptPassphrase(message: string): BunkerCrypt {
  const passphrase = promptSecret(message, { clear: true });
  if (!passphrase) {
    throw new BunkerError('Passphrase is required');
  }

  return new BunkerCrypt(passphrase);
}

/** Check if a file exists. */
async function fileExists(path: string): Promise<boolean> {
  return await Deno.stat(path).then(() => true).catch(() => false);
}

/** Throw an error if the bunker file doesn't exist. */
async function assertBunkerExists(path: string): Promise<void> {
  if (!await fileExists(path)) {
    throw new BunkerError('Bunker not found. Run "knox init" to create one, or pass "-f" to specify its location.');
  }
}

// Process the command line arguments and run the program.
try {
  await knox.parseAsync();
} catch (error) {
  if (error instanceof BunkerError) {
    console.error(chalk.red('error: ') + error.message);
    Deno.exit(1);
  } else {
    throw error;
  }
}
