import { program } from '@commander-js/extra-typings';
import { promptSecret } from '@std/cli';
import chalk from 'chalk';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { BunkerCrypt } from './BunkerCrypt.ts';
import { BunkerError } from './BunkerError.ts';
import { KnoxStore } from './KnoxStore.ts';
import { NPool, NRelay1, NSecSigner } from '@nostrify/nostrify';
import { NBunker } from './NBunker.ts';

const knox = program
  .name('knox')
  .description('Nostr bunker with JSON storage.')
  .version('0.0.1')
  .option('-f, --file <file>', 'path to the bunker file', 'knox.bunker');

knox.command('init')
  .description('initialize a new bunker')
  .action(async () => {
    const { file } = knox.opts();

    if (await fileExists(file)) {
      throw new BunkerError('Bunker file already exists');
    }

    using crypt = promptPassphrase('Enter a new passphrase:');
    await KnoxStore.createNew(file, crypt);
  });

knox.command('add')
  .description('add a new key to the bunker')
  .argument('<name>', 'name of the key')
  .action(async (name) => {
    using bunker = await openBunker();
    const { store } = bunker;

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

    store.addKey(name, sec);
    await store.save({ write: true });
  });

knox.command('uri')
  .description('generate a bunker URI for a key')
  .argument('<name>', 'name of the key')
  .argument('<relay...>', 'relays to use')
  .option('-n, --uses <count>', 'maximum number of uses', '1')
  .option('--expires <date>', 'expiration date')
  .action(async (name, relays, opts) => {
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
    const { store } = bunker;

    const key = store.listKeys().find((key) => key.name === name);
    if (!key) {
      throw new BunkerError(`Key "${name}" not found`);
    }

    const uri = store.generateUri({
      name,
      relays,
      maxUses: opts.uses ? Number(opts.uses) : undefined,
      expiresAt: opts.expires ? new Date(opts.expires) : undefined,
    });

    await store.save({ write: true });
    console.log(uri.toString());
  });

knox.command('status')
  .description('show the status of the bunker')
  .action(async () => {
    using bunker = await openBunker();
    const { store } = bunker;

    function printKey(name: string, tags: string[]) {
      if (tags.length) {
        console.log(chalk.bold(name), chalk.gray('(') + tags.join(chalk.gray(', ')) + chalk.gray(')'));
      } else {
        console.log(chalk.bold(name));
      }
    }

    for (const key of store.listKeys()) {
      const tags: string[] = [];
      const authorizations = store.getAuthorizations().filter((auth) => auth.key_name === key.name);

      if (!authorizations.length) {
        printKey(key.name, [chalk.gray('new')]);
        continue;
      }

      let unusedUris = 0;
      let unusedSlots = 0;
      let hasUnlimited = false;

      for (const { authorized_pubkeys, max_uses } of authorizations) {
        if (typeof max_uses !== 'number') {
          hasUnlimited = true;
          break;
        }
        if (!authorized_pubkeys.length) {
          unusedUris++;
        }

        unusedSlots += Math.max(0, max_uses - authorized_pubkeys.length);
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
    using bunker = await openBunker();
    const { store } = bunker;

    console.log('Starting bunker daemon...');
    console.log('Press Ctrl+C to stop.');

    const pool = new NPool({
      open: (url) => new NRelay1(url),
      eventRouter: (_event) => Promise.resolve([]),
      reqRouter: (_filters) => Promise.resolve(new Map()),
    });

    for (const authorization of store.getAuthorizations()) {
      const key = store.getKey(authorization.key_name);
      if (!key) {
        console.error(`Key "${authorization.key_name}" not found`);
        continue;
      }

      // FIXME: Keys should be scrambled or encrypted in memory.
      const userSigner = new NSecSigner(key.sec.unscramble());
      const bunkerSigner = new NSecSigner(authorization.bunker_sec.unscramble());

      const relay = new NPool({
        open: (url) => pool.relay(url),
        eventRouter: () => Promise.resolve(authorization.relays),
        reqRouter: (filters) => Promise.resolve(new Map(authorization.relays.map((relay) => [relay, filters]))),
      });

      const bunker = new NBunker({
        relay,
        bunkerSigner,
        userSigner,
        async onConnect(request, event) {
          const [, secret] = request.params;

          if (secret === authorization.secret) {
            bunker.authorize(event.pubkey);
            store.authorize(event.pubkey, secret);
            await store.save({ write: true });
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

      for (const pubkey of authorization.authorized_pubkeys) {
        bunker.authorize(pubkey);
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
    const { store, crypt } = bunker;

    for (const key of store.listKeys()) {
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
async function openBunker(): Promise<{ store: KnoxStore; crypt: BunkerCrypt; [Symbol.dispose]: () => void }> {
  const { file } = knox.opts();

  if (!await fileExists(file)) {
    throw new BunkerError('Bunker not found. Run "knox init" to create one, or pass "-f" to specify its location.');
  }

  const crypt = promptPassphrase('Enter unlock passphrase:');
  const store = await KnoxStore.open(file, crypt);

  return {
    store,
    crypt,
    [Symbol.dispose]: () => {
      store[Symbol.dispose]();
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
