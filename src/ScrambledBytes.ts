import { DisposableBytes } from './DisposableBytes.ts';

/**
 * Scrambles (mutates) the passed Uint8Array (and unscrambles it on demand) so
 * it is obfuscated while in memory.
 *
 * The bytes are XORed with a random salt, which is stored alongside the data.
 * The salt is used to reverse the operation and retrieve the original bytes.
 * Finally, the data is zeroed out when disposed (with the `using` keyword).
 *
 * Note that it's basically impossible to securely store secrets in memory in
 * JavaScript, especially if the value was originally a string.
 */
export class ScrambledBytes {
  readonly #data: Uint8Array;
  readonly #salt: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#salt = crypto.getRandomValues(new Uint8Array(bytes.length));
    this.#data = bytes;

    for (let i = 0, len = this.#data.length; i < len; i++) {
      this.#data[i] ^= this.#salt[i];
    }
  }

  /** Get the original bytes. Supports `using` keyword to randomize the bytes after use. */
  unscrambled(): DisposableBytes {
    const bytes = new DisposableBytes(this.#data);

    for (let i = bytes.length - 1; i >= 0; i--) {
      bytes[i] = this.#data[i] ^ this.#salt[i];
    }

    return bytes;
  }

  [Symbol.dispose](): void {
    crypto.getRandomValues(this.#salt);
    crypto.getRandomValues(this.#data);
  }
}
