# Hospital MS — UX Design Contract (READ FIRST, OBEY EXACTLY)

Material Design 3 + Tailwind. No hardcoded hex outside the theme seed below. All files must use the SAME token names.

## Tailwind CDN config (paste VERBATIM into every prototype HTML, inside `<head>` after the CDN script)

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--bg) / <alpha-value>)',
        foreground: 'rgb(var(--fg) / <alpha-value>)',
        primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', foreground: 'rgb(var(--primary-fg) / <alpha-value>)' },
        'primary-container': { DEFAULT: 'rgb(var(--primary-container) / <alpha-value>)', foreground: 'rgb(var(--primary-container-fg) / <alpha-value>)' },
        secondary: { DEFAULT: 'rgb(var(--secondary) / <alpha-value>)', foreground: 'rgb(var(--secondary-fg) / <alpha-value>)' },
        outline: 'rgb(var(--outline) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--sc-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--sc-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--sc) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--sc-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--sc-highest) / <alpha-value>)',
        // status role colors (M3 tonal, referenced by name only)
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem' },
    },
  },
};
</script>
<style>
  :root {
    --bg: 248 249 252; --fg: 26 28 33;
    --primary: 46 91 173; --primary-fg: 255 255 255;
    --primary-container: 218 231 255; --primary-container-fg: 0 27 62;
    --secondary: 84 96 115; --secondary-fg: 255 255 255;
    --outline: 116 122 133;
    --sc-lowest: 255 255 255; --sc-low: 244 246 250; --sc: 238 241 246; --sc-high: 232 235 241; --sc-highest: 226 230 237;
    --success: 22 128 92; --warning: 176 122 12; --danger: 186 40 55; --info: 46 91 173;
  }
  .dark {
    --bg: 17 19 24; --fg: 226 229 236;
    --primary: 164 197 255; --primary-fg: 0 46 100;
    --primary-container: 25 71 140; --primary-container-fg: 218 231 255;
    --secondary: 188 199 220; --secondary-fg: 37 49 66;
    --outline: 141 147 158;
    --sc-lowest: 12 14 18; --sc-low: 26 28 33; --sc: 30 33 39; --sc-high: 41 44 51; --sc-highest: 52 56 64;
    --success: 118 220 176; --warning: 240 200 110; --danger: 255 158 165; --info: 164 197 255;
  }
  html { font-family: 'Inter', system-ui, sans-serif; }
</style>
```

## Status chip color mapping (use bg-*/10 tint + text-* + optional dot)
- pending / submitted / draft  = warning
- completed / paid / approved / active = success
- cancelled / denied / unpaid / inactive = danger
- checked_in / partially_paid / info = info

## Layout rules (LOCKED)
- Web pages: outer wrapper `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`. NO `max-w-[480px]` mobile frame anywhere except the sign-in page.
- Sign-in ONLY: centered card, `min-h-screen grid place-items-center`, card `w-full max-w-md`.
- App shell: sidebar left (desktop `lg:` fixed w-64), sticky header h-16 `bg-surface-container-high z-10`, content `bg-background`.
- Cards: `rounded-2xl border border-outline/10 bg-surface-container p-5`, `shadow-sm` only on raised cards.
- Dialogs: `shadow-lg`, backdrop z-50, content z-51.
- FAB: `fixed bottom-6 right-6 h-14 rounded-2xl bg-primary text-primary-foreground` (extended = with label + icon).
- Touch targets min 48px (`min-h-12`).
- Typography: H1 text-3xl/semibold, H2 text-2xl/semibold, H3 text-xl/semibold, card title text-lg/medium, body text-base, secondary text-sm, helper text-xs. Metric numbers text-3xl font-bold.
- Icons: inline SVG (Lucide paths) strokeWidth=2, 20/24px. Never emoji-only.
- Every list/table/page: empty state + loading skeleton + error state present (can be toggled/shown as demo blocks).
- Hover: `transition-colors duration-200 hover:bg-surface-container-high`.

## Roles & nav
Roles: Admin, Doctor, Nurse, Receptionist.
Nav modules: Dashboard, Patients, Appointments, Records, Billing, Admin (Admin-only: Users, Departments, Widget Library, Permissions, Reports).
Permission matrix: role × module (view/create/edit/delete).

## Widget catalog (keys)
todays-appointments, recent-patients, department-occupancy, revenue-month, pending-records, staff-on-duty, registration-queue, todays-schedule, vitals-queue, assigned-patients, vitals-entry.
Role defaults:
- Admin: todays-appointments, recent-patients, department-occupancy, revenue-month, pending-records, staff-on-duty
- Receptionist: todays-appointments, registration-queue
- Doctor: todays-schedule, pending-records, vitals-queue
- Nurse: assigned-patients, vitals-entry

## Seed mock data (use consistently)
- Departments: General, Pediatric, Cardiology, Emergency
- 10 doctors e.g. Dr. Sarah Chen (Cardiology), Dr. Amir Rahman (General), Dr. Lena Ortiz (Pediatric), Dr. Tom Blake (Emergency), etc.
- Patients e.g. Maria Santos (MRN-004821, DOB 1988-03-12), Budi Hartono (MRN-004822), etc. National IDs numeric.
- Language: labels English. (StatusChip variants keep English keys.)

## Components dir uses: TypeScript + Tailwind classes + `clsx`, dartdoc-style JSDoc (`/** ... */`), `const` components. No hex. Import React. Assume `clsx` available. Props typed with interfaces.
</content>
</invoke>
