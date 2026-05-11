window.MYDAY_TASKS = [
  {
    id: 'exercise',
    title: 'Exercise',
    accentClass: 'accent-green',
    icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="exGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7ad730"/><stop offset="100%" stop-color="#55ab1e"/></linearGradient></defs><circle cx="70" cy="30" r="14" fill="url(#exGrad)"/><path fill="url(#exGrad)" d="M50 52h40l6 36H44z"/><rect x="16" y="68" width="108" height="12" rx="6" fill="url(#exGrad)"/><rect x="16" y="60" width="16" height="28" rx="4" fill="#55ab1e"/><rect x="108" y="60" width="16" height="28" rx="4" fill="#55ab1e"/></svg>',
    frequency: { type: 'daily' }
  },
  {
    id: 'pedicure',
    title: 'Pedicure',
    accentClass: 'accent-cyan',
    icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="taskGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#64748b"/></linearGradient></defs><circle cx="70" cy="70" r="44" fill="none" stroke="url(#taskGrad)" stroke-width="8"/><path fill="url(#taskGrad)" d="M62 88l-20-20 8-8 12 12 28-28 8 8z"/></svg>',
    frequency: { type: 'weekly', days: [0, 3] }
  }
];