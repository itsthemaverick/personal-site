#!/usr/bin/env node
/**
 * Zero-Dependency Static Site Generator for Yashraj Bhogade Portfolio
 *
 * Reads Markdown CMS files from ../content/, native CSS from ../src/css/,
 * pure ES6 modules from ../src/js/, and self-hosted assets from ../src/assets/,
 * emitting a standalone static bundle inside ../dist/ ready for GitHub Pages.
 *
 * Usage:
 *   node scripts/build-static.mjs
 *   node scripts/build-static.mjs --base-path=/Portfolio
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const SRC_DIR = path.join(ROOT, 'src');
const CSS_DIR = path.join(SRC_DIR, 'css');
const JS_DIR = path.join(SRC_DIR, 'js');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');
const DIST_DIR = path.join(ROOT, 'dist');

/* ==========================================================================
   CLI Options & URL Helpers
   ========================================================================== */

function parseArgs(argv) {
  let basePath = process.env.BASE_PATH || '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--base-path=')) {
      basePath = arg.slice('--base-path='.length);
    } else if (arg === '--base-path' && i + 1 < argv.length) {
      basePath = argv[i + 1];
      i += 1;
    }
  }
  const cleaned = basePath.trim().replace(/^\/+|\/+$/g, '');
  return {
    basePath: cleaned ? `/${cleaned}` : '',
  };
}

const { basePath } = parseArgs(process.argv.slice(2));

/**
 * Resolves an internal site path relative to the current document's directory depth,
 * OR anchored to `${basePath}` when `depth === null` (used on 404.html so nested missing URLs still load).
 */
function hrefFor(depth, sitePath) {
  if (!sitePath) return sitePath;
  if (/^(?:https?:|mailto:|#)/i.test(sitePath)) return sitePath;

  const normalized = sitePath.startsWith('/') ? sitePath : `/${sitePath}`;
  if (depth === null) {
    return `${basePath}${normalized}`;
  }
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  const rel = normalized.replace(/^\/+/, '');
  return rel ? `${prefix}${rel}` : prefix;
}

/* ==========================================================================
   Escape & Typography Helpers (parity with src/lib/typography.ts & anchors.ts)
   ========================================================================== */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const LEFT_SINGLE = '\u2018';
const RIGHT_SINGLE = '\u2019';
const LEFT_DOUBLE = '\u201C';
const RIGHT_DOUBLE = '\u201D';
const OPENS_AFTER = /[\s([{\u2014\u2013\-/]/;
const DIGIT = /\d/;
const WORD = /[A-Za-z0-9\u00C0-\u024F]/;
const TAIL_AT_START = /^'(?:s|t|re|ve|ll|d|m|em|n)(?![A-Za-z0-9\u00C0-\u024F])/;
const ELIDED_DIGITS = /^'\d\d(?:s)?(?![A-Za-z0-9\u00C0-\u024F])/;

function singleQuoteFor(text, index) {
  const prev = index > 0 ? text[index - 1] : '';
  const next = index < text.length - 1 ? text[index + 1] : '';
  if (prev !== '' && WORD.test(prev)) return RIGHT_SINGLE;
  const rest = text.slice(index);
  if (ELIDED_DIGITS.test(rest)) return RIGHT_SINGLE;
  if (prev === '') {
    if (TAIL_AT_START.test(rest)) return RIGHT_SINGLE;
    return WORD.test(next) ? LEFT_SINGLE : RIGHT_SINGLE;
  }
  const opensHere = OPENS_AFTER.test(prev) || prev === '"' || prev === LEFT_DOUBLE;
  return opensHere && WORD.test(next) ? LEFT_SINGLE : RIGHT_SINGLE;
}

function smartQuotes(text) {
  if (!text) return '';
  const str = String(text);
  if (!str.includes("'") && !str.includes('"')) return str;
  let result = '';
  let doubleOpen = false;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === "'") {
      result += singleQuoteFor(str, i);
      continue;
    }
    if (ch !== '"') {
      result += ch;
      continue;
    }
    const prev = i > 0 ? str[i - 1] : '';
    const next = i < str.length - 1 ? str[i + 1] : '';
    if (doubleOpen) {
      const ahead = str.slice(i + 1).split('"').length - 1;
      if (DIGIT.test(prev) && ahead % 2 === 1) {
        result += ch;
        continue;
      }
      result += RIGHT_DOUBLE;
      doubleOpen = false;
      continue;
    }
    if (prev !== '' && DIGIT.test(prev)) {
      result += ch;
      continue;
    }
    const opens =
      prev === ''
        ? next !== '' && !/[\s.,;:!?)\]}]/.test(next)
        : OPENS_AFTER.test(prev) || prev === LEFT_SINGLE || prev === "'";
    if (opens) {
      result += LEFT_DOUBLE;
      doubleOpen = true;
    } else {
      result += RIGHT_DOUBLE;
    }
  }
  return result;
}

function createHeadingId(title) {
  const slug = String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

function createUniqueHeadingIds(titles, reservedIds = []) {
  const claimed = new Set(reservedIds);
  const nextSuffix = new Map();
  return titles.map((title) => {
    const baseId = createHeadingId(title);
    if (!claimed.has(baseId)) {
      claimed.add(baseId);
      nextSuffix.set(baseId, 2);
      return baseId;
    }
    let suffix = nextSuffix.get(baseId) ?? 2;
    let candidate = `${baseId}-${suffix}`;
    while (claimed.has(candidate)) {
      suffix += 1;
      candidate = `${baseId}-${suffix}`;
    }
    claimed.add(candidate);
    nextSuffix.set(baseId, suffix + 1);
    return candidate;
  });
}

/* ==========================================================================
   YAML Frontmatter Parser (supports scalars, quoted keys, lists, nested object lists)
   ========================================================================== */

function unquoteScalar(raw) {
  const val = raw.trim();
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(val) && !(val.length > 1 && val.startsWith('0') && !val.startsWith('0.'))) {
    return Number(val);
  }
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    return val
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');
  }
  if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
    return val.slice(1, -1).replace(/''/g, "'");
  }
  return val;
}

function parseInlineArray(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  const items = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      if (ch === quote && inner[i - 1] !== '\\') {
        quote = null;
      }
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      items.push(unquoteScalar(cur));
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') items.push(unquoteScalar(cur));
  return items;
}

function parseKeyValLine(trimmed) {
  // Support quoted key like `"Some history": "about-section--log"`
  let key = '';
  let rest = '';
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const q = trimmed[0];
    let endIdx = -1;
    for (let i = 1; i < trimmed.length; i += 1) {
      if (trimmed[i] === q && trimmed[i - 1] !== '\\') {
        endIdx = i;
        break;
      }
    }
    if (endIdx !== -1 && trimmed[endIdx + 1] === ':') {
      key = unquoteScalar(trimmed.slice(0, endIdx + 1));
      rest = trimmed.slice(endIdx + 2).trim();
      return { key, rest };
    }
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return null;
  key = trimmed.slice(0, colonIdx).trim();
  rest = trimmed.slice(colonIdx + 1).trim();
  return { key, rest };
}

function stripInlineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i - 1] !== '\\') quote = null;
    } else {
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function parseYamlBlock(lines, startIdx = 0, baseIndent = 0) {
  let idx = startIdx;
  while (idx < lines.length && stripInlineComment(lines[idx]).trim() === '') idx += 1;
  if (idx >= lines.length) return { value: {}, nextIdx: idx };

  const firstTrimmed = stripInlineComment(lines[idx]).trim();
  const isSeq = firstTrimmed.startsWith('- ') || firstTrimmed === '-';

  if (isSeq) {
    const arr = [];
    while (idx < lines.length) {
      const cleaned = stripInlineComment(lines[idx]);
      if (cleaned.trim() === '') {
        idx += 1;
        continue;
      }
      const indent = cleaned.search(/\S/);
      if (indent < baseIndent) break;
      const trimmed = cleaned.trim();
      if (!trimmed.startsWith('-')) break;

      const afterDash = trimmed.slice(1).trim();
      if (afterDash === '') {
        // Nested block inside sequence
        idx += 1;
        let childIndent = baseIndent + 2;
        for (let j = idx; j < lines.length; j += 1) {
          const c = stripInlineComment(lines[j]);
          if (c.trim() !== '') {
            childIndent = c.search(/\S/);
            break;
          }
        }
        const nested = parseYamlBlock(lines, idx, childIndent);
        arr.push(nested.value);
        idx = nested.nextIdx;
        continue;
      }

      const kv = parseKeyValLine(afterDash);
      if (kv) {
        // Sequence of objects starting inline: `- name: "Foo"`
        const itemIndent = indent + 2;
        const obj = {};
        if (kv.rest === '') {
          idx += 1;
          let childIndent = itemIndent + 2;
          for (let j = idx; j < lines.length; j += 1) {
            const c = stripInlineComment(lines[j]);
            if (c.trim() !== '') {
              childIndent = c.search(/\S/);
              break;
            }
          }
          if (childIndent > itemIndent) {
            const nested = parseYamlBlock(lines, idx, childIndent);
            obj[kv.key] = nested.value;
            idx = nested.nextIdx;
          } else {
            obj[kv.key] = null;
          }
        } else if (kv.rest.startsWith('[') && kv.rest.endsWith(']')) {
          obj[kv.key] = parseInlineArray(kv.rest);
          idx += 1;
        } else {
          obj[kv.key] = unquoteScalar(kv.rest);
          idx += 1;
        }

        // Continue reading remaining properties of this object at >= itemIndent
        while (idx < lines.length) {
          const nextClean = stripInlineComment(lines[idx]);
          if (nextClean.trim() === '') {
            idx += 1;
            continue;
          }
          const nextIndent = nextClean.search(/\S/);
          const nextTrim = nextClean.trim();
          if (nextIndent < itemIndent) break;
          if (nextIndent === indent && nextTrim.startsWith('-')) break;
          const nextKv = parseKeyValLine(nextTrim);
          if (!nextKv) {
            idx += 1;
            continue;
          }
          if (nextKv.rest === '') {
            idx += 1;
            let childIndent = nextIndent + 2;
            for (let j = idx; j < lines.length; j += 1) {
              const c = stripInlineComment(lines[j]);
              if (c.trim() !== '') {
                childIndent = c.search(/\S/);
                break;
              }
            }
            if (childIndent > nextIndent) {
              const nested = parseYamlBlock(lines, idx, childIndent);
              obj[nextKv.key] = nested.value;
              idx = nested.nextIdx;
            } else {
              obj[nextKv.key] = [];
            }
          } else if (nextKv.rest.startsWith('[') && nextKv.rest.endsWith(']')) {
            obj[nextKv.key] = parseInlineArray(nextKv.rest);
            idx += 1;
          } else {
            obj[nextKv.key] = unquoteScalar(nextKv.rest);
            idx += 1;
          }
        }
        arr.push(obj);
      } else if (afterDash.startsWith('[') && afterDash.endsWith(']')) {
        arr.push(parseInlineArray(afterDash));
        idx += 1;
      } else {
        arr.push(unquoteScalar(afterDash));
        idx += 1;
      }
    }
    return { value: arr, nextIdx: idx };
  }

  // Mapping
  const obj = {};
  while (idx < lines.length) {
    const cleaned = stripInlineComment(lines[idx]);
    if (cleaned.trim() === '') {
      idx += 1;
      continue;
    }
    const indent = cleaned.search(/\S/);
    if (indent < baseIndent) break;
    const trimmed = cleaned.trim();
    if (trimmed.startsWith('-')) break;
    const kv = parseKeyValLine(trimmed);
    if (!kv) {
      idx += 1;
      continue;
    }
    if (kv.rest === '') {
      idx += 1;
      let childIndent = indent + 2;
      for (let j = idx; j < lines.length; j += 1) {
        const c = stripInlineComment(lines[j]);
        if (c.trim() !== '') {
          childIndent = c.search(/\S/);
          break;
        }
      }
      if (childIndent > indent) {
        const nested = parseYamlBlock(lines, idx, childIndent);
        obj[kv.key] = nested.value;
        idx = nested.nextIdx;
      } else {
        obj[kv.key] = {};
      }
    } else if (kv.rest.startsWith('[') && kv.rest.endsWith(']')) {
      obj[kv.key] = parseInlineArray(kv.rest);
      idx += 1;
    } else {
      obj[kv.key] = unquoteScalar(kv.rest);
      idx += 1;
    }
  }
  return { value: obj, nextIdx: idx };
}

function parseFrontmatter(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized };
  }
  const endMatch = normalized.indexOf('\n---', 4);
  if (endMatch === -1) {
    throw new Error('Unclosed YAML frontmatter block');
  }
  const yamlText = normalized.slice(4, endMatch);
  let bodyStart = endMatch + 4;
  if (normalized[bodyStart] === '\n') bodyStart += 1;
  const body = normalized.slice(bodyStart);
  const { value } = parseYamlBlock(yamlText.split('\n'), 0, 0);
  return { data: value, body };
}

function readMarkdownFile(filePath) {
  return parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
}

/* ==========================================================================
   Image Size Reader (PNG & WebP headers from src/assets/...)
   ========================================================================== */

