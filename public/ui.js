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

  // Manage body scroll lock when any modal is open
  const modals = Array.from(document.querySelectorAll('.modal, .rule-modal'));
  const updateScrollLock = () => {
    const anyOpen = modals.some(m => !m.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', anyOpen);
  };
  modals.forEach(m => {
    ['click','transitionend'].forEach(ev => on(m, ev, updateScrollLock));
    // Close on overlay click if clicked outside content
    on(m, 'click', (e) => {
      const content = m.querySelector('.modal-content, .rule-modal-content');
      if (content && !content.contains(e.target)) {
        m.classList.add('hidden');
        updateScrollLock();
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modals.forEach(m => m.classList.add('hidden'));
      updateScrollLock();
    }
  });
  updateScrollLock();

  // Theme toggle (persisted)
  const themeSwitch = qs('#themeSwitch');
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) root.setAttribute('data-theme', savedTheme);
  if (themeSwitch) {
    themeSwitch.checked = root.getAttribute('data-theme') === 'dark';
    on(themeSwitch, 'change', () => {
      const mode = themeSwitch.checked ? 'dark' : 'light';
      root.setAttribute('data-theme', mode);
      localStorage.setItem('theme', mode);
    });
  }
})();
