# SafeCommand — UX Design Decisions

**Status:** Living document — single source of truth for UX/UI architecture.
**Owner:** Sachin Sablok (Founder)
**Created:** 2026-05-03
**Last updated:** 2026-05-03
**Audience:** Solo founder + future engineering hires + Claude Code agents executing UX work
**Related:** [`AWS-process-doc-IMP.md`](./AWS-process-doc-IMP.md) (infra) · [`DAILY-OPS.md`](./DAILY-OPS.md) (ops routine)

---

## Purpose

This document captures every UX/UI design decision for SafeCommand — what we chose, why, what we rejected, and how to extend it. Update it whenever a UX decision is made or revisited. It is the design memory that prevents bikeshedding and architectural drift.

When implementation diverges from this doc, either update the doc OR push back on the implementation. Code that fights the design language is a bug.

---

## Table of contents

1. [Design principles](#1-design-principles)
2. [Platform strategy](#2-platform-strategy)
3. [Responsive design model](#3-responsive-design-model)
4. [Navigation architecture](#4-navigation-architecture)
5. [Information hierarchy — Zone Board](#5-information-hierarchy--zone-board)
6. [Color & severity language](#6-color--severity-language)
7. [Touch targets & accessibility](#7-touch-targets--accessibility)
8. [Tabular data on mobile](#8-tabular-data-on-mobile)
9. [Loading, empty & error states](#9-loading-empty--error-states)
10. [Phasing & rollout plan](#10-phasing--rollout-plan)
11. [Decision log](#11-decision-log)
12. [Open questions / future work](#12-open-questions--future-work)

---

## 1. Design principles

These are the lenses through which every decision is evaluated. If a proposed design violates one, justify or reject it.

### 1.1 Operations-grade, not consumer-grade
SafeCommand is a venue safety operations tool. Operators in 3 AM scenarios need clarity, not delight. Design language is closer to **hospital control rooms / airline NOTAM systems** than Instagram or Notion. No animation flourishes that don't carry information. No greenness for "it's all fine" because that breeds alarm fatigue.

### 1.2 Density beats discoverability
GMs glance at boards repeatedly throughout a shift. Information that's compact and always visible beats information that's pretty but requires extra taps. We are NOT optimizing for first-time users browsing a feed.

### 1.3 Severity owns color, type owns icon, time owns urgency
Don't overload color with multiple meanings. Color = severity. Icon = incident type. Pulsing/age = how fresh the issue is. Mixing creates confusion at 3 AM.

### 1.4 Mobile is the default form factor
GMs are mobile during incidents — walking floors, in elevators, away from desks. Dashboard must be **as good on a phone as on desktop**, not a degraded fallback.

### 1.5 Reading load — max 20 words before any action
NFR-05: critical safety screens cap at 20 words of reading. Headlines, not paragraphs. Numerals and icons over sentences.

### 1.6 3-tap maximum to any action
NFR-04: from notification → submitted action ≤ 3 taps. Every navigation choice is evaluated against this budget.

### 1.7 Touch targets ≥48×48dp on touch devices
NFR-08: never make a venue staffer aim a fingertip at a 32px button. Tap targets are big, even when the visual indicator inside them is small.

### 1.8 Predictable, scannable hierarchies
GMs scan in F-shape patterns. Most-important info top-left, secondary top-right, tertiary stacked below. No surprise placement.

---

## 2. Platform strategy

### Decision: **Pure responsive web — Phase 1; PWA-enable in Phase 2**

| Approach | Status | Notes |
|----------|--------|-------|
| **Pure responsive web** | ✅ adopted | Works in any browser, no install, same URL across devices, fits NFR-19 (solo-buildable) |
| **Progressive Web App** | 🔜 Phase 2 | Service worker, offline cache, push via web — when first GM asks "can I install this?" |
| **Native mobile shell (RN)** | ❌ rejected | Duplicates effort; mobile app already covers ground staff role; GMs are different user |

**Rationale for the rejection of native mobile shell:** SafeCommand already has the Expo mobile app for ground staff (BR-04 GS, FS, SC roles). The GM role uses the dashboard. Building a second app for GMs duplicates auth, builds, releases, and store reviews — a cost we cannot afford in Phase 1. Web responsive gives 95% of native-feel UX with 1/10th the maintenance cost.

**When PWA enablement is justified:**
- A GM customer asks for "install on home screen" experience
- We need offline view of zone board (currently pulls from API every 5s)
- We want web-push notifications for non-mobile-app GMs
- All three are Phase 2+ concerns

---

## 3. Responsive design model

### Decision: **Responsive (single DOM, breakpoint-driven layout) — Tailwind utility classes**

| Pattern | Status | Notes |
|---------|--------|-------|
| **Responsive (single DOM, CSS reshape)** | ✅ adopted | One codebase, Tailwind handles breakpoints |
| Adaptive (different DOM/components per breakpoint) | ❌ rejected | Doubles maintenance, divergent behavior |

### Tailwind breakpoint conventions for SafeCommand

| Breakpoint | Width | Form factor | Layout strategy |
|------------|-------|-------------|-----------------|
| (default) | <640px | Mobile portrait | Single column, drawer hidden, bottom-sheet style |
| `sm:` | ≥640px | Mobile landscape, small tablet | 2-column grids where helpful |
| `md:` | ≥768px | Tablet portrait, small laptop | Drawer toggleable, more horizontal density |
| `lg:` | ≥1024px | Desktop, tablet landscape | Drawer becomes persistent sidebar (pinned by default) |
| `xl:` | ≥1280px | Wide desktop | Up to 4-column zone grids, more horizontal real estate |
| `2xl:` | ≥1536px | Ultra-wide | Same as xl, just bigger gutters |

### Specific transitions

- **Sidebar pinned by default** at `lg:` and above
- **Sidebar collapses to drawer** below `lg:`
- **Tables** become **stacked cards** below `md:`
- **Multi-column dashboards** stack vertically below `md:`
- **Form fields** widen to comfortable touch size below `md:`

---

## 4. Navigation architecture

### Decision: **Slide-over drawer with semantic categorization — pin/collapse on desktop, swipe-and-tap on mobile**

### 4.1 Why a drawer (not bottom tabs, not hamburger menu without drawer)

We started with bottom-tab bar as the leading candidate. Rejected because the nav scope grows from current 5 items to 12+ within 2 sprints (Custom Tasks, Compliance, Equipment, Visitors, Settings, FAQ, Support). Bottom tabs cap at 5; this would force a redesign mid-build.

Hamburger without a drawer (just a top-bar dropdown) loses categorization. Drawer with categorization scales to 30+ items, gives spatial categorization (top = frequent, bottom = rare), and provides a familiar consumer mental model.

### 4.2 Drawer behavior matrix

| Property | Mobile (<lg:) | Desktop (≥lg:) |
|----------|---------------|----------------|
| **Default state** | Closed (hamburger icon visible top-left) | Pinned open (240–280px wide) |
| **Trigger** | Tap ☰ icon, OR swipe-from-left edge | Click pin/collapse toggle |
| **Width when open** | 80% of screen, max 320px | Fixed 240px (or user-collapsed to icon-rail 64px) |
| **Backdrop** | Semi-transparent black, tap to close | None (no backdrop in pinned mode) |
| **Animation** | 250ms slide-in from left | Pin/collapse: 200ms width transition |
| **Close on nav item tap** | Yes (auto-dismiss) | No (stay pinned, just navigate) |
| **Active item indicator** | Bold + accent border-left + colored bg | Same |
| **Swipe-to-close** | Yes — swipe left | N/A |
| **Esc key to close** | Yes | N/A (or yes for collapse) |

### 4.3 Pin/collapse state on desktop

The drawer on desktop has **two modes**:

| Mode | Width | Shows |
|------|-------|-------|
| **Pinned** (default) | 240px | Full labels + icons + section headers |
| **Collapsed** | 64px (icon rail) | Icons only, hover/long-tap to reveal label tooltip |

Toggle: small ⇿ pin/unpin button at the top of the drawer. State persists per-user in `localStorage` so power users keep their preference.

### 4.4 Categorization scheme

Convention: **group by frequency-of-use AND semantic role.** Most-used at top, rare at bottom.

```
┌─────────────────────────────────┐
│ ☰  SafeCommand                  │
│ ─────────────────────────────── │
│  GM Avatar · venue name         │  ← header: context
│  health score · live indicator  │
│ ─────────────────────────────── │
│  PRIMARY                        │  ← Group 1 — daily glances
│  • Dashboard                    │
│  • Zone Board                   │
│  • Incidents                    │
│  • Broadcast      [NEW badge]   │
│ ─────────────────────────────── │
│  OPERATIONS                     │  ← Group 2 — weekly use
│  • Tasks (custom)               │
│  • Shift Handovers              │
│  • Briefings                    │
│  • Visitors (VMS)               │
│ ─────────────────────────────── │
│  COMPLIANCE                     │  ← Group 3 — monthly/quarterly
│  • Equipment                    │
│  • Certifications               │
│  • Audit Logs                   │
│  • Compliance Exports           │
│ ─────────────────────────────── │
│  PEOPLE                         │  ← Group 4 — admin
│  • Staff                        │
│  • Roles & Permissions          │
│ ─────────────────────────────── │
│  SETTINGS                       │  ← Group 5 — bottom: rare
│  • Venue Profile                │
│  • Notifications                │
│  • FAQ & Help                   │
│  • Contact Support              │
│ ─────────────────────────────── │
│  [Logout]                       │  ← terminal action: footer
└─────────────────────────────────┘
```

### 4.5 Why these 5 groups

| Group | Mental model | Examples that fit |
|-------|-------------|-------------------|
| **PRIMARY** | "What's happening right now?" | Dashboard, Zone Board, Incidents, Broadcast |
| **OPERATIONS** | "Run the shift / day" | Tasks, Handovers, Briefings, Visitors |
| **COMPLIANCE** | "Prove we did it / audit prep" | Equipment, Certifications, Audit, Exports |
| **PEOPLE** | "Who's involved" | Staff, Permissions |
| **SETTINGS** | "Configure the system" | Venue profile, Notifications, Help |

When adding a new feature, ask: which mental bucket would a GM put this in? That determines the group.

### 4.6 Header section of drawer

Always-visible, sticky as the rest scrolls:
- Avatar circle (initials)
- GM name
- Venue name + venue code (e.g. SC-MAL-HYD-00042)
- Live health score (large numeral with severity-coded color)
- Live "X" badge if there's an active SEV1/SEV2

**Why:** GMs glance at this constantly. Saves a redundant nav trip to Dashboard just to check the score.

### 4.7 Active state, badges, hover

- **Active item**: bold weight + border-left in accent color + slight bg tint
- **Badge** (numeric): right-aligned, small red/orange circle for new/unread items (e.g., "2 new incidents", "1 new broadcast")
- **Hover** (desktop): slight bg lighten, cursor pointer
- **Focus ring** (keyboard nav): 2px outline in accent color — accessibility critical

### 4.8 Mobile gestures

| Gesture | Action |
|---------|--------|
| Tap ☰ in top bar | Open drawer |
| Swipe left edge → right | Open drawer |
| Tap nav item | Navigate + auto-close |
| Tap backdrop | Close |
| Swipe right → left on open drawer | Close |
| Esc key (external keyboard) | Close |

### 4.9 Component contracts (for implementation)

```typescript
// components/Drawer.tsx
interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pinned?: boolean;        // desktop only
  onPinToggle?: () => void; // desktop only
}

interface NavGroup {
  id: 'primary' | 'operations' | 'compliance' | 'people' | 'settings';
  label: string;
  items: NavItem[];
}

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;        // emoji or lucide-react icon
  href: string;
  badge?: { count: number; color: 'red' | 'orange' | 'yellow' };
  newBadge?: boolean;
}
```

---

## 5. Information hierarchy — Zone Board

### Decision: **Pattern C (floor → zone hierarchy) as default. Pattern D (building cross-section heatmap) as user-selectable alternative.**

### 5.1 Patterns considered

| Pattern | Description | Strength | Decision |
|---------|-------------|----------|----------|
| A — Floor tabs | Horizontal tabs across top, one floor at a time | One-tap floor isolation | Rejected — single-floor focus loses overview |
| B — Collapsible accordion | All floors stacked, expandable rows | All visible at once | Rejected — vertical scroll overwhelm |
| **C — 2-column floor + zone (desktop), drilldown (mobile)** | List of floors with summary, drill into zones | Best of both, scales 2–52 floors | ✅ **adopted as default** |
| **D — Building cross-section heatmap** | Spatial visualization, building shown as rows of zone cells | Spatial intuition for tall buildings | ✅ **adopted as alternate view** |

### 5.2 Pattern C — default view

**Layout matrix:**

| Form factor | Layout |
|------------|--------|
| Mobile (<md:) | **Drilldown.** Floor list view by default. Tap floor → full-screen zone view for that floor. Back button (or browser back) returns. |
| Tablet (md: to lg:) | 2-column on landscape, drilldown on portrait. |
| Desktop (≥lg:) | **2-column persistent.** Left: floor list (sticky, ~280px). Right: zones for selected floor (fluid). Click floor on left → zones update on right without page navigation. |

**Each floor in the list shows aggregate state:**
```
F2 — North Wing                    [4 of 12 zones with issues]
                                   🔴 1 SEV1   🟠 1 SEV2   🟡 2 ATTN
                                   • 14 staff covering · last update 3s
                                   ─────────────────────────────────
F3 — Patient Wards                 [all 8 zones clear]
                                   ✓ All clear · 7 staff · last update 1s
```

**Why this is better than today's flat grid:**
- Triage UX: glance at floors, drill only into the ones with issues
- Scales to 52-floor hotels without scroll fatigue
- Single-floor venues fall back gracefully (auto-drill to that floor)
- Reuses existing `floor_id` field on zones — no schema migration

### 5.3 Pattern D — alternate view (toggleable)

User can flip between Pattern C and Pattern D via a top-right toggle:

```
[ List ] [ Building ]
```

**Building view (Pattern D)** renders zones as a heatmap-style cross-section:

```
┌──────────────────────────────────────┐
│ Zone Board · Building View    [List] │
│ ─────────────────────────────────── │
│ F52  ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢                 │
│ ...                                  │
│ F4   ▢ ▢ ▢ 🟡 ▢ ▢ ▢ ▢                 │
│ F3   ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢                 │
│ F2   ▢ ▢ 🔴 ▢ ▢ ▢ ▢ ▢                 │
│ F1   ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢                 │
│ GF   ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢                 │
│                                      │
│ Tap a cell → zone detail bottom-sheet│
└──────────────────────────────────────┘
```

**Behavior:**
- Each cell = one zone. Color = severity. Glyph overlay = type (🔥 🩺 etc.)
- Cell tap → bottom sheet with full zone info (mobile) or right-rail panel (desktop)
- For tall buildings (>20 floors), view is vertically scrollable. Floors with issues are tagged in scroll-rail (think IDE minimap).
- Cell width adapts: many zones per floor → cells shrink (with min size), few zones → cells grow

**Why offer both:**
- Pattern C is **list-thinking** — works for any operator, any device
- Pattern D is **spatial-thinking** — appeals to security/facilities operators who pace floors
- User-selectable preference persists per-user in `localStorage`
- Default = C; D opt-in for power users

### 5.4 Data requirements for Pattern D

To render correctly, Pattern D ideally has:
- Zone position metadata (e.g., floor row, sequence on floor)
- Floor display order (which floor is on top in the building)

**For Phase 1 (June 2026 implementation):**
- Floor display order = floor.level_number (already in DB)
- Zone position within floor = sort by zone_id or zone.name (no spatial data yet)
- This gives a "rows of cells" layout that's good enough for v1

**For Phase 2:**
- Add `zones.display_x`, `zones.display_y` for true 2D positioning per floor
- Optionally render a floor-plan SVG underlay
- Defer until customer asks for it

### 5.5 Severity tally (already shipped, v2)

Live severity tally header (already in production from Zone Board v2):
- `1 SEV1 · 0 SEV2 · 2 SEV3 · 0 Contained` with severity-coded dots
- Reused unchanged in both Pattern C and Pattern D

### 5.6 Filter pills (already shipped)

Today: All / Active Incidents / Clear / No Coverage. **Reused unchanged.** Filters apply within the selected floor (Pattern C) or globally (Pattern D).

### 5.7 Coverage indicators (already shipped)

Each zone card shows:
- Avatar circles for assigned staff (max 2 shown + "+N more")
- "⊘ No staff assigned this shift" callout when empty
- 🔒 lock icon for 2-person-required zones

**Reused unchanged.**

---

## 6. Color & severity language

### Decision: **Severity dominates color. ALL_CLEAR is slate (not green). Type uses emoji glyph overlay.**

### 6.1 Severity palette (Tailwind classes)

| State | Card border | Card bg | Text/dot | Animation |
|-------|------------|---------|----------|-----------|
| **SEV1 critical** | `border-red-500` | `bg-red-50` | `text-red-700` / `bg-red-500` | pulse + pulsing ring overlay |
| **SEV2 urgent** | `border-orange-500` | `bg-orange-50` | `text-orange-700` / `bg-orange-500` | none |
| **SEV3 advisory** | `border-amber-400` | `bg-amber-50` | `text-amber-700` / `bg-amber-400` | none |
| **CONTAINED** | `border-purple-500` | `bg-purple-50` | `text-purple-700` / `bg-purple-500` | none |
| **ATTENTION** | `border-yellow-400` | `bg-yellow-50` | `text-yellow-800` / `bg-yellow-400` | none |
| **ALL_CLEAR** | `border-slate-200` | `bg-white` | `text-slate-500` / `bg-slate-300` | none |

### 6.2 Why slate for ALL_CLEAR (not green)

Hospital control rooms and aviation NOTAM systems specifically train against "green = all good" because operators stop scanning when they see green. Slate (neutral grey-blue) signals "nothing to see here, focus on color elsewhere" without inducing complacency. This is consistent with Datadog (grey for OK), PagerDuty (grey for resolved), and AWS CloudWatch (grey for OK).

### 6.3 Type glyphs (incident type)

Top-right of zone cards, stacked when multiple types active:
- 🔥 Fire
- 🩺 Medical
- 🛡️ Security
- ⚠️ Evacuation
- 🏗️ Structural
- 📋 Other

Plain unicode emoji for portability across platforms. No custom icon library needed in Phase 1.

### 6.4 Time-since chip

For incidents <5 min old: red chip "1m ago" pulsing.
5–60 min: amber chip "12m ago" static.
>60 min: grey chip "2h ago" muted.

### 6.5 Health score color (Dashboard home)

Same palette logic, applied to the 0–100 score:
- 95–100: slate (clear)
- 80–94: amber (attention)
- 60–79: orange (urgent)
- <60: red (critical), with pulse if dropping

---

## 7. Touch targets & accessibility

### Decision: **48×48dp minimum on touch contexts. Keyboard-navigable on desktop. WCAG AA color contrast.**

### 7.1 Touch target rules (NFR-08)

| Element | Min size on touch | Notes |
|---------|-------------------|-------|
| Buttons | 48×48dp | Even if visual indicator is smaller, hit area extends |
| Filter pills | min-h-12 (48px) | Bump from current `py-1.5` to `py-3` |
| Form inputs | min-h-12 | iOS auto-zoom triggers on <16px font; ensure font-size ≥16px |
| Toggle switches | 48×24px hit area | Visual toggle can be smaller |
| Drawer nav items | min-h-12 | Currently fine |
| Close buttons | 48×48dp | Add invisible padding around X icons |

### 7.2 Keyboard accessibility (desktop)

- All clickable elements must be `<button>` or `<a>`, not `<div onClick>`
- Tab order follows visual order
- Focus rings visible (Tailwind `focus:ring-2 focus:ring-offset-2`)
- Esc closes drawer, modals, bottom sheets
- Enter activates buttons; Space toggles checkboxes
- Arrow keys navigate within filter pills, severity tabs

### 7.3 Color contrast

WCAG AA: 4.5:1 for normal text, 3:1 for large text.
- Don't rely on color alone — incidents always have text label + icon + color
- Test with Chrome DevTools "Emulate vision deficiencies" → Protanopia, Deuteranopia, Tritanopia

### 7.4 Screen reader support

- Landmark roles: `<nav>`, `<main>`, `<aside>`
- `aria-label` on icon-only buttons
- `aria-live="polite"` on the zone status board so screen readers announce status changes
- `aria-current="page"` on active nav item

---

## 8. Tabular data on mobile

### Decision: **Stacked cards below `md:`. Table at `md:` and above.**

### 8.1 The table problem

Tables on mobile become horizontal-scroll nightmares. Users have to scroll right to see "what's the action button?", lose row context.

### 8.2 Card pattern

Same data, vertical layout:
```
┌─────────────────────────────────────┐
│ Incident #INC-2026-0431             │
│ 🔥 Fire · SEV1 · ACTIVE             │
│ Cafeteria · Floor 2                 │
│ Declared by: Sachin S.              │
│ Time: 2 min ago                     │
│ ─────────────────────────────────── │
│ [View details →]                    │
└─────────────────────────────────────┘
```

### 8.3 Implementation pattern

```tsx
{/* Desktop table */}
<div className="hidden md:block">
  <table>...</table>
</div>

{/* Mobile cards */}
<div className="md:hidden space-y-3">
  {items.map(item => <ItemCard key={item.id} {...item} />)}
</div>
```

Single source of data, two render paths.

### 8.4 Pages affected

- `/incidents` — incident list
- `/staff` — staff search
- `/audit` (future) — audit log
- `/equipment` (future) — equipment tracker
- `/visitors` (future) — VMS visitor log

---

## 9. Loading, empty & error states

### 9.1 Loading

Skeleton screens, not spinners. Match the shape of incoming content (zone card grid → grid of skeleton cards). Reuse Tailwind `animate-pulse` on muted-bg placeholders.

### 9.2 Empty states

Not "no data" — actionable empty:
- "No incidents in last 24h. ✓" (positive framing for clear state)
- "No staff assigned. [Assign staff]" (CTA when fixable)

### 9.3 Error states

- Network error: toast "Can't reach server — retrying every 5s" (non-blocking)
- Auth expired: redirect to login with friendly toast
- 500 error: "Something went wrong. Refresh or try again. Error ref: XXX-YYY"

### 9.4 Toast patterns

Top-right on desktop, top-banner on mobile. Auto-dismiss after 4s for info, 8s for warnings, manual-dismiss for errors. Use `react-hot-toast` or similar lightweight lib (defer dependency choice to implementation).

---

## 10. Phasing & rollout plan

> ⚠️ **Implementation deferred per May 2026 budget freeze.** Resumes 2 June 2026 per `JUNE-2026-REVIEW-REQUIRED.md`. Below is the executable plan when work resumes.

### Phase 0 — Pre-work (analysis & alignment) ✅ DONE 2026-05-03

This document IS Phase 0. Choices captured. User approved direction.

---

### Phase 1 — Layout foundation (~45 min, low risk)

**Goal:** Drawer + viewport meta + safe-area + responsive breakpoints — NO page content changes yet.

**Files touched:**
- `app/layout.tsx` — viewport meta tag, safe-area inset support
- `components/AppShell.tsx` — restructure to host the drawer
- `components/Sidebar.tsx` → migrate logic into new `components/Drawer.tsx`
- New: `components/Drawer.tsx` — slide-over drawer with categorization
- New: `components/DrawerHeader.tsx` — sticky GM/venue/health-score block
- New: `components/DrawerSection.tsx` — group of nav items
- New: `components/NavItem.tsx` — single nav row (icon + label + badge)
- New: `lib/drawer-state.ts` — pin/collapse state in localStorage

**Specifically deliver:**
- Hamburger ☰ in mobile top-bar
- Drawer slide-in/out animation
- Pin/collapse toggle on desktop
- All 5 categorization groups present, populated with current 4 nav items in PRIMARY group
- Future-grow placeholder: "Operations / Compliance / People / Settings" sections render with disabled-greyed items as a visual placeholder
- Logout in drawer footer
- Touch targets 48px+
- Keyboard-navigable
- localStorage persistence for pinned state

**Visual smoke test (your gate):**
- Open dashboard URL on phone → hamburger appears top-left → tap opens drawer with semi-transparent backdrop → all 5 groups visible → tap nav item closes drawer + navigates → tap backdrop closes drawer → swipe-from-left opens it
- Open on desktop → drawer is pinned by default at 240px → click pin button → drawer collapses to 64px icon rail → click again → expanded back → state persists across page reloads
- All 5 existing pages render in the new shell unchanged

**Your validation gate:** ✅ proceed / ❌ adjust before continuing

---

### Phase 2 — Login + Dashboard home responsive (~45 min, low risk)

**Goal:** Two simplest pages first, validate the responsive pattern.

**Files touched:**
- `app/login/page.tsx` — verify touch targets, single-column centered layout
- `app/dashboard/page.tsx` — health ring + KPIs reflow

**Specifically deliver:**
- Login: responsive padding, 48px+ touch targets on submit + OTP input, no horizontal overflow at any breakpoint
- Dashboard home: 
  - On `<md:`: vertical stack (health ring → active incidents card → zone summary), no horizontal scroll
  - On `md:+`: side-by-side (health ring | KPIs), wider screens add zone summary column
  - Numerals scale: text-3xl on mobile, text-5xl on desktop
  - Live severity tally adapts to 1-line on wide, 2-line on narrow

**Your validation gate:**
- Login flow on phone: feels native, easy thumb access to all controls
- Dashboard home on phone: scroll feels natural, no horizontal overflow, numerals readable
- Dashboard home on desktop: looks identical to today (no regression)
- Tablet (768px): tested

**Decision gate:** ✅ proceed / ❌ adjust

---

### Phase 3 — Zone Board with floor hierarchy + Pattern D toggle (~120 min, medium risk)

**Goal:** Pattern C as default + Pattern D as user-selectable alternate.

**Files touched:**
- `app/zones/page.tsx` — replace flat grid with floor-list view; reuse `ZoneCard` component
- New: `app/zones/[floorId]/page.tsx` — drilldown route for mobile (or use query param ?floor=)
- New: `components/FloorList.tsx` — left-rail floor list with summary
- New: `components/ZoneGrid.tsx` — extract zone-cards grid into reusable component
- New: `components/BuildingHeatmap.tsx` — Pattern D rendering
- New: `components/ZoneBottomSheet.tsx` — bottom-sheet for cell-tap detail in Pattern D
- New: `lib/zone-view-pref.ts` — localStorage for Pattern C vs D preference
- API: extend `GET /v1/zones/accountability` to include floor info (or add `GET /v1/floors/with-zone-summary` if separate query is cleaner)

**Specifically deliver:**
- **Mobile (<md:):**
  - Default: floor list view (vertical scrollable cards, one per floor with severity tally)
  - Tap floor → zones for that floor (full screen)
  - Back button returns to floor list
  - Single-floor venues skip floor list, go straight to zones
- **Desktop (≥md:):**
  - 2-column: floor list left (sticky, 280px), zone grid right (fluid)
  - Click floor on left → zone grid updates (no page nav, just state)
  - Selected floor highlighted in left list
- **Pattern toggle:**
  - Top-right of page: `[ List ▾ ] [ Building ]` toggle
  - Pattern D: building cross-section heatmap
  - Cell tap → bottom-sheet with full zone info
  - User preference persists per browser
- **Severity tally header** — reused unchanged
- **Filter pills** — apply within current floor (Pattern C) or globally (Pattern D)
- **5s polling** — unchanged behavior

**Your validation gate:**
- Mobile: floor list shows summary correctly, drilldown works, back button works
- Desktop: 2-column layout works, click floor on left changes zones on right
- Both patterns toggle cleanly
- Pattern D renders building correctly for our seeded venue (verify floor count)
- Sync still works: declare incident on mobile → zone updates within 5s in both views

**Pre-Phase-3 data check (during this phase, not Phase 0):**
- Verify seeded venue has multiple floors. If only one floor, Pattern D demo will look trivial — consider adding test data with 5+ floors.

**Decision gate:** ✅ proceed / ❌ adjust / ❌ Pattern D feels overengineered, drop it

---

### Phase 4 — Incidents + Staff (table → cards on mobile) (~40 min, low risk)

**Files touched:**
- `app/incidents/page.tsx`
- `app/staff/page.tsx`
- New: `components/IncidentCard.tsx` — mobile-card row
- New: `components/StaffCard.tsx`

**Specifically deliver:**
- Incidents page: table on `md:+`, card list on `<md:`. Same data, same actions.
- Staff page: table on `md:+`, card list on `<md:`. Search bar at top stays visible.

**Your validation gate:**
- Incidents on phone: scroll natural, severity color visible per card, tap card to see details
- Staff on phone: search input usable, results stack nicely
- Desktop unchanged

---

### Phase 5 — Polish + audit (~30 min)

**Specifically deliver:**
- Touch target audit: every button/pill/link verified ≥48px
- Font size audit: nothing under 14px on mobile
- Loading skeletons added where missing
- Empty states audited (no data → actionable copy)
- Color contrast pass (WCAG AA)
- Screen reader pass (`aria-label`, `aria-live`)
- Final regression check on desktop for all 5 pages

**Your validation gate:** quick walkthrough on phone of all pages.

---

### Total scope estimate

| Phase | Effort | Risk | Reversibility |
|-------|--------|------|---------------|
| Phase 0 | done | none | n/a |
| Phase 1 | 45 min | low | revert single commit |
| Phase 2 | 45 min | low | revert per page |
| Phase 3 | 120 min | medium | revert; Pattern D commit isolated |
| Phase 4 | 40 min | low | revert per page |
| Phase 5 | 30 min | none | n/a |
| **Total** | **~5 hours** | | |

Each phase commits independently. Bad phase reverts in isolation.

### What's explicitly NOT in this scope

- PWA service worker / offline / install — Phase 2 deferred
- Dark mode — separate ask
- Internationalization beyond existing English (NFR-36 Phase 2)
- Animation library beyond Tailwind transitions
- Real-time websockets re-introduction (deferred from May 2; polling stays)
- New backend APIs except possibly `GET /v1/floors/with-zone-summary` (add only if needed)
- Touching the mobile (Expo) app — separate project

---

## 11. Decision log

Append entries here as UX decisions are made. Format: date, decision, rationale, reversibility.

### 2026-05-03 — Pure responsive web for Phase 1, PWA in Phase 2
**Decision:** Build dashboard as pure responsive web. Defer PWA (service worker, offline) to Phase 2.
**Rationale:** Solo founder bandwidth (NFR-19). 95% of value with 10% of maintenance. PWA lifts justified only when first GM asks for "install on home screen."
**Reversibility:** High — PWA layers on top of existing web app non-invasively.

### 2026-05-03 — Slide-over drawer with semantic categorization
**Decision:** Replace today's persistent sidebar with a slide-over drawer that's pinned by default on desktop and toggleable on mobile. 5 semantic categories (PRIMARY / OPERATIONS / COMPLIANCE / PEOPLE / SETTINGS). Pin/collapse toggle on desktop. Swipe + tap on mobile. Auto-close on nav item tap (mobile only).
**Rationale:** Bottom tabs cap at 5 items; nav scope grows to 12+ within 2 sprints. Drawer scales to 30+ items without refactor. Categorization gives spatial mental model (top = frequent, bottom = rare). Industry standard pattern (Linear, Notion, GitHub mobile).
**Reversibility:** Medium — drawer component is decoupled, but reverting affects every page route.

### 2026-05-03 — Pattern C as default Zone Board view, Pattern D as alternate
**Decision:** Default Zone Board view is Pattern C (floor list + zone drilldown). User can toggle to Pattern D (building cross-section heatmap). Preference persists per browser.
**Rationale:** Pattern C aligns with operator mental model (floor-first thinking). Scales 2 to 52 floors. Pattern D appeals to security/facilities operators who pace floors and think spatially. Both patterns reuse the existing severity palette and incident-type glyphs.
**Reversibility:** High — Pattern toggle is opt-in; Pattern D can be gated behind feature flag.

### 2026-05-03 — Slate (not green) for ALL_CLEAR — confirmed
**Decision:** Reaffirm 2026-05-02 decision: ALL_CLEAR zones use slate, not green.
**Rationale:** Hospital alarm-fatigue principle. Datadog / PagerDuty / CloudWatch all use neutral grey for OK states.
**Reversibility:** High — color tokens centralized.

### 2026-05-03 — Tables become cards below `md:`
**Decision:** Use Tailwind `hidden md:block` / `md:hidden` to switch between table (desktop) and card-list (mobile) on Incidents, Staff, and future tabular pages.
**Rationale:** Tables on mobile become horizontal-scroll nightmares. Cards present same data vertically without losing context.
**Reversibility:** High — pattern is a few classes per page.

### 2026-05-03 — All implementation deferred to 2 June 2026
**Decision:** All Phase 1–5 work deferred per May 2026 budget freeze.
**Rationale:** Cost discipline; user-imposed budget cap.
**Reversibility:** N/A — date-gated.
**Trigger:** `JUNE-2026-REVIEW-REQUIRED.md` lifts on 2-June-2026.

---

## 12. Open questions / future work

These are deliberately deferred. Revisit at the relevant phase.

| # | Question | Defer to |
|---|----------|----------|
| 1 | Should drawer collapse state be per-user (server-stored) instead of per-browser (localStorage)? | Phase 2 PWA work |
| 2 | Should Pattern D have spatial X/Y zone positioning (true floor-plan SVG)? | Phase 2, customer-driven |
| 3 | Dark mode strategy? | Sprint 6+ |
| 4 | Should Hindi/Telugu/Kannada UI follow same drawer pattern? | NFR-36 Phase 2 |
| 5 | Compliance export PDF preview — modal or inline? | When BR-20 builds |
| 6 | Should there be a "presentation mode" for showing dashboard on big screens (e.g., security desk wall TV)? | Phase 2, customer-driven |
| 7 | Multi-venue switcher in drawer header (for chain customers)? | When chain customer signs |
| 8 | Should the drawer header show on-call hierarchy (current SH, current Shift Commander)? | Phase 2 |
| 9 | Font system — keep Tailwind defaults or adopt Inter / system stack? | Phase 5 polish |
| 10 | Icon library — keep emoji or switch to Lucide / Heroicons? | Phase 1 implementation will revisit |

---

## How to use this document

- **Before starting any UI/UX implementation work:** read sections 1–4 minimum
- **When making any layout decision:** check section 3 + relevant section
- **When adding a new page or feature:** verify it fits a category in section 4.4 and a pattern in sections 5/8
- **When implementation diverges from this doc:** decide which is correct, update one or push back on the other
- **At each phase gate (sections 10):** validate against the gate criteria
- **When this doc is stale:** update it. Don't let it rot. A stale design system causes silent drift.

---

**End of document.**
**Next scheduled review:** 2026-06-02 (alongside `JUNE-2026-REVIEW-REQUIRED.md`).
