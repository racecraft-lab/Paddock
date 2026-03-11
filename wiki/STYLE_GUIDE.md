# Mission Control Style Guide

> "Mission Control in the Void" — a futuristic command center floating in a digital void.

---

## 1. Design Philosophy

Mission Control uses a deep-navy void aesthetic with luminous cyan accents. The visual language evokes a space-age command center: dark surfaces, glowing edges, monospace readouts, and subtle grid patterns that anchor UI elements in a digital void.

Key principles:
- **Dark by default** — app defaults to dark mode (`enableSystem={false}`)
- **Semantic tokens** — all colors flow through CSS custom properties
- **Additive light** — glow effects and luminous borders create depth without bright fills
- **Motion with purpose** — animations signal state, never decoration

---

## 2. Color System

### Void Palette (Dark Mode)

| Token | CSS Variable | HSL | Hex | Usage |
|-------|-------------|-----|-----|-------|
| Background | `--background` | `215 27% 4%` | #07090C | Page background, deepest layer |
| Card | `--card` | `220 30% 8%` | #0F141C | Panel/card surfaces |
| Primary | `--primary` | `187 82% 53%` | #22D3EE | Primary actions, focus rings |
| Secondary | `--secondary` | `220 25% 11%` | — | Secondary surfaces |
| Muted | `--muted` | `220 20% 14%` | — | Disabled states, subtle fills |
| Border | `--border` | `220 20% 14%` | — | Card/panel borders |
| Foreground | `--foreground` | `210 20% 92%` | — | Primary text |

### Accent Colors

| Name | CSS Variable | HSL | Hex | Usage |
|------|-------------|-----|-----|-------|
| Cyan | `--void-cyan` | `187 82% 53%` | #22D3EE | Primary accent, active states |
| Mint | `--void-mint` | `160 60% 52%` | #34D399 | Success, healthy states |
| Amber | `--void-amber` | `38 92% 50%` | #F59E0B | Warning, idle states |
| Violet | `--void-violet` | `263 90% 66%` | #A78BFA | Lead agents, special roles |
| Crimson | `--void-crimson` | `0 72% 51%` | #DC2626 | Errors, destructive actions |

### Surface Hierarchy

| Level | CSS Variable | HSL | Usage |
|-------|-------------|-----|-------|
| 0 | `--surface-0` | `215 27% 4%` | Deepest void (page bg) |
| 1 | `--surface-1` | `222 35% 7%` | Dark navy (elevated cards) |
| 2 | `--surface-2` | `220 30% 10%` | Secondary panels |
| 3 | `--surface-3` | `220 25% 14%` | Raised elements, borders |

### Using Colors in Code

**Tailwind classes** (preferred):
```html
<div class="bg-card text-foreground border-void-cyan">
```

**Inline styles** (ReactFlow, recharts):
```ts
import { hsl, voidAccents } from '@/styles/design-tokens'
const stroke = hsl(voidAccents.cyan)        // "hsl(187 82% 53%)"
const dim = hsl(voidAccents.cyan, 0.4)      // "hsl(187 82% 53% / 0.4)"
```

---

## 3. Typography

| Role | Font | CSS Variable | Tailwind Class |
|------|------|-------------|----------------|
| Body/UI | Inter | `--font-sans` | `font-sans` |
| Code/Data | JetBrains Mono | `--font-mono` | `font-mono` |

Both fonts are loaded via `next/font/google` (self-hosted, no external requests).

### Type Scale

Follow Tailwind's default scale. Key usage:
- `text-2xl font-bold font-mono` — stat card values
- `text-sm font-medium` — labels, nav items
- `text-xs font-mono` — metadata, timestamps, model names
- `text-[10px] tracking-wider font-semibold` — section headers (OBSERVE, AUTOMATE, etc.)

---

## 4. Spacing

Base grid: **4px**

Use Tailwind's spacing scale (1 = 0.25rem = 4px). Panel padding is typically `p-4` (16px) or `p-6` (24px). Gaps between grid items use `gap-6` (24px).

---

