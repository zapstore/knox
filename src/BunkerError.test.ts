import { BunkerError } from './BunkerError.ts';

Deno.test('BunkerError', () => {
  new BunkerError('test');
});
