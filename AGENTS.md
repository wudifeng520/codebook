# AGENTS.md

> 开始任务时先读取 `PROJECT_CONTEXT.md`。完成较大任务后，更新其中的项目状态、重要决定、待办和实际验证结果；不得记录密码、密钥或其他敏感信息。

## 适用范围

本文件适用于整个仓库。若未来某个子目录包含更具体的 `AGENTS.md`，该子目录中的规则优先。

## 项目概述

这是一个 Windows 优先、完全离线运行的 Electron 密码管理器。保险库保存在 `%APPDATA%\local-vault\vault.pvault`，运行时不依赖网络服务。安全性、现有保险库兼容性和用户数据保护优先于功能便利或大范围重构。

## 技术栈与目录

- 使用 CommonJS JavaScript、Electron 37、原生 HTML/CSS 和 Node.js 内置测试运行器。
- `src/main.js`：可信的 Electron 主进程，负责窗口、安全设置、保险库状态、文件读写、IPC、自动锁定和剪贴板清理。
- `src/preload.js`：渲染进程与主进程之间的最小化桥接层。
- `src/renderer/`：无 Node.js 权限的界面层；`index.html`、`styles.css` 和 `app.js` 必须保持可在严格 CSP 下运行。
- `src/vault-crypto.js`：保险库格式、密钥派生和认证加密。
- `src/vault-model.js`：保险库数据结构、兼容性归一化和文件夹操作。
- `tests/`：使用 `node:test` 的单元测试，文件名遵循 `*.test.js`。
- `tools/generate-icon.js`：生成 `build/icon.png`。
- `tools/publish.ps1`：版本更新、构建、推送和 GitHub Release 发布流程。

## 工作原则

- 修改前先阅读相关源码、测试、`package.json` 和 README；保持改动小而聚焦。
- 保留用户已有的未提交修改，不覆盖、回退或顺带格式化无关代码。
- 项目面向中文用户；界面文案、错误信息和用户文档默认使用简体中文。
- Windows 是主要运行与发布平台。文档和验证命令优先使用 `npm.cmd` 和 PowerShell 兼容写法。
- 不手动编辑 `node_modules/`、`dist/`、`dist/win-unpacked/` 或生成的 `build/icon.png`。应修改源文件或生成脚本后重新生成。
- `package-lock.json` 必须与 `package.json` 保持同步；没有必要时不要新增依赖。
- 不把 `.pvault` 文件、主密码、明文条目、派生密钥、剪贴板内容或其他真实敏感数据写入仓库、日志、测试输出或错误信息。

## 必须保持的安全边界

- 应用必须默认完全离线。不要添加遥测、远程字体、CDN、网络同步或其他网络请求，除非用户明确要求进行产品级安全变更。
- 保持渲染进程 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，并保持生产环境禁用 DevTools。
- 保持严格 CSP；不要添加内联脚本、内联样式、`eval` 或放宽 `connect-src 'none'`。
- 用户或保险库提供的内容必须通过 `textContent`、表单值等安全 DOM API 展示；不要把用户数据拼入 `innerHTML`。
- 渲染进程不得直接访问文件系统、加密密钥或 Electron/Node.js API。新增能力时只在 `src/preload.js` 暴露最小接口，并在 `src/main.js` 通过 `safeHandler` 校验调用来源、参数和权限。
- 列表接口不得泄露密码明文；维持 `publicEntry` 一类的最小返回结构。只有确实需要编辑或复制时才读取完整条目。
- 外部网址只允许经过解析和协议白名单验证的 `http:`/`https:` 地址，并通过主进程 `shell.openExternal` 打开。
- 保持自动锁定、Windows 锁屏/休眠锁定、30 秒剪贴板清理及锁定时清空密钥缓冲区的行为。
- 保持临时文件写入后原子替换保险库的模式，避免直接覆盖导致保险库损坏。

## 加密与数据兼容性

- 当前格式为 `LocalVault` version 1，使用 scrypt（N=131072、r=8、p=1）派生 32 字节密钥，并使用 AES-256-GCM、16 字节随机盐和每次保存全新的 12 字节 IV。
- 不要无意更改格式字段、KDF 参数、加密算法、编码方式或保险库路径。
- 若任务确实要求更改保险库格式或数据模型，必须提供向后兼容的版本检测/迁移路径，保证旧保险库仍可打开，并增加成功迁移、错误密码、损坏密文和异常输入测试。
- 所有加密失败都应安全失败，不得返回部分明文或忽略认证标签错误。临时明文和密钥 Buffer 在不再使用时应尽快清零。
- `normalizeVault` 是旧数据兼容入口；新增字段应提供安全默认值，删除文件夹不得隐式删除其中的密码条目。

## 代码风格

- 延续现有风格：文件顶部使用 `'use strict';`，2 空格缩进、单引号、分号和清晰的早期校验。
- Node.js 内置模块使用 `node:` 前缀。
- 优先使用小型、职责单一的函数，避免把业务逻辑复制到渲染进程和主进程两处。
- 主进程负责安全校验和持久化；渲染进程的校验只用于即时用户反馈，不能替代主进程校验。
- 用户可见错误应明确但不暴露敏感内部信息。不要记录密码、密钥、完整保险库对象或加密前数据。
- 修改现有 UI 时沿用 CSS 变量、无框架 DOM 写法和现有视觉语言，并保持键盘操作、焦点、`aria-*` 和错误提示可用。

## 常用命令

```powershell
npm.cmd install
npm.cmd start
npm.cmd test
npm.cmd run icon
npm.cmd run dist
```

- `npm.cmd test`：运行所有单元测试。
- `npm.cmd start`：启动开发版 Electron 应用；需要人工检查的 UI、IPC 或窗口安全改动使用此命令验证。
- `npm.cmd run icon`：从 `tools/generate-icon.js` 重新生成应用图标。
- `npm.cmd run dist`：先测试、生成图标，再构建 x64 NSIS 安装版和便携版；仅在打包、Electron 配置、图标或发布相关改动需要时运行。

## 测试与完成标准

- 修改 JavaScript 后至少运行相关文件的语法检查，并运行 `npm.cmd test`。
- 修改加密、保险库模型、迁移或验证逻辑时，必须在 `tests/` 增加或更新覆盖正常路径与失败路径的测试。
- 修改 IPC 时，同时检查 `src/main.js` 和 `src/preload.js` 的通道、参数与返回值是否一致，并确认渲染进程没有获得额外权限。
- 修改界面时，除自动测试外，应在可行时启动应用，检查首次创建、解锁、增删改查、文件夹、搜索、复制、备份、锁定和错误提示中受影响的流程。
- 修改构建配置或发布脚本时，先运行测试；需要验证产物时再运行 `npm.cmd run dist`，并确认安装版与便携版文件名符合 `package.json`。
- 最终交付说明应列出实际运行过的检查以及未运行检查的原因，不要声称没有执行的验证已经通过。

## 发布保护

- 日常开发和验证不得执行真实发布。
- `npm.cmd run release -- <version>` 会修改版本、更新 README、构建、提交、推送 `main`、创建 GitHub Release 并上传附件。只有用户明确要求发布指定版本时才可执行。
- 只需检查发布流程时使用 `npm.cmd run release -- <version> -DryRun`；续传已有发布仅在用户明确要求后使用 `-Resume`。
- 不要因为测试、打包或生成 `AGENTS.md` 而自动提交、推送、创建标签或创建 Release。
