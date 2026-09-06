import { describe, expect, it } from 'vitest'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { previewKindOf, previewsFromMeta } from '../src/index.ts'

const FILE: FileAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'0'.repeat(64)}`),
  mediaType: 'application/octet-stream',
  bytes: 4,
}

describe('previewsFromMeta', () => {
  it('reads a produced-preview payload from opaque meta', () => {
    const meta = { previews: [{ attachment: FILE, kind: 'file' }] }
    expect(previewsFromMeta(meta)).toEqual([{ attachment: FILE, kind: 'file' }])
  })

  it('omits the kind when the producer declares none', () => {
    const meta = { previews: [{ attachment: FILE }] }
    expect(previewsFromMeta(meta)).toEqual([{ attachment: FILE }])
  })

  it('returns undefined for absent or non-object metadata', () => {
    expect(previewsFromMeta(undefined)).toBeUndefined()
    expect(previewsFromMeta(null)).toBeUndefined()
    expect(previewsFromMeta([FILE])).toBeUndefined()
    expect(previewsFromMeta('x')).toBeUndefined()
  })

  it('returns undefined when previews is absent or not an array', () => {
    expect(previewsFromMeta({})).toBeUndefined()
    expect(previewsFromMeta({ previews: FILE })).toBeUndefined()
  })

  it('rejects a malformed preview entry', () => {
    const meta = { previews: [{ attachment: { mediaType: 'text/plain' } }] }
    expect(previewsFromMeta(meta)).toBeUndefined()
    expect(previewsFromMeta({ previews: [{ attachment: [FILE] }] })).toBeUndefined()
    expect(previewsFromMeta({ previews: [{ attachment: { ...FILE, bytes: undefined } }] })).toBeUndefined()
    expect(previewsFromMeta({ previews: [null] })).toBeUndefined()
    expect(previewsFromMeta({ previews: [[]] })).toBeUndefined()
  })
})

describe('previewKindOf', () => {
  it('classifies each known media type', () => {
    expect(previewKindOf('image/png')).toBe('image')
    expect(previewKindOf('text/html')).toBe('html')
    expect(previewKindOf('application/json')).toBe('json')
    expect(previewKindOf('application/problem+json')).toBe('json')
    expect(previewKindOf('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('pptx')
    expect(previewKindOf('text/markdown')).toBe('text')
  })

  it('defaults unknown media types to file', () => {
    expect(previewKindOf('application/pdf')).toBe('file')
  })
})
