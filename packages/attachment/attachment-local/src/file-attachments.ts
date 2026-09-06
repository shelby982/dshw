/**
 * General-file attachment storage plugin: mounts {@link LocalFileAttachmentStore}
 * as the harness `ctx.fileAttachments` service. Kept as a separate subpath from
 * the image `attachment-local` plugin so a composition can enable produced-file
 * storage independently of the image admission pipeline.
 * @module @deepseek-ai/dsh-attachment-local/file-attachments
 */
export { LocalFileAttachmentStore as default } from './index.ts'
