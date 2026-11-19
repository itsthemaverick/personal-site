# Static Migration Checklist (`itsthemaverick/Portfolio`)

Tracks migration progress and verification against the live Next.js application inside `/static-migration`. Root repository files remain untouched (`0` edits outside `/static-migration`).

## Phase 1 — Reconnaissance & Assets
- [x] Full codebase inventory completed (`INVENTORY.md`)
- [ ] Self-hosted fonts copied (`Inter Variable`, `Newsreader Variable`, zero JetBrains Mono)
- [ ] Images, favicons, OG cards, `manifest.json`, and `robots.txt` staged in `src/assets/`

## Phase 2 — Markdown Content CMS (`content/`)
- [ ] `content/site.md` (profile, routes with `"Blog"` at `/writing/`, social profiles, meta defaults)
- [ ] `content/about.md`
- [ ] `content/resume.md` (work, degrees, skills, courses, print header)
- [ ] `content/speaking.md` (appearances & collaboration CTA)
- [ ] `content/contact.md`
- [ ] `content/projects/*.md` (10 curated entries: 7 `shipped`, 3 `archive`)
- [ ] `content/blog/*.md` (4 full Markdown posts + external patent entry)

## Phase 3 — Native CSS Migration (`src/css/`)
- [ ] Zero Tailwind directives (`@theme`, `@variant`, `@custom-variant`) in final CSS
- [ ] Preflight + `@layer theme, base, components` + dark mode `[data-theme="dark"]` & `prefers-color-scheme: dark`
- [ ] Forced colors (`forced-colors.css`) & Print stylesheet (`print.css`)
- [ ] Newsreader typography enforced site-wide for `--font-mono` and across `/projects/`

## Phase 4 — Vanilla JS Interactivity (`src/js/`)
- [ ] Blocking `#theme-init` head script + `theme.js` (3-state `system` / `light` / `dark`, `theme-color` sync, `storage` & `matchMedia` listeners)
- [ ] `navigation.js` (`SlideMenu` `<dialog>` focus/ResizeObserver + `SectionNav` active scroll spy + horizontal scroll fade)
- [ ] `projects-github.js` (live GitHub API fetch, `sessionStorage` cache, snapshot fallback, search/scope/lang/sort controls, pulse toggle, auto-sync, clone copy, README drawer)
- [ ] `blog.js` (`.prose-fence` keyboard scrollability + all 6 interactive `BlogGraphics` widgets)
- [ ] `resume.js` (`Print / PDF` trigger)
- [ ] `stats.js` (`LiveAge` 11-decimal ticker with reduced-motion & visibility pause)
- [ ] `contact.js` (`EmailLink` alias typewriter with hover/focus pause & permanent stop)

## Phase 5 — Static Generator & GitHub Pages Delivery
- [ ] `scripts/build-static.mjs` builds all HTML routes, `404.html`, `feed.xml`, `resume.json`, `sitemap.xml`
- [ ] GitHub Pages CI workflow `.github/workflows/deploy-pages.yml`
- [ ] Subpath compatibility tested under `/` and `/Portfolio/`

## Phase 6 — Side-by-Side Verification (Playwright vs `http://127.0.0.1:3000`)
- [ ] `/` (Light & Dark, Desktop & Mobile, `0` overflow)
- [ ] `/about/` (SectionNav active state, LogEntry gutters)
- [ ] `/resume/` (Experience spine, Skills tiers, Courses grid, Print preview, `resume.json`)
- [ ] `/projects/` (Newsreader font across all elements, live GitHub controls & README drawer)
- [ ] `/writing/` ("Blog" labeling, RSS `feed.xml`, external patent entry)
- [ ] `/writing/<slug>/` (all 4 posts, all 6 interactive BlogGraphics, code fences, reading progress)
- [ ] `/speaking/` & `/stats/` (`LiveAge` ticker, GitHub stats table) & `/contact/` (`EmailLink` cycling, footer hidden)
- [ ] `404.html` (works at root & nested subpaths)
- [ ] Final parity report (`MIGRATION_REPORT.md`)
