# Knox

Knox is a command-line Nostr bunker built with Deno.

## Features

- Saves credentials to a portable, password-encrypted `.bunker` file.
- `knox` commands modify the bunker file.
- `knox start` runs a remote signer with the bunker file. A filesystem watcher will restart the signer if the bunker file changes.

## Getting Started

You can download (TODO) a compiled binary and put it in your PATH.

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
  "version": 1,
  "keys": {
    "alex": {
      "sec": "nsec1...",
      "created_at": 1730834557
    },
    "patrick": {
      "sec": "nsec1...",
      "created_at": 1730834557
    }
  }
  // TODO
}
```
