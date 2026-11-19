/**
 * Live GitHub Projects Client (Pure Browser ES6)
 * Reads baked build-time initial snapshot from <script id="gh-initial-data">,
 * upgrades via direct public GitHub REST API calls + sessionStorage caching,
 * and powers search, scope filters, language breakdown, sort, README inspection,
 * auto-sync, and clone URL copying with zero React dependencies.
 */

const GITHUB_USERNAME = 'itsthemaverick';
const GITHUB_PROFILE_URL = `https://github.com/${GITHUB_USERNAME}`;
const CACHE_KEY = `gh_projects_v1_${GITHUB_USERNAME}`;
const README_CACHE_PREFIX = `gh_readme_v1_${GITHUB_USERNAME}_`;
const CACHE_TTL_MS = 3 * 60 * 1000;
const README_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTO_SYNC_INTERVAL_MS = 60_000;
const ACTIVE_WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatMonthYear(dateString) {
  if (!dateString) return '';
  const match = String(dateString).match(/^(\d{4})-(\d{2})/);
  if (!match) return dateString;
  const year = match[1];
  const monthIdx = Number.parseInt(match[2], 10) - 1;
  return `${MONTHS[monthIdx] || match[2]} ${year}`;
}

function smartQuotes(text) {
  if (!text) return '';
  return String(text)
    .replace(/(^|[-\u2014\s(\[{"])'/g, '$1\u2018')
    .replace(/'/g, '\u2019')
    .replace(/(^|[-\u2014\s(\[{])"/g, '$1\u201c')
    .replace(/"/g, '\u201d')
    .replace(/--/g, '\u2014');
}

function formatRelativeTime(isoDate, nowMs) {
  const targetMs = Date.parse(isoDate);
  if (Number.isNaN(targetMs)) return isoDate;
  const diffSec = Math.max(0, Math.floor((nowMs - targetMs) / 1000));
  if (diffSec < 45) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

function formatSizeKb(sizeKb) {
  if (!sizeKb || sizeKb <= 0) return '—';
  if (sizeKb < 1024) return `${sizeKb} KB`;
  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

function humanizeRepoName(name) {
  const cleaned = String(name)
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || name;
}

function normalizeHomepage(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function languageColor(language) {
  if (!language) return '#74747c';
  return LANGUAGE_COLORS[language] || '#74747c';
}

function computeLanguageStats(repos) {
  const counts = new Map();
  let totalWithLang = 0;
  for (const repo of repos) {
    if (!repo.language) continue;
    totalWithLang += 1;
    counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  }
  if (totalWithLang === 0) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([language, count]) => ({
      language,
      count,
      percentage: Math.round((count / totalWithLang) * 1000) / 10,
      color: languageColor(language),
    }));
}

function formatEventSummary(event) {
  const fullRepo = event?.repo?.name;
  if (!fullRepo) return null;
  const shortRepo = fullRepo.replace(`${GITHUB_USERNAME}/`, '');
  const repoUrl = `https://github.com/${fullRepo}`;

  switch (event.type) {
    case 'PushEvent': {
      const commitCount =
        event.payload?.size ?? event.payload?.commits?.length ?? 1;
      const branch = event.payload?.ref?.replace('refs/heads/', '');
      return {
        id: event.id,
        type: event.type,
        label: 'Push',
        repoName: shortRepo,
        repoUrl,
        createdAt: event.created_at,
        detail: `${commitCount} ${commitCount === 1 ? 'commit' : 'commits'}${branch ? ` to ${branch}` : ''}`,
      };
    }
    case 'PullRequestEvent': {
      const action = event.payload?.action || 'updated';
      const prNum = event.payload?.pull_request?.number;
      return {
        id: event.id,
        type: event.type,
        label: 'Pull Request',
        repoName: shortRepo,
        repoUrl,
        createdAt: event.created_at,
        detail: prNum ? `${action} #${prNum}` : action,
      };
    }
    case 'CreateEvent': {
      const refType = event.payload?.ref_type || 'repository';
      const ref = event.payload?.ref;
      return {
        id: event.id,
        type: event.type,
        label: 'Created',
        repoName: shortRepo,
        repoUrl,
        createdAt: event.created_at,
        detail: ref ? `${refType} ${ref}` : refType,
      };
    }
    case 'ReleaseEvent':
      return {
        id: event.id,
        type: event.type,
        label: 'Release',
        repoName: shortRepo,
        repoUrl,
        createdAt: event.created_at,
        detail: event.payload?.action || 'published',
      };
    case 'WatchEvent':
      return {
        id: event.id,
        type: event.type,
        label: 'Starred',
        repoName: shortRepo,
        repoUrl,
        createdAt: event.created_at,
        detail: null,
      };
    case 'ForkEvent':
      return {
        id: event.id,
        type: event.type,
        label: 'Forked',
        repoName: shortRepo,
        repoUrl,
        createdAt: event.created_at,
        detail: null,
      };
    default:
      return {
        id: event.id,
        type: event.type,
        label: String(event.type || '').replace(/Event$/, ''),
        repoName: shortRepo,
        repoUrl,
        createdAt: event.created_at,
        detail: event.payload?.action || null,
      };
  }
}

function normalizeGitHubRepos(rawRepos, nowMs) {
  return rawRepos
    .filter((repo) => !repo.private)
    .map((repo) => {
      const pushedAt = repo.pushed_at || repo.updated_at || repo.created_at;
      const rawLicense = repo.license?.spdx_id;
      const license =
        rawLicense && rawLicense !== 'NOASSERTION' ? rawLicense : null;
      const pushedMs = Date.parse(pushedAt);
      const isRecent =
        !Number.isNaN(pushedMs) &&
        nowMs - pushedMs <= ACTIVE_WINDOW_DAYS * DAY_MS;

      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        displayTitle: humanizeRepoName(repo.name),
        description: repo.description?.trim() ? repo.description.trim() : null,
        htmlUrl: repo.html_url,
        homepage: normalizeHomepage(repo.homepage),
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
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'className') {
      node.className = v;
    } else if (k === 'textContent') {
      node.textContent = v;
    } else {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function sourceLabel(payload) {
  if (payload.source === 'fallback') return 'Curated fallback';
  if (payload.source === 'cache') return 'Cached GitHub sync';
  return 'Live GitHub stream';
}

function readCache() {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.expiresAt > Date.now() && parsed.payload) {
      return { ...parsed.payload, source: 'cache' };
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

function writeCache(payload) {
  try {
    window.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ expiresAt: Date.now() + CACHE_TTL_MS, payload }),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function initProjects() {
  const shell = document.querySelector('.gh-projects-shell[data-gh-projects]');
  const dataScript = document.getElementById('gh-initial-data');
  if (!shell || !dataScript) return;

  let initial;
  try {
    initial = JSON.parse(dataScript.textContent || '{}');
  } catch {
    return;
  }

  let payload = initial.payload;
  const organizationProjects = initial.organizationProjects || [];
  let syncing = false;
  let autoSync = false;
  let autoSyncTimer = 0;
  let nowMs = Date.now();
  let activityExpanded = true;
  let query = '';
  let scope = 'all';
  let selectedLanguage = 'all';
  let sortBy = 'pushed';
  let copiedRepoId = null;
  let expandedReadmeRepo = null;
  const readmeMap = {};

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const getFilteredRepos = () => {
    const normalizedQuery = query.trim().toLowerCase();
    const matched = (payload.repos || []).filter((repo) => {
      if (scope === 'active' && !repo.isActive) return false;
      if (scope === 'starred' && repo.stargazersCount === 0) return false;
      if (scope === 'documented' && !repo.description) return false;
      if (selectedLanguage !== 'all' && repo.language !== selectedLanguage) {
        return false;
      }
      if (normalizedQuery) {
        const haystack = [
          repo.name,
          repo.displayTitle,
          repo.description || '',
          repo.language || '',
          ...(repo.topics || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });

    return [...matched].sort((a, b) => {
      switch (sortBy) {
        case 'stars':
          return (
            b.stargazersCount - a.stargazersCount ||
            Date.parse(b.pushedAt) - Date.parse(a.pushedAt)
          );
        case 'created':
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        case 'size':
          return (
            b.sizeKb - a.sizeKb ||
            Date.parse(b.pushedAt) - Date.parse(a.pushedAt)
          );
        case 'name':
          return a.displayTitle.localeCompare(b.displayTitle);
        default:
          return Date.parse(b.pushedAt) - Date.parse(a.pushedAt);
      }
    });
  };

  async function syncFromGitHub() {
    if (syncing) return;
    syncing = true;
    render();
    try {
      const headers = { Accept: 'application/vnd.github.v3+json' };
      const [userRes, reposRes, eventsRes] = await Promise.all([
        fetch(`https://api.github.com/users/${GITHUB_USERNAME}`, { headers }),
        fetch(
          `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=pushed&per_page=100&type=owner`,
          { headers },
        ),
        fetch(
          `https://api.github.com/users/${GITHUB_USERNAME}/events/public?per_page=20`,
          { headers },
        ).catch(() => null),
      ]);

      const rateLimited =
        userRes.status === 403 ||
        userRes.status === 429 ||
        reposRes.status === 403 ||
        reposRes.status === 429;

      if (!reposRes.ok) {
        throw new Error(
          rateLimited
            ? 'GitHub API rate limit reached; keeping latest synced snapshot.'
            : `GitHub API returned ${reposRes.status}; keeping current snapshot.`,
        );
      }

      const rawRepos = await reposRes.json();
      if (!Array.isArray(rawRepos)) {
        throw new Error('Unexpected GitHub repositories payload.');
      }

      const rawUser = userRes.ok ? await userRes.json() : {};
      let events = [];
      if (eventsRes && eventsRes.ok) {
        const rawEvents = await eventsRes.json();
        if (Array.isArray(rawEvents)) {
          events = rawEvents.map(formatEventSummary).filter(Boolean).slice(0, 8);
        }
      }

      nowMs = Date.now();
      const repos = normalizeGitHubRepos(rawRepos, nowMs);
      const languages = computeLanguageStats(repos);
      const totalStars = repos.reduce((sum, r) => sum + r.stargazersCount, 0);
      const totalForks = repos.reduce((sum, r) => sum + r.forksCount, 0);

      payload = {
        source: 'github',
        rateLimited: false,
        errorMessage: null,
        syncedAt: new Date(nowMs).toISOString(),
        user: {
          login: rawUser.login || GITHUB_USERNAME,
          name: rawUser.name || 'Yashraj Bhogade Patil',
          bio: rawUser.bio ?? null,
          avatarUrl: rawUser.avatar_url || payload.user.avatarUrl,
          htmlUrl: rawUser.html_url || GITHUB_PROFILE_URL,
          publicRepos: rawUser.public_repos ?? repos.length,
          followers: rawUser.followers ?? 0,
          following: rawUser.following ?? 0,
        },
        repos,
        events,
        languages,
        stats: {
          publicRepos: rawUser.public_repos ?? repos.length,
          totalStars,
          totalForks,
          activeRepos: repos.filter((r) => r.isActive).length,
          originalRepos: repos.filter((r) => !r.fork).length,
        },
      };
      writeCache(payload);
    } catch (err) {
      payload = {
        ...payload,
        errorMessage:
          err instanceof Error && err.message
            ? err.message
            : 'Unable to reach GitHub API; keeping current view.',
      };
    } finally {
      syncing = false;
      render();
    }
  }

  async function toggleReadme(repoName) {
    if (expandedReadmeRepo === repoName) {
      expandedReadmeRepo = null;
      render();
      return;
    }
    expandedReadmeRepo = repoName;
    if (readmeMap[repoName]) {
      render();
      return;
    }

    try {
      const cachedRaw = window.sessionStorage.getItem(
        `${README_CACHE_PREFIX}${repoName}`,
      );
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && cached.expiresAt > Date.now()) {
          readmeMap[repoName] = {
            loading: false,
            content: cached.content,
            available: cached.content !== null,
          };
          render();
          return;
        }
      }
    } catch {
      // Ignore cache read error
    }

    readmeMap[repoName] = { loading: true, content: null, available: false };
    render();

    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_USERNAME}/${encodeURIComponent(repoName)}/readme`,
        { headers: { Accept: 'application/vnd.github.raw+json' } },
      );
      if (res.status === 404) {
        readmeMap[repoName] = {
          loading: false,
          content: null,
          available: false,
        };
        try {
          window.sessionStorage.setItem(
            `${README_CACHE_PREFIX}${repoName}`,
            JSON.stringify({
              expiresAt: Date.now() + README_CACHE_TTL_MS,
              content: null,
            }),
          );
        } catch {
          // ignore
        }
      } else if (!res.ok) {
        readmeMap[repoName] = {
          loading: false,
          content: null,
          available: false,
          error: `GitHub API returned ${res.status}`,
        };
      } else {
        const rawText = (await res.text()).trim();
        const excerpt =
          rawText.length > 2200
            ? `${rawText.slice(0, 2200).trimEnd()}\n\n... (truncated — open repository on GitHub for full README)`
            : rawText;
        readmeMap[repoName] = {
          loading: false,
          content: excerpt,
          available: excerpt.length > 0,
        };
        try {
          window.sessionStorage.setItem(
            `${README_CACHE_PREFIX}${repoName}`,
            JSON.stringify({
              expiresAt: Date.now() + README_CACHE_TTL_MS,
              content: excerpt,
            }),
          );
        } catch {
          // ignore
        }
      }
    } catch {
      readmeMap[repoName] = {
        loading: false,
        content: null,
        available: false,
        error: 'Could not load README.',
      };
    }
    render();
  }

  async function copyCloneUrl(repo) {
    try {
      await navigator.clipboard.writeText(repo.cloneUrl);
      copiedRepoId = repo.id;
      render();
      window.setTimeout(() => {
        if (copiedRepoId === repo.id) {
          copiedRepoId = null;
          render();
        }
      }, 2000);
    } catch {
      // Clipboard blocked; fail quietly
    }
  }

  function renderOrgProject(project) {
    const tier =
      project.status === 'archive'
        ? 'archive'
        : project.ongoing
          ? 'live'
          : null;
    const className = tier
      ? `project-entry project-entry--${tier}`
      : 'project-entry';
    const displayTitle = smartQuotes(project.title);

    const dateChildren = [
      el('time', {
        dateTime: project.date,
        textContent: formatMonthYear(project.date),
      }),
    ];
    if (project.ongoing || project.endDate) {
      dateChildren.push(
        el('span', {
          className: 'daterange-sep',
          'aria-hidden': 'true',
          textContent: '–',
        }),
        el('span', { className: 'sr-only', textContent: ' to ' }),
        project.endDate
          ? el('time', {
              dateTime: project.endDate,
              textContent: formatMonthYear(project.endDate),
            })
          : el('span', {
              className: 'daterange-present',
              textContent: 'Present',
            }),
      );
    }

    const bodyChildren = [
      el('div', { className: 'project-entry-meta' }, [
        el('span', { className: 'project-dates' }, dateChildren),
        project.subtitle
          ? el('span', {
              className: 'project-entry-role',
              textContent: smartQuotes(project.subtitle),
            })
          : null,
      ]),
      el('div', { className: 'project-entry-body' }, [
        el('h3', { className: 'project-entry-title' }, [
          displayTitle,
          project.link
            ? el('span', {
                className: 'project-entry-external',
                'aria-hidden': 'true',
                textContent: '↗',
              })
            : null,
        ]),
        el('p', {
          className: 'project-entry-desc',
          textContent: smartQuotes(project.desc),
        }),
        project.tech && project.tech.length > 0
          ? el(
              'div',
              { className: 'project-entry-tech' },
              project.tech.map((t) =>
                el('span', { className: 'tech-tag', textContent: t }),
              ),
            )
          : null,
      ]),
    ];

    if (!project.link) {
      return el('div', { className }, bodyChildren);
    }
    return el(
      'a',
      {
        className,
        href: project.link,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': `${displayTitle} (opens in a new tab)`,
      },
      bodyChildren,
    );
  }

  function render() {
    const activeElId = document.activeElement?.id || null;
    const selStart =
      document.activeElement instanceof HTMLInputElement
        ? document.activeElement.selectionStart
        : null;
    const selEnd =
      document.activeElement instanceof HTMLInputElement
        ? document.activeElement.selectionEnd
        : null;

    const repos = payload.repos || [];
    const scopeCounts = {
      all: repos.length,
      active: repos.filter((r) => r.isActive).length,
      starred: repos.filter((r) => r.stargazersCount > 0).length,
      documented: repos.filter((r) => Boolean(r.description)).length,
    };
    const filteredRepos = getFilteredRepos();

    const sections = [];

    // 1. Live Status Bar
    const autoBtn = el('button', {
      type: 'button',
      className: `gh-toggle-btn ${autoSync ? 'is-active' : ''}`,
      'aria-pressed': String(autoSync),
      textContent: `Auto-sync ${autoSync ? 'on (60s)' : 'off'}`,
    });
    autoBtn.addEventListener('click', () => {
      autoSync = !autoSync;
      window.clearInterval(autoSyncTimer);
      if (autoSync) {
        autoSyncTimer = window.setInterval(() => {
          void syncFromGitHub();
        }, AUTO_SYNC_INTERVAL_MS);
      }
      render();
    });

    const syncBtn = el('button', {
      type: 'button',
      className: 'button button-secondary button-compact gh-sync-btn',
      disabled: syncing,
      textContent: syncing ? 'Syncing…' : 'Sync GitHub',
    });
    syncBtn.addEventListener('click', () => void syncFromGitHub());

    sections.push(
      el(
        'section',
        {
          className: 'gh-live-bar',
          'aria-label': 'GitHub synchronization status',
        },
        [
          el('div', { className: 'gh-live-status' }, [
            el('span', {
              className:
                payload.source === 'fallback' || reducedMotion
                  ? 'gh-pulse-dot gh-pulse-dot--static'
                  : 'gh-pulse-dot',
              'data-live': String(payload.source !== 'fallback'),
              'aria-hidden': 'true',
            }),
            el('span', {
              className: 'gh-live-label',
              textContent: sourceLabel(payload),
            }),
            el('span', {
              className: 'gh-live-sep',
              'aria-hidden': 'true',
              textContent: '·',
            }),
            el('a', {
              href: payload.user.htmlUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'gh-profile-link',
              textContent: `@${payload.user.login} ↗`,
            }),
            el('span', {
              className: 'gh-live-sep',
              'aria-hidden': 'true',
              textContent: '·',
            }),
            el('span', {
              className: 'gh-sync-time',
              textContent: `Synced ${formatRelativeTime(payload.syncedAt, nowMs)}`,
            }),
          ]),
          el('div', { className: 'gh-live-actions' }, [autoBtn, syncBtn]),
        ],
      ),
    );

    if (payload.errorMessage) {
      sections.push(
        el('p', {
          className: 'gh-notice',
          role: 'status',
          textContent: payload.errorMessage,
        }),
      );
    }

    // 2. Metrics Grid
    sections.push(
      el(
        'section',
        {
          className: 'gh-metrics-grid',
          'aria-label': 'GitHub repository metrics',
        },
        [
          el('div', { className: 'gh-metric-card' }, [
            el('span', {
              className: 'gh-metric-label',
              textContent: 'Public repositories',
            }),
            el('strong', {
              className: 'gh-metric-value',
              textContent: String(payload.stats.publicRepos),
            }),
          ]),
          el('div', { className: 'gh-metric-card' }, [
            el('span', {
              className: 'gh-metric-label',
              textContent: 'Active (last 60d)',
            }),
            el('strong', {
              className: 'gh-metric-value gh-metric-value--signal',
              textContent: String(payload.stats.activeRepos),
            }),
          ]),
          el('div', { className: 'gh-metric-card' }, [
            el('span', {
              className: 'gh-metric-label',
              textContent: 'Total stars',
            }),
            el('strong', {
              className: 'gh-metric-value',
              textContent: String(payload.stats.totalStars),
            }),
          ]),
          el('div', { className: 'gh-metric-card' }, [
            el('span', {
              className: 'gh-metric-label',
              textContent: 'Followers',
            }),
            el('strong', {
              className: 'gh-metric-value',
              textContent: String(payload.user.followers),
            }),
          ]),
        ],
      ),
    );

    // 3. Language Distribution
    if (payload.languages && payload.languages.length > 0) {
      let clearLangBtn = null;
      if (selectedLanguage !== 'all') {
        clearLangBtn = el('button', {
          type: 'button',
          className: 'gh-inline-reset',
          textContent: 'Clear language filter',
        });
        clearLangBtn.addEventListener('click', () => {
          selectedLanguage = 'all';
          render();
        });
      }

      const allChip = el('button', {
        type: 'button',
        className: `gh-lang-chip ${selectedLanguage === 'all' ? 'is-active' : ''}`,
        textContent: `All (${repos.length})`,
      });
      allChip.addEventListener('click', () => {
        selectedLanguage = 'all';
        render();
      });

      const langChips = payload.languages.map((lang) => {
        const chip = el(
          'button',
          {
            type: 'button',
            className: `gh-lang-chip ${selectedLanguage === lang.language ? 'is-active' : ''}`,
          },
          [
            el('span', {
              className: 'gh-lang-dot',
              style: `background-color: ${lang.color}`,
              'aria-hidden': 'true',
            }),
            el('span', { textContent: lang.language }),
            el('span', {
              className: 'gh-lang-count',
              textContent: String(lang.count),
            }),
          ],
        );
        chip.addEventListener('click', () => {
          selectedLanguage =
            selectedLanguage === lang.language ? 'all' : lang.language;
          render();
        });
        return chip;
      });

      sections.push(
        el(
          'section',
          {
            className: 'gh-languages-panel',
            'aria-labelledby': 'gh-languages-heading',
          },
          [
            el('div', { className: 'gh-panel-head' }, [
              el('h2', {
                id: 'gh-languages-heading',
                className: 'gh-panel-title',
                textContent: 'Language distribution',
              }),
              clearLangBtn,
            ]),
            el(
              'div',
              {
                className: 'gh-lang-bar',
                role: 'img',
                'aria-label': 'Repository share by primary language',
              },
              payload.languages.map((lang) =>
                el('span', {
                  className: 'gh-lang-segment',
                  style: `width: ${Math.max(lang.percentage, 2)}%; background-color: ${lang.color}`,
                  title: `${lang.language}: ${lang.count} repos (${lang.percentage}%)`,
                }),
              ),
            ),
            el('div', { className: 'gh-lang-filters' }, [
              allChip,
              ...langChips,
            ]),
          ],
        ),
      );
    }

    // 4. Activity Pulse
    if (payload.events && payload.events.length > 0) {
      const pulseBtn = el('button', {
        type: 'button',
        className: 'gh-inline-reset',
        'aria-expanded': String(activityExpanded),
        textContent: activityExpanded ? 'Hide pulse' : 'Show pulse',
      });
      pulseBtn.addEventListener('click', () => {
        activityExpanded = !activityExpanded;
        render();
      });

      sections.push(
        el(
          'section',
          {
            className: 'gh-activity-panel',
            'aria-labelledby': 'gh-activity-heading',
          },
          [
            el('div', { className: 'gh-panel-head' }, [
              el('h2', {
                id: 'gh-activity-heading',
                className: 'gh-panel-title',
                textContent: 'Recent GitHub activity',
              }),
              pulseBtn,
            ]),
            activityExpanded
              ? el(
                  'ol',
                  { className: 'gh-activity-list' },
                  payload.events.slice(0, 5).map((ev) =>
                    el('li', { className: 'gh-activity-item' }, [
                      el('span', {
                        className: 'gh-activity-badge',
                        textContent: ev.label,
                      }),
                      el('a', {
                        href: ev.repoUrl,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        className: 'gh-activity-repo',
                        textContent: ev.repoName,
                      }),
                      ev.detail
                        ? el('span', {
                            className: 'gh-activity-detail',
                            textContent: ev.detail,
                          })
                        : null,
                      el('span', {
                        className: 'gh-activity-time',
                        textContent: formatRelativeTime(ev.createdAt, nowMs),
                      }),
                    ]),
                  ),
                )
              : null,
          ],
        ),
      );
    }

    // 5. Repositories Register
    const searchInput = el('input', {
      id: 'gh-repo-search',
      type: 'search',
      className: 'gh-search-input',
      value: query,
      placeholder: 'Filter by repository name, language, or topic…',
    });
    searchInput.value = query;
    searchInput.addEventListener('input', (e) => {
      query = e.target.value;
      render();
    });

    const scopeTabs = el(
      'div',
      {
        className: 'gh-scope-tabs',
        role: 'group',
        'aria-label': 'Filter scope',
      },
      [
        ['all', `All (${scopeCounts.all})`],
        ['active', `Active (${scopeCounts.active})`],
        ['starred', `Starred (${scopeCounts.starred})`],
        ['documented', `Documented (${scopeCounts.documented})`],
      ].map(([key, label]) => {
        const btn = el('button', {
          type: 'button',
          className: `gh-scope-btn ${scope === key ? 'is-active' : ''}`,
          'aria-pressed': String(scope === key),
          textContent: label,
        });
        btn.addEventListener('click', () => {
          scope = key;
          render();
        });
        return btn;
      }),
    );

    const sortSelect = el(
      'select',
      { id: 'gh-repo-sort', className: 'gh-sort-select' },
      [
        ['pushed', 'Recently pushed'],
        ['stars', 'Most starred'],
        ['created', 'Newest created'],
        ['size', 'Largest codebase'],
        ['name', 'Name (A–Z)'],
      ].map(([val, label]) => {
        const opt = el('option', { value: val, textContent: label });
        if (sortBy === val) opt.selected = true;
        return opt;
      }),
    );
    sortSelect.value = sortBy;
    sortSelect.addEventListener('change', (e) => {
      sortBy = e.target.value;
      render();
    });

    let repoListNode;
    if (filteredRepos.length === 0) {
      const resetBtn = el('button', {
        type: 'button',
        className: 'button button-secondary button-compact',
        textContent: 'Reset filters',
      });
      resetBtn.addEventListener('click', () => {
        query = '';
        scope = 'all';
        selectedLanguage = 'all';
        sortBy = 'pushed';
        render();
      });
      repoListNode = el('div', { className: 'gh-empty-state' }, [
        el('p', { textContent: 'No repositories match the active filters.' }),
        resetBtn,
      ]);
    } else {
      repoListNode = el(
        'ol',
        { className: 'projects-register gh-repo-register' },
        filteredRepos.map((repo) => {
          const readmeState = readmeMap[repo.name];
          const isReadmeOpen = expandedReadmeRepo === repo.name;
          const displayTitle = smartQuotes(repo.displayTitle);

          const langColor =
            payload.languages.find((l) => l.language === repo.language)
              ?.color || languageColor(repo.language);

          const topicButtons = (repo.topics || []).map((topic) => {
            const btn = el('button', {
              type: 'button',
              className: 'tech-tag gh-topic-btn',
              title: `Filter repositories by "${topic}"`,
              textContent: topic,
            });
            btn.addEventListener('click', () => {
              query = topic;
              render();
            });
            return btn;
          });

          const readmeBtn = el('button', {
            type: 'button',
            className: 'gh-action-btn',
            'aria-expanded': String(isReadmeOpen),
            textContent: isReadmeOpen ? 'Hide README' : 'Inspect README',
          });
          readmeBtn.addEventListener('click', () => void toggleReadme(repo.name));

          const cloneBtn = el('button', {
            type: 'button',
            className: 'gh-action-btn',
            textContent:
              copiedRepoId === repo.id ? 'Copied clone URL ✓' : 'Copy git clone',
          });
          cloneBtn.addEventListener('click', () => void copyCloneUrl(repo));

          let drawerNode = null;
          if (isReadmeOpen) {
            if (readmeState?.loading) {
              drawerNode = el('div', { className: 'gh-readme-drawer' }, [
                el('p', {
                  className: 'gh-readme-status',
                  textContent: 'Fetching README.md from GitHub…',
                }),
              ]);
            } else if (readmeState?.available && readmeState.content) {
              drawerNode = el('div', { className: 'gh-readme-drawer' }, [
                el('div', { className: 'gh-readme-head' }, [
                  el('span', { textContent: 'README.md snapshot' }),
                  el('a', {
                    href: `${repo.htmlUrl}#readme`,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    textContent: 'Open on GitHub ↗',
                  }),
                ]),
                el('pre', {
                  className: 'gh-readme-content',
                  textContent: readmeState.content,
                }),
              ]);
            } else {
              drawerNode = el('div', { className: 'gh-readme-drawer' }, [
                el('p', {
                  className: 'gh-readme-status',
                  textContent:
                    readmeState?.error ||
                    'No README.md file found in this repository.',
                }),
              ]);
            }
          }

          return el(
            'li',
            {
              className: reducedMotion
                ? 'gh-repo-item'
                : 'gh-repo-item is-animated',
            },
            [
              el(
                'article',
                {
                  className: `project-entry gh-repo-entry ${
                    repo.isActive ? 'project-entry--live' : ''
                  }`,
                },
                [
                  el('div', { className: 'project-entry-meta' }, [
                    el('span', { className: 'project-dates' }, [
                      el('time', {
                        dateTime: repo.createdAt,
                        textContent: formatMonthYear(repo.createdAt),
                      }),
                      el('span', {
                        className: 'daterange-sep',
                        'aria-hidden': 'true',
                        textContent: '–',
                      }),
                      el('span', {
                        className: 'sr-only',
                        textContent: ' to ',
                      }),
                      repo.isActive
                        ? el('span', {
                            className: 'daterange-present',
                            textContent: 'Active',
                          })
                        : el('time', {
                            dateTime: repo.pushedAt,
                            textContent: formatMonthYear(repo.pushedAt),
                          }),
                    ]),
                    repo.language
                      ? el('span', { className: 'gh-gutter-lang' }, [
                          el('span', {
                            className: 'gh-lang-dot',
                            style: `background-color: ${langColor}`,
                            'aria-hidden': 'true',
                          }),
                          el('span', { textContent: repo.language }),
                        ])
                      : null,
                    el('span', {
                      className: 'gh-gutter-meta',
                      textContent: `${formatSizeKb(repo.sizeKb)}${repo.license ? ` · ${repo.license}` : ''}`,
                    }),
                  ]),
                  el('div', { className: 'project-entry-body' }, [
                    el('h3', { className: 'project-entry-title gh-repo-title' }, [
                      el(
                        'a',
                        {
                          href: repo.htmlUrl,
                          target: '_blank',
                          rel: 'noopener noreferrer',
                          className: 'gh-repo-link',
                        },
                        [
                          displayTitle,
                          el('span', {
                            className: 'project-entry-external',
                            'aria-hidden': 'true',
                            textContent: '↗',
                          }),
                          el('span', {
                            className: 'sr-only',
                            textContent: ' (opens in a new tab)',
                          }),
                        ],
                      ),
                    ]),
                    el('p', { className: 'gh-repo-slug' }, [
                      el('span', { textContent: repo.fullName }),
                      el('span', { 'aria-hidden': 'true', textContent: ' · ' }),
                      el('span', {
                        textContent: `pushed ${formatRelativeTime(repo.pushedAt, nowMs)}`,
                      }),
                      repo.fork
                        ? el('span', {
                            'aria-hidden': 'true',
                            textContent: ' · ',
                          })
                        : null,
                      repo.fork ? el('span', { textContent: 'Fork' }) : null,
                      repo.archived
                        ? el('span', {
                            'aria-hidden': 'true',
                            textContent: ' · ',
                          })
                        : null,
                      repo.archived
                        ? el('span', { textContent: 'Archived' })
                        : null,
                    ]),
                    repo.description
                      ? el('p', {
                          className: 'project-entry-desc',
                          textContent: smartQuotes(repo.description),
                        })
                      : el('p', {
                          className: 'project-entry-desc gh-repo-desc--empty',
                          textContent: `Public repository under @${payload.user.login}; no summary written on GitHub yet.`,
                        }),
                    el('div', { className: 'gh-repo-stats-row' }, [
                      el('span', { className: 'gh-repo-stat' }, [
                        'Stars: ',
                        el('strong', {
                          textContent: String(repo.stargazersCount),
                        }),
                      ]),
                      el('span', { className: 'gh-repo-stat' }, [
                        'Forks: ',
                        el('strong', { textContent: String(repo.forksCount) }),
                      ]),
                      el('span', { className: 'gh-repo-stat' }, [
                        'Issues: ',
                        el('strong', {
                          textContent: String(repo.openIssuesCount),
                        }),
                      ]),
                      el('span', { className: 'gh-repo-stat' }, [
                        'Branch: ',
                        el('strong', { textContent: repo.defaultBranch }),
                      ]),
                    ]),
                    topicButtons.length > 0
                      ? el('div', { className: 'project-entry-tech' }, topicButtons)
                      : null,
                    el('div', { className: 'gh-repo-actions' }, [
                      repo.homepage
                        ? el('a', {
                            href: repo.homepage,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                            className: 'gh-action-link',
                            textContent: 'Live site ↗',
                          })
                        : null,
                      readmeBtn,
                      cloneBtn,
                    ]),
                    drawerNode,
                  ]),
                ],
              ),
            ],
          );
        }),
      );
    }

    sections.push(
      el(
        'section',
        {
          className: 'projects-group',
          'aria-labelledby': 'projects-repositories',
        },
        [
          el('div', { className: 'section-header' }, [
            el('h2', {
              id: 'projects-repositories',
              className: 'section-heading',
              textContent: 'GitHub repositories',
            }),
            el('p', {
              className: 'section-header-meta',
              textContent: `${filteredRepos.length} of ${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'}`,
            }),
          ]),
          el('div', { className: 'gh-controls' }, [
            el('div', { className: 'gh-search-wrap' }, [
              el('label', {
                for: 'gh-repo-search',
                className: 'sr-only',
                textContent: 'Search repositories',
              }),
              searchInput,
            ]),
            el('div', { className: 'gh-scope-sort' }, [
              scopeTabs,
              el('div', { className: 'gh-sort-wrap' }, [
                el('label', {
                  for: 'gh-repo-sort',
                  className: 'gh-sort-label',
                  textContent: 'Sort',
                }),
                sortSelect,
              ]),
            ]),
          ]),
          repoListNode,
        ],
      ),
    );

    // 6. Organization & Event Work
    if (organizationProjects.length > 0) {
      sections.push(
        el(
          'section',
          {
            className: 'projects-group',
            'aria-labelledby': 'projects-organization',
          },
          [
            el('div', { className: 'section-header' }, [
              el('h2', {
                id: 'projects-organization',
                className: 'section-heading',
                textContent: 'Organization & event work',
              }),
              el('p', {
                className: 'section-header-meta',
                textContent: `${organizationProjects.length} ${organizationProjects.length === 1 ? 'project' : 'projects'}`,
              }),
            ]),
            el('p', {
              className: 'projects-group-note',
              textContent:
                'Leadership, team platforms, and client work built outside public personal repositories.',
            }),
            el(
              'ol',
              { className: 'projects-register' },
              organizationProjects.map((project) =>
                el('li', {}, [renderOrgProject(project)]),
              ),
            ),
          ],
        ),
      );
    }

    shell.replaceChildren(...sections);

    if (activeElId === 'gh-repo-search') {
      const nextInput = document.getElementById('gh-repo-search');
      if (nextInput instanceof HTMLInputElement) {
        nextInput.focus({ preventScroll: true });
        if (selStart !== null && selEnd !== null) {
          nextInput.setSelectionRange(selStart, selEnd);
        }
      }
    }
  }

  // Hydrate immediately using cached sessionStorage if fresh, then live-fetch if fallback
  const cached = readCache();
  if (cached) {
    payload = cached;
  }
  render();

  if (!cached && payload.source === 'fallback') {
    void syncFromGitHub();
  }

  // Relative time 30s ticker
  window.setInterval(() => {
    if (document.hidden) return;
    nowMs = Date.now();
    render();
  }, 30_000);
}
