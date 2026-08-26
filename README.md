# meme dreams archive

This repository is the raw archive for the Meme Dreams NFT collection. The [public site repository](https://github.com/btouellette/memedreams.io) is maintained separately, and the live site is available at [btouellette.github.io/memedreams.io](https://btouellette.github.io/memedreams.io/). This repo stores the active collection payload in a layout that supports a browser/explorer and allows the collection’s CAR archives to be regenerated from the unpacked media bytes.

## Active collection

Polygon contract:

`0x769c54f0886757f1677eb276b357d4f926c53439`

Current on-chain base URI:

`ipfs://bafybeige7x7n4th2fe3ly2boaqodfescukb76tkun5vkqipeibpvjsqvae/`

Archive layout:

- `collection/index/manifest.json` describes the active collection, shard paths, counts, and CAR rebuild settings.
- `collection/index/tokens-*.json` are browser-friendly token shards for an explorer.
- `collection/metadata/<root-cid>/<range>/<token>.json` stores individual token metadata files.
- `collection/media/<shard>/<cid>.<ext>` stores unpacked image and animation bytes.
- `collection/cars/<shard>/<cid>.car` stores CAR archives for the active root metadata CID plus every referenced image and animation CID.

## Verify

```sh
npm install
npm run collection:verify
```

## Rebuild a media CAR

The original media CARs use UnixFS raw leaves with 256 KiB chunks. Use the provided script instead of a default `ipfs-car pack` command:

```sh
npm run collection:pack-car -- --input collection/media/07/d1/bafybeidfjlr3fmdzbog2imujrt6zbsmwvpzqbu42outl545gfqpak4cjd4.png --output tmp/rebuilt.car
```

The script prints the root CID. It should match the CID in the filename.
