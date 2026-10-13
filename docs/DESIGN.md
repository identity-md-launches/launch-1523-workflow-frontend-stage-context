# PixelCommons design

## Overview

PixelCommons is a public, shared pixel canvas on Sepolia. The page is a painting tool: canvas first, color and paint controls beside it on desktop, then recent activity. The visual idea is a quiet sheet of paper with the 16-color palette supplying the color. A four-square mark connects the brand to the pixels without adding decoration over the live artwork.

This document records the implemented source, not a proposed redesign. It is under `docs/` because the task's strict allowed paths exclude a root `DESIGN.md`.

## Colors

Canonical CSS tokens live in `web/src/styles.css`. The interface uses a deliberate light theme with semantic tokens; there is no theme switch or alternate dark palette. Hex colors match the indexed drawing palette in `web/src/model.ts`.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--page` → `--paper` | `#f7f7f2` | Page and dialog backgrounds |
| `--surface` → `--white` | `#ffffff` | Canvas, inputs, selected-color check background |
| `--text` → `--ink` | `#292d27` | Main text and selection outline |
| `--muted` → `--stone` | `#60675d` | Supporting text and read status |
| `--border` → `--line` | `#d8dcd1` | Structural dividers |
| `--control-border` | `#878e81` | Visible boundaries for buttons, inputs and palette swatches |
| `--accent` → `--rust` | `#b83f16` | Primary paint action and brand mark |
| `--accent-hover` → `--rust-dark` | `#96330f` | Hover state |
| `--on-accent` | `#ffffff` | Text on the primary action |
| `--success`, `--success-bg` | `#29653b`, `#eaf2e9` | Confirmed-paint feedback |
| `--error`, `--error-bg` | `#9c3027`, `#fbede8` | Errors with recovery instructions |
| `--focus` | `#245ec4` | 3px keyboard-focus perimeter with 3px offset |
| `--disabled-bg` | `#e6e8e0` | Unavailable actions, with text explaining why |
| `--hover-bg` | `#eeefe8` | Neutral hover, copy button, loading and pending surfaces |

The canvas frame is `#e8ebe2`. Canvas pixels use the 16 named entries in `PALETTE`, whose order is significant: White, Silver, Slate, Black, Rose, Red, Orange, Yellow, Lime, Green, Teal, Sky, Blue, Purple, Pink, Brown. Index 0 is white, matching the contract. Other color values are a frontend design choice; the contract stores indices, not RGB colors.

Swatches retain their paint color under forced-color modes. Their accessible names include the color and index, `aria-pressed` identifies selection, and a check plus outline distinguishes it without relying on hue. Status always has text. Measured contrasts and their scope are in `FRONTEND_VALIDATION.md` and `frontend-evidence/visual-measurements.json`.

## Typography

The stack is `Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. No font is downloaded; Inter is only a local preference, and the operating system supplies the fallback. A computed family string is not evidence that Inter was installed. The shared scale is 14px supporting text (`--text-small`), 16px body and inputs (`--text-body`), 20px section titles (`--text-section`), and 36px main title (`--text-title`), reduced to 28px below 600px. Only weights 400, 600 and 700 are requested; the main title is heaviest.

Body line height is 1.5, button line height 1.4, section headings 1.3 and the main title 1.1. Main-title tracking is −0.04em; section tracking is −0.015em. Content uses natural casing. Addresses wrap with `overflow-wrap: anywhere` rather than clipping. Coordinates, timers, action labels, balances and read block numbers use tabular numerals. Prose stays within 65ch. Mobile number inputs remain 16px at the default text size.

## Layout

The outer `.app` is at most 1168px, with 32px gutters on large screens, 20px at the intermediate layout and 16px below 600px. The bottom respects the device safe area. Spacing mostly uses 8px steps, with 12px for compact groups and 24–48px between major groups.

At 960px and above, `.workspace` has a canvas column and a controls/activity column separated by 48px. At 1140px and above, the canvas column is 672px: its 16px frame padding leaves a crisp 640px drawing area, or 10 CSS pixels per logical pixel. The first grid row uses `min-content` so activity follows the paint controls without a large hole. Below 960px the DOM becomes a single column: canvas, paint controls, then activity. Exact coordinates live after the main action, keeping the first phone screen usable.

Below 600px the header, title and spacing tighten. The palette remains an eight-column, two-row grid with 8px gaps. Swatches are about 29px at 320px wide and 38px at 390px, exceeding the 24px minimum; the main action and wallet buttons are at least 44px. Exact coordinate inputs offer large targets for choosing tiny canvas pixels. Rows and headings wrap under text enlargement. Nothing requires horizontal page scrolling at the tested 320, 390, 768 and 1440 widths, including full addresses and large mock balances. The 390×844 first screen includes the wallet button, live canvas, palette and paint action.

## Elevation & Depth

The page is flat. Tonal canvas framing and 1px structural dividers establish groups; there are no nested cards or general drop shadows. A native modal `dialog` uses a `#20252b80` backdrop and makes the rest of the page inert. The selected canvas pixel is the single exception: a white 2px outline plus a dark 4px outer shadow makes the marker visible against any paint color. That marker previews a selection; confirmed pixels still come from the contract.

