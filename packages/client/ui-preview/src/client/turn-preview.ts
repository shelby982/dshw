/**
 * Turn-scoped produced-preview Definition and readers. Client-only and
 * model-free: the vocabulary comes from the `previews` meta first-party
 * produced-file tools attach to their results, never the closing prose or
 * presentation data.
 */
import type { ProducedPreview } from '@deepseek-ai/dsh-preview'
import { previewKindOf, previewsFromMeta } from '@deepseek-ai/dsh-preview'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PreviewKind } from '@deepseek-ai/dsh-preview'

/** Immutable produced-preview facts published against one Turn. */
export interface PreviewTurnData {
  readonly previews: readonly ProducedPreview[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Produced preview files registered in this Turn. */
    preview: PreviewTurnData
  }
}

interface PreviewState extends PreviewTurnData {
  readonly turn: number
  readonly seen: ReadonlySet<string>
}

/** The subset of kinds with a localized label; unknown kinds display as `file`. */
export type PreviewLabelKind = 'image' | 'html' | 'pptx' | 'text' | 'json' | 'file'

/** Localized-label key for one preview, collapsing unknown kinds to `file`. */
export function previewLabelKind(kind: PreviewKind | undefined, mediaType: string): PreviewLabelKind {
  const resolved: PreviewKind = kind ?? previewKindOf(mediaType)
  switch (resolved) {
    case 'image': return 'image'
    case 'html': return 'html'
    case 'pptx': return 'pptx'
    case 'text': return 'text'
    case 'json': return 'json'
    default: return 'file'
  }
}

/**
 * Files registered as previewable in one Turn.
 *
 * The source is the `previews` meta a produced-file tool attaches to its
 * successful `tool/result`, never the closing prose. Reads, unsupported
 * tools, malformed calls, and failed results contribute nothing. Attachments
 * are content-addressed, so the same bytes produced twice in a turn render
 * once, on the order of first appearance.
 *
 * @param data - engine-published Preview data for one Turn.
 * @returns Produced previews in first-seen order; empty when the turn registered none.
 */
export function previewsForClosing(
  data: Readonly<PreviewTurnData> | undefined,
): readonly ProducedPreview[] {
  return data === undefined ? [] : data.previews
}

/**
 * Claim the turn-tail chain only when its turn registered produced previews.
 * @param owner - Turn-tail owner currency for the closing assistant.
 * @returns Produced previews as the component's match, or null to decline before mount.
 */
export function selectPreviewFiles(owner: TurnTailOwnerProps): readonly ProducedPreview[] | null {
  const data = owner.turn.data.get('preview')
  return data === undefined || data.previews.length === 0 ? null : data.previews
}

/** Turn-local produced-preview accumulator; it publishes no view Node. */
export const previewDefinition: ConversationNodeDefinition<PreviewState> = {
  kind: 'preview',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('preview start requires turn/start')
    return { turn: match.event.data.turn, seen: new Set(), previews: [] }
  },
  update: (context, match) => {
    if (match.event.type !== 'tool/result') return context.state
    const result = match.event.data.message.content[0]
    if (result.isError === true) return context.state
    const previews = previewsFromMeta(match.event.data.meta)
    if (previews === undefined) return context.state
    const seen = new Set(context.state.seen)
    const next: ProducedPreview[] = []
    let changed = false
    for (const preview of previews) {
      const key = preview.attachment.attachmentId
      if (seen.has(key)) continue
      seen.add(key)
      next.push(preview)
      changed = true
    }
    if (!changed) return context.state
    return { ...context.state, seen, previews: [...context.state.previews, ...next] }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (previous?.kind === 'turn'
      && previous.turn === context.state.turn
      && previous.key === 'preview'
      && previous.value.previews === context.state.previews) return previous
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'preview',
      value: { previews: context.state.previews },
    }
  },
}
