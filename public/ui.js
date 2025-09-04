// Lightweight UI interactions for the modern dashboard shell
(function () {
  const qs = (s) => document.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Toggle settings panel visibility
  on(qs('#toggleConfig'), 'click', () => {
    const panel = qs('#settings');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    // Smooth scroll back to panel when opening
    if (!panel.classList.contains('collapsed')) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Open settings from sidebar
  on(qs('#openSettings'), 'click', (e) => {
    const panel = qs('#settings');
    if (!panel) return;
    panel.classList.remove('collapsed');
    // allow default hash behavior then smooth scroll
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  });

  // Mirror legacy stat IDs if older code updates them
  // (Leave in place in case some code writes to *_legacy.)
  const bridges = [
    ['#totalValue_legacy', '#totalValue'],
    ['#totalLeads_legacy', '#totalLeads'],
    ['#weightedValue_legacy', '#weightedValue'],
    ['#averageContact_legacy', '#averageContact'],
  ];
  const mirror = () => {
    for (const [fromSel, toSel] of bridges) {
      const from = qs(fromSel);
      const to = qs(toSel);
      if (from && to && from.textContent !== to.textContent) {
        to.textContent = from.textContent;
      }
    }
  };
  // Observe mutations on the legacy summary to keep the cards in sync
  const legacySummary = document.querySelector('.summary-stats');
  if (window.MutationObserver && legacySummary) {
    const mo = new MutationObserver(mirror);
    mo.observe(legacySummary, { childList: true, subtree: true, characterData: true });
  }
})();

