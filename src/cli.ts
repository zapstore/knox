import { Command, program } from '@commander-js/extra-typings';
import { promptSecret } from '@std/cli';
import chalk from 'chalk';
import { generateSecretKey, nip19 } from 'nostr-tools';
import * as nip49 from 'nostr-tools/nip49';

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
      return cliError(knox, 'Bunker file already exists');
    }

    const passphrase = promptSecret('Enter a new passphrase:', { clear: true });
    if (!passphrase) {
      return cliError(knox, 'Passphrase is required');
    }

    await KnoxStore.createNew(file, passphrase);
  });

knox.command('add')
  .description('Add a new key to the bunker')
  .argument('<name>', 'Name of the key')
  .action(async (name) => {
    const { file } = knox.opts();

    const passphrase = promptSecret('Enter unlock passphrase:', { clear: true });
    if (!passphrase) {
      return cliError(knox, 'Passphrase is required to unlock bunker');
    }

    using store = await KnoxStore.open(file, passphrase);

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
        return cliError(knox, 'Invalid secret key');
      }
    }

    try {
      store.addKey(name, nsec);
      await store.save({ write: true });
    } catch (error) {
      return cliError(knox, error);
    }
  });

knox.command('export')
  .description('Export keys from the bunker')
  .option('--format <format>', 'Output format (csv, jsonl)', 'csv')
  .option('--keys', 'Output keys only')
  .option('--insecure', 'Output keys without encryption (not recommended)')
  .action(async ({ format, keys: keysOnly, insecure }) => {
    const { file } = knox.opts();

    if (!['csv', 'jsonl'].includes(format)) {
      return cliError(knox, `Invalid format "${format}". Supported formats: csv, jsonl`);
    }

    const passphrase = promptSecret('Enter unlock passphrase:', { clear: true });
    if (!passphrase) {
      return cliError(knox, 'Passphrase is required to unlock bunker');
    }

    using store = await KnoxStore.open(file, passphrase);

    for (const key of store.listKeys()) {
      const name = key.name;
      const sec = insecure ? key.sec : nip49.encrypt(nip19.decode(key.sec).data, passphrase);
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

function cliError(command: Command, error: unknown): void {
  if (typeof error === 'string') {
    return command.error(chalk.red('error: ') + error);
  }
  if (error instanceof Error) {
    return command.error(chalk.red('error: ') + error.message);
  }
  throw error;
}

await knox.parseAsync();
