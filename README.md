# WallGen

WallGen is a minimal wallpaper web app that pulls a live background image and a live quote, renders them full-screen, and refreshes the pairing every 30 minutes.

Live site: `https://wallgen.code-host.online/`

## Current Live Wallpaper

![Current live WallGen wallpaper](https://wallgen.code-host.online/api/current-wallpaper-image)

The frontend stays intentionally simple:

- one full-screen wallpaper
- one centered quote
- a stronger mouse-move parallax effect
- random Google Font selection on wallpaper changes
- on-demand random quote font loading from a broader Google Fonts catalog
- fade-out / fade-in transitions between wallpapers

## Features

- Live image fetching from Wikimedia Commons across broad topics
  - nature
  - space
  - cities
  - technology
  - countries
  - oceans
  - wildlife
  - architecture
  - abstract
- Live quote fetching from ZenQuotes
- 30-minute wallpaper cache for normal viewing
- `N` or `Space` to force a fresh wallpaper immediately
- `Ctrl+N` to force a fresh wallpaper immediately
- `Ctrl+R` supported with a fresh reload request
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

- `Ctrl+N`: fetch a new wallpaper and quote immediately
- `N` or `Space`: fetch a new wallpaper and quote immediately
- `Ctrl+R`: reload the page and request a fresh wallpaper

## How It Works

The backend exposes:

- `GET /api/health`
- `GET /api/wallpaper`
- `GET /api/current-wallpaper-image`

`/api/wallpaper`:

- pulls image candidates from Wikimedia Commons categories
- pulls quote batches from ZenQuotes
- caches external results to reduce API pressure
- keeps a short recent-image memory to avoid showing the same image again right away
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
