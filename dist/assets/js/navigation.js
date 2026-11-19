/**
 * Accessible Navigation: Mobile <dialog> SlideMenu + SectionNav Sticky Scroll Spy
 * Mirrors Hamburger.tsx, SlideMenu.tsx, useActiveSection.ts, and smoothScroll.ts.
 */

const SMOOTH_SCROLL_ATTR = 'data-smooth-scroll';
const SCROLL_IDLE_MS = 150;
const LINE_ALLOWANCE = 8;
const BOTTOM_TOLERANCE = 2;

let releaseSmoothScroll;

function armSmoothScroll() {
  if (releaseSmoothScroll) releaseSmoothScroll();

  const root = document.documentElement;
  const leaving = window.location.href;
  const from = { left: window.scrollX, top: window.scrollY };
  let idle;

  const done = () => {
    window.clearTimeout(idle);
    window.removeEventListener('scroll', wait);
    window.removeEventListener('scrollend', done);
    window.removeEventListener('hashchange', returned);
    root.removeAttribute(SMOOTH_SCROLL_ATTR);
    releaseSmoothScroll = undefined;
  };

  const wait = () => {
    window.clearTimeout(idle);
    idle = window.setTimeout(done, SCROLL_IDLE_MS);
  };

  const returned = (event) => {
    if (event.newURL !== leaving) return;
    done();
    const settle = () => window.scrollTo({ ...from, behavior: 'instant' });
    settle();
    window.requestAnimationFrame(settle);
  };

  root.setAttribute(SMOOTH_SCROLL_ATTR, '');
  window.addEventListener('scroll', wait, { passive: true });
  window.addEventListener('scrollend', done);
  window.addEventListener('hashchange', returned);
  releaseSmoothScroll = done;
  wait();
}

function initSlideMenu() {
  const button = document.querySelector('.hamburger-button');
  const icon = document.querySelector('.hamburger-icon');
  const dialog = document.getElementById('mobile-nav-menu');
  const closeBtn = dialog?.querySelector('.slide-menu-close');

  if (!button || !dialog) return;

  let isOpen = false;
  let pressedBackdrop = false;

  const syncUi = (open) => {
    isOpen = open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute(
      'aria-label',
      open ? 'Close navigation menu' : 'Open navigation menu',
    );
    if (icon) {
      icon.classList.toggle('hamburger-icon--open', open);
    }
  };

  const openMenu = () => {
    if (dialog.open) return;
    syncUi(true);
    dialog.showModal();
  };

  const closeMenu = () => {
    syncUi(false);
    if (dialog.open) dialog.close();
  };

  button.addEventListener('click', () => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeMenu);
  }

  dialog.addEventListener('close', () => syncUi(false));

  dialog.addEventListener('pointerdown', (event) => {
    pressedBackdrop = event.target === event.currentTarget;
  });

  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && event.target === event.currentTarget) {
      closeMenu();
    }
  });

  const links = dialog.querySelectorAll('a');
  for (const link of links) {
    link.addEventListener('click', closeMenu);
  }

  if (typeof window.ResizeObserver === 'function') {
    const observer = new window.ResizeObserver(() => {
      if (!isOpen) return;
      if (button.getClientRects().length > 0) return;

      closeMenu();
      const header = button.closest('header');
      const target =
        header?.querySelector('a[aria-current="page"]') ??
        header?.querySelector('a[href]');
      if (target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    });
    observer.observe(button);
  }
}

function revealSectionLink(link) {
  const row = link?.parentElement;
  if (!link || !row || row.scrollWidth <= row.clientWidth) return;

  const style = window.getComputedStyle(row);
  const box = row.getBoundingClientRect();
  const rect = link.getBoundingClientRect();
  const start = box.left + (Number.parseFloat(style.scrollPaddingLeft) || 0);
  const end = box.right - (Number.parseFloat(style.scrollPaddingRight) || 0);

  if (rect.left < start) {
    row.scrollLeft -= start - rect.left;
  } else if (rect.right > end) {
    row.scrollLeft += rect.right - end;
  }
}

function initSectionNav() {
  const nav = document.querySelector('.section-nav[data-section-nav]');
  if (!nav) return;

  const links = [...nav.querySelectorAll('.section-nav-link')];
  if (links.length === 0) return;

  const sectionIds = links
    .map((link) => link.getAttribute('href')?.replace(/^#/, '') ?? '')
    .filter(Boolean);

  if (sectionIds.length === 0) return;

  let activeId = sectionIds[0];
  let requested = window.location.hash.slice(1);
  let frame = 0;
  let held = '';

  const applyActive = (nextId) => {
    if (!nextId) return;
    activeId = nextId;
    let activeLink = null;
    for (const link of links) {
      const targetId = link.getAttribute('href')?.slice(1);
      const isActive = targetId === nextId;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
        activeLink = link;
      } else {
        link.removeAttribute('aria-current');
      }
    }
    if (activeLink) revealSectionLink(activeLink);
  };

  const measure = () => {
    const scrollY = window.scrollY;
    const maxScroll =
      document.documentElement.scrollHeight - window.innerHeight;
    const bottom = maxScroll - BOTTOM_TOLERANCE;
    if (bottom <= 0) return;

    const chrome =
      (Number.parseFloat(window.getComputedStyle(nav).top) || 0) +
      nav.getBoundingClientRect().height;

    const marks = [];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      const box = el?.getBoundingClientRect();
      if (!el || !box || (box.width === 0 && box.height === 0)) continue;
      const margin =
        Number.parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
      const landing = scrollY + box.top - Math.max(chrome, margin);
      marks.push({ id, landing, at: landing - LINE_ALLOWANCE });
    }

    const asked = marks.find((mark) => mark.id === requested);
    if (
      asked &&
      Math.abs(scrollY - Math.min(Math.max(asked.landing, 0), maxScroll)) <=
        BOTTOM_TOLERANCE
    ) {
      held = asked.id;
      applyActive(asked.id);
      return;
    }

    if (held !== '' && held === requested) {
      requested = '';
    }
    held = '';

    const firstStranded = marks.findIndex((mark) => mark.landing > bottom);
    if (firstStranded !== -1) {
      const stranded = marks.slice(firstStranded);
      const from = firstStranded > 0 ? marks[firstStranded - 1].landing : 0;
      const far = Math.max(...stranded.map((mark) => mark.landing));
      if (far > from) {
        for (const mark of stranded) {
          mark.at =
            bottom - ((far - mark.landing) * (bottom - from)) / (far - from);
        }
      }
    }

    let nextActive = sectionIds[0];
    for (const mark of marks) {
      if (scrollY >= mark.at) {
        nextActive = mark.id;
      }
    }
    if (nextActive !== activeId) {
      applyActive(nextActive);
    }
  };

  const schedule = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  };

  for (const link of links) {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      armSmoothScroll();
      requested = link.hash.slice(1);
      schedule();
    });
  }

  nav.addEventListener('focusin', (event) => {
    const link = event.target;
    if (link instanceof Element && link.matches(':focus-visible')) {
      revealSectionLink(link);
    }
  });

  nav.addEventListener(
    'scroll',
    (event) => {
      const row = event.target;
      if (row instanceof HTMLElement) {
        row.style.setProperty('--scrolled', `${row.scrollLeft}px`);
      }
    },
    { capture: true, passive: true },
  );

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', () => {
    requested = window.location.hash.slice(1);
    schedule();
  });

  measure();
}

export function initNavigation() {
  initSlideMenu();
  initSectionNav();
}
