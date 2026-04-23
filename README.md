# WallGen

WallGen is a web-based live wallpaper designed to run in a browser or inside the Lively Wallpaper host. It rotates full-screen images with centered quotes and offers a lightweight GPU renderer to reduce main-thread work when running inside Lively.

**Included**
- `index.html` — wallpaper entry point.
- `app.js` — core wallpaper logic (image/quote pools, caching, processing, and UI).
- `webgl_renderer.js` — optional, lightweight WebGL renderer (enable with `?webgl=1`).
- `lively.json` — simple manifest to help package as a Lively wallpaper.
- `styles.css` — UI and layout styles.

**Quick Browser Usage**
- Open `index.html` in a modern browser.
- To enable the GPU renderer: open `index.html?webgl=1`.

**Install as a Lively Wallpaper**
- Drag & drop the folder (or a ZIP of it) into Lively's main window.
- Or use Lively's "Create Wallpaper" and point to the folder containing `index.html` and `lively.json`.
- A `preview.png` at the root helps Lively show a nicer thumbnail in the library.

**Lively-friendly defaults & safety**
- Auto-rotation default: 5 minutes.
- The app prefers a GPU path when `?webgl=1` is present; this uploads images to GPU textures and avoids large main-thread canvas encodes.
- The runtime auto-disables the WebGL path after several consecutive render errors to avoid host instability.
- Image processing is asynchronous and bounded to reduce memory and CPU pressure. Old cache entries (5+ days) are cleaned automatically at startup.

**Packaging for distribution**
1. Ensure `index.html`, `app.js`, `webgl_renderer.js`, `styles.css`, and `lively.json` are present at the package root.
2. (Optional) Add `preview.png` for nicer library preview.
3. ZIP the folder and drag the ZIP into Lively, or drag the folder directly.

**Credits & Attributions**
- Lively Wallpaper (rocksdanister) — runtime and packaging tools: https://github.com/rocksdanister/lively
- Image sources: Picsum Photos (`https://picsum.photos`) and Unsplash fallbacks referenced in `app.js`.
- Quotes: ZenQuotes (`https://zenquotes.io`) for live quotes; offline fallback quotes are included in `app.js`.
- Fonts: Google Fonts / Fontsource.

**Troubleshooting (Lively-specific)**
- If Lively freezes or the wallpaper stalls:
  - Try `index.html?webgl=1` to prefer GPU rendering.
  - If the host still hangs, open without `?webgl=1` to force fallback CSS-based rendering.
  - The runtime disables WebGL after three consecutive render errors — refresh the wallpaper in Lively to reset.
  - To avoid host pressure, disable cropping or caching by changing `PROCESS_CONCURRENCY` or commenting out `cacheImageRemote()` calls in `app.js` (developer option).

**License**
- MIT — modify and redistribute. See the repository for license details.
