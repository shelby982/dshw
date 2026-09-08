/** Auto-register a produced file as a preview attachment. */
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { previewKindOf, mediaTypeOf } from '@deepseek-ai/dsh-preview'
import { basename } from 'node:path'

/** One durable produced-file preview record, matching the `previews` meta payload. */
export type ProducedPreviewRecord = Record<string, JsonValue>

/**
 * Store a produced file's bytes as a content-addressed preview attachment when
 * the optional file-attachment service is mounted, and return the preview record
 * for the tool's result `previews` meta.
 * @param ctx - plugin context (reads the optional `fileAttachments` service).
 * @param filePath - the workspace-relative produced-file path (drives the media type).
 * @param data - the produced file bytes.
 * @returns the preview record, or undefined when no file-attachment service is mounted.
 */
export async function registerProducedPreview(
  ctx: Context,
  filePath: string,
  data: Uint8Array,
): Promise<ProducedPreviewRecord | undefined> {
  const fileAttachments = ctx.get('fileAttachments')
  if (fileAttachments === undefined) return undefined
  const ref = await fileAttachments.saveFile({
    data,
    mediaType: mediaTypeOf(filePath),
    name: basename(filePath),
  })
  return {
    attachment: {
      attachmentId: ref.attachmentId,
      mediaType: ref.mediaType,
      bytes: ref.bytes,
      ...ref.name !== undefined ? { name: ref.name } : {},
    },
    kind: previewKindOf(ref.mediaType),
  }
}
