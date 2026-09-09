# Shared M3 theme — Hospital Management System UX

## Rule: NO hex literals anywhere except the CSS variable seed block below. Use token classes only.

## Prototype HTML `<head>` — paste this EXACT block into every prototype page

```html
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          background: 'rgb(var(--background) / <alpha-value>)',
          foreground: 'rgb(var(--foreground) / <alpha-value>)',
          surface: 'rgb(var(--surface) / <alpha-value>)',
          'surface-container-low': 'rgb(var(--surface-container-low) / <alpha-value>)',
          'surface-container': 'rgb(var(--surface-container) / <alpha-value>)',
          'surface-container-high': 'rgb(var(--surface-container-high) / <alpha-value>)',
          'surface-container-highest': 'rgb(var(--surface-container-highest) / <alpha-value>)',
          outline: 'rgb(var(--outline) / <alpha-value>)',
          muted: 'rgb(var(--muted) / <alpha-value>)',
          primary: {
            DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
            foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
            container: 'rgb(var(--primary-container) / <alpha-value>)',
          },
        },
      },
    },
  };
</script>
<style>
  :root {
    --background: 247 249 249;
    --foreground: 24 30 30;
    --surface: 255 255 255;
    --surface-container-low: 242 245 245;
    --surface-container: 236 240 240;
    --surface-container-high: 228 234 234;
    --surface-container-highest: 220 227 227;
    --outline: 112 122 122;
    --muted: 88 98 98;
    --primary: 13 121 122;
    --primary-foreground: 255 255 255;
    --primary-container: 190 235 232;
  }
  .dark {
    --background: 14 20 20;
    --foreground: 224 229 229;
    --surface: 20 27 27;
    --surface-container-low: 26 34 34;
    --surface-container: 30 39 39;
    --surface-container-high: 38 48 48;
    --surface-container-highest: 46 57 57;
    --outline: 130 140 140;
    --muted: 150 160 160;
    --primary: 80 210 205;
    --primary-foreground: 0 40 40;
    --primary-container: 0 60 60;
  }
  * { scrollbar-width: thin; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  .skeleton { background: linear-gradient(90deg, rgb(var(--surface-container)) 25%, rgb(var(--surface-container-high)) 37%, rgb(var(--surface-container)) 63%); background-size: 400% 100%; animation: sk 1.4s ease infinite; }
  @keyframes sk { 0% { background-position: 100% 50% } 100% { background-position: 0 50% } }
</style>
```

## Icons
Use inline Lucide SVG (stroke-width 2, 20 or 24px), or `<i data-lucide="name">` + `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons()` at end of body. Never emoji-only.

## Status colors (STANDARD tailwind palette, allowed for status chips only)
- pending / draft / submitted → amber: `bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300`
- completed / paid / approved / active → emerald: `bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300`
- cancelled / denied / unpaid → rose: `bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300`
- info / booked / partially_paid → blue: `bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300`
StatusChip base: `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium`

## Layout rules (DESKTOP-FIRST)
- Authenticated pages: outer wrapper NOT centered-card. Sidebar (w-64, hidden on mobile, icon-rail collapse) + sticky header `h-16 bg-surface-container-high z-10` + content area. Content wrapper: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6`.
- NEVER `max-w-[480px]` or mobile-frame caps on app pages. ONLY the sign-in page is a centered card (`min-h-screen grid place-items-center`).
- Cards: `rounded-2xl bg-surface-container p-5 border border-outline/10 shadow-sm`. Dialogs: `shadow-lg`.
- Shape: rounded-2xl main cards, rounded-xl standard, rounded-full pills/avatars/FAB is rounded-2xl w-14 h-14.
- Typography: H1 text-3xl/semibold, H2 text-2xl/semibold, H3 text-xl/semibold, card title text-lg/medium, body text-base, secondary text-sm text-muted, helper text-xs.
- Metric number: text-3xl font-bold.
- Touch targets ≥ 48px (min-h-[48px] on rows/buttons).
- Hover: `transition-colors duration-200 hover:bg-surface-container-high`.
- EVERY list/table/page needs empty state, loading skeleton, error state (show them, don't just describe).

## Sidebar nav (role-aware) — modules per role
- Admin: Dashboard, Patients, Appointments, Records, Billing, Admin (Users/Departments/Widgets/Permissions), Reports
- Doctor: Dashboard, Patients, Appointments, Records
- Nurse: Dashboard, Patients, Records
- Receptionist: Dashboard, Patients, Appointments, Billing
Active item: `bg-primary-container text-foreground` with left accent; inactive: `text-muted hover:bg-surface-container-high`.

## Roles / seed data
4 roles: Admin, Doctor, Nurse, Receptionist. 10 doctors, 4 departments (General, Pediatric, Cardiology, Emergency), 100 patients, 30 days history. Use realistic Indonesian-context mock names (mix). Error/validation copy in Indonesian per UX spec (e.g. "Email tidak valid", "Wajib diisi"), UI labels in English is fine.
