// @vitest-environment jsdom
/**
 * ui-preview browser half: the derivation contract of previews over
 * engine-published Turn data, the row's rendering and kind labeling, and the
 * plugin registrations' fiber-teardown removal (HMR safety) against the real
 * SlotRegistry.
 */
import { Context } from '@deepseek-ai/cordis'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ProducedPreview } from '@deepseek-ai/dsh-preview'
import type { SessionLiveEventEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  ConversationNodeAssembler, UiConversation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ConversationLocationDataStore, ConversationLocationDataSource, ConversationMatch,
  ConversationNodeDefinition, ConversationStartMatch, ConversationTimelineSnapshot,
  ConversationTurnDataMap, ConversationViewDefinition, ConversationViewNode, TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate, RemoteError, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { PreviewFiles, type PreviewFilesInjected } from '../src/client/PreviewFiles.tsx'
import { PreviewFileCache, type LoadedPreviewFile } from '../src/client/preview-cache.ts'
import {
  previewDefinition, previewLabelKind, previewsForClosing, selectPreviewFiles,
  type PreviewTurnData,
} from '../src/client/turn-preview.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyHost } from '../src/index.ts'
import { en, zh } from '../src/client/locales.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

class TestTurnDataStore implements ConversationLocationDataStore<ConversationTurnDataMap> {
  private readonly values = new Map<string, unknown>()
  private readonly sources = new Map<string, ConversationLocationDataSource<unknown>>()

  get<Key extends Extract<keyof ConversationTurnDataMap, string>>(
    key: Key,
  ): Readonly<ConversationTurnDataMap[Key]> | undefined {
    return this.values.get(key) as Readonly<ConversationTurnDataMap[Key]> | undefined
  }

  source<Key extends Extract<keyof ConversationTurnDataMap, string>>(
    key: Key,
  ): ConversationLocationDataSource<Readonly<ConversationTurnDataMap[Key]> | undefined> {
    let source = this.sources.get(key)
    if (source === undefined) {
      source = { getSnapshot: () => this.get(key), subscribe: () => () => {} }
      this.sources.set(key, source)
    }
    return source as ConversationLocationDataSource<Readonly<ConversationTurnDataMap[Key]> | undefined>
  }

  set<Key extends Extract<keyof ConversationTurnDataMap, string>>(
    key: Key,
    value: ConversationTurnDataMap[Key],
  ): void {
    this.values.set(key, value)
  }
}

const turnLocation = (turn: number, previews?: ProducedPreview[]): TurnLocation => {
  const data = new TestTurnDataStore()
  if (previews !== undefined) data.set('preview', { previews })
  return { turn, start: undefined, end: undefined, status: 'closed', steps: [], data }
}

const FILE = (id: string, mediaType = 'text/plain', name?: string): FileAttachmentRef => ({
  attachmentId: AttachmentId(`sha256:${id}`), mediaType, bytes: 3,
  ...(name === undefined ? {} : { name }),
})
const PREVIEW = (id: string, kind?: ProducedPreview['kind'], name?: string): ProducedPreview => ({
  attachment: FILE(id, 'text/plain', name),
  ...(kind === undefined ? {} : { kind }),
})

function tailOwner(
  previews: ProducedPreview[] | undefined,
  seq = 2,
  turn = 1,
): TurnTailOwnerProps {
  return { seq, openFile: () => {}, turn: turnLocation(turn, previews) }
}

interface TimelineSnapshot {
  readonly timeline: ConversationTimelineSnapshot
}

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] { return [previewDefinition] }
  fallbackEntry(): ConversationNodeDefinition | undefined { return undefined }
}

class TestViewDefinitions {
  entries(): readonly ConversationViewDefinition[] { return [timelineViewDefinition] }
}

