## Design System: 잿빛 여관 · ARPG B

### Pattern
- **Name:** Funnel (3-Step Conversion)
- **Conversion Focus:** Progressive disclosure. Show only essential info per step. Use progress indicators. Multiple CTAs.
- **CTA Placement:** Each step: mini-CTA. Final: main CTA
- **Color Strategy:** Step colors: 1 (Red/Problem), 2 (Orange/Process), 3 (Green/Solution). CTA: Brand color
- **Sections:** 1. Hero, 2. Step 1 (problem), 3. Step 2 (solution), 4. Step 3 (action), 5. CTA progression

### Style
- **Name:** Pixel Art
- **Mode Support:** Light ✓ Full | Dark ✓ Full
- **Keywords:** Retro, 8-bit, 16-bit, gaming, blocky, nostalgic, pixelated, arcade
- **Best For:** Indie games, retro tools, creative portfolios, nostalgia marketing, Web3/NFT
- **Performance:** ⚡ Excellent | **Accessibility:** ✓ Good (if contrast ok)

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#0F172A` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#1E293B` | `--color-secondary` |
| Accent/CTA | `#EF4444` | `--color-accent` |
| Background | `#020617` | `--color-background` |
| Foreground | `#F8FAFC` | `--color-foreground` |
| Muted | `#1A1E2F` | `--color-muted` |
| Border | `#334155` | `--color-border` |
| Destructive | `#EF4444` | `--color-destructive` |
| Ring | `#0F172A` | `--color-ring` |

*Notes: High contrast dark + brand accent + large touch targets*

### Typography
- **Heading:** Outfit
- **Body:** Outfit
- **Mood:** bauhaus, geometric, constructivist, bold, uppercase, architectural, mechanical, poster, tactile
- **Best For:** Bauhaus mobile apps, bold editorial mobile, design-forward branding apps, art/culture platforms
- **Google Fonts:** https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;900&display=swap
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;900&display=swap');
```

### Key Effects
Frame-by-frame sprite animation, blinking cursor, instant transitions, marquee text

### Avoid (Anti-patterns)
- Inconsistent styling
- Poor contrast ratios

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
