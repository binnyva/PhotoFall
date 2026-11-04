# PhotoFall

A full-screen slideshow for macOS that drops your photos and videos onto a pile of Polaroids.

- Each new photo lands where it doesn't cover the last two.
- Videos play once. The next photo falls 3 seconds after a video lands, and the video keeps playing underneath until it ends.
- The date the photo was taken is written on the card's bottom strip.
- Reads JPEG, PNG, GIF, WebP, AVIF, BMP, HEIC/HEIF and TIFF (converted with macOS `sips`), and MP4, MOV, M4V and WebM video.

## Run it

```sh
npm install
npm run dev        # development, with reload
npm run dist:mac   # builds dist/PhotoFall-<version>.dmg (universal: Apple Silicon + Intel)
```

The .dmg is unsigned, so the first time you open the app, right-click it and choose Open.

Set `PHOTOFALL_WINDOWED=1` to start in a window instead of full screen.

## Controls

| Key | Action |
| --- | --- |
| Space | Pause / resume |
| → | Next photo now |
| , or Cmd+, | Settings |
| Cmd+K | Clear the pile |
| Esc | Leave full screen |
| Cmd+Q | Quit |

## Settings

Saved to `~/Library/Application Support/PhotoFall/settings.json`.

- **Source folder** (default `~/Pictures`) and **Include subfolders**. Hidden folders and library packages such as `Photos Library.photoslibrary` are skipped.
- **Delay** between photos, in seconds.
- **Sort by**: date taken (EXIF, or the QuickTime creation time for videos, falling back to the file's created date), file created date, file name (natural order: IMG_2 before IMG_10), or random (reshuffled each loop). **Order** flips oldest/newest first.
- **Show date on photos** and **Play video sound** (off by default).

## Layout

```
src/main/       Electron main process: window, menu, settings, folder scan, metadata, HEIC conversion,
                and the photofall:// protocol that serves files to the renderer by id
src/preload/    The typed window.photofall API
src/renderer/   The slideshow: pile, placement, fall animation, settings panel
src/shared/     Types, sorting and the placement algorithm (pure, unit tested)
tests/          Vitest unit tests (npm test)
```