const timelineViewDefinition: ConversationViewDefinition<ConversationViewNode, TimelineSnapshot> = {
  target: 'test',
  create: () => {
    let current: TimelineSnapshot = { timeline: { turnOrder: [], turns: new Map() } }
    return {
      empty: current,
      replace: ({ timeline }) => (current = { timeline }),
      apply: ({ timeline }) => (current = { timeline }),
    }
  },
}

function at(seq: number, type: string, data: unknown): SessionLiveEventEntry {
  return {
    type: 'event',
    event: {
      seq, time: seq * 1_000, type, data,
      ...(type === 'tool/result' ? { surfaceOp: 'append' } : {}),
    } as SessionEvent,
  }
}

function matched(input: SessionLiveEventEntry, role: 'start'): ConversationStartMatch
function matched(input: SessionLiveEventEntry, role: 'update'): ConversationMatch
function matched(input: SessionLiveEventEntry, role: ConversationMatch['role']): ConversationMatch {
  return { event: input.event, role, location: { kind: 'unresolved' } }
}

function result(
  seq: number,
  callId: string,
  meta: unknown,
  isError = false,
  turn = 1,
): SessionLiveEventEntry {
  return at(seq, 'tool/result', {
    turn,
    step: 1,
    message: {
      source: { type: 'tool-result', callId },
      content: [{ type: 'tool-result', content: [], isError }],
    },
    ...(meta === undefined ? {} : { meta }),
  })
}

function assembler(entries: readonly SessionLiveEventEntry[], hasMore = false): ConversationNodeAssembler {
  const value = new ConversationNodeAssembler(new TestEventDefinitions(), new TestViewDefinitions())
  value.replaceWindow(entries, hasMore)
  value.activateTarget('test')
  return value
}

function previewsOf(value: ConversationNodeAssembler, turn = 1): Readonly<PreviewTurnData> | undefined {
  const snapshot = value.snapshot('test') as TimelineSnapshot
  return snapshot.timeline.turns.get(turn)?.data.get('preview')
}

