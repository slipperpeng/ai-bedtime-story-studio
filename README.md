# 枕边造梦

面向家长和监护人的桌面端 AI 睡前故事工坊。用户可以选择内置中文音色，或使用已明确授权的成年人声音建立在线复刻音色，生成适龄故事、逐章插图和朗读，并导出可独立分享的 HTML 绘本。

正式版本：`1.0.0`

## 首次使用前：必须配置 MiniMax Token

本项目的故事生成、章节插图、在线音色复刻和在线语音朗读都依赖 MiniMax 在线服务。**第一次使用前必须准备 MiniMax API Key（Token），否则只能打开界面，无法完成在线创作流程。**

1. 在 [MiniMax 开放平台](https://platform.minimaxi.com/) 注册并完成实名认证。
2. 在控制台创建 API Key，并确认账户具有文本、图像和语音接口权限及可用额度。
3. 启动应用后打开“设置”，进入“在线服务”，粘贴 API Key 并保存。
4. 回到故事流程，先选择内置中文音色或完成在线音色复刻，再开始生成故事。

API Key 只应填写在本机应用的设置中。不要把真实 Token 写入 `README.md`、`.env`、截图、日志或提交到 GitHub；`.env.example` 仅是空的配置示例。应用会通过操作系统的安全存储保存密钥，导出的 HTML 不包含 API Key。

在线服务会产生接口调用费用或消耗套餐额度，实际价格、权限、实名要求和内容政策以 [MiniMax 官方文档](https://platform.minimaxi.com/docs/) 为准。

## 核心能力

- 朗读音色：64 个 MiniMax 中文系统音色，支持搜索、试听和选择；支持成年人授权录音的在线复刻。
- 故事创作：支持 AI 原创和用户原稿，提供 10 个可编辑模板，并根据孩子昵称、年龄、主题和篇幅生成内容。
- 章节控制：支持 2–12 章，每章可使用适龄推荐、预设范围或 60–500 个中文字符。
- 绘本插图：逐章生成图片，内置月光水彩、纸艺拼贴、蜡笔童画、彩铅童话和软陶梦境五种风格。
- 故事朗读：按连续情绪场景合成章节音频，默认使用 `speed 0.80 / pitch 0 / emotion happy`。
- 背景音乐：安装包内置 20 首本地轻音乐，可试听、选择或关闭，不调用在线音乐生成接口。
- 成品预览：提供书本式翻页、章节播放、连续朗读、四档语速、人声音量和背景音乐控制。
- 独立导出：将正文、插图、朗读和所选配乐嵌入单个 HTML 文件，可离线打开和分享。

## 支持平台

| 平台 | 要求 |
| --- | --- |
| Windows | Windows 10/11 x64 |
| macOS | macOS 12 或更高版本；Apple Silicon arm64 |

建议使用现代四核处理器、8 GB 或更多内存、SSD 和稳定宽带。故事文字、插图、系统音色朗读和在线复刻依赖 MiniMax 在线服务，需要有效的 API Key、对应接口权限和可用余额。

## 数据与隐私

- API Key 由 Electron 主进程读取并通过系统凭据能力加密保存，Renderer 不直接接触密钥。
- 在线复刻只允许已明确授权的成年人声音，保存前必须确认成年人、授权和在线处理范围。
- 故事生成会向所配置的在线服务发送必要的故事设定、正文上下文、绘图提示、音色编号或授权声音样本。
- 内置背景音乐从本机安装资源复制，不调用在线音乐服务。
- 独立 HTML 不包含 API Key、创作草稿、内部提示词或原始声音样本。

完整边界见 [SECURITY.md](SECURITY.md) 和 [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md)。

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

官网是位于 `website/` 的独立 Vite 静态站点。

```bash
cd website
npm ci
npm run dev
npm run build
```

Cloudflare Pages 使用以下配置：

```text
Root directory: website
Build command: npm run build
Build output directory: dist
Production branch: main
```

官网构建前会自动将 `resources/background-music/` 中的 20 首音乐同步到静态资源目录。绘本演示旁白使用 MiniMax“温暖少女”音色预生成；需要更新正文或重新生成旁白时，先在桌面应用中配置 MiniMax API Key，然后在项目根目录执行：

```bash
npm run website:narration
```

生成的四段 MP3 与音色参数清单位于 `website/public/story-demo/`，会随官网一起部署。

## 安装包与发布

macOS 安装包必须在 Apple Silicon Mac 上生成：

```bash
npm run release:package -- --platform mac
```

Windows 安装包必须在 Windows x64 环境中生成：

```powershell
npm ci
npm run release:package -- --platform win
```

产物输出到 `release/`：

```text
AI-Bedtime-Story-Studio-1.0.0-arm64.dmg
AI-Bedtime-Story-Studio-1.0.0-x64-setup.exe
```

两个安装包准备完成后，在项目根目录的 `.env.release.local` 中配置 R2 凭据：

```dotenv
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

上传到 Cloudflare R2 并更新官网下载配置：

```bash
npm run release:upload
```

脚本会将安装包上传到 `releases/v版本号/`，并更新 `website/public/downloads.json`。`.env.release.local`、构建目录和安装包均被 Git 忽略。

## 项目结构

```text
src/          Electron 主进程、Preload、React Renderer 和共享合同
resources/    应用图标与内置背景音乐
scripts/      图标、预览、打包和 R2 发布脚本
tests/        单元测试与集成测试
website/      Cloudflare Pages 官网
```

## 许可证

源码使用 [MIT License](LICENSE)。20 首内置背景音乐均由 AI 生成，允许自由使用、复制、修改、商用和再分发，详见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。第三方依赖与参考项目的分发边界见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
