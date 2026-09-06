/**
 * Produced-preview plugin, browser half: registers the preview row into the
 * chat view's turn-tail chain. All policy lives here — the supporting
 * mutation calls, preview dedup, kind labeling — so composing this plugin
 * out of cordis.yml removes the surface entirely; the owning view renders an
 * empty chain at zero cost.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PreviewFiles } from './PreviewFiles.tsx'
import { PreviewFileCache } from './preview-cache.ts'
import { en, NS, zh, type PreviewKey } from './locales.ts'
import { previewDefinition, selectPreviewFiles } from './turn-preview.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Produced-preview row copy. */
    'preview': PreviewKey
  }
}

export { PreviewFiles, type PreviewFilesInjected, type PreviewFilesProps } from './PreviewFiles.tsx'
export { PreviewFileCache, type LoadedPreviewFile } from './preview-cache.ts'
export {
  previewDefinition, previewLabelKind, previewsForClosing, selectPreviewFiles,
} from './turn-preview.ts'

/** Required services for the tail-slot registration, its dictionaries, and the byte cache. */
export const inject = ['slots', 'locale', 'uiConversation', 'sessions']

/**
 * Client plugin body: register the dictionaries, the byte cache, and the turn-tail entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(previewDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-preview: dictionaries')
  const cache = new PreviewFileCache(ctx, ctx.sessions)
  ctx.slots.inject(
    'conversation.chat.turnTail',
    () => ctx.slots.register({
      name: 'conversation.chat.turnTail',
      select: selectPreviewFiles,
      locale: NS,
      inject: (sessionId: SessionId) => ({
        loadPreviewFile: (attachment: FileAttachmentRef) => cache.resolve(sessionId, attachment),
        peekPreviewFile: (attachment: FileAttachmentRef) => cache.peek(sessionId, attachment),
      }),
    }, PreviewFiles),
  )
}