describe('previewLabelKind', () => {
  it('infers a label kind from a declared kind or the media type', () => {
    expect(previewLabelKind('image', 'application/octet-stream')).toBe('image')
    expect(previewLabelKind(undefined, 'image/png')).toBe('image')
    expect(previewLabelKind(undefined, 'text/html')).toBe('html')
    expect(previewLabelKind(undefined, 'application/json')).toBe('json')
    expect(previewLabelKind(undefined, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('pptx')
    expect(previewLabelKind(undefined, 'text/markdown')).toBe('text')
  })

  it('collapses an unknown declared kind and unknown media type to file', () => {
    expect(previewLabelKind('unknown-kind', 'application/x-whatever')).toBe('file')
    expect(previewLabelKind(undefined, 'application/pdf')).toBe('file')
    expect(previewLabelKind(undefined, 'application/octet-stream')).toBe('file')
  })
})

describe('previewsForClosing and select', () => {
  it('returns turn previews, or null when a turn registered none', () => {
    expect(previewsForClosing(undefined)).toEqual([])
    expect(previewsForClosing({ previews: [PREVIEW('a', 'image', 'a.png')] })).toEqual([PREVIEW('a', 'image', 'a.png')])
    expect(selectPreviewFiles(tailOwner([PREVIEW('a', 'image', 'a.png')]))).toEqual([PREVIEW('a', 'image', 'a.png')])
    expect(selectPreviewFiles(tailOwner(undefined))).toBeNull()
    expect(selectPreviewFiles(tailOwner([]))).toBeNull()
  })
})

describe('produced-preview Turn data', () => {
  it('folds preview metadata into turn data in first-seen order', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      result(2, 'a', { previews: [PREVIEW('a', 'image', 'a.png'), PREVIEW('b', 'html', 'b.html')] }),
      result(3, 'b', { previews: [PREVIEW('c', 'json')] }),
    ])
    expect(previewsOf(value)?.previews).toEqual([
      PREVIEW('a', 'image', 'a.png'), PREVIEW('b', 'html', 'b.html'), PREVIEW('c', 'json'),
    ])
  })

  it('deduplicates content-addressed attachments on first appearance', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'tool/call', { turn: 1, step: 1, callId: 'a', name: 'write', arguments: '{}' }),
      result(3, 'a', { previews: [PREVIEW('x', 'image', 'x.png'), PREVIEW('y', 'html')] }),
      at(4, 'tool/call', { turn: 1, step: 1, callId: 'b', name: 'write', arguments: '{}' }),
      result(5, 'b', { previews: [PREVIEW('x', 'image', 'x.png')] }),
    ])
    expect(previewsOf(value)?.previews).toEqual([
      PREVIEW('x', 'image', 'x.png'), PREVIEW('y', 'html'),
    ])
  })

  it.each([
    { caseName: 'absent meta', meta: undefined },
    { caseName: 'empty previews', meta: { previews: [] } },
    { caseName: 'malformed previews', meta: { previews: [{ attachment: { mediaType: 'text/plain' } }] } },
  ])('contributes nothing for $caseName', ({ meta }) => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      result(2, 'a', meta),
    ])
    expect(previewsOf(value)?.previews ?? []).toEqual([])
  })

  it('ignores failed results, unknown tool kinds, and replacement surface ops', () => {
    const replaceEntry = result(3, 'replace', { previews: [PREVIEW('b', 'image')] })
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      result(2, 'failed', { previews: [PREVIEW('a', 'image')] }, true),
      {
        ...replaceEntry,
        event: {
          ...replaceEntry.event,
          surfaceOp: { op: 'replace', start: 1, end: 1 },
        } as SessionEvent,
      },
      at(4, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    expect(previewsOf(value)?.previews ?? []).toEqual([])
  })

  it('rejects an invalid start match and preserves state for an unrelated update', () => {
    const startMatch = matched(at(1, 'turn/start', { turn: 1 }), 'start')
    const emptyContext: Parameters<typeof previewDefinition.start>[0] = {
      key: 'preview:1',
      kind: 'preview',
      id: '1',
      matches: [startMatch],
      start: startMatch,
      state: undefined,
      current: new Map(),
    }
    const reader: Parameters<typeof previewDefinition.start>[2] = { previous: () => undefined }
    const state = previewDefinition.start(emptyContext, startMatch, reader)
    const unrelated = matched(at(2, 'turn/end', { turn: 1, reason: { kind: 'completed' } }), 'update')
    const context: Parameters<typeof previewDefinition.update>[0] = { ...emptyContext, state }

    expect(() => previewDefinition.start(
      emptyContext,
      unrelated as ConversationStartMatch,
      reader,
    ))
      .toThrow('preview start requires turn/start')
    expect(previewDefinition.update(context, unrelated)).toBe(state)
  })

  it('extends the same Turn data incrementally and preserves identity on no change', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      result(2, 'a', { previews: [PREVIEW('a', 'image')] }),
    ])
    const first = previewsOf(value)
    expect(first?.previews).toEqual([PREVIEW('a', 'image')])

    // A duplicate content-addressed attachment leaves the published value identity-stable.
    value.append(result(3, 'b', { previews: [PREVIEW('a', 'image')] }))
    value.flush()
    expect(previewsOf(value)).toBe(first)

    // New previews extend the same Turn value.
    value.append(result(4, 'c', { previews: [PREVIEW('c', 'json')] }))
    value.flush()
    expect(previewsOf(value)?.previews).toEqual([
      PREVIEW('a', 'image'), PREVIEW('c', 'json'),
    ])
  })
})

