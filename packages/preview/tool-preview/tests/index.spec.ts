// REAL-composition: prove the `preview_files` tool registers and executes
// through the real ToolRuntime, recording produced previews as result metadata.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as ToolPreview from '../src/index.ts'
import * as PreviewContract from '@deepseek-ai/dsh-preview'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function boot(toolConfigLines: readonly string[] = []): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-tool-preview-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-tool-preview'",
    ...toolConfigLines.length > 0 ? ['  config:', ...toolConfigLines] : [],
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-tool-preview', ToolPreview],
    ['@deepseek-ai/dsh-preview', PreviewContract],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

describe('mediaTypeOf', () => {
  it('maps common produced-file extensions to MIME types', () => {
    expect(ToolPreview.mediaTypeOf('/w/a.png')).toBe('image/png')
    expect(ToolPreview.mediaTypeOf('/w/a.jpeg')).toBe('image/jpeg')
    expect(ToolPreview.mediaTypeOf('/w/a.jpg')).toBe('image/jpeg')
    expect(ToolPreview.mediaTypeOf('/w/a.webp')).toBe('image/webp')
    expect(ToolPreview.mediaTypeOf('/w/a.gif')).toBe('image/gif')
    expect(ToolPreview.mediaTypeOf('/w/a.svg')).toBe('image/svg+xml')
    expect(ToolPreview.mediaTypeOf('/w/s.html')).toBe('text/html')
    expect(ToolPreview.mediaTypeOf('/w/s.htm')).toBe('text/html')
    expect(ToolPreview.mediaTypeOf('/w/data.json')).toBe('application/json')
    expect(ToolPreview.mediaTypeOf('/w/slides.pptx')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    expect(ToolPreview.mediaTypeOf('/w/README.txt')).toBe('text/plain')
    expect(ToolPreview.mediaTypeOf('/w/README.md')).toBe('text/plain')
    expect(ToolPreview.mediaTypeOf('/w/blob.bin')).toBe('application/octet-stream')
  })
})

const REF: FileAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'0'.repeat(64)}`),
  mediaType: 'image/png',
  bytes: 1,
  name: 'a.png',
}

describe('tool-preview real composition', () => {
  it('registers preview_files and records produced previews as result metadata', async () => {
    const ctx = await boot()
    const saveFile = vi.fn(async () => REF)
    ctx.provide('fileAttachments', { saveFile } as never)
    ctx.provide('fs', {
      resolve: vi.fn(async (path: string) => ({ path } as never)),
      readBytes: vi.fn(async () => Uint8Array.of(1, 2, 3)),
    } as never)

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('preview'),
      name: 'preview_files',
      arguments: { files: ['a.png'] },
    })

    expect(saveFile).toHaveBeenCalledWith({
      data: Uint8Array.of(1, 2, 3),
      mediaType: 'image/png',
      name: 'a.png',
    })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'Registered 1 produced file for in-app preview.' }])
    expect(result.meta).toEqual({ previews: [{ attachment: REF, kind: 'image' }] })
  })

  it('registers several files and honors the session workspace cwd', async () => {
    const ctx = await boot()
    const saveFile = vi.fn(async () => REF)
    ctx.provide('fileAttachments', { saveFile } as never)
    const resolve = vi.fn(async (path: string) => ({ path } as never))
    ctx.provide('fs', { resolve, readBytes: vi.fn(async () => Uint8Array.of(1)) } as never)

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('preview2'),
      name: 'preview_files',
      arguments: { files: ['a.png', 'b.html'] },
      agent: { session: { header: { cwd: '/workspace' } } } as never,
    })

    expect(resolve).toHaveBeenCalledWith('a.png', expect.objectContaining({ cwd: '/workspace' }))
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'Registered 2 produced files for in-app preview.' }])
    expect(result.meta).toEqual({
      previews: [
        { attachment: REF, kind: 'image' },
        { attachment: REF, kind: 'image' },
      ],
    })
  })

  it('honors a configured maxPreviewBytes cap', async () => {
    const ctx = await boot(['    maxPreviewBytes: 10'])
    const readBytes = vi.fn(async () => Uint8Array.of(1))
    ctx.provide('fileAttachments', { saveFile: vi.fn(async () => ({ ...REF, name: undefined })) } as never)
    ctx.provide('fs', { resolve: vi.fn(async (path: string) => ({ path } as never)), readBytes } as never)
    await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('preview3'),
      name: 'preview_files',
      arguments: { files: ['a.png'] },
    })
    expect(readBytes).toHaveBeenCalledWith(expect.anything(), expect.anything(), 10)
  })
})
