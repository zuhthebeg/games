## Design System: Ash Inn · restrained tactile variant

### Pattern
- **Name:** App Store Style Landing
- **Conversion Focus:** Show real screenshots. Include ratings (4.5+ stars). QR code for mobile. Platform-specific CTAs.
- **CTA Placement:** Download buttons prominent (App Store + Play Store) throughout
- **Color Strategy:** Dark/light matching app store feel. Star ratings in gold. Screenshots with device frames.
- **Sections:** 1. Hero with device mockup, 2. Screenshots carousel, 3. Features with icons, 4. Reviews/ratings, 5. Download CTAs

### Style
- **Name:** 3D & Hyperrealism
- **Mode Support:** Light ◐ Partial | Dark ◐ Partial
- **Keywords:** Depth, realistic textures, 3D models, spatial navigation, tactile, skeuomorphic elements, rich detail, immersive
- **Best For:** Gaming, product showcase, immersive experiences, high-end e-commerce, architectural viz, VR/AR
- **Performance:** ❌ Poor | **Accessibility:** ⚠ Not accessible

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#7C3AED` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#A78BFA` | `--color-secondary` |
| Accent/CTA | `#F43F5E` | `--color-accent` |
| Background | `#0F0F23` | `--color-background` |
| Foreground | `#E2E8F0` | `--color-foreground` |
| Muted | `#27273B` | `--color-muted` |
| Border | `#4C1D95` | `--color-border` |
| Destructive | `#EF4444` | `--color-destructive` |
| Ring | `#7C3AED` | `--color-ring` |

*Notes: Neon purple + rose action*

### Typography
- **Heading:** Orbitron
- **Body:** JetBrains Mono
- **Mood:** cyberpunk, neon, glitch, hud, sci-fi, dark, matrix green, magenta, chamfered, tactical
- **Best For:** Gaming companion apps, fintech/crypto, data visualization, dark brand apps, cyberpunk narrative games
- **Google Fonts:** https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Orbitron:wght@700;900&display=swap
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Orbitron:wght@700;900&display=swap');
```

### Key Effects
WebGL/Three.js 3D, realistic shadows (layers), physics lighting, parallax (3-5 layers), smooth 3D (300-400ms)

### Avoid (Anti-patterns)
- Minimalist design
- Static assets

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
