import { program } from '@commander-js/extra-typings';
import { promptSecret } from '@std/cli';
import chalk from 'chalk';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { BunkerCrypt } from './BunkerCrypt.ts';
import { BunkerError } from './BunkerError.ts';
import { KnoxStore } from './store.ts';

const knox = program
  .name('knox')
  .description('Nostr bunker with JSON storage.')
  .version('0.0.1')
  .option('-f, --file <file>', 'Path to the bunker file', 'knox.bunker');

knox.command('init')
  .description('Initialize a new bunker')
  .action(async () => {
    const { file } = knox.opts();

    const exists = await Deno.stat(file).then(() => true).catch(() => false);
    if (exists) {
      throw new BunkerError('Bunker file already exists');
    }

    const passphrase = promptSecret('Enter a new passphrase:', { clear: true });
    if (!passphrase) {
      throw new BunkerError('Passphrase is required');
    }

    const crypt = new BunkerCrypt(passphrase);

    await KnoxStore.createNew(file, crypt);
  });

knox.command('add')
  .description('Add a new key to the bunker')
  .argument('<name>', 'Name of the key')
  .action(async (name) => {
    const { store } = await openStore();

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

knox.command('export')
  .description('Export keys from the bunker')
  .option('--format <format>', 'Output format (csv, jsonl)', 'csv')
  .option('--keys', 'Output keys only')
  .option('--insecure', 'Output keys without encryption (not recommended)')
  .action(async ({ format, keys: keysOnly, insecure }) => {
    if (!['csv', 'jsonl'].includes(format)) {
      throw new BunkerError(`Invalid format "${format}". Supported formats: csv, jsonl`);
    }

    const { store, crypt } = await openStore();

    for (const key of store.listKeys()) {
      const name = key.name;
      const sec = insecure ? key.sec : crypt.encryptKey(nip19.decode(key.sec).data);
      const inserted_at = key.inserted_at.toISOString();

      if (keysOnly) {
        console.log(sec);
        continue;
      }

      switch (format) {
        case 'jsonl':
          console.log(JSON.stringify({ name, sec, inserted_at }));
          break;
        case 'csv':
          console.log(`${name},${sec},${inserted_at}`);
          break;
      }
    }
  });

async function openStore(): Promise<{ store: KnoxStore; crypt: BunkerCrypt }> {
  const { file } = knox.opts();

  const exists = await Deno.stat(file).then(() => true).catch(() => false);
  if (!exists) {
    throw new BunkerError('Bunker not found. Run "knox init" to create one, or pass "-f" to specify its location.');
  }

  const passphrase = promptSecret('Enter unlock passphrase:', { clear: true });
  if (!passphrase) {
    throw new BunkerError('Passphrase is required to unlock bunker');
  }

  const crypt = new BunkerCrypt(passphrase);
  const store = await KnoxStore.open(file, crypt);

  return { store, crypt };
}

try {
  await knox.parseAsync();
} catch (error) {
  if (error instanceof BunkerError) {
    console.error(chalk.red('error: ') + error.message);
  } else {
    throw error;
  }
} finally {
  Deno.exit(1);
}
