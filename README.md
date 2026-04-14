# WallGen

WallGen is a standalone wallpaper website that runs by opening `index.html` directly in the browser.

## Features

- full-screen wallpaper background
- fixed centered quote
- background-only mouse parallax effect
- automatic wallpaper rotation every 30 minutes
- double-click to load the next wallpaper
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

## Notes

- Wallpaper images are selected from a built-in catalog in `public/app.js`.
- The quote text stays fixed while only the background moves and rotates.
