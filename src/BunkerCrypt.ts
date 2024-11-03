import { scrypt } from '@noble/hashes/scrypt';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { concatBytes, randomBytes } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';
import { nip19 } from 'nostr-tools';

import { ScrambledBytes } from './ScrambledBytes.ts';

/** Utilities for password encryption of data. */
export class BunkerCrypt {
  #scrambled: ScrambledBytes;

  constructor(passphrase: string) {
    const encoder = new TextEncoder();
    const normalized = passphrase.normalize('NFKC');
    const bytes = encoder.encode(normalized);

    this.#scrambled = new ScrambledBytes(bytes);
  }

  /** Encrypt bytes according to NIP-49 without bech32 encoding. */
  encrypt(
    data: Uint8Array,
    logn: number = 16,
    ksb: 0x00 | 0x01 | 0x02 = 0x02,
  ): Uint8Array {
    using passphrase = this.#scrambled.getBytes();
    const salt = randomBytes(16);
    const n = 2 ** logn;
    const key = scrypt(passphrase, salt, { N: n, r: 8, p: 1, dkLen: 32 });
    const nonce = randomBytes(24);
    const aad = Uint8Array.from([ksb]);
    const xc2p1 = xchacha20poly1305(key, nonce, aad);
    const ciphertext = xc2p1.encrypt(data);
    return concatBytes(Uint8Array.from([0x02]), Uint8Array.from([logn]), salt, nonce, aad, ciphertext);
  }

  /** Decrypt bytes according to NIP-49 without bech32 decoding. */
  decrypt(enc: Uint8Array): Uint8Array {
    const version = enc[0];
    if (version !== 0x02) {
      throw new Error(`invalid version ${version}, expected 0x02`);
    }

    const logn = enc[1];
    const n = 2 ** logn;

    const salt = enc.slice(2, 2 + 16);
    const nonce = enc.slice(2 + 16, 2 + 16 + 24);
    const ksb = enc[2 + 16 + 24];
    const aad = Uint8Array.from([ksb]);
    const ciphertext = enc.slice(2 + 16 + 24 + 1);

    using passphrase = this.#scrambled.getBytes();
    const key = scrypt(passphrase, salt, { N: n, r: 8, p: 1, dkLen: 32 });
    const xc2p1 = xchacha20poly1305(key, nonce, aad);
    return xc2p1.decrypt(ciphertext);
  }

  /** Encrypt a secret key into an `ncryptsec` according to NIP-49. */
  encryptKey(sec: Uint8Array, logn: number = 16, ksb: 0x00 | 0x01 | 0x02 = 0x02): `ncryptsec1${string}` {
    const bytes = this.encrypt(sec, logn, ksb);
    return nip19.encodeBytes('ncryptsec', bytes);
  }

  /** Decrypt an `ncryptsec` into a secret key according to NIP-49. */
  decryptKey(ncryptsec: `ncryptsec1${string}`): Uint8Array {
    const { words } = bech32.decode(ncryptsec, nip19.Bech32MaxSize);
    const enc = new Uint8Array(bech32.fromWords(words));
    return this.decrypt(enc);
  }

  [Symbol.dispose](): void {
    this.#scrambled[Symbol.dispose]();
  }
}
