# Dreamweaver / 枕边造梦

[中文](README.md) | [English](README.en.md) | [中文用户手册](USER_GUIDE.md) | [English User Guide](USER_GUIDE.en.md)

Dreamweaver is a bilingual desktop AI bedtime story studio for parents and guardians. It provides Chinese and English interfaces, stories, voices, and standalone HTML picture books. Families can choose a built-in story voice or create an online clone from an explicitly authorized adult recording, then generate age-aware writing, one illustration per chapter, and narration.

Current version: `1.1.0`

## Before first use: configure a MiniMax API Key

Story writing, chapter illustrations, system-voice previews, online voice cloning, and narration use MiniMax online services. **You must configure a MiniMax API Key before creating your first story. Without it, you can browse the app but cannot complete the online production flow.**

1. Register on the [MiniMax platform](https://platform.minimaxi.com/) and complete the required verification.
2. Create an API Key and make sure the text, image, and speech APIs have available quota.
3. Open the app, select Generation settings in the top-right corner, enter the API Key, and save.
4. The Online plan panel in the lower-left corner shows configuration status and available plan usage when it can be queried.

Enter the API Key only in the local app. Never put a real key in source code, `.env`, documentation, screenshots, logs, or GitHub issues. The app protects the key using operating-system credential storage, and exported HTML files do not contain it. Online requests consume plan quota or incur charges; see the [MiniMax documentation](https://platform.minimaxi.com/docs/) for current terms.

## Bilingual support

- Interface: switch between 中文 and EN from the top-right corner; the choice is saved locally.
- Stories: Chinese mode creates Chinese content; English mode creates English chapters, titles, summaries, image direction, and narration.
- Voices: 64 Chinese system voices, 4 built-in English story voices, and authorized adult voice cloning in either language.
- Presets: 10 story templates, 5 illustration styles, and 20 built-in music tracks include Chinese and English descriptions.
- Export: the standalone HTML inherits the story language, including its cover, chapters, labels, accessibility text, and playback controls.
- Compatibility: older projects without a language field open as Chinese projects and remain usable.

## Main features

- Story creation: AI original writing or adaptation of a user draft, with nickname, age, theme, 2–12 chapters, and per-chapter length controls.
- Illustration: one generated image per chapter in five curated picture-book styles.
- Narration: built-in or authorized cloned voices using the bedtime default `speed 0.80 / pitch 0 / emotion happy`.
- Music: 20 locally bundled AI-generated instrumental tracks with automatic narration ducking.
- Reading: book-style page turns, continuous narration, playback speed, narration volume, and optional music controls.
- Standalone output: text, images, narration, and selected music are embedded in one responsive HTML file that works offline.

See the [English User Guide](USER_GUIDE.en.md) for complete instructions.

## Supported platforms

| Platform | Requirement |
| --- | --- |
| Windows | Windows 10/11 x64 |
| macOS | macOS 12 or later on Apple Silicon arm64 |

Recommended hardware is a modern four-core processor, 8 GB RAM or more, an SSD, and stable broadband. The main models run online, so no local large-model installation is required. Generation time and cost depend on the network, API permissions, and account quota.

## Data and responsible use

- The Electron main process reads the API Key and protects it with operating-system credential storage; the renderer does not receive the key.
- Online cloning is restricted to explicitly authorized adult voices. Do not record children or public figures.
- Online production sends only the necessary story settings, chapter context, image prompts, voice identifiers, or authorized recording.
- The original recording remains local so the user can explicitly re-create an expired remote voice.
- Standalone HTML files do not contain API Keys, drafts, internal prompts, or original voice recordings.

See [SECURITY.md](SECURITY.md) and [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md).

## Local development

Node.js 22 and npm are required.

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm test
npm run build
```

## Website

The bilingual static website is in `website/`.

```bash
cd website
npm ci
npm run dev
npm run build
```

Cloudflare Pages configuration:

```text
Root directory: website
Build command: npm run build
Build output directory: dist
Production branch: main
```

## Packaging and releases

Build Windows locally:

```powershell
npm ci
npm run dist:win
```

Build macOS Apple Silicon locally:

```bash
npm ci
npm run dist:mac -- --arm64
```

Pushing a version tag such as `v1.1.0` starts GitHub Actions on Windows and macOS. After both packages pass their tests and build successfully, the workflow creates the matching GitHub Release and attaches the EXE and DMG. Local packages are written to `release/` and are not committed.

## Repository layout

```text
src/          Electron main process, preload, React UI, and shared contracts
resources/    App icons and 20 built-in music tracks
scripts/      Icon, website audio, packaging, and release utilities
tests/        Unit and integration tests
website/      Bilingual static product website
```

## License

Source code is available under the [MIT License](LICENSE). All 20 bundled background-music tracks were AI-generated and may be used, copied, modified, sold, and redistributed by users; see [ASSET_LICENSE.md](ASSET_LICENSE.md). Third-party dependencies and references are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
