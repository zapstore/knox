import { parseArgs } from '@std/cli/parse-args';

const args = parseArgs(Deno.args, {
  string: ['c']
});

console.log(args);