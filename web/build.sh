#!/bin/sh
set -e

version=$(cat ../VERSION 2>/dev/null || cat VERSION 2>/dev/null || echo "dev")
cd "$(dirname "$0")/wavy"

if [ ! -d node_modules ]; then
    bun install --frozen-lockfile
fi

VITE_REACT_APP_VERSION="$version" bun run build
echo "Built wavy → web/build/wavy/"
