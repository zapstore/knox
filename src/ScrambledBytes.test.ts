import { assertEquals, assertNotEquals } from '@std/assert';

import { DisposableBytes } from './DisposableBytes.ts';
import { ScrambledBytes } from './ScrambledBytes.ts';

Deno.test('ScrambledBytes', () => {
  const bytes = new Uint8Array(32);
  const scrambled = new ScrambledBytes(bytes);

  // The original value is mutated.
  assertNotEquals(bytes, new Uint8Array(32));

  let ref: DisposableBytes;
  (() => {
    using unscrambled = scrambled.unscramble();
    assertEquals(unscrambled, new DisposableBytes(32));
    ref = unscrambled;
  })();

  assertNotEquals(ref, new DisposableBytes(32));
});
