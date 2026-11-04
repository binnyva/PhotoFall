import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readQuickTimeCreated } from '../src/main/quicktime'

function box(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + body.length, 0)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}

function mvhd(version: 0 | 1, qtSeconds: number): Buffer {
  const body = Buffer.alloc(version === 1 ? 28 : 16)
  body.writeUInt8(version, 0)
  if (version === 1) body.writeBigUInt64BE(BigInt(qtSeconds), 4)
  else body.writeUInt32BE(qtSeconds, 4)
  return box('mvhd', body)
}

const dir = mkdtempSync(join(tmpdir(), 'pf-qt-'))
const file = (name: string, data: Buffer): string => {
  const p = join(dir, name)
  writeFileSync(p, data)
  return p
}

// 2024-03-14T10:00:00Z
const when = Date.UTC(2024, 2, 14, 10, 0, 0)
const qt = when / 1000 + 2082844800

describe('readQuickTimeCreated', () => {
  it('reads a version 0 mvhd after other boxes', async () => {
    const data = Buffer.concat([
      box('ftyp', Buffer.from('qt  ')),
      box('mdat', Buffer.alloc(100)),
      box('moov', Buffer.concat([box('udta', Buffer.alloc(4)), mvhd(0, qt)]))
    ])
    expect(await readQuickTimeCreated(file('a.mov', data))).toBe(when)
  })

  it('reads a version 1 mvhd', async () => {
    const data = Buffer.concat([box('ftyp', Buffer.alloc(4)), box('moov', mvhd(1, qt))])
    expect(await readQuickTimeCreated(file('b.mp4', data))).toBe(when)
  })

  it('returns null when unset or missing', async () => {
    expect(await readQuickTimeCreated(file('c.mp4', box('moov', mvhd(0, 0))))).toBeNull()
    expect(await readQuickTimeCreated(file('d.mp4', box('ftyp', Buffer.alloc(4))))).toBeNull()
    expect(await readQuickTimeCreated(file('e.mp4', Buffer.from('not a movie')))).toBeNull()
  })
})
