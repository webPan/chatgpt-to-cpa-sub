# ChatGPT 统一格式转 CPA / SUB

> 纯前端实现的 ChatGPT 账号凭据格式转换工具。粘贴或拖入任意格式的 JSON / JSONL，在浏览器内完成格式识别、JWT claim 回填、CPA / SUB 导出，**不向任何服务器发送数据**。

---

**在线使用**：[https://webpan.github.io/chatgpt-to-cpa-sub/](https://webpan.github.io/chatgpt-to-cpa-sub/)

---

## 背景

ChatGPT 周边生态里存在多种账号凭据格式：

| 格式 | 特征 | 典型场景 |
|---|---|---|
| **Unified JSONL** | 每行一条扁平 JSON，字段齐全 | 账号管理工具通用导出 |
| **Codex JSON / JSONL** | 顶层 `tokens` 嵌套字段 | Codex 类客户端导入 |
| **SUB bundle JSON** | bundle 根含 `accounts` 数组，账号项内嵌 `credentials` + `extra` | Sub-store 类代理工具 |

三种格式互相导入时往往缺少关键 claim（`chatgpt_account_id`、`account_id`、`organization_id` 等），本工具的核心价值是**自动从 JWT 中提取并回填这些 claim**，再按目标格式导出。

---

## 功能一览

- **自动格式识别**：实时检测输入是 unified / Codex / SUB bundle，无需手动选择
- **JWT Claim 回填**：解析 `id_token` / `access_token` 的 payload，提取并补全缺失的账号字段
- **Compat Token 生成**：当 id_token 完全缺失 payload 时，根据现有字段生成一个本地兼容 token（仅用于客户端解析，不含真实签名）
- **三种输出模式**：
  - `normalize` → 标准化 unified JSONL
  - `to-cpa` → 单账号输出 JSON，多账号自动打包为 `.tar`
  - `to-sub` → SUB bundle JSON，含 `credentials` + `extra` 完整结构
- **纯前端 TAR 打包**：无需任何原生依赖，JS 实现 POSIX ustar 格式写入
- **拖拽 / 文件选择**：支持直接拖入 `.json` / `.jsonl` / `.txt` 文件

---

## 实现方案

### 技术选型

| 层 | 技术 | 说明 |
|---|---|---|
| UI 框架 | Alpine.js | 轻量响应式，避免引入 React/Vue 等大型框架 |
| 样式 | Tailwind CSS v4（CDN） | 零构建直接使用，自定义 token 通过 `tailwind.config.js` 注入 |
| 图标 | Lucide | SVG icon，按需渲染 |
| 构建 | Gulp 5 | JS 混淆、CSS 压缩、HTML 路径重写 |

### JS 分层架构

项目采用**无模块系统的分层脚本**，按依赖顺序加载：

```
utils.js          ← 基础工具层
  └─ token.js     ← JWT 解析与 claim 回填
       └─ converter.js  ← 格式感知的记录标准化
            └─ export.js     ← 输出构建（CPA / SUB / JSONL）
                 └─ app.js        ← Alpine.js 组件，UI 状态管理
```

#### `utils.js` — 基础工具层

- **Base64url 工具**：`b64uToText` / `b64uBytes` / `b64uJson`，用于 JWT 各段的编解码
- **JWT 解码**：`decodeJwtPayload(token)` — 仅解析 payload，不验证签名（纯客户端无法验签）
- **类型强制**：`coerceTs(value)` — 将数字、ISO 字符串、Unix timestamp 统一转为秒级整数
- **文件名/时间戳**：导出文件名格式 `数量_YYYYMMDD_HHmmss`，时区固定 UTC+8

#### `token.js` — JWT Claim 回填

OpenAI 的 JWT 中 claim 主要集中在两个命名空间：

```
https://api.openai.com/auth    → account_id / chatgpt_account_id / organization_id 等
https://api.openai.com/profile → email 等
```

回填逻辑分两档：

1. **轻量回填** (`ensureIdTokenClaims`)：token 已有 payload，只补充 `chatgpt_account_id` 和 `account_id` 双字段对齐，保留 header 和 signature 不变
2. **完整重建** (`buildLocalCompatIdToken`)：token 缺少 payload 时，从 `access_token` 中提取所有可用信息，重新构造完整 payload，生成本地兼容 token

**Compat Seed 机制**：当连 `organization_id` / `project_id` 都缺失时，用 `accountId`、`userId`、`email` 拼接生成确定性的占位值（`org-xxx` / `proj_xxx`），确保下游客户端不报字段缺失。

#### `converter.js` — 格式标准化

`normalizeRecord(item)` 通过结构特征区分输入格式：

```js
if (item.tokens …)       → Codex 格式
if (item.credentials …)  → SUB bundle 格式
else                     → Unified 格式
```

三种分支统一输出为内部 record 结构，再经 `finalizeRecord()` 补全缺省字段（`client_id`、`privacy_mode`、`websockets_v2` 开关等）并触发 token 回填。

格式自动检测（`normalizeRecordsFromText`）：
- 尝试解析为 JSON 数组（Codex 批量 / SUB bundle 的 `accounts` 数组）
- 逐行 JSONL 解析
- 识别失败时报告具体行号

#### `export.js` — 输出构建

**CPA 格式**：字段映射到 `type: "codex"` 结构，`expired` 字段从 `access_token` 的 `exp` claim 转换为 ISO 8601（UTC+8）。

**SUB bundle 格式**：输出 `{ exported_at, proxies: [], accounts: [...] }` 结构，每个账号含完整 `credentials` + `extra`，`expires_at` 降级为当前时间加 864000 秒（约 10 天）。

**纯 JS TAR 打包**（多账号 CPA）：

实现 POSIX ustar 格式：
- 512 字节 header block：文件名、权限、大小（八进制）、mtime、checksum
- 数据块：按 512 字节对齐填充
- 结束标志：两个全零 512 字节块

```js
// checksum 计算：先将 checksum 字段填 8 个空格，再对整个 header 求字节和
put(header, 148, "        ");
put(header, 148, checksum(header));
```

#### `app.js` — Alpine.js 组件

`converterApp()` 返回 Alpine 响应式对象，核心流程：

```
输入变化 → updateDetection()  →  实时显示格式/记录数/待回填数
点击转换 → convert()          →  normalizeRecordsFromText + buildOutput → renderOutput
```

文件加载支持两种方式：
- `<input type="file">` 通过 `FileReader` 读取
- 拖拽 `drop` 事件，相同读取逻辑

下载时针对二进制（`.tar`）和文本分别使用 `Uint8Array` / `string` 构造 `Blob`。

---

## 构建工具链

使用 **Gulp 5**（ES module 风格 `gulpfile.js`）管理开发 / 生产两套构建：

```
npm run dev    → 快速构建，JS 仅合并不混淆，CSS 直接复制
npm run build  → 生产构建，JS 混淆（javascript-obfuscator）+ CSS 压缩
npm run watch  → dev 构建 + 文件监听
```

### 开发 / 生产分离

通过模块级 `isProd` 标志区分，`setProd` 任务在 `build` 流程最前置触发：

```
gulp build = setProd → clean → parallel(buildJS, buildCSS, buildHTML, copyTailwindConfig, copyVendor, copyImages)
gulp dev   =          clean → parallel(...)
```

### `dist/` 目录结构（完整可部署）

```
dist/
├── index.html          ← gulp 生成，路径从 ./assets/ 重写为 ./
├── js/
│   ├── app.bundle[.min].js   ← 5 个源文件合并（prod 额外混淆）
│   └── tailwind.config.js    ← 原样复制，供 Tailwind CDN 读取
├── css/
│   └── app[.min].css
├── vendor/             ← Tailwind CDN / Alpine / Lucide
└── images/             ← 二进制文件以 { encoding: false } 保证完整性
```

`buildHTML` 任务使用 Node.js 内建 `Transform` 流对 `index.html` 做路径重写，不依赖额外插件：

```js
html.replaceAll("./assets/vendor/", "./vendor/");
html.replace(/<script src="\.\/assets\/js\/utils\.js">[\s\S]*?app\.js"><\/script>/, bundleTag);
```

### JS 混淆配置

混淆策略在安全性与体积之间取得平衡：

| 选项 | 值 | 原因 |
|---|---|---|
| `renameGlobals` | `false` | Alpine `x-data="converterApp()"` 依赖全局函数名 |
| `controlFlowFlattening` | `false` | 开启会使体积膨胀 1.5–3x |
| `stringArrayEncoding` | `["base64"]` | 字符串常量不可直接搜索 |
| `stringArrayThreshold` | `0.75` | 75% 字符串进入 string array，保留部分可读性 |

---

## 目录结构

```
├── index.html                  源文件（./assets/ 路径，可直接浏览器打开开发）
├── gulpfile.js
├── package.json
├── assets/
│   ├── css/app.css
│   ├── images/
│   ├── js/
│   │   ├── utils.js
│   │   ├── token.js
│   │   ├── converter.js
│   │   ├── export.js
│   │   ├── app.js
│   │   └── tailwind.config.js
│   └── vendor/
│       ├── tailwindcdn.js
│       ├── alpine.min.js
│       └── lucide.min.js
└── dist/                       构建输出（完整可部署）
```

---

## 快速开始

**开发预览**（无需构建，直接打开源文件）：

```
用浏览器打开 index.html
```

**生产构建**：

```bash
npm install
npm run build   # 输出到 dist/，部署整个 dist/ 目录即可
```
