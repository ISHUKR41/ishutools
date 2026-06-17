---
name: About section redesign pattern
description: About section was redesigned from .about-strip to .about-modern with stats row + feature cards
---

## Rule
The About section uses class `.about-modern` (not the old `.about-strip`). CSS is appended at end of `main.css`.

## Structure
```html
<section class="about-modern" id="about">
  <div class="about-modern-header">
    <div class="section-badge-pill">...</div>
    <h2 class="about-modern-title">...</h2>
    <p class="about-modern-subtitle">...</p>
  </div>
  <div class="about-stats-row">
    <!-- 5x .about-stat-card with .about-stat-icon-wrap, .about-stat-num, .about-stat-lbl -->
  </div>
  <div class="about-cards-grid">
    <!-- 4x .about-feat-card with .about-feat-icon (gradient bg), h3, p -->
    <!-- Last card .about-feat-creator has .creator-github-links with .creator-gh-btn -->
  </div>
</section>
```

## Why
Old .about-strip was visually plain (just 3 text columns). New design has stats, gradient icons, cards, and creator profile with GitHub links. CSS uses gradient text on stat numbers and hover lift effects.
