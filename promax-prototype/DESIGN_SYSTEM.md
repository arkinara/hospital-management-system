# Hospital MS — Pro Max design system

The contract every page in `promax-prototype/prototype/` obeys. Tokens live in
`prototype/theme.js`; nothing below may be restated as a raw hex value in a page.

Generated with the `ui-ux-pro-max` design intelligence for the query
`healthcare hospital management clinical dashboard admin data-dense`, with dials
**variance 5 / motion 4 / density 8**, then tightened for clinical use.

---

## 1. Positioning

| Dimension | Decision | Why |
|---|---|---|
| Pattern | Real-time operations console | Staff arrive with a task in flight, not to browse |
| Style | Data-dense dashboard, flat surfaces, hairline borders | Maximum legible data per screen; elevation reserved for things that float |
| Variance | 5/10 — balanced, orthogonal grid | A clinical tool should be unsurprising; novelty is a cost here |
| Motion | 4/10 — 120–260 ms, purposeful only | Motion explains cause and effect; nothing decorative |
| Density | 8/10 — compact on pointer, comfortable on touch | Ward staff scan tables; phone users tap |

**Anti-patterns explicitly rejected:** ornate decoration, unfiltered lists, colour as
the only carrier of meaning, gradients or shadows laid over data, emoji as icons.

---

## 2. Colour

Clinical blue primary, amber accent, slate neutrals. Every pair below meets WCAG AA
(4.5:1 text, 3:1 large glyphs and chart marks) in **both** themes — the dark palette
is a separate design, not an inversion.

### Semantic tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F8FB` | `#080B11` | Page ground |
| `--fg` | `#0F172A` | `#E2E8F0` | Body text |
| `--fg-muted` | `#475569` | `#9CACBF` | Secondary text |
| `--fg-subtle` | `#64748B` | `#8292A6` | Tertiary, still ≥4.5:1 |
| `--primary` | `#1E40AF` | `#93BBFF` | Primary action, active nav, key data series |
| `--primary-container` | `#DBEAFE` | `#1E3A8A` | Selected rows, active nav ground |
| `--accent` | `#B45309` | `#FBBF24` | Highlight; never a second primary |
| `--outline` | `#CBD5E1` | `#2C3646` | Hairlines |
| `--outline-strong` | `#94A3B8` | `#5A6980` | Input borders (3:1 vs surface) |
| `--s0…--s4` | `#FFF → #E0E8F1` | `#11161F → #2A3547` | Surface ramp: cards, wells, hover, pressed |
| `--success` | `#15803D` | `#4ADE80` | Paid, completed, in range |
| `--warning` | `#B45309` | `#FBBF24` | Pending, above target |
| `--danger` | `#B91C1C` | `#FCA5A5` | Unpaid, denied, critical |
| `--info` | `#1D4ED8` | `#93BBFF` | Booked, checked in |

### Rules

- Raw hex appears **only** in the `:root` / `.dark` seed block in `theme.js`.
- Every status carries an **icon plus** its colour (`UI.chip`, `UI.acuityBadge`), so
  meaning survives colour-blindness and greyscale printing.
- Acuity is a four-step ordered scale with distinct glyphs:
  `critical` siren · `urgent` triangle · `standard` circle · `routine` dotted circle.
- Charts pass through `Charts.color()`, which resolves to the same CSS variables, so a
  theme switch retints every mark with no JS re-render.

---

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| Display / headings | **Lexend** | Designed for reading fluency; strong accessibility record |
| Body / UI | **Source Sans 3** | Neutral, wide language coverage, excellent at 13–15 px |
| Data | **Fira Code** via `.num` | Tabular figures so MRNs, currency and vitals never reflow |

`font-display: swap` on all three; only the weights in use are requested.

### Scale (density-8)

```
2xs 11px  chips, table meta          lg   17px  card title
xs  12px  helper, captions           xl   20px  H3
sm  13px  dense table cells (≥1024)  2xl  24px  H2
base 14px body                       3xl  30px  H1, metric numbers
md  15px  emphasis
```

Body never falls below 14 px on mobile (iOS auto-zoom guard). 13 px cells apply only
at pointer widths, where `compact` density is active.

Weights: 700 metrics · 600 headings and labels · 500 medium · 400 body.
Line height 1.5–1.6 for prose, 1.25–1.4 for headings. Prose measure capped so lines
stay in the 60–75 character band.

---

## 4. Density

Two modes on `<html data-density>`, persisted in `localStorage`, and switchable from
the header, the command palette, or `Shift+D`.

| Variable | compact (≥1024px only) | comfortable |
|---|---|---|
| `--row-h` | 40px | 52px |
| `--cell-py` | 5px | 10px |
| `--card-pad` | 14px | 20px |
| `--gap` | 12px | 16px |
| `--cell-fs` | 13px | 14px |

**Compact is gated behind `min-width: 1024px`.** Below that every interactive row
falls back to comfortable so touch targets stay ≥44px. Spacing follows a 4 px rhythm:
`4 · 8 · 12 · 16 · 24 · 32`.

---

## 5. Shape, elevation, layout

- Radii: `4 / 6 / 8 / 10 / 12 / 14px`, pills for chips and avatars. Sharper than a
  consumer app — a data tool reads as precise, not soft.
