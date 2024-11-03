import { Command, program } from '@commander-js/extra-typings';
import { promptSecret } from '@std/cli';
import chalk from 'chalk';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { KnoxStore } from './store.ts';

const knox = program
  .name('knox')
  .description('Nostr bunker with JSON storage.')
  .version('0.0.1')
  .option('-f, --file <file>', 'Path to the bunker file', 'bunker.json');

knox.command('init')
  .description('Initialize a new bunker')
  .action(async () => {
    const { file } = knox.opts();

    const exists = await Deno.stat(file).then(() => true).catch(() => false);
    if (exists) {
      return cliError(knox, 'Bunker file already exists');
    }

    const passphrase = promptSecret('Enter a new passphrase:');
    if (!passphrase) {
      return cliError(knox, 'Passphrase is required');
    }
  });

knox.command('add')
  .description('Add a new key to the bunker')
  .argument('<name>', 'Name of the key')
  .action((name) => {
    const { file } = knox.opts();

    const passphrase = promptSecret('Enter passphrase:');
    if (!passphrase) {
      return cliError(knox, 'Passphrase is required');
    }

    using store = new KnoxStore(file, passphrase);

    const nsec = promptSecret('Enter secret key (leave blank to generate):');

    let bytes: Uint8Array;
    if (!nsec) {
      bytes = generateSecretKey();
    } else {
      try {
        const decoded = nip19.decode(nsec);
        if (decoded.type !== 'nsec') {
          throw new Error('Invalid nsec');
        }
        bytes = decoded.data;
      } catch {
        return cliError(knox, 'Invalid secret key');
      }
    }

    try {
      store.addKey(name, bytes, passphrase);
    } catch (error) {
      return cliError(knox, error);
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
