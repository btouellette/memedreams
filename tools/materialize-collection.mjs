import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CONTRACT_ADDRESS = '0x769c54f0886757f1677eb276b357d4f926c53439'
const CHAIN_ID = 137
const ACTIVE_BASE_CID = 'bafybeige7x7n4th2fe3ly2boaqodfescukb76tkun5vkqipeibpvjsqvae'
const TOKEN_COUNT = 7800
const TOKEN_SHARD_SIZE = 1000
const MEDIA_EXTENSIONS = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
  animation_url: ['.mp4', '.webm', '.mov']
}

const args = parseArgs(process.argv.slice(2))
const repoRoot = process.cwd()
const sourceRoot = path.resolve(args.source || process.env.MEMEDREAMS_SOURCE_ROOT || 'Z:\\nft')
const outRoot = path.resolve(args.output || path.join(repoRoot, 'collection'))
const includeMedia = Boolean(args['include-media'])
const includeCars = Boolean(args['include-cars'])

const sourceMetadataDir = path.join(sourceRoot, 'unpacked_cars', ACTIVE_BASE_CID)
const sourceMediaDir = path.join(sourceRoot, 'unpacked_cars')
const sourceCarDir = path.join(sourceRoot, 'cars')
const metadataOutRoot = path.join(outRoot, 'metadata', ACTIVE_BASE_CID)
const mediaOutRoot = path.join(outRoot, 'media')
const carsOutRoot = path.join(outRoot, 'cars')
const indexOutRoot = path.join(outRoot, 'index')

fs.mkdirSync(metadataOutRoot, { recursive: true })
fs.mkdirSync(mediaOutRoot, { recursive: true })
fs.mkdirSync(carsOutRoot, { recursive: true })
fs.mkdirSync(indexOutRoot, { recursive: true })

const tokenRecords = []
const imageCids = new Set()
const animationCids = new Set()
const carCids = new Set([ACTIVE_BASE_CID])
const missing = []

const rootMetadataCarPath = carPath(ACTIVE_BASE_CID)
if (includeCars) {
  materializeCar(ACTIVE_BASE_CID)
}

for (let tokenId = 0; tokenId < TOKEN_COUNT; tokenId += 1) {
  const sourcePath = path.join(sourceMetadataDir, `${tokenId}.json`)
  if (!fs.existsSync(sourcePath)) {
    missing.push(`metadata:${tokenId}`)
    continue
  }

  const metadata = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  const metadataPath = path.join('metadata', ACTIVE_BASE_CID, tokenRange(tokenId), `${tokenId}.json`)
  copyIfNeeded(sourcePath, path.join(outRoot, metadataPath))

  const imageCid = cidFromIpfsUri(metadata.image)
  const animationCid = cidFromIpfsUri(metadata.animation_url)
  const image = imageCid ? materializeMediaRecord(imageCid, 'image') : null
  const animation = animationCid ? materializeMediaRecord(animationCid, 'animation_url') : null

  if (imageCid) imageCids.add(imageCid)
  if (animationCid) animationCids.add(animationCid)

  tokenRecords.push({
    tokenId,
    name: metadata.name,
    metadata: metadataPath.replaceAll(path.sep, '/'),
    image,
    animation,
    attributes: Array.isArray(metadata.attributes) ? metadata.attributes : []
  })
}

if (missing.length > 0) {
  throw new Error(`Missing required source files:\n${missing.slice(0, 20).join('\n')}`)
}

const tokenShardFiles = []
for (let start = 0; start < TOKEN_COUNT; start += TOKEN_SHARD_SIZE) {
  const end = Math.min(start + TOKEN_SHARD_SIZE, TOKEN_COUNT) - 1
  const shardName = `tokens-${start.toString().padStart(4, '0')}-${end.toString().padStart(4, '0')}.json`
  tokenShardFiles.push(path.join('index', shardName).replaceAll(path.sep, '/'))
  writeJson(path.join(indexOutRoot, shardName), {
    start,
    end,
    tokens: tokenRecords.slice(start, end + 1)
  })
}

