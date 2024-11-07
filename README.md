# knox

knox is a command-line Nostr bunker built with Deno.

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
  pubkey [options] <name>          show the public key of a secret key
  status [name]                    show the status of the bunker
  start                            start the bunker daemon
  change                           change the passphrase of the bunker
  export [options]                 export keys from the bunker
  update [options] [ref]           update knox to the latest version
  help [command]                   display help for command
```

## Install

To install, run the install script:

```sh
curl https://dl.soapbox.pub/install/knox.sh | sh
```

This will download the latest version of `knox` and install it to `/usr/local/bin`.
Linux, MacOS, and Windows are supported.

### Direct Download

You can also directly download a precompiled executable.

- [Linux x86 (64-bit)](https://gitlab.com/soapbox-pub/knox/-/jobs/artifacts/main/raw/knox-x86_64-unknown-linux-gnu?job=compile)
- [Linux ARM (64-bit)](https://gitlab.com/soapbox-pub/knox/-/jobs/artifacts/main/raw/knox-aarch64-unknown-linux-gnu?job=compile)
- [MacOS x86 (64-bit)](https://gitlab.com/soapbox-pub/knox/-/jobs/artifacts/main/raw/knox-x86_64-apple-darwin?job=compile)
- [MacOS ARM (64-bit)](https://gitlab.com/soapbox-pub/knox/-/jobs/artifacts/main/raw/knox-aarch64-apple-darwin?job=compile)
- [Windows x86 (64-bit)](https://gitlab.com/soapbox-pub/knox/-/jobs/artifacts/main/raw/knox-x86_64-pc-windows-msvc.exe?job=compile)

Make sure to `chmod +x` the file after downloading, and place it somewhere in your `$PATH`.

### Running with Deno

You can clone this repo, and then run `deno task knox` to run the CLI.

## Usage

```sh
knox init
knox add key alex
knox start
```

### Initialize a Bunker

To create a new `.bunker` file, run:

```sh
knox init
```

You will be prompted to enter a password. The password encrypts the bunker file, and will need to be re-entered every time you run bunker commands.

### Add a Key

```sh
knox add alex
```

Each key must have a unique nickname, like "alex" or "ditto". You will be prompted to unlock the bunker, then enter your key.

### Generate a URI

```sh
knox uri alex wss://gleasonator.dev/relay
```

Get a bunker URI you can paste into a client.

### Start the Bunker Daemon

To start the signer:

```sh
knox start
```

It will watch the `.bunker` file for changes, and update automatically whenever the file is altered.

## Design Philosophy

`knox` is a group of commands, which mainly alter an encrypted `.bunker` file. For instance, `knox add` simply modifies the bunker file.

`knox start` is a special command that starts remote signers for all the authorizations in your bunker file, and then watches the bunker file for changes.

OS file locking is used to make atomic updates to the bunker file.

## The Bunker File Format

The bunker file format uses the exact same binary format as [`NIP-49`](https://github.com/nostr-protocol/nips/blob/master/49.md), except the `plaintext` is a JSON-stringified object instead of a private key. The raw encrypted bytes (before bech32 encoding) are saved to a file with a `.bunker` extension.

The inner JSON data is structured as follows:

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

- `keys` is an array of named nsec's with timestamps.
- `authorizations` are first generated by `bunker uri` with an empty `pubkeys` array. After a client connects, the remote pubkey gets added to the array.
- `verson` is the version of the bunker file format.

## License

© Alex Gleason & other knox contributors

knox is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

knox is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with knox. If not, see <https://www.gnu.org/licenses/>.
