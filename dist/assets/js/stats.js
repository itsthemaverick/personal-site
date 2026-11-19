/**
 * Stats Page Live Age Ticker
 * Exact parity with src/components/Stats/LiveAge.tsx & src/lib/telemetry.ts.
 */

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.2421897;

export function initStats() {
  const container = document.querySelector('[data-live-age]');
  if (!container) return;

  const valueEl = container.querySelector('.stat-readout-value');
  const noteEl = container.querySelector('.stat-readout-note');
  const birthDate = container.getAttribute('data-birth-date');
  const precision = Number.parseInt(
    container.getAttribute('data-precision') || '11',
    10,
  );

  if (!valueEl || !noteEl || !birthDate) return;

  const birthMs = Date.parse(birthDate);
  if (Number.isNaN(birthMs)) return;

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const intervalMs = Math.max(
    100,
    Math.round(MS_PER_YEAR / 10 ** precision),
  );
  const staticNote = noteEl.textContent || '';
  let timer = 0;

  const updateAge = () => {
    const years = (Date.now() - birthMs) / MS_PER_YEAR;
    valueEl.textContent = years.toFixed(precision);
  };

  const stop = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  const start = () => {
    if (reducedMotion || document.hidden) {
      valueEl.removeAttribute('data-live');
      if (reducedMotion) noteEl.textContent = staticNote;
      return;
    }

    updateAge();
    valueEl.setAttribute('data-live', 'true');
    noteEl.textContent = 'Live';
    stop();
    timer = window.setInterval(updateAge, intervalMs);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  if (typeof window.matchMedia === 'function') {
    window
      .matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', (e) => {
        if (e.matches) {
          stop();
          valueEl.removeAttribute('data-live');
          noteEl.textContent = staticNote;
        } else {
          window.location.reload();
        }
      });
  }

  start();
}
