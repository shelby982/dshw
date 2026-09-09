/** Session-scoped durable preview-file URL cache shared by the preview row. */
import type { Context } from '@deepseek-ai/cordis'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions, SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { bytesToBase64 } from '@deepseek-ai/dsh-util-crypto'

/** One decodable, displayable produced preview resolved from durable bytes. */
export interface LoadedPreviewFile {
  /** Browser URL (blob, or data-URL fallback) valid until the Session scope is released. */
  readonly url: string
  /** Decoded bytes behind the reference. */
  readonly data: Uint8Array
  /** Verified MIME type of the bytes. */
  readonly mediaType: string
  /** Optional display name. */
  readonly name?: string
}

interface Entry {
  readonly sessionId: SessionId
  current?: LoadedPreviewFile
  pending: Promise<LoadedPreviewFile>
}

/** Resolve durable produced-file references and release their browser URLs with Session scope. */
export class PreviewFileCache {
  private readonly entries = new Map<string, Entry>()
  private readonly scopeDisposers = new Map<SessionId, () => void>()
  private disposed = false

  /**
   * @param ctx - Owning ui-preview fiber.
   * @param sessions - Session Controller object layer.
   */
  constructor(ctx: Context, private readonly sessions: ISessions) {
    ctx.effect(() => () => { this.dispose() }, 'ui-preview preview file cache')
  }

  /**
   * Resolve and cache one session-authorized preview URL.
   * @param sessionId - Session authorization and lifetime scope.
   * @param attachment - Durable preview reference.
   * @returns the loaded content, valid until the Session binding is released.
   */
  resolve(sessionId: SessionId, attachment: FileAttachmentRef): Promise<LoadedPreviewFile> {
    if (this.disposed) return Promise.reject(new Error('ui-preview preview cache is disposed'))
    const key = this.key(sessionId, attachment)
    const cached = this.entries.get(key)
    if (cached !== undefined) return cached.pending
    const binding = this.sessions.binding(sessionId)
    if (binding === undefined) {
      return Promise.reject(new Error(`ui-preview: unknown session "${sessionId}"`))
    }
    this.bindScope(sessionId, binding.ctx)
    const entry: Entry = { sessionId, pending: Promise.resolve({ url: '', data: new Uint8Array(), mediaType: '' }) }
    this.entries.set(key, entry)
    entry.pending = this.loadCanonical(key, entry, attachment, binding)
    return entry.pending
  }

  /**
   * Return an already-loaded preview without starting a read.
   * @param sessionId - Session authorization and lifetime scope.
   * @param attachment - Durable preview reference.
   * @returns loaded content when cached.
   */
  peek(sessionId: SessionId, attachment: FileAttachmentRef): LoadedPreviewFile | undefined {
    return this.entries.get(this.key(sessionId, attachment))?.current
  }

  private key(sessionId: SessionId, attachment: FileAttachmentRef): string {
    return `${sessionId}:${attachment.attachmentId}`
  }

  private loadCanonical(
    key: string,
    entry: Entry,
    attachment: FileAttachmentRef,
    binding: SessionBinding,
  ): Promise<LoadedPreviewFile> {
    return binding.session.readPreviewFile(attachment.attachmentId)
      .then((result) => {
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        this.assertLive()
        const data = Uint8Array.from(result.value.data)
        const mediaType = result.value.attachment.mediaType
        const loaded: LoadedPreviewFile = {
          url: this.urlOf(data, mediaType),
          data,
          mediaType,
          ...result.value.attachment.name === undefined ? {} : { name: result.value.attachment.name },
        }
        this.assertLive()
        entry.current = loaded
        return loaded
      })
      .catch((error: unknown) => {
        if (this.entries.get(key) === entry && entry.current === undefined) this.entries.delete(key)
        throw error
      })
  }

  private urlOf(data: Uint8Array, mediaType: string): string {
    if (typeof URL.createObjectURL !== 'function') {
      return `data:${mediaType};base64,${bytesToBase64(data)}`
    }
    const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: mediaType }))
    return url
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('ui-preview preview cache was disposed before loading completed')
  }

  private bindScope(sessionId: SessionId, scope: Context): void {
    if (this.scopeDisposers.has(sessionId)) return
    const dispose = scope.effect(() => () => {
      this.scopeDisposers.delete(sessionId)
      this.release(sessionId)
    }, 'ui-preview preview file scope')
    this.scopeDisposers.set(sessionId, () => { void dispose() })
  }

  private release(sessionId: SessionId): void {
    for (const [key, entry] of this.entries) {
      if (entry.sessionId !== sessionId) continue
      this.entries.delete(key)
      if (entry.current !== undefined) revokeUrl(entry.current.url)
    }
  }

  /**
   * Release every cached URL and clear all entries. Idempotent; safe to call
   * once the owning fiber teardown or a test has finished with the cache.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const dispose of [...this.scopeDisposers.values()]) dispose()
    this.scopeDisposers.clear()
    this.entries.clear()
  }
}

function revokeUrl(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}
