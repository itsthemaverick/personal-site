# Static Migration Inventory (`itsthemaverick/Portfolio`)

Comprehensive reconnaissance of the source Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 codebase prior to migrating to pure HTML5, CSS3, Vanilla JS (ES6+), and Markdown static generation inside `/static-migration`.

## 1. Public Routes Migrated

| Source Route | Output Path (`dist/`) | Primary Component(s) | Interactive Requirements |
| --- | --- | --- | --- |
| `/` (`app/page.tsx`) | `dist/index.html` | `Hero`, `Portrait`, `Writing` feed (top 3 dated items) | Monogram/Name header responsive rule, theme toggle, mobile slide menu |
| `/about/` (`app/about/page.tsx`) | `dist/about/index.html` | `AboutContent`, `SectionNav`, `LogEntry` gutter parser | Sticky section index, active scroll spy, `#` fragment smooth scroll |
| `/resume/` (`app/resume/page.tsx`) | `dist/resume/index.html` | `ResumeNav`, `Experience`, `Education`, `Skills`, `Courses`, `PrintButton` | Sticky section index, `window.print()` Print / PDF trigger, `../resume.json` link |
| `/projects/` (`app/projects/page.tsx`) | `dist/projects/index.html` | `LiveProjects`, `Entry` (organization work) | GitHub API live sync + snapshot fallback, search, scope tabs, language chips, sort, activity pulse toggle, copy clone URL, inline README drawer, **strictly Newsreader typography across entire route** |
| `/writing/` (`app/writing/page.tsx`) | `dist/writing/index.html` | `WritingPage` (label `"Blog"`, RSS link `../feed.xml`) | Grouped sections (`Essays on this site`, `Selected writing elsewhere`) |
| `/writing/[slug]/` (`app/writing/[slug]/page.tsx`) | `dist/writing/<slug>/index.html` | `ReadingProgress`, `PostContent`, `BlogGraphics`, `PostPager` | CSS `view-timeline` reading bar, `.prose-fence` keyboard horizontal scroll, 6 interactive `<blog-graphic>` SVG/control widgets, heading anchors & legacy aliases |
| `/speaking/` (`app/speaking/page.tsx`) | `dist/speaking/index.html` | `SpeakingPage`, `Speaking/Entry` | Reuses `.projects-page` register styling, sorted newest first |
| `/stats/` (`app/stats/page.tsx`) | `dist/stats/index.html` | `PersonalStats`, `SiteStats`, `LiveAge`, `Table` | 11-decimal real-time age ticker (`prefers-reduced-motion` aware, pauses on hidden tab) |
| `/contact/` (`app/contact/page.tsx`) | `dist/contact/index.html` | `EmailLink`, `ContactIcons` (`hideFooter`) | Animated cycling email prefix aliases (`50ms` cadence, pause on hover/focus, ends after `"thanks"`) |
| `app/not-found.tsx` | `dist/404.html` | `NotFound` inside shared header chrome | Dynamic relative asset/route prefix helper for deep broken URLs & GitHub Pages subpath hosting |
| `app/feed.xml/route.ts` | `dist/feed.xml` | RSS 2.0 XML builder | All dated `Blog` entries (site posts + external patent entry) |
| `app/resume.json/route.ts` | `dist/resume.json` | JSON Resume schema | Profile basics, work, coursework-mapped education, grouped skills |
| `app/sitemap.ts` | `dist/sitemap.xml` | XML Sitemap | Canonical URLs (`lastmod`, `changefreq`, `priority`) |
| `app/manifest.json` + `public/robots.txt` | `dist/manifest.json`, `dist/robots.txt` | Web App Manifest + Robots | Respects `basePath` where needed |

## 2. Excluded Modules (Admin & Server-Only Backend)

Excluded per scope definition (never deployed on static GitHub Pages host):
- `/app/admin/*` (`layout.tsx`, `login/page.tsx`, `page.tsx`), `/app/styles/pages/admin.css`
- `/src/components/Admin/*`, `/src/lib/adminApi.ts`, `/src/types/admin.ts`, `/scripts/admin-server.mjs`
- `/app/api/github/projects/route.ts` (client calls public GitHub REST API directly with `sessionStorage` cache + build-time snapshot fallback)

## 3. Stylesheet Inventory (`app/styles/` -> `src/css/`)

- Tailwind entry: `app/tailwind.css` (`@import 'tailwindcss/preflight'` + `@custom-variant dark` -> compiled cleanly into native CSS layers `@layer theme, base, components;` with zero Tailwind directives)
- Tokens: `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`, `tokens/motion.css`
- Base: `base/reset.css`, `base/links.css`, `base/typography.css`
- Components: `components/buttons.css`, `components/cards.css`, `components/icons.css`, `components/section-header.css`, `components/section-nav.css`, `components/tags.css`
- Layout: `layout/header.css`, `layout/navigation.css`, `layout/footer.css`, `layout/page.css`
- Pages: `pages/home.css`, `pages/about.css`, `pages/resume.css`, `pages/projects.css`, `pages/writing.css`, `pages/stats.css`, `pages/contact.css`, `pages/not-found.css`
- Mode / Media: `dark-mode.css`, `forced-colors.css`, `print.css`

## 4. Markdown Content Inventory (`content/`)

- **Core Pages**: `site.md`, `about.md`, `resume.md`, `speaking.md`, `contact.md`
- **Projects (10 curated files)**: `content/projects/*.md` (`neural-network-from-scratch-in-c`, `project-jhep`, `deepreach`, `credit-card-fraud-detection`, `malware-detection`, `text-classification`, `signal-to-strategy`, `zion-event-website`, `8minutes`, `sarthasangati-foundation-website`)
- **Blog Posts (4 essays + 1 external patent)**:
  - `content/blog/why-i-chose-parrot-os-over-omarchy.md` (`2026-10-14`)
  - `content/blog/ai-red-teaming-systematic-adversarial-testing.md` (`2026-10-10`)
  - `content/blog/prompt-injection-breaking-the-trust-boundary.md` (`2026-10-06`)
  - `content/blog/building-a-neural-network-from-scratch-in-c.md` (`2026-10-02`)
  - `content/blog/patent-proof-based-task-validation.md` (`2026-10-01`, external)

## 5. Typography & Assets Inventory

- **Display Font**: Self-hosted `Inter Variable` (`.woff2` from `@fontsource-variable/inter`)
- **Body & Mono Font**: Self-hosted `Newsreader Variable` (normal & italic `.woff2` from `@fontsource-variable/newsreader`). `--font-mono` explicitly resolves to `'Newsreader Variable', Georgia, serif` across the entire site; JetBrains Mono is absent everywhere.
- **Images**: `me.jpg`, `projects/*.jpg`, `writing/**/*`, `icons/icon-{192,512,maskable-512}.png`, `og.png`, `og/writing/*.png`, `favicon.ico`, `icon.png`, `apple-icon.png`.