function readLocalImageSize(publicPath) {
  const rel = publicPath.replace(/^\/+/, '');
  const diskPath = path.join(ASSETS_DIR, rel);
  if (!fs.existsSync(diskPath)) return null;
  const buf = fs.readFileSync(diskPath);

  // PNG
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length >= 24 && buf.subarray(0, 8).equals(pngSig) && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // WebP
  if (buf.length >= 20 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunkLen = buf.readUInt32LE(16);
    if (20 + chunkLen <= buf.length) {
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8X' && chunkLen >= 10) {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      }
      if (fmt === 'VP8 ' && chunkLen >= 10 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fmt === 'VP8L' && chunkLen >= 5 && buf[20] === 0x2f) {
        const bits = buf.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
      }
    }
  }
  // JPEG SOF0/SOF2
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/* ==========================================================================
   CSS Color Token Reader (parity with src/lib/tokens.ts)
   ========================================================================== */

function readThemeColorToken() {
  const lightCss = fs.readFileSync(path.join(CSS_DIR, 'tokens.css'), 'utf8');
  const darkCss = fs.readFileSync(path.join(CSS_DIR, 'modes.css'), 'utf8');
  const lightMatch = lightCss.match(/--color-bg-alt:\s*(#[0-9a-fA-F]{3,8})\s*;/);
  const darkMatch = darkCss.match(/--color-bg-alt:\s*(#[0-9a-fA-F]{3,8})\s*;/);
  return {
    light: lightMatch ? lightMatch[1] : '#f6f3ed',
    dark: darkMatch ? darkMatch[1] : '#222329',
  };
}

/* ==========================================================================
   Career, Formatting & Telemetry Helpers (exact parity)
   ========================================================================== */

const ONGOING_END = '9999-12-31';

function timelineKey(pos) {
  if (pos.endDate) return pos.endDate;
  return pos.commitment === 'part-time' ? pos.startDate : ONGOING_END;
}

function sortPositions(positions) {
  return [...positions].sort(
    (a, b) => timelineKey(b).localeCompare(timelineKey(a)) || b.startDate.localeCompare(a.startDate),
  );
}

function currentPosition(positions) {
  const ordered = sortPositions(positions);
  return ordered.find((p) => !p.endDate && p.commitment !== 'part-time') ?? ordered[0];
}

function calendarDay(input) {
  if (typeof input === 'string') {
    const [y, m, d] = input.split('-').map(Number);
    return [y, m - 1, d];
  }
  const dt = new Date(input);
  return [dt.getFullYear(), dt.getMonth(), dt.getDate()];
}

function monthsBetween(start, end) {
  const [fy, fm, fd] = calendarDay(start);
  const [ty, tm, td] = calendarDay(end);
  const months = (ty - fy) * 12 + (tm - fm);
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return Math.max(0, td < Math.min(fd, lastDay) ? months - 1 : months);
}

function formatDuration(months, long = false) {
  const total = Math.max(0, Math.trunc(months));
  if (total < 1) return long ? 'less than 1 month' : '<1 mo';
  const unit = (val, shortWord, longWord) =>
    long ? `${val} ${longWord}${val === 1 ? '' : 's'}` : `${val} ${shortWord}`;
  const years = Math.floor(total / 12);
  const rem = total % 12;
  const parts = [];
  if (years > 0) parts.push(unit(years, 'yr', 'year'));
  if (rem > 0) parts.push(unit(rem, 'mo', 'month'));
  return parts.join(' ');
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(dateString) {
  const m = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateString);
  const year = m[1];
  const monthIdx = Number.parseInt(m[2], 10) - 1;
  const day = Number.parseInt(m[3], 10);
  return `${MONTHS_SHORT[monthIdx] || m[2]} ${day}, ${year}`;
}

function formatMonthYear(dateString) {
  const m = String(dateString).match(/^(\d{4})-(\d{2})/);
  if (!m) return String(dateString);
  const year = m[1];
  const monthIdx = Number.parseInt(m[2], 10) - 1;
  return `${MONTHS_FULL[monthIdx] || m[2]} ${year}`;
}

function renderDateSpan({ date, endDate, ongoing = false }) {
  const start = `<time datetime="${escapeHtml(date)}">${escapeHtml(formatMonthYear(date))}</time>`;
  if (endDate) {
    return `${start}<span class="daterange-sep" aria-hidden="true">–</span><span class="sr-only"> to </span><time datetime="${escapeHtml(endDate)}">${escapeHtml(formatMonthYear(endDate))}</time>`;
  }
  if (ongoing) {
    return `${start}<span class="daterange-sep" aria-hidden="true">–</span><span class="sr-only"> to </span><span class="daterange-present">Present</span>`;
  }
  return start;
}

/* ==========================================================================
   About Log Marker Extractor (exact parity with src/lib/logEntry.ts)
   ========================================================================== */

const YEAR_PATTERN = /(?:1[89]|20)\d{2}/;
const LEADING_PATTERNS = [
  { pattern: /^(?:At\s+)?(\d{1,2})\s*[-–—]\s*(\d{1,2}),\s+/i, read: (m) => ({ age: `Age ${m[1]}–${m[2]}` }) },
  { pattern: /^At\s+(\d{1,2}),\s+/i, read: (m) => ({ age: `Age ${m[1]}` }) },
  { pattern: /^When\s+I\s+was\s+(\d{1,2}),\s+/i, read: (m) => ({ age: `Age ${m[1]}` }) },
  { pattern: /^I\s+was\s+(\d{1,2})\s+when\s+/i, read: (m) => ({ age: `Age ${m[1]}` }) },
  { pattern: new RegExp(`^In\\s+(${YEAR_PATTERN.source}),\\s+`, 'i'), read: (m) => ({ year: m[1] }) },
];
const INLINE_YEAR = new RegExp(`\\b(?:in|of|since|during|by)\\s+(${YEAR_PATTERN.source})\\b`, 'i');
const INLINE_AGE = /\b(?:when\s+I\s+was|I\s+was|at\s+the\s+age\s+of)\s+(\d{1,2})\b(?!\s*[-–—]?\s*\d|\s+(?:months?|weeks?|days?|hours?|minutes?|seconds?|miles?|kilometers?|blocks?|of\b|percent\b))/i;

function extractLogMarker(text) {
  for (const { pattern, read } of LEADING_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const rest = text.slice(m[0].length);
      if (rest.trim() === '') return null;
      return { ...read(m), rest: rest.charAt(0).toUpperCase() + rest.slice(1) };
    }
  }
  const end = text.search(/[.!?]\s/);
  const opening = end === -1 ? text : text.slice(0, end + 1);
  const year = opening.match(INLINE_YEAR);
  const age = opening.match(INLINE_AGE);
  if (!year && !age) return null;
  return {
    ...(age ? { age: `Age ${age[1]}` } : {}),
    ...(year ? { year: year[1] } : {}),
    rest: text,
  };
}

/* ==========================================================================
   Markdown Renderer (GFM Tables, Code Fences, Footnotes, Figures, BlogGraphics)
   ========================================================================== */

function parseAttrValue(tag, attrName) {
  const m = tag.match(new RegExp(`${attrName}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : '';
}

function renderInlineMarkdown(raw, { depth = 0, footnoteMap = null } = {}) {
  // 1. Protect code spans first so smartQuotes never touch inline code
  const tokens = [];
  const protect = (html) => {
    const key = `\u0000TOK${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let text = String(raw);

  // Protect raw inline <a>, <kbd>, <br>, etc. if any appear
  text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code>${escapeHtml(code)}</code>`));

  // Images inline
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g, (_, alt, src, t1, t2) => {
    const title = t1 ?? t2 ?? '';
    const resolvedSrc = src.startsWith('/images/') ? hrefFor(depth, src) : src;
    return protect(
      `<img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(smartQuotes(alt))}"${title ? ` title="${escapeHtml(smartQuotes(title))}"` : ''} loading="lazy" referrerpolicy="no-referrer">`,
    );
  });

  // Footnote refs: [^id]
  text = text.replace(/\[\^([A-Za-z0-9_-]+)\]/g, (_, fid) => {
    if (footnoteMap && footnoteMap.has(fid)) {
      const idx = footnoteMap.get(fid).index;
      return protect(
        `<sup><a href="#fn-${escapeHtml(fid)}" id="fnref-${escapeHtml(fid)}">${idx}</a></sup>`,
      );
    }
    return `[^${fid}]`;
  });

  // Links: [label](url "title")
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g, (_, label, url, t1, t2) => {
    const title = t1 ?? t2 ?? '';
    const resolvedUrl = url.startsWith('/') ? hrefFor(depth, url) : url;
    // Strip link label inner markdown formatting without re-linking
    const innerLabel = renderInlineSimple(label);
    return protect(
      `<a href="${escapeHtml(resolvedUrl)}"${title ? ` title="${escapeHtml(smartQuotes(title))}"` : ''}>${innerLabel}</a>`,
    );
  });

  // Escaped characters
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|])/g, (_, ch) => protect(escapeHtml(ch)));

  // Convert remaining prose text & strong/em
  text = renderInlineSimple(text);

  // Restore protected tokens
  return text.replace(/\u0000TOK(\d+)\u0000/g, (_, idx) => tokens[Number(idx)]);
}

function renderInlineSimple(segment) {
  let out = escapeHtml(smartQuotes(segment));
  // Bold + italic
  out = out.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  // Italic (avoid matching inside TOK markers or words with underscores in URLs)
  out = out.replace(/(^|[^\w\\])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^\w\\])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  // Strikethrough
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return out;
}

function renderMarkdown(markdown, options = {}) {
  const {
    depth = 0,
    isLogSection = false,
    omitTopHeadingIds = false,
  } = options;

  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');

  // Collect footnote definitions first: `[^id]: text` (supporting indented continuation)
  const footnotes = new Map();
  const bodyLines = [];
  let fnCounter = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const fnMatch = lines[i].match(/^\[\^([A-Za-z0-9_-]+)\]:\s*(.*)$/);
    if (fnMatch) {
      const id = fnMatch[1];
      const parts = [fnMatch[2]];
      while (i + 1 < lines.length && /^(?: {2,}|\t)/.test(lines[i + 1])) {
        i += 1;
        parts.push(lines[i].trim());
      }
      fnCounter += 1;
      footnotes.set(id, { id, index: fnCounter, text: parts.join(' ').trim() });
    } else {
      bodyLines.push(lines[i]);
    }
  }

  // Pre-collect heading titles (skipping inside fenced code blocks) to generate deterministic unique IDs
  const headings = [];
  let inFenceScan = false;
  for (const line of bodyLines) {
    if (/^```/.test(line.trim())) {
      inFenceScan = !inFenceScan;
      continue;
    }
    if (!inFenceScan) {
      const hm = line.match(/^(#{1,6})\s+(.+)$/);
      if (hm) headings.push(hm[2].trim());
    }
  }
  const headingIds = createUniqueHeadingIds(
    headings,
    [...footnotes.keys()].map((id) => `fn-${id}`),
  );
  let headingCursor = 0;

  const htmlParts = [];
  let i = 0;

  function renderStandaloneFigure(alt, src, title) {
    const resolvedSrc = src.startsWith('/images/') ? hrefFor(depth, src) : src;
    const isLocal = src.startsWith('/');
    const measured = isLocal ? readLocalImageSize(src) : null;
    const width = measured ? measured.width : 1200;
    const height = measured ? measured.height : 675;
    const widthAttr = measured ? ` width="${width}" height="${height}"` : '';
    const captionHtml = title
      ? `<figcaption class="prose-figcaption">${escapeHtml(smartQuotes(title))}</figcaption>`
      : '';
    return `<figure class="prose-figure" style="--figure-width: ${width}px"><img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(smartQuotes(alt))}"${widthAttr} loading="lazy" referrerpolicy="no-referrer">${captionHtml}</figure>`;
  }

  function parseList(startIdx, minIndent = 0) {
    const items = [];
    const firstTrim = bodyLines[startIdx].trim();
    const ordered = /^\d+\.\s+/.test(firstTrim);
    const listTag = ordered ? 'ol' : 'ul';
    let idx = startIdx;

    while (idx < bodyLines.length) {
      const line = bodyLines[idx];
      if (line.trim() === '') {
        // Peek ahead to see if another list item of same type follows
        let peek = idx + 1;
        while (peek < bodyLines.length && bodyLines[peek].trim() === '') peek += 1;
        if (peek < bodyLines.length) {
          const nextIndent = bodyLines[peek].search(/\S/);
          const nextTrim = bodyLines[peek].trim();
          const isSameType = ordered ? /^\d+\.\s+/.test(nextTrim) : /^[-*+]\s+/.test(nextTrim);
          if (nextIndent === minIndent && isSameType) {
            idx = peek;
            continue;
          }
        }
        break;
      }
      const indent = line.search(/\S/);
      if (indent < minIndent) break;
      const trim = line.trim();
      const itemMatch = ordered ? trim.match(/^\d+\.\s+(.*)$/) : trim.match(/^[-*+]\s+(.*)$/);
      if (!itemMatch || indent > minIndent) break;

      const textParts = [itemMatch[1]];
      idx += 1;
      const nestedBlocks = [];

      while (idx < bodyLines.length) {
        const sub = bodyLines[idx];
        if (sub.trim() === '') break;
        const subIndent = sub.search(/\S/);
        const subTrim = sub.trim();
        if (subIndent <= minIndent && (/^[-*+]\s+/.test(subTrim) || /^\d+\.\s+/.test(subTrim))) {
          break;
        }
        if (subIndent > minIndent && (/^[-*+]\s+/.test(subTrim) || /^\d+\.\s+/.test(subTrim))) {
          const nested = parseList(idx, subIndent);
          nestedBlocks.push(nested.html);
          idx = nested.nextIdx;
        } else if (subIndent > minIndent) {
          textParts.push(subTrim);
          idx += 1;
        } else {
          break;
        }
      }

      const rawItem = textParts.join(' ');
      if (isLogSection && !ordered && minIndent === 0) {
        // Replicate About/Sections.tsx LogEntry: extract marker if starts with plain text
        const extracted = extractLogMarker(rawItem);
        if (extracted) {
          const yearHtml = extracted.year
            ? `<span class="log-entry-year">${escapeHtml(extracted.year)}</span>`
            : '';
          const ageHtml = extracted.age
            ? `<span class="log-entry-age">${escapeHtml(extracted.age)}</span>`
            : '';
          const markerRepeats = extracted.rest === rawItem;
          const bodyHtml = renderInlineMarkdown(extracted.rest, { depth, footnoteMap: footnotes });
          items.push(
            `<li class="log-entry"><span class="log-entry-marker"${markerRepeats ? ' aria-hidden="true"' : ''}>${yearHtml}${ageHtml}</span><span class="log-entry-body">${bodyHtml}${nestedBlocks.join('')}</span></li>`,
          );
        } else {
          const bodyHtml = renderInlineMarkdown(rawItem, { depth, footnoteMap: footnotes });
          items.push(
            `<li class="log-entry"><span class="log-entry-marker"></span><span class="log-entry-body">${bodyHtml}${nestedBlocks.join('')}</span></li>`,
          );
        }
      } else {
        const bodyHtml = renderInlineMarkdown(rawItem, { depth, footnoteMap: footnotes });
        items.push(`<li>${bodyHtml}${nestedBlocks.join('')}</li>`);
      }
    }

    return {
      html: `<${listTag}>${items.join('')}</${listTag}>`,
      nextIdx: idx,
    };
  }

  while (i < bodyLines.length) {
    const rawLine = bodyLines[i];
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      i += 1;
      continue;
    }

    // 1. Fenced code block ```lang
    const fenceOpen = trimmed.match(/^```([A-Za-z0-9_+-]*)\s*$/);
    if (fenceOpen) {
      const lang = fenceOpen[1] || '';
      const codeLines = [];
      i += 1;
      while (i < bodyLines.length && !/^```\s*$/.test(bodyLines[i].trim())) {
        codeLines.push(bodyLines[i]);
        i += 1;
      }
      if (i < bodyLines.length) i += 1; // skip closing ```
      const langHtml = lang
        ? `<span class="prose-fence-lang" aria-hidden="true">${escapeHtml(lang)}</span><span class="sr-only">${escapeHtml(lang)} code block</span>`
        : '';
      const codeClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      htmlParts.push(
        `<div class="prose-fence">${langHtml}<pre><code${codeClass}>${escapeHtml(codeLines.join('\n'))}</code></pre></div>`,
      );
      continue;
    }

    // 2. Custom <blog-graphic kind="..." caption="..."></blog-graphic>
    if (trimmed.startsWith('<blog-graphic')) {
      let block = trimmed;
      while (!block.includes('</blog-graphic>') && !block.endsWith('/>') && i + 1 < bodyLines.length) {
        i += 1;
        block += ` ${bodyLines[i].trim()}`;
      }
      i += 1;
      const kind = parseAttrValue(block, 'kind');
      const caption = parseAttrValue(block, 'caption');
      htmlParts.push(
        `<figure class="prose-graphic" data-blog-graphic="${escapeHtml(kind)}" data-caption="${escapeHtml(smartQuotes(caption))}"><div class="prose-graphic-mount"><p class="sr-only">${escapeHtml(smartQuotes(caption))}</p></div>${caption ? `<figcaption class="prose-figcaption">${escapeHtml(smartQuotes(caption))}</figcaption>` : ''}</figure>`,
      );
      continue;
    }

    // 3. Heading
    const headMatch = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (headMatch) {
      const level = headMatch[1].length;
      const id = headingIds[headingCursor] || createHeadingId(headMatch[2]);
      headingCursor += 1;
      const inner = renderInlineMarkdown(headMatch[2].trim(), { depth, footnoteMap: footnotes });
      if (omitTopHeadingIds) {
        htmlParts.push(`<h${level}>${inner}</h${level}>`);
      } else {
        htmlParts.push(`<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`);
      }
      i += 1;
      continue;
    }

    // 4. Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      htmlParts.push('<hr>');
      i += 1;
      continue;
    }

    // 5. Standalone Figure Image: ![alt](src "caption")
    const standaloneImg = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)$/);
    if (standaloneImg) {
      const alt = standaloneImg[1];
      const src = standaloneImg[2];
      const title = standaloneImg[3] ?? standaloneImg[4] ?? '';
      htmlParts.push(renderStandaloneFigure(alt, src, title));
      i += 1;
      continue;
    }

    // 6. GFM Table
    if (
      trimmed.startsWith('|') &&
      i + 1 < bodyLines.length &&
      /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?$/.test(bodyLines[i + 1].trim())
    ) {
      const parseCells = (rowStr) =>
        rowStr
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split(/(?<!\\)\|/)
          .map((c) => c.trim().replace(/\\\|/g, '|'));

      const headers = parseCells(bodyLines[i]);
      const alignCells = parseCells(bodyLines[i + 1]).map((c) => {
        if (c.startsWith(':') && c.endsWith(':')) return 'center';
        if (c.endsWith(':')) return 'right';
        if (c.startsWith(':')) return 'left';
        return null;
      });
      i += 2;
      const bodyRows = [];
      while (i < bodyLines.length && bodyLines[i].trim().startsWith('|')) {
        bodyRows.push(parseCells(bodyLines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${headers
        .map((h, idx) => {
          const al = alignCells[idx];
          return `<th${al ? ` style="text-align:${al}"` : ''}>${renderInlineMarkdown(h, { depth, footnoteMap: footnotes })}</th>`;
        })
        .join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map(
          (row) =>
            `<tr>${headers
              .map((_, idx) => {
                const al = alignCells[idx];
                return `<td${al ? ` style="text-align:${al}"` : ''}>${renderInlineMarkdown(row[idx] || '', { depth, footnoteMap: footnotes })}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('')}</tbody>`;
      htmlParts.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // 7. Blockquote
    if (trimmed.startsWith('>')) {
      const bqLines = [];
      while (i < bodyLines.length && bodyLines[i].trim().startsWith('>')) {
        bqLines.push(bodyLines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const inner = renderMarkdown(bqLines.join('\n'), { depth });
      htmlParts.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    // 8. List
    if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const listRes = parseList(i, rawLine.search(/\S/));
      htmlParts.push(listRes.html);
      i = listRes.nextIdx;
      continue;
    }

    // 9. Paragraph
    const paraLines = [];
    while (i < bodyLines.length) {
      const cur = bodyLines[i];
      const ct = cur.trim();
      if (
        ct === '' ||
        /^```/.test(ct) ||
        /^#{1,6}\s+/.test(ct) ||
        /^>/.test(ct) ||
        /^[-*+]\s+/.test(ct) ||
        /^\d+\.\s+/.test(ct) ||
        ct.startsWith('<blog-graphic') ||
        /^(?:---|\*\*\*|___)\s*$/.test(ct) ||
        (ct.startsWith('|') && i + 1 < bodyLines.length && /^\|?\s*:?-{2,}:?/.test(bodyLines[i + 1].trim()))
      ) {
        break;
      }
      paraLines.push(ct);
      i += 1;
    }
    const paraText = paraLines.join(' ').trim();
    if (paraText) {
      const imgCheck = paraText.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)$/);
      if (imgCheck) {
        htmlParts.push(renderStandaloneFigure(imgCheck[1], imgCheck[2], imgCheck[3] ?? imgCheck[4] ?? ''));
      } else {
        htmlParts.push(`<p>${renderInlineMarkdown(paraText, { depth, footnoteMap: footnotes })}</p>`);
      }
    }
  }

  if (footnotes.size > 0) {
    const fnItems = [...footnotes.values()]
      .map(
        (fn) =>
          `<li id="fn-${escapeHtml(fn.id)}">${renderInlineMarkdown(fn.text, { depth, footnoteMap: footnotes })} <a href="#fnref-${escapeHtml(fn.id)}" aria-label="Back to content">↩</a></li>`,
      )
      .join('');
    htmlParts.push(`<section class="footnotes" aria-label="Footnotes"><hr><ol>${fnItems}</ol></section>`);
  }

  return htmlParts.join('\n');
}

