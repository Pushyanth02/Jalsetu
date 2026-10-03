# JalSetu — Responsive Wireframes & Accessibility Spec

This document is the layout contract for JalSetu. It describes **what each
screen looks like at each breakpoint**, the **DOM / focus order** assistive
technology sees, and the **accessibility rules** every view must keep. Use it
as the reference when building or reviewing UI.

It maps 1:1 onto the implementation in `src/components/app/**` and the tokens in
`src/app/globals.css`.

---

## 1. Breakpoint tiers

JalSetu is a single code path, not a separate mobile app. Tailwind v4 reads
`@theme` in `globals.css`, so the custom tiers below are real utilities
(`xs:`, `3xl:`), not config-only.

| Tier | Min width | Token | Primary device |
| --- | --- | --- | --- |
| Phone (narrow) | 320px | — | iPhone SE, small Androids |
| Phone | 380px | `xs` | Most modern phones |
| Phone (wide) | 640px | `sm` | Large phones, small tablets portrait |
| Tablet | 768px | `md` | iPad portrait |
| Tablet (landscape) / small laptop | 1024px | `lg` | iPad landscape |
| Desktop | 1280px | `xl` | Laptops |
| Ultrawide | 1600px | `3xl` | Large monitors |

**Content cap:** every full-width section uses `.content-wrap`
(`max-width: 1440px; margin-inline: auto`) so ultrawide screens centre rather
than stretch.

**Type:** fluid `clamp()` tokens (`--text-fluid-xs`, `--text-fluid-sm`) plus
responsive text sizes; body copy never overflows a 320px viewport.

---

## 2. Application shell

The console (every route except `/`) shares one shell: sticky `TopBar`,
desktop `NavRail`, scrolling `main`, and a fixed mobile `MobileNav`.

### 2.1 Phone (`< 640px`)

```
┌───────────────────────────────────────────────┐
│ ☰   ◈ JalSetu                        🔍   AD  │  TopBar  h-14, sticky, z-30
├───────────────────────────────────────────────┤
│ MENU LABEL                          18:40 IST │  context row (lg:hidden)
├───────────────────────────────────────────────┤
│ Home › View label                             │  ViewBreadcrumb
├───────────────────────────────────────────────┤
│                                               │
│                                               │
│                VIEW CONTENT                   │  main, id="main"
│           (single column, p-3/4)              │  pb-22 clears bottom nav
│                                               │
│                                               │
├───────────────────────────────────────────────┤
│ JalSetu · synthetic · not live                │  AppFooter
│ footer links (wrapped)                        │
└───────────────────────────────────────────────┘
┌───────────────────────────────────────────────┐
│  Cmd    Map      (＋)      Verify   Analytics │  MobileNav, fixed, z-40
│                  Report                       │  safe-area bottom padding
└───────────────────────────────────────────────┘
```

- Left nav becomes an off-canvas **drawer** (menu button), `w-[84%]`,
  `max-w-[320px]`, opens below the TopBar.
- Search collapses to an icon; tapping expands a full-width search bar.
- Table/page chips (`TimeFilter`, `LocationChip`) are hidden; the current view
  label + IST clock move to their own context row.
- The centre **Report** action is a raised 56px FAB in the bottom bar.

### 2.2 Tablet (`640–1023px`)

```
┌───────────────────────────────────────────────────────┐
│ ☰  ◈ JalSetu   [ global search ──────── ]  🔔  AD    │  TopBar h-16
├───────────────────────────────────────────────────────┤
│ Home › View label                           18:40 IST │
├───────────────────────────────────────────────────────┤
│                                                       │
│   VIEW CONTENT (may use sm: 2-col grids)              │
│                                                       │
├───────────────────────────────────────────────────────┤
│ footer                                                 │
└───────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────┐
│   Cmd     Map      (＋)      Verify    Analytics      │  MobileNav
└───────────────────────────────────────────────────────┘
```

- Search is inline (not an icon).
- The **NavRail stays hidden**; navigation is still the drawer + bottom bar.
- Location/time chips remain hidden (they return at `xl`).

### 2.3 Desktop (`≥ 1024px`)

```
┌───────────────┬───────────────────────────────────────────────────────┐
│ ◈ JalSetu     │ [ global search ─────── ]  24h ▾  🔔  synth  Del  AD │ TopBar
│               ├───────────────────────────────────────────────────────┤
│ OPERATIONS    │ Home › View label                                     │
│ ▸ Command 12  ├───────────────────────────────────────────────────────┤
│ ▸ Map         │                                                       │
│ ▸ Events      │                     VIEW CONTENT                      │
│ EVIDENCE FLOW │              (multi-column at xl/3xl)                 │
│ ▸ Investigate │                                                       │
│ ▸ Links       │                                                       │
│ ▸ Verify      ├───────────────────────────────────────────────────────┤
│ ▸ Report      │ footer                                                │
│ RESEARCH      │                                                       │
│ ▸ Analytics   │                                                       │
│ ▸ Health      │                                                       │
│ [weather card]│                                                       │
└───────────────┴───────────────────────────────────────────────────────┘
```

