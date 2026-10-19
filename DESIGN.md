---
name: Prime Flow
description: Live production board for Prime Printing Co. — manager dashboard, staff floor screen, and shop TV.
colors:
  prime-navy: "#0a1f44"
  press-blue: "#1e40af"
  ink: "#0f172a"
  paper: "#ffffff"
  mist: "#f1f5f9"
  slate-text: "#64748b"
  hairline: "#e2e8f0"
  ready-green: "#22c55e"
  ready-green-ink: "#052e16"
  working-amber: "#f59e0b"
  working-amber-ink: "#1a1204"
  alert-red: "#ef4444"
typography:
  display:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.33
  order-number:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.25
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  full: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "2.5": "10px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  button-default:
    backgroundColor: "{colors.press-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "8px 20px"
    height: "44px"
    typography: "{typography.title}"
  button-primary:
    backgroundColor: "{colors.prime-navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "8px 20px"
    height: "44px"
  button-success:
    backgroundColor: "{colors.ready-green}"
    textColor: "{colors.ready-green-ink}"
    rounded: "{rounded.xl}"
    padding: "8px 20px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "8px 20px"
    height: "44px"
  button-sm:
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  button-lg:
    rounded: "{rounded.lg}"
    padding: "0 32px"
    height: "56px"
  input:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge:
    rounded: "{rounded.full}"
    padding: "2px 10px"
    typography: "{typography.label}"
  nav-item-active:
    backgroundColor: "{colors.press-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "10px 14px"
---

# Design System: Prime Flow

## Overview

**Creative North Star: "Prime Flow"**

Prime Flow is the shop's production line drawn as a screen: orders flow left to right through their stages, and the interface's only job is to keep that flow moving without friction. Every surface is white paper with navy ink, and color is reserved for one thing: telling you where an order stands and whether it is running late. Nothing is decorative. If a color appears, it is a status; if something moves, it is because an order moved.

The system is built for a phone in one hand on a print-shop floor and for a manager who switches between a laptop and a phone through the day. Targets are big and soft (44px buttons with 20px corners), text is the operating system's own font so the app reads as native on an iPhone, and the layout collapses from a sidebar to a bottom tab bar without losing a single action. The shop TV uses the same palette and cards at a distance-reading scale.

Density is moderate: cards carry the order number, customer, product, the delivery countdown, specs, assignees, and status chips, but each fact has its own line and the countdown always gets top billing.

**Key Characteristics:**
- White paper, navy ink, and color used only as status.
- Big, soft, thumb-ready targets: 44px minimum, generous corner rounding.
- The platform's own system font; monospace only for order numbers and the TV clock.
- Flat surfaces with a single quiet shadow; depth comes from hairline borders and tinted fills.
- English interface, light theme only, no dark mode.

## Colors

A two-blue brand on white paper, with four status colors that carry all the meaning.

