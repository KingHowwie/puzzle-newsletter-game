# Disogi — Puzzle Game

GitHub Pages game for the [Disogi](https://beehiiv.com) newsletter.

## How it works

- `puzzles.json` — all puzzle content, updated automatically by the newsletter pipeline
- `fortunes.json` — fortune pool, refreshed quarterly by the newsletter pipeline
- `index.html` / `style.css` / `game.js` — the game (static, never changes)

## Setup

1. Enable GitHub Pages: Settings → Pages → Branch: `main`, Folder: `/(root)`
2. The game lives at: `https://{username}.github.io/{repo}/?date=YYYY-MM-DD`

## Data updates

All data updates are made via the Disogi newsletter pipeline (see the main repo). Do not edit `puzzles.json` or `fortunes.json` manually.
