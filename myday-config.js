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
  },
  {
    id: 'hair-serum',
    title: 'Hair serum',
    accentClass: 'accent-pink',
    icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="serumGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff5d90"/><stop offset="100%" stop-color="#ff9d67"/></linearGradient></defs><path fill="url(#serumGrad)" d="M55 20h30l5 10H50zM50 34h40v10H50zM52 48h36l4 52c1 10-7 20-18 20H66c-11 0-19-10-18-20z"/><path fill="#ffb6c7" d="M60 68h20l2 20c0 5-4 10-10 10h-4c-6 0-10-5-10-10z" opacity="0.6"/></svg>',
    frequency: { type: 'daily' },
    times: [
      { label: 'Morning', from: 7, to: 12 },
      { label: 'Night', from: 21, to: 1 }
    ]
  }
];