import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { registerProducedPreview } from '../src/preview.ts'

afterEach(() => vi.clearAllMocks())

describe('registerProducedPreview', () => {
  it('returns undefined when no file-attachment service is mounted', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    await expect(registerProducedPreview(ctx, 'a.html', new Uint8Array([1]))).resolves.toBeUndefined()
  })

  it('stores the produced file and returns its preview record', async () => {
    const saveFile = vi.fn<(i: { data: Uint8Array; mediaType: string; name: string }) => Promise<FileAttachmentRef>>()
      .mockResolvedValue({ attachmentId: AttachmentId('sha256:mock'), mediaType: 'text/html', bytes: 1, name: 'a.html' })
    const ctx = { get: () => ({ saveFile }) } as unknown as Context
    const record = await registerProducedPreview(ctx, 'a.html', new Uint8Array([1]))
    expect(record).toEqual({
      attachment: { attachmentId: AttachmentId('sha256:mock'), mediaType: 'text/html', bytes: 1, name: 'a.html' },
      kind: 'html',
    })
    expect(saveFile).toHaveBeenCalledWith({ data: new Uint8Array([1]), mediaType: 'text/html', name: 'a.html' })
  })

  it('omits the display name when the store returns none', async () => {
    const saveFile = vi.fn<(i: { data: Uint8Array; mediaType: string; name: string }) => Promise<FileAttachmentRef>>()
      .mockResolvedValue({ attachmentId: AttachmentId('sha256:mock'), mediaType: 'application/json', bytes: 1 })
    const ctx = { get: () => ({ saveFile }) } as unknown as Context
    const record = await registerProducedPreview(ctx, 'data.json', new Uint8Array([1]))
    expect(record).toEqual({
      attachment: { attachmentId: AttachmentId('sha256:mock'), mediaType: 'application/json', bytes: 1 },
      kind: 'json',
    })
  })
})