/* ==========================================================================
   Content Loaders from static-migration/content/
   ========================================================================== */

function loadSiteContent() {
  return readMarkdownFile(path.join(CONTENT_DIR, 'site.md')).data;
}

function loadAboutContent() {
  return readMarkdownFile(path.join(CONTENT_DIR, 'about.md'));
}

function loadResumeContent() {
  return readMarkdownFile(path.join(CONTENT_DIR, 'resume.md')).data;
}

function loadSpeakingContent() {
  return readMarkdownFile(path.join(CONTENT_DIR, 'speaking.md')).data;
}

function loadContactContent() {
  return readMarkdownFile(path.join(CONTENT_DIR, 'contact.md')).data;
}

function loadProjectsContent() {
  const dir = path.join(CONTENT_DIR, 'projects');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files
    .map((file) => {
      const { data, body } = readMarkdownFile(path.join(dir, file));
      return {
        slug: file.replace(/\.md$/, ''),
        ...data,
        desc: String(body).trim().replace(/\s+/g, ' '),
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function loadBlogContent() {
  const dir = path.join(CONTENT_DIR, 'blog');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const localPosts = [];
  const externalItems = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const { data, body } = readMarkdownFile(path.join(dir, file));
    if (data.draft === true) continue;
    if (data.external) {
      externalItems.push({
        slug,
        title: String(data.title),
        date: data.date ? String(data.date) : '',
        description: String(data.description || ''),
        url: String(data.url),
        source: String(data.source || ''),
        isExternal: true,
      });
    } else {
      localPosts.push({
        slug,
        title: String(data.title),
        date: String(data.date),
        description: String(data.description || ''),
        image: data.image ? String(data.image) : undefined,
        imageAlt: data.imageAlt ? String(data.imageAlt) : undefined,
        content: body,
        url: `/writing/${slug}/`,
        source: 'this site',
        isExternal: false,
      });
    }
  }

  localPosts.sort((a, b) => b.date.localeCompare(a.date));
  const allItems = [...localPosts, ...externalItems].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return { localPosts, allItems };
}

/* ==========================================================================
   Build-Time GitHub Fetching (LiveProjects Snapshot + Stats Repository Counts)
   ========================================================================== */

const LANGUAGE_COLORS = {
  Python: '#3572A5',
  C: '#555555',
  'C++': '#f34b7d',
  TypeScript: '#3178c6',
  JavaScript: '#d9b51c',
  HTML: '#e34c26',
  CSS: '#663399',
  'Jupyter Notebook': '#da5b0b',
  Batchfile: '#7e8f38',
  Shell: '#4f8f45',
  Rust: '#dea584',
  Go: '#00add8',
};

function computeLanguageStats(repos) {
  const counts = new Map();
  let totalWithLang = 0;
  for (const repo of repos) {
    if (!repo.language) continue;
    totalWithLang += 1;
    counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  }
  if (totalWithLang === 0) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([language, count]) => ({
      language,
      count,
      percentage: Math.round((count / totalWithLang) * 1000) / 10,
      color: LANGUAGE_COLORS[language] || '#74747c',
    }));
}

function buildFallbackProjectsPayload(site, projects) {
  const username = site.githubUsername || 'itsthemaverick';
  const profileUrl = `https://github.com/${username}`;
  const repoBacked = projects.filter((p) => Boolean(p.sourceRepository));

  const repos = repoBacked.map((p, index) => {
    const match = String(p.sourceRepository).match(/github\.com\/[^/]+\/([^/#?]+)/i);
    const slug = match ? match[1] : p.slug;
    const pushedIso = `${p.endDate || p.date}T00:00:00Z`;
    const createdIso = `${p.date}T00:00:00Z`;
    const tech = Array.isArray(p.tech) ? p.tech : [];
    return {
      id: index + 1,
      name: slug,
      fullName: `${username}/${slug}`,
      displayTitle: p.title,
      description: p.desc,
      htmlUrl: p.link || `${profileUrl}/${slug}`,
      homepage: null,
      cloneUrl: `${profileUrl}/${slug}.git`,
      language: tech[0] || null,
      topics: tech.slice(1).map((t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      stargazersCount: 0,
      forksCount: 0,
      watchersCount: 0,
      openIssuesCount: 0,
      sizeKb: 0,
      defaultBranch: 'main',
      license: null,
      createdAt: createdIso,
      updatedAt: pushedIso,
      pushedAt: pushedIso,
      fork: false,
      archived: p.status === 'archive',
      isActive: Boolean(p.ongoing),
    };
  });

  return {
    source: 'fallback',
    rateLimited: false,
    errorMessage: null,
    syncedAt: new Date().toISOString(),
    user: {
      login: username,
      name: `${site.name} Patil`,
      bio: `Developing since ${site.computingSince || 2018}`,
      avatarUrl: '/images/me.jpg',
      htmlUrl: profileUrl,
      publicRepos: repos.length,
      followers: 0,
      following: 0,
    },
    repos,
    events: [],
    languages: computeLanguageStats(repos),
    stats: {
      publicRepos: repos.length,
      totalStars: 0,
      totalForks: 0,
      activeRepos: repos.filter((r) => r.isActive).length,
      originalRepos: repos.length,
    },
  };
}

async function fetchJsonWithTimeout(url, headers, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: await res.json() };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

async function buildInitialProjectsPayload(site, projects) {
  const username = site.githubUsername || 'itsthemaverick';
  const token = process.env.GITHUB_TOKEN?.trim();
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': `${username}-portfolio-static`,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const [userRes, reposRes, eventsRes] = await Promise.all([
    fetchJsonWithTimeout(`https://api.github.com/users/${username}`, headers),
    fetchJsonWithTimeout(`https://api.github.com/users/${username}/repos?sort=pushed&per_page=100&type=owner`, headers),
    fetchJsonWithTimeout(`https://api.github.com/users/${username}/events/public?per_page=20`, headers),
  ]);

  if (!reposRes.ok || !Array.isArray(reposRes.data)) {
    return buildFallbackProjectsPayload(site, projects);
  }

  const nowMs = Date.now();
  const ACTIVE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
  const repos = reposRes.data
    .filter((r) => !r.private)
    .map((repo) => {
      const pushedAt = repo.pushed_at || repo.updated_at || repo.created_at;
      const rawLicense = repo.license?.spdx_id;
      const license = rawLicense && rawLicense !== 'NOASSERTION' ? rawLicense : null;
      const pushedMs = Date.parse(pushedAt);
      const isRecent = !Number.isNaN(pushedMs) && nowMs - pushedMs <= ACTIVE_WINDOW_MS;
      const cleanedTitle = String(repo.name)
        .replace(/^[-_]+|[-_]+$/g, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      let homepage = null;
      if (repo.homepage && String(repo.homepage).trim()) {
        try {
          const hp = String(repo.homepage).trim();
          const url = new URL(/^https?:\/\//i.test(hp) ? hp : `https://${hp}`);
          if (url.protocol === 'https:' || url.protocol === 'http:') homepage = url.toString();
        } catch {
          homepage = null;
        }
      }

      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        displayTitle: cleanedTitle || repo.name,
        description: repo.description?.trim() ? repo.description.trim() : null,
        htmlUrl: repo.html_url,
        homepage,
        cloneUrl: repo.clone_url,
        language: repo.language,
        topics: Array.isArray(repo.topics) ? repo.topics : [],
        stargazersCount: repo.stargazers_count ?? 0,
        forksCount: repo.forks_count ?? 0,
        watchersCount: repo.watchers_count ?? 0,
        openIssuesCount: repo.open_issues_count ?? 0,
        sizeKb: repo.size ?? 0,
        defaultBranch: repo.default_branch || 'main',
        license,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        pushedAt,
        fork: Boolean(repo.fork),
        archived: Boolean(repo.archived),
        isActive: !repo.archived && isRecent,
      };
    })
    .sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));

  const rawUser = userRes.ok && userRes.data ? userRes.data : {};
  const events =
    eventsRes.ok && Array.isArray(eventsRes.data)
      ? eventsRes.data
          .map((ev) => {
            const fullRepo = ev?.repo?.name;
            if (!fullRepo) return null;
            const shortRepo = fullRepo.replace(`${username}/`, '');
            const repoUrl = `https://github.com/${fullRepo}`;
            if (ev.type === 'PushEvent') {
              const cnt = ev.payload?.size ?? ev.payload?.commits?.length ?? 1;
              const branch = ev.payload?.ref?.replace('refs/heads/', '');
              return {
                id: ev.id,
                type: ev.type,
                label: 'Push',
                repoName: shortRepo,
                repoUrl,
                createdAt: ev.created_at,
                detail: `${cnt} ${cnt === 1 ? 'commit' : 'commits'}${branch ? ` to ${branch}` : ''}`,
              };
            }
            if (ev.type === 'CreateEvent') {
              const refType = ev.payload?.ref_type || 'repository';
              const ref = ev.payload?.ref;
              return {
                id: ev.id,
                type: ev.type,
                label: 'Created',
                repoName: shortRepo,
                repoUrl,
                createdAt: ev.created_at,
                detail: ref ? `${refType} ${ref}` : refType,
              };
            }
            return {
              id: ev.id,
              type: ev.type,
              label: String(ev.type || '').replace(/Event$/, ''),
              repoName: shortRepo,
              repoUrl,
              createdAt: ev.created_at,
              detail: ev.payload?.action || null,
            };
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];

  return {
    source: 'github',
    rateLimited: false,
    errorMessage: null,
    syncedAt: new Date(nowMs).toISOString(),
    user: {
      login: rawUser.login || username,
      name: rawUser.name || `${site.name} Patil`,
      bio: rawUser.bio ?? null,
      avatarUrl: rawUser.avatar_url || '/images/me.jpg',
      htmlUrl: rawUser.html_url || `https://github.com/${username}`,
      publicRepos: rawUser.public_repos ?? repos.length,
      followers: rawUser.followers ?? 0,
      following: rawUser.following ?? 0,
    },
    repos,
    events,
    languages: computeLanguageStats(repos),
    stats: {
      publicRepos: rawUser.public_repos ?? repos.length,
      totalStars: repos.reduce((sum, r) => sum + r.stargazersCount, 0),
      totalForks: repos.reduce((sum, r) => sum + r.forksCount, 0),
      activeRepos: repos.filter((r) => r.isActive).length,
      originalRepos: repos.filter((r) => !r.fork).length,
    },
  };
}

async function fetchStatsRepoCounts(sourceRepo) {
  const token = process.env.GITHUB_TOKEN?.trim();
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'yashraj-portfolio-static',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetchJsonWithTimeout(`https://api.github.com/repos/${sourceRepo}`, headers);
  if (
    res.ok &&
    res.data &&
    Number.isSafeInteger(res.data.stargazers_count) &&
    Number.isSafeInteger(res.data.subscribers_count) &&
    Number.isSafeInteger(res.data.forks)
  ) {
    return {
      fetched: true,
      stargazers_count: res.data.stargazers_count,
      subscribers_count: res.data.subscribers_count,
      forks: res.data.forks,
    };
  }
  return {
    fetched: false,
    stargazers_count: 1695,
    subscribers_count: 23,
    forks: 978,
  };
}

function countSourceLines() {
  let total = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(css|js|mjs)$/i.test(entry.name)) {
        total += fs.readFileSync(full, 'utf8').split('\n').length;
      }
    }
  };
  walk(CSS_DIR);
  walk(JS_DIR);
  return total;
}

/* ==========================================================================
   JSON-LD Schema Builders (parity with src/lib/schema.ts)
   ========================================================================== */

function buildSiteSchemaNodes(site, resume) {
  const siteUrl = String(site.siteUrl || 'https://itsthemaverick.github.io').replace(/\/$/, '');
  const homeUrl = `${siteUrl}/`;
  const personId = `${siteUrl}/#person`;
  const websiteId = `${siteUrl}/#website`;
  const current = currentPosition(resume.work || []);
  const [givenName, ...familyParts] = String(site.name).split(' ');
  const familyName = familyParts.join(' ');
  const socialLinks = (site.profiles || [])
    .filter((p) => !String(p.url).startsWith('mailto:'))
    .map((p) => p.url);

  const portrait = (id) => ({
    '@type': 'ImageObject',
    '@id': `${siteUrl}/#${id}`,
    url: `${siteUrl}/images/me.jpg`,
    width: 640,
    height: 640,
    caption: `${site.name} — AI & Machine Learning Engineer`,
  });

  return [
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: homeUrl,
      name: `${site.name} | AI & ML Engineer`,
      alternateName: ['itsthemaverick.github.io', 'itsthemaverick', site.name],
      description: site.siteDescription,
      inLanguage: 'en-US',
      publisher: { '@id': personId },
      image: portrait('website-image'),
    },
    {
      '@type': 'Person',
      '@id': personId,
      name: site.name,
      givenName,
      familyName,
      url: homeUrl,
      image: portrait('person-image'),
      description: site.siteDescription,
      jobTitle: current ? current.position : 'AI & Machine Learning Engineer',
      email: site.email,
      sameAs: [
        ...socialLinks,
        'https://github.com/itsthemaverick',
        'https://www.linkedin.com/in/yashraj-bhogade',
      ].filter((v, i, a) => a.indexOf(v) === i),
      knowsAbout: [
        'Artificial Intelligence',
        'Machine Learning',
        'Neural Network Architecture',
        'Forward Propagation and Backpropagation in C',
        'AI Red Teaming & Adversarial Robustness',
        'Prompt Injection Defense',
        'Agentic AI Workflows',
        'Systems Programming in C',
        'Computer Security',
      ],
      ...(current
        ? {
            worksFor: {
              '@type': 'Organization',
              name: current.name,
              url: current.url,
            },
          }
        : {}),
      alumniOf: (resume.degrees || []).map((d) => ({
        '@type': 'CollegeOrUniversity',
        name: d.school,
        url: d.link,
      })),
    },
  ];
}

function renderSchemaScript(nodes) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

/* ==========================================================================
   Shared Page Shell (Head Bootstrap, Header, SlideMenu, Footer)
   ========================================================================== */

function isActiveRoute(currentPath, navPath) {
  if (navPath === '/') return currentPath === '/';
  const normCurrent = currentPath.replace(/\/+$/, '');
  const normNav = navPath.replace(/\/+$/, '');
  return normCurrent === normNav || normCurrent.startsWith(`${normNav}/`);
}

function renderContactIcons(site, { includeEmail = true, labelled = false } = {}) {
  const items = (site.profiles || []).filter((p) => includeEmail || p.id !== 'email');
  return `<ul class="${labelled ? 'icons icons--labelled' : 'icons'}">${items
    .map((p) => {
      const isMailto = String(p.url).startsWith('mailto:');
      const aria = labelled ? '' : ` aria-label="${escapeHtml(isMailto ? p.label : `${p.label} (opens in new tab)`)}"`;
      const target = isMailto ? '' : ' target="_blank" rel="noopener noreferrer"';
      const labelHtml = labelled
        ? `${escapeHtml(p.label)}${isMailto ? '' : '<span class="sr-only"> (opens in new tab)</span>'}`
        : '';
      return `<li><a href="${escapeHtml(p.url)}"${aria}${target}><svg viewBox="${escapeHtml(p.viewBox)}" fill="currentColor" aria-hidden="true" focusable="false"><path d="${escapeHtml(p.path)}" /></svg>${labelHtml}</a></li>`;
    })
    .join('')}</ul>`;
}

function renderPortrait(site, depth, width, height, priority = false) {
  const loading = priority ? 'eager' : 'lazy';
  const fetchPrio = priority ? ' fetchpriority="high"' : '';
  const altText = `${site.name}, AI & Machine Learning Engineer and B.Tech student in Pune`;
  return `<span class="portrait"><img src="${escapeHtml(hrefFor(depth, '/images/me.jpg'))}" alt="${escapeHtml(altText)}" width="${width}" height="${height}" loading="${loading}"${fetchPrio} decoding="async"></span>`;
}

function renderHeaderAndMenu(site, currentPath, depth) {
  const navLinks = (site.footerLinks || []).filter((l) => l.primary !== false);
  const desktopNav = navLinks
    .map((l) => {
      const active = isActiveRoute(currentPath, l.path);
      return `<a href="${escapeHtml(hrefFor(depth, l.path))}" class="nav-link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${escapeHtml(l.label)}</a>`;
    })
    .join('');

  const mobileNav = [
    { label: site.name, path: '/', index: true },
    ...navLinks.map((l) => ({ ...l, index: false })),
  ]
    .map((l) => {
      const active = isActiveRoute(currentPath, l.path);
      return `<li><a href="${escapeHtml(hrefFor(depth, l.path))}"${active ? ' class="active" aria-current="page"' : ''}><span${l.index ? ' class="index-li"' : ''}>${escapeHtml(smartQuotes(l.label))}</span></a></li>`;
    })
    .join('');

  const themeButton = `<button type="button" class="theme-toggle" aria-label="Theme preference: system.">
  <span class="theme-toggle-state" data-theme-state="system">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    <span class="sr-only">Theme preference: system.</span>
  </span>
  <span class="theme-toggle-state" data-theme-state="light">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <span class="sr-only">Theme preference: light.</span>
  </span>
  <span class="theme-toggle-state" data-theme-state="dark">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <span class="sr-only">Theme preference: dark.</span>
  </span>
</button>`;

  const header = `<header class="site-header">
  <div class="site-brand">
    <a href="${escapeHtml(hrefFor(depth, '/'))}" class="site-logo" aria-label="${escapeHtml(site.name)} — home">
      <span class="logo-text">${escapeHtml(site.monogram || 'yb')}</span>
      <span class="logo-name">${escapeHtml(smartQuotes(site.name))}</span>
    </a>
  </div>
  <nav class="nav-links" aria-label="Primary">${desktopNav}</nav>
  <div class="nav-actions">
    ${themeButton}
    <div class="hamburger-container">
      <button type="button" class="hamburger-button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobile-nav-menu">
        <span class="hamburger-icon"><span></span><span></span><span></span></span>
      </button>
    </div>
  </div>
</header>
<dialog id="mobile-nav-menu" aria-label="Navigation menu" class="slide-menu">
  <div class="slide-menu-sheet">
    <button type="button" class="slide-menu-close" aria-label="Close navigation menu"><span aria-hidden="true">×</span></button>
    <ul class="hamburger-ul">${mobileNav}</ul>
  </div>
</dialog>`;

  return header;
}

function renderFooter(site, resume, depth) {
  const current = currentPosition(resume.work || []);
  const year = new Date().getFullYear();
  const linksHtml = (site.footerLinks || [])
    .map((l) => `<a href="${escapeHtml(hrefFor(depth, l.path))}">${escapeHtml(l.label)}</a>`)
    .join('');

  return `<footer class="site-footer-new">
  <div class="footer-content">
    <div class="footer-identity">
      <a href="${escapeHtml(hrefFor(depth, '/'))}" class="footer-avatar">
        ${renderPortrait(site, depth, 80, 80)}
      </a>
      <div class="footer-info">
        <span class="footer-name">${escapeHtml(smartQuotes(site.name))}</span>
        ${current ? `<p class="footer-role">${escapeHtml(`${current.position} at ${current.name}`)}</p>` : ''}
        <p class="footer-copyright">&copy; ${year} · <a href="https://github.com/${escapeHtml(site.sourceRepository || 'itsthemaverick/personal-site')}" target="_blank" rel="noopener noreferrer">Source<span class="sr-only"> (opens in new tab)</span></a></p>
      </div>
    </div>
    <div class="footer-right">
      <nav class="footer-links" aria-label="Site">${linksHtml}</nav>
      ${renderContactIcons(site, { includeEmail: true, labelled: false })}
    </div>
  </div>
</footer>`;
}

function renderDocument({
  site,
  resume,
  title,
  description,
  canonicalPath,
  currentPath,
  depth,
  chromeColors,
  siteSchemaNodes,
  pageSchemaNodes = [],
  ogType = 'website',
  ogImageUrl = null,
  publishedTime = null,
  noindex = false,
  alternateJson = false,
  alternateRss = false,
  hideFooter = false,
  hideShellNav = false,
  mainHtml,
  mainTagOverride = null,
}) {
  const siteUrl = String(site.siteUrl || 'https://itsthemaverick.github.io').replace(/\/$/, '');
  const fullTitle = title
    ? (title.includes(site.name) ? title : `${title} | ${site.name}`)
    : `${site.name} | AI & ML Engineer`;
  const canonicalUrl = canonicalPath ? `${siteUrl}${canonicalPath}` : null;
  const shareImg = ogImageUrl || `${siteUrl}/og.png`;

  const themeInit = `(function(){try{var c=localStorage.getItem('theme');if(c!=='light'&&c!=='dark')c='system';var d=document.documentElement;d.setAttribute('data-theme-choice',c);var r=c==='system'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):c;if(c!=='system')d.setAttribute('data-theme',r);var m=document.createElement('meta');m.name='theme-color';m.setAttribute('data-theme-color','');m.content=r==='dark'?'${chromeColors.dark}':'${chromeColors.light}';document.head.prepend(m);}catch(e){}})();`;

  const allSchema = [...siteSchemaNodes, ...pageSchemaNodes];

  const headLinks = [
    `<link rel="icon" href="${escapeHtml(hrefFor(depth, '/favicon.ico'))}" sizes="any">`,
    `<link rel="icon" href="${escapeHtml(hrefFor(depth, '/icon.png'))}" type="image/png">`,
    `<link rel="apple-touch-icon" href="${escapeHtml(hrefFor(depth, '/apple-icon.png'))}">`,
    `<link rel="manifest" href="${escapeHtml(hrefFor(depth, '/manifest.json'))}">`,
    canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : '',
    `<link rel="alternate" type="text/markdown" title="LLM Context" href="${escapeHtml(siteUrl)}/llms.txt">`,
    `<link rel="alternate" type="text/markdown" title="Full LLM Context Archive" href="${escapeHtml(siteUrl)}/llms-full.txt">`,
    alternateRss ? `<link rel="alternate" type="application/rss+xml" title="RSS" href="${escapeHtml(siteUrl)}/feed.xml">` : '',
    alternateJson ? `<link rel="alternate" type="application/json" href="${escapeHtml(siteUrl)}/resume.json">` : '',
  ]
    .filter(Boolean)
    .join('\n  ');

  const bodyContent = mainTagOverride
    ? mainHtml
    : `<div class="page-container">
  <main id="main-content" tabindex="-1" class="page-main">
    ${mainHtml}
  </main>
  ${hideFooter ? '' : renderFooter(site, resume, depth)}
</div>`;

  return `<!DOCTYPE html>
<html lang="en" data-theme-choice="system">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <noscript>
    <meta name="theme-color" content="${escapeHtml(chromeColors.light)}" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="${escapeHtml(chromeColors.dark)}" media="(prefers-color-scheme: dark)">
  </noscript>
  <script id="theme-init">${themeInit}</script>
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="googlebot" content="max-video-preview:-1, max-image-preview:large, max-snippet:-1">'}
  ${headLinks}
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:site_name" content="${escapeHtml(site.name)}">
  <meta property="og:locale" content="en_US">
  ${canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : ''}
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(shareImg)}">
  <meta property="og:image:alt" content="${escapeHtml(fullTitle)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@itsthemaverick">
  <meta name="twitter:creator" content="@itsthemaverick">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(shareImg)}">
  ${renderSchemaScript(allSchema)}
  <link rel="stylesheet" href="${escapeHtml(hrefFor(depth, '/assets/css/styles.css'))}">
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  ${hideShellNav ? '' : renderHeaderAndMenu(site, currentPath, depth)}
  ${bodyContent}
  <script type="module" src="${escapeHtml(hrefFor(depth, '/assets/js/main.js'))}"></script>
</body>
</html>
`;
}

/* ==========================================================================
   Page Builders
   ========================================================================== */

function buildHomePage(site, allBlogItems) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const recent = allBlogItems.filter((item) => item.date).slice(0, 3);

  const heroHtml = `<section class="hero">
  <div class="hero-grid">
    <div class="hero-primary">
      <p class="hero-kicker">Artificial Intelligence &amp; Data Science</p>
      <h1 class="hero-title"><span class="hero-name">${escapeHtml(smartQuotes(site.name))}</span></h1>
      <p class="hero-tagline">
        I’m an ${escapeHtml(site.role)} at <span class="hero-highlight">${escapeHtml(site.employer)}</span>, working on ${escapeHtml(site.focus)}.
      </p>
      <p class="hero-summary">
        I build machine learning systems, explore agentic AI workflows, and investigate neural computation from scratch. B.Tech student in AI &amp; Data Science at Dr. D. Y. Patil Institute of Technology, Pune.
      </p>
      <div class="hero-cta">
        <a href="${escapeHtml(hrefFor(0, '/about/'))}" class="button">About me</a>
        <a href="${escapeHtml(hrefFor(0, '/resume/'))}" class="hero-resume-link">View resume</a>
      </div>
    </div>
    <figure class="hero-portrait">
      ${renderPortrait(site, 0, 320, 320, true)}
      <figcaption>${escapeHtml(site.currentCity)}</figcaption>
    </figure>
  </div>
</section>`;

  const notesHtml = `<section class="home-writing" aria-labelledby="home-writing-title">
  <div class="home-writing-header">
    <h2 id="home-writing-title" class="section-heading">Notes &amp; essays</h2>
    <a href="${escapeHtml(hrefFor(0, '/writing/'))}" class="home-writing-all">All blog <span aria-hidden="true">→</span></a>
  </div>
  <div class="home-writing-list">
    ${recent
      .map((item) => {
        const inner = `<span class="home-writing-meta">${escapeHtml(formatDate(item.date))} · ${escapeHtml(item.source)}</span>
        <div class="home-writing-copy"><h3>${escapeHtml(smartQuotes(item.title))}</h3></div>
        <span class="home-writing-arrow" aria-hidden="true">${item.isExternal ? '↗' : '→'}</span>`;
        if (item.isExternal) {
          return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="home-writing-item">${inner}<span class="sr-only"> (opens in a new tab)</span></a>`;
        }
        return `<a href="${escapeHtml(hrefFor(0, item.url))}" class="home-writing-item">${inner}</a>`;
      })
      .join('\n    ')}
  </div>
