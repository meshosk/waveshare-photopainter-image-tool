# Disclaimer

Whole app is coded by AI... yeah, I know... it was just one experiment... 

# PhotoPainter Converter

Desktop and browser tool for preparing images for Waveshare PhotoPainter panels.

The current UI is titled `Waveshare PhotoPainter image tool` and is built around a multi-image workflow: import several source files, tune crop per image, preview the final dithered result, then export all BMP files in one run.

App generate formated pictures for this exact e-ink photoframe, but it will also work on this e-ink display: - [https://www.waveshare.com/wiki/PhotoPainter](https://www.waveshare.com/wiki/PhotoPainter).


## What The App Does

- Imports one or more source images at once
- Supports drag and drop directly into the workspace
- Accepts JPG, JPEG, PNG, WebP, BMP, GIF, HEIC, and HEIF
- Converts unsupported HEIC and HEIF files to PNG during import when needed
- Detects duplicate source images by content hash and skips them
- Lets you switch each image between `800 x 480` landscape and `480 x 800` portrait
- Provides crop, zoom, and 90 degree rotation per image
- Optionally constrains the crop frame so it always stays inside the source image
- Shows a live preview of the final dithered output
- Reduces the image to the 7-color PhotoPainter palette with Floyd-Steinberg dithering
- Exports 24-bit BMP files with sanitized unique file names
- Saves and reloads full working sessions as `.photopaint` project files

## Current UI

The interface is split into three main areas.

### Sidebar

The left sidebar contains:

- `Select images`
- `Export project (.photopaint)`
- `Import project (.photopaint)`
- Orientation switch for the active image
- Zoom slider plus zoom in and zoom out buttons
- `Rotate left 90` and `Rotate right 90`
- `Constrain crop to image`
- `Export all (N)` batch export action
- Status text for import, project operations, and export progress
- Palette and source image metadata for the active image

### Thumbnail Strip

When images are loaded, the app shows a horizontal strip of thumbnails.

- Click a thumbnail to make it active
- Each card includes the source file name
- Each card has a `Remove` button
- Crop, orientation, zoom, rotation, and constrain settings are tracked separately per image

### Crop And Preview Area

- The center panel is the crop workspace powered by `react-easy-crop`
- You can also drag files directly onto this area to import them
- The crop frame automatically matches the selected PhotoPainter aspect ratio
- The lower preview panel shows the processed result after crop, rotation, white background fill, palette reduction, and dithering

## Typical Workflow

1. Click `Select images` or drag files into the app.
2. Pick the active image from the thumbnail strip.
3. Choose `800 x 480` or `480 x 800` for that image.
4. Move the crop, change zoom, and rotate in 90 degree steps as needed.
5. Enable `Constrain crop to image` if you want to prevent empty margins around the frame.
6. Check the preview panel.
7. Repeat for the remaining thumbnails.
8. Click `Export all` to generate BMP files for all loaded images.

## Project Files

The app can store and reload the full working state as a `.photopaint` file.

Project export includes:

- Embedded image data
- Crop position
- Zoom value
- Cropped area in pixels
- Orientation
- Rotation in degrees
- `Constrain crop to image` state
- Export timestamp

Project import validates the payload structure and then:

- restores image entries and their settings
- skips duplicate images already present in the session
- skips missing or invalid image records
- reports decode failures in the status text

In the Electron desktop app, project export uses native save dialogs. In browser preview mode, the project is downloaded as a file.

## Export Behavior

Every export goes through this pipeline:

1. Crop the selected source region.
2. Apply the selected 90 degree rotation.
3. Resize to `800 x 480` or `480 x 800`.
4. Replace transparent pixels with opaque white.
5. Map colors to the PhotoPainter palette.
6. Apply Floyd-Steinberg dithering.
7. Encode the result as an uncompressed 24-bit BMP.

Export naming rules:

- source file names are sanitized for Windows-safe BMP output
- duplicate output names are automatically uniquified with `_1`, `_2`, and so on

In the Electron desktop app, batch export writes all files into a selected folder. In browser mode, the app uses the File System Access API when available and falls back to regular downloads otherwise.

## Development Preview

This repository supports browser preview without installing Node.js on the host.

Install dependencies in the container:

```bash
docker compose run --rm node npm install
```

Run the preview server:

```bash
docker compose up preview
```

Then open:

```text
http://localhost:4173
```

You can also run the same preview flow directly:

```bash
docker compose run --rm node npm run vite -- --host 0.0.0.0 --port 4173
```

Stop the preview service with:

```bash
docker compose down
```

## Desktop Packaging

The desktop app uses Electron and Electron Builder.

Available packaging commands:

```bash
npm run build:mac
npm run build:win
```

- `npm run build:mac` builds an unsigned macOS app bundle directory
- `npm run build:win` builds a portable Windows `x64` (`amd64`) `.exe`, not an installer
- local `npm run build:win` forces a Windows `x64` portable build and leaves only one `.exe` in `release/`

These commands require a matching host environment with Node.js installed.

### Windows Packaging With Docker

If you do not want Node.js on the host, the repository includes a Docker path for Windows packaging:

```bash
docker compose run --rm build-win
```

Notes:

- this uses the large `electronuserland/builder:wine` image
- on Apple Silicon, the service is pinned to `linux/amd64`
- Windows packaging needs Wine-backed resource tooling when stamping the executable icon

### macOS Packaging

macOS packaging should be done on a real macOS host or macOS CI runner.

A generic Linux Docker container is not a valid replacement for a proper macOS Electron build.

## GitHub Actions Release Flow

The repository includes a release workflow in [.github/workflows/build-desktop.yml](.github/workflows/build-desktop.yml).

It can:

- run manually with `windows`, `macos`, or `all`
- build a macOS ZIP containing the `.app`
- build a Windows portable `.exe`
- publish both assets to a GitHub Release when a tag matching `v*` is pushed

This is the recommended Windows build path if you are on Apple Silicon and do not want to pull the large local Wine image.
