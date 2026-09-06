import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ProducedPreview } from '@deepseek-ai/dsh-preview'
import type { LoadedPreviewFile } from './preview-cache.ts'
import { previewLabelKind, type PreviewLabelKind } from './turn-preview.ts'
import type { NS, PreviewKey } from './locales.ts'
import css from './PreviewFiles.module.css'

/** Registration-side Host capabilities: durable preview-byte loading. */
export interface PreviewFilesInjected {
  /** Session-authorized loader for one durable preview reference. */
  loadPreviewFile: (attachment: FileAttachmentRef) => Promise<LoadedPreviewFile>
  /** Sync cached loader used to skip a byte round-trip on re-render. */
  peekPreviewFile?: (attachment: FileAttachmentRef) => LoadedPreviewFile | undefined
}

/** Matched previews plus the byte loader and locale seat. */
export type PreviewFilesProps = {
  matched: readonly ProducedPreview[]
} & PropsLocale<typeof NS> & InjectFace<PreviewFilesInjected>

/** Localized kind-label key for one {@link PreviewLabelKind}. */
const KIND_KEY: Record<PreviewLabelKind, PreviewKey> = {
  image: 'preview.kind.image',
  html: 'preview.kind.html',
  pptx: 'preview.kind.pptx',
  text: 'preview.kind.text',
  json: 'preview.kind.json',
  file: 'preview.kind.file',
}

/** Decode preview bytes as UTF-8 text. */
function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data)
}

/** Pretty-print JSON bytes; fall back to the raw text when the bytes are not JSON. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** One preview tile: a kind badge over the rendered content. */
function PreviewTile({ preview, load, peek, t }: {
  preview: ProducedPreview
  load: (attachment: FileAttachmentRef) => Promise<LoadedPreviewFile>
  peek: (attachment: FileAttachmentRef) => LoadedPreviewFile | undefined
  t: PreviewFilesProps['t']
}) {
  const attachment = preview.attachment
  const kind = previewLabelKind(preview.kind, attachment.mediaType)
  const [loaded, setLoaded] = useState<LoadedPreviewFile | null>(() => peek(attachment) ?? null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const title = attachment.name ?? attachment.mediaType
  useEffect(() => {
    let live = true
    setError(false)
    setLoaded(peek(attachment) ?? null)
    void load(attachment).then((spec) => { if (live) setLoaded(spec) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attachment, load, attempt])

  if (error) {
    return (
      <div className={css.tile} data-preview-kind={kind} title={title}>
        <span className={css.kind}>{t(KIND_KEY[kind])}</span>
        <button type="button" className={css.error} onClick={() => { setAttempt(a => a + 1) }}>{t('preview.loadFailed')}</button>
      </div>
    )
  }
  const content = loaded === null
    ? <span className={css.loading}>{t('preview.loading')}</span>
    : renderLoaded(kind, loaded, title, t)
  return (
    <div className={css.tile} data-preview-kind={kind} title={title}>
      <span className={css.kind}>{t(KIND_KEY[kind])}</span>
      {content}
    </div>
  )
}

/** Render the content body for one loaded preview, by kind. */
function renderLoaded(kind: PreviewLabelKind, loaded: LoadedPreviewFile, title: string, t: PreviewFilesProps['t']) {
  const text = decode(loaded.data)
  switch (kind) {
    case 'image':
      return <img className={css.image} src={loaded.url} alt={title} />
    case 'html':
      return <iframe className={css.frame} src={loaded.url} sandbox="" title={title} />
    case 'text':
      return <pre className={css.text}>{text}</pre>
    case 'json':
      return <pre className={css.json}>{prettyJson(text)}</pre>
    case 'pptx':
    case 'file':
      return <a className={css.file} href={loaded.url} download={loaded.name}>{t('preview.download')}</a>
  }
}

/**
 * Render one turn's produced previews as a titled tile gallery, loading each
 * preview's durable bytes on mount.
 * @param props - selector-matched previews, the session-authorized byte loader, and the locale seat.
 * @returns The produced-preview row; nothing when the turn registered none.
 */
export function PreviewFiles({ matched, loadPreviewFile, peekPreviewFile, t }: PreviewFilesProps) {
  if (matched.length === 0) return null
  const peek = peekPreviewFile ?? (() => undefined)
  return (
    <div className={css.root}>
      <span className={css.label}>{t('preview.label')}</span>
      <div className={css.row} data-preview-row>
        {matched.map(preview => (
          <PreviewTile
            key={preview.attachment.attachmentId}
            preview={preview}
            load={loadPreviewFile}
            peek={peek}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