</section>`;

  const pageNodes = [
    {
      '@type': 'ProfilePage',
      '@id': `${siteUrl}/#webpage`,
      url: `${siteUrl}/`,
      name: `${site.name} | AI & ML Engineer`,
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      mainEntity: { '@id': `${siteUrl}/#person` },
    },
  ];

  return {
    title: 'AI & ML Engineer - Neural Systems',
    description: site.siteDescription,
    canonicalPath: '/',
    currentPath: '/',
    depth: 0,
    pageSchemaNodes: pageNodes,
    mainHtml: `${heroHtml}\n${notesHtml}`,
  };
}

function buildAboutPage(site, aboutDoc) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const rawBody = aboutDoc.body.trim().replace(/^# Intro\s*/, '');
  const [introRaw, ...sectionChunks] = rawBody.split(/\n(?=# )/);
  const variants = aboutDoc.data.sectionVariants || {};

  const parsedSections = sectionChunks.map((chunk) => {
    const [heading, ...rest] = chunk.trim().split('\n');
    const title = heading.replace(/^#\s+/, '').trim();
    return { title, body: rest.join('\n').trim() };
  });
  const ids = createUniqueHeadingIds(parsedSections.map((s) => s.title));
  const sections = parsedSections.map((s, idx) => ({
    id: ids[idx],
    title: smartQuotes(s.title),
    rawTitle: s.title,
    body: s.body,
    variant: variants[s.title] || '',
  }));

  const introHtml = introRaw.trim()
    ? `<div class="about-intro">${renderMarkdown(introRaw.trim(), { depth: 1 })}</div>`
    : '';

  const sectionNavHtml =
    sections.length > 0
      ? `<nav class="section-nav about-section-nav" data-section-nav aria-label="About sections">
  <div class="section-nav-row">
    ${sections
      .map(
        (sec, idx) =>
          `<a href="#${escapeHtml(sec.id)}" class="section-nav-link${idx === 0 ? ' active' : ''}"${idx === 0 ? ' aria-current="true"' : ''}>${escapeHtml(sec.title)}</a>`,
      )
      .join('')}
  </div>
</nav>`
      : '';

  const sectionsHtml = sections
    .map((sec) => {
      const cls = sec.variant ? `about-section ${sec.variant}` : 'about-section';
      const bodyHtml = renderMarkdown(sec.body, {
        depth: 1,
        isLogSection: sec.variant === 'about-section--log',
      });
      return `<section class="${escapeHtml(cls)}">
  <div class="section-header">
    <h2 id="${escapeHtml(sec.id)}" class="section-heading">
      <a href="#${escapeHtml(sec.id)}" class="about-section-heading-link">${escapeHtml(sec.title)}<span class="about-section-heading-hash" aria-hidden="true">#</span></a>
    </h2>
  </div>
  ${bodyHtml}
</section>`;
    })
    .join('\n');

  const aboutUrl = `${siteUrl}/about/`;
  const pageNodes = [
    {
      '@type': 'ProfilePage',
      '@id': `${aboutUrl}#webpage`,
      url: aboutUrl,
      name: 'About',
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: aboutDoc.data.description,
      breadcrumb: { '@id': `${aboutUrl}#breadcrumb` },
      mainEntity: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${aboutUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'About', item: aboutUrl },
      ],
    },
  ];

  return {
    title: 'About - AI & Systems Architecture',
    description: aboutDoc.data.description,
    canonicalPath: '/about/',
    currentPath: '/about/',
    depth: 1,
    pageSchemaNodes: pageNodes,
    mainHtml: `<section class="about-page">
  <header class="about-header"><h1 class="page-title">About</h1></header>
  <article class="about-content">${introHtml}${sectionNavHtml}${sectionsHtml}</article>
</section>`,
  };
}

function tierFor(job, positions) {
  const isEarly =
    /intern/i.test(job.position) ||
    Boolean(job.endDate && Number.parseInt(String(job.endDate).slice(0, 4), 10) < 2013);
  if (isEarly) return 'early';

  const newestStartDate = positions
    .filter((p) => {
      const early =
        /intern/i.test(p.position) ||
        Boolean(p.endDate && Number.parseInt(String(p.endDate).slice(0, 4), 10) < 2013);
      return !early && p.commitment !== 'part-time';
    })
    .map((p) => p.startDate)
    .sort((a, b) => b.localeCompare(a))[0];

  return job.startDate === newestStartDate ? 'lead' : 'primary';
}

function groupSkills(skills) {
  const names = [...new Set(skills.flatMap((s) => s.category || []))].sort();
  return names.map((name) => ({
    name,
    skills: skills
      .filter((s) => (s.category || []).includes(name))
      .sort((a, b) => b.competency - a.competency || a.title.localeCompare(b.title, 'en')),
  }));
}

function buildResumePage(site, resume) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const now = Date.now();
  const displayUrl = (u) => String(u).replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
  const github = (site.profiles || []).find((p) => p.id === 'github')?.url || '';
  const linkedin = (site.profiles || []).find((p) => p.id === 'linkedin')?.url || '';

  const positions = sortPositions(resume.work || []);
  const jobsHtml = positions
    .map((job) => {
      const tier = tierFor(job, positions);
      const isCurrent = !job.endDate;
      const months = monthsBetween(job.startDate, job.endDate ?? now);
      const hedged = isCurrent && months >= 1;
      const dur = `${formatDuration(months)}${hedged ? '+' : ''}`;
      const durLong = `${formatDuration(months, true)}${hedged ? ' or more' : ''}`;
      const summaryHtml = job.summary
        ? `<p class="summary">${renderInlineMarkdown(job.summary, { depth: 1 })}</p>`
        : '';
      const highlightsHtml =
        job.highlights && job.highlights.length > 0
          ? `<ul class="points">${job.highlights.map((h) => `<li>${escapeHtml(smartQuotes(h))}</li>`).join('')}</ul>`
          : '';

      return `<article class="jobs-container jobs-container--${tier}${isCurrent ? ' jobs-container--current' : ''}">
  <p class="daterange">
    <span class="job-marker" aria-hidden="true"></span>
    ${renderDateSpan({ date: job.startDate, endDate: job.endDate, ongoing: true })}
    <span class="daterange-duration">
      <span aria-hidden="true">${escapeHtml(dur)}</span>
      <span class="sr-only">Duration: ${escapeHtml(durLong)}</span>
    </span>
  </p>
  <div class="job-body">
    <header>
      <h3>
        <a href="${escapeHtml(job.url)}" class="job-company">${escapeHtml(smartQuotes(job.name))}</a>
        <span class="sr-only">, </span>
        <span class="job-position">${escapeHtml(smartQuotes(job.position))}</span>
      </h3>
    </header>
    ${summaryHtml}
    ${highlightsHtml}
  </div>
</article>`;
    })
    .join('\n');

  const educationHtml = (resume.degrees || [])
    .map(
      (deg) => `<article class="degree-container">
  <header>
    <h3 class="degree">${escapeHtml(smartQuotes(deg.degree))}</h3>
    <p class="school"><a href="${escapeHtml(deg.link)}">${escapeHtml(smartQuotes(deg.school))}</a>, <time datetime="${escapeHtml(deg.year)}">${escapeHtml(deg.year)}</time></p>
  </header>
</article>`,
    )
    .join('\n');

  const skillGroups = groupSkills(resume.skills || []);
  const hasFamiliar = (resume.skills || []).some((s) => s.competency < 4);
  const skillsHtml = `<div class="skills">
  <div class="section-header"><h2 class="section-heading">Skills</h2></div>
  <p class="resume-note skill-tier-legend">
    Strongest first.${hasFamiliar ? '<span class="skill-tier-legend-tone" aria-hidden="true"> Fainter tags mark familiarity, not working knowledge.</span>' : ''}
  </p>
  <div class="skill-groups">
    ${skillGroups
      .map(
        (g) => `<div class="skill-group">
      <h3 class="skill-group-title">${escapeHtml(g.name)}</h3>
      <ul class="skill-tags">
        ${g.skills
          .map((sk) => {
            const tier = sk.competency >= 5 ? 'deep' : sk.competency >= 4 ? 'working' : 'familiar';
            const desc = tier === 'deep' ? 'deep knowledge' : tier === 'working' ? 'working knowledge' : 'familiarity';
            return `<li class="skill-tag skill-tag--${tier}">${escapeHtml(sk.title)}<span class="sr-only">, ${desc}</span></li>`;
          })
          .join('')}
      </ul>
    </div>`,
      )
      .join('')}
  </div>
</div>`;

  const coursesSorted = [...(resume.courses || [])].sort(
    (a, b) => b.university.localeCompare(a.university) || a.number.localeCompare(b.number),
  );
  const coursesHtml = `<div class="courses">
  <div class="section-header"><h2 class="section-heading">Selected courses</h2></div>
  <ul class="course-list">
    ${coursesSorted
      .map(
        (c) => `<li class="course-container"><a href="${escapeHtml(c.link)}"><span class="course-number">${escapeHtml(c.number)}</span><span class="sr-only">: </span><span class="course-name">${escapeHtml(smartQuotes(c.title))}</span></a></li>`,
      )
      .join('')}
  </ul>
</div>`;

  const resumeSections = [
    { id: 'experience', title: 'Experience' },
    { id: 'education', title: 'Education' },
    { id: 'skills', title: 'Skills' },
    { id: 'courses', title: 'Courses' },
  ];

  const mainHtml = `<section class="resume-page">
  <header class="resume-header">
    <div class="resume-header-row">
      <h1 class="page-title"><span class="resume-screen-title">Resume</span> <span class="resume-print-name">${escapeHtml(smartQuotes(site.name))}</span></h1>
      <div class="resume-actions">
        <button type="button" class="button button-secondary button-compact resume-print-button" aria-label="Print or save resume as PDF">Print / PDF</button>
        <a href="../resume.json" class="button button-secondary button-compact" title="JSON Resume" aria-label="JSON Resume">JSON</a>
      </div>
    </div>
    <p class="resume-summary">${escapeHtml(smartQuotes(resume.summary))}</p>
    <address class="resume-print-contact">
      <span>${escapeHtml(site.currentCity)}</span>
      <a href="${escapeHtml(siteUrl)}/">${escapeHtml(displayUrl(siteUrl))}</a>
      <a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>
      <a href="${escapeHtml(github)}">${escapeHtml(displayUrl(github))}</a>
      <a href="${escapeHtml(linkedin)}">${escapeHtml(displayUrl(linkedin))}</a>
    </address>
  </header>

  <nav class="section-nav resume-nav" data-section-nav aria-label="Resume sections">
    <div class="section-nav-row">
      ${resumeSections
        .map(
          (s, idx) =>
            `<a href="#${s.id}" class="section-nav-link${idx === 0 ? ' active' : ''}"${idx === 0 ? ' aria-current="true"' : ''}>${s.title}</a>`,
        )
        .join('')}
    </div>
  </nav>

  <div class="resume-content">
    <section id="experience" class="resume-section">
      <div class="experience">
        <div class="section-header"><h2 class="section-heading">Experience</h2></div>
        <div class="experience-spine">${jobsHtml}</div>
      </div>
    </section>
    <section id="education" class="resume-section">
      <div class="education">
        <div class="section-header"><h2 class="section-heading">Education</h2></div>
        ${educationHtml}
      </div>
    </section>
    <section id="skills" class="resume-section">${skillsHtml}</section>
    <section id="courses" class="resume-section">${coursesHtml}</section>
  </div>
</section>`;

  const resumeUrl = `${siteUrl}/resume/`;
  const pageNodes = [
    {
      '@type': 'ProfilePage',
      '@id': `${resumeUrl}#profilepage`,
      url: resumeUrl,
      name: `Resume — ${site.name}`,
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: resume.description,
      breadcrumb: { '@id': `${resumeUrl}#breadcrumb` },
      mainEntity: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${resumeUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Resume', item: resumeUrl },
      ],
    },
  ];

  return {
    title: 'Resume - Experience & Education',
    description: resume.description,
    canonicalPath: '/resume/',
    currentPath: '/resume/',
    depth: 1,
    alternateJson: true,
    pageSchemaNodes: pageNodes,
    mainHtml,
  };
}

function buildProjectsPage(site, projects, initialPayload) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const shipped = projects.filter((p) => p.status !== 'archive');
  const orgProjects = projects.filter((p) => !p.sourceRepository);
  const pageTitle = 'Projects';
  const desc = `Live GitHub repositories and selected work from ${site.name} — ${shipped
    .slice(0, 3)
    .map((p) => p.title)
    .join(', ')} — synced dynamically from GitHub.`;

  const initialJson = JSON.stringify({
    payload: initialPayload,
    organizationProjects: orgProjects,
  }).replace(/</g, '\\u003c');

  // Pre-render static noscript-compatible initial list inside `.gh-projects-shell` so content shows immediately before JS executes
  const preRenderedRepos = (initialPayload.repos || [])
    .slice(0, 12)
    .map((repo) => {
      return `<li><article class="project-entry gh-repo-entry${repo.isActive ? ' project-entry--live' : ''}">
  <div class="project-entry-meta">
    <span class="project-dates"><time datetime="${escapeHtml(repo.createdAt)}">${escapeHtml(formatMonthYear(repo.createdAt))}</time></span>
    ${repo.language ? `<span class="gh-gutter-lang"><span>${escapeHtml(repo.language)}</span></span>` : ''}
  </div>
  <div class="project-entry-body">
    <h3 class="project-entry-title gh-repo-title"><a href="${escapeHtml(repo.htmlUrl)}" target="_blank" rel="noopener noreferrer" class="gh-repo-link">${escapeHtml(smartQuotes(repo.displayTitle))}<span class="project-entry-external" aria-hidden="true">↗</span></a></h3>
    <p class="project-entry-desc">${escapeHtml(smartQuotes(repo.description || `Public repository under @${initialPayload.user.login}.`))}</p>
  </div>
</article></li>`;
    })
    .join('');

  const pageUrl = `${siteUrl}/projects/`;
  const softwareNodes = projects.map((p) => {
    const slug = (p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      '@type': 'SoftwareSourceCode',
      '@id': `${siteUrl}/projects/#${slug}`,
      name: p.title,
      description: p.subtitle || p.title,
      author: { '@id': `${siteUrl}/#person` },
      ...(p.link ? { url: p.link } : {}),
      ...(p.sourceRepository ? { codeRepository: p.sourceRepository } : {}),
      ...(p.tech && p.tech.length > 0 ? { programmingLanguage: p.tech[0] } : {}),
    };
  });

  const pageNodes = [
    {
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: pageTitle,
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: desc,
      breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      about: { '@id': `${siteUrl}/#person` },
      hasPart: softwareNodes.map((s) => ({ '@id': s['@id'] })),
    },
    ...softwareNodes,
    {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: pageTitle, item: pageUrl },
      ],
    },
  ];

  const mainHtml = `<div class="projects-page">
  <header class="projects-header">
    <h1 class="page-title">${pageTitle}</h1>
    <p class="page-subtitle">Live public repositories synced from GitHub alongside team, research, and event work.</p>
  </header>
  <script id="gh-initial-data" type="application/json">${initialJson}</script>
  <div class="gh-projects-shell" data-gh-projects>
    <section class="projects-group" aria-labelledby="projects-repositories">
      <div class="section-header">
        <h2 id="projects-repositories" class="section-heading">GitHub repositories</h2>
        <p class="section-header-meta">${initialPayload.repos.length} repositories</p>
      </div>
      <ol class="projects-register gh-repo-register">${preRenderedRepos}</ol>
    </section>
  </div>
</div>`;

  return {
    title: 'AI & ML Projects - Code & Systems',
    description: 'Explore open-source AI software and machine learning projects by Yashraj Bhogade, including neural networks in C, agentic systems, and security tools.',
    canonicalPath: '/projects/',
    currentPath: '/projects/',
    depth: 1,
    pageSchemaNodes: pageNodes,
    mainHtml,
  };
}

