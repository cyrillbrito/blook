#!/bin/sh
# Renders the logo (packages/ui/src/icon.svg) to public/icon/<size>.png, where WXT picks up the extension icons.
# Needs rsvg-convert (brew install librsvg). Run after editing icon.svg.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/icon
for s in 16 32 48; do rsvg-convert -w $s -h $s ../ui/src/icon.svg -o public/icon/$s.png; done
# 128: 96 px artwork with 16 px transparent padding, as the Chrome Web Store asks. The store listing uses the same file.
rsvg-convert -w 96 -h 96 --page-width 128 --page-height 128 --left 16 --top 16 ../ui/src/icon.svg -o public/icon/128.png
cp public/icon/128.png ../../store/images/store-icon-128.png
