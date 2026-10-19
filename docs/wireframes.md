# JalSetu — Responsive Wireframes & Breakpoint Specification

Precise layout contracts for every view at every device class. This document
is the source of truth for responsive behaviour; implementations reference
these tokens (Tailwind v4 + `tailwind.config.ts`).

---

## 1. Breakpoint tokens

| Token | Width | Device class | Primary constraints |
|-------|-------|--------------|---------------------|
| base  | < 380px | Small phones (SE-class) | Single column, 16px gutters, bottom nav |
| `xs`  | ≥ 380px | Phones | Reveal secondary meta text |
| `sm`  | ≥ 640px | Large phones / small tablets | 2-col grids unlock, desktop search appears |
| `md`  | ≥ 768px | Tablets portrait | Time filter + badge row appear |
| `lg`  | ≥ 1024px | Tablets landscape / small laptop | **NavRail appears, bottom nav retires**, landing nav links inline |
| `xl`  | ≥ 1280px | Desktop | Event dossier gets its 340px evidence rail; command map 2-col |
| `2xl` | ≥ 1536px | Large desktop | Event queue becomes 3-col |
| `3xl` | ≥ 1600px | Wide monitors | Max content width holds, whitespace grows |

Touch ergonomics: `@media (pointer: coarse)` enlarges every interactive map
element to a ≥ 44px hit target (visual size stays restrained; hit area is a
transparent ring). All primary buttons are ≥ 44px tall on touch.

---

## 2. Application shells

### 2.1 Landing (public) — `#/`

```
base–sm (<640)                    lg+ (≥1024)
┌──────────────────┐              ┌────────────────────────────────┐
│ logo  ☰    Report│              │ logo   nav links   console ⧉  │
├──────────────────┤              ├────────────────────────────────┤
│ hero (1 col)     │              │ hero text      │ live readout  │
│ badge            │              │ (1.05fr)       │ HUD (0.95fr)  │
│ H1 2.6rem        │              │ H1 4.1rem      │               │
│ CTA full-width   │              └────────────────┴───────────────┘
├──────────────────┤              │ skyline panorama strip (h-56)  │
│ panorama h-32    │              └────────────────────────────────┘
│ live band        │
│ problem (stack)  │              gallery: 1col → sm:3 → 6 cards
│ how it works     │              (randomized contextual scenes)
│ gallery 1-col    │
│ console/evidence │
│ footer           │
└──────────────────┘
```
- Hamburger nav drawer ≤ lg. CTA buttons stack full-width ≤ sm.
- Hero panorama: h-32 / h-44 / h-56 at base/sm/lg, faded into background at
  top/bottom + sides (decorative, `aria-hidden`).

### 2.2 Console shell (all `#/…` views except landing)

```
< lg                              ≥ lg
┌──────────────────┐              ┌──────┬─────────────────────────┐
│ TopBar (h-14)    │              │TopBar│ NavRail (w-60)  │ main  │
│ ☰ logo 🔍  AD    │              │      │─────────────────│ crumb │
├──────────────────┤              │      │ ops group       │ view  │
│ view label + IST │              │      │ evidence group  │       │
├──────────────────┤              │      │ research group  │footer │
│                  │              │      │ weather card    │(mt-auto│
│ main content     │              │      └─────────────────│ sticky)│
│ (scroll)         │              └──────┴─────────────────────────┘
├──────────────────┤
│ MobileNav (h-22) │  ← fixed bottom, safe-area padded
└──────────────────┘
```
- Mobile search: expands under TopBar (`sm:hidden` toggle).
- `pb-22 sm:pb-19 lg:pb-0` on main clears the fixed bottom nav.
- Footer: `mt-auto` inside a `min-h-dvh flex-col` wrapper → sticky to bottom
  on short pages, pushed down naturally on long pages.

---

## 3. View wireframes

### 3.1 Command Center

```
base (<640)                md (≥768)                  xl (≥1280)
┌───────────────┐          ┌───────────────┬─────────┐ ┌───────────┬─────────┐
│ KPI grid 2×4  │          │ KPI grid 4×2  │         │ │ ops map   │ alerts │
│ (compact)     │          ├───────────────┴─────────┤ ├───────────┴─────────┤
├───────────────┤          │ ops map (h-80, full-w)  │ │ event queue         │
│ ops map h-64  │          ├─────────────────────────┤ │ 1col→md:2→2xl:3     │
├───────────────┤          │ rainfall strip          │ ├─────────────────────┤
│ alerts (stack)│          ├───────────────┬─────────┤ │ recent reports      │
├───────────────┤          │ event queue   │ recent  │ │ (scene thumbs)      │
│ event queue   │          │ 2-col         │ reports │ └─────────────────────┘
│ 1-col + thumb │          └───────────────┴─────────┘
├───────────────┤
│ recent reports│  KPI cards: base grid-cols-2 → md:grid-cols-4
└───────────────┘  Event rows carry 64×48 scene thumbnails (category-seeded)
```