- Persistent `NavRail` (`w-60`, `xl:w-66`), grouped Operations / Evidence flow /
  Research, with a live active indicator bar and weather card.
- `MobileNav` is removed (`lg:hidden`).
- Bottom padding on `main` returns to `lg:pb-0`.

### 2.4 Ultrawide (`≥ 1600px` / `3xl`)

- Content caps at 1440px and centres (`.content-wrap`).
- Extra header detail appears: `TimeFilter` shows the full label, the model
  provider chip expands (`2xl:`), and the NavRail reads the widest `xl:` width.
- Multi-column view grids do not stretch past the content cap.

---

## 3. View wireframes

### 3.1 Landing (`#/`, public)

Own document-style header (h-16), no ops shell.

```
PHONE                          TABLET                    DESKTOP
┌──────────────────┐           ┌────────────┐            ┌──────────────┬────────────┐
│ ◈ JalSetu  Rep ☰ │           │ header +   │            │ HERO copy    │ live       │
├──────────────────┤           │ inline nav │            │ h1 + CTAs    │ readout    │
│ ● Research pilot │           ├────────────┤            │              │ panel      │
│ H1 (2.6rem)      │           │ HERO       │            └──────────────┴────────────┘
│ body             │           │ (stacked)  │            ┌──────────────────────────┐
│ [Open console]   │           ├────────────┤            │ live band (5 cols)       │
│ [Explore map]    │           │ live band  │            ├──────────────────────────┤
├──────────────────┤           │ (3 cols)   │            │ problem rows 3-col grid  │
│ live readout     │           ├────────────┤            ├──────────────────────────┤
├──────────────────┤           │ problem /  │            │ pipeline 4-col grid      │
│ live band 2-col  │           │ pipeline / │            ├──────────────────────────┤
├──────────────────┤           │ console /  │            │ console index 3-col      │
│ problem (stack)  │           │ gallery /  │            ├──────────────────────────┤
├──────────────────┤           │ evidence / │            │ gallery 3-col            │
│ pipeline 1-col   │           │ CTA all    │            ├──────────────────────────┤
│ …                │           │ stacked    │            │ evidence + CTA 2-col     │
├──────────────────┤           └────────────┘            ├──────────────────────────┤
│ footer (stacked) │                                     │ footer 4-col             │
└──────────────────┘                                     └──────────────────────────┘
```

- Hero: `lg:grid-cols-[1.05fr_0.95fr]`.
- Live band: `grid-cols-2 → sm:grid-cols-3 → lg:grid-cols-5`.
- Pipeline: `1 → sm:grid-cols-2 → lg:grid-cols-4`.
- Console index: single list on phone, `lg:grid-cols-3` groups.
- Mobile menu is an inline expanding `<nav id="landing-mobile-nav">`, toggled by
  an `aria-controls` button, dismissed with **Escape**.

### 3.2 Command Center (`#/command`)

```
PHONE                         DESKTOP (xl)
┌──────────────────┐          ┌───────────────────────────────┬───────────────┐
│ header + badges  │          │ KPI  KPI  KPI  KPI            │ Recent reports│
├──────────────────┤          ├───────────────────────────────┤               │
│ KPI  KPI (2-col) │          │                               ├───────────────┤
│ KPI  KPI         │          │   OPS MAP  (60dvh)  + layers  │ Alerts        │
├──────────────────┤          │                               ├───────────────┤
│ OPS MAP 52dvh    │          ├───────────────────────────────┤ Response by   │
├──────────────────┤          │ rainfall strip               │ agency        │
│ rainfall strip   │          └───────────────────────────────┴───────────────┘
├──────────────────┤          ┌───────────────────────────────────────────────┐
│ Recent reports   │          │ Active event queue                            │
├──────────────────┤          └───────────────────────────────────────────────┘
│ Alerts           │
├──────────────────┤
│ Response by agy  │
├──────────────────┤
│ Event queue      │
└──────────────────┘
```

- KPIs: `grid-cols-2 → xl:grid-cols-4`. Each KPI is a link that sets a map
  filter and navigates (title carries the plain-language meaning).
- Map/rail: stacked below `xl`, two columns at `xl`
  (`grid-cols-[1.62fr_1fr]`).

### 3.3 Map Explorer (`#/map`)

