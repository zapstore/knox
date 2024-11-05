# Knox

Knox is a command-line Nostr bunker built with Deno.

## Features

- Saves credentials to a portable, password-encrypted `.bunker` file.
- `knox` commands modify the bunker file.
- `knox start` runs a remote signer with the bunker file. A filesystem watcher will restart the signer if the bunker file changes.

## Getting Started

To install, download the `knox` binary and make it executable:

```sh
wget -O ~/bin/knox https://gitlab.com/soapbox-pub/knox/-/jobs/artifacts/main/raw/knox?job=compile
chmod +x ~/bin/knox
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
  "version": 1,
  "keys": [
    {
      "name": "alex",
      "sec": "nsec1...",
      "created_at": "2024-11-05T20:01:42.153Z"
    },
    {
      "name": "patrick",
      "sec": "nsec1...",
      "created_at": "2024-11-05T20:01:42.153Z"
    }
  ]
  // TODO
}
```
