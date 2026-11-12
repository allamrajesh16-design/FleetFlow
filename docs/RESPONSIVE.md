# FleetFlow Responsive Design System & Breakpoint Specifications

This document defines the responsive architecture, breakpoint system, layout strategies, and container-query behaviors for the FleetFlow platform.

---

## 1. Breakpoint Grid

The application classifies viewports into four discrete tiers using standard media queries:

| Device Tier | Viewport Width Range | Layout Mode (`data-layout`) | Navigation Architecture |
|---|---|---|---|
| **Phone** | `<= 767px` | `phone` | Driver: Sticky Topbar + Fixed Bottom Nav<br/>Admin / Manager / Customer: Topbar + Hamburger Slide-in Drawer |
| **Tablet** | `768px` – `1023px` | `tablet` | 72px Collapsed Icon Rail (expands on hover/click to full labels) |
| **Laptop** | `1024px` – `1439px` | `laptop` | Standard 240px Sidebar + Full Topbar |
| **Desktop** | `>= 1440px` | `desktop` | Standard 240px Sidebar + Wide Content Area |

---

## 2. Layout Enforcement Rules

1. **Exactly One Layout Root**:
   - The DOM must contain exactly ONE top-level layout element bearing the `data-layout="{tier}"` attribute.
   - Dual-layout rendering (e.g. mobile simulator and desktop dashboard rendered simultaneously) is prohibited.
2. **No Purple Backdrop / Mockup Frames**:
   - The application renders edge-to-edge inside the browser viewport. No artificial phone skins or dotted backgrounds are drawn on desktop viewports.
3. **Safe Area Insets**:
   - All mobile layouts account for hardware notches and bottom home indicators:
     - `padding-top: env(safe-area-inset-top, 0px)`
     - `padding-bottom: env(safe-area-inset-bottom, 0px)`
     - Viewport unit uses dynamic viewport height (`100dvh`) with `100vh` fallback.
     - Avoid `100vw` when vertical scrollbars may appear to prevent horizontal overflow.

---

## 3. Navigation Implementations by Tier

### 3.1 Phone (`<= 767px`)
- **Driver Role**:
  - Sticky header (64px) with FleetFlow logo, theme toggle, notification bell, profile avatar, and logout.
  - Fixed bottom navigation (64px) with 5 primary tabs: Home, Trips, Fuel, Expenses, and More.
  - Page content has bottom padding (`padding-bottom: 84px`) so no interactive elements hide behind the bottom navigation bar.
- **Admin, Fleet Manager, and Customer Roles**:
  - Compact topbar (60px) with hamburger menu icon button.
  - Slide-in side drawer (280px width) containing the full navigation menu, backdrop overlay, focus trapping, Escape-key dismissal, and auto-dismiss upon route navigation.

### 3.2 Tablet (`768px` to `1023px`)
- Sidebar collapses into a compact **72px icon rail**.
- Each menu item displays its centered 20px SVG icon with tooltip.
- Clicking or hovering the toggle expands the rail smoothly to 240px without displacing main content layout.

### 3.3 Laptop & Desktop (`>= 1024px`)
- Permanent 240px sidebar with full icons and labels.
- Collapsible via the header toggle or rail button for increased table workspace.

---

## 4. Tables and Card Containers

Instead of relying on viewport widths, `DataTable` and list components utilize **Container Width** (`ResizeObserver`):

- **Container Width `< 720px`**:
  - Automatically switches to stacked **Card View**.
  - Uses column roles:
    - `title` / `primary`: bold header text.
    - `badge` / `status`: top-right status badge.
    - `detail` / `meta`: key-value label pairs.
    - `action`: bottom full-width or grouped action buttons.
  - The manual "Table / Cards" toggle switch is automatically hidden on phones.
- **Container Width `720px` – `1000px`**:
  - Renders as a true table with horizontal scroll inside its card wrapper (`overflow-x: auto`).
  - First column (Vehicle / ID) is pinned with sticky positioning (`position: sticky; left: 0`).
- **Container Width `> 1000px`**:
  - Full desktop table layout with sticky headers and density toggles.

---

## 5. Touch Targets and Form Inputs

- Minimum touch target for all buttons, icon buttons, and navigation links on phone is **44px × 44px**.
- All form inputs, selects, and textareas have a minimum font-size of **16px** on mobile to prevent iOS Safari auto-zooming.
- Action dialogs and modals automatically transform into **Bottom Sheets** on viewports `<= 640px`.

