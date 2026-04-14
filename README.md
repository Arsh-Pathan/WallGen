# WallGen

WallGen is a minimal wallpaper web app that pulls a live background image and a live quote, renders them full-screen, and refreshes the pairing every 30 minutes.

Live site: `https://wallgen.code-host.online/`

## Current Live Preview

![Current live WallGen preview](https://wallgen.code-host.online/api/current-wallpaper-preview.svg)

The frontend stays intentionally simple:

- one full-screen wallpaper
- one centered quote
- a stronger mouse-move parallax effect
- random Google Font selection on wallpaper changes
- on-demand random quote font loading from a broader Google Fonts catalog
- fade-out / fade-in transitions between wallpapers

## Features

- Live image fetching from Wikimedia Commons using photography-oriented categories only
  - nature landscapes
  - space imagery
  - country scenery
  - sports environments
  - city views
  - oceans and coastlines
  - wildlife
  - architecture
  - desert landscapes
  - seasonal scenery
- High-definition landscape filtering for background use
- Rejection of dashboard-like images, charts, maps, UI graphics, and text-heavy artwork
- Client keeps a local wallpaper queue for instant manual switching
- Client requests `10` wallpapers at a time and refills when only `5` remain
- Server keeps a ready pool of `50` wallpapers for fast delivery
- Live quote fetching from ZenQuotes
- 30-minute wallpaper cache for normal viewing
- Double-click anywhere to force a fresh wallpaper immediately
- Recent-image memory to reduce immediate repeats
- Docker support for deployment platforms such as `code-host.online`

## Stack

- Node.js
- Plain HTML / CSS / JavaScript
- No frontend framework
- No database

## Project Structure

```text
.
|-- public/
|   |-- app.js
|   |-- index.html
|   `-- styles.css
|-- server.js
|-- package.json
|-- Dockerfile
`-- README.md
```

## Local Run

Requirements:

- Node.js 20+ recommended

Install and run:

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Shortcuts

- Double-click: fetch a new wallpaper and quote immediately

## How It Works

The backend exposes:

- `GET /api/health`
- `GET /api/wallpaper`
- `GET /api/wallpapers`
- `GET /api/current-wallpaper-image`
- `GET /api/current-wallpaper-preview.svg`

`/api/wallpapers`:

- pulls image candidates from Wikimedia Commons categories
- pulls quote batches from ZenQuotes
- keeps a ready server-side pool of `50` wallpaper+quote pairs
- returns `10` items at a time to each client
- tracks which wallpaper images each client has already received to reduce repeats
- falls back gracefully if a live source is unavailable

## Docker

Build locally:

```bash
docker build -t wallgen .
```

Run locally:

```bash
docker run --rm -p 3000:3000 wallgen
```

## Deploying To CodeHost

This project includes a root `Dockerfile`, so platforms like `code-host.online` can build it directly.

Deployment notes:

- upload the project with the `Dockerfile` in the root
- do not upload `node_modules`
- the app listens on `PORT` and falls back to `3000`

## Notes

- External services can rate limit aggressively. WallGen now caches quote batches and Wikimedia category members to reduce repeat failures.
- If a live provider fails temporarily, the app can fall back to local content instead of breaking the page.
