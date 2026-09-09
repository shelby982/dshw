# Agent Note: 产物文件预览浏览器渲染器

Status: implemented

[English](2026-09-06-ui-preview-client-module.md) | 中文

## 问题

产物文件路径现在已有存储(`FileAttachmentStore`)、契约(`dsh-preview` 的 `previews` meta + `previewsFromMeta`/`previewKindOf`)、授权 RPC(`session.previewFile`)以及面向模型的登记工具(`preview_files`)。浏览器端却无人消费它们:产物图片没有 GUI 内渲染路径,唯一界面(`ui-deliverables`)是工作区路径 chips,在宿主操作系统里打开。真实浏览器 dogfood(真实模型 turn + 真实 workspace)随后暴露了产物文件路径里两处 `inject` 遗漏,使整条链路无法工作:`preview_files` 未注入 `fs`/`fileAttachments`,且 session-controller 为 `previewFile` RPC 也未注入 `fileAttachments`。

## 决定

新增 `@deepseek-ai/dsh-client-ui-preview`,一个双面客户端包,并在 Web patch 中挂载。浏览器半层把 `PreviewFiles` 注册进聊天视图的 `conversation.chat.turnTail` 链,并通过 `previewDefinition` 把产物预览折入 turn 作用域数据 —— 一个 `ConversationNodeDefinition`,读取成功、append-surface `tool/result` 事件上的 `previews` meta。条目按内容寻址(按 attachment id 去重,首次出现顺序);失败结果、格式错误或缺失的 meta、以及 replacement surface 操作都不贡献内容。

该行通过一个自包含的 `PreviewFileCache` 加载每个预览的持久字节,并按类型渲染:图片(有界 `<img>`)、页面(沙箱化 `<iframe>`)、文本(解码)、JSON(美化打印)、以及幻灯片/下载。`PreviewFileCache` 读 `session.readPreviewFile`,按会话缓存,并在会话作用域拆除时释放浏览器 URL;这是刻意不泛化 `HistoricalImageCache` 的替代方案。文本与 JSON 渲染为普通解码块而非 `MarkdownText`/`JsonTree`,使渲染器保持标签轻量且自包含;若日后出现真实消费端,markdown/JSON 树呈现可随后基于共享标签字典引入。

客户端半层通过聊天视图投影所用的同一个 `owner.turn.data` 存储读取预览 —— 不新增服务、不新增模型可见输入。

## 备选方案

- **泛化 `HistoricalImageCache` 并借 `ctx.uiConversation` 路由预览**:记忆曾列为复用路径,但会触碰成熟的 `ui-conversation` 模块及其图片专用缓存。用户选择在 `ui-preview` 内自建 `PreviewFileCache`(读 `readPreviewFile`),把爆炸半径留在新模块内;若日后出现第二个通用文件消费者,再抽取共享缓存。
- **借 `ui-attachment` 的消息图片路径渲染预览**:仅限图片,且该 slot 契约为消息作用域而非 turn 作用域。排除。
- **专用 `PreviewRegistry` provider**:已排除 —— 契约包、`previewFile` RPC 与渲染器已覆盖该 seam,无多 provider 变体。

## 后果

- 本包是 `ui-deliverables` 之后的第一个 turn-tail 占用者;客户端 slot catalog 重生成以列出 `client-ui-preview PreviewFiles`。
- `dsh-preview` 加入 `INLINE_SAFE`,使客户端 bundle 可内联纯函数 `previewsFromMeta`/`previewKindOf`;Web patch 与 web-app package.json 增加 `ui-preview` 行与依赖。
- 自包含 `PreviewFileCache` 读 `readPreviewFile` 并把 URL 作用域限定到会话绑定;不触碰 `ui-conversation` 的图片缓存。产物 PPTX 在 `preview_files` 中转换为 PNG 缩略图(LibreOffice `soffice` → PDF,poppler `pdftoppm` → PNG)并注册为图片预览;转换栈缺失时降级为原始 PPTX(下载链接)。
- 修复 `verify-cordis-config` 时暴露了此前产物文件批次落下的接线缺口:`@deepseek-ai/dsh-tool-preview` 与 `@deepseek-ai/dsh-attachment-local/file-attachments` 在 base patch 中被引用,却未在 `packages/bundle/base/package.json` 声明,也未在 `tsconfig.base.json` 映射。两者均已在此补齐,使配置门禁通过且 tsx 源码启动可解析它们。
- **两处 `inject` 遗漏已修复**(只有真实模型 turn + 浏览器才暴露,单测/REAL-composition 未覆盖):`preview_files` 只注入 `['tools']` 却读 `ctx.fs`/`ctx.fileAttachments`;session-controller 的 `previewFile` RPC 读 `ctx.fileAttachments` 却只注入图片 `attachments` 服务。均已补上缺失服务(`['tools','fs','fileAttachments']` 与 `'fileAttachments'`)。
- **产出文件自动登记**:fs 的 `write`/`edit` 工具把成功变更折入结果 `previews` meta,使渲染器无需模型显式调 `preview_files` 即可显示预览行。`mediaTypeOf` 移到 `dsh-preview` 契约以便工具与 fs 工具共享(避免 tool-preview ↔ fs 循环);登记经 `ctx.get` 读可选的 `fileAttachments` 服务,fs 工具在该存储缺席时仍可用。
- **在真实浏览器中端到端验证通过**(真实 workspace):`preview_files` 注册产物文件、`previews` meta 与内容寻址字节落盘、预览行渲染、`readPreviewFile` 供字节进沙箱 iframe(或按类型解码文本/JSON、下载链接)。
- 客户端与宿主 typecheck 聚合需要 ui-preview 与 preview/preview 项目引用;客户端聚合(它会 typecheck `packages/client/*/tests`)暴露了包级 `tsc -b`(仅 src)未覆盖的测试文件类型错误。

## 待办(延后):ui-conversation 域分层

`verify-client-domain-graph` 报 3 处 pre-existing 违规 —— `skeleton/InputBar` import `input/editor/*`(ComposerContentEditable、DecoratorPortals、registerComposerKeymap)。domain-graph 规则禁止兄弟域 import,且只豁免 `contract/`(类型层)或 `src/client/` 根文件(`domainOf` 对根返回 `''`,子目录会变成独立域,`contract/` 又不能 import 域)。因此干净修法需其一:(a) 把 editor 族平铺到 `src/client/` 根;(b) 抽独立共享 composer-editor 模块;(c) 由 `input` 域经 slot 把 composer editor 暴露给 shell。作为单独的 ui-conversation 重构延后。

## 针对部署方案验证

用真实 `DEEPSEEK_API_KEY` + 用户自己的 workspace 做浏览器 dogfood,确认整条链路端到端可用,且当模型凭据在 Web Models 页面配置(写入持久化的 `$DSH_HOME/.credentials.yaml`)后,修复跨 `dsh --profile web` 重启仍可持续生效。