### Primary
- **Prime Navy** (#0a1f44): The brand's anchor. Strong, committing actions (Start Production, Save, Connect), the Confirm step of a dialog, and the shop name on the TV header. Used sparingly so that a navy button always means "this is the main thing to do".

### Secondary
- **Press Blue** (#1e40af): The working accent. The default button, the active navigation item, links, focus rings, text selection, the New status, and the tint behind assignee chips and stat icons. It is the "you are here / this is live" signal.

### Neutral
- **Ink** (#0f172a): All primary text and headings.
- **Paper** (#ffffff): Page, card, popover, and dialog backgrounds. Also the text color on navy, blue, and red fills.
- **Mist** (#f1f5f9): Muted fills: input backgrounds (at 40%), the delivery-date strip on a card, hover states on outline and ghost buttons, completed-status chips.
- **Slate Text** (#64748b): Secondary text: labels like "Qty:", timestamps, helper copy, inactive navigation.
- **Hairline** (#e2e8f0): Every border and divider, input strokes, and scrollbar thumbs.

### Status
- **Ready Green** (#22c55e), with **Ready Green Ink** (#052e16) for text on it: Ready for Pickup / Delivery, the "time left" countdown, success buttons (Ready, Collected, Delivered).
- **Working Amber** (#f59e0b), with **Working Amber Ink** (#1a1204): In Progress, Pending Approval, Awaiting Customer, countdowns under a few hours.
- **Alert Red** (#ef4444): Late, Waiting for Materials, Design Changes Requested, Urgent, and destructive actions.

### Named Rules
**The Color Means Status Rule.** Green, amber, and red never decorate. Each one appears only to say where an order is or how late it is, and always with a text label, never color alone.

**The Tint-Then-Fill Rule.** A status shown as a chip is a 15% tint with the full color as text and a 30% border. A status that demands action now (the countdown, an Urgent flag, a destructive button) is a solid fill.

**The One Navy Rule.** At most one Prime Navy button per view or dialog. If two actions feel equally primary, one of them is Press Blue or outline.

## Typography

**Body Font:** The platform system font (-apple-system / SF Pro Text on Apple, Segoe UI on Windows, Roboto on Android)
**Mono Font:** The platform monospace (SF Mono, Menlo, Consolas)

**Character:** No webfont. Matching the operating system's own type is most of what makes the board feel like a native app on an iPhone, and it removes a render-blocking font download on shop-floor phones and tablets.

### Hierarchy
- **Display** (800, 36px, line-height 1, tabular figures, mono): The TV board's clock and day stats, read from across the shop.
- **Headline** (700, 24px, tight tracking): Page titles such as the dashboard greeting, and the big number on each stat tile.
- **Title** (700, 14px): Customer names and section headings on cards and boards.
- **Body** (400, 14px): Default reading text, form values, and descriptions. Fields render at 16px on touch devices so iOS never zooms on focus.
- **Label** (600, 12px): Chips, badges, captions, and the specs lines on a card. Tab-bar labels drop to 10px.
- **Order Number** (700, 14px, mono): Every `#1234` order number, so numbers line up and scan as identifiers.

### Named Rules
**The Mono Means Identifier Rule.** Monospace is only for order numbers, timers, and counts that should line up. Never for prose or labels.

**The Bold Is Load-Bearing Rule.** Weight carries hierarchy (700 for names and numbers, 600 for chips, 400 for body). Avoid adding new font sizes; reach for weight first.

## Layout

The manager surfaces use a fixed left sidebar on large screens (navigation, user card, alerts toggle, log out) and switch to a bottom tab bar with a "More" sheet below the `lg` breakpoint. Content sits in a single column with a 24px rhythm between sections.

The dashboard board is a stack of status sections (New, In Progress, Waiting for Materials, Ready for Pickup, Ready for Delivery, Delivered Today). Inside each section, order cards flow in a responsive grid: 1 column on phones, 2 from `sm`, 3 from `xl`, 4 from `2xl`, with 16px gaps. The stat tiles run 2 → 3 → 4 → 7 columns across the same breakpoints.

Spacing steps are 4, 6, 8, 10, 12, 16, 20, and 24px. Inside a card, rows sit 10px apart and chips 8px apart; cards pad at 14px on the board and 20px for panels. The staff floor screen is single-column and phone-first. Safe-area insets are respected at the top and bottom so nothing hides under the notch or home bar.

## Elevation & Depth

Flat by default. Surfaces separate through Hairline borders and Mist fills rather than shadow. A single quiet shadow (`shadow-sm`) sits on cards at rest; an order card lifts to a larger soft shadow only on hover, as a "you can open this" cue. Dialogs and popovers float with a larger shadow over the page. The mobile tab bar uses a translucent white with a strong backdrop blur.

### Named Rules
**The Hover-Is-The-Only-Lift Rule.** Nothing gains a shadow except in response to the pointer or because it floats above the page (dialogs, menus, sheets).

## Shapes

Soft and rounded everywhere. The scale runs 8px (sm), 12px (md), 16px (lg), and 20px (xl), plus full pills. In practice almost everything sits at the soft end: 16px for cards, small buttons, and stat icon tiles; 20px for standard buttons, inputs, navigation rows, card thumbnails, and the date strip on an order card; full pills for badges, chips, and the countdown. Small corners (8px, 12px) are reserved for tiny inline tags such as the TV's product chip. Borders are always 1px Hairline, except the large TV countdown which uses a 2px border. Order cards carry a 4px colored stripe on their left edge: blue for New, otherwise the countdown color.

## Components

### Buttons
Big, soft, thumb-ready.
- **Shape:** 20px corners at the default 44px height; 16px corners for small (36px) and large (56px).
- **Default:** Press Blue fill, white 14px semibold text, 20px side padding.
- **Primary:** Prime Navy fill with a faint white inner border, for the one committing action on a view.
- **Success / Warning / Destructive:** solid status fills for status-moving actions (Ready, Delivered) and deletes.
- **Outline / Ghost:** Hairline border or none, Ink text, Mist fill on hover.
- **States:** hover darkens the fill to 90%; focus shows a 2px Press Blue ring; disabled drops to 50% opacity. A spinner replaces nothing; it sits beside the label while pending.

### Badges and Chips
- **Style:** full pill, 12px semibold, 2px × 10px padding, 1px border.
- **Status chips:** 15% tint background, full-color text, 30% border (New blue, In Progress amber, Waiting red, Ready green, done states Mist with Slate Text).
- **Solid badges:** Urgent and similar alerts use the solid fill.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Paper, with a Mist strip for the delivery date row.
- **Shadow Strategy:** quiet at rest, lifts on hover (see Elevation).
- **Border:** 1px Hairline.
- **Internal Padding:** 14px on board cards, 20px on panels and dialogs.

### Inputs / Fields
- **Style:** 44px tall, 20px corners, Mist fill at 40%, Hairline stroke, 16px side padding.
- **Focus:** border turns Press Blue with a soft 2px ring at 40%.
- **Error / Disabled:** red border with a red ring; disabled at 50% opacity.

### Navigation
- **Sidebar (desktop):** 14px medium labels with 18px icons, 20px-rounded rows; the active row is a solid Press Blue fill with white text, inactive rows are Slate Text with a Mist hover.
- **Tab bar (mobile):** fixed to the bottom, 22px icons over 10px labels, translucent white with blur, a "More" button opening the full menu as a sheet.

### Order Card (signature component)
The heart of the system. Top row: product thumbnail (48px, 20px corners) beside the mono order number, customer name, and product. Then the delivery date strip with the live countdown pill (green "time left", amber soon, red "late"). Then specs, assignee chips, status chips, and the quick-action row (Start Production, Ready, Assign, Collected, Delivered) as small buttons. The left stripe signals status at a glance. The whole card opens the order's detail drawer; buttons inside it never open the drawer.

### Countdown Timer
Small pill on cards (12px semibold, full pill) and a large 18px extra-bold block with a 2px border on the TV. Always paired with words ("51h 18m left", "73h 41m late"), never color alone.

## Do's and Don'ts

### Do:
- **Do** keep every tappable control at least 44px tall on the staff and manager screens.
- **Do** use Press Blue for "live / active / here" and Prime Navy for the single committing action.
- **Do** pair every status color with a text label.
- **Do** use the system font and mono only for order numbers, timers, and aligned counts.
- **Do** keep surfaces white and separate them with Hairline borders and Mist fills.

### Don't:
- **Don't** use green, amber, or red for decoration, illustrations, or emphasis that isn't a status.
- **Don't** add a dark mode or a dark TV theme; the product is light-only by decision.
- **Don't** add a webfont.
- **Don't** shrink buttons below 36px or below 44px on staff screens.
- **Don't** put more than one Prime Navy button on a view.
- **Don't** add Arabic or other languages to the manager or staff interface; Arabic belongs only in customer-facing messages and the order-request form.
