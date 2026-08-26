# meme dreams collection archive

This directory is designed to hold a Git-friendly, unpacked mirror of the active meme dreams metadata and media.

The current on-chain Polygon contract base URI is:

`ipfs://bafybeige7x7n4th2fe3ly2boaqodfescukb76tkun5vkqipeibpvjsqvae/`

Layout:

- `index/manifest.json` records the contract, active metadata root CID, media counts, shard names, and rebuild settings.
- `index/tokens-*.json` are browser-friendly token maps for the future collection explorer.
- `metadata/<root-cid>/<range>/<token>.json` stores each token metadata document with a friendly extension.
- `media/<sha256-prefix>/<sha256-prefix>/<cid>.<ext>` stores unpacked image and animation bytes without wide directories.

CAR rebuild notes:

The original media CAR roots use UnixFS with raw leaves and a 256 KiB chunk size. A naive `ipfs-car pack --no-wrap` may produce different roots because newer defaults use larger chunks. Use:

```sh
npm run collection:pack-car -- --input collection/media/<shard>/<cid>.png --output tmp/<cid>.car
```

To materialize this archive from the local NAS mirror:

```sh
npm run collection:materialize -- --source Z:\nft --include-media
npm run collection:verify
```
