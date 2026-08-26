# Repository instructions

## Current release

The repository documents and publishes version `1.1.0`. Describe the current product state in present tense and keep release documentation focused on this version.

## User-visible changes

Any user-visible functional change must update `CHANGELOG.md`. Update `README.md` when the current feature overview, platform requirements, privacy behavior, development commands or release process changes.

Before handing off a functional change:

1. Add a concise entry to `CHANGELOG.md`.
2. Keep versions in `package.json`, `website/package.json`, `src/shared/app-version.ts`, website copy and download metadata synchronized.
3. Verify that user-facing names and button labels match both the Chinese and English UI.
4. State which user-visible references were updated.

Never commit API keys, access tokens, private signing material, local recordings, generated stories, model weights, caches or packaged build outputs.
