/**
 * Main Vanilla JS Entrypoint (ES6 Module)
 */

import { initTheme } from './theme.js';
import { initNavigation } from './navigation.js';
import { initResume } from './resume.js';
import { initStats } from './stats.js';
import { initContact } from './contact.js';
import { initBlog } from './blog.js';
import { initProjects } from './projects-github.js';

function boot() {
  initTheme();
  initNavigation();
  initResume();
  initStats();
  initContact();
  initBlog();
  initProjects();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
