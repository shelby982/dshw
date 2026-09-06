/**
 * Model-facing `preview_files` tool: registers produced files as previewable
 * Web attachments. It reads each file from the session workspace, stores the
 * bytes in the content-addressed `ctx.fileAttachments` service, and records the
 * durable references as the tool result's private `previews` metadata — so the
 * browser renderer can rebuild a preview from the session log without any
 * model-visible content carrying the file digest.
 *
 * @module @deepseek-ai/dsh-tool-preview
 */

import { basename } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { previewKindOf } from '@deepseek-ai/dsh-preview'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-fs'

/** Default cap on bytes read for one produced file. */
export const DEFAULT_MAX_PREVIEW_BYTES = 20 * 1024 * 1024

/** Tool-preview deployment configuration. */
export interface Config {
  /** Maximum bytes read for one produced file. Default: 20 MiB. */
  maxPreviewBytes: number
}

export const Config: z<Config> = z.object({
  maxPreviewBytes: z.number().step(1).min(1).default(DEFAULT_MAX_PREVIEW_BYTES),
})

/** Services required before the tool registers. */
export const inject = ['tools', 'fs', 'fileAttachments'] as const

/** Stable Cordis plugin name. */
export const name = 'tool-preview'

/** Map a produced file's extension to the MIME type stored with its attachment. */
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

/** The tool's executed value: out-of-band previews ride the result metadata, not the model view. */
interface PreviewValue {
  previewed: number
  previews: Record<string, JsonValue>[]
}

/** A produced preview as a JSON-serializable record (a durable attachment ref plus a kind hint). */
function previewRecord(ref: {
  attachmentId: unknown
  mediaType: string
  bytes: number
  name?: string
}, kind: string): Record<string, JsonValue> {
  return {
    attachment: {
      attachmentId: ref.attachmentId as JsonValue,
      mediaType: ref.mediaType,
      bytes: ref.bytes,
      ...ref.name !== undefined ? { name: ref.name } : {},
    },
    kind,
  }
}

/** Format the model-facing confirmation text. */
function formatPreviewed(count: number): string {
  return count === 1
    ? 'Registered 1 produced file for in-app preview.'
    : `Registered ${String(count)} produced files for in-app preview.`
}

/**
 * Register the `preview_files` tool.
 * @param ctx - plugin context carrying tools, fs, and file-attachment services.
 * @param config - validated deployment configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'preview_files',
    description: 'Register produced files (images, HTML, slides, documents) so the user can preview their rendered content in the Web GUI.',
    parameters: {
      files: {
        type: 'array',
        items: { type: 'string', description: 'Workspace-relative path of a produced file to register for preview.' },
        required: true,
        description: 'Produced file paths to make previewable.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          previewed: { type: 'integer', required: true },
          previews: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
            required: true,
          },
        },
      },
      render: (_args, value: PreviewValue) => [{ type: 'text', text: formatPreviewed(value.previewed) }],
      presentationMeta: (_args, value: PreviewValue) => ({ previews: value.previews }) as never,
    },
    async execute(args: { files: string[] }, exec: ToolExecution): Promise<PreviewValue> {
      const cwd = exec.agent?.session.header.cwd
      const previews: Record<string, JsonValue>[] = []
      for (const file of args.files) {
        const target = await ctx.fs.resolve(file, { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal })
        const data = await ctx.fs.readBytes(target, exec.signal, config.maxPreviewBytes)
        const ref = await ctx.fileAttachments.saveFile({
          data,
          mediaType: mediaTypeOf(file),
          name: basename(file),
        })
        previews.push(previewRecord(ref, previewKindOf(ref.mediaType)))
      }
      return { previewed: previews.length, previews }
    },
  }))
}