function buildBlogIndexPage(site, allItems) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const writingDesc = 'Articles on AI, machine learning, neural architectures, and software engineering.';
  const pageUrl = `${siteUrl}/writing/`;
  const latestDated = allItems.find((i) => i.date);

  const sections = [
    { id: 'writing-here', label: 'Essays on this site', items: allItems.filter((i) => !i.isExternal) },
    { id: 'writing-elsewhere', label: 'Selected writing elsewhere', items: allItems.filter((i) => i.isExternal && i.date) },
    { id: 'writing-guides', label: 'Guides', items: allItems.filter((i) => i.isExternal && !i.date) },
  ].filter((s) => s.items.length > 0);

  const sectionsHtml = sections
    .map(
      (sec) => `<section class="projects-group" aria-labelledby="${sec.id}">
  <div class="section-header"><h2 id="${sec.id}" class="section-heading">${escapeHtml(sec.label)}</h2></div>
  <ol class="projects-register">
    ${sec.items
      .map((item) => {
        const meta = `${item.date ? `<time class="project-dates" datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time>` : ''}${item.isExternal ? `<span class="project-entry-role">${escapeHtml(item.source)}</span>` : ''}`;
        const body = `<h3 class="project-entry-title">${escapeHtml(smartQuotes(item.title))}${item.isExternal ? '<span class="project-entry-external" aria-hidden="true">↗</span>' : ''}</h3>
        <p class="project-entry-desc">${escapeHtml(smartQuotes(item.description))}</p>
        ${item.isExternal ? '<span class="sr-only"> (opens in a new tab)</span>' : ''}`;
        if (item.isExternal) {
          return `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="project-entry"><div class="project-entry-meta">${meta}</div><div class="project-entry-body">${body}</div></a></li>`;
        }
        return `<li><a href="${escapeHtml(hrefFor(1, item.url))}" class="project-entry"><div class="project-entry-meta">${meta}</div><div class="project-entry-body">${body}</div></a></li>`;
      })
      .join('\n    ')}
  </ol>
</section>`,
    )
    .join('\n');

  const pageNodes = [
    {
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: 'Blog',
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: writingDesc,
      breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      about: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'Blog',
      '@id': `${siteUrl}/writing/#blog`,
      isPartOf: { '@id': `${siteUrl}/#website` },
      mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
      name: `${site.name}'s Blog`,
      description: writingDesc,
      inLanguage: 'en-US',
      ...(latestDated ? { dateModified: latestDated.date } : {}),
      publisher: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: pageUrl },
      ],
    },
  ];

  return {
    title: 'Technical Blog & AI Deep Dives',
    description: 'In-depth technical articles on neural networks in C, AI red teaming, prompt injection defenses, and secure Linux environments by Yashraj Bhogade.',
    canonicalPath: '/writing/',
    currentPath: '/writing/',
    depth: 1,
    alternateRss: true,
    pageSchemaNodes: pageNodes,
    mainHtml: `<article class="writing-page">
  <header class="page-header">
    <h1 class="page-title">Blog</h1>
    <a href="${escapeHtml(hrefFor(1, '/feed.xml'))}" class="button button-secondary button-compact writing-rss-link">RSS</a>
  </header>
  ${sectionsHtml}
</article>`,
  };
}

