// Closes the hamburger menu on Escape, on a click outside it and when a link in it is followed.
// Without JavaScript the <details> element still opens and closes by itself.
(() => {
  const menu = /** @type {HTMLDetailsElement | null} */ (document.querySelector('nav.sitenav details.menu'));
  if (!menu) return;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (menu.open && e.target instanceof Node && !menu.contains(e.target)) menu.open = false;
  });
  menu.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) menu.open = false;
  });
})();
