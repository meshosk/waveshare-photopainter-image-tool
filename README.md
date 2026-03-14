# !!! DISCLAIMER !!!

Keep in mind, that I'm lazy... very lazy... so this whole app is prompted... Yes, shame on me... It works... somehow...

# PhotoPainter Converter

Desktop app in electron??? for preparing images for Waveshare PhotoPainter without any local server.

## Features

- Imports JPG, PNG, WebP, BMP, GIF, and HEIC
- Interactive crop with fixed PhotoPainter aspect ratio
- Landscape `800 x 480` and portrait `480 x 800`
- Floyd-Steinberg dithering to a 7-color e-paper palette
- Exports uncompressed 24-bit BMP

## Ovladanie

1. Klikni na Vybrat obrazok a nahraj vstupnu fotku.
2. Vyber orientaciu vystupu:
	- 800 x 480 (landscape)
	- 480 x 800 (portrait)
3. Umiestni vyrez priamo mysou na zdrojovom obrazku.
4. Pouzi zoom slider alebo tlacidla Oddialit a Priblizit.
5. Preview panel zobrazuje realny vysledok vyrezu.
6. Ak cast vyrezu siaha mimo zdrojovy obrazok, tato cast je biela.
7. Klikni na Export BMP a uloz vystupny subor.

## Spustenie cez Vite

### Vite dev (live reload)

1. docker compose up dev
2. otvor http://localhost:5173

### Vite preview (produkcny build)

1. docker compose up preview
2. otvor http://localhost:4173

### Zastavenie sluzieb

1. docker compose down

## Docker workflow

This workspace assumes you do not install Node.js on the host.

Install dependencies:

```bash
docker compose run --rm node npm install
```

Run typecheck and renderer build:

```bash
docker compose run --rm node npm run build
```

Run the app UI without local Node installation (Docker-only):

```bash
docker compose up preview
```

Then open `http://localhost:4173` in your browser.

Stop it with:

```bash
docker compose down
```

Note about Electron GUI in Docker on macOS:

- Native Electron window rendering from Linux containers is not practical on macOS without extra GUI forwarding setup.
- For day-to-day development without local installs, use the Docker preview service above.
- For final standalone desktop installers, build per platform in CI (macOS runner for DMG, Windows runner for EXE, Linux runner for AppImage).

If you later want to package the Electron app, use a host build for the target platform. Electron packaging for macOS cannot be produced from a generic Linux container.

## Export pipeline

1. Load an image.
2. Position and zoom the crop frame.
3. Resize the selected area to `800 x 480` or `480 x 800`.
4. Reduce colors to the 7-color PhotoPainter palette.
5. Apply Floyd-Steinberg dithering.
6. Save the final image as 24-bit BMP.