### 3.2 Waterlogging Map

```
base                        lg (≥1024)
┌───────────────┐           ┌─────────────────────┬───────────────┐
│ breadcrumb    │           │ breadcrumb          │               │
│ filters row   │           │ filters row (inline)│ side panel    │
│ (h-scroll)    │           ├─────────────────────┤ (events list, │
├───────────────┤           │                     │ 320px, own    │
│               │           │   map canvas        │  scroll)      │
│  map canvas   │           │   (fills height)    │  rows with    │
│  (flex-1)     │           │                     │  scene thumbs │
│               │           │  layers panel FAB   │               │
├───────────────┤           ├─────────────────────┴───────────────┤
│ events list   │           │ legend (bottom-left overlay)        │
│ (below map)   │           └─────────────────────────────────────┘
└───────────────┘
```
- Filters horizontally scrollable on base (`no-scrollbar`), inline at lg.
- Popup (264px) with scene banner: fits 320px viewports; Escape closes.
- Markers: 22px visual / 26px + 12px ring hit area on touch.

### 3.3 Event Dossier

```
base                        xl (≥1280)
┌───────────────┐           ┌───────────────┬─────────────────────┐
│ header        │           │ header (full width, actions right)  │
│ (wrap, 44px   │           ├───────────────┼─────────────────────┤
│  back button) │           │ scene banner  │ tabs (scroll-x)     │
├───────────────┤           │ (h-36)       │─────────────────────│
│ scene banner  │           │ mini map h-64 │ Overview            │
│ (h-36)        │           │ (h-64)       │ · citizen reports   │
│ mini map h-52 │           │ quick facts  │ · infrastructure    │
│ quick facts   │           │ (340px rail, │ · risk assessment   │
├───────────────┤           │ own scroll)  │ · responsibility    │
│ tabs (h-      │           └───────────────┴─────────────────────┘
│  scroll-x)    │
│ tab panels    │  Everything stacks in one scroll column below xl.
└───────────────┘
```

### 3.4 Citizen Report (wizard)

```
base                        lg (≥1024)
┌───────────────┐           ┌─────────────────────┬───────────────┐
│ step chips    │           │ step chips          │ tracker card  │
│ (h-scroll)    │           ├─────────────────────┤ (scene thumb  │
├───────────────┤           │ wizard panels       │  + linked     │
│ wizard panel  │           │                     │  event)       │
│ (full width)  │           │                     │               │
├───────────────┤           │                     │               │
│ tracker card  │           └─────────────────────┴───────────────┘
└───────────────┘
```

### 3.5 Investigate / Responsibility / Verify / Analytics / Health

```
base: single column, panels stack, tables switch to card rows (data-mono
      keeps numeric rhythm), charts h-64.
md:  2-col grids for KPI clusters.
lg+: 2–3 col content grids; analytics keeps 1-col chart column with
     side stat rail at xl.
```

---

## 4. Shared components

| Component | < sm | sm–lg | ≥ lg |
|-----------|------|-------|------|
| GlobalSearch | toggle row under TopBar | inline in TopBar (max-w-xl) | + `/` shortcut hint |
| Search results | full-width sheet, grouped (Events / Reports / Assets), 48×36 scene thumbs | same | same |
| TimeFilter | hidden (filters live in map view) | compact `24h/7d/All` chip | full label |
| MobileNav | 5 primary destinations, fixed bottom | same | retired |
| EventRow | thumb 64×48 + stacked meta | same | same, 2–3 col grid |
| Map popup | 264px card: scene banner + badges + actions | same | same |
| Panel | full width | full width | inline in grids |

---

## 5. Compatibility & verification matrix

Verified per release (agent-browser, headless Chromium):

| Check | 390×844 | 768×1024 | 1440×900 |
|-------|---------|----------|----------|
| No horizontal overflow — all 10 views | ✅ | ✅ | ✅ |
| Sticky footer (short page) / push (long) | ✅ | ✅ | ✅ |
| Hamburger + drawer | ✅ | n/a | n/a |
| Bottom nav clear of content | ✅ | ✅ | n/a |
| Touch targets ≥ 44px (pointer: coarse) | ✅ | ✅ | n/a |
| Map popup fits viewport | ✅ | ✅ | ✅ |
| Body text ≥ 12px (micro-label eyebrows 9–11px, wide tracking, uppercase) | ✅ | ✅ | ✅ |

Browser support: evergreen Chromium/Firefox/Safari (MapLibre GL WebGL);
graceful degradation: map error boundary + `prefers-reduced-motion` disables
all non-essential animation.
