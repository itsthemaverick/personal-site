/**
 * Resume Page Controls
 * Triggers browser print dialog from Print / PDF button.
 */

export function initResume() {
  const buttons = document.querySelectorAll('.resume-print-button');
  for (const button of buttons) {
    button.addEventListener('click', () => {
      window.print();
    });
  }
}
