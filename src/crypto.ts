import { scrypt } from '@noble/hashes/scrypt';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { concatBytes, randomBytes } from '@noble/hashes/utils';

export function encrypt(
  data: Uint8Array,
  passphrase: string,
  logn: number = 16,
  ksb: 0x00 | 0x01 | 0x02 = 0x02,
): Uint8Array {
  const salt = randomBytes(16);
  const n = 2 ** logn;
  const key = scrypt(passphrase.normalize('NFKC'), salt, { N: n, r: 8, p: 1, dkLen: 32 });
  const nonce = randomBytes(24);
  const aad = Uint8Array.from([ksb]);
  const xc2p1 = xchacha20poly1305(key, nonce, aad);
  const ciphertext = xc2p1.encrypt(data);
  return concatBytes(Uint8Array.from([0x02]), Uint8Array.from([logn]), salt, nonce, aad, ciphertext);
}

export function decrypt(enc: Uint8Array, passphrase: string): Uint8Array {
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

  const key = scrypt(passphrase.normalize('NFKC'), salt, { N: n, r: 8, p: 1, dkLen: 32 });
  const xc2p1 = xchacha20poly1305(key, nonce, aad);
  return xc2p1.decrypt(ciphertext);
}
