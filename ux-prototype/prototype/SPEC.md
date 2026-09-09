# Prototype page build spec (READ FIRST — shared by every page)

All pages are standalone HTML, Tailwind Play CDN, mock data inline. M3 tokens ONLY (via theme.js).
Loaded inside an iframe by `index.html` viewer. NO `mx-auto max-w-[480px]` mobile frames (except sign-in).

## Mandatory <head> block (paste verbatim, adjust <title>)
```html
<!doctype html><html lang="en" class=""><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PAGE TITLE — Hospital MS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="theme.js"></script>
<script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-background text-foreground antialiased">
```
End every page with `<script>lucide.createIcons();</script></body></html>`.
Use Lucide via `<i data-lucide="name" class="w-5 h-5"></i>` (stroke 2 default).

## Roles + nav (role-aware). Nav modules:
Dashboard, Patients, Appointments, Records, Billing, Admin (submenu: Users, Departments, Widget Library, Permissions, Reports).
- Admin: all + Admin submenu. Doctor: Dashboard, Patients, Appointments, Records. Nurse: Dashboard, Patients, Records. Receptionist: Dashboard, Patients, Appointments, Billing.

## AppShell markup (reuse on every non-auth page — desktop sidebar + sticky header)
- Outer: `<div class="min-h-screen flex">`
- Sidebar (desktop ≥1024): `<aside class="hidden lg:flex flex-col w-64 shrink-0 bg-surface-container-high border-r border-outline/10">` brand + nav list. Active item: `bg-primary/10 text-primary`. Inactive: `text-foreground/80 hover:bg-surface-container-highest`. Items are `rounded-xl px-3 py-2.5 flex items-center gap-3 text-sm font-medium` (min touch 44px).
- Main col: `<div class="flex-1 flex flex-col min-w-0">`
  - Header: `<header class="sticky top-0 z-10 h-16 bg-surface-container-high/95 backdrop-blur border-b border-outline/10 flex items-center gap-4 px-4 sm:px-6">` — mobile hamburger (lg:hidden), page title, spacer, search icon, dark toggle (onclick toggles `document.documentElement.classList.toggle('dark')`), avatar (rounded-full ring-2 ring-background).
  - Content: `<main class="flex-1 p-4 sm:p-6 lg:p-8 bg-background">` — inner wrapper `mx-auto max-w-7xl w-full` allowed (desktop-first, NOT a mobile frame cap).
  - Mobile bottom nav: `<nav class="lg:hidden sticky bottom-0 z-10 bg-surface-container-high border-t border-outline/10 flex justify-around">` 4-5 icon items, min h-14.

## Typography: H1 text-3xl font-semibold, H2 text-2xl font-semibold, H3 text-xl font-semibold, card title text-lg font-medium, body text-base, secondary text-sm text-foreground/70, helper text-xs.
## Cards: `bg-surface-container rounded-2xl p-5 border border-outline/10 shadow-sm`.
## StatusChip: rounded-full px-2.5 py-0.5 text-xs font-medium. pending=amber-100/amber-800, completed/paid=emerald-100/emerald-800, cancelled/denied/unpaid=rose-100/rose-800, booked/submitted=blue-100/blue-800. (dark: use /20 bg + -300 text.)
## MetricCard: bg-surface-container rounded-2xl p-5 — label text-sm/70, number text-3xl font-bold, trend row (arrow icon + % emerald/rose).
## FAB extended: `fixed bottom-6 right-6 z-30 h-14 rounded-2xl bg-primary text-primary-foreground px-5 flex items-center gap-2 shadow-lg`.
## EVERY list/table MUST show: populated state + an inline empty-state block (icon + heading + subtext + CTA) + a skeleton example (use `.skl` class or animate-pulse) somewhere visible (a commented/secondary section or a "loading" demo card). At minimum render the empty-state markup for one filter/section and a skeleton row block so all three states are demonstrable.
## Error state: page-level error card (icon + message + Retry button) — include on data pages as a hidden/secondary block or dedicated demo.
## Responsive: mobile 375 → desktop 1440. Touch targets ≥44px. Sidebar hidden on mobile (bottom nav instead).

## Mock data (use consistently)
- Departments: General, Pediatric, Cardiology, Emergency.
- Doctors: Dr. Sari Wibowo (Cardiology), Dr. Adi Nugroho (General), Dr. Lina Hartono (Pediatric), Dr. Rendra Pratama (Emergency), Dr. Maya Kusuma (General), + more.
- Patients: Budi Santoso (MRN P-001042, DOB 1978-03-12), Siti Rahayu (P-001108, 1990-07-22), Agus Salim (P-000997, 1965-11-02), Dewi Lestari (P-001155, 2015-01-30 Pediatric), Rina Wijaya (P-001200, 1988-09-14).
- Currency: Rp (IDR), e.g. Rp 350.000.
- Copy language: mostly English UI; validation messages may mirror UX-pattern examples. Keep consistent within a page.
- Today = 9 Sep 2026.

## Widgets catalog (6): Today's Appointments, Recent Patients, Department Occupancy, Revenue This Month, Pending Records, Staff On Duty. Plus role widgets: Registration Queue, Today's Schedule, Vitals Queue, Assigned Patients, Vitals Entry, Care Plan.
