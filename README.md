# WallGen

WallGen is a standalone wallpaper website that runs by opening `index.html` directly in the browser.

This repository also includes a ready-to-use Lively wallpaper package at `0wj1biqk.f41` (a WebGL fluid simulation). Drop that folder into the Lively wallpaper window to use the included Lively wallpaper.

## Features

- full-screen wallpaper background
- fixed centered quote
- background-only mouse parallax effect
- automatic wallpaper rotation every 30 minutes
-- automatic wallpaper rotation (default: 5 minutes)
- session restore for the last wallpaper

## Project Structure

```text
.
|-- index.html
|-- public/
|   |-- app.js
|   |-- index.html
|   `-- styles.css
`-- README.md
```

## Local Run

Open `index.html` directly.

No server is required.

Lively notes and compatibility
 - A Lively-ready package is included at `0wj1biqk.f41` (WebGL Fluid Simulation). Use Lively's "Add Wallpaper" or drag & drop the folder into the Lively window to install.
 - Lively runs wallpaper HTML/CSS/JS inside a host process; heavy synchronous CPU work (large canvas encodes, many createObjectURL calls, or large synchronous image processing) can stall the host and cause the wallpaper or the host app to hang. WallGen includes a lighter "Lively-friendly" code path that:
	 - limits image processing concurrency,
	 - schedules cache work during idle time,
	 - uses async image decoding (createImageBitmap / OffscreenCanvas when available), and
	 - skips heavy processing when the page is hidden.
 - If you still see crashes in Lively, try running WallGen in "Lively mode" (disable cropping and caching) by opening `app.js` and setting the following flags near the top of the file:
	 - `PROCESS_CONCURRENCY = 0` (disable CPU processing)
	 - or disable caching by commenting out calls to `cacheImageRemote()`.

If you'd like, I can add an explicit `?lively=1` URL flag or in-page toggle to force the lightweight mode automatically when Lively is detected.

## Notes

- Wallpaper images are selected from a built-in catalog in `public/app.js`.
- The quote text stays fixed while only the background moves and rotates.