describe('PreviewFiles row', () => {
  const loaded = (mediaType = 'text/plain', data = 'hi', name?: string): LoadedPreviewFile => ({
    url: `data:${mediaType};base64,${btoa(data)}`,
    data: new TextEncoder().encode(data),
    mediaType,
    ...(name === undefined ? {} : { name }),
  })
  const load = async (a: FileAttachmentRef): Promise<LoadedPreviewFile> => loaded(a.mediaType, 'hi', a.name)
  const peek = () => undefined

  it('renders the label and one badge per preview', () => {
    const t = makeTranslate(zh)
    const view = render(
      <PreviewFiles
        matched={[PREVIEW('a', 'image', 'a.png'), PREVIEW('b', 'html', 'b.html'), PREVIEW('c', 'json', 'c.json')]}
        loadPreviewFile={load}
        peekPreviewFile={peek}
        t={t}
      />,
    )
    expect(view.getByText('预览')).toBeTruthy()
    const row = view.container.querySelector('[data-preview-row]')
    if (!(row instanceof HTMLElement)) throw new Error('preview row missing')
    expect(within(row).getByText('图片')).toBeTruthy()
    expect(within(row).getByText('页面')).toBeTruthy()
    expect(within(row).getByText('JSON')).toBeTruthy()
    const tile = within(row).getByTitle('a.png')
    expect(tile.getAttribute('data-preview-kind')).toBe('image')
  })

  it('uses the inferred kind and the attachment name as the badge title', () => {
    const t = makeTranslate(zh)
    const view = render(
      <PreviewFiles
        matched={[
          { attachment: FILE('png', 'image/png', 'chart.png') },
          { attachment: FILE('html', 'text/html', 'page.html') },
          { attachment: FILE('slides', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'deck.pptx') },
          { attachment: FILE('text', 'text/markdown', 'notes.md') },
          { attachment: FILE('json', 'application/json', 'data.json') },
          { attachment: FILE('unknown', 'application/pdf', 'doc.pdf') },
          { attachment: FILE('nameless', 'text/plain') },
        ]}
        loadPreviewFile={load}
        peekPreviewFile={peek}
        t={t}
      />,
    )
    const row = view.container.querySelector('[data-preview-row]')
    if (!(row instanceof HTMLElement)) throw new Error('preview row missing')
    expect(within(row).getByText('图片')).toBeTruthy()
    expect(within(row).getByText('页面')).toBeTruthy()
    expect(within(row).getByText('幻灯片')).toBeTruthy()
    expect(within(row).getAllByText('文本')).toHaveLength(2)
    expect(within(row).getByText('JSON')).toBeTruthy()
    expect(within(row).getByText('文件')).toBeTruthy()
    expect(within(row).getByTitle('doc.pdf')).toBeTruthy()
    // A nameless preview falls back to its verified media type as the title.
    expect(within(row).getByTitle('text/plain')).toBeTruthy()
  })

  it('returns nothing when a turn registered no previews', () => {
    const view = render(<PreviewFiles matched={[]} loadPreviewFile={load} t={makeTranslate(zh)} />)
    expect(view.container.innerHTML).toBe('')
  })

  it('uses English copy when the locale is English', () => {
    const view = render(<PreviewFiles matched={[PREVIEW('a', 'image', 'a.png')]} loadPreviewFile={load} t={makeTranslate(en)} />)
    expect(view.getByText('Preview')).toBeTruthy()
    expect(view.getByText('Image')).toBeTruthy()
  })

  it('adopts a cached preview synchronously when the loader has one', () => {
    const spec = loaded('text/plain', 'hi', 'a.txt')
    const view = render(
      <PreviewFiles
        matched={[PREVIEW('a', 'text', 'a.txt')]}
        loadPreviewFile={load}
        peekPreviewFile={() => spec}
        t={makeTranslate(zh)}
      />,
    )
    expect(view.getByText('hi')).toBeTruthy()
  })

  it('ignores a load that resolves after unmount', async () => {
    const view = render(
      <PreviewFiles matched={[PREVIEW('a', 'text', 'a.txt')]} loadPreviewFile={() => Promise.resolve(loaded())} peekPreviewFile={peek} t={makeTranslate(zh)} />,
    )
    view.unmount()
    await Promise.resolve()
  })

  it('ignores a load that rejects after unmount', async () => {
    const view = render(
      <PreviewFiles matched={[PREVIEW('a', 'text', 'a.txt')]} loadPreviewFile={() => Promise.reject(new Error('late'))} peekPreviewFile={peek} t={makeTranslate(zh)} />,
    )
    view.unmount()
    await Promise.resolve()
  })

  it('falls back to the raw text when a json preview is not valid json', async () => {
    const view = render(
      <PreviewFiles
        matched={[{ attachment: FILE('badjson', 'application/json', 'bad.json') }]}
        loadPreviewFile={async a => loaded(a.mediaType, 'not json', a.name)}
        t={makeTranslate(zh)}
      />,
    )
    await vi.waitFor(() => { expect(view.getByText('not json')).toBeTruthy() })
  })

  it('renders each loaded preview by its kind', async () => {
    const t = makeTranslate(zh)
    const view = render(
      <PreviewFiles
        matched={[
          { attachment: FILE('img', 'image/png', 'a.png') },
          { attachment: FILE('html', 'text/html', 'b.html') },
          { attachment: FILE('text', 'text/markdown', 'n.md') },
          { attachment: FILE('json', 'application/json', 'd.json') },
          { attachment: FILE('slides', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'd.pptx') },
          { attachment: FILE('unknown', 'application/pdf', 'doc.pdf') },
        ]}
        loadPreviewFile={async a => loaded(a.mediaType, a.mediaType === 'application/json' ? '{"a":1}' : 'hello', a.name)}
        peekPreviewFile={peek}
        t={t}
      />,
    )
    await vi.waitFor(() => {
      expect(view.container.querySelector('img')).toBeTruthy()
      expect(view.container.querySelector('iframe')).toBeTruthy()
      expect(view.container.querySelectorAll('pre')).toHaveLength(2)
      expect(view.getAllByRole('link')).toHaveLength(2)
    })
    expect(view.getByText('hello')).toBeTruthy()
    const image = view.container.querySelector('img')
    expect(image?.getAttribute('alt')).toBe('a.png')
    expect(image?.getAttribute('src')).toContain('data:image/png;base64,')
    const frame = view.container.querySelector('iframe')
    expect(frame?.getAttribute('sandbox')).toBe('')
    const link = view.getAllByRole('link')[0]
    expect(link.getAttribute('download')).toBeTruthy()
  })

  it('shows a loading placeholder, then a retry button on failure', async () => {
    const t = makeTranslate(zh)
    let calls = 0
    const flaky = async (): Promise<LoadedPreviewFile> => {
      calls += 1
      if (calls === 1) throw new Error('boom')
      return loaded()
    }
    const view = render(
      <PreviewFiles matched={[PREVIEW('a', 'text', 'a.txt')]} loadPreviewFile={flaky} peekPreviewFile={peek} t={t} />,
    )
    // Before the first read settles the tile shows a loading placeholder.
    expect(view.getByText('加载中')).toBeTruthy()
    await vi.waitFor(() => { expect(view.getByText('加载失败')).toBeTruthy() })
    fireEvent.click(view.getByText('加载失败'))
    await vi.waitFor(() => { expect(view.getByText('hi')).toBeTruthy() })
  })
})

