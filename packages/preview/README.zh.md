---
description: "产物文件预览子系统:持久预览契约与面向模型的 preview_files 工具,两者都构建在附件 seam 之上。"
kind: "package-group"
---

# preview/ — 产物文件预览

[English](README.md) | 中文

## 概述

`preview/` 组是产物文件预览 seam:它持有产物文件工具与浏览器渲染器之间的持久契约,以及面向模型、登记待预览文件的工具。该契约复用了通用文件附件存储(`ctx.fileAttachments`),而非拓宽仅限图片的附件路径;产物文件作为内容寻址对象存储,并由持久的 `FileAttachmentRef` 引用,会话授权 RPC 据此读回,浏览器渲染器据此消费。该子系统位于[附件 seam](../../docs/subsystems/attachment.zh.md)之上 —— 关于两者共享的内容寻址对象层,请见该页。

## 目录

- [Packages](#packages)
- [Related documentation](#related-documentation)

-----

<a id="packages"></a>
## Packages

| Package | 角色 |
|---|---|
| [`preview/`](preview/README.zh.md) | `@deepseek-ai/dsh-preview` —— 工具结果 `previews` meta 载荷与纯读者 `previewsFromMeta` / `previewKindOf`。 |
| [`tool-preview/`](tool-preview/README.zh.md) | `@deepseek-ai/dsh-tool-preview` —— 面向模型的 `preview_files` 工具,把产物文件登记为持久的预览引用。 |

-----

<a id="related-documentation"></a>
## Related documentation

- [附件子系统](../../docs/subsystems/attachment.zh.md) —— 预览 seam 复用的内容寻址对象层与通用文件存储。
- [会话引用授权](../../docs/subsystems/session.zh.md) —— `previewFile` RPC 如何把记录的引用授权回产出它的会话。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 —— 点击展开</summary>

无。

</details>
