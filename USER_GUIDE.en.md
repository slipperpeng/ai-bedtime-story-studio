# Dreamweaver User Guide

[中文手册](USER_GUIDE.md) | [English User Guide](USER_GUIDE.en.md) | [Project README](README.en.md)

Applies to version: `1.1.0`

## 1. Before you begin

### Computer and network

- Windows: Windows 10/11 x64.
- macOS: macOS 12 or later on Apple Silicon arm64.
- Recommended: modern four-core processor, 8 GB RAM or more, SSD, and stable broadband.
- Large generation models do not run on your computer, so a high-end GPU is not required. Story writing, illustrations, system-voice previews, online cloning, and narration need internet access.

### Get an API Key

1. Open the [MiniMax platform](https://platform.minimaxi.com/).
2. Register and complete any identity or voice-cloning verification required by the platform.
3. Create an API Key and confirm that text, image, and speech APIs have permission and available quota.
4. Never share the key or place it in screenshots, chat logs, source code, or a public repository.

## 2. Install and open the app

### Windows

1. Download the latest `*-x64-setup.exe` from [GitHub Releases](https://github.com/slipperpeng/ai-bedtime-story-studio/releases).
2. Run the installer and follow the prompts.
3. Open Dreamweaver. When minimized, the app can be reopened from its system-tray icon.

### macOS

1. Download the latest `*-arm64.dmg` from GitHub Releases.
2. Open the DMG and drag the app into Applications.
3. Open-source builds may not have an Apple Developer signature. If macOS blocks the first launch, review it in System Settings > Privacy & Security and choose Open. Download only from the official project Release.

## 3. Configure the online service

1. Select the gear button in the top-right corner.
2. Enter your MiniMax API Key.
3. Model IDs, endpoint paths, and the API base URL are locked to recommended values. Unlock them only when you understand the API configuration.
4. Select Save settings.
5. Check Online plan in the lower-left corner. It shows a setup reminder before configuration and periodically queries plan usage afterward.

An unavailable usage check does not always mean the quota is empty. Network conditions, account permissions, or a temporary service problem can also prevent the query. The platform console is the source of truth.

## 4. Switch between Chinese and English

Use 中文 / EN in the top-right corner:

- 中文 changes the interface, story, chapter text, system voices, and export to Chinese.
- EN changes them to English.
- The selection is saved on this computer.
- Finished stories keep the language selected when they were created. Changing the interface does not translate an existing story.
- Projects from older releases that have no language field open as Chinese projects.

## 5. Step 1: choose a narration voice

### Built-in voices

1. Chinese mode provides 64 Chinese system voices. English mode provides 4 English story voices.
2. Voices selected for bedtime narration appear first with a Recommended badge.
3. Select Preview to generate a short sample. The first preview needs internet access and consumes speech quota; the result is then cached locally.
4. Select Use to choose that voice for the story.

### Online voice cloning

1. Switch to Online clone.
2. Record only an adult who has explicitly authorized this use. Never record children, public figures, or anyone without permission.
3. Record the three guided lines shown for the current language. The combined sample must be at least 10 seconds. Use a quiet room and keep a stable distance from the microphone.
4. Watch the microphone level. If no useful speech is detected, check microphone permissions, the selected input device, and system input volume before saving.
5. Guided recordings are merged and their transcript is synchronized automatically. If you upload one complete audio file instead, enter the exact words spoken in it.
6. Review the consent dialog and confirm before uploading.

The original recording is stored locally. If the temporary remote voice expires, choose Prepare again; after confirmation, the app uploads the saved sample and creates a replacement without another recording. The online service may charge another activation fee.

## 6. Step 2: customize the story

### Story templates

Ten templates can fill in a title, theme, story seed, chapter count, art style, and music. The child's nickname and age are not overwritten, and every filled field remains editable. Chinese and English modes use matching template copy.

### Nickname and age

- The nickname normally becomes the main character and appears in dialogue, actions, and illustration direction. Use a nickname, not a legal name, school, address, or other private detail.
- Age changes vocabulary, plot complexity, emotional safety, and explanation style. It does not silently shorten the selected chapter length.

### Theme

The theme guides the setting, central challenge, emotional arc, and ending. Write what you hope the child experiences or understands, such as “learning to face the dark with a friend.” A complete plot is not required.

### Story source

- AI original: optionally add a character or plot idea and let the model create the story.
- My draft: paste your own draft; the model organizes it into chapters and picture-book structure.

### Chapters and length

- Choose 2–12 chapters.
- Use the age-based, short, standard, rich, or custom range.
- Chinese length counts Han characters only, excluding punctuation, spaces, digits, and Latin letters.
- English length counts letters and digits, excluding spaces and punctuation.
- Every chapter is checked independently and repaired into the selected range; the app does not use a whole-book average.

### Art and music

- Five art styles are available: Moonlight watercolor, Paper-cut collage, Crayon doodle, Colored-pencil fairy tale, and Soft-clay dream.
- Each chapter receives one illustration based on the text and consistent character direction.
- Twenty built-in instrumental tracks can be previewed, selected, or disabled. They do not use online music-generation quota.
- Music automatically softens during narration.

Select Create story when the settings are ready.

## 7. Step 3: follow production

The production page shows voice preparation, story writing, built-in music, illustration, narration, and HTML packaging. Each long step reports progress, a count, or estimated time.

- Do not repeatedly start the same request while it is running.
- For a rate limit, wait and select Continue from completed steps. Finished chapters and illustrations are retained.
- For exhausted quota, add plan credit or balance before continuing.
- After a network interruption, restore the connection and continue the existing task.

## 8. Step 4: read the finished story

- Turn pages with the buttons, arrow keys, or a horizontal swipe on touch devices.
- The play button controls the current chapter. Changing page resets that chapter's narration to the beginning.
- Continuous play advances to the next page after a chapter ends.
- Playback defaults to `1.0x`; Slow, Bedtime, Normal, and Fast presets are available.
- Narration volume is available on supported platforms. It is hidden on iPhone and iPad to avoid platform audio-processing problems.
- When music is included, the reader shows music power and volume controls. Music remains softly ducked during narration.
- Story details lists the voice, art style, source, length, and creation time, without internal model configuration.

## 9. Export and share an HTML picture book

1. Select the story in the Library.
2. Select Export HTML picture book.
3. Review the privacy notice and choose a save location.
4. The single HTML file embeds the story, images, narration, and optional music. Copy it to a phone, tablet, or another computer and open it offline.

Mobile zoom gestures are disabled to prevent accidental scaling, while horizontal swipe page turns remain available. iOS and iPadOS use a compatible narration path and hide the narration-volume control that can trigger audio distortion.

The export contains the child's nickname and story content. Share it only with trusted recipients; the app cannot remotely recall a copied file.

## 10. Troubleshooting

### Rate limit exceeded

The online service has reached its requests-per-minute limit. Wait before continuing and do not repeatedly click the action.

### Not enough quota

Check the MiniMax console for text, image, and speech quota. These capabilities may use different limits; available text quota does not guarantee image or speech quota.

### A system voice will not preview

Check the API Key, network connection, speech permission, and account balance. The first preview calls the online speech API.

### Online cloning fails

Confirm that the recording is at least 10 seconds, clear, and matched by the reference text, and that platform verification is complete. Re-creating or deleting a remote voice may have service charges.

### A Chinese voice appears in an English story

Return to the Voice or Story step in EN mode and choose an English built-in or cloned voice. Voices are not automatically exchanged across languages.

### An exported HTML file is silent

Some mobile browsers require one user click before audio can start. Check the device mute state, and open the file in a browser rather than an embedded chat-app preview.

## 11. Privacy and deletion

- Deleting a personal voice first requests deletion of the remote clone, then removes the local sample and record.
- Deleting a story removes its chapters, images, narration, and internal HTML from the app. Previously exported files are not affected.
- Never commit API Keys, original recordings, or packaged builds to a public repository.

Whenever a user-visible feature changes, update this guide, the [Chinese guide](USER_GUIDE.md), both README files, and CHANGELOG.
