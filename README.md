# Knox

Knox is a command-line Nostr bunker built with Deno.

```
Usage: knox [options] [command]

Nostr bunker with encrypted storage.

Options:
  -V, --version                    output the version number
  -f, --file <file>                path to the bunker file (default: "knox.bunker")
  -h, --help                       display help for command

Commands:
  init                             initialize a new bunker
  add <name>                       add a new key to the bunker
  remove <name>                    remove a key from the bunker
  uri [options] <name> <relay...>  generate a bunker URI for a key
  revoke <secret>                  revoke an authorization
  status [name]                    show the status of the bunker
  start                            start the bunker daemon
  change                           change the passphrase of the bunker
  export [options]                 export keys from the bunker
  help [command]                   display help for command
```

## Features

- Saves credentials to a portable, password-encrypted `.bunker` file.
- `knox` commands modify the bunker file.
- `knox start` runs a remote signer with the bunker file. A filesystem watcher will restart the signer if the bunker file changes.

## Getting Started

To install, run the install script:

```sh
curl https://dl.soapbox.pub/install/knox.sh | sh
```

To create your first bunker, run:

```sh
knox init
```

Then add keys to your bunker:

```sh
knox add alex
```

To start the signer:

```sh
knox start
```

## The Bunker File Format

The bunker file format uses the exact same binary format as [`NIP-49`](https://github.com/nostr-protocol/nips/blob/master/49.md), except the `plaintext` is a JSON-stringified object instead of a private key. Also, the raw encrypted bytes are saved as a file instead of encoded to bech32.

The JSON file is structured as follows:

```json
{
  "keys": [
    {
      "name": "alex",
      "sec": "nsec1refymzcgzzy9f5ma5vvygpyt43ytqr9y95zv9vxw89zes7dd8wuq4yvu2h",
      "created_at": "2024-11-06T21:39:57.450Z"
    },
    {
      "name": "patrick",
      "sec": "nsec197hjd7f5guhv8lstrjggy2wx93neq4gqvqudzf06yyxl2hfk7nmsw9gzgl",
      "created_at": "2024-11-06T23:48:59.484Z"
    }
  ],
  "authorizations": [
    {
      "key": "alex",
      "secret": "bceb2671-908c-4660-aea3-613b16c9c9f9",
      "relays": ["wss://gleasonator.dev/relay"],
      "pubkeys": ["99128ae2834170f6b06f0e0415ba2ac51339273a3e415cde2864062c8c2f911d"],
      "max_uses": 1,
      "bunker_sec": "nsec1p7wvnqphnjfx4pd0kl7qzmtdz9t4nck3vvs6nlrrvh8r6sjr8zgqw8f8z7",
      "created_at": "2024-11-06T21:40:11.941Z"
    },
    {
      "key": "alex",
      "secret": "6616d4c3-5bfa-429e-aa6b-1a74d2797aa1",
      "relays": ["wss://gleasonator.dev/relay"],
      "pubkeys": [],
      "max_uses": 1,
      "bunker_sec": "nsec15e0wrhpjvfxfnafm59xdkz705jh89fv7637pn6vj3ructguew04qkkqgvs",
      "created_at": "2024-11-06T23:49:10.114Z"
    },
    {
      "key": "patrick",
      "secret": "761cb70a-5a4f-4a09-85c8-d43dc7c5b580",
      "relays": ["wss://gleasonator.dev/relay"],
      "pubkeys": [],
      "max_uses": 1,
      "bunker_sec": "nsec1s0vgxlr3lx59jtynsxkrksrre5ujfy4p0w7vrwqtxh2pswpg6f8qzxmmxq",
      "created_at": "2024-11-06T23:49:29.790Z"
    }
  ],
  "version": 1
}
```
