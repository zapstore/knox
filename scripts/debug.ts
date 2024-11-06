import { promptSecret } from '@std/cli';

import { BunkerCrypt } from '../src/BunkerCrypt.ts';
import { KnoxFS } from '../src/KnoxFS.ts';

using file = await Deno.open('knox.bunker', { read: true });
const passphrase = promptSecret('Enter unlock passphrase:', { clear: true });

const crypt = new BunkerCrypt(passphrase!);
const state = await KnoxFS.read(file, crypt);

console.log(JSON.stringify(state, null, 2));