writeJson(path.join(indexOutRoot, 'manifest.json'), {
  schema: 'memedreams.collection.v1',
  chainId: CHAIN_ID,
  contractAddress: CONTRACT_ADDRESS,
  activeBaseCid: ACTIVE_BASE_CID,
  activeBaseUri: `ipfs://${ACTIVE_BASE_CID}/`,
  tokenCount: TOKEN_COUNT,
  tokenShardSize: TOKEN_SHARD_SIZE,
  tokenShards: tokenShardFiles,
  includes: {
    tokenMetadata: true,
    media: includeMedia,
    cars: includeCars
  },
  paths: {
    metadataRoot: `metadata/${ACTIVE_BASE_CID}`,
    mediaRoot: 'media',
    carRoot: 'cars',
    rootMetadataCar: rootMetadataCarPath
  },
  counts: {
    imageCids: imageCids.size,
    animationCids: animationCids.size,
    stillOnlyTokens: TOKEN_COUNT - animationCids.size,
    carCids: carCids.size
  },
  carRebuild: {
    unixfsChunkSize: 262144,
    rawLeaves: true,
    wrap: false,
    note: 'Use tools/pack-car.mjs to reproduce media CAR roots from unpacked files.'
  }
})

console.log(JSON.stringify({
  output: outRoot,
  includeMedia,
  includeCars,
  tokenMetadataFiles: tokenRecords.length,
  imageCids: imageCids.size,
  animationCids: animationCids.size,
  carCids: carCids.size
}, null, 2))

function materializeMediaRecord (cid, field) {
  const sourcePath = findMediaSource(cid, MEDIA_EXTENSIONS[field])
  if (!sourcePath) {
    missing.push(`${field}:${cid}`)
    return null
  }

  const ext = path.extname(sourcePath).toLowerCase()
  const relativePath = mediaPath(cid, ext)
  const relativeCarPath = carPath(cid)
  carCids.add(cid)

  if (includeMedia) {
    copyIfNeeded(sourcePath, path.join(outRoot, relativePath))
  }
  if (includeCars) {
    materializeCar(cid)
  }

  return {
    cid,
    path: relativePath.replaceAll(path.sep, '/'),
    car: relativeCarPath
  }
}

function materializeCar (cid) {
  const sourcePath = path.join(sourceCarDir, `${cid}.car`)
  if (!fs.existsSync(sourcePath)) {
    missing.push(`car:${cid}`)
    return
  }
  copyIfNeeded(sourcePath, path.join(outRoot, carPath(cid)))
}

function findMediaSource (cid, extensions) {
  for (const ext of extensions) {
    const candidate = path.join(sourceMediaDir, `${cid}${ext}`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function mediaPath (cid, ext) {
  return path.join('media', ...cidShard(cid), `${cid}${ext}`)
}

function carPath (cid) {
  return path.join('cars', ...cidShard(cid), `${cid}.car`).replaceAll(path.sep, '/')
}

function cidShard (cid) {
  const digest = crypto.createHash('sha256').update(cid).digest('hex')
  return [digest.slice(0, 2), digest.slice(2, 4)]
}

function copyIfNeeded (source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  if (fs.existsSync(destination)) {
    const sourceStat = fs.statSync(source)
    const destinationStat = fs.statSync(destination)
    if (sourceStat.size === destinationStat.size) return
  }
  fs.copyFileSync(source, destination)
}

function tokenRange (tokenId) {
  const start = Math.floor(tokenId / TOKEN_SHARD_SIZE) * TOKEN_SHARD_SIZE
  const end = Math.min(start + TOKEN_SHARD_SIZE, TOKEN_COUNT) - 1
  return `${start.toString().padStart(4, '0')}-${end.toString().padStart(4, '0')}`
}

function cidFromIpfsUri (uri) {
  if (!uri) return null
  const normalized = String(uri).replace(/^ipfs:\/\//, '').split(/[?#]/)[0]
  return normalized.split('/')[0]
}

function writeJson (filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function parseArgs (argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
    } else {
      parsed[key] = next
      i += 1
    }
  }
  return parsed
}