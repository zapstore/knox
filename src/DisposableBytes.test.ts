import { assertNotEquals } from '@std/assert';

import { DisposableBytes } from './DisposableBytes.ts';

Deno.test('DisposableBytes', () => {
  let ref: Uint8Array;

  (() => {
    using bytes = new DisposableBytes(32);
    ref = bytes;
  })();

  assertNotEquals(ref, new Uint8Array(32));
});
