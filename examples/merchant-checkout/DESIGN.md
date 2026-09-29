---
name: Prism Demo Store
description: Night-service payment console for running PRISM test-mode demos.
colors:
  signal-amber: "#f0a832"
  ink-ground: "#0c0f14"
  console-panel: "#12161f"
  panel-deep: "#0e1219"
  ivory-ink: "#e9e4d8"
  dim-slate: "#8f99ad"
  faint-slate: "#5b6579"
  state-green: "#3fce7a"
  fault-red: "#e5605c"
  console-line: "#232b3b"
typography:
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  readout:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.86rem"
    fontWeight: 400
  window-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 650
    letterSpacing: "0.09em"
rounded:
  sm: "6px"
  md: "8px"
  window: "10px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-amber}"
    textColor: "#171106"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ivory-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-pay:
    backgroundColor: "{colors.state-green}"
    textColor: "#06130c"
    rounded: "{rounded.sm}"
    padding: "10px 21px"
---

# Design System: Prism Demo Store

## Overview

**Creative North Star: "The Night Desk"**

The store reads as the downstream end of a payment pipeline at night: a service
console where orders arrive, state lamps flip, and the PRISM readout tells the
truth about money. Matte ink surfaces, ivory tabular text, and a single amber
reserved strictly for action and attention. Nothing glows; state is carried by
flat lamp dots and plain words. Density serves scanning: one screen holds
command entry, the order stack, the lifecycle timeline, and the verification
readout without navigation.

**Key Characteristics:**
- Console windows with stamped titles, not cards with icons.
- Monospace only for references, amounts, readouts, and timestamps.
- Amber means act or attend; green means settled; red means fault.
- Motion is a single live-dot pulse; everything else is instant.

## Colors

Restrained strategy: ink neutrals plus one amber accent; green/red reserved for
state lamps and the pay action.

### Primary
- **Signal Amber** (#f0a832): primary actions, links, live accents, finding codes. Never body text.

### Neutral
- **Ink Ground** (#0c0f14): page ground.
- **Console Panel** (#12161f): window surfaces.
- **Panel Deep** (#0e1219): window title bars, readout rows, inputs.
- **Ivory Ink** (#e9e4d8): primary text.
- **Dim Slate** (#8f99ad): secondary text, labels, table heads.
- **Faint Slate** (#5b6579): timestamps, footers, placeholders.
- **Console Line** (#232b3b): borders, rules, timeline bars.

### State (lamps and pay action only)
- **State Green** (#3fce7a): settled/verified/matched, the pay action.
- **Fault Red** (#e5605c): mismatches, failures, flagged states.

### Named Rules
**The Amber Rarity Rule.** Amber appears on fewer than one in ten elements per
screen. If everything demands attention, the lamps mean nothing.
**The Flat Lamp Rule.** State dots are flat color, never glows or halos.

## Typography

**Body/UI Font:** system stack (-apple-system, Segoe UI, Roboto) — the console
registers as native tooling, not a brand statement.
**Readout/Mono Font:** ui-monospace stack, for references, amounts, dimensions,
timestamps, findings. Never for prose or buttons.

**Character:** quiet grotesk for work, terminal voice for evidence.

### Hierarchy
- **Window title** (650, 0.78rem, +0.09em uppercase): console window stamps.
- **Body** (400, 15px/1.5): forms, tables, copy.
- **Readout** (400, 0.86rem mono): dimension values, references, amounts.
- **Label** (600, 0.76–0.82rem, dim slate): form labels, table heads.

### Named Rules
**The Mono Means Data Rule.** If it isn't a reference, amount, timestamp, or
readout value, it isn't monospace.

## Layout

Sticky console bar (mark, title, live readout) over a 1080px rail. Index pairs
command entry beside the order stack in a 0.9fr/1.6fr grid, collapsing to one
column under 820px. Order detail stacks full-width: status line, pay action,
controls, lifecycle, readout, deliveries, raw record. Rhythm: 24px between
windows, 16px inside, more space above section titles than below. Mobile hides
the console subtitle and render timestamp; timeline columns compress with
ellipsis.

## Elevation & Depth

No shadows. Depth is conveyed by tonal layering only: ground → panel →
panel-deep, separated by 1px console-line rules.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; nothing lifts on
hover. State changes, not shadows, signal interactivity.

## Shapes

Slightly rounded rectilinear console language: windows 10px, controls and
inputs 6px, lamps fully round, timeline bars 4px pill segments. Borders are
1px console-line throughout; no border-accent strips, no gradient fills.

## Components

### Buttons
- **Shape:** 6px radius, 700 weight, sans.
- **Primary:** amber ground, near-black text, 10px 18px. Hover brightens slightly; active nudges 1px.
- **Ghost:** transparent with 1px line border, ivory text.
- **Pay:** green ground, deep-green text — the only green larger than a lamp.
- **Focus:** 2px amber outline with offset on all controls.

### State lamps
- **Style:** 9px flat dots (green/amber/red/dim). Meaning comes from position
  beside the value, never from glow.

### Readout
- **Style:** bordered readout box of key/lamp/value rows on panel-deep.
  Dimension keys in dim mono, values in ivory mono.

### Timeline
- **Style:** lamp + label + duration-proportioned bar + mono timestamp per
  step. Bars share the console-line track color.

### Inputs / Fields
- **Style:** panel-deep ground, 1px line stroke, 6px radius, mono text.
- **Focus:** amber outline. Placeholders in faint slate (contrast-checked).

### Tables
- **Style:** uppercase dim heads, tabular numerals, dotted amber underline on
  reference links only.

## Do's and Don'ts

### Do:
- **Do** keep amber rare — actions and live state only.
- **Do** set every reference, amount, and timestamp in mono with tabular numerals.
- **Do** show the honest empty/offline state (no orders, PRISM unreachable).
- **Do** theme browser surfaces: amber selection, amber focus rings, dark scrollbars.

### Don't:
- **Don't** add kickers, section numbers, gradient text, or glass effects.
- **Don't** use mono for prose, buttons, or headings.
- **Don't** invent glow, shadows, or accent border strips.
- **Don't** fabricate timeline events or log lines for legacy rows.
