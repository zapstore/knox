import { program } from '@commander-js/extra-typings';
import { promptSecret } from '@std/cli';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { KnoxStore } from './store.ts';

const knox = program
  .name('knox')
  .description('Nostr bunker with JSON storage.')
  .version('0.0.1')
  .option('-f, --file <file>', 'Path to the bunker file', 'bunker.json');

knox.command('add')
  .description('Add a new key to the bunker')
  .argument('<name>', 'Name of the key')
  .action((name) => {
    const { file } = knox.opts();
    using store = new KnoxStore(file);

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
        return knox.error('Invalid secret key');
      }
    }

    const password = promptSecret('Enter password:');
    if (!password) {
      return knox.error('Password is required');
    }

    try {
      store.addKey(name, bytes, password);
    } catch (error) {
      if (error instanceof Error) {
        return knox.error(error.message);
      } else {
        throw error;
      }
    }
  });

knox.parse();