const ARTICLE_SEO_MAP = {
  'building-a-neural-network-from-scratch-in-c': {
    shortTitle: 'Neural Network from Scratch in C',
    section: 'Machine Learning & Systems Programming',
    keywords: ['Neural Networks in C', 'Forward Propagation', 'Backpropagation', 'C99', 'Matrix Multiplication', 'Stochastic Gradient Descent', 'Cache Locality'],
    about: [
      { '@type': 'Thing', name: 'Artificial neural network', sameAs: 'https://en.wikipedia.org/wiki/Artificial_neural_network' },
      { '@type': 'Thing', name: 'C (programming language)', sameAs: 'https://en.wikipedia.org/wiki/C_(programming_language)' },
      { '@type': 'Thing', name: 'Backpropagation', sameAs: 'https://en.wikipedia.org/wiki/Backpropagation' },
    ],
  },
  'ai-red-teaming-systematic-adversarial-testing': {
    shortTitle: 'AI Red Teaming Playbook & Testing',
    section: 'AI Security & Red Teaming',
    keywords: ['AI Red Teaming', 'Adversarial Machine Learning', 'Crescendo Attack', 'Prompt Injection', 'OWASP Top 10 for LLMs', 'Automated Evaluation Harness'],
    about: [
      { '@type': 'Thing', name: 'Adversarial machine learning', sameAs: 'https://en.wikipedia.org/wiki/Adversarial_machine_learning' },
      { '@type': 'Thing', name: 'Red team', sameAs: 'https://en.wikipedia.org/wiki/Red_team' },
      { '@type': 'Thing', name: 'Large language model', sameAs: 'https://en.wikipedia.org/wiki/Large_language_model' },
    ],
  },
  'prompt-injection-breaking-the-trust-boundary': {
    shortTitle: 'Prompt Injection Defense & RAG',
    section: 'AI Security & Adversarial Testing',
    keywords: ['Prompt Injection', 'Indirect Prompt Injection', 'RAG Poisoning', 'Transformer Attention', 'Taint Tracking', 'LLM Guardrails'],
    about: [
      { '@type': 'Thing', name: 'Prompt injection', sameAs: 'https://en.wikipedia.org/wiki/Prompt_engineering#Prompt_injection' },
      { '@type': 'Thing', name: 'Retrieval-augmented generation', sameAs: 'https://en.wikipedia.org/wiki/Retrieval-augmented_generation' },
      { '@type': 'Thing', name: 'Computer security', sameAs: 'https://en.wikipedia.org/wiki/Computer_security' },
    ],
  },
  'why-i-chose-parrot-os-over-omarchy': {
    shortTitle: 'Parrot OS vs Omarchy for Security',
    section: 'Operating Systems & Security',
    keywords: ['Parrot Security OS', 'Omarchy', 'Linux Security', 'AppArmor', 'Firejail', 'Debian Testing', 'Systems Programming'],
    about: [
      { '@type': 'Thing', name: 'Parrot OS', sameAs: 'https://en.wikipedia.org/wiki/Parrot_OS' },
      { '@type': 'Thing', name: 'Arch Linux', sameAs: 'https://en.wikipedia.org/wiki/Arch_Linux' },
      { '@type': 'Thing', name: 'AppArmor', sameAs: 'https://en.wikipedia.org/wiki/AppArmor' },
    ],
  },
  'building-localdrop-my-first-shipped-software': {
    shortTitle: 'Building LocalDrop: First Shipped Software',
    section: 'Software Engineering & Networking',
    keywords: ['LocalDrop', 'PyQt5', 'Flask', 'Local Network File Transfer', 'Software Development Lifecycle', 'PyInstaller', 'Inno Setup', 'Network Diagnostics'],
    about: [
      { '@type': 'Thing', name: 'Software development process', sameAs: 'https://en.wikipedia.org/wiki/Software_development_process' },
      { '@type': 'Thing', name: 'Flask (web framework)', sameAs: 'https://en.wikipedia.org/wiki/Flask_(web_framework)' },
      { '@type': 'Thing', name: 'PyQt', sameAs: 'https://en.wikipedia.org/wiki/PyQt' },
    ],
  },
};

