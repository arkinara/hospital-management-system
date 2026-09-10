/**
 * Hospital MS — Pro Max design tokens.
 *
 * Load AFTER the Tailwind Play CDN script and BEFORE any page markup runs:
 *   <script src="https://cdn.tailwindcss.com"></script>
 *   <script src="theme.js"></script>
 *
 * Responsibilities:
 *  - Map semantic tokens (never raw hex in pages) onto Tailwind utilities backed by CSS vars.
 *  - Own the light/dark palettes and the two density modes.
 *  - Persist theme + density to localStorage and mirror them onto <html> so every page,
 *    including pages loaded inside the viewer's iframes, boots in the same state.
 *
 * Palette: clinical blue primary + amber accent on slate neutrals (data-dense dashboard).
 * Contrast: every foreground/background pair below is >= 4.5:1 for text, >= 3:1 for large
 * glyphs and chart marks, in BOTH themes.
 */
(function () {
  const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

  window.tailwind = window.tailwind || {};
  window.tailwind.config = {
    darkMode: ['class', '.dark'],
    theme: {
      extend: {
        colors: {
          background: v('--bg'),
          foreground: v('--fg'),
          muted: v('--fg-muted'),
          subtle: v('--fg-subtle'),
          outline: v('--outline'),
          'outline-strong': v('--outline-strong'),
          primary: {
            DEFAULT: v('--primary'),
            foreground: v('--primary-fg'),
            container: v('--primary-container'),
            'container-foreground': v('--primary-container-fg'),
          },
          accent: {
            DEFAULT: v('--accent'),
            foreground: v('--accent-fg'),
            container: v('--accent-container'),
            'container-foreground': v('--accent-container-fg'),
          },
          surface: {
            0: v('--s0'),
            1: v('--s1'),
            2: v('--s2'),
            3: v('--s3'),
            4: v('--s4'),
          },
          success: { DEFAULT: v('--success'), container: v('--success-container'), 'container-foreground': v('--success-container-fg') },
          warning: { DEFAULT: v('--warning'), container: v('--warning-container'), 'container-foreground': v('--warning-container-fg') },
          danger: { DEFAULT: v('--danger'), container: v('--danger-container'), 'container-foreground': v('--danger-container-fg') },
          info: { DEFAULT: v('--info'), container: v('--info-container'), 'container-foreground': v('--info-container-fg') },
        },
        fontFamily: {
          display: ['Lexend', 'system-ui', 'sans-serif'],
          sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
          mono: ['"Fira Code"', 'ui-monospace', 'monospace'],
        },
        fontSize: {
          // Density-8 scale. Body never drops below 14px on mobile (iOS auto-zoom guard).
          '2xs': ['0.6875rem', { lineHeight: '1rem' }],   // 11px — chips, table meta only
          xs: ['0.75rem', { lineHeight: '1.125rem' }],    // 12px — helper text
          sm: ['0.8125rem', { lineHeight: '1.25rem' }],   // 13px — dense table cells (desktop)
          base: ['0.875rem', { lineHeight: '1.5' }],      // 14px — body
          md: ['0.9375rem', { lineHeight: '1.5' }],       // 15px
          lg: ['1.0625rem', { lineHeight: '1.4' }],       // 17px — card title
          xl: ['1.25rem', { lineHeight: '1.3' }],         // 20px — H3
          '2xl': ['1.5rem', { lineHeight: '1.25' }],      // 24px — H2
          '3xl': ['1.875rem', { lineHeight: '1.2' }],     // 30px — H1 / metric
          '4xl': ['2.25rem', { lineHeight: '1.15' }],
        },
        borderRadius: { sm: '4px', DEFAULT: '6px', md: '8px', lg: '10px', xl: '12px', '2xl': '14px', '3xl': '18px' },
        boxShadow: {
          // Flat by default; elevation is reserved for things that actually float.
          card: '0 1px 2px 0 rgb(2 8 23 / 0.04)',
          raised: '0 2px 6px -1px rgb(2 8 23 / 0.08), 0 1px 2px 0 rgb(2 8 23 / 0.04)',
          overlay: '0 16px 40px -8px rgb(2 8 23 / 0.28), 0 4px 12px -4px rgb(2 8 23 / 0.16)',
        },
        spacing: { 4.5: '1.125rem', 13: '3.25rem', 15: '3.75rem' },
        zIndex: { nav: '20', sticky: '30', fab: '40', scrim: '50', overlay: '60', toast: '70' },
        transitionDuration: { fast: '120ms', DEFAULT: '180ms', slow: '260ms' },
      },
    },
  };

  const css = `
  /* ---------- Light (default) ---------- */
  :root {
    --bg: 246 248 251;
    --fg: 15 23 42;            /* slate-900   on --bg  15.6:1 */
    --fg-muted: 71 85 105;     /* slate-600   on --bg   6.9:1 */
    --fg-subtle: 100 116 139;  /* slate-500   on --bg   4.6:1 */

    --primary: 30 64 175;              /* blue-800 */
    --primary-fg: 255 255 255;
    --primary-container: 219 234 254;
    --primary-container-fg: 23 37 84;

    --accent: 180 83 9;                /* amber-700 — CTA highlight */
    --accent-fg: 255 255 255;
    --accent-container: 254 243 199;
    --accent-container-fg: 69 26 3;

    --outline: 203 213 225;            /* hairlines */
    --outline-strong: 148 163 184;     /* input borders, 3:1 vs surface */

    --s0: 255 255 255;   /* cards / table body */
    --s1: 250 251 253;
    --s2: 241 245 249;   /* table head, inset wells */
    --s3: 233 239 246;   /* hover */
    --s4: 224 232 241;   /* pressed / rail */

    --success: 21 128 61;   --success-container: 220 252 231; --success-container-fg: 5 46 22;
    --warning: 180 83 9;    --warning-container: 254 243 199; --warning-container-fg: 69 26 3;
    --danger: 185 28 28;    --danger-container: 254 226 226;  --danger-container-fg: 69 10 10;
    --info: 29 78 216;      --info-container: 219 234 254;    --info-container-fg: 23 37 84;

    --focus: 29 78 216;
    --scrim: 15 23 42;
    --scrim-alpha: 0.48;
    color-scheme: light;
  }

  /* ---------- Dark ---------- */
  .dark {
    --bg: 8 11 17;
    --fg: 226 232 240;         /* on --bg  14.9:1 */
    --fg-muted: 156 172 191;   /* on --bg   7.7:1 */
    --fg-subtle: 130 146 166;  /* on --bg   5.6:1 */

    --primary: 147 187 255;
    --primary-fg: 4 24 63;
    --primary-container: 30 58 138;
    --primary-container-fg: 219 234 254;

    --accent: 251 191 36;
    --accent-fg: 41 20 0;
    --accent-container: 69 39 3;
    --accent-container-fg: 253 230 138;

    --outline: 44 54 70;
    --outline-strong: 90 105 128;

    --s0: 17 22 31;
    --s1: 21 27 37;
    --s2: 26 33 45;
    --s3: 33 42 57;
    --s4: 42 53 71;

    --success: 74 222 128;  --success-container: 6 48 24;  --success-container-fg: 187 247 208;
    --warning: 251 191 36;  --warning-container: 66 32 6;  --warning-container-fg: 253 230 138;
    --danger: 252 165 165;  --danger-container: 72 12 12;  --danger-container-fg: 254 202 202;
    --info: 147 187 255;    --info-container: 27 52 122;   --info-container-fg: 219 234 254;

    --focus: 147 187 255;
    --scrim: 2 4 8;
    --scrim-alpha: 0.66;
    color-scheme: dark;
  }

  /* ---------- Density ----------
     Compact is a POINTER-WIDTH affordance only. Below 1024px every interactive row
     falls back to comfortable so touch targets stay >= 44px. */
  :root, [data-density="comfortable"] {
    --row-h: 52px; --cell-py: 10px; --card-pad: 20px; --gap: 16px; --sec-gap: 28px; --cell-fs: 0.875rem;
  }
  @media (min-width: 1024px) {
    [data-density="compact"] {
      --row-h: 40px; --cell-py: 5px; --card-pad: 14px; --gap: 12px; --sec-gap: 20px; --cell-fs: 0.8125rem;
    }
  }

  /* ---------- Base ---------- */
  * { scrollbar-width: thin; scrollbar-color: rgb(var(--outline-strong)) transparent; }
  *::-webkit-scrollbar { width: 10px; height: 10px; }
  *::-webkit-scrollbar-thumb { background: rgb(var(--outline-strong) / .7); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
  html { font-family: "Source Sans 3", system-ui, sans-serif; -webkit-text-size-adjust: 100%; }
  h1, h2, h3, h4, .font-display { font-family: Lexend, system-ui, sans-serif; letter-spacing: -0.011em; }
  body { overflow-x: hidden; }

  /* Tabular figures everywhere a number must not reflow as it changes. */
  .num { font-family: "Fira Code", ui-monospace, monospace; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; letter-spacing: -0.02em; }
  table, .tnum { font-variant-numeric: tabular-nums; }

  /* Focus: never removed, always 2px + offset, visible on every surface. */
  :focus-visible { outline: 2px solid rgb(var(--focus)); outline-offset: 2px; border-radius: 4px; }
  .focus-inset:focus-visible { outline-offset: -2px; }

  /* Density-driven primitives */
  .card { background: rgb(var(--s0)); border: 1px solid rgb(var(--outline)); border-radius: 14px; padding: var(--card-pad); }
  .well { background: rgb(var(--s2)); border: 1px solid rgb(var(--outline)); border-radius: 10px; }
  .row-h { min-height: var(--row-h); }
  .grid-gap { gap: var(--gap); }
  .sec-gap > * + * { margin-top: var(--sec-gap); }

  /* Dense table */
  .dt { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--cell-fs); }
  .dt thead th { position: sticky; top: 0; z-index: 2; background: rgb(var(--s2)); color: rgb(var(--fg-muted));
    font-weight: 600; text-align: left; white-space: nowrap; padding: 8px 12px; font-size: 0.75rem;
    letter-spacing: .02em; text-transform: uppercase; border-bottom: 1px solid rgb(var(--outline)); }
  .dt tbody td { padding: var(--cell-py) 12px; border-bottom: 1px solid rgb(var(--outline) / .7); vertical-align: middle; }
  .dt tbody tr { height: var(--row-h); }
  .dt tbody tr:hover { background: rgb(var(--s3) / .75); }
  .dt tbody tr[aria-selected="true"] { background: rgb(var(--primary-container) / .55); }
  .dt tbody tr:last-child td { border-bottom: 0; }
  .dt th[aria-sort] { cursor: pointer; }
  .dt th[aria-sort]:hover { color: rgb(var(--fg)); background: rgb(var(--s3)); }

  /* Skeleton — shimmer, and a static block when motion is reduced. */
  .skel { background: linear-gradient(90deg, rgb(var(--s2)) 25%, rgb(var(--s4)) 37%, rgb(var(--s2)) 63%);
    background-size: 400% 100%; animation: skel 1.4s ease infinite; border-radius: 6px; }
  @keyframes skel { 0% { background-position: 100% 50% } 100% { background-position: 0 50% } }

  /* Motion tier 4/10: short, purposeful, interruptible. */
  .anim-in { animation: fadeUp 200ms cubic-bezier(.2,.7,.3,1) both; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
  .anim-scrim { animation: fadeIn 140ms ease-out both; }
  .anim-sheet { animation: sheetUp 220ms cubic-bezier(.2,.7,.3,1) both; }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes sheetUp { from { opacity: 0; transform: translateY(12px) scale(.985) } to { opacity: 1; transform: none } }
  .press { transition: transform 120ms ease-out, background-color 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out; }
  .press:active { transform: scale(.985); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important;
      transition-duration: .001ms !important; scroll-behavior: auto !important; }
    .skel { background: rgb(var(--s3)); }
  }

  /* Safe areas — for the mobile bottom nav and any fixed bar. */
  .pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 0px); }
  .pt-safe { padding-top: max(env(safe-area-inset-top), 0px); }

  /* Screen-reader only, but focusable (skip link). */
  .sr-only:not(:focus):not(:focus-within) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  [hidden] { display: none !important; }
  `;

  const style = document.createElement('style');
  style.id = 'promax-tokens';
  style.textContent = css;
  document.head.appendChild(style);

  // ----- Persisted preferences, shared across pages and iframes -----
  const KEY_THEME = 'promax.theme';
  const KEY_DENSITY = 'promax.density';
  const read = (k, fallback) => {
    try { return localStorage.getItem(k) || fallback; } catch { return fallback; }
  };
  const write = (k, val) => {
    try { localStorage.setItem(k, val); } catch { /* private mode — session-only is fine */ }
  };

  const systemDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const Theme = {
    KEY_THEME,
    KEY_DENSITY,
    get theme() {
      const t = read(KEY_THEME, 'system');
      return t === 'system' ? (systemDark() ? 'dark' : 'light') : t;
    },
    get themePref() { return read(KEY_THEME, 'system'); },
    get density() { return read(KEY_DENSITY, 'compact'); },
    apply() {
      const root = document.documentElement;
      root.classList.toggle('dark', Theme.theme === 'dark');
      root.dataset.density = Theme.density;
      root.dataset.themePref = Theme.themePref;
      document.dispatchEvent(new CustomEvent('promax:prefs', { detail: { theme: Theme.theme, density: Theme.density } }));
    },
    setTheme(pref) { write(KEY_THEME, pref); Theme.apply(); },
    toggleTheme() { Theme.setTheme(Theme.theme === 'dark' ? 'light' : 'dark'); },
    setDensity(d) { write(KEY_DENSITY, d); Theme.apply(); },
    toggleDensity() { Theme.setDensity(Theme.density === 'compact' ? 'comfortable' : 'compact'); },
  };

  window.PromaxTheme = Theme;
  Theme.apply();

  // React to the OS switching themes while "system" is selected.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (Theme.themePref === 'system') Theme.apply();
    });
  }
  // The viewer broadcasts pref changes so both compare panes stay in sync.
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'promax:prefs') {
      if (e.data.theme) write(KEY_THEME, e.data.theme);
      if (e.data.density) write(KEY_DENSITY, e.data.density);
      Theme.apply();
    }
  });
})();