## Shapes

Primary/secondary buttons and inputs use an 8px radius. Swatches and copy controls use 4px, small color samples use 2px, and the dialog uses 16px. The canvas remains square with no rounded clipping. The logo is a two-by-two grid with one dark square. Status dots and the selected-palette check have circular shapes.

## Components

| Source | Component or pattern | Behavior |
| --- | --- | --- |
| `web/src/CanvasBoard.tsx` | `CanvasBoard` | A native button contains a 64×64 canvas with pixelated rendering. Pointer position selects a cell; arrow keys move the cursor and Enter/Space select. A native checkbox shows grid lines. Loading is labeled, never presented as a real white canvas. |
| `web/src/CanvasBoard.tsx` | `CoordinatePicker` | Native disclosure and required number inputs, 0–63. An equivalent precise input path for touch and keyboard. |
| `web/src/App.tsx` | Palette and paint panel | Named toggle buttons, selected check, current and replacement color, one primary action. Labels progress through connection, network switch, eligibility, simulation, signature and confirmation. |
| `web/src/App.tsx` | `AddressLink` | Full checksummed, wrapping explorer link; copy button and announced result; manual-copy message if clipboard access fails. |
| `web/src/App.tsx` | `Dialog` | Native wallet chooser/account dialog, Close and Escape support, built-in focus containment and return. |
| `web/src/App.tsx` | Activity list | Real event color, coordinates, full painter address and transaction link. Loading, empty, partial-history and failed-refresh states are explicit. |
| `web/src/styles.css` | `.primary`, `.secondary`, `.notice` | One filled primary action, outlined secondary controls and neutral/success/error feedback. Disabled controls retain readable reasons. |

Keyboard focus uses the common 3px ring. Native fields and buttons supply standard keyboard behavior. Transaction announcements live in a stable polite status region; the every-second cooldown stays outside it. Errors are persistent and actionable. Only background-color transitions of 120ms are used, and only when reduced motion is not requested. There are no endless animations.

## Do's and Don'ts

- Reuse the semantic color and type tokens, outer `.app`, section-heading pattern and native controls.
- Keep new content after the canvas and main action on mobile. Test 320px, 390px and enlarged text with actual long values.
- Preserve a single filled primary action. Other controls use `.secondary` or a clear native disclosure.
- Keep addresses, balances and errors available in full. Do not use ellipsis or fixed text-box heights to force them into a row.
- Preserve the distinction between selected/previewed pixels and chain-confirmed canvas data. Never fill an empty canvas or feed with unlabelled example content.
- Derive deployment information from the runtime manifest. Do not make visual changes by introducing a second contract or network map.

To add another static view, retain the same header and tokens, give it one clear heading and action, use a fragment-based route unless the page is separately exported, and rerun the mobile, keyboard and export-inventory checks.

Design review coverage, fixes and remaining unperformed checks are recorded separately in `FRONTEND_VALIDATION.md`. Documentation follows the pinned Impeccable method, adapted for this implementation; Better Interface and ethskills notices/licenses are retained in `frontend-evidence/`.
