#!/bin/sh
# Copyright 2019 the Deno authors. Modified by Alex Gleason for Knox. All rights reserved. MIT license.
# TODO(everyone): Keep this script simple and easily auditable.

set -e

if [ "$OS" = "Windows_NT" ]; then
	target="x86_64-pc-windows-msvc"
else
	case $(uname -sm) in
	"Darwin x86_64") target="x86_64-apple-darwin" ;;
	"Darwin arm64") target="aarch64-apple-darwin" ;;
	"Linux aarch64") target="aarch64-unknown-linux-gnu" ;;
	*) target="x86_64-unknown-linux-gnu" ;;
	esac
fi

ref="${1:-main}"
knox_uri="https://gitlab.com/soapbox-pub/knox/-/jobs/artifacts/${ref}/raw/knox-${target}?job=compile"
knox_install="${KNOX_INSTALL:-/usr/local/bin}"
exe="$knox_install/knox"

sudo curl --fail --location --progress-bar --output "$exe" "$knox_uri"
sudo chmod +x "$exe"

echo "knox was installed successfully to $exe"
