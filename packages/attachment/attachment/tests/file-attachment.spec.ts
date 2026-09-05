import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { AttachmentId, FileAttachmentStore } from '../src/index.ts'
import type { FileAttachmentRef, SaveFileAttachment, StoredFileAttachment } from '../src/index.ts'

class RecordingFileStore extends FileAttachmentStore {
  saveFile(_input: SaveFileAttachment): Promise<FileAttachmentRef> {
    throw new Error('not used')
  }

  readFile(_ref: FileAttachmentRef, _signal?: AbortSignal): Promise<StoredFileAttachment> {
    throw new Error('not used')
  }
}

describe('FileAttachmentStore', () => {
  it('default host path is absent without a host-file-backed provider', () => {
    const store = new RecordingFileStore(new Context())
    const ref: FileAttachmentRef = {
      attachmentId: AttachmentId(`sha256:${'0'.repeat(64)}`),
      mediaType: 'application/octet-stream',
      bytes: 1,
    }
    expect(store.fileHostPath(ref)).toBeUndefined()
  })
})
