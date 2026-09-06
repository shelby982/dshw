/** `preview` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'preview'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'preview.label': '预览',
  'preview.moreOne': '+ 1 个文件',
  'preview.more': '+ {count} 个文件',
  'preview.open': '打开 {name}',
  'preview.kind.image': '图片',
  'preview.kind.html': '页面',
  'preview.kind.pptx': '幻灯片',
  'preview.kind.text': '文本',
  'preview.kind.json': 'JSON',
  'preview.kind.file': '文件',
  'preview.loading': '加载中',
  'preview.loadFailed': '加载失败',
  'preview.download': '下载',
}

/** English dictionary (same key set). */
export const en: Record<PreviewKey, string> = {
  'preview.label': 'Preview',
  'preview.moreOne': '+ 1 file',
  'preview.more': '+ {count} files',
  'preview.open': 'Open {name}',
  'preview.kind.image': 'Image',
  'preview.kind.html': 'Page',
  'preview.kind.pptx': 'Slides',
  'preview.kind.text': 'Text',
  'preview.kind.json': 'JSON',
  'preview.kind.file': 'File',
  'preview.loading': 'Loading',
  'preview.loadFailed': 'Failed to load',
  'preview.download': 'Download',
}

/** Union of this namespace's dictionary keys. */
export type PreviewKey = keyof typeof zh
