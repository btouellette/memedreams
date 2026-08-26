import fs from 'node:fs'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import * as UnixFS from '@ipld/unixfs'
import { withMaxChunkSize } from '@ipld/unixfs/file/chunker/fixed'
import { withWidth } from '@ipld/unixfs/file/layout/balanced'
import { CarWriter } from '@ipld/car/writer'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { CAREncoderStream, createFileEncoderStream } from 'ipfs-car'

const PLACEHOLDER_CID = CID.parse('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
const DEFAULT_CHUNK_SIZE = 262144
const args = parseArgs(process.argv.slice(2))

if (!args.input || !args.output) {
  console.error('Usage: npm run collection:pack-car -- --input <file> --output <file.car> [--chunk-size 262144]')
  process.exit(1)
}

const input = path.resolve(args.input)
const output = path.resolve(args.output)
const chunkSize = Number(args['chunk-size'] || DEFAULT_CHUNK_SIZE)
const settings = UnixFS.configure({
  fileChunkEncoder: raw,
  smallFileEncoder: raw,
  chunker: withMaxChunkSize(chunkSize),
  fileLayout: withWidth(1024)
})

fs.mkdirSync(path.dirname(output), { recursive: true })

let rootCid
await createFileEncoderStream(fileLike(input), settings)
  .pipeThrough(new TransformStream({
    transform (block, controller) {
      rootCid = block.cid
      controller.enqueue(block)
    }
  }))
  .pipeThrough(new CAREncoderStream([PLACEHOLDER_CID]))
  .pipeTo(Writable.toWeb(fs.createWriteStream(output)))

const fd = await fs.promises.open(output, 'r+')
await CarWriter.updateRootsInFile(fd, [rootCid])
await fd.close()

console.log(rootCid.toString())

function fileLike (filePath) {
  return {
    stream () {
      return Readable.toWeb(fs.createReadStream(filePath))
    }
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

