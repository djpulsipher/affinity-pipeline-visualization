// Lightweight UI interactions for the modern dashboard shell
(function () {
  const qs = (s) => document.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Views: home, funnel, stages, changes, settings
  const el = {
    nav: document.getElementById('sideNav'),
    homeStats: qs('#home-stats'),
    home: qs('#view-home'),
    goal: qs('#view-goal'),
    changes: qs('#view-changes'),
    settings: qs('#view-settings'),
    cardFunnel: qs('#card-funnel'),
    cardStages: qs('#card-stages'),
    cardGoal: qs('#card-goal'),
    cardStageMetrics: qs('#card-stage-metrics'),
    list: qs('#view-list'),
  };

  function setActiveNav(view) {
    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.view === view);
    });
  }

  function showView(view) {
    localStorage.setItem('lastView', view);
    setActiveNav(view);

    // Reset visibility
    if (el.home) el.home.classList.add('hidden');
    if (el.changes) el.changes.classList.add('hidden');
    if (el.settings) el.settings.classList.add('hidden');
    if (el.homeStats) el.homeStats.classList.add('hidden');
    if (el.goal) el.goal.classList.add('hidden');
    if (el.list) el.list.classList.add('hidden');

    // default: hide all cards
    [el.cardFunnel, el.cardStages, el.cardGoal, el.cardStageMetrics].forEach(c => c && c.classList.add('hidden'));

    switch (view) {
      case 'settings':
        if (el.settings) el.settings.classList.remove('hidden');
        break;
      case 'changes':
        if (el.changes) el.changes.classList.remove('hidden');
        break;
      case 'goal':
        if (el.goal) el.goal.classList.remove('hidden');
        break;
      case 'list':
        if (el.list) el.list.classList.remove('hidden');
        if (window.renderListView) window.renderListView();
        break;
      case 'funnel':
        if (el.home) el.home.classList.remove('hidden');
        if (el.cardFunnel) el.cardFunnel.classList.remove('hidden');
        break;
      case 'stages':
        if (el.home) el.home.classList.remove('hidden');
        if (el.cardStages) el.cardStages.classList.remove('hidden');
        break;
      case 'home':
      default:
        if (el.homeStats) el.homeStats.classList.remove('hidden');
        if (el.home) el.home.classList.remove('hidden');
        // Show metrics, funnel, stages on home only
        [el.cardStageMetrics, el.cardFunnel, el.cardStages].forEach(c => c && c.classList.remove('hidden'));
        break;
    }
  }

  // Sidebar navigation
  on(el.nav, 'click', (e) => {
    const target = e.target.closest('.nav-item');
    if (!target) return;
    e.preventDefault();
    const view = target.dataset.view;
    if (view) showView(view);
  });

  // Topbar Config button -> Settings view
  on(qs('#toggleConfig'), 'click', () => showView('settings'));
  on(qs('#openSettings'), 'click', (e) => { e.preventDefault(); showView('settings'); });

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
  const modals = Array.from(document.querySelectorAll('.modal, .rule-modal, .drawer'));
  const updateScrollLock = () => {
    const anyOpen = modals.some(m => !m.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', anyOpen);
  };
  modals.forEach(m => {
    ['click','transitionend'].forEach(ev => on(m, ev, updateScrollLock));
    // Close on overlay click if clicked outside content
    on(m, 'click', (e) => {
      const content = m.querySelector('.modal-content, .rule-modal-content, .drawer-panel');
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

  // Initial route
  const initial = localStorage.getItem('lastView') || 'home';
  showView(initial);

  // List View toolbar events
  const customizeBtn = qs('#customizeListView');
  const listDrawer = qs('#listColumnsDrawer');
  const closeDrawerBtn = listDrawer?.querySelector('.close');
  on(customizeBtn, 'click', () => listDrawer?.classList.remove('hidden'));
  on(closeDrawerBtn, 'click', () => listDrawer?.classList.add('hidden'));
  on(qs('#cancelColumns'), 'click', () => listDrawer?.classList.add('hidden'));
  // Apply will be bound in app.js after options are populated
})();
