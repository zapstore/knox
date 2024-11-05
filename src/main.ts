import { program } from '@commander-js/extra-typings';
import { promptSecret } from '@std/cli';
import chalk from 'chalk';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { BunkerCrypt } from './BunkerCrypt.ts';
import { BunkerError } from './BunkerError.ts';
import { KnoxStore } from './KnoxStore.ts';

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

    let nsec: `nsec1${string}` | undefined;
    if (!key) {
      nsec = nip19.nsecEncode(generateSecretKey());
    } else {
      try {
        const decoded = nip19.decode(key);
        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec');
        }
        nsec = nip19.nsecEncode(decoded.data);
      } catch {
        throw new BunkerError('Invalid secret key');
      }
    }

    store.addKey(name, nsec);
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

    console.log(uri.toString());
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
      const name = key.name;
      const sec = insecure ? key.sec : crypt.encryptKey(nip19.decode(key.sec).data);
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
