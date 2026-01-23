# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static web games portal hosted at game.cocy.io. Contains multiple browser-based games and tools, all implemented as standalone HTML/CSS/JS without build systems or frameworks.

## Development

Run a local HTTP server from the project root:
```bash
python -m http.server 8000
```
Then access games at `http://localhost:8000/{game-name}/`

## Architecture

- **Portal**: [index.html](index.html) - Main portal page with category-based game listing
- **Game Registry**: [apps.json](apps.json) - Master list of all apps with metadata (title, icon, URL, category, platforms)
- **Games**: Each game lives in its own directory (e.g., `tetris/`, `snake/`, `number-guess/`)

### Game Directory Structure

Each game is self-contained with:
- `index.html` - Entry point
- `app.js` or inline JS - Game logic
- `style.css` or inline CSS - Styling
- `icon.svg` - Game icon for portal display

PWA-enabled games additionally include:
- `manifest.json` - PWA manifest
- `service-worker.js` - Offline support
- `icons/` - Various icon sizes

### Adding a New Game

1. Create a new directory under root (e.g., `my-game/`)
2. Add `index.html`, CSS, JS files
3. Add entry to [apps.json](apps.json) with appropriate category
4. Update [index.html](index.html) portal if the game should appear in category listings

### Categories

Games are organized in the portal by category:
- `puzzle` - Puzzle games (tileslider, blockpuzzle)
- `classic` - Classic games (tetris, snake, mine, rps)
- `casual` - Casual games (number-guess)
- `tracker` - Trackers (pikmin)

## Conventions

- UI is primarily in Korean (한국어)
- Games should support dark mode via `prefers-color-scheme: dark`
- Badge types: NEW, HOT, DEV (for in-development)
- All games are client-side only with localStorage for persistence
