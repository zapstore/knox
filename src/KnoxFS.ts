import { nip19 } from 'nostr-tools';

import { BunkerCrypt } from './BunkerCrypt.ts';
import { KnoxState, stateSchema } from './KnoxState.ts';
import { ScrambledBytes } from './ScrambledBytes.ts';

export class KnoxFS {
  /** Low-level function to read the bunker file. */
  static async read(path: string, crypt: BunkerCrypt): Promise<KnoxState> {
    const enc = await Deno.readFile(path);
    const dec = crypt.decrypt(enc);

    const text = new TextDecoder().decode(dec);
    const data = JSON.parse(text, KnoxFS.reviver);

    return stateSchema.parse(data);
  }

  /** Low-level function to write the bunker file. */
  static async write(path: string, state: KnoxState, crypt: BunkerCrypt): Promise<void> {
    const data = JSON.stringify(state, KnoxFS.replacer, 2);
    const dec = new TextEncoder().encode(data);
    const enc = crypt.encrypt(dec);

    await Deno.writeFile(path, enc);
  }

  private static reviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('nsec1')) {
      const { data: bytes } = nip19.decode(value as `nsec1${string}`);
      return new ScrambledBytes(bytes);
    }

    return value;
  }

  private static replacer(_key: string, value: unknown): unknown {
    if (value instanceof ScrambledBytes) {
      using bytes = value.unscramble();
      return nip19.nsecEncode(bytes);
    }

    return value;
  }
}