- Elevation: **flat by default.** `shadow-card` on raised cards, `shadow-overlay` only
  on dialogs, drawers, menus and toasts. No shadow ever sits over data.
- Shell: fixed 240px sidebar at `lg:`, 56px sticky header, `max-w-[1400px]` content
  wrapper with `px-3 sm:px-4 lg:px-6`. No mobile-frame width cap on app pages; sign-in
  is the only centred card.
- Breakpoints: 375 / 768 / 1024 / 1440. No horizontal page scroll at any width —
  wide tables scroll inside their own container, and under 768px they render as cards.
- Z-index scale: `nav 20 · sticky 30 · fab 40 · scrim 50 · overlay 60 · toast 70`.
- Safe areas: `pb-safe` on the bottom nav and every fixed bottom bar.

---

## 6. Motion (tier 4/10)

| Purpose | Duration | Easing |
|---|---|---|
| Hover, colour, press | 120–180ms | `ease-out` |
| Enter (`.anim-in`) | 200ms | `cubic-bezier(.2,.7,.3,1)` |
| Sheet / dialog | 220ms | same, from the trigger's direction |
| Grid stagger | 35ms per item, capped at 350ms | once, on first paint |

Press feedback is `scale(.985)` — it never changes layout bounds. `prefers-reduced-motion`
collapses every duration to ~0 and swaps the skeleton shimmer for a static block.

---

## 7. Component contract

Implemented in `prototype/ui.js`; TypeScript equivalents in `components/`.

| Primitive | Guarantees |
|---|---|
| `UI.shell` | Skip link, permission-derived nav, role switcher, command palette, density and theme controls, mobile drawer + bottom nav capped at 5, global shortcuts |
| `UI.table` | Sticky header with `aria-sort`, keyboard-sortable columns, row selection with a bulk bar offering Undo, card fallback <768px, and generated loading / empty / error states |
| `UI.field` | Visible label, required marker plus screen-reader text, persistent helper, blur-time validation, `role="alert"` message under the field, password reveal, semantic `type`/`inputmode`/`autocomplete` |
| `UI.validateForm` | Error summary with anchor links, focus moved to the first invalid field |
| `UI.dialog` | Focus trap, Escape to close, focus returned to the trigger, dirty-state confirm before dismissal |
| `UI.toast` | `aria-live="polite"`, never steals focus, 4s auto-dismiss (7s with Undo), stays open while hovered or focused |
| `UI.chip` / `UI.acuityBadge` | Icon plus colour, never colour alone |
| `UI.metric` | Number, unit, signed delta with a direction icon, baseline label, optional sparkline |
| `UI.dashboard` | Role defaults + per-user order + admin locks; drag **and** arrow-key reordering; remove with Undo |
| `Charts.*` | `role="img"` with an insight-bearing label, `<table>` alternative behind "View data", tooltips on hover **and** focus, interactive legend, subtle gridlines |

### Buttons

`primary` (one per screen) · `accent` · `danger` · `outline` · `subtle` · `ghost`.
Minimum height 44px (`min-h-11`); `h-9` compact variants only where a 44px hit area is
still guaranteed by surrounding padding. Disabled uses reduced opacity **plus** the
`disabled` attribute and a cursor change.

---

## 8. States

Every data region declares four children and the header strip switches all of them at
once — states are demonstrable without stacking four copies down the page.

```html
<div data-states>
  <div data-state="ready">…</div>
  <div data-state="loading" hidden>…skeleton…</div>
  <div data-state="empty"   hidden>…icon, cause, next action…</div>
  <div data-state="error"   hidden>…cause, retry, trace id…</div>
</div>
```

Keyboard: `1` `2` `3` `4`. Empty states name the cause and offer the next action.
Error states name the cause, offer Retry, and show a trace id.

---

## 9. Accessibility floor

Non-negotiable, verified per page:

1. Contrast ≥4.5:1 for text and ≥3:1 for large glyphs and chart marks, in both themes.
2. Focus visible everywhere: 2px ring, 2px offset, never removed.
3. Full keyboard operation, including sorting, reordering, charts and the palette.
4. Touch targets ≥44px with ≥8px separation; compact density is pointer-only.
5. Colour never the sole carrier of meaning.
6. Labels visible; placeholders are examples, never labels.
7. Errors announced with `role="alert"`, focus moved to the first invalid field.
8. `prefers-reduced-motion` respected; charts remain readable with no animation.
9. Every chart has a table alternative and a summary that states the takeaway.
10. Landmarks and heading order: one `h1` in the header, sequential below it.
11. Drag-and-drop always has a keyboard equivalent.
12. Destructive actions are visually and spatially separated, confirmed, and undoable.

---

## 10. Content rules

- Error messages state the **cause and the fix**: “National ID must be exactly 16
  digits (you entered 14)”, never “Invalid input”.
- Numbers carry a baseline: “61 appointments, +11% vs last Tuesday”, never a bare 61.
- Chart summaries state the insight, not the axes.
- Currency: `Rp 1.750.000` (Indonesian grouping, no decimals); millions as `Rp 1,3 jt`
  only in tight KPI tiles.
- Dates `YYYY-MM-DD` in data, `9 Sep 2026` in prose. Times 24-hour, `WIB`.
- Destructive confirmations list consequences as bullets, not one long sentence.
