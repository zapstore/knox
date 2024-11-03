/** Extends Uint8Array so when it gets disposed (with `using`), the bytes are randomized. */
export class DisposableBytes extends Uint8Array {
  [Symbol.dispose](): void {
    crypto.getRandomValues(this);
  }
}