function buildBlogPostPage(site, post, localPosts, idx) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const postUrl = `${siteUrl}/writing/${post.slug}/`;
  const shareImgUrl = fs.existsSync(path.join(ASSETS_DIR, 'og', 'writing', `${post.slug}.png`))
    ? `${siteUrl}/og/writing/${post.slug}.png`
    : `${siteUrl}/og.png`;

  const metaConfig = ARTICLE_SEO_MAP[post.slug] || {
    shortTitle: post.title,
    section: 'Artificial Intelligence',
    keywords: ['Artificial Intelligence', 'Machine Learning', 'Software Engineering'],
    about: [{ '@type': 'Thing', name: 'Artificial intelligence', sameAs: 'https://en.wikipedia.org/wiki/Artificial_intelligence' }],
  };

  const isoPublished = `${post.date}T00:00:00+05:30`;

  // localPosts is newest-first
  const newer = idx > 0 ? localPosts[idx - 1] : null;
  const older = idx < localPosts.length - 1 ? localPosts[idx + 1] : null;

  const pagerHtml =
    newer || older
      ? `<nav class="post-pager" aria-label="Older and newer posts">
  ${older ? `<a href="${escapeHtml(hrefFor(2, older.url))}" class="post-pager-older"><span class="post-pager-label">Older</span><span class="post-pager-title">${escapeHtml(smartQuotes(older.title))}</span></a>` : ''}
  ${newer ? `<a href="${escapeHtml(hrefFor(2, newer.url))}" class="post-pager-newer"><span class="post-pager-label">Newer</span><span class="post-pager-title">${escapeHtml(smartQuotes(newer.title))}</span></a>` : ''}
</nav>`
      : '';

  const pageNodes = [
    {
      '@type': 'WebPage',
      '@id': `${postUrl}#webpage`,
      url: postUrl,
      name: post.title,
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: post.description,
      breadcrumb: { '@id': `${postUrl}#breadcrumb` },
    },
    {
      '@type': ['TechArticle', 'BlogPosting'],
      '@id': `${postUrl}#article`,
      url: postUrl,
      mainEntityOfPage: { '@id': `${postUrl}#webpage` },
      isPartOf: { '@id': `${siteUrl}/writing/#blog` },
      headline: post.title,
      description: post.description,
      inLanguage: 'en-US',
      datePublished: isoPublished,
      dateModified: isoPublished,
      author: { '@id': `${siteUrl}/#person` },
      publisher: { '@id': `${siteUrl}/#person` },
      articleSection: metaConfig.section,
      keywords: metaConfig.keywords,
      about: metaConfig.about,
      image: {
        '@type': 'ImageObject',
        '@id': `${postUrl}#article-image`,
        url: shareImgUrl,
        width: 1200,
        height: 630,
        caption: `${post.title} — ${site.name}`,
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${postUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/writing/` },
        { '@type': 'ListItem', position: 3, name: post.title, item: postUrl },
      ],
    },
  ];

  const renderedBody = renderMarkdown(post.content, { depth: 2 });

  return {
    title: metaConfig.shortTitle || post.title,
    description: post.description,
    canonicalPath: `/writing/${post.slug}/`,
    currentPath: `/writing/${post.slug}/`,
    depth: 2,
    ogType: 'article',
    ogImageUrl: shareImgUrl,
    publishedTime: post.date,
    pageSchemaNodes: pageNodes,
    mainHtml: `<article class="post-page">
  <div class="reading-progress" aria-hidden="true"><span class="reading-progress-indicator"></span></div>
  <header class="post-header">
    <time class="post-date" datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time>
    <h1 class="post-title">${escapeHtml(smartQuotes(post.title))}</h1>
    <p class="post-description">${escapeHtml(smartQuotes(post.description))}</p>
  </header>
  <div class="post-content prose">${renderedBody}</div>
</article>
${pagerHtml}`,
  };
}

function buildSpeakingPage(site, speaking) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const pageUrl = `${siteUrl}/speaking/`;
  const appearances = speaking.appearances || [];

  const rows = appearances
    .map(
      (a) => `<li>
  <a class="project-entry" href="${escapeHtml(a.link)}" target="_blank" rel="noopener noreferrer">
    <div class="project-entry-meta">
      <span class="project-dates"><time datetime="${escapeHtml(a.date)}">${escapeHtml(formatMonthYear(a.date))}</time></span>
      <span class="project-entry-role">${escapeHtml(a.format)}</span>
      <span class="project-entry-role">${escapeHtml(a.place)}</span>
    </div>
    <div class="project-entry-body">
      <h3 class="project-entry-title">${escapeHtml(smartQuotes(a.title))}<span class="project-entry-external" aria-hidden="true">↗</span></h3>
      <p class="project-entry-desc">${escapeHtml(smartQuotes(a.desc))}</p>
      <span class="sr-only"> (opens in a new tab)</span>
    </div>
  </a>
</li>`,
    )
    .join('\n');

  const pageNodes = [
    {
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: 'Speaking',
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: speaking.description,
      breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      about: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Speaking', item: pageUrl },
      ],
    },
  ];

  const collabHtml = renderInlineMarkdown(speaking.collaborationText || '', { depth: 1 });

  return {
    title: 'Speaking, Hackathons & Tech Demos',
    description: speaking.description,
    canonicalPath: '/speaking/',
    currentPath: '/speaking/',
    depth: 1,
    pageSchemaNodes: pageNodes,
    mainHtml: `<div class="projects-page">
  <header class="projects-header">
    <h1 class="page-title">Speaking</h1>
    <p class="page-subtitle page-prose">${escapeHtml(smartQuotes(speaking.subtitle))}</p>
  </header>
  <section class="projects-group" aria-labelledby="speaking-public">
    <div class="section-header"><h2 id="speaking-public" class="section-heading">Presentations &amp; Pitches</h2></div>
    <ol class="projects-register">${rows}</ol>
  </section>
  <section class="projects-group" aria-labelledby="speaking-private">
    <div class="section-header"><h2 id="speaking-private" class="section-heading">${escapeHtml(speaking.collaborationTitle || 'Collaborations & Events')}</h2></div>
    <p class="page-prose">${collabHtml}</p>
  </section>
</div>`,
  };
}

function buildStatsPage(site, repoCounts, lineCount) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const statsUrl = `${siteUrl}/stats/`;
  const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.2421897;
  const nowMs = Date.now();
  const birthMs = Date.parse(site.birthDate);
  const initialAge = ((nowMs - birthMs) / MS_PER_YEAR).toFixed(2);
  const utcDay = new Date(nowMs).toISOString().slice(0, 10);
  const fmtCount = (k) =>
    `${Number(repoCounts[k]).toLocaleString('en-US')}${repoCounts.fetched ? '' : '+'}`;
  const repoUrl = `https://github.com/${site.sourceRepository || 'itsthemaverick/personal-site'}`;

  const renderTable = (rows) => `<div class="stat-table-frame">
  <table class="stat-table" role="table">
    <thead class="sr-only" role="rowgroup">
      <tr role="row"><th scope="col" role="columnheader">Statistic</th><th scope="col" role="columnheader">Value</th></tr>
    </thead>
    <tbody role="rowgroup">
      ${rows
        .map((r) => {
          const valCls = r.breakable ? 'stat-table-value stat-table-value--long' : 'stat-table-value';
          const cellContent = r.link
            ? `<a class="stat-table-link" href="${escapeHtml(r.link)}" target="_blank" rel="noopener noreferrer">${r.valueHtml}</a>`
            : r.valueHtml;
          return `<tr role="row"><th scope="row" role="rowheader" class="stat-table-label">${escapeHtml(r.label)}</th><td role="cell" class="${valCls}">${cellContent}</td></tr>`;
        })
        .join('')}
    </tbody>
  </table>
</div>`;

  const ageValueHtml = `<span data-live-age data-birth-date="${escapeHtml(site.birthDate)}" data-precision="11">
    <span class="stat-readout-value" style="--readout-width: 14ch">${escapeHtml(initialAge)}</span>
    <span class="stat-readout-note">as of ${escapeHtml(utcDay)}</span>
  </span>`;

  const personalRows = [
    { label: 'Current age', valueHtml: ageValueHtml },
    {
      label: 'Countries visited',
      valueHtml: escapeHtml(String(site.countriesVisited ?? 1)),
      link: 'https://www.google.com/maps/d/embed?mid=1iBBTscqateQ93pWFVfHCUZXoDu8&z=2',
    },
    { label: 'Current city', valueHtml: escapeHtml(site.currentCity) },
  ];

  const siteRows = [
    { label: 'GitHub stars', valueHtml: escapeHtml(fmtCount('stargazers_count')), link: repoUrl },
    { label: 'Watchers', valueHtml: escapeHtml(fmtCount('subscribers_count')), link: repoUrl },
    { label: 'Forks', valueHtml: escapeHtml(fmtCount('forks')), link: `${repoUrl}/network` },
    {
      label: 'Lines of code powering this site',
      valueHtml: escapeHtml(lineCount.toLocaleString('en-US')),
      link: repoUrl,
    },
    { label: 'Number of spoons', valueHtml: '0' },
  ];

  const pageNodes = [
    {
      '@type': 'WebPage',
      '@id': `${statsUrl}#webpage`,
      url: statsUrl,
      name: 'Stats',
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: `Live codebase metrics, repository counts, and static architecture statistics for ${site.name}'s portfolio and open-source projects.`,
      breadcrumb: { '@id': `${statsUrl}#breadcrumb` },
      about: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${statsUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Stats', item: statsUrl },
      ],
    },
  ];

  return {
    title: 'Codebase & Architecture Statistics',
    description: `Live codebase metrics, repository counts, and static architecture statistics for ${site.name}'s portfolio and open-source projects.`,
    canonicalPath: '/stats/',
    currentPath: '/stats/',
    depth: 1,
    pageSchemaNodes: pageNodes,
    mainHtml: `<section class="stats-page">
  <header class="stats-header">
    <h1 class="page-title">Stats</h1>
    <p class="stats-subtitle">Some fun numbers</p>
  </header>
  <div class="stats-content">
    <section aria-labelledby="stats-about-me">
      <div class="section-header"><h2 id="stats-about-me" class="section-heading">About me</h2></div>
      ${renderTable(personalRows)}
    </section>
    <section aria-labelledby="stats-this-site">
      <div class="section-header"><h2 id="stats-this-site" class="section-heading">This site</h2></div>
      ${renderTable(siteRows)}
    </section>
  </div>
</section>`,
  };
}

function buildContactPage(site, contact) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const contactUrl = `${siteUrl}/contact/`;
  const email = String(site.email);
  const [localPart, domain] = email.split('@');
  const domainParts = domain
    .split('.')
    .map((part, idx) => (idx > 0 ? `<wbr>.${escapeHtml(part)}` : escapeHtml(part)))
    .join('');

  const pageNodes = [
    {
      '@type': 'ContactPage',
      '@id': `${contactUrl}#contactpage`,
      url: contactUrl,
      name: 'Contact',
      isPartOf: { '@id': `${siteUrl}/#website` },
      inLanguage: 'en-US',
      description: contact.description || `Get in touch with ${site.name} for AI & ML engineering collaborations, research opportunities, or technical inquiries.`,
      breadcrumb: { '@id': `${contactUrl}#breadcrumb` },
      mainEntity: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${contactUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Contact', item: contactUrl },
      ],
    },
  ];

  return {
    title: 'Contact - Engineering Collaboration',
    description: contact.description || `Get in touch with ${site.name} for AI & ML engineering collaborations, research opportunities, or technical inquiries.`,
    canonicalPath: '/contact/',
    currentPath: '/contact/',
    depth: 1,
    hideFooter: true,
    pageSchemaNodes: pageNodes,
    mainHtml: `<section class="contact-page">
  <h1 class="page-title">${escapeHtml(contact.heading || 'Get in touch')}</h1>
  <div class="contact-email-container" data-email-typer data-local-part="${escapeHtml(localPart)}">
    <a href="mailto:${escapeHtml(email)}" class="contact-email-link">
      <span class="sr-only">Email ${escapeHtml(email)}</span>
      <span class="contact-email-prefix" aria-hidden="true"><span dir="ltr">${escapeHtml(localPart)}</span></span>
      <span class="contact-email-domain" aria-hidden="true">@${domainParts}</span>
    </a>
  </div>
  <p class="contact-hint page-prose">${escapeHtml(contact.hint)}</p>
  ${renderContactIcons(site, { includeEmail: false, labelled: true })}
</section>`,
  };
}

function buildNotFoundPage() {
  return {
    title: 'Page not found',
    description: 'The page you are looking for could not be found.',
    canonicalPath: null,
    currentPath: '/404/',
    depth: null,
    noindex: true,
    hideShellNav: false,
    mainTagOverride: true,
    mainHtml: `<main id="main-content" tabindex="-1" class="not-found-page">
  <div class="not-found-content">
    <span class="not-found-code">404</span>
    <h1 class="not-found-title">Page not found</h1>
    <p class="not-found-message">The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.</p>
    <div class="not-found-actions">
      <a href="${escapeHtml(hrefFor(null, '/'))}" class="button">Go home</a>
      <a href="${escapeHtml(hrefFor(null, '/contact/'))}" class="button button-secondary">Contact me</a>
    </div>
  </div>
</main>`,
  };
}

/* ==========================================================================
   Machine Artifacts: feed.xml, resume.json, sitemap.xml
   ========================================================================== */

function buildFeedXml(site, allBlogItems) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const desc = 'Articles on AI, machine learning, neural architectures, and software engineering.';
  const dated = allBlogItems
    .filter((i) => i.date)
    .map((i) => ({ ...i, absUrl: i.isExternal ? i.url : `${siteUrl}${i.url}` }));

  const lastBuildDate = dated[0]?.date
    ? new Date(`${dated[0].date}T12:00:00Z`).toUTCString()
    : new Date(0).toUTCString();

  const itemsXml = dated
    .map(
      (i) => `
    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${escapeXml(i.absUrl)}</link>
      <description>${escapeXml(i.description)}</description>
      <pubDate>${new Date(`${i.date}T12:00:00Z`).toUTCString()}</pubDate>
      <guid isPermaLink="true">${escapeXml(i.absUrl)}</guid>
    </item>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)} - Blog</title>
    <link>${escapeXml(siteUrl)}/writing/</link>
    <description>${escapeXml(desc)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(siteUrl)}/feed.xml" rel="self" type="application/rss+xml"/>${itemsXml}
  </channel>
</rss>\n`;
}

function buildResumeJson(site, resume) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const toPlain = (v) =>
    String(v)
      .replace(/<\/?a(?:\s[^>]*)?>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

  const [city, region] = String(site.currentCity)
    .split(',')
    .map((p) => p.trim());

  const profiles = (site.profiles || [])
    .filter((p) => p.id !== 'email')
    .map((p) => {
      const u = new URL(p.url);
      return {
        network: p.label,
        username: u.pathname.split('/').filter(Boolean).pop() || '',
        url: p.url,
      };
    });

  const work = sortPositions(resume.work || []).map((p) => ({
    name: p.name,
    position: p.position,
    url: p.url,
    startDate: p.startDate,
    ...(p.endDate ? { endDate: p.endDate } : {}),
    ...(p.summary ? { summary: toPlain(p.summary) } : {}),
    ...(p.highlights ? { highlights: p.highlights.map(toPlain) } : {}),
  }));

  const education = (resume.degrees || []).map((deg) => {
    const m = String(deg.degree).match(/^((?:[A-Z]\.){2,3})\s+(.+)$/);
    const split = m ? { studyType: m[1], area: m[2] } : { area: deg.degree };
    const schoolCourses = (resume.courses || [])
      .filter((c) => c.university === deg.school)
      .map((c) => `${c.number} - ${c.title}`);
    return {
      institution: deg.school,
      url: deg.link,
      ...split,
      endDate: String(deg.year),
      ...(schoolCourses.length > 0 ? { courses: schoolCourses } : {}),
    };
  });

  const skills = groupSkills(resume.skills || []).map((g) => ({
    name: g.name,
    keywords: g.skills.map((s) => s.title),
  }));

  return `${JSON.stringify(
    {
      $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
      basics: {
        name: site.name,
        label: site.role,
        image: `${siteUrl}/images/me.jpg`,
        email: site.email,
        url: `${siteUrl}/`,
        summary: site.siteDescription,
        location: { city, ...(region ? { region } : {}) },
        profiles,
      },
      work,
      education,
      skills,
      meta: { canonical: `${siteUrl}/resume.json` },
    },
    null,
    2,
  )}\n`;
}

function buildSitemapXml(site, localPosts) {
  const siteUrl = String(site.siteUrl).replace(/\/$/, '');
  const hints = {
    '/': { changefreq: 'monthly', priority: '1.0' },
    '/about/': { changefreq: 'monthly', priority: '0.8' },
    '/resume/': { changefreq: 'monthly', priority: '0.8' },
    '/projects/': { changefreq: 'weekly', priority: '0.9' },
    '/writing/': { changefreq: 'weekly', priority: '0.9' },
    '/speaking/': { changefreq: 'monthly', priority: '0.7' },
    '/stats/': { changefreq: 'weekly', priority: '0.5' },
    '/contact/': { changefreq: 'yearly', priority: '0.6' },
  };
  const routePaths = ['/', '/about/', '/resume/', '/projects/', '/writing/', '/speaking/', '/stats/', '/contact/'];
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...routePaths.map((p) => {
      const h = hints[p] || { changefreq: 'monthly', priority: '0.8' };
      return `<url><loc>${escapeXml(`${siteUrl}${p}`)}</loc><lastmod>${today}</lastmod><changefreq>${h.changefreq}</changefreq><priority>${h.priority}</priority></url>`;
    }),
    ...localPosts.map(
      (post) =>
        `<url><loc>${escapeXml(`${siteUrl}${post.url}`)}</loc><lastmod>${escapeXml(post.date)}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.join('\n  ')}
</urlset>\n`;
}

function buildRobotsTxt(siteUrl) {
  return `# Universal Search Engine & AI Crawler Policy
# Designed for maximum visibility in traditional search and AI answer engines

User-agent: *
Allow: /
Disallow: /private/
Disallow: /api/internal/

# AI Search & Retrieval Crawlers (SearchGPT, Perplexity, Claude, Gemini, Copilot)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Cohere-ai
Allow: /

# Sitemap and LLM Metadata
Sitemap: ${siteUrl}/sitemap.xml
`;
}

function buildLlmsTxt(site, allBlogItems, projects) {
  const siteUrl = String(site.siteUrl || 'https://itsthemaverick.github.io').replace(/\/$/, '');

  return `# ${site.name} | AI & ML Engineer

> Machine learning engineer and B.Tech researcher specializing in neural architectures from scratch in C, agentic AI workflows, and AI red teaming.

${site.name} is an AI & Machine Learning Engineer focused on Neural Architectures, AI Red Teaming & Security, and Agentic AI Workflows. This document provides a machine-readable directory for Large Language Models and AI search agents to understand and navigate the site's primary resources and research.

## Core Entities & Identity
- Name: ${site.name}
- Role/Focus: ${site.role}
- Canonical URL: ${siteUrl}
- Key Topics: Artificial Intelligence, Neural Networks in C, AI Red Teaming, Prompt Injection Defense, Agentic Workflows, Machine Learning
- Affiliation: SprougHub Foundation (Project Lead / SDE & ML Intern), DevKraft (Research Intern), Dr. D. Y. Patil Institute of Technology
- Contact & Verification: ${site.email} | https://github.com/itsthemaverick | https://www.linkedin.com/in/yashraj-bhogade

## Essential Pages
- [/about/](${siteUrl}/about/): Background, credentials, professional timeline, and engineering philosophy.
- [/resume/](${siteUrl}/resume/): Formal experience, technical competencies, patent application, and education.
- [/projects/](${siteUrl}/projects/): Production software, open-source repositories, benchmarks, and architectures.
- [/writing/](${siteUrl}/writing/): Deep-dive technical articles, tutorials, and security write-ups.
- [/speaking/](${siteUrl}/speaking/): Hackathon achievements, project pitches, and technical presentations.
- [/contact/](${siteUrl}/contact/): Direct contact details and secure communications.

## Featured Technical Articles & Research
- [Building a Neural Network from Scratch in C](${siteUrl}/writing/building-a-neural-network-from-scratch-in-c/): Low-level implementation of multi-layer perceptron neural networks in ANSI C with zero external ML libraries, achieving 0.12ms single-sample latency and 7.8x speedup over CPU Python.
- [AI Red Teaming: Turning Adversarial Chaos into a Repeatable Playbook](${siteUrl}/writing/ai-red-teaming-systematic-adversarial-testing/): Systematic multi-turn adversarial testing, Crescendo escalation attacks, and automated evaluation regression gates reducing attack success rates from 92.3% to 2.4%.
- [Prompt Injection: Inside the Broken Trust Boundary](${siteUrl}/writing/prompt-injection-breaking-the-trust-boundary/): Architectural analysis of why control and data planes collapse in transformer attention layers, direct vs. indirect RAG poisoning, and structural taint tracking defenses.
- [Why I Chose Parrot OS Over Omarchy for Security & Systems Work](${siteUrl}/writing/why-i-chose-parrot-os-over-omarchy/): Comparative evaluation of Parrot Security OS vs Omarchy across kernel isolation, AppArmor/Firejail sandboxing, and adversarial binary analysis.
- [Patent: Proof-Based Task Validation in Collaborative Environments](https://dypvp.edu.in): Co-inventor of patent application for proof-based task validation and adaptive contribution mechanisms with Prof. Prajakta P. Pawar.

## Key Open-Source Projects & Software
- [Neural Network from Scratch in C](https://github.com/itsthemaverick/neural-network-in-c): Pure ANSI C feedforward neural network with manual forward propagation, backpropagation, and cache-optimized contiguous memory layouts.
- [Deepreach (DevKraft)](https://devkraft.in): Agentic AI workflow system with structured guardrails and prompt engineering for autonomous company discovery and research.
- [Project JHEP (SprougHub Foundation)](https://github.com/itsthemaverick): AI-powered Learning Management System developed by a 10-member engineering team led by Yashraj Bhogade.
- [Credit Card Fraud Detection](https://github.com/itsthemaverick/fraud-detection): Comparative anomaly detection benchmarking Random Forest vs. Isolation Forest models with precision/recall tradeoffs.
- [Malware Detection](https://github.com/itsthemaverick/malware-detection): Natural language processing pipeline classifying malicious code patterns using TF-IDF feature extraction and Logistic Regression.
- [Signal-to-Strategy](https://github.com/itsthemaverick/signal-to-strategy): Supervised predictive modeling pipeline forecasting user behavior patterns to drive automated strategic interventions.

## Full Context Archive
- An exhaustive, unabridged text compilation of all articles, project documentation, and technical notes is available at ${siteUrl}/llms-full.txt
`;
}

function buildLlmsFullTxt(site, resume, aboutDoc, allBlogItems, localPosts, projects, speaking) {
  const siteUrl = String(site.siteUrl || 'https://itsthemaverick.github.io').replace(/\/$/, '');
  const lines = [];

  lines.push(`# ${site.name} — Full Technical Knowledge Base & LLM Context Archive\n`);
  lines.push(`> Canonical URL: ${siteUrl}`);
  lines.push(`> Role: ${site.role}`);
  lines.push(`> Description: ${site.siteDescription}`);
  lines.push(`> Current City: ${site.currentCity}`);
  lines.push(`> Contact Email: ${site.email}`);
  lines.push(`> Source Repository: https://github.com/${site.sourceRepository || 'itsthemaverick/personal-site'}\n`);

  lines.push(`## 1. Biography & Professional Summary\n`);
  lines.push(site.heroSummary);
  lines.push(`\n${aboutDoc.body.trim().replace(/^# Intro\s*/, '')}\n`);

  lines.push(`## 2. Technical Resume & Experience\n`);
  lines.push(`### Summary`);
  lines.push(resume.summary);
  lines.push(`\n### Professional Work Experience`);
  for (const job of resume.work || []) {
    lines.push(`- **${job.position}** at [${job.name}](${job.url}) (${job.startDate} to ${job.endDate || 'Present'})`);
    if (job.summary) lines.push(`  - Summary: ${job.summary}`);
    for (const h of job.highlights || []) {
      lines.push(`  - Highlight: ${h}`);
    }
  }

  lines.push(`\n### Education & Degrees`);
  for (const deg of resume.degrees || []) {
    lines.push(`- **${deg.degree}** in ${deg.field} — [${deg.school}](${deg.link}) (${deg.startDate} - ${deg.endDate || 'Present'})`);
  }

  lines.push(`\n### Technical Skills & Competencies`);
  for (const skill of resume.skills || []) {
    lines.push(`- **${skill.title}**: ${skill.competencies ? skill.competencies.join(', ') : ''}`);
  }

  lines.push(`\n### Selected University Coursework`);
  for (const course of resume.courses || []) {
    lines.push(`- ${course.number}: ${course.title} (${course.university})`);
  }

  lines.push(`\n## 3. Curated Open-Source Projects & Software\n`);
  for (const p of projects) {
    lines.push(`### ${p.title} (${p.status || 'Active'})`);
    if (p.subtitle) lines.push(`*Subtitle:* ${p.subtitle}`);
    if (p.link) lines.push(`*Link:* ${p.link}`);
    if (p.sourceRepository) lines.push(`*Code Repository:* ${p.sourceRepository}`);
    if (p.tech) lines.push(`*Technologies:* ${p.tech.join(', ')}`);
    if (p.body) lines.push(`\n${p.body.trim()}\n`);
  }

  lines.push(`\n## 4. Speaking, Competitions & Hackathons\n`);
  for (const s of speaking.appearances || []) {
    lines.push(`- **${s.title}** (${s.format}, ${s.date}, ${s.place}): ${s.desc}`);
    if (s.link) lines.push(`  Link: ${s.link}`);
  }

  lines.push(`\n## 5. Unabridged Technical Articles & Publications\n`);
  for (const post of localPosts) {
    lines.push(`---\n`);
    lines.push(`### Article: ${post.title}`);
    lines.push(`- **Canonical URL:** ${siteUrl}/writing/${post.slug}/`);
    lines.push(`- **Publication Date:** ${post.date}`);
    lines.push(`- **Description:** ${post.description}\n`);
    lines.push(post.content.trim());
    lines.push(`\n`);
  }

  return lines.join('\n');
}

/* ==========================================================================
   Asset Copying & CSS Bundling
   ========================================================================== */

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function bundleCss() {
  const order = [
    'fonts.css',
    'preflight.css',
    'tokens.css',
    'base.css',
    'components.css',
    'layout.css',
    'pages/home.css',
    'pages/about.css',
    'pages/resume.css',
    'pages/projects.css',
    'pages/writing.css',
    'pages/stats.css',
    'pages/contact.css',
    'pages/not-found.css',
    'modes.css',
  ];
  const combined = order
    .map((rel) => {
      const full = path.join(CSS_DIR, rel);
      if (!fs.existsSync(full)) throw new Error(`Missing stylesheet: ${full}`);
      return `/* === ${rel} === */\n${fs.readFileSync(full, 'utf8')}`;
    })
    .join('\n\n');
  const outCss = path.join(DIST_DIR, 'assets', 'css', 'styles.css');
  fs.mkdirSync(path.dirname(outCss), { recursive: true });
  fs.writeFileSync(outCss, combined, 'utf8');
}

function writeOut(relPath, content) {
  const full = path.join(DIST_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

/* ==========================================================================
   Main Build Pipeline
   ========================================================================== */

async function main() {
  const started = Date.now();
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 1. Load Markdown CMS
  const site = loadSiteContent();
  const aboutDoc = loadAboutContent();
  const resume = loadResumeContent();
  const speaking = loadSpeakingContent();
  const contact = loadContactContent();
  const projects = loadProjectsContent();
  const { localPosts, allItems: allBlogItems } = loadBlogContent();
  const chromeColors = readThemeColorToken();
  const siteSchemaNodes = buildSiteSchemaNodes(site, resume);

  // 2. Copy static assets & compile CSS/JS
  bundleCss();
  copyRecursive(JS_DIR, path.join(DIST_DIR, 'assets', 'js'));
  copyRecursive(path.join(ASSETS_DIR, 'fonts'), path.join(DIST_DIR, 'assets', 'fonts'));
  copyRecursive(path.join(ASSETS_DIR, 'images'), path.join(DIST_DIR, 'images'));
  copyRecursive(path.join(ASSETS_DIR, 'og'), path.join(DIST_DIR, 'og'));
  for (const rootFile of ['favicon.ico', 'icon.png', 'apple-icon.png', 'og.png', 'manifest.json']) {
    const srcFile = path.join(ASSETS_DIR, rootFile);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(DIST_DIR, rootFile));
    }
  }

  // 3. Fetch live GitHub data for build-time snapshots (with clean fallback)
  const [initialProjectsPayload, statsRepoCounts] = await Promise.all([
    buildInitialProjectsPayload(site, projects),
    fetchStatsRepoCounts(site.sourceRepository || 'itsthemaverick/personal-site'),
  ]);
  const lineCount = countSourceLines();

  // 4. Generate all HTML pages
  const common = { site, resume, chromeColors, siteSchemaNodes };
  writeOut('index.html', renderDocument({ ...common, ...buildHomePage(site, allBlogItems) }));
  writeOut('about/index.html', renderDocument({ ...common, ...buildAboutPage(site, aboutDoc) }));
  writeOut('resume/index.html', renderDocument({ ...common, ...buildResumePage(site, resume) }));
  writeOut(
    'projects/index.html',
    renderDocument({ ...common, ...buildProjectsPage(site, projects, initialProjectsPayload) }),
  );
  writeOut('writing/index.html', renderDocument({ ...common, ...buildBlogIndexPage(site, allBlogItems) }));
  for (let i = 0; i < localPosts.length; i += 1) {
    const post = localPosts[i];
    writeOut(
      `writing/${post.slug}/index.html`,
      renderDocument({ ...common, ...buildBlogPostPage(site, post, localPosts, i) }),
    );
  }
  writeOut('speaking/index.html', renderDocument({ ...common, ...buildSpeakingPage(site, speaking) }));
  writeOut('stats/index.html', renderDocument({ ...common, ...buildStatsPage(site, statsRepoCounts, lineCount) }));
  writeOut('contact/index.html', renderDocument({ ...common, ...buildContactPage(site, contact) }));
  writeOut('404.html', renderDocument({ ...common, ...buildNotFoundPage() }));

  // 5. Feeds, JSON Resume, Sitemap, Robots, LLM discovery
  writeOut('feed.xml', buildFeedXml(site, allBlogItems));
  writeOut('resume.json', buildResumeJson(site, resume));
  writeOut('sitemap.xml', buildSitemapXml(site, localPosts));
  const siteUrl = String(site.siteUrl || 'https://itsthemaverick.github.io').replace(/\/$/, '');
  writeOut('robots.txt', buildRobotsTxt(siteUrl));
  writeOut('llms.txt', buildLlmsTxt(site, allBlogItems, projects));
  writeOut('llms-full.txt', buildLlmsFullTxt(site, resume, aboutDoc, allBlogItems, localPosts, projects, speaking));

  const elapsed = Date.now() - started;
  console.log(
    `Built static site into ${DIST_DIR} (${localPosts.length} blog posts, ${projects.length} curated projects, GitHub source=${initialProjectsPayload.source}, basePath="${basePath || '/'}") in ${elapsed}ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
