import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { LocalFileAttachmentStore } from '../src/index.ts'
import {
  commitFileObject,
  fileObjectPath,
  prepareFileObject,
  readFileObject,
} from '../src/store.ts'

const DATA = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const HOMES: string[] = []

async function home(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'dsh-file-'))
  HOMES.push(value)
  return value
}

function storageRootOf(homeDir: string): string {
  return join(homeDir, 'attachments', 'v1')
}

afterEach(async () => {
  await Promise.all(HOMES.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('general file attachment objects', () => {
  it('publishes a private content-addressed object and reads it back', async () => {
    const homeDir = await home()
    const storageRoot = storageRootOf(homeDir)
    const prepared = prepareFileObject({ data: DATA, mediaType: PPTX_MIME, name: '/tmp/slides.pptx' })
    const ref = await commitFileObject(storageRoot, prepared.ref, prepared.data)
    const sha256 = createHash('sha256').update(DATA).digest('hex')

    expect(String(ref.attachmentId)).toBe(`sha256:${sha256}`)
    expect(ref.mediaType).toBe(PPTX_MIME)
    expect(ref.bytes).toBe(DATA.byteLength)
    expect(ref.name).toBe('slides.pptx')

    const stored = await readFileObject(storageRoot, ref)
    expect(stored.data).toEqual(DATA)
    expect(fileObjectPath(storageRoot, ref))
      .toBe(join(storageRoot, 'objects', sha256.slice(0, 2), sha256))
    expect(new Uint8Array(await readFile(fileObjectPath(storageRoot, ref)))).toEqual(DATA)
  })

  it('deduplicates equal bytes into one object', async () => {
    const storageRoot = storageRootOf(await home())
    const aPrepared = prepareFileObject({ data: DATA, mediaType: PPTX_MIME })
    const bPrepared = prepareFileObject({ data: DATA, mediaType: PPTX_MIME })
    const a = await commitFileObject(storageRoot, aPrepared.ref, aPrepared.data)
    const b = await commitFileObject(storageRoot, bPrepared.ref, bPrepared.data)
    expect(b.attachmentId).toBe(a.attachmentId)
  })

  it('refuses a reference whose bytes do not match the content hash', async () => {
    const storageRoot = storageRootOf(await home())
    const sha256 = createHash('sha256').update(DATA).digest('hex')
    const ref: FileAttachmentRef = {
      attachmentId: AttachmentId(`sha256:${sha256}`),
      mediaType: PPTX_MIME,
      bytes: DATA.byteLength,
    }
    await expect(commitFileObject(storageRoot, ref, Uint8Array.from([0xff])))
      .rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })
  })

  it('refuses a reference whose recorded byte length mismatches the stored object', async () => {
    const storageRoot = storageRootOf(await home())
    const prepared = prepareFileObject({ data: DATA, mediaType: PPTX_MIME })
    await commitFileObject(storageRoot, prepared.ref, prepared.data)
    const mismatched: FileAttachmentRef = { ...prepared.ref, bytes: prepared.ref.bytes + 1 }
    await expect(readFileObject(storageRoot, mismatched)).rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })
  })

  it('reports a missing object as not found', async () => {
    const storageRoot = storageRootOf(await home())
    const prepared = prepareFileObject({ data: DATA, mediaType: PPTX_MIME })
    const ref = await commitFileObject(storageRoot, prepared.ref, prepared.data)
    await rm(fileObjectPath(storageRoot, ref), { force: true })
    await expect(readFileObject(storageRoot, ref)).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' })
  })

  it('strips a display name to its basename and discards a name reduced to control bytes', async () => {
    const named = prepareFileObject({ data: DATA, mediaType: PPTX_MIME, name: 'c:\\dir\\slides.pptx' })
    expect(named.ref.name).toBe('slides.pptx')
    const unnamed = prepareFileObject({ data: DATA, mediaType: PPTX_MIME, name: '\u0000\u0001' })
    expect(unnamed.ref.name).toBeUndefined()
  })
})

describe('LocalFileAttachmentStore', () => {
  it('saves, reads, and resolves host paths for general files', async () => {
    const homeDir = await home()
    const store = new LocalFileAttachmentStore(new Context(), { dshHome: homeDir })
    const ref = await store.saveFile({ data: DATA, mediaType: PPTX_MIME, name: 'slides.pptx' })
    const stored = await store.readFile(ref)
    expect(stored.data).toEqual(DATA)
    expect(store.fileHostPath(ref)).toBe(fileObjectPath(storageRootOf(homeDir), ref))
  })
})
