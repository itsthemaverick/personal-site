import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Read configured siteUrl dynamically from content/site.md
const siteMd = fs.readFileSync(path.join(ROOT, 'content', 'site.md'), 'utf8');
const siteUrlMatch = siteMd.match(/siteUrl:\s*"([^"]+)"/);
const siteUrl = siteUrlMatch ? siteUrlMatch[1].replace(/\/$/, '') : 'https://maverick.is-cool.dev';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(desc, condition, details = '') {
  totalChecks += 1;
  if (condition) {
    passedChecks += 1;
    console.log(`  [PASS] ${desc}`);
  } else {
    failedChecks += 1;
    console.error(`  [FAIL] ${desc} ${details ? `(${details})` : ''}`);
  }
}

console.log('\n--- 1. Testing Infrastructure & Crawler Files ---');
const robotsPath = path.join(DIST, 'robots.txt');
check('robots.txt exists', fs.existsSync(robotsPath));
if (fs.existsSync(robotsPath)) {
  const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
  check('robots.txt allows GPTBot', robotsTxt.includes('User-agent: GPTBot\nAllow: /'));
  check('robots.txt allows PerplexityBot', robotsTxt.includes('User-agent: PerplexityBot\nAllow: /'));
  check('robots.txt allows ClaudeBot', robotsTxt.includes('User-agent: ClaudeBot\nAllow: /'));
  check('robots.txt contains sitemap', robotsTxt.includes(`Sitemap: ${siteUrl}/sitemap.xml`));
}

const llmsPath = path.join(DIST, 'llms.txt');
check('llms.txt exists', fs.existsSync(llmsPath));
if (fs.existsSync(llmsPath)) {
  const llmsTxt = fs.readFileSync(llmsPath, 'utf8');
  check('llms.txt has H1 site title', llmsTxt.startsWith('# Yashraj Bhogade'));
  check('llms.txt references Core Entities', llmsTxt.includes('## Core Entities & Identity'));
  check('llms.txt references Featured Articles', llmsTxt.includes('## Featured Technical Articles & Research'));
  check('llms.txt references llms-full.txt', llmsTxt.includes('/llms-full.txt'));
}

const llmsFullPath = path.join(DIST, 'llms-full.txt');
check('llms-full.txt exists', fs.existsSync(llmsFullPath));
if (fs.existsSync(llmsFullPath)) {
  const llmsFull = fs.readFileSync(llmsFullPath, 'utf8');
  check('llms-full.txt contains full resume', llmsFull.includes('## 2. Technical Resume & Experience'));
  check('llms-full.txt contains projects', llmsFull.includes('## 3. Curated Open-Source Projects & Software'));
  check('llms-full.txt contains unabridged articles', llmsFull.includes('## 5. Unabridged Technical Articles & Publications'));
  check('llms-full.txt is substantial (>10KB)', llmsFull.length > 10000, `${llmsFull.length} bytes`);
}

const sitemapPath = path.join(DIST, 'sitemap.xml');
check('sitemap.xml exists', fs.existsSync(sitemapPath));
if (fs.existsSync(sitemapPath)) {
  const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
  check('sitemap contains urlset', sitemapXml.includes('<urlset'));
  check('sitemap has lastmod tags', sitemapXml.includes('<lastmod>'));
  check('sitemap has home URL', sitemapXml.includes(`<loc>${siteUrl}/</loc>`));
}

console.log('\n--- 2. Auditing Emitted HTML Pages ---');
const htmlFiles = [
  'index.html',
  'about/index.html',
  'resume/index.html',
  'projects/index.html',
  'writing/index.html',
  'speaking/index.html',
  'stats/index.html',
  'contact/index.html',
  'writing/building-a-neural-network-from-scratch-in-c/index.html',
  'writing/ai-red-teaming-systematic-adversarial-testing/index.html',
  'writing/prompt-injection-breaking-the-trust-boundary/index.html',
  'writing/why-i-chose-parrot-os-over-omarchy/index.html',
];

for (const rel of htmlFiles) {
  const filePath = path.join(DIST, rel);
  check(`File exists: ${rel}`, fs.existsSync(filePath));
  if (!fs.existsSync(filePath)) continue;

  const html = fs.readFileSync(filePath, 'utf8');

  // Title check
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : '';
  const titleLen = title.replace(/&amp;/g, '&').length;
  check(`${rel} has <title>`, Boolean(titleMatch));
  check(`${rel} title within 40-70 char budget (${titleLen} chars)`, titleLen >= 40 && titleLen <= 70, `"${title}"`);

  // Description check
  const descMatch = html.match(/<meta name="description" content="(.*?)">/);
  const desc = descMatch ? descMatch[1] : '';
  const descLen = desc.replace(/&amp;/g, '&').length;
  check(`${rel} has <meta description>`, Boolean(descMatch));
  check(`${rel} description within 125-165 char budget (${descLen} chars)`, descLen >= 125 && descLen <= 165, `"${desc}"`);

  // Canonical tag check
  check(`${rel} has canonical link`, html.includes(`<link rel="canonical" href="${siteUrl}/`));

  // LLM link check
  check(`${rel} has /llms.txt link`, html.includes(`<link rel="alternate" type="text/markdown" title="LLM Context" href="${siteUrl}/llms.txt">`));

  // Googlebot directive check
  check(`${rel} has googlebot max directives`, html.includes('name="googlebot" content="max-video-preview:-1, max-image-preview:large, max-snippet:-1"'));

  // OpenGraph & Twitter tags
  check(`${rel} has og:title`, html.includes('<meta property="og:title"'));
  check(`${rel} has og:image`, html.includes('<meta property="og:image"'));
  check(`${rel} has og:image:alt`, html.includes('<meta property="og:image:alt"'));
  check(`${rel} has og:image:type`, html.includes('<meta property="og:image:type" content="image/png">'));
  check(`${rel} has twitter:site`, html.includes('<meta name="twitter:site" content="@itsthemaverick">'));
  check(`${rel} has twitter:creator`, html.includes('<meta name="twitter:creator" content="@itsthemaverick">'));

  // JSON-LD Schema
  const schemaMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  check(`${rel} has Schema.org JSON-LD`, Boolean(schemaMatch));
  if (schemaMatch) {
    try {
      const parsed = JSON.parse(schemaMatch[1]);
      check(`${rel} JSON-LD parses valid JSON`, true);
      check(`${rel} JSON-LD has @graph`, Array.isArray(parsed['@graph']));
    } catch (e) {
      check(`${rel} JSON-LD is valid JSON`, false, e.message);
    }
  }
}

console.log(`\n==================================================`);
console.log(`SEO & GEO Audit Suite: ${passedChecks}/${totalChecks} Checks Passed (${failedChecks} Failed)`);
console.log(`==================================================\n`);

if (failedChecks > 0) {
  process.exit(1);
}
