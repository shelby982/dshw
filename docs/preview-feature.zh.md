# 产物文件预览：设计与实现

[English](preview-feature.md) | 中文

本参考介绍 Harness 如何在 `dsh` Web GUI 内预览产物文件（图片、HTML、幻灯片、文档），并记录该能力 seam 的设计决策与实现历史。它是一份现状参考，而非教程：目前预览路径已是一条完整的能力 seam（存储、契约、授权 RPC、模型侧登记方、浏览器渲染器），本文件定义其范围及塑造它的各选择。

## 背景与目标

用户的目标是：在 agent 产出一个文件（一张图、一个 PPTX、一个 HTML 页面）之后，能在 Web GUI 内预览其渲染后的文件与效果，并具备会话持久、刷新可重建、agent 可触发、覆盖所有文件类型。原先的实现是一个 Web 插件，它在每次刷新时丢失激活、需要重新激活 —— 这正是本设计要取代的问题。

## 旧插件为何失败

旧路径通过一个无法在页面刷新后存活的 Web 插件渲染产物文件。其工作区路径探针（`workspacePathOpen`）是一个每次刷新都会重置的模块级一次性探针，且非图片文件只能在宿主 OS 中打开。取代它的设计把预览移入一个持久的、由会话日志派生的 seam，使刷新能重建同样的预览行。

## 架构：产物文件预览 seam

预览路径是一条完整的能力 seam，而非单一 provider。其角色分布在多个包中，使每块（存储、契约、授权、登记方、渲染器）都能独立演进：

- **存储** — `ctx.fileAttachments`（`FileAttachmentStore`），一个内容寻址的通用文件附件存储，由 `@deepseek-ai/dsh-attachment-local/file-attachments` 提供。
- **契约** — `@deepseek-ai/dsh-preview` 拥有持久的产物文件词汇：工具结果的 `previews` 元数据载荷，以及纯读取函数 `previewsFromMeta`、`previewKindOf`、`mediaTypeOf`。
- **授权 RPC** — `sessionController.previewFile` 及其客户端动词 `readPreviewFile`，把已记录的 `FileAttachmentRef` 授权回产出它的会话。
- **模型侧登记方** — `@deepseek-ai/dsh-tool-preview` 提供 `preview_files` 工具，它从会话工作区读取产物文件、存储其字节、并记录结果中的持久引用。
- **自动登记** — `@deepseek-ai/dsh-tool-fs` 在 `write`/`edit` 的结果里折入一个 `previews` 载荷，使模型无需显式调用 `preview_files`。
- **PPT 缩略图** — `@deepseek-ai/dsh-tool-preview` 把 PPTX 转换为单页 PNG 缩略图（LibreOffice `soffice` → PDF，poppler `pdftoppm` → PNG），当转换栈缺失时降级为原文件。
- **浏览器渲染器** — `@deepseek-ai/dsh-client-ui-preview` 把预览行注册进聊天视图的 `conversation.chat.turnTail` 链：`PreviewDefinition` 把 `meta.previews` 折入 turn 数据，`PreviewFileCache` 按会话读取持久字节，`PreviewFiles` 按类型渲染。

## 核心设计决策

- **复用附件寻址层**。产物文件作为内容寻址对象经 `ctx.fileAttachments` 存储，而非拓宽仅限图片的路径。
- **产物预览挂在工具结果的私有 `meta` 上**。`previews` 载荷是工具所有、可 JSON 序列化、且不进入模型可见内容；它随会话日志持久化，使渲染器无需任何携带文件摘要的模型可见内容也能重建行。它不改会话格式，也不 bump `SESSION_FORMAT_VERSION`。
- **PPT 转图片缩略图**。当 LibreOffice + poppler 转换栈存在时，产物 PPTX 转为 PNG 缩略图；否则降级为原始 PPTX（下载链接）。
- **一次到位，覆盖所有产物文件**。该 seam 处理所有产物文件，而不只是图片。
- **跳过独立的 `PreviewRegistry` provider**。其职责（契约 + RPC + 渲染器）不需要多 provider 变体，注册表会是过早抽象。
- **自包含 `PreviewFileCache`**。浏览器半层读 `readPreviewFile` 自建缓存，复用容器的生命周期形态，但不泛化 `HistoricalImageCache`。
- **`#6` 刷新失活项判定为记忆过期**。先前的担忧（模块级工作区探针）已由 `ui-deliverables` 的重连时自动重探解决；刷新会重新 apply 插件并重新探测，因此不存在刷新即失的行为。
- **`#3` ui-conversation 域分层**。`input/editor` 混入了输入机的模型增强与 composer 条的自包含文本表面绑定。三个绑定移入 `skeleton/editor/`，使 `skeleton`（composer 展示）拥有其表面，而 `input` 保留机器与其编辑器模型增强；`verify-client-domain-graph` 从 3 降到 0。

