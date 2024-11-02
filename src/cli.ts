import { program } from 'npm:@commander-js/extra-typings';

program
  .name('knox')
  .description('Nostr bunker with JSON storage.')
  .version('0.0.1')
  .option('-f, --file <file>', 'Path to the bunker file', 'bunker.json');

program.command('add')
  .description('Add a new key to the bunker')
  .argument('<name>', 'Name of the key')
  .action((name) => {
    console.log(typeof name);
  });

program.parse();
