/**
 * Contact Page Animated Email Alias Link
 * Exact parity with src/components/Contact/EmailLink.tsx.
 */

const ANIMATION_TICK_MS = 50;
const HOLD_TICKS_AFTER_MESSAGE = 50;

export function initContact() {
  const container = document.querySelector('[data-email-typer]');
  if (!container) return;

  const link = container.querySelector('.contact-email-link');
  const prefixEl = container.querySelector('.contact-email-prefix > span');
  const localPart = container.getAttribute('data-local-part') || '';
  if (!link || !prefixEl || !localPart) return;

  const messages = [
    localPart,
    'hello',
    'hola',
    'you-can-email-me-at-literally-anything! Really',
    'well, not anything. But most things',
    'like-this',
    'or-this',
    'but not this :(  ',
    'you.can.also.email.me.with.specific.topics.like',
    'just-saying-hi',
    'please-work-for-us',
    'help',
    'admin',
    'or-I-really-like-your-website',
    'thanks',
  ];

  const reducedQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

  let idx = 0;
  let message = localPart;
  let char = messages[0].length;
  let isActive = true;
  let timer = 0;

  const render = () => {
    const reduced = reducedQuery?.matches ?? false;
    prefixEl.textContent = reduced ? localPart : message;
  };

  const tick = () => {
    if (idx >= messages.length) {
      stopTimer();
      return;
    }

    const finished = char - HOLD_TICKS_AFTER_MESSAGE >= messages[idx].length;
    if (!finished) {
      message = messages[idx].slice(0, char);
      char += 1;
      isActive = true;
      render();
      return;
    }

    const nextIdx = idx + 1;
    if (nextIdx === messages.length) {
      idx = messages.length;
      isActive = false;
      stopTimer();
      return;
    }

    idx = nextIdx;
    message = messages[idx].slice(0, 1);
    char = 2;
    isActive = true;
    render();
  };

  function stopTimer() {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  }

  function startTimer() {
    stopTimer();
    if (!isActive || (reducedQuery?.matches ?? false)) return;
    timer = window.setInterval(tick, ANIMATION_TICK_MS);
  }

  const pause = () => {
    isActive = false;
    stopTimer();
  };

  const resume = () => {
    isActive = idx < messages.length;
    startTimer();
  };

  container.addEventListener('mouseenter', pause);
  container.addEventListener('mouseleave', resume);
  link.addEventListener('focus', pause);
  link.addEventListener('blur', resume);

  if (reducedQuery) {
    reducedQuery.addEventListener('change', () => {
      render();
      if (reducedQuery.matches) {
        stopTimer();
      } else {
        startTimer();
      }
    });
  }

  render();
  startTimer();
}