## 端到端数据流

1. 模型调用 `preview_files`（或 `fs` 的 `write`/`edit` 自动登记），指定一个产物文件路径。
2. `preview_files` 从会话工作区读取文件字节（`ctx.fs.readBytes`，受 `maxPreviewBytes` 上限约束），经 `ctx.fileAttachments.saveFile` 存储；对 PPTX 先转换为 PNG 缩略图。
3. 工具结果携带一个私有 `previews` 元数据载荷（`ProducedPreview[]`：一个持久的 `FileAttachmentRef` 加一个类型提示）。它被记录且永不进入模型。
4. 浏览器的 `PreviewDefinition`（turn-tail 链上的一个 `ConversationNodeDefinition`）把 `meta.previews` 折入 turn 数据，按附件 id 去重、按首次出现顺序。
5. `PreviewFiles` 按类型渲染每个预览：image（有界 `<img>`）、page（沙箱 `<iframe>`）、text/JSON（解码 `<pre>`）、slides/下载。`PreviewFileCache` 通过 `session.readPreviewFile` 把引用解析为浏览器 URL，按会话作用域，并在其拆除时释放。
6. 刷新时，会话日志重放窗口；`previewDefinition` 重新折入同一 `previews` meta，因此行被重建。

## 发现并修复的 bug

- **两处隐性的 `inject` 遗漏**。`preview_files` 未注入 `fs`/`fileAttachments`（于是每次执行都抛 "cannot get property 'fs' without inject"），session controller 的 `previewFile` RPC 也未注入 `fileAttachments`（于是渲染器无法读取字节）。两者均已修复。
- **刷新后预览行消失（mid-Turn 窗口）**。历史分页器在 `maxMessages` 条 append 来源消息的 `groupStart` 处切开重载窗口，忽略 `turn/start`，因此窗口可能从 turn 中间开始。像 `previewDefinition` 这样的 turn-scoped 节点需要该 turn 的 `turn/start` 才能发布 turn 数据；缺少它时，刷新后行消失，而消息仍渲染（内容投影独立于 turn 边界）。修复把 `paginate` 的切点向前对齐到不晚于它的最近 `turn/start`，使 `follow()`（刷新窗口）与 `page()`（loadOlder）都从 turn 边界开始；前端 `loadOlder` 用窗口第一条 seq 作 `beforeSeq`，因此各页保持连续。

## 门禁与验证

该 feature 的确定性门禁全绿：`doc-sync` 32/0、lint 0、`gen-tool-catalog`（已登记 `tool-preview`）、`config-catalog`、`cordis-inspect-catalog`、`verify-export-jsdoc`、`doc-graphs`（`fileAttachments` 已归入能力 seam 角色）、`translation-pairing`、以及 per-file 100% 覆盖率。浏览器验证驱动了一个真实模型 turn：预览行渲染出沙箱 HTML。

## 已知限制与延后工作

- **产出工具尚不存在**。预览 seam 渲染的是已存在的文件；生成图片/PPT 的工具是未来工作。
- **PPT 缩略图依赖宿主**。必须存在 `soffice` + `pdftoppm`；否则预览降级为原文件（下载链接）。
- **测试基础设施 flakiness 无关本次**。大规模并行运行会间歇触发 inspector worker 超时、一个 `file-reference-local` 竞态、以及无关文件的边缘覆盖率；`dsh-ci-test-reliability` 处理之。
- **headless 浏览器 E2E 受环境限制**。完整渲染路径需要一个工作区构建版实例与一次真实模型 turn；headless 驱动被目录选择器与模态不稳定性挡住。