```
PHONE                                   DESKTOP (lg)
┌───────────────────────┐               ┌──────────────┬──────────────────────┐
│ header                │               │ FILTER RAIL  │  MAP (flex-1)        │
├───────────────────────┤               │  w-72        │  legend + Locate Me  │
│ [Filters & Layers] Rep│               │  time/risk/  ├──────────────────────┤
├───────────────────────┤               │  status/cat/ │  event list (h-56)   │
│                       │               │  jurisdiction│                      │
│   MAP (46dvh)         │               │  layers      ├──────────────────────┤
│   legend + Locate Me  │               │  rainfall    │  counts + report →   │
├───────────────────────┤               └──────────────┴──────────────────────┘
│ event list (h-64)     │
├───────────────────────┤               Filters open a vaul bottom sheet
│ counts + report →     │               (max-h-[85dvh], drag handle) on < lg.
└───────────────────────┘
```

- Legend starts **collapsed** below `sm` so it never buries the small canvas.
- Filter rail content is shared between the desktop aside and the mobile sheet.
- Event list pages at 40 rows (`show more`), badges are `aria-pressed`.

### 3.4 Field Verification (`#/verify`)

```
PHONE                          DESKTOP (xl)
┌──────────────────┐           ┌────────┬────────┬────────┬────────┬────────┐
│ header + filters │           │Unassign│Assigned│In Field│Verified│Reopened│
├──────────────────┤           │        │        │        │        │        │
│ Unassigned       │           │ card   │ card   │ card   │ card   │ card   │
│  [card] [card]   │           │ card   │ card   │        │        │        │
├──────────────────┤           │        │        │        │        │        │
│ Assigned         │           └────────┴────────┴────────┴────────┴────────┘
│  [card] …        │           Columns fill height and scroll independently.
├──────────────────┤
│ In Field …       │           Phone: one stacked column per stage, each
│ Verified …       │           capped at max-h-[46vh] and scrollable.
│ Reopened …       │
└──────────────────┘
```

- Tapping a card opens a Radix `Dialog` (focus-trapped by Radix) with the stage
  form; the dialog body scrolls inside `85dvh`.

### 3.5 Report wizard (`#/report`)

```
PHONE                         TABLET / DESKTOP
┌──────────────────┐          ┌────────────────────────────────────────┐
│ header           │          │ header                                 │
├──────────────────┤          ├────────────────────────────────────────┤
│ Track a Report   │          │          max-w-3xl, centred            │
├──────────────────┤          │  ┌──────────────────────────────────┐  │
│ ①─②─③─④─⑤ (scroll)│          │  │ Track a Report                   │  │
├──────────────────┤          │  ├──────────────────────────────────┤  │
│ map preview      │          │  │ ① Location ② Issue ③ Evidence … │  │
│ [lat] [lng]      │          │  ├──────────────────────────────────┤  │
│ [area] [landmark]│          │  │ map preview                      │  │
│ [Describe …]     │          │  │ [lat] [lng]   [area] [landmark]  │  │
├──────────────────┤          │  │ … step content …                 │  │
│ [Back] 1 of 4 [→]│          │  ├──────────────────────────────────┤  │
└──────────────────┘          │  │ [Back]        1 of 4        [→] │  │
                              │  └──────────────────────────────────┘  │
                              └────────────────────────────────────────┘
```

- Step progress is a horizontal, scrollable `ol` with `aria-current="step"`.
- Option cards: `grid-cols-1 → sm:grid-cols-2` (issue), `grid-cols-2 →
  lg:grid-cols-4` (severity).
- Form fields are **44px tall on touch** (`h-11 sm:h-9`) and 16px font on
  phones (iOS zoom guard, set globally in `globals.css`).

### 3.6 Analytics (`#/analytics`) & Health (`#/health`)

- Research-integrity banner pinned at the top of Analytics (amber, `role="note"`).
- Tab strip is horizontally scrollable below `sm`.
- Headline comparisons: table on mobile (scroll region) → 2-col approach cards at
  `md`; operational panels `1 → xl:grid-cols-2`.
- Charts sit in fixed-height containers so `ResponsiveContainer` never collapses.

---

## 4. DOM & focus order

Landmarks are consistent so screen-reader users can jump between them.

**Public landing**

1. `body` → skip link (`Skip to content`)
2. `header` → brand (h1 context) → primary nav → console/report CTAs → menu toggle
3. `main` sections in visual order (hero → live band → problem → pipeline →
   console → gallery → evidence → CTA)
4. `footer` (nav labelled "footer" inside)

**Console shell**

1. Skip link → `main#main` (focused on route change)
2. `TopBar` (`header`): menu toggle → brand → search (+ `/` shortcut) →
   time window → alerts → location → user