describe('PreviewFileCache', () => {
  interface StubBinding {
    ctx: Context
    session: {
      readPreviewFile: (id: AttachmentId) => Promise<
        | { ok: true; value: { attachment: FileAttachmentRef; data: Uint8Array } }
        | { ok: false; error: RemoteError }
      >
    }
  }

  function runtime() {
    const ctx = new Context()
    let current: StubBinding | undefined
    const sessions = { binding: (_id: SessionId): StubBinding | undefined => current }
    ctx.provide('sessions', sessions as never)
    const cache = new PreviewFileCache(ctx, sessions as never)
    const setBinding = (binding: StubBinding | undefined) => { current = binding }
    return { ctx, cache, setBinding }
  }

  it('resolves a data-URL fallback when createObjectURL is unavailable and caches by attachment', async () => {
    const prior = URL.createObjectURL
    ;(URL as unknown as { createObjectURL?: (blob: Blob) => string }).createObjectURL = undefined
    try {
      const { cache, setBinding } = runtime()
      const ref = FILE('x', 'text/plain', 'x.txt')
      const reads: string[] = []
      setBinding({
        ctx: new Context(),
        session: {
          readPreviewFile: (id) => {
            reads.push(id)
            return Promise.resolve({
              ok: true as const,
              value: { attachment: { ...ref, attachmentId: id }, data: new TextEncoder().encode('hi') },
            })
          },
        },
      })
      const loaded = await cache.resolve(SessionId('svc:s1'), ref)
      expect(loaded.mediaType).toBe('text/plain')
      expect(loaded.name).toBe('x.txt')
      expect(loaded.url).toContain('data:text/plain;base64,')
      expect(reads).toEqual([ref.attachmentId])
      // Cached: re-resolving one attachment reads once.
      const again = await cache.resolve(SessionId('svc:s1'), ref)
      expect(reads).toEqual([ref.attachmentId])
      expect(again).toBe(loaded)
      expect(cache.peek(SessionId('svc:s1'), ref)).toBe(loaded)
      expect(cache.peek(SessionId('svc:other'), ref)).toBeUndefined()
      cache.dispose()
    } finally {
      ;(URL as unknown as { createObjectURL?: (blob: Blob) => string }).createObjectURL = prior
    }
  })

  it('rejects a failed read and drops the failed entry', async () => {
    const { cache, setBinding } = runtime()
    const ref = FILE('fail', 'text/plain')
    setBinding({
      ctx: new Context(),
      session: {
        readPreviewFile: () => Promise.resolve({ ok: false as const, error: new RemoteError('attachment/invalid', 'gone', {}) }),
      },
    })
    await expect(cache.resolve(SessionId('svc:s1') as SessionId, ref)).rejects.toThrow('attachment/invalid: gone')
    expect(cache.peek(SessionId('svc:s1') as SessionId, ref)).toBeUndefined()
    cache.dispose()
  })

  it('rejects an unknown session and a disposed cache', async () => {
    const { cache, setBinding } = runtime()
    const ref = FILE('u', 'text/plain')
    setBinding(undefined)
    await expect(cache.resolve(SessionId('svc:none') as SessionId, ref)).rejects.toThrow('unknown session')
    cache.dispose()
    await expect(cache.resolve(SessionId('svc:s1') as SessionId, ref)).rejects.toThrow('is disposed')
  })

  it('rejects a read that settles after the cache is disposed', async () => {
    const { cache, setBinding } = runtime()
    const ref = FILE('live', 'text/plain')
    let settle!: (value: { ok: true; value: { attachment: FileAttachmentRef; data: Uint8Array } }) => void
    setBinding({
      ctx: new Context(),
      session: { readPreviewFile: () => new Promise((resolve) => { settle = resolve }) },
    })
    const promise = cache.resolve(SessionId('svc:live') as SessionId, ref)
    cache.dispose()
    settle({ ok: true, value: { attachment: ref, data: new TextEncoder().encode('hi') } })
    await expect(promise).rejects.toThrow('disposed')
  })

  it('creates a blob URL and revokes it on disposal', async () => {
    const created: string[] = []
    const revoked: string[] = []
    const priorCreate = URL.createObjectURL
    const priorRevoke = URL.revokeObjectURL
    ;(URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = () => {
      const url = `blob:mock-${created.length}`
      created.push(url)
      return url
    }
    ;(URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = (url) => { revoked.push(url) }
    try {
      const { cache, setBinding } = runtime()
      const ref = FILE('blob', 'text/plain')
      setBinding({
        ctx: new Context(),
        session: {
          readPreviewFile: () => Promise.resolve({
            ok: true as const,
            value: { attachment: { ...ref, name: undefined }, data: new TextEncoder().encode('hi') },
          }),
        },
      })
      const loaded = await cache.resolve(SessionId('svc:s1') as SessionId, ref)
      expect(loaded.url).toContain('blob:mock-')
      expect(created).toHaveLength(1)
      cache.dispose()
      expect(revoked).toEqual(['blob:mock-0'])
    } finally {
      ;(URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = priorCreate
      ;(URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = priorRevoke
    }
  })

  it('binds one scope per session, releases matching entries, and is idempotent on dispose', async () => {
    const { cache, setBinding } = runtime()
    const sessionId = SessionId('svc:multi')
    const otherId = SessionId('svc:other')
    const attachmentId = (id: string): FileAttachmentRef => ({ ...FILE(id), attachmentId: AttachmentId(`sha256:${id}`) })
    setBinding({
      ctx: new Context(),
      session: { readPreviewFile: (id: AttachmentId) => Promise.resolve({
        ok: true as const,
        value: { attachment: { ...FILE(id), attachmentId: id }, data: new TextEncoder().encode('h') },
      }) },
    })
    // Two attachments in one session share the cached scope; a second session's
    // entry means each release skips the other session's rows.
    await cache.resolve(sessionId, attachmentId('a'))
    await cache.resolve(sessionId, attachmentId('b'))
    await cache.resolve(otherId, attachmentId('c'))
    expect(cache.peek(sessionId, attachmentId('a'))).toBeDefined()
    expect(cache.peek(sessionId, attachmentId('b'))).toBeDefined()
    expect(cache.peek(otherId, attachmentId('c'))).toBeDefined()
    cache.dispose()
    expect(cache.peek(sessionId, attachmentId('a'))).toBeUndefined()
    expect(cache.peek(otherId, attachmentId('c'))).toBeUndefined()
    cache.dispose() // idempotent
  })
})

describe('plugin registration', () => {
  it('registers the turn-tail entry and fiber disposal removes it', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    new UiConversation(ctx, { binding: () => undefined } as never)
    ctx.slots.register({
      name: 'root',
      children: { 'conversation.chat.turnTail': { kind: 'chain', scope: 'session' } },
    } as never, () => null)
    const session = {
      canOpenWorkspacePath: () => Promise.resolve({ ok: true as const, value: true }),
    }
    ctx.provide('remote', {
      $on: () => () => {},
      $host: { home: undefined, isLoopback: false },
      session,
    } as never)
    ctx.provide('remote.session', session as never)
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    ctx.provide('sessions', { binding: () => undefined } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const [entry] = ctx.slots.entries('conversation.chat.turnTail')
    expect(entry).toBeDefined()
    expect(typeof entry?.select).toBe('function')
    // The registered business face and chain selector are wired to the shared
    // definitions; invoking them also covers the slot-entry closures.
    const sessionId = 'svc:preview-test' as SessionId
    const injected = (entry?.inject as unknown as (id: SessionId) => PreviewFilesInjected | undefined)?.(sessionId)
    expect(typeof injected?.loadPreviewFile).toBe('function')
    expect(typeof injected?.peekPreviewFile).toBe('function')
    // The injected loaders route through the cache; an unbound session rejects.
    const ref = FILE('reg', 'text/plain')
    expect(injected?.peekPreviewFile?.(ref)).toBeUndefined()
    await expect(injected?.loadPreviewFile?.(ref)).rejects.toThrow('unknown session')
    expect(entry?.select?.(tailOwner([PREVIEW('a', 'image', 'a.png')]))).toEqual([
      PREVIEW('a', 'image', 'a.png'),
    ])
    expect(entry?.select?.(tailOwner(undefined))).toBeNull()

    await fiber.dispose()
    expect(ctx.slots.entries('conversation.chat.turnTail')).toHaveLength(0)
  })

  it('node half apply is a no-op', () => {
    expect(applyHost()).toBeUndefined()
  })
})
