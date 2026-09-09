# Agent Note: 并行通用文件附件存储（FileAttachmentStore）

Status: implemented

[English](2026-09-04-parallel-general-file-attachment-store.md) | 中文

## 问题

持久化图片附件已是成熟 seam：`DSH_HOME/attachments/v1` 下的内容寻址对象、会话日志引用鉴权（`referencedImage`）、以及能跨刷新重建的浏览器 Blob-URL 渲染路径。但它**仅限图片**——`AttachmentStore`（`ctx.attachments`）暴露的是 `ImageAttachmentRef`/`saveImage`/`readImage`,其下游（准入、归一化、`ImageAttachmentLimits`）全是栅格专用。产出的非图片文件（PPTX、HTML、文档）没有持久、经会话授权的存储：它们只是被 `ui-deliverables` 以路径 chips 呈现、并在宿主系统里打开的工作区文件。

在已发布的 `AttachmentStore` 上直接加通用文件方法是最表面的修法，但它是抽象类，其成员被多个包的大量测试子类实现（`RecordingStore`、`E2eAttachmentStore`、`StaticAttachmentStore`、`JpegOnlyStore`……）。新增一个**抽象**成员会迫使每个子类去实现它——为一处可预览性的收益带来大面积、不相关的编译破坏。

## 决策

新增一个**并行**的通用文件附件 seam，复用它内容寻址对象层，而不是加宽 `AttachmentStore`：

1. 在 `@deepseek-ai/dsh-attachment` Definition 包新增 `FileAttachmentStore`（`ctx.fileAttachments`），作为 `AttachmentStore` 的兄弟，提供 `saveFile`/`readFile`/`fileHostPath`，以及新的 `FileAttachmentRef`/`SaveFileAttachment`/`StoredFileAttachment` 词汇。现有 `AttachmentStore` 及其所有 `extends AttachmentStore` 子类均不动。
2. 在 `attachment-local`，把 `commitPreparedImageFile`/`readImageFile` 内部已有的字节对象机制抽成共享的 `publishObject`/`readObject`（内容寻址写入 + fsync + 硬链接去重 + 摘要校验），再在其上新增 `prepareFileObject`/`commitFileObject`/`readFileObject`/`fileObjectPath`。`LocalFileAttachmentStore` 通过调用它们实现新 seam。
3. 图片专属步骤留在原处：准入、归一化、探针、请求投影都不触碰通用文件路径。

设计保持 `ctx.attachments`（图片）与 `ctx.fileAttachments`（通用文件）对称——都是内容寻址、都按同一 `objects/<2>/<sha256>` 树以 `sha256:` 为键、都带摘要校验读回——同时不触碰已发布的栅格行为及其测试。

## 备选方案

- **在现有 `AttachmentStore` 上加抽象通用文件方法**：单一 seam，但会把 `saveFile`/`readFile` 强加给每个 `extends AttachmentStore` 子类（覆盖 `attachment`、`llm-*`、`fs/tool-fs`、`mcp-client`、`api/session-controller` 测试中的十多个），把一处可预览性改动变成大面积编译破坏。否决。
- **把字节发布/读取逻辑复制成新的通用文件函数**：不碰图片路径，但重复约 40 行内容寻址发布逻辑。否决，改用共享的 `publishObject`/`readObject` 抽取，两条路径现在都覆盖它。
- **为通用文件存储新建独立包**：隔离性更佳，但当前没有消费者需要一个独立包边界；attachment seam 是天然归属。待到有 Consumer 强制时才做。

## 后果

- `AttachmentStore` 及其子类未变；现有 `attachment`/`attachment-local` 测试通过，两包达到 100% 逐文件覆盖。
- 通用文件路径目前仅存储：无准入限制、无会话日志登记、无鉴权、无渲染器。它是 preview seam 将赖以构建的地基。`attachment` README 的"非图片文件尚不支持"限制在端到端上依然成立，直到有 Consumer 登记文件并加以证明。
- `publishObject`/`readObject` 现被图片与通用文件读取共同触发，对象层的错误分支（对象缺失、字节损坏、去重竞态）由两个调用点覆盖。
