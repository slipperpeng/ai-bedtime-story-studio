# 枕边造梦 / Dreamweaver

[中文](README.zh-CN.md) | [English](README.md) | [中文用户手册](USER_GUIDE.md) | [English User Guide](USER_GUIDE.en.md)

面向家长和监护人的中英双语桌面端 AI 睡前故事工坊。应用支持中文与 English 界面、故事、音色和独立 HTML 绘本；可以选用内置音色，或用已明确授权的成年人录音建立在线复刻音色，再生成适龄故事、逐章插图和朗读。

当前版本：`1.1.1`

## 首次使用前：必须配置 MiniMax API Key

故事生成、章节插图、系统音色试听、在线音色复刻和语音朗读依赖 MiniMax 在线服务。**第一次创作前必须配置 MiniMax API Key，否则应用只能浏览界面，不能完成在线生成。**

1. 在 [MiniMax 开放平台](https://platform.minimaxi.com/) 注册并完成所需认证。
2. 在控制台创建 API Key，并确认文本、图像和语音接口具有可用额度。
3. 启动应用，点击右上角“生成设置”，填写 API Key 并保存。
4. 左下角“在线套餐”会显示配置状态与可查询的套餐余量。

API Key 只应填写在本机应用中。不要将真实密钥写进源码、`.env`、文档、截图、日志或 GitHub Issue。应用使用操作系统凭据能力保存密钥，导出的 HTML 不包含 API Key。在线调用会消耗套餐或产生费用，规则以 [MiniMax 官方文档](https://platform.minimaxi.com/docs/) 为准。

## 双语能力

- 界面：右上角可随时切换“中文 / EN”，选择会保存在本机。
- 故事：中文模式生成中文章节；英文模式生成 English 章节、标题、摘要、插图描述和朗读。
- 音色：中文提供 64 个系统音色；英文提供 4 个内置故事音色，并支持对应语言的成年人授权在线复刻。
- 模板：10 个故事模板、5 种绘图风格和 20 首内置轻音乐均有中英文说明。
- 导出：独立 HTML 会继承故事语言，封面、章节、按钮、辅助说明和播放器控件都会使用对应语言。
- 兼容：旧项目缺少语言字段时按中文项目打开，不会破坏已有成品。

## 核心能力

- 故事创作：AI 原创或根据用户原稿改编，支持昵称、年龄、主题、2–12 章和每章长度控制。
- 绘本插图：每章生成一张配图，提供月光水彩、纸艺拼贴、蜡笔童画、彩铅童话和软陶梦境。
- 故事朗读：系统音色或授权复刻音色，统一使用适合睡前的 `speed 0.80 / pitch 0 / emotion happy`。
- 背景音乐：20 首 AI 生成的本地纯音乐，可离线试听和使用，朗读时自动降低音量。
- 成品阅读：书本式翻页、连续朗读、语速、人声音量和可选背景音乐控制。
- 独立导出：将正文、插图、朗读和所选音乐嵌入单个响应式 HTML 文件，可离线打开和分享。

完整操作步骤见 [中文用户手册](USER_GUIDE.md)。

## 支持平台

| 平台 | 要求 |
| --- | --- |
| Windows | Windows 10/11 x64 |
| macOS | macOS 12 或更高版本；Apple Silicon arm64 |

建议使用现代四核处理器、8 GB 或更多内存、SSD 和稳定宽带。主要模型运行在在线服务中，因此无需本地部署大模型；生成速度和费用取决于网络、接口权限和账户额度。

## 数据与责任边界

- API Key 由 Electron 主进程读取并使用系统凭据能力保存，Renderer 不直接接触密钥。
- 在线复刻仅允许已明确授权的成年人声音，不得采集未成年人或公众人物声音。
- 在线生成会发送必要的故事设定、章节上下文、绘图提示、音色编号或授权录音。
- 原始录音保存在本机，用于远端临时音色过期后由用户主动重新复刻。
- 独立 HTML 不包含 API Key、创作草稿、内部提示词或原始声音样本。

详见 [SECURITY.md](SECURITY.md) 和 [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md)。

## 本地开发

需要 Node.js 22 和 npm。

```bash
npm ci
npm run dev
```

质量检查：

```bash
npm run typecheck
npm test
npm run build
```

## 官网

官网位于 `website/`，同样支持中文 / English 切换。

```bash
cd website
npm ci
npm run dev
npm run build
```

Cloudflare Pages 配置：

```text
Root directory: website
Build command: npm run build
Build output directory: dist
Production branch: main
```

## 打包与发布

Windows 本地打包：

```powershell
npm ci
npm run dist:win
```

macOS Apple Silicon 本地打包：

```bash
npm ci
npm run dist:mac -- --arm64
```

推送 `v1.1.1` 这类标签后，GitHub Actions 会分别在 Windows 和 macOS 环境运行测试、生成 EXE 与 DMG，并在两个任务都成功后自动创建对应 GitHub Release。构建产物位于本地 `release/`，不提交到 Git。

## 项目结构

```text
src/          Electron 主进程、Preload、React 界面和共享合同
resources/    应用图标与 20 首内置背景音乐
scripts/      图标、官网试听、打包和发布脚本
tests/        单元测试与集成测试
website/      中英双语静态官网
```

## 许可证

源码使用 [MIT License](LICENSE)。20 首内置背景音乐均由 AI 生成，允许用户自由使用、复制、修改、商用和再分发，详见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。第三方依赖和参考项目见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
