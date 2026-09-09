import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { AttachmentError, AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import SessionStore, { SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { describe, expect, it, vi } from 'vitest'
import { ApiSessionAgentController } from '../src/agent.ts'
import { SessionCommandController } from '../src/commands.ts'
import { SessionController } from '../src/index.ts'
import { installSessionReadTestServices, testSessionPersistence } from './test-remote.ts'

const FILE: FileAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'0'.repeat(64)}`),
  mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  bytes: 3,
  name: 'slides.pptx',
}

function event(type: string, seq: number, data: unknown): SessionEvent {
  return { type, seq, time: seq + 1, data } as SessionEvent
}

function callEvent(seq: number): SessionEvent {
  return event('tool/call', seq, { turn: 0, step: 0, callId: ToolCallId('call-1'), name: 'write', arguments: {} })
}

function toolResultEvent(seq: number, meta: unknown): SessionEvent {
  const message = createToolResultMessage({
    callId: ToolCallId('call-1'),
    content: [{ type: 'text', text: 'done' }],
    isError: false,
  })
  return {
    ...event('tool/result', seq, { turn: 0, step: 0, message, meta }),
    surfaceOp: 'append',
    sourceEventSeqs: [SessionSeq(seq - 1)],
  } as SessionEvent
}

async function persistedPreviewController(
  events: SessionEvent[],
  readFile: (ref: FileAttachmentRef) => Promise<{ ref: FileAttachmentRef; data: Uint8Array }>,
): Promise<{ ctx: Context; controller: SessionCommandController; sessionId: SessionId }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const sessionId = SessionId('cold-preview')
  const meta: SessionHeader = {
    version: 0,
    id: sessionId,
    createdAt: 1,
    cwd: '/workspace',
    isSeeded: false,
  }
  ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
    list: () => Promise.resolve([meta]),
    inspect: () => Promise.resolve({
      meta,
      inheritedEventCount: SessionLogOffset(0),
      events,
    }),
  }) as never)
  installSessionReadTestServices(ctx)
  ctx.provide('fileAttachments', { readFile } as never)
  const agents = { resolveAgent: vi.fn() } as unknown as ApiSessionAgentController
  return { ctx, controller: new SessionCommandController(ctx, agents, '/workspace'), sessionId }
}

describe('Session produced-file preview authorization', () => {
  it('reads a file referenced by a tool result private preview payload', async () => {
    const events = [
      callEvent(0),
      toolResultEvent(1, { previews: [{ attachment: FILE }] }),
    ]
    const readFile = vi.fn((ref: FileAttachmentRef) => Promise.resolve({ ref, data: Uint8Array.of(1, 2, 3) }))
    const { controller, sessionId } = await persistedPreviewController(events, readFile)

    const result = await controller.previewFile({ sessionId, attachmentId: FILE.attachmentId })

    expect(readFile).toHaveBeenCalledWith(FILE)
    expect(result.attachment).toEqual(FILE)
    expect(result.data).toBe('AQID')
  })

  it('rejects a file id not referenced by the session', async () => {
    const events = [
      callEvent(0),
      toolResultEvent(1, { previews: [{ attachment: FILE }] }),
    ]
    const readFile = vi.fn((ref: FileAttachmentRef) => Promise.resolve({ ref, data: Uint8Array.of(1) }))
    const { controller, sessionId } = await persistedPreviewController(events, readFile)
    const missing = AttachmentId(`sha256:${'1'.repeat(64)}`)

    await expect(controller.previewFile({ sessionId, attachmentId: missing }))
      .rejects.toMatchObject({ code: 'session/attachment-invalid' })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('rejects when no tool result carries a preview payload', async () => {
    const events = [
      callEvent(0),
      toolResultEvent(1, { diffs: [] }),
    ]
    const readFile = vi.fn()
    const { controller, sessionId } = await persistedPreviewController(events, readFile)

    await expect(controller.previewFile({ sessionId, attachmentId: FILE.attachmentId }))
      .rejects.toMatchObject({ code: 'session/attachment-invalid' })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('maps a storage failure to an attachment-invalid remote error', async () => {
    const events = [
      callEvent(0),
      toolResultEvent(1, { previews: [{ attachment: FILE }] }),
    ]
    const readFile = vi.fn(() => Promise.reject(new Error('missing object')))
    const { controller, sessionId } = await persistedPreviewController(events, readFile)

    await expect(controller.previewFile({ sessionId, attachmentId: FILE.attachmentId }))
      .rejects.toMatchObject({ code: 'gateway/internal' })
  })

  it('maps an AttachmentError storage failure to session/attachment-invalid', async () => {
    const events = [
      callEvent(0),
      toolResultEvent(1, { previews: [{ attachment: FILE }] }),
    ]
    const readFile = vi.fn(() => Promise.reject(new AttachmentError('missing', 'ATTACHMENT_NOT_FOUND')))
    const { controller, sessionId } = await persistedPreviewController(events, readFile)

    await expect(controller.previewFile({ sessionId, attachmentId: FILE.attachmentId }))
      .rejects.toMatchObject({ code: 'session/attachment-invalid' })
  })

  it('reports session/not-found when the session does not exist', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const sessionId = SessionId('cold-preview')
    ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
      list: () => Promise.resolve([]),
      inspect: () => Promise.resolve({
        meta: { version: 0, id: sessionId, createdAt: 1, cwd: '/workspace', isSeeded: false },
        inheritedEventCount: SessionLogOffset(0),
        events: [],
      }),
    }) as never)
    installSessionReadTestServices(ctx)
    ctx.provide('fileAttachments', { readFile: vi.fn() } as never)
    const agents = { resolveAgent: vi.fn() } as unknown as ApiSessionAgentController
    const controller = new SessionCommandController(ctx, agents, '/workspace')

    await expect(controller.previewFile({ sessionId, attachmentId: FILE.attachmentId }))
      .rejects.toMatchObject({ code: 'session/not-found' })
  })

  it('maps a missing session/query service to a generic authorization failure', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const sessionId = SessionId('cold-preview')
    ctx.provide('fileAttachments', { readFile: vi.fn() } as never)
    const agents = { resolveAgent: vi.fn() } as unknown as ApiSessionAgentController
    const controller = new SessionCommandController(ctx, agents, '/workspace')

    await expect(controller.previewFile({ sessionId, attachmentId: FILE.attachmentId }))
      .rejects.toMatchObject({ code: 'gateway/internal' })
  })

  it('serves previewFile through the session remote facade', async () => {
    const events = [
      callEvent(0),
      toolResultEvent(1, { previews: [{ attachment: FILE }] }),
    ]
    const readFile = vi.fn((ref: FileAttachmentRef) => Promise.resolve({ ref, data: Uint8Array.of(1, 2, 3) }))
    const { ctx, sessionId } = await persistedPreviewController(events, readFile)
    await ctx.plugin(AgentRegistry)
    ctx.provide('typert', {
      lookups: { configure: () => () => {} },
      contexts: { configureHost: () => {} },
    } as never)
    const controller = new SessionController(ctx, {})
    const result = await controller.previewFile({ sessionId, attachmentId: FILE.attachmentId })
    expect(result.attachment).toEqual(FILE)
    expect(result.data).toBe('AQID')
  })
})
