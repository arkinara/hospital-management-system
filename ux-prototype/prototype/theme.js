/**
 * Shared M3 theme for all prototype pages.
 * Load AFTER the Tailwind Play CDN script:
 *   <script src="https://cdn.tailwindcss.com"></script>
 *   <script src="theme.js"></script>
 * Maps M3 design tokens to Tailwind color utilities backed by CSS vars,
 * so bg-surface-container-high / text-foreground / bg-primary work + dark mode.
 */
(function () {
  const v = (name) => `rgb(var(${name}) / <alpha-value>)`;
  window.tailwind = window.tailwind || {};
  window.tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          background: v('--background'),
          foreground: v('--foreground'),
          primary: { DEFAULT: v('--primary'), foreground: v('--primary-foreground') },
          outline: v('--outline'),
          'surface-container-low': v('--surface-container-low'),
          'surface-container': v('--surface-container'),
          'surface-container-high': v('--surface-container-high'),
          'surface-container-highest': v('--surface-container-highest'),
          surface: v('--surface-container'),
        },
        borderRadius: { '2xl': '1rem', xl: '0.75rem' },
        fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      },
    },
  };
  const css = `
    :root{
      --background:245 247 249; --foreground:24 32 40;
      --primary:13 128 118; --primary-foreground:255 255 255;
      --outline:100 116 130;
      --surface-container-low:240 243 246;
      --surface-container:233 238 242;
      --surface-container-high:224 231 236;
      --surface-container-highest:214 224 230;
    }
    .dark{
      --background:14 18 22; --foreground:224 231 236;
      --primary:52 189 176; --primary-foreground:6 24 22;
      --outline:130 146 160;
      --surface-container-low:22 28 33;
      --surface-container:28 35 41;
      --surface-container-high:36 45 52;
      --surface-container-highest:44 55 63;
    }
    html{font-family:Inter,system-ui,sans-serif}
    *:focus-visible{outline:2px solid rgb(var(--primary));outline-offset:2px}
    @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
    .skl{background:linear-gradient(90deg,rgb(var(--surface-container-high)) 25%,rgb(var(--surface-container-highest)) 37%,rgb(var(--surface-container-high)) 63%);background-size:400% 100%;animation:skl 1.4s ease infinite}
    @keyframes skl{0%{background-position:100% 50%}100%{background-position:0 50%}}
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();
