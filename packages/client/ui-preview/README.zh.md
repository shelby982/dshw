---
description: "Web GUI 里的产物文件预览:一轮结束后出现的预览行,列出工具产出的图片、页面、幻灯片、文本与 JSON 文件;面向预览体验的用户与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-preview

[English](README.md) | 中文

## Summary

本包渲染一轮结束后出现的预览行 —— 工具注册为可预览的产物文件,每个都从其持久预览字节加载并在浏览器中渲染。词汇来自产物文件工具附加在其 `tool/result` 上的 `previews` meta,而非结尾文案 —— 无论模型是否记得点名,产物文件都会被列出。随附的 Web patch 是唯一加载本包的组合;移除其 cordis.yml 条目即移除该行,并以零成本留下空 turn-tail 链。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

与 `ui-conversation` 一同挂载;一轮结束后,预览行便出现在结尾消息正文与其操作页脚之间。每个条目通过会话授权的 `previewFile` RPC 加载其持久字节,并按类型渲染内容:`图片` 预览显示图像,`页面` 预览在沙箱化 iframe 中渲染 HTML,`文本` 与 `JSON` 预览解码字节(JSON 美化打印),`幻灯片` 与其他类型提供可下载链接。该行以持久附件为键;列表中的预览对象在挂载时按需加载并按会话缓存。

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>实现内部 —— 点击展开</summary>

Node 半层为空操作。浏览器半层把 `PreviewFiles` 注册进聊天视图的 `conversation.chat.turnTail` 空位。`previewDefinition` 从成功的、append-surface `tool/result` 事件上的 `previews` meta,把每一轮的产物预览折入 `PreviewTurnData`。读取、不支持的 tools、格式错误的调用、失败结果以及 replacement surface 操作都不贡献内容。附件按内容寻址,因此同一字节在一轮内产出两次只渲染一次,按首次出现顺序。`PreviewFileCache` 通过 `session.readPreviewFile` 把每个持久的 `FileAttachmentRef` 解析为浏览器 URL(blob,或 data-URL 回退),按会话缓存,并在会话作用域拆除时释放 URL。该行通过 `owner.turn.data` 读取条目 —— 与聊天视图投影所用的同一个 Location 索引存储。组合掉本插件即移除该行并留下空 tail 空位。

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

当预览界面不够时,请阅读以下页面。

- [预览契约](../../preview/preview/README.zh.md) —— 持有该行读取的 `produced-preview` meta 载荷。
- [预览文件 RPC](../../api/session-controller/README.zh.md) —— 每个预览引用背后的会话授权字节。
- [ui-conversation](../ui-conversation/README.zh.md) —— 声明 `conversation.chat.turnTail` 空位并渲染结尾文案。
- [客户端包映射](../README.zh.md) —— 相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## Model Experience

### 产物文件预览行

#### 模型看到什么

没有任何新增。预览词汇经由产物文件工具自身的 `previews` 结果 meta 进入转录;该行不增加提示段落、不增加工具 schema、不增加模型可见上下文。

#### Token 影响

无 —— 本包不贡献提示文本或工具面。

#### KV Cache 影响

无 —— 提示前缀不因本包改变。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了当前的预览面。它们是当前包的约束,而非通用文件预览对比或任务积压。

- **PPT 缩略图依赖环境** —— host 必须提供 LibreOffice 与 poppler 转换管线;在此之前,该行把 `幻灯片` 预览渲染为可下载链接而非图片缩略图。
- **非可预览媒体类型回退为下载** —— 该行把 `image`/`html`/`text`/`json` 之外的类型渲染为可下载文件链接,使未知产物文件仍可达。

<a id="dev-note"></a>
### Dev Note

<details>
<summary>面向维护者的工作上下文 —— 点击展开</summary>

无。

</details>

**运行时不变式:** 未发布 companion。空位、字典、事件定义与客户端注册都由 effect 拥有,其销毁由插件 spec 证明;本包不持有可变状态。
