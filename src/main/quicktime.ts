import { open, type FileHandle } from 'node:fs/promises'

/** Seconds between 1904-01-01 (QuickTime epoch) and 1970-01-01. */
const QT_EPOCH_OFFSET = 2082844800

interface Box {
  type: string
  start: number
  headerSize: number
  size: number
}

async function readBox(fh: FileHandle, pos: number, end: number): Promise<Box | null> {
  if (pos + 8 > end) return null
  const head = Buffer.alloc(16)
  const { bytesRead } = await fh.read(head, 0, 16, pos)
  if (bytesRead < 8) return null
  let size = head.readUInt32BE(0)
  const type = head.toString('latin1', 4, 8)
  let headerSize = 8
  if (size === 1) {
    if (bytesRead < 16) return null
    size = Number(head.readBigUInt64BE(8))
    headerSize = 16
  } else if (size === 0) {
    size = end - pos
  }
  if (size < headerSize) return null
  return { type, start: pos, headerSize, size }
}

async function findChild(fh: FileHandle, start: number, end: number, type: string): Promise<Box | null> {
  let pos = start
  while (pos < end) {
    const box = await readBox(fh, pos, end)
    if (!box) return null
    if (box.type === type) return box
    pos += box.size
  }
  return null
}

/**
 * Reads the creation time from an MP4/MOV file's `moov/mvhd` box.
 * Returns ms since epoch, or null when missing or zero (many tools leave it unset).
 */
export async function readQuickTimeCreated(path: string): Promise<number | null> {
  const fh = await open(path, 'r')
  try {
    const { size: fileSize } = await fh.stat()
    const moov = await findChild(fh, 0, fileSize, 'moov')
    if (!moov) return null
    const mvhd = await findChild(fh, moov.start + moov.headerSize, moov.start + moov.size, 'mvhd')
    if (!mvhd) return null
    const body = Buffer.alloc(12)
    await fh.read(body, 0, 12, mvhd.start + mvhd.headerSize)
    const version = body.readUInt8(0)
    const secs = version === 1 ? Number(body.readBigUInt64BE(4)) : body.readUInt32BE(4)
    if (!secs) return null
    const ms = (secs - QT_EPOCH_OFFSET) * 1000
    return ms > 0 ? ms : null
  } finally {
    await fh.close()
  }
}
