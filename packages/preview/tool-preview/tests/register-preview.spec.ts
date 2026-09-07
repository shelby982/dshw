import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { registerPreview } from '../src/index.ts'

const { mockConvertPptxToPng } = vi.hoisted(() => ({
  mockConvertPptxToPng: vi.fn<(data: Uint8Array) => Promise<Uint8Array | undefined>>(),
}))
vi.mock('../src/convert.ts', async (importActual) => {
  const actual = await importActual<typeof import('../src/convert.ts')>()
  return { ...actual, convertPptxToPng: mockConvertPptxToPng }
})

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

function fileRef(mediaType: string, name: string): FileAttachmentRef {
  return { attachmentId: AttachmentId('sha256:mock'), mediaType, bytes: 1, name }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('registerPreview', () => {
  it('converts a PPTX to a PNG thumbnail when the stack succeeds', async () => {
    mockConvertPptxToPng.mockResolvedValue(new TextEncoder().encode('PNGDATA'))
    const save = vi.fn<(i: { data: Uint8Array; mediaType: string; name: string }) => Promise<FileAttachmentRef>>()
      .mockResolvedValue(fileRef('image/png', 'deck.png'))
    const ctx = { fileAttachments: { saveFile: save } } as unknown as Context
    const ref = await registerPreview(ctx, 'deck.pptx', new Uint8Array([1]), undefined)
    expect(save).toHaveBeenCalledWith({ data: new TextEncoder().encode('PNGDATA'), mediaType: 'image/png', name: 'deck.png' })
    expect(ref.mediaType).toBe('image/png')
  })

  it('falls back to the original PPTX when the conversion stack is unavailable', async () => {
    mockConvertPptxToPng.mockResolvedValue(undefined)
    const save = vi.fn<(i: { data: Uint8Array; mediaType: string; name: string }) => Promise<FileAttachmentRef>>()
      .mockResolvedValue(fileRef(PPTX, 'deck.pptx'))
    const ctx = { fileAttachments: { saveFile: save } } as unknown as Context
    const ref = await registerPreview(ctx, 'deck.pptx', new Uint8Array([9]), undefined)
    expect(save).toHaveBeenCalledWith({ data: new Uint8Array([9]), mediaType: PPTX, name: 'deck.pptx' })
    expect(ref.mediaType).toBe(PPTX)
  })

  it('registers a non-PPTX file directly', async () => {
    const save = vi.fn<(i: { data: Uint8Array; mediaType: string; name: string }) => Promise<FileAttachmentRef>>()
      .mockResolvedValue(fileRef('text/html', 'a.html'))
    const ctx = { fileAttachments: { saveFile: save } } as unknown as Context
    const ref = await registerPreview(ctx, 'a.html', new Uint8Array([1]), undefined)
    expect(save).toHaveBeenCalledWith({ data: new Uint8Array([1]), mediaType: 'text/html', name: 'a.html' })
    expect(mockConvertPptxToPng).not.toHaveBeenCalled()
    expect(ref.mediaType).toBe('text/html')
  })
})
