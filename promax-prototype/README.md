# promax-prototype

A ground-up revamp of `ux-prototype`, built as a **separate folder with identical page
numbering** so the two can be compared page for page.

```
promax-prototype/
├─ README.md                 ← you are here
├─ DESIGN_SYSTEM.md          ← the token, type, density, motion and a11y contract
├─ components/               ← TypeScript components matching the new system
└─ prototype/
   ├─ index.html             ← viewer, with side-by-side compare against ux-prototype
   ├─ theme.js               ← tokens, light/dark, density, persisted prefs
   ├─ data.js                ← one seed dataset shared by every page
   ├─ ui.js                  ← app shell, dialogs, forms, dense-table engine, palette
   ├─ charts.js              ← accessible inline-SVG charts
   └─ 01…15-*.html           ← the fifteen pages, same numbers as the original
```

## Open it

Open `promax-prototype/prototype/index.html` in a browser. No build step, no install.

Press **`c`** for compare mode: Pro Max on the left, the original `ux-prototype` page
on the right, same page number, same theme, same density.

> The compare pane loads `../../ux-prototype/prototype/<same file>` as a relative path.
> Opening from the filesystem works in Chrome and Edge. If your browser blocks the
> nested iframe, serve the repo root instead — `python -m http.server` from
> `C:\devai\hospital-management-system`, then browse to
> `/promax-prototype/prototype/index.html`.

### Viewer keys

| Key | Action |
|---|---|
| `1`–`9`, `0` | Jump to page |
| `↑` `↓` `←` `→` | Previous / next page |
| `c` | Compare with the original |
| `t` | Light / dark |
| `v` | Compact / comfortable density |
| `m` `s` `l` `d` `f` | 375 / 768 / 1024 / 1440 / full width |

### In-page keys

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette — patients, actions, destinations |
| `g` then `p` `a` `b` `r` `d` | Go to patients / appointments / billing / records / dashboard |
| `1` `2` `3` `4` | Preview ready / loading / empty / error state |
| `d` · `Shift+D` | Dark mode · compact density |
| `?` | Shortcut list |
| `Esc` | Close any dialog, sheet or drawer |

---

## What changed, and why

### Architecture

The original repeated the whole app shell, nav, header, status-chip and table markup in
each of its fifteen files, and carried three competing token definitions
(`DESIGN_CONTRACT.md`, `SHARED_THEME.md`, `prototype/theme.js`) that disagreed on
palette and variable names.

Here there is **one** token source (`theme.js`), **one** seed dataset (`data.js`), and a
small runtime (`ui.js`, `charts.js`) that owns the chrome and the interaction
primitives. A page file contains only what that page is about. Fixing a focus ring or a
chip colour is a one-line change that lands on all fifteen pages.

### Design language

| | Original | Pro Max |
|---|---|---|
| Palette | Teal M3 seed | Clinical blue + amber accent on slate; light and dark designed separately |
| Type | Inter throughout | Lexend display · Source Sans 3 body · Fira Code for all data (tabular figures) |
| Density | One fixed comfortable scale | Two modes; compact gated to ≥1024px so touch targets stay ≥44px |
| Shape | `rounded-2xl` everywhere | 4–14px scale; sharper, reads as precise rather than soft |
| Elevation | `shadow-sm` on most cards | Flat with hairlines; elevation only for things that actually float |
| Status | Colour chip | Icon **plus** colour, so meaning survives greyscale and colour-blindness |

### Behaviour the original did not have

- **Command palette** (`⌘K`) over patients, actions and destinations, plus `g`-prefixed
  jumps — the fastest path for staff who already know where they are going.
- **Role switcher that actually re-renders the navigation** from the permission matrix.
  Nav is derived from `DB.permissions`, never hard-coded per role, so the RBAC story is
  demonstrable rather than asserted.
- **One state switcher per page** instead of four stacked demo blocks. Every data
  region declares ready / loading / empty / error and the header strip flips all of
  them together.
- **Dense table engine**: sticky header with `aria-sort`, keyboard sorting, row
  selection with a bulk bar that offers **Undo**, and a card layout under 768px so
  nothing scrolls sideways.
- **Accessible charts, hand-rolled in SVG**: `role="img"` with a summary that states
  the takeaway, a real `<table>` behind “View data”, tooltips on hover **and** keyboard
  focus, an interactive legend, and marks that retint on theme change with no re-render.
- **Undo on every destructive action** — deactivate, remove widget, void invoice,
  discard, bulk deactivate — rather than a confirm dialog and no way back.
- **Keyboard drag-and-drop.** Widget reordering works by mouse and by focusing a handle
  and pressing `←` `→`.
- **Blur-time validation with fix-it copy.** “National ID must be exactly 16 digits
  (you entered 14)”, an error summary with anchor links, and focus moved to the first
  invalid field.
- **Autosave** on the visit note, with the save state written out in words.

### Domain logic made visible

The PRD's hard parts are prototyped as interactions, not described in labels:

- **Duplicate detection** (patient list, receptionist dashboard) runs as you type on
  national ID and name+DOB, shows the matching record inline, and **blocks the save**
  until you either link to it or explicitly confirm a different person — an override
  that says out loud it is logged.
- **Conflict-aware booking** makes a clashing slot an unreachable disabled button
  rather than a post-submit rejection, and separately catches the case where the
  *patient* is double-booked elsewhere at that time, with a resolution path.
- **Contraindication check** on prescriptions blocks signing a visit note that
  prescribes against a recorded allergy.
- **Claim lifecycle** is a stepper showing where a claim actually is, with the denial
  reason and the appeal deadline, not just a status label.
- **Admin widget locks** win over per-user layout, and disabling a locked widget is
  surfaced as the contradiction it is.
- **Permission matrix** enforces its own dependency — create, edit or delete without
  view is meaningless, so view is granted alongside and revoking view revokes the rest
  — with a diff review before saving and a plain-English read-back per role.
- **Bed capacity** guards: a department's bed count cannot be set below its occupied
  count, and a department with admitted patients cannot be closed.

### Accessibility

Twelve floor items are listed in `DESIGN_SYSTEM.md` §9 and verified per page: contrast
in both themes, focus rings never removed, full keyboard operation including charts and
reordering, ≥44px touch targets, colour never load-bearing on its own, visible labels,
`role="alert"` errors with focus management, `prefers-reduced-motion`, table
alternatives for every chart, sequential headings, and destructive actions separated,
confirmed and reversible.

---

## Known scope

This is a prototype: state lives in memory and resets on reload, all data is the seed
set in `data.js`, and the twelve patients stand in for the PRD's hundred. Tailwind runs
from the Play CDN for zero-build editing — a production build would compile the same
config. The `components/` directory is the TypeScript expression of the same contract
and is not wired into the HTML pages.
