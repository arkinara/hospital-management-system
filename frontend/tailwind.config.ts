import type { Config } from "tailwindcss";

/**
 * Hospital MS — compiled Tailwind config.
 * Every colour below resolves to a CSS variable seeded in
 * src/app/globals.css (the only place raw values live). No hex
 * appears here. Token contract: promax-prototype/DESIGN_SYSTEM.md
 * section 2, mirrored from prototype/theme.js.
 *
 * Both the prototype naming (background/foreground/muted/subtle)
 * and the semantic token names (fg, fg-muted, fg-subtle, outline,
 * surface-*) are exposed as utilities.
 */
const rgbVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: rgbVar("--bg"),
        foreground: rgbVar("--fg"),
        fg: rgbVar("--fg"),
        muted: rgbVar("--fg-muted"),
        "fg-muted": rgbVar("--fg-muted"),
        subtle: rgbVar("--fg-subtle"),
        "fg-subtle": rgbVar("--fg-subtle"),
        outline: rgbVar("--outline"),
        "outline-strong": rgbVar("--outline-strong"),
        primary: {
          DEFAULT: rgbVar("--primary"),
          foreground: rgbVar("--primary-fg"),
          container: rgbVar("--primary-container"),
          "container-foreground": rgbVar("--primary-container-fg"),
        },
        accent: {
          DEFAULT: rgbVar("--accent"),
          foreground: rgbVar("--accent-fg"),
          container: rgbVar("--accent-container"),
          "container-foreground": rgbVar("--accent-container-fg"),
        },
        surface: {
          0: rgbVar("--s0"),
          1: rgbVar("--s1"),
          2: rgbVar("--s2"),
          3: rgbVar("--s3"),
          4: rgbVar("--s4"),
        },
        success: {
          DEFAULT: rgbVar("--success"),
          container: rgbVar("--success-container"),
          "container-foreground": rgbVar("--success-container-fg"),
        },
        warning: {
          DEFAULT: rgbVar("--warning"),
          container: rgbVar("--warning-container"),
          "container-foreground": rgbVar("--warning-container-fg"),
        },
        danger: {
          DEFAULT: rgbVar("--danger"),
          container: rgbVar("--danger-container"),
          "container-foreground": rgbVar("--danger-container-fg"),
        },
        info: {
          DEFAULT: rgbVar("--info"),
          container: rgbVar("--info-container"),
          "container-foreground": rgbVar("--info-container-fg"),
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Lexend", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", '"Source Sans 3"', "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", '"Fira Code"', "ui-monospace", "monospace"],
      },
      fontSize: {
        // Density-8 scale. Body never drops below 14px on mobile.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1.125rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.875rem", { lineHeight: "1.5" }],
        md: ["0.9375rem", { lineHeight: "1.5" }],
        lg: ["1.0625rem", { lineHeight: "1.4" }],
        xl: ["1.25rem", { lineHeight: "1.3" }],
        "2xl": ["1.5rem", { lineHeight: "1.25" }],
        "3xl": ["1.875rem", { lineHeight: "1.2" }],
        "4xl": ["2.25rem", { lineHeight: "1.15" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "14px",
        "3xl": "18px",
      },
      boxShadow: {
        // Flat by default; elevation reserved for things that float.
        card: "0 1px 2px 0 rgb(2 8 23 / 0.04)",
        raised: "0 2px 6px -1px rgb(2 8 23 / 0.08), 0 1px 2px 0 rgb(2 8 23 / 0.04)",
        overlay: "0 16px 40px -8px rgb(2 8 23 / 0.28), 0 4px 12px -4px rgb(2 8 23 / 0.16)",
      },
      spacing: { 4.5: "1.125rem", 13: "3.25rem", 15: "3.75rem" },
      // min/max width and height resolve from the spacing scale so the
      // prototype's `min-h-11`, `min-w-56`, `max-w-32` and `h-dvh` utilities
      // all exist in the compiled build.
      minHeight: ({ theme }) => ({
        ...theme("spacing"),
        dvh: "100dvh",
        lvh: "100lvh",
        svh: "100svh",
      }),
      minWidth: ({ theme }) => ({ ...theme("spacing") }),
      maxWidth: ({ theme }) => ({ ...theme("spacing") }),
      zIndex: { nav: "20", sticky: "30", fab: "40", scrim: "50", overlay: "60", toast: "70" },
      transitionDuration: { fast: "120ms", DEFAULT: "180ms", slow: "260ms" },
    },
  },
  plugins: [],
};

export default config;