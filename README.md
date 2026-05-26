# ChatGPT to CPA / SUB

这是一个纯前端的 ChatGPT 账号凭据格式转换工具，用于在浏览器本地把常见的账号数据格式转换为 CPA 或 SUB 可用的导入格式。

项目不会把输入内容发送到服务器，转换、解析和导出都在本地浏览器中完成。

## 功能

- 自动识别 Unified JSONL、Codex JSON / JSONL、SUB bundle 等输入格式
- 支持粘贴文本、选择文件或拖拽文件导入
- 从 token 中补全缺失的账号相关字段
- 导出标准化 JSONL
- 导出 CPA 格式，多个账号时可打包为 TAR 文件
- 导出 SUB bundle JSON
- 在页面中预览转换结果并下载输出文件

更多说明见 [docs/README.md](docs/README.md)。
