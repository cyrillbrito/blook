#!/bin/sh
# Renders icon.svg to public/icon/<size>.png, where WXT picks up the extension icons.
# Needs rsvg-convert (brew install librsvg). Run after editing icon.svg.
set -e
cd "$(dirname "$0")"
mkdir -p ../../public/icon
for s in 16 32 48 128; do rsvg-convert -w $s -h $s icon.svg -o ../../public/icon/$s.png; done
