# 本地密码本

一款完全离线运行的 Windows 本地密码管理器。保险库只保存在当前电脑，不连接任何网络服务。

## 直接使用

- 安装版：`dist/本地密码本-安装版-2.0.1-x64.exe`
- 便携版：`dist/本地密码本-便携版-2.0.1-x64.exe`
- 首次启动时创建主密码，之后使用主密码解锁。
- 可按项目、用途或账号类型创建文件夹，并把密码条目归类管理。
- 可在“设置”中验证当前主密码后修改主密码，修改成功后旧密码立即失效。
- 可选择随 Windows 开机自动启动；应用启动后仍需输入主密码解锁保险库。
- 主密码无法找回，请务必牢记并定期使用“备份保险库”。

保险库默认存放在 `%APPDATA%\local-vault\vault.pvault`。即使使用便携版，保险库也会放在这个 Windows 用户目录，避免删除便携程序时误删数据。

## 安全设计

- 使用 scrypt（N=131072、r=8、p=1）从主密码派生 256 位密钥。
- 使用 AES-256-GCM 认证加密，同时防止内容被读取和静默篡改。
- 每个保险库使用独立随机盐，每次保存都使用新的 96 位随机 IV。
- 主密码和明文保险库不会写入磁盘；锁定时主动清空内存中的密钥缓冲区。
- 复制的密码会在 30 秒后从剪贴板自动清除。
- 闲置 5 分钟、Windows 锁屏或系统休眠时自动锁定。
- 界面进程启用沙箱、上下文隔离、严格内容安全策略，并拒绝权限申请与页面跳转。

## 从源码运行

```powershell
npm.cmd install
npm.cmd start
```

执行测试和重新打包：

```powershell
npm.cmd test
npm.cmd run dist
```

打包配置会直接复用 `node_modules/electron/dist` 中已安装的 Electron 运行时，不会在每次打包时重新下载 Windows ZIP。首次在新电脑构建时仍需先执行一次 `npm.cmd install`。

## 一键发布 GitHub Release

发布新版本（例如 `v1.2.0`）：

```powershell
npm.cmd run release -- 1.2.0
```

脚本会自动更新版本、同步 README、测试打包、提交并推送 `main`、创建 Release，再上传安装版和便携版。正式执行前可以预演：

```powershell
npm.cmd run release -- 1.2.0 -DryRun
```

若 Release 已创建但附件上传中断，可以断点续传：

```powershell
npm.cmd run release -- 1.2.0 -Resume
```

当前交付的 EXE 未使用商业代码签名证书，因此 Windows SmartScreen 可能在首次运行时提示“未知发布者”。这不影响本地加密功能；正式公开分发时建议使用可信代码签名证书。
