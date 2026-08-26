import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = parseArgs(process.argv.slice(2))
const collectionRoot = path.resolve(args.collection || 'collection')
const manifestPath = path.join(collectionRoot, 'index', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const verifyCarRoots = Boolean(args['verify-car-roots'])

const errors = []
let tokenCount = 0
let imageRefs = 0
let animationRefs = 0
let carRefs = 0

if (!fs.existsSync(path.join(collectionRoot, manifest.paths.metadataRoot))) {
  errors.push(`missing metadata root: ${manifest.paths.metadataRoot}`)
}

if (manifest.includes?.cars) {
  requireFile(manifest.paths.rootMetadataCar, `root-car:${manifest.activeBaseCid}`)
  carRefs += 1
  if (verifyCarRoots) verifyCarRoot(manifest.paths.rootMetadataCar, manifest.activeBaseCid)
}

for (const shard of manifest.tokenShards) {
  const shardPath = path.join(collectionRoot, shard)
  if (!fs.existsSync(shardPath)) {
    errors.push(`missing token shard: ${shard}`)
    continue
  }

  const tokenShard = JSON.parse(fs.readFileSync(shardPath, 'utf8'))
  for (const token of tokenShard.tokens) {
    tokenCount += 1
    requireFile(token.metadata, `metadata:${token.tokenId}`)
    if (token.image) {
      imageRefs += 1
      requireFile(token.image.path, `image:${token.tokenId}:${token.image.cid}`)
      if (manifest.includes?.cars) {
        carRefs += 1
        requireFile(token.image.car, `image-car:${token.tokenId}:${token.image.cid}`)
      }
    }
    if (token.animation) {
      animationRefs += 1
      requireFile(token.animation.path, `animation:${token.tokenId}:${token.animation.cid}`)
      if (manifest.includes?.cars) {
        carRefs += 1
        requireFile(token.animation.car, `animation-car:${token.tokenId}:${token.animation.cid}`)
      }
    }
  }
}

if (tokenCount !== manifest.tokenCount) {
  errors.push(`expected ${manifest.tokenCount} tokens, found ${tokenCount}`)
}

const result = {
  collectionRoot,
  tokenCount,
  imageRefs,
  animationRefs,
  carRefs,
  errors: errors.length
}

if (errors.length > 0) {
  result.sampleErrors = errors.slice(0, 20)
  console.error(JSON.stringify(result, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify(result, null, 2))
}

function requireFile (relativePath, label) {
  if (!relativePath || !fs.existsSync(path.join(collectionRoot, relativePath))) {
    errors.push(`${label} missing ${relativePath || ''}`.trim())
  }
}

function verifyCarRoot (relativePath, expectedCid) {
  const carPath = path.join(collectionRoot, relativePath)
  const result = spawnSync('npx', ['ipfs-car', 'roots', carPath], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  if (result.status !== 0) {
    errors.push(`car-root-check failed ${relativePath}: ${result.stderr || result.stdout}`.trim())
    return
  }
  const actual = result.stdout.trim().split(/\s+/)[0]
  if (actual !== expectedCid) {
    errors.push(`car root mismatch ${relativePath}: expected ${expectedCid}, found ${actual}`)
  }
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