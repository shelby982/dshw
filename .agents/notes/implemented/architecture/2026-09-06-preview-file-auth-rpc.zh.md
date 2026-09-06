# Agent Note: 产出文件预览契约与 previewFile 授权 RPC

Status: implemented

[English](2026-09-06-preview-file-auth-rpc.md) | 中文

## 问题

持久化图片附件已是完整 seam：内容寻址对象、会话日志引用鉴权（`referencedImage`→`readImage`）、以及能跨刷新重建的浏览器 Blob-URL 渲染路径。产出的**非图片**文件（PPTX、HTML、文档）没有对应物：它们只以工作区路径存在，被 `ui-deliverables` 以 chips 呈现并在宿主 OS 里打开（`openWorkspacePath` → `openNativePath`）。这让除图片外的任何文件都无法在 GUI 内预览，而控制系统打开器的 `workspacePathOpen` 能力又活在一个每次刷新都会重置的模块级探针里。

## 决策

分三层扩展产出文件路径，复用附件 seam 而不是加宽它：

1. **存储**——`FileAttachmentStore`（`ctx.fileAttachments`），作为图片 `AttachmentStore` 的兄弟，复用共享的内容寻址 `publishObject`/`readObject` 对象层（[存储说明](2026-09-04-parallel-general-file-attachment-store.zh.md)）。
2. **契约**——`@deepseek-ai/dsh-preview` 定义工具结果 `meta` 载荷形状（`previews: ProducedPreview[]`）及纯读取函数 `previewsFromMeta`/`previewKindOf`。产出文件工具把每个可预览输出的持久化 `FileAttachmentRef` 记到那里；`meta` 是工具私有的、既定存在的展示载荷（`FsDiffMeta` 先例），随会话日志持久化但**不进入模型可见**内容。
3. **授权 RPC**——`sessionController.previewFile`（`@Remote('previewFile')`），作为图片 `attachment` RPC 的兄弟。它从任意工具结果的 `previews` 元数据里找 `FileAttachmentRef`（`referencedFile`），经 `ctx.fileAttachments.readFile` 读对象并返回 base64 字节。客户端以 session 动词 `readPreviewFile` 暴露；`SessionPreviewFileRequest`/`SessionPreviewFileValue` 由会话 wire 命名空间承载。

`meta` 位置是刻意选择：它把附件引用挡在模型可见内容之外（于是产出文件的摘要不会膨胀任何模型请求），同时仍能由会话日志重建——因为渲染器从持久化 `meta` 重建卡片，"模型可见⟺可记录"对 UI 侧依然成立。

## 备选方案

- **把现有 `attachment` RPC 加宽为图片/文件引用的联合**：单一 seam，但撕裂客户端表面——`ui-attachment`/`HistoricalImageCache` 一律假定 `ImageAttachmentRef`，且每个 `ISession` fixture（`fake-api`、`test-support` session、`ui-conversation` mock）与生成的 `api-catalog` 都要带上联合。否决，改用并行的 `previewFile` RPC（blast radius 限定在新动词的契约内）。
- **用一个专属会话事件携带文件引用**：最能体现"已记录"信号，但会 `bump SESSION_FORMAT_VERSION`，并为 `tool/result` 现有 `meta` 已携带的内容加宽事件 schema。否决。
- **用工具结果 content block 携带文件引用**：对读取方最简，但把附件引用放进模型可见内容（一个 PPTX 摘要会留在 transcript 与每个快照里）。否决。

## 后果

- 图片 `attachment` RPC、`ui-attachment`、`HistoricalImageCache` 均未动；`previewFile` 动词是增量。
- 整个产出文件路径目前只有"存储 + 契约 + 授权"：尚无工具记录 `previews`，也无浏览器渲染器消费它们。`dsh-preview` 是真实契约包，但其生产/消费端尚待后续。
- `gen-cordis-api` 需要给新类型分类：`FileAttachmentRef`/`StoredFileAttachment`/`SaveFileAttachment`（attachment 拥有）、`SessionPreviewFileRequest`/`SessionPreviewFileValue`（会话 wire），并把 `fileAttachments` 服务映射到 attachment 子系统页。
- 授权失败即关闭：`previews` 载荷缺失或畸形则返回 `ATTACHMENT_NOT_REFERENCED`，读取失败映射为 attachment-invalid 或 internal 远程码。
