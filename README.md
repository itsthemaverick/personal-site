# Yashraj Bhogade Portfolio — Pure Static Migration

Pure **HTML5**, **CSS3**, and **Vanilla JavaScript (ES6+)** static site generated directly from **Markdown** files (`content/`) with zero runtime frameworks (zero React, zero Next.js, zero JSX/TSX, zero server runtime).

## Directory Layout

- `content/` — Single source of truth for site metadata, pages (`about.md`, `resume.md`, `speaking.md`, `contact.md`), projects (`content/projects/*.md`), and blog essays (`content/blog/*.md`).
- `src/css/` — Pure native CSS compiled cleanly from the original porcelain-and-charcoal design tokens, preflight, component rules, responsive breakpoints, dark mode, forced colors, and print stylesheet.
- `src/js/` — Vanilla ES6 modules for 3-state theme switching, accessible `<dialog>` slide navigation, section scroll-spy, live GitHub repository dashboard + README inspection, interactive blog diagrams, `LiveAge` counter, and `EmailLink` alias typer.
- `src/assets/` — Self-hosted variable `.woff2` fonts (`Inter Variable` and `Newsreader Variable`), portraits, project screenshots, blog diagrams, favicons, and OpenGraph images.
- `scripts/build-static.mjs` — Dependency-free Node build script outputting static files to `dist/`.
- `.github/workflows/deploy-pages.yml` — Automated GitHub Pages build & deployment workflow.

## Build Commands

```bash
# Root domain build (e.g., https://itsthemaverick.github.io/)
npm run build

# Repository subpath build (e.g., https://itsthemaverick.github.io/Portfolio/)
npm run build:ghpages

# Preview ./dist locally
npm run serve
```

# personal-site