3. `ViewBreadcrumb` (`nav aria-label="Breadcrumb"`) → current page marked
   `aria-current="page"`
4. `main#main` view content, then `AppFooter` (`nav aria-label="Footer"`)
5. `MobileNav` (`nav aria-label="Primary mobile"`) — last in DOM, fixed at the
   bottom; no focus trap (always reachable).

**Overlays**

- Radix `Dialog` / vaul `Drawer` (verification dialog, map filter sheet) handle
  focus trap + Escape natively.
- The hand-rolled **mobile nav drawer** now matches them via
  `useModalA11y`: focus moves in on open, Tab cycles, Escape closes, background
  scroll is locked, and focus returns to the menu toggle on close.

---

## 5. Accessibility checklist

Apply to every new view or component.

### Structure & semantics

- [ ] Exactly one `h1` per view; headings descend without skipping levels.
- [ ] Wrap regions in the right landmark (`header` / `nav` / `main` / `footer`
      / `section`); repeated `nav`s carry distinct `aria-label`s.
- [ ] Interactive controls are real `<button>` / `<a>`, not clickable `div`s.
- [ ] Icon-only controls have an `aria-label`; decorative icons are
      `aria-hidden`.

### Keyboard

- [ ] Everything reachable and operable by keyboard, in a logical tab order.
- [ ] Visible focus ring on every focusable element (`:focus-visible` uses the
      `--ring` token globally).
- [ ] Custom overlays trap focus, close on Escape, lock background scroll, and
      restore focus (`useModalA11y`).
- [ ] A skip link precedes the shell; `main` has `id="main"` and `tabIndex={-1}`.
- [ ] `/` focuses global search (desktop); Escape closes menus and the search bar.

### Forms

- [ ] Every field has a `<label>` (visible or `sr-only`); hints are wired with
      `aria-describedby`.
- [ ] Invalid fields set `aria-invalid` and the message is announced.
- [ ] Submit results use `aria-live="polite"`; errors use `role="alert"`.
- [ ] 16px minimum input font on phones (prevents iOS zoom).

### Colour, contrast & motion

- [ ] AA contrast throughout: aqua `#2dd4bf` on ink is > 7:1; filled aqua
      buttons use near-black ink text, never white.
- [ ] Colour is never the only signal — status/risk/severity badges always pair
      a colour with text and/or a symbol.
- [ ] `prefers-reduced-motion: reduce` disables transforms and shortens
      animations (global rule + `useReducedMotion` in the motion kit).

### Touch & targets

- [ ] Interactive targets are ≥ 44×44px on touch (`h-11` on mobile, `.touch-target`).
- [ ] No content sits under the fixed bottom bar (shell reserves `pb-22`).
- [ ] Safe-area insets respected (`env(safe-area-inset-bottom)`).

### Data tables

- [ ] Horizontally scrollable tables are a focusable `role="region"` with a
      label so keyboard/AT users can scroll them.

### Zoom & reflow

- [ ] `viewport` allows zoom (`maximumScale: 5`); layout reflows at 320px CSS
      width with no horizontal page scroll.
- [ ] Text remains usable at 200% browser zoom.

---

## 6. Manual verification matrix

Run the app (`bun run dev`), open devtools device emulation, and check each row.
Use **both** a touch profile (for hover/`pointer: coarse` behaviour) and a
mouse profile.

| Width | Check |
| --- | --- |
| 320px | No horizontal page scroll; bottom bar clears content; wizard inputs ≥ 44px |
| 390px | Landing hero readable; map legend collapsed; drawer opens/closes |
| 414px | Report wizard steps reachable; no clipped badges |
| 640px | Tablet header: inline search, condensed chips |
| 768px | Two-column grids appear; verification columns stack cleanly |
| 1024px | NavRail appears; bottom bar gone; map rail beside map |
| 1280px | Command Center 4-KPI row + two-column map/rail |
| 1600px | Content capped at 1440px and centred; expanded header detail |
| 1920px | No stretched sections; whitespace balanced |
| 200% zoom | Reflows without clipping; all controls still operable |

Also verify:

- **Keyboard only:** Tab through the shell, open/close the drawer with Enter +
  Escape, trap check inside the verification dialog, scroll a wide Analytics
  table with the arrow keys once focused.
- **Screen reader:** land on the page, jump by landmark, confirm `aria-current`
  on the active nav item and `aria-live` on submission results.
- **Reduced motion:** enable the OS setting and confirm count-ups/reveals stop
  animating (content appears instantly).
- **No-JS/SSR:** the shell renders, then the map loads lazily (`ssr: false`).

Automated gates: `bun run typecheck` and `bun run lint` must pass; the
`build:pages` static export is the release smoke test.
