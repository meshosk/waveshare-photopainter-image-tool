# PhotoPainter Converter

Browser preview workflow for preparing images for Waveshare PhotoPainter without installing Node.js on the host.

## Features

- Imports JPG, PNG, WebP, BMP, GIF, and HEIC
- Interactive crop with fixed PhotoPainter aspect ratio
- Landscape `800 x 480` and portrait `480 x 800`
- Floyd-Steinberg dithering to a 7-color e-paper palette
- Exports uncompressed 24-bit BMP

## Usage

1. Click Select Image and load a source photo.
2. Choose the output orientation:
   - 800 x 480 landscape
   - 480 x 800 portrait
3. Position the crop directly on the source image.
4. Adjust the zoom with the slider or buttons.
5. Check the preview panel for the final crop result.
6. Areas outside the source image are filled with white.
7. Click Export BMP and save the output file.

## Docker Preview

This workspace assumes you do not install Node.js on the host.

Install dependencies:

```bash
docker compose run --rm node npm install
```

Run the preview service:

```bash
docker compose up preview
```

Then open `http://localhost:4173` in your browser.

You can also run the same flow directly in the node container:

```bash
docker compose run --rm node npm run vite -- --host 0.0.0.0 --port 4173
```

Stop the preview service with:

```bash
docker compose down
```

The only npm script currently exposed by the project is:

```bash
npm run vite
```

It performs a production renderer build and then starts `vite preview`.

## Packaging

The project also exposes platform packaging commands for Electron:

```bash
npm run build:mac
npm run build:win
```

These commands build the renderer into `dist` and then run `electron-builder` for the selected platform.

- `npm run build:mac` builds an unsigned macOS app bundle directory (no ZIP)
- `npm run build:win` builds a portable Windows `.exe` that starts the app directly without an installer

Use these commands on an appropriate host environment for the target platform. The Docker preview container is intended only for the browser preview workflow, not for final desktop packaging.

## Packaging With Docker

If you do not want to install Node.js on the host, use Docker for the supported Windows packaging target:

```bash
docker compose run --rm build-win
```

This service installs dependencies inside the container and then runs the matching npm packaging script.

macOS packaging is the exception. A generic Linux Docker container cannot produce a proper macOS Electron build. Keep `npm run build:mac` for a real macOS Node environment or a macOS CI runner.

## Export pipeline

1. Load an image.
2. Position and zoom the crop frame.
3. Resize the selected area to `800 x 480` or `480 x 800`.
4. Reduce colors to the 7-color PhotoPainter palette.
5. Apply Floyd-Steinberg dithering.
6. Save the final image as 24-bit BMP.