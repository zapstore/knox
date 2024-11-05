import { promptSecret } from '@std/cli';

import { BunkerCrypt } from '../src/BunkerCrypt.ts';
import { KnoxStore } from '../src/KnoxStore.ts';

const passphrase = promptSecret('Enter unlock passphrase:', { clear: true });

const crypt = new BunkerCrypt(passphrase!);
const store = await KnoxStore.open('knox.bunker', crypt);

// @ts-ignore This is a private method.
const state = store.store.getState();

console.log(JSON.stringify(state, null, 2));
