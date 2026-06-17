/**
 * tool-base.js — Universal Tool Page Engine v4.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * *** CRITICAL ORDER: renderPage() → renderHeader() → renderFooter() ***
 * renderPage() sets document.body.innerHTML which destroys any previously
 * prepended/appended elements, so header/footer MUST be added after renderPage().
 *
 * TOOL_CONFIG shape (window.TOOL_CONFIG before this script loads):
 * {
 *   id, name, emoji, category, categorySlug, description,
 *   apiEndpoint, multiFile, twoFiles, noFile,
 *   acceptedTypes, acceptedLabel, minFiles, maxFiles,
 *   options[], resultType ('file'|'json'|'text'),
 *   outputFilename, outputMime,
 *   steps[], features[], related[]
 * }
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════════
     THEME
  ═══════════════════════════════════════════════════════════════════════════ */
  const THEME_KEY = 'ishu-theme';
  function getTheme()    { return localStorage.getItem(THEME_KEY) || 'dark'; }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
  }
  applyTheme(getTheme());

  /* ═══════════════════════════════════════════════════════════════════════════
     CONFIG VALIDATION
  ═══════════════════════════════════════════════════════════════════════════ */
  const C = window.TOOL_CONFIG;
  if (!C || !C.id) { console.error('IshuTools: window.TOOL_CONFIG missing'); return; }
  C.multiFile      = C.multiFile      || false;
  C.twoFiles       = C.twoFiles       || false;
  C.noFile         = C.noFile         || false;
  C.minFiles       = C.minFiles       || (C.multiFile ? 2 : 1);
  C.maxFiles       = C.maxFiles       || (C.multiFile ? 50 : 1);
  C.options        = C.options        || [];
  C.resultType     = C.resultType     || 'file';
  C.outputFilename = C.outputFilename || 'output.pdf';
  C.outputMime     = C.outputMime     || 'application/pdf';
  C.steps          = C.steps          || [];
  C.features       = C.features       || [];
  C.related        = C.related        || [];
  C.acceptedLabel  = C.acceptedLabel  || C.acceptedTypes || 'PDF';

  /* ═══════════════════════════════════════════════════════════════════════════
     UTILS
  ═══════════════════════════════════════════════════════════════════════════ */
  function fmtSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024)         return bytes + ' B';
    if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function q(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function qa(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }
  function uid() { return Math.random().toString(36).slice(2, 9); }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER HEADER
  ═══════════════════════════════════════════════════════════════════════════ */
  function renderHeader() {
    const theme = getTheme();
    const h = document.createElement('header');
    h.className = 'site-header';
    h.id = 'siteHeader';
    h.innerHTML = `
      <div class="header-inner-wrap">
        <a href="/" class="header-logo" aria-label="IshuTools Home">
          <div class="logo-icon">
            <svg width="30" height="30" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="34" height="34" rx="9" fill="url(#hGrad)"/>
              <path d="M8 17L13 12L18 17L23 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 22L13 17L18 22L23 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
              <defs>
                <linearGradient id="hGrad" x1="0" y1="0" x2="34" y2="34">
                  <stop offset="0%" stop-color="#6366F1"/>
                  <stop offset="100%" stop-color="#8B5CF6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div class="logo-text">
            <span class="logo-name">IshuTools</span><span class="logo-fun">.fun</span>
          </div>
        </a>

        <nav class="header-nav" aria-label="Main navigation">
          <a href="/#organize" class="nav-link"><i class="fas fa-layer-group"></i><span>Organize</span></a>
          <a href="/#convert"  class="nav-link"><i class="fas fa-arrows-alt-h"></i><span>Convert</span></a>
          <a href="/#edit"     class="nav-link"><i class="fas fa-pen-nib"></i><span>Edit</span></a>
          <a href="/#security" class="nav-link"><i class="fas fa-shield-halved"></i><span>Security</span></a>
          <a href="/#ai"       class="nav-link ai-nav-link">
            <i class="fas fa-microchip"></i><span>AI</span>
            <span class="ai-badge">NEW</span>
          </a>
        </nav>

        <div class="header-actions">
          <a href="/" class="btn-all-tools" title="All PDF Tools">
            <i class="fas fa-grid-2"></i>
            <span>All Tools</span>
          </a>
          <button class="theme-toggle-btn" id="themeBtn" aria-label="Toggle dark/light theme" title="Toggle theme">
            <i class="fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>
          </button>
          <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <!-- Mobile nav -->
      <div class="mobile-nav" id="mobileNav">
        <a href="/#organize"><i class="fas fa-layer-group"></i> Organize PDF</a>
        <a href="/#convert"><i class="fas fa-arrows-alt-h"></i> Convert PDF</a>
        <a href="/#edit"><i class="fas fa-pen-nib"></i> Edit PDF</a>
        <a href="/#security"><i class="fas fa-shield-halved"></i> Security</a>
        <a href="/#ai"><i class="fas fa-microchip"></i> AI Intelligence</a>
        <a href="/"><i class="fas fa-grid-2"></i> All 35+ Tools</a>
      </div>
    `;
    document.body.prepend(h);

    /* Theme toggle */
    q('#themeBtn').addEventListener('click', () => {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      q('#themeBtn').innerHTML = `<i class="fas ${next === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>`;
    });

    /* Mobile menu */
    const mobileBtn = q('#mobileMenuBtn');
    const mobileNav = q('#mobileNav');
    if (mobileBtn && mobileNav) {
      mobileBtn.addEventListener('click', () => {
        mobileBtn.classList.toggle('open');
        mobileNav.classList.toggle('open');
      });
    }

    /* Scroll shadow */
    window.addEventListener('scroll', () => {
      const hdr = q('#siteHeader');
      if (hdr) hdr.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER FOOTER
  ═══════════════════════════════════════════════════════════════════════════ */
  function renderFooter() {
    const f = document.createElement('footer');
    f.className = 'site-footer';
    f.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <a href="/" class="footer-logo-link">
            <svg width="22" height="22" viewBox="0 0 34 34" fill="none">
              <rect width="34" height="34" rx="9" fill="url(#ftGrad)"/>
              <path d="M8 17L13 12L18 17L23 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 22L13 17L18 22L23 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
              <defs><linearGradient id="ftGrad" x1="0" y1="0" x2="34" y2="34">
                <stop offset="0%" stop-color="#6366F1"/>
                <stop offset="100%" stop-color="#8B5CF6"/>
              </linearGradient></defs>
            </svg>
            <strong>IshuTools<span>.fun</span></strong>
          </a>
          <p class="footer-tagline">Professional PDF tools by <a href="https://github.com/ISHUKR41" target="_blank" rel="noopener noreferrer">Ishu Kumar</a></p>
          <div class="footer-badges">
            <span>✅ 100% Free</span>
            <span>🔒 Secure</span>
            <span>⚡ Fast</span>
            <span>🚫 No Signup</span>
          </div>
        </div>

        <div class="footer-links-grid">
          <div class="footer-col">
            <h4>Organize</h4>
            <a href="/tools/merge-pdf/">Merge PDF</a>
            <a href="/tools/split-pdf/">Split PDF</a>
            <a href="/tools/compress-pdf/">Compress PDF</a>
            <a href="/tools/remove-pages/">Remove Pages</a>
            <a href="/tools/extract-pages/">Extract Pages</a>
            <a href="/tools/organize-pdf/">Organize PDF</a>
          </div>
          <div class="footer-col">
            <h4>Convert</h4>
            <a href="/tools/jpg-to-pdf/">JPG to PDF</a>
            <a href="/tools/word-to-pdf/">Word to PDF</a>
            <a href="/tools/pdf-to-word/">PDF to Word</a>
            <a href="/tools/pdf-to-jpg/">PDF to JPG</a>
            <a href="/tools/html-to-pdf/">HTML to PDF</a>
            <a href="/tools/pdf-to-excel/">PDF to Excel</a>
          </div>
          <div class="footer-col">
            <h4>Edit & Security</h4>
            <a href="/tools/rotate-pdf/">Rotate PDF</a>
            <a href="/tools/add-watermark/">Add Watermark</a>
            <a href="/tools/protect-pdf/">Protect PDF</a>
            <a href="/tools/unlock-pdf/">Unlock PDF</a>
            <a href="/tools/sign-pdf/">Sign PDF</a>
            <a href="/tools/redact-pdf/">Redact PDF</a>
          </div>
          <div class="footer-col">
            <h4>AI & More</h4>
            <a href="/tools/summarize-pdf/">AI Summarizer</a>
            <a href="/tools/translate-pdf/">Translate PDF</a>
            <a href="/tools/ocr-pdf/">OCR PDF</a>
            <a href="/tools/compare-pdf/">Compare PDF</a>
            <a href="/tools/repair-pdf/">Repair PDF</a>
            <a href="/">All 35+ Tools</a>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <span>© 2026 <a href="https://github.com/ISHUKR41" target="_blank" rel="noopener">Ishu Kumar</a> · IshuTools.fun — All rights reserved</span>
        <span>Built with ❤️ for everyone, 100% free forever</span>
      </div>
    `;
    document.body.appendChild(f);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER OPTIONS
  ═══════════════════════════════════════════════════════════════════════════ */
  function renderOption(opt) {
    const id = `opt-${esc(opt.id)}`;
    switch (opt.type) {
      case 'select':
        return `<div class="form-group">
          <label class="form-label" for="${id}">
            ${opt.icon ? `<i class="${esc(opt.icon)}"></i> ` : ''}${esc(opt.label)}
          </label>
          <div class="select-wrapper">
            <select class="form-select" id="${id}" name="${esc(opt.id)}">
              ${opt.choices.map(c => `<option value="${esc(c.v||c)}"${((c.v||c)===opt.default)?'selected':''}>${esc(c.l||c)}</option>`).join('')}
            </select>
            <i class="fas fa-chevron-down select-arrow"></i>
          </div>
        </div>`;

      case 'radio':
        return `<div class="form-group">
          <label class="form-label">${esc(opt.label)}</label>
          <div class="radio-group">
            ${opt.choices.map(c=>`
              <label class="radio-pill">
                <input type="radio" name="${esc(opt.id)}" value="${esc(c.v||c)}" ${((c.v||c)===opt.default)?'checked':''}>
                <span>${esc(c.l||c)}</span>
              </label>`).join('')}
          </div>
        </div>`;

      case 'range':
        return `<div class="form-group">
          <label class="form-label" for="${id}">
            ${esc(opt.label)}
            <span class="range-val" id="${id}-val">${Math.round((opt.default||opt.min||0)*(opt.scale||1))}${opt.unit||''}</span>
          </label>
          <input type="range" class="form-range" id="${id}" name="${esc(opt.id)}"
            min="${opt.min}" max="${opt.max}" step="${opt.step||1}" value="${opt.default||opt.min}"
            oninput="document.getElementById('${id}-val').textContent=Math.round(this.value*(${opt.scale||1}))+'${opt.unit||''}'">
          <div class="range-track-labels">
            <span>${opt.minLabel||opt.min}</span>
            <span>${opt.maxLabel||opt.max}</span>
          </div>
        </div>`;

      case 'number':
        return `<div class="form-group">
          <label class="form-label" for="${id}">${esc(opt.label)}</label>
          <input type="number" class="form-input" id="${id}" name="${esc(opt.id)}"
            min="${opt.min||1}" max="${opt.max||9999}" step="${opt.step||1}"
            value="${opt.default||1}" placeholder="${esc(opt.placeholder||'')}">
        </div>`;

      case 'text':
      case 'pages':
        return `<div class="form-group">
          <label class="form-label" for="${id}">${esc(opt.label)}</label>
          <input type="text" class="form-input" id="${id}" name="${esc(opt.id)}"
            placeholder="${esc(opt.placeholder||'')}" value="${esc(opt.default||'')}">
          ${opt.hint ? `<p class="form-hint">${esc(opt.hint)}</p>` : ''}
        </div>`;

      case 'password':
        return `<div class="form-group">
          <label class="form-label" for="${id}">${esc(opt.label)}</label>
          <div class="password-wrap">
            <input type="password" class="form-input" id="${id}" name="${esc(opt.id)}"
              placeholder="${esc(opt.placeholder||'Enter password…')}" autocomplete="off">
            <button type="button" class="pw-toggle" onclick="togglePW('${id}')" aria-label="Show/hide password">
              <i class="fas fa-eye" id="${id}-eye"></i>
            </button>
          </div>
        </div>`;

      case 'textarea':
        return `<div class="form-group">
          <label class="form-label" for="${id}">${esc(opt.label)}</label>
          <textarea class="form-textarea" id="${id}" name="${esc(opt.id)}"
            placeholder="${esc(opt.placeholder||'')}" rows="${opt.rows||4}">${esc(opt.default||'')}</textarea>
        </div>`;

      case 'color':
        return `<div class="form-group">
          <label class="form-label" for="${id}">${esc(opt.label)}</label>
          <div class="color-row">
            <input type="color" id="${id}" name="${esc(opt.id)}" value="${esc(opt.default||'#6366f1')}"
              class="color-swatch">
            <input type="text" id="${id}-hex" placeholder="#6366f1" class="form-input color-hex"
              value="${esc(opt.default||'#6366f1')}"
              oninput="document.getElementById('${id}').value=this.value">
          </div>
        </div>`;

      case 'url':
        return `<div class="form-group">
          <label class="form-label" for="${id}">${esc(opt.label)}</label>
          <input type="url" class="form-input" id="${id}" name="${esc(opt.id)}"
            placeholder="${esc(opt.placeholder||'https://')}" value="${esc(opt.default||'')}">
        </div>`;

      case 'checkbox':
        return `<div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="${id}" name="${esc(opt.id)}" value="true"
              ${opt.default ? 'checked' : ''} class="form-checkbox">
            <span class="checkbox-custom"></span>
            <span class="checkbox-text">${esc(opt.label)}</span>
          </label>
        </div>`;

      default: return '';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER PAGE — MUST BE CALLED BEFORE renderHeader() / renderFooter()
  ═══════════════════════════════════════════════════════════════════════════ */
  function renderPage() {
    const acceptAttr = C.acceptedTypes || '.pdf';

    /* Two-file mode (compare) */
    const twoFilesHTML = C.twoFiles ? `
      <div class="two-file-grid">
        ${['file1','file2'].map((fn, i) => `
          <div class="drop-zone two-dz" id="dz-${fn}" data-fname="${fn}">
            <input type="file" id="input-${fn}" name="${fn}" accept="${esc(acceptAttr)}"
              style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;z-index:2;">
            <div class="dz-glow"></div>
            <div class="dz-content">
              <div class="dz-icon-wrap"><i class="fas fa-file-pdf dz-main-icon"></i></div>
              <div class="dz-title">File ${i + 1}</div>
              <div class="dz-sub" id="dz-${fn}-name">Click or drag to upload</div>
            </div>
          </div>`).join('')}
      </div>` : '';

    /* URL-only mode (html-to-pdf) */
    const urlModeHTML = C.noFile ? `
      <div class="url-mode-wrap">
        <div class="form-group">
          <label class="form-label">
            <i class="fas fa-link"></i>
            Website URL
          </label>
          <input type="url" class="form-input url-big-input" id="url-input"
            placeholder="https://example.com" autocomplete="off">
          <p class="form-hint">Or upload an HTML file below</p>
        </div>
      </div>` : '';

    /* Main single/multi drop zone */
    const mainDropZone = (!C.twoFiles && !C.noFile) ? `
      <div class="drop-zone" id="mainDropZone">
        <input type="file" id="mainFileInput"
          accept="${esc(acceptAttr)}"
          ${C.multiFile ? 'multiple' : ''}
          style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;z-index:2;">
        <div class="dz-glow"></div>
        <div class="dz-content">
          <div class="dz-icon-wrap">
            <div class="dz-icon-bg"></div>
            <i class="fas fa-cloud-arrow-up dz-main-icon"></i>
          </div>
          <div class="dz-title">
            ${C.multiFile ? 'Drop files here or <span class="dz-click">click to browse</span>' : 'Drop file here or <span class="dz-click">click to browse</span>'}
          </div>
          <div class="dz-sub">
            ${(C.acceptedLabel||'PDF').split('/').map(t=>`<span class="dz-tag">${esc(t.trim())}</span>`).join('')}
            · Max 1 GB per file
          </div>
        </div>
      </div>` : '';

    /* Steps HTML */
    const stepsHTML = C.steps.length ? `
      <div class="steps-list">
        ${C.steps.map((s,i)=>`
          <div class="step-item">
            <div class="step-num">${i+1}</div>
            <div class="step-text">${esc(s)}</div>
          </div>`).join('')}
      </div>` : '';

    /* Features HTML */
    const featuresHTML = C.features.length ? `
      <div class="features-list">
        ${C.features.map(f=>`
          <div class="feature-item">
            <i class="fas fa-check feature-check"></i>
            <span>${esc(f)}</span>
          </div>`).join('')}
      </div>` : '';

    /* Related tools */
    const relatedHTML = C.related.length ? `
      <section class="related-section">
        <h2 class="section-title">Related Tools</h2>
        <div class="related-grid">
          ${C.related.map(r=>`
            <a href="${esc(r.url)}" class="related-card" style="--rc1:${esc(r.c1||'#6366f1')};--rc2:${esc(r.c2||'#8b5cf6')};">
              <div class="related-icon">${esc(r.emoji||'📄')}</div>
              <div class="related-info">
                <div class="related-name">${esc(r.name)}</div>
                <div class="related-desc">${esc(r.desc||'')}</div>
              </div>
              <i class="fas fa-arrow-right related-arrow"></i>
            </a>`).join('')}
        </div>
      </section>` : '';

    /* Options sidebar */
    const optionsHTML = C.options.length ? `
      <div class="sidebar-card options-card" id="optionsCard">
        <div class="sidebar-card-header">
          <i class="fas fa-sliders"></i>
          <span>Options</span>
        </div>
        <div class="sidebar-card-body">
          ${C.options.map(renderOption).join('')}
        </div>
      </div>` : '';

    /* How to use sidebar card */
    const howToHTML = (C.steps.length || C.features.length) ? `
      <div class="sidebar-card how-to-card">
        <div class="sidebar-card-header">
          <i class="fas fa-circle-info"></i>
          <span>How to Use</span>
        </div>
        <div class="sidebar-card-body">
          ${stepsHTML}
          ${featuresHTML}
        </div>
      </div>` : '';

    /* ── Set the full page body ───────────────────────────────────────────── */
    document.body.innerHTML = `
      <!-- Ambient background blobs -->
      <div class="page-bg-blobs" aria-hidden="true">
        <div class="blob blob1"></div>
        <div class="blob blob2"></div>
      </div>

      <div class="tool-page-wrap">

        <!-- Breadcrumb -->
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/"><i class="fas fa-house"></i> Home</a>
          <i class="fas fa-chevron-right bcrumb-sep"></i>
          <a href="/${esc(C.categorySlug||'')}#${esc((C.category||'').toLowerCase().replace(/\s+/g,''))}">${esc(C.category||'Tools')}</a>
          <i class="fas fa-chevron-right bcrumb-sep"></i>
          <span class="bcrumb-current">${esc(C.name)}</span>
        </nav>

        <!-- Tool Hero -->
        <div class="tool-hero anim-fadein">
          <div class="tool-hero-icon-wrap">
            <div class="tool-hero-icon">${esc(C.emoji||'📄')}</div>
            <div class="hero-icon-glow"></div>
          </div>
          <div class="tool-hero-text">
            <h1 class="tool-hero-title">${esc(C.name)}</h1>
            <p class="tool-hero-desc">${esc(C.description||'')}</p>
            <div class="tool-badges">
              <span class="badge badge-free"><i class="fas fa-infinity"></i> 100% Free</span>
              <span class="badge badge-fast"><i class="fas fa-bolt"></i> Lightning Fast</span>
              <span class="badge badge-secure"><i class="fas fa-lock"></i> Secure</span>
              <span class="badge badge-nosignup"><i class="fas fa-user-slash"></i> No Signup</span>
            </div>
          </div>
        </div>

        <!-- Main layout: upload + sidebar -->
        <div class="tool-main-grid">

          <!-- LEFT: Upload Card -->
          <div class="upload-col">
            <div class="upload-card anim-slideup">

              <div class="upload-card-header">
                <i class="fas fa-upload"></i>
                <span>Upload Your ${esc(C.multiFile ? 'Files' : 'File')}</span>
                ${C.multiFile ? `<span class="file-count-badge" id="fileCountBadge">0 / ${C.maxFiles}</span>` : ''}
              </div>

              ${urlModeHTML}
              ${mainDropZone}
              ${twoFilesHTML}

              <!-- File list with drag-to-reorder -->
              <div class="file-list" id="fileList"></div>

              <!-- Toast error -->
              <div class="error-toast" id="errorToast" role="alert">
                <i class="fas fa-triangle-exclamation"></i>
                <span id="errorMsg">Error message</span>
                <button class="error-close" onclick="document.getElementById('errorToast').classList.remove('visible')">✕</button>
              </div>

              <!-- Progress bar -->
              <div class="progress-wrap" id="progressWrap">
                <div class="progress-header">
                  <span class="progress-label" id="progressLabel">Processing…</span>
                  <span class="progress-pct" id="progressPct">0%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" id="progressFill"></div>
                  <div class="progress-glow" id="progressGlow"></div>
                </div>
                <div class="progress-steps">
                  <span class="pstep active" id="pstep1">📁 Uploading</span>
                  <span class="pstep" id="pstep2">⚙️ Processing</span>
                  <span class="pstep" id="pstep3">✅ Done</span>
                </div>
              </div>

              <!-- File result card -->
              <div class="result-card" id="resultCard">
                <div class="result-success-banner">
                  <i class="fas fa-circle-check"></i>
                  <span>File ready to download!</span>
                </div>
                <div class="result-body">
                  <div class="result-file-icon">
                    <i class="fas fa-file-pdf"></i>
                  </div>
                  <div class="result-file-info">
                    <div class="result-filename" id="resultFilename">${esc(C.outputFilename)}</div>
                    <div class="result-meta" id="resultMeta">Your processed file is ready</div>
                  </div>
                </div>
                <div class="result-actions">
                  <a class="btn-download" id="downloadBtn" href="#" download>
                    <i class="fas fa-download"></i>
                    Download File
                  </a>
                  <button class="btn-process-again" id="processAgainBtn" onclick="resetTool()">
                    <i class="fas fa-rotate-right"></i>
                    Process Another
                  </button>
                </div>
              </div>

              <!-- Text / AI result card -->
              <div class="text-result-card" id="textResultCard">
                <div class="text-result-header">
                  <span><i class="fas fa-sparkles"></i> Result</span>
                  <div class="text-result-actions">
                    <button class="btn-icon-sm" id="copyBtn" onclick="copyResult()" title="Copy to clipboard">
                      <i class="fas fa-copy"></i> Copy
                    </button>
                    <button class="btn-icon-sm" onclick="downloadText()" title="Download as text">
                      <i class="fas fa-download"></i> Save
                    </button>
                  </div>
                </div>
                <div class="text-result-body" id="textResultBody"></div>
              </div>

              <!-- Process Button -->
              <div class="process-btn-wrap">
                <button class="process-btn" id="processBtn" onclick="processFile()">
                  <span class="process-btn-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                  </span>
                  <span class="process-btn-icon">${esc(C.emoji||'⚡')}</span>
                  <span class="process-btn-text">Process ${esc(C.name)}</span>
                </button>
                <p class="process-btn-note">
                  <i class="fas fa-shield-halved"></i>
                  Files are processed securely and deleted immediately after
                </p>
              </div>

            </div><!-- /upload-card -->
          </div><!-- /upload-col -->

          <!-- RIGHT: Sidebar -->
          <div class="sidebar-col">
            ${optionsHTML}
            ${howToHTML}

            <!-- Quick stats card -->
            <div class="sidebar-card stats-card">
              <div class="sidebar-card-header">
                <i class="fas fa-chart-simple"></i>
                <span>Why IshuTools?</span>
              </div>
              <div class="sidebar-card-body">
                <div class="stat-row"><i class="fas fa-infinity stat-icon"></i><span>Always 100% free</span></div>
                <div class="stat-row"><i class="fas fa-server stat-icon"></i><span>No file size tricks — 1 GB limit</span></div>
                <div class="stat-row"><i class="fas fa-user-slash stat-icon"></i><span>Zero signup required</span></div>
                <div class="stat-row"><i class="fas fa-droplet-slash stat-icon"></i><span>Zero watermarks added</span></div>
                <div class="stat-row"><i class="fas fa-trash-alt stat-icon"></i><span>Files auto-deleted after use</span></div>
                <div class="stat-row"><i class="fas fa-mobile-screen stat-icon"></i><span>Works on all devices</span></div>
              </div>
            </div>
          </div><!-- /sidebar-col -->

        </div><!-- /tool-main-grid -->

        ${relatedHTML}

      </div><!-- /tool-page-wrap -->
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     FILE STATE
  ═══════════════════════════════════════════════════════════════════════════ */
  let uploadedFiles  = [];
  let twoFileMap     = {};
  let resultBlobURL  = null;
  let dragSrcIdx     = null;

  /* ═══════════════════════════════════════════════════════════════════════════
     ERROR / PROGRESS
  ═══════════════════════════════════════════════════════════════════════════ */
  function showError(msg) {
    const et = q('#errorToast'), em = q('#errorMsg');
    if (!et || !em) return;
    em.textContent = msg;
    et.classList.add('visible');
    setTimeout(() => et.classList.remove('visible'), 7000);
  }
  function hideError() {
    const et = q('#errorToast');
    if (et) et.classList.remove('visible');
  }

  let _pTimer = null;
  function startProgress(label) {
    const pw = q('#progressWrap');
    if (!pw) return;
    pw.classList.add('visible');
    q('#progressLabel').textContent = label || 'Processing…';
    q('#pstep1') && q('#pstep1').classList.add('active');
    q('#pstep2') && q('#pstep2').classList.remove('active');
    q('#pstep3') && q('#pstep3').classList.remove('active');
    let pct = 0;
    clearInterval(_pTimer);
    _pTimer = setInterval(() => {
      if (pct < 40)      pct += Math.random() * 5;
      else if (pct < 70) pct += Math.random() * 2.5;
      else if (pct < 88) pct += Math.random() * 0.8;
      if (pct > 88) pct = 88;
      _setPct(pct, pct > 40 ? 'Processing…' : 'Uploading…');
      if (pct > 40) {
        q('#pstep1') && q('#pstep1').classList.add('done');
        q('#pstep2') && q('#pstep2').classList.add('active');
      }
    }, 250);
  }
  function _setPct(pct, label) {
    const pf = q('#progressFill'), pp = q('#progressPct'), pl = q('#progressLabel');
    const pg = q('#progressGlow');
    if (pf) pf.style.width = Math.min(100, pct) + '%';
    if (pg) pg.style.left  = Math.min(98, pct) + '%';
    if (pp) pp.textContent = Math.round(pct) + '%';
    if (pl && label) pl.textContent = label;
  }
  function finishProgress() {
    clearInterval(_pTimer);
    _setPct(100, 'Done!');
    q('#pstep2') && q('#pstep2').classList.add('done');
    q('#pstep3') && q('#pstep3').classList.add('active', 'done');
  }
  function hideProgress() {
    const pw = q('#progressWrap');
    if (pw) pw.classList.remove('visible');
    clearInterval(_pTimer);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     FILE LIST RENDERING (with drag-to-reorder for multi-file)
  ═══════════════════════════════════════════════════════════════════════════ */
  function renderFileList() {
    const fl = q('#fileList');
    const badge = q('#fileCountBadge');
    if (!fl) return;
    if (badge) badge.textContent = `${uploadedFiles.length} / ${C.maxFiles}`;

    if (!uploadedFiles.length) {
      fl.innerHTML = '';
      fl.classList.remove('has-files');
      const dz = q('#mainDropZone');
      if (dz) dz.classList.remove('has-files');
      return;
    }

    fl.classList.add('has-files');
    const dz = q('#mainDropZone');
    if (dz) dz.classList.add('has-files');

    fl.innerHTML = uploadedFiles.map((f, i) => {
      const ext = f.name.split('.').pop().toUpperCase();
      const iconClass = getFileIcon(f);
      return `
        <div class="file-item ${C.multiFile ? 'draggable' : ''}"
          id="fi-${i}" data-idx="${i}"
          ${C.multiFile ? `draggable="true"` : ''}>
          ${C.multiFile ? `<div class="file-drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></div>` : ''}
          <div class="file-item-icon">
            <i class="${iconClass}"></i>
            <span class="file-ext-badge">${ext}</span>
          </div>
          <div class="file-item-info">
            <div class="file-item-name" title="${esc(f.name)}">${esc(f.name.length > 35 ? f.name.slice(0,32)+'…' : f.name)}</div>
            <div class="file-item-size">${fmtSize(f.size)}</div>
          </div>
          <button class="file-item-remove" onclick="removeFile(${i})" aria-label="Remove ${esc(f.name)}" title="Remove">
            <i class="fas fa-xmark"></i>
          </button>
        </div>`;
    }).join('');

    /* Drag-to-reorder setup */
    if (C.multiFile) {
      qa('.file-item.draggable', fl).forEach(el => {
        el.addEventListener('dragstart', e => {
          dragSrcIdx = parseInt(el.dataset.idx);
          el.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          qa('.file-item', fl).forEach(x => x.classList.remove('drag-over'));
        });
        el.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          qa('.file-item', fl).forEach(x => x.classList.remove('drag-over'));
          el.classList.add('drag-over');
        });
        el.addEventListener('drop', e => {
          e.preventDefault();
          const toIdx = parseInt(el.dataset.idx);
          if (dragSrcIdx !== null && dragSrcIdx !== toIdx) {
            const moved = uploadedFiles.splice(dragSrcIdx, 1)[0];
            uploadedFiles.splice(toIdx, 0, moved);
            renderFileList();
          }
          dragSrcIdx = null;
        });
      });
    }
  }

  function getFileIcon(f) {
    const name = f.name.toLowerCase();
    const type = f.type || '';
    if (name.endsWith('.pdf') || type === 'application/pdf') return 'fas fa-file-pdf';
    if (name.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/) || type.startsWith('image/')) return 'fas fa-file-image';
    if (name.match(/\.(doc|docx)$/) || type.includes('word')) return 'fas fa-file-word';
    if (name.match(/\.(xls|xlsx)$/) || type.includes('excel') || type.includes('spreadsheet')) return 'fas fa-file-excel';
    if (name.match(/\.(ppt|pptx)$/) || type.includes('presentation')) return 'fas fa-file-powerpoint';
    if (name.match(/\.(html|htm)$/) || type.includes('html')) return 'fas fa-file-code';
    return 'fas fa-file';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SETUP DROP ZONES
  ═══════════════════════════════════════════════════════════════════════════ */
  function setupDropZone() {
    const dz = q('#mainDropZone');
    const fi = q('#mainFileInput');
    if (!dz || !fi) return;

    /* Click handler — explicit, required for cross-browser */
    dz.addEventListener('click', function (e) {
      if (e.target === fi) return;
      fi.click();
    });

    fi.addEventListener('change', () => {
      addFiles([...fi.files]);
      fi.value = '';
    });

    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', e => {
      if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
    });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      addFiles([...e.dataTransfer.files]);
    });
  }

  function setupTwoFileDZs() {
    ['file1', 'file2'].forEach(fn => {
      const dz = q(`#dz-${fn}`);
      const fi = q(`#input-${fn}`);
      if (!dz || !fi) return;

      dz.addEventListener('click', function (e) {
        if (e.target === fi) return;
        fi.click();
      });
      fi.addEventListener('change', () => {
        if (fi.files[0]) {
          twoFileMap[fn] = fi.files[0];
          const nameEl = q(`#dz-${fn}-name`);
          if (nameEl) nameEl.textContent = fi.files[0].name;
          dz.classList.add('has-files');
        }
        fi.value = '';
      });
      dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
      dz.addEventListener('drop', e => {
        e.preventDefault(); dz.classList.remove('drag-over');
        const f = e.dataTransfer.files[0];
        if (f) {
          twoFileMap[fn] = f;
          const nameEl = q(`#dz-${fn}-name`);
          if (nameEl) nameEl.textContent = f.name;
          dz.classList.add('has-files');
        }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ADD / REMOVE FILES
  ═══════════════════════════════════════════════════════════════════════════ */
  function addFiles(newFiles) {
    if (!newFiles.length) return;
    hideError();
    const allowed = (C.acceptedTypes || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const f of newFiles) {
      if (allowed.length && !allowed.some(ext => {
        if (ext.startsWith('.')) return f.name.toLowerCase().endsWith(ext);
        return (f.type || '').startsWith(ext);
      })) {
        showError(`"${f.name}" is not supported. Accepted: ${C.acceptedLabel}`);
        return;
      }
    }
    if (C.multiFile) {
      if (uploadedFiles.length + newFiles.length > C.maxFiles) {
        showError(`Maximum ${C.maxFiles} files allowed.`);
        return;
      }
      uploadedFiles.push(...newFiles);
    } else {
      uploadedFiles = [newFiles[0]];
    }
    renderFileList();
  }

  window.removeFile = function (idx) {
    uploadedFiles.splice(idx, 1);
    renderFileList();
  };

  window.resetTool = function () {
    uploadedFiles = [];
    twoFileMap = {};
    if (resultBlobURL) { URL.revokeObjectURL(resultBlobURL); resultBlobURL = null; }
    renderFileList();
    q('#resultCard')     && q('#resultCard').classList.remove('visible');
    q('#textResultCard') && q('#textResultCard').classList.remove('visible');
    hideProgress();
    hideError();
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     PASSWORD TOGGLE
  ═══════════════════════════════════════════════════════════════════════════ */
  window.togglePW = function (id) {
    const inp = q(`#${id}`);
    const eye = q(`#${id}-eye`);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (eye) eye.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     BUILD FORM DATA
  ═══════════════════════════════════════════════════════════════════════════ */
  function buildFormData() {
    const fd = new FormData();

    if (C.twoFiles) {
      if (!twoFileMap.file1 || !twoFileMap.file2)
        throw new Error('Please upload both files to compare.');
      fd.append('file1', twoFileMap.file1);
      fd.append('file2', twoFileMap.file2);
    } else if (!C.noFile) {
      if (!uploadedFiles.length)
        throw new Error(`Please upload a ${C.acceptedLabel} file first.`);
      if (C.multiFile) {
        if (uploadedFiles.length < (C.minFiles || 1))
          throw new Error(`Please upload at least ${C.minFiles} files.`);
        uploadedFiles.forEach(f => fd.append('files', f));
      } else {
        fd.append('file', uploadedFiles[0]);
      }
    }

    /* URL mode */
    const urlInput = q('#url-input');
    if (urlInput && urlInput.value.trim()) {
      fd.append('html_url', urlInput.value.trim());
    }

    /* Options */
    C.options.forEach(opt => {
      if (opt.type === 'radio') {
        const checked = document.querySelector(`[name="${opt.id}"]:checked`);
        if (checked) fd.append(opt.id, checked.value);
      } else if (opt.type === 'checkbox') {
        const el = q(`#opt-${opt.id}`);
        if (el) fd.append(opt.id, el.checked ? 'true' : 'false');
      } else {
        const el = q(`#opt-${opt.id}`);
        if (el && el.value !== undefined && el.value !== '')
          fd.append(opt.id, el.value);
      }
    });

    return fd;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PROCESS / SUBMIT
  ═══════════════════════════════════════════════════════════════════════════ */
  window.processFile = async function () {
    hideError();
    const btn = q('#processBtn');
    let fd;

    try { fd = buildFormData(); }
    catch (err) { showError(err.message); return; }

    btn.classList.add('loading');
    btn.disabled = true;
    q('#resultCard')     && q('#resultCard').classList.remove('visible');
    q('#textResultCard') && q('#textResultCard').classList.remove('visible');
    startProgress('Uploading file…');

    try {
      const resp = await fetch(C.apiEndpoint, { method: 'POST', body: fd });
      finishProgress();

      if (C.resultType === 'json') {
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || `Server error ${resp.status}`);
        await showJSONResult(data);
      } else if (C.resultType === 'text') {
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          throw new Error(d.error || `Server error ${resp.status}`);
        }
        const text = await resp.text();
        showTextResult(text);
      } else {
        /* File download */
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: `Server error ${resp.status}` }));
          throw new Error(errData.error || `Server error ${resp.status}`);
        }
        const blob = await resp.blob();
        if (resultBlobURL) URL.revokeObjectURL(resultBlobURL);
        resultBlobURL = URL.createObjectURL(blob);

        const dlBtn = q('#downloadBtn');
        if (dlBtn) { dlBtn.href = resultBlobURL; dlBtn.download = C.outputFilename; }

        const fnEl = q('#resultFilename');
        if (fnEl) fnEl.textContent = C.outputFilename;

        /* Size info */
        const origSize = uploadedFiles[0] ? fmtSize(uploadedFiles[0].size) : '';
        const newSize  = fmtSize(blob.size);
        const metaEl   = q('#resultMeta');
        if (metaEl) metaEl.textContent = origSize ? `${origSize} → ${newSize}` : `Size: ${newSize}`;

        /* Update icon based on output type */
        const iconEl = q('.result-file-icon i');
        if (iconEl) {
          const mime = C.outputMime || '';
          if (mime.includes('zip')) iconEl.className = 'fas fa-file-zipper';
          else if (mime.includes('word') || C.outputFilename.endsWith('.docx')) iconEl.className = 'fas fa-file-word';
          else if (mime.includes('excel') || C.outputFilename.endsWith('.xlsx')) iconEl.className = 'fas fa-file-excel';
          else if (mime.includes('presentation') || C.outputFilename.endsWith('.pptx')) iconEl.className = 'fas fa-file-powerpoint';
          else iconEl.className = 'fas fa-file-pdf';
        }

        const rc = q('#resultCard');
        if (rc) rc.classList.add('visible');
      }
    } catch (err) {
      _setPct(0, 'Error');
      showError(err.message || 'Processing failed. Please try again.');
    } finally {
      setTimeout(hideProgress, 1500);
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     SHOW RESULTS
  ═══════════════════════════════════════════════════════════════════════════ */
  function showTextResult(text) {
    const card = q('#textResultCard'), body = q('#textResultBody');
    if (!card || !body) return;
    body.textContent = text;
    card.classList.add('visible');
    window._resultText = text;
  }

  async function showJSONResult(data) {
    const card = q('#textResultCard'), body = q('#textResultBody');
    if (!card || !body) return;
    let html = '';

    /* AI Summarizer result */
    if (data.summary !== undefined) {
      const { summary='', word_count=0, page_count=0, reading_time_min=0, key_topics=[], sentiment='' } = data;
      html += `<div class="result-stats-row">
        <div class="result-stat"><i class="fas fa-file-lines"></i><span>${page_count} pages</span></div>
        <div class="result-stat"><i class="fas fa-align-left"></i><span>${Number(word_count).toLocaleString()} words</span></div>
        <div class="result-stat"><i class="fas fa-clock"></i><span>~${reading_time_min} min read</span></div>
        ${sentiment ? `<div class="result-stat"><i class="fas fa-face-smile"></i><span>${esc(sentiment)}</span></div>` : ''}
      </div>`;
      if (key_topics && key_topics.length) {
        html += `<div class="result-topics">
          ${key_topics.map(t => `<span class="topic-pill">${esc(t)}</span>`).join('')}
        </div>`;
      }
      html += `<div class="result-text">${esc(summary)}</div>`;
      window._resultText = summary;

    /* Compare PDF result */
    } else if (data.differences !== undefined) {
      const diff = data.differences;
      const text = typeof diff === 'string' ? diff : JSON.stringify(diff, null, 2);
      html += `<div class="result-compare">
        <div class="compare-stat ${data.are_identical ? 'identical' : 'different'}">
          <i class="fas ${data.are_identical ? 'fa-equals' : 'fa-not-equal'}"></i>
          ${data.are_identical ? 'Files are identical' : 'Files have differences'}
        </div>
        <pre class="result-diff">${esc(text)}</pre>
      </div>`;
      window._resultText = text;

    /* Generic JSON */
    } else {
      const text = JSON.stringify(data, null, 2);
      html += `<pre class="result-json">${esc(text)}</pre>`;
      window._resultText = text;
    }

    body.innerHTML = html;
    card.classList.add('visible');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     COPY / DOWNLOAD TEXT
  ═══════════════════════════════════════════════════════════════════════════ */
  window.copyResult = function () {
    const t = window._resultText || q('#textResultBody')?.textContent || '';
    navigator.clipboard.writeText(t).then(() => {
      const btn = q('#copyBtn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        btn.style.color = '#10b981';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
      }
    });
  };

  window.downloadText = function () {
    const t = window._resultText || q('#textResultBody')?.textContent || '';
    const blob = new Blob([t], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = C.id + '-result.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     KEYBOARD SHORTCUTS
  ═══════════════════════════════════════════════════════════════════════════ */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault(); window.location.href = '/';
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const btn = q('#processBtn');
      if (btn && !btn.disabled) btn.click();
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════════
     GSAP DYNAMIC LOADER
  ═══════════════════════════════════════════════════════════════════════════ */
  function loadGSAP(callback) {
    if (typeof gsap !== 'undefined') { callback(); return; }
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/gsap.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/ScrollTrigger.min.js';
      s2.onload = callback;
      s2.onerror = callback;
      document.head.appendChild(s2);
    };
    s1.onerror = () => {}; /* fail silently */
    document.head.appendChild(s1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     GSAP ANIMATIONS (if available)
  ═══════════════════════════════════════════════════════════════════════════ */
  function initAnimations() {
    if (typeof gsap === 'undefined') return;

    /* Fade in breadcrumb + hero */
    gsap.from('.breadcrumb', { opacity: 0, y: -15, duration: 0.5, ease: 'power2.out' });
    gsap.from('.tool-hero',  { opacity: 0, y: 20,  duration: 0.6, delay: 0.1, ease: 'power2.out' });
    gsap.from('.upload-card', { opacity: 0, y: 30, duration: 0.6, delay: 0.2, ease: 'power2.out' });
    gsap.from('.sidebar-card', {
      opacity: 0, x: 20, duration: 0.5, delay: 0.3, ease: 'power2.out',
      stagger: 0.1
    });

    /* ScrollTrigger for related tools */
    if (typeof ScrollTrigger !== 'undefined' && q('.related-section')) {
      gsap.registerPlugin(ScrollTrigger);
      gsap.from('.related-card', {
        opacity: 0, y: 30, duration: 0.5,
        stagger: 0.08,
        scrollTrigger: { trigger: '.related-section', start: 'top 85%' }
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INIT — ORDER IS CRITICAL: renderPage → renderHeader → renderFooter
  ═══════════════════════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    renderPage();      /* ① Sets document.body.innerHTML — MUST come first */
    renderHeader();    /* ② Prepends header to already-rendered body */
    renderFooter();    /* ③ Appends footer to already-rendered body */
    setupDropZone();   /* ④ Wire drop zone events (elements exist now) */
    if (C.twoFiles) setupTwoFileDZs();
    setTimeout(() => loadGSAP(initAnimations), 200); /* ⑤ Load GSAP then animate */
  });

})();