## 5. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-xl` | 16px | Large panels, modals |
| `rounded-lg` | 12px | Standard panels, cards |
| `rounded-md` | 10px | Buttons, inputs |
| `rounded-sm` | 8px | Small elements |
| `rounded-xs` | 6px | Badges, tags |

---

## 6. Elevation & Glow

### Glow Utilities

| Class | Color | Usage |
|-------|-------|-------|
| `.glow-cyan` | Cyan | Active states, primary focus |
| `.glow-mint` | Mint | Success states |
| `.glow-amber` | Amber | Warning states |
| `.glow-violet` | Violet | Special/lead roles |

### Badge Glow

| Class | Usage |
|-------|-------|
| `.badge-glow-success` | Success status badges |
| `.badge-glow-warning` | Warning status badges |
| `.badge-glow-error` | Error status badges |

### Panel Classes

| Class | Description |
|-------|-------------|
| `.void-panel` | Glass card with luminous border, inner highlight, float shadow |
| `.void-border-glow` | Animated gradient border via `::before` pseudo-element |
| `.panel` | Basic card: `bg-card border rounded-xl` |
| `.btn-neon` | Button with cyan glow on hover |

---

## 7. Component Patterns

### Panel Anatomy

```html
<div class="void-panel">
  <div class="panel-header">
    <h3 class="font-semibold text-foreground">Title</h3>
  </div>
  <div class="panel-body">
    <!-- content -->
  </div>
</div>
```

### Stat Card

- Use `void-panel` base
- Numeric values: `font-mono text-2xl font-bold`
- Icons: SVG, 24x24 (w-6 h-6), colored with void accent classes
- Color-specific glow via `badge-glow-*` classes

### Agent Node (ReactFlow)

- Base: `void-panel` with status-based border color
- Active: `border-void-cyan glow-cyan`
- Idle: `border-void-amber/50`
- Error: `border-void-crimson badge-glow-error`
- Badges: `font-mono text-xs` with accent background/border

### CORE Node

- Central orchestration hub in agent network
- Concentric pulsing rings (CSS keyframes, no framer-motion)
- `font-mono tracking-widest` for "CORE" label

---

## 8. Animation

### Keyframe Inventory

| Name | Duration | Effect | Usage |
|------|----------|--------|-------|
| `glowPulse` | 3s | Opacity + brightness oscillation | Active agent indicators |
| `float` | 6s | Vertical float (-6px) | Floating UI elements |
| `gridFlow` | 20s | Background position shift | Background grid animation |
| `edgeGlow` | 2s | Opacity oscillation | Border glow effects |
| `pulse-live` | 2s | Opacity fade | Live status indicators |
| `pulse-dot` | 2s | Scale + opacity | Connection status dots |

### Guidelines

- Prefer CSS `@keyframes` over JavaScript animation
- Duration: 2-3s for ambient loops, 150-200ms for interactions
- Easing: `ease-in-out` for loops, `ease-out` for entrances
- Always respect `prefers-reduced-motion: reduce`

---

## 9. Icon System

- **ViewBox**: `0 0 16 16`
- **Style**: Stroke-based, not filled
- **Stroke width**: `1.5`
- **Line caps/joins**: `round`
- **Size in UI**: `w-5 h-5` (nav), `w-4 h-4` (inline), `w-6 h-6` (stat cards)
- **Color**: Inherits via `stroke="currentColor"`

Example:
```tsx
<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
  className="w-5 h-5">
  <circle cx="8" cy="8" r="6" />
</svg>
```

---

## 10. Accessibility

### Contrast

- Text on void background: minimum 4.5:1 ratio (WCAG AA)
- `--foreground` (92% lightness) on `--background` (4% lightness) exceeds 15:1
- Cyan accent on dark: 5.2:1 — passes AA for normal text

### Focus Indicators

- Use `ring` utility: `focus-visible:ring-2 focus-visible:ring-ring`
- Ring color matches `--void-cyan`

### Reduced Motion

Global rule in `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Semantic HTML

- Nav uses `role="navigation"` and `aria-label`
- Active nav items use `aria-current="page"`
- Disabled items use `aria-disabled`
- Decorative elements use `aria-hidden="true"`
