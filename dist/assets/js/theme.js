/**
 * Theme Controller (system | light | dark)
 * Syncs localStorage, <html> data-theme / data-theme-choice, <meta name="theme-color">,
 * cross-tab storage changes, and OS prefers-color-scheme transitions.
 */

const STORAGE_KEY = 'theme';
const THEMES = ['system', 'light', 'dark'];
const LABELS = {
  system: 'Theme: system (switch to light)',
  light: 'Theme: light (switch to dark)',
  dark: 'Theme: dark (switch to system)',
};

function readChoice() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // Ignore storage access restrictions
  }
  return 'system';
}

function syncThemeColor() {
  const tag = document.querySelector('meta[data-theme-color]');
  if (!tag) return;
  const bg = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--color-bg-alt')
    .trim();
  if (bg) {
    tag.setAttribute('content', bg);
  }
}

function applyChoice(choice) {
  const root = document.documentElement;
  root.setAttribute('data-theme-choice', choice);

  if (choice === 'light' || choice === 'dark') {
    root.setAttribute('data-theme', choice);
  } else {
    root.removeAttribute('data-theme');
  }

  const buttons = document.querySelectorAll('.theme-toggle');
  for (const btn of buttons) {
    btn.setAttribute('aria-label', LABELS[choice]);
    btn.setAttribute('title', LABELS[choice]);
  }

  window.requestAnimationFrame(syncThemeColor);
}

function persistChoice(choice) {
  try {
    if (choice === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch {
    // Ignore storage access restrictions
  }
}

export function initTheme() {
  let current = readChoice();
  applyChoice(current);

  const buttons = document.querySelectorAll('.theme-toggle');
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
      current = next;
      persistChoice(next);
      applyChoice(next);
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    current = readChoice();
    applyChoice(current);
  });

  if (typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSchemeChange = () => {
      if (current === 'system') {
        syncThemeColor();
      }
    };
    media.addEventListener('change', onSchemeChange);
  }
}
