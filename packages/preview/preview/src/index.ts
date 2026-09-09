/**
 * Preview contract for produced-file attachments. This package owns the
 * Definition role of the preview seam: the tool-result `meta` payload shape and
 * the pure readers both the registrant (a produced-file tool) and the
 * consumers (session authorization and the browser renderer) share. Concrete
 * preview rendering stays with `@deepseek-ai/dsh-preview-local` and the
 * `ui-preview` client module; this package carries only the durable contract.
 *
 * @module @deepseek-ai/dsh-preview
 */

import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** Rendering hint for one produced preview, inferred from the media type or declared by the producer. */
export type PreviewKind = 'image' | 'html' | 'pptx' | 'text' | 'json' | 'file' | (string & {})

/** One produced file registered as a previewable attachment on a tool result. */
export interface ProducedPreview {
  /** Durable content-addressed file attachment reference. */
  attachment: FileAttachmentRef
  /** Rendering hint for the consuming browser; may be omitted and inferred from the media type. */
  kind?: PreviewKind
}

/** Tool-result `meta` payload carrying produced, previewable files. */
export interface ProducedPreviewMeta {
  previews: readonly ProducedPreview[]
}

/** Whether a runtime value is a structurally valid {@link ProducedPreview}. */
function isProducedPreview(value: unknown): value is ProducedPreview {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const attachment = record.attachment
  if (typeof attachment !== 'object' || attachment === null || Array.isArray(attachment)) return false
  const ref = attachment as Record<string, unknown>
  return typeof ref.attachmentId === 'string' && typeof ref.mediaType === 'string' && typeof ref.bytes === 'number'
}

/**
 * Narrow opaque tool-result metadata to produced previews.
 * @param meta - the tool result's opaque `meta` payload.
 * @returns the produced previews, or undefined when the payload is absent or malformed.
 */
export function previewsFromMeta(meta: unknown): ProducedPreview[] | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const previews = (meta as Record<string, unknown>).previews
  if (!Array.isArray(previews)) return undefined
  const out: ProducedPreview[] = []
  for (const entry of previews) {
    if (!isProducedPreview(entry)) return undefined
    out.push({ attachment: entry.attachment, ...entry.kind !== undefined ? { kind: entry.kind } : {} })
  }
  return out
}

/**
 * Infer the MIME type of a produced file from its path extension.
 * @param path - the produced-file path or name.
 * @returns the MIME type, or `application/octet-stream` for an unknown extension.
 */
export function mediaTypeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    case '.svg': return 'image/svg+xml'
    case '.html':
    case '.htm': return 'text/html'
    case '.json': return 'application/json'
    case '.txt':
    case '.md': return 'text/plain'
    case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    default: return 'application/octet-stream'
  }
}

/**
 * Infer the rendering hint for one produced file from its MIME type.
 * @param mediaType - the verified MIME type of the produced file.
 * @returns the {@link PreviewKind} that best matches the media type.
 */
export function previewKindOf(mediaType: string): PreviewKind {
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType === 'text/html') return 'html'
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) return 'json'
  if (mediaType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx'
  if (mediaType.startsWith('text/')) return 'text'
  return 'file'
}
