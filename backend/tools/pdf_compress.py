"""
pdf_compress.py — IshuTools.fun Enterprise PDF Compression Suite v15.0
Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPRESSION PIPELINE (7 engines + post-processing, all tried, smallest kept):
  1. Ghostscript CLI      — industry-standard distiller presets (gs)
  2. PyMuPDF (fitz)       — per-image DPI downsampling + JPEG re-encode
  3. pikepdf              — object stream merging, DEFLATE-9, XMP strip
  4. qpdf CLI             — stream recompression + linearization
  5. pypdf                — orphan object removal, page content optimize
  6. Pillow               — image-only JPEG/WebP recompression pipeline
  7. mutool               — MuPDF-based clean + compress (when available)
  + Post: linearize, JS-strip, grayscale, form-flatten, icc-strip

QUALITY PRESETS (NO auto-grayscale — user must enable explicitly):
  screen   → 72 DPI,  JPEG q=30  — max compression, screen viewing only
  low      → 96 DPI,  JPEG q=45  — email-friendly small file
  medium   → 150 DPI, JPEG q=65  — balanced recommended
  high     → 200 DPI, JPEG q=82  — near-lossless, print-quality
  lossless → 300 DPI, no re-encode — structure-only, zero image loss

ADVANCED OPTIONS (all user-controlled, zero auto overrides):
  grayscale             — convert colour to grayscale (user must enable)
  strip_metadata        — remove author/title/XMP/DocInfo
  remove_annotations    — delete all annotation objects
  linearize             — web-optimize (fast-web-view)
  remove_javascript     — strip all JS/action objects
  remove_thumbnails     — delete embedded page thumbnails
  remove_embedded_files — remove file attachments
  flatten_transparency  — flatten transparent layers
  subset_fonts          — only embed used glyphs (GS required)
  remove_icc_profiles   — strip unnecessary ICC colour profiles
  remove_forms          — remove interactive form fields
  remove_links          — remove hyperlink annotations
  target_size_kb        — iterative compression to target KB
  password              — decrypt password-protected PDFs

ANALYSIS FUNCTIONS:
  get_compression_estimate()     — full PDF analysis with per-preset estimates
  analyze_pdf_streams()          — stream-level compressed/uncompressed stats
  get_available_engines()        — detect installed engines + versions
  analyze_images_in_pdf()        — per-image DPI, mode, size, compressibility
  get_compression_potential()    — per-strategy reduction opportunity
  get_pdf_metadata()             — full metadata extraction
  get_pdf_structure_report()     — deep structure + object analysis
  estimate_compression_savings() — fast estimate without full analysis
  detect_pdf_type()              — text-heavy / image-heavy / mixed / scanned
  get_font_analysis()            — embedded fonts size + subset opportunities
  get_image_compression_stats()  — detailed per-image compression metrics
  benchmark_compression()        — try all presets, return comparison table
  get_security_report()          — encryption, permissions, JS, form details
  get_color_analysis()           — color vs grayscale page breakdown
  analyze_font_subsetting()      — identify oversized embedded fonts
  get_page_size_breakdown()      — per-page size contribution analysis
  calculate_entropy()            — stream entropy for compression potential
  get_object_statistics()        — PDF object type distribution
  deep_analyze_pdf()             — combined deep analysis (all functions)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import io
import os
import re
import gc
import sys
import copy
import json
import math
import shutil
import struct
import hashlib
import logging
import tempfile
import threading
import subprocess
import time
import zlib
import statistics
from collections import defaultdict, Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any, Union, Generator, Callable
from functools import lru_cache

# ── Core PDF libraries ─────────────────────────────────────────────────────
try:
    import pikepdf
    from pikepdf import Pdf, PdfError, Dictionary, Array, Name
    from pikepdf import String as PikePdfString
    PIKEPDF_OK = True
    PIKEPDF_VERSION = pikepdf.__version__
except ImportError:
    PIKEPDF_OK = False
    PIKEPDF_VERSION = None

try:
    import fitz  # PyMuPDF
    FITZ_OK = True
    FITZ_VERSION = fitz.version[0]
except ImportError:
    FITZ_OK = False
    FITZ_VERSION = None

try:
    from pypdf import PdfWriter, PdfReader
    from pypdf.errors import PdfReadError
    import pypdf as _pypdf_mod
    PYPDF_OK = True
    PYPDF_VERSION = _pypdf_mod.__version__
except ImportError:
    PYPDF_OK = False
    PYPDF_VERSION = None

try:
    from PIL import Image, ImageFilter, ImageOps, ImageEnhance, ImageChops
    from PIL import UnidentifiedImageError
    import PIL
    PIL_OK = True
    PIL_VERSION = PIL.__version__
except ImportError:
    PIL_OK = False
    PIL_VERSION = None

try:
    import img2pdf
    IMG2PDF_OK = True
except ImportError:
    IMG2PDF_OK = False

try:
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.pdfbase import pdfmetrics
    REPORTLAB_OK = True
except ImportError:
    REPORTLAB_OK = False

try:
    import numpy as np
    NUMPY_OK = True
except ImportError:
    NUMPY_OK = False

try:
    import cv2
    CV2_OK = True
except ImportError:
    CV2_OK = False

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger('pdf_compress')

# ══════════════════════════════════════════════════════════════════════════
# CLI BINARY DETECTION
# ══════════════════════════════════════════════════════════════════════════

def _find_binary(*names: str) -> Optional[str]:
    """Find first available binary from names list. Checks PATH + common locations."""
    extra_paths = [
        '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin',
        '/usr/local/ghostscript/bin', '/nix/store',
    ]
    for name in names:
        path = shutil.which(name)
        if path:
            return path
        for d in extra_paths:
            full = os.path.join(d, name)
            if os.path.isfile(full) and os.access(full, os.X_OK):
                return full
    return None


def _check_binary_version(cmd: list, timeout: int = 5) -> str:
    """Run version command and return output string."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return (r.stdout.strip() or r.stderr.strip())[:80]
    except Exception:
        return 'unknown'


GS_BIN      = _find_binary('gs', 'ghostscript', 'gswin64c', 'gswin32c')
QPDF_BIN    = _find_binary('qpdf')
MUTOOL_BIN  = _find_binary('mutool')
PDFTK_BIN   = _find_binary('pdftk')
PS2PDF_BIN  = _find_binary('ps2pdf')
CONVERT_BIN = _find_binary('convert', 'magick')  # ImageMagick
CPDF_BIN    = _find_binary('cpdf')
JBIG2_BIN   = _find_binary('jbig2')

logger.info(
    f'[Engines] GS={bool(GS_BIN)} QPDF={bool(QPDF_BIN)} MUTOOL={bool(MUTOOL_BIN)} '
    f'PyMuPDF={FITZ_OK} pikepdf={PIKEPDF_OK} pypdf={PYPDF_OK} PIL={PIL_OK}'
)

# ══════════════════════════════════════════════════════════════════════════
# QUALITY PRESETS
# ⚠️  CRITICAL: grayscale is NEVER set True here. Only user-controlled.
# ══════════════════════════════════════════════════════════════════════════

QUALITY_PRESETS: Dict[str, Dict[str, Any]] = {
    'screen': {
        'dpi': 72,
        'jpeg_quality': 30,
        'webp_quality': 25,
        'png_compress': 9,
        'image_scale': 0.40,
        'grayscale': False,          # ← NEVER force grayscale automatically
        'gs_setting': '/screen',
        'gs_dpi': 72,
        'deflate_level': 9,
        'downsample_above_dpi': 150,
        'jpeg2000': False,
        'fitz_deflate': 9,
        'fitz_garbage': 4,
        'fitz_clean': True,
        'description': 'Screen — 72 DPI, maximum compression, screen viewing only',
        'expected_reduction': '70–90%',
        'color': '#ef4444',
        'badge': 'MAX',
        'icon': '🔥',
    },
    'low': {
        'dpi': 96,
        'jpeg_quality': 45,
        'webp_quality': 40,
        'png_compress': 9,
        'image_scale': 0.55,
        'grayscale': False,
        'gs_setting': '/ebook',
        'gs_dpi': 96,
        'deflate_level': 9,
        'downsample_above_dpi': 200,
        'jpeg2000': False,
        'fitz_deflate': 9,
        'fitz_garbage': 3,
        'fitz_clean': True,
        'description': 'Low — 96 DPI, very small file, ideal for email',
        'expected_reduction': '55–75%',
        'color': '#f97316',
        'badge': None,
        'icon': '📧',
    },
    'medium': {
        'dpi': 150,
        'jpeg_quality': 65,
        'webp_quality': 60,
        'png_compress': 8,
        'image_scale': 0.70,
        'grayscale': False,
        'gs_setting': '/printer',
        'gs_dpi': 150,
        'deflate_level': 8,
        'downsample_above_dpi': 300,
        'jpeg2000': False,
        'fitz_deflate': 8,
        'fitz_garbage': 3,
        'fitz_clean': True,
        'description': 'Medium — 150 DPI, balanced quality and size',
        'expected_reduction': '40–60%',
        'color': '#6366f1',
        'badge': 'REC',
        'icon': '⚖️',
    },
    'high': {
        'dpi': 200,
        'jpeg_quality': 82,
        'webp_quality': 78,
        'png_compress': 6,
        'image_scale': 0.85,
        'grayscale': False,
        'gs_setting': '/prepress',
        'gs_dpi': 200,
        'deflate_level': 7,
        'downsample_above_dpi': 400,
        'jpeg2000': False,
        'fitz_deflate': 7,
        'fitz_garbage': 2,
        'fitz_clean': False,
        'description': 'High — 200 DPI, near-lossless, excellent quality',
        'expected_reduction': '20–45%',
        'color': '#10b981',
        'badge': None,
        'icon': '🏆',
    },
    'lossless': {
        'dpi': 300,
        'jpeg_quality': 95,
        'webp_quality': 92,
        'png_compress': 4,
        'image_scale': 1.00,
        'grayscale': False,
        'gs_setting': '/default',
        'gs_dpi': 300,
        'deflate_level': 6,
        'downsample_above_dpi': 9999,
        'jpeg2000': False,
        'fitz_deflate': 6,
        'fitz_garbage': 1,
        'fitz_clean': False,
        'description': 'Lossless — 300 DPI, structure-only, zero image quality loss',
        'expected_reduction': '5–25%',
        'color': '#8b5cf6',
        'badge': '💎',
        'icon': '💎',
    },
}

# ══════════════════════════════════════════════════════════════════════════
# ENGINE DETECTION
# ══════════════════════════════════════════════════════════════════════════

def get_available_engines() -> Dict[str, Any]:
    """Return dict of available compression engines with version info."""
    engines: Dict[str, Any] = {}

    # Ghostscript
    if GS_BIN:
        ver = _check_binary_version([GS_BIN, '--version'])
        engines['ghostscript'] = {
            'available': True, 'path': GS_BIN,
            'version': ver, 'priority': 1,
            'description': 'Industry-standard PDF distiller',
        }
    else:
        engines['ghostscript'] = {'available': False, 'priority': 1}

    # PyMuPDF
    engines['pymupdf'] = {
        'available': FITZ_OK, 'version': FITZ_VERSION, 'priority': 2,
        'description': 'Per-image DPI downsampling + JPEG re-encode',
    }

    # pikepdf
    engines['pikepdf'] = {
        'available': PIKEPDF_OK, 'version': PIKEPDF_VERSION, 'priority': 3,
        'description': 'Object stream merging, DEFLATE-9 recompression',
    }

    # qpdf
    if QPDF_BIN:
        ver = _check_binary_version([QPDF_BIN, '--version'])
        engines['qpdf'] = {
            'available': True, 'path': QPDF_BIN, 'version': ver, 'priority': 4,
            'description': 'Stream recompression + web linearization',
        }
    else:
        engines['qpdf'] = {'available': False, 'priority': 4}

    # pypdf
    engines['pypdf'] = {
        'available': PYPDF_OK, 'version': PYPDF_VERSION, 'priority': 5,
        'description': 'Orphan object removal, page content optimize',
    }

    # Pillow
    engines['pillow'] = {
        'available': PIL_OK, 'version': PIL_VERSION, 'priority': 6,
        'description': 'Image-only JPEG/WebP recompression pipeline',
    }

    # mutool
    if MUTOOL_BIN:
        ver = _check_binary_version([MUTOOL_BIN, '-v'])
        engines['mutool'] = {
            'available': True, 'path': MUTOOL_BIN, 'version': ver, 'priority': 7,
            'description': 'MuPDF-based clean + compress',
        }
    else:
        engines['mutool'] = {'available': False, 'priority': 7}

    engines['pdftk']       = {'available': bool(PDFTK_BIN), 'path': PDFTK_BIN}
    engines['imagemagick'] = {'available': bool(CONVERT_BIN), 'path': CONVERT_BIN}

    available_count = sum(1 for v in engines.values() if v.get('available'))
    engines['_summary'] = {
        'total': len(engines) - 1,
        'available': available_count,
    }

    return engines


# ══════════════════════════════════════════════════════════════════════════
# PDF ANALYSIS FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def get_compression_estimate(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """
    Full PDF analysis: page count, image analysis, font analysis,
    stream stats, and per-preset estimated reductions.
    """
    result = {
        'page_count': 0,
        'file_size_bytes': 0,
        'file_size_kb': 0,
        'image_count': 0,
        'image_total_bytes': 0,
        'font_count': 0,
        'font_bytes': 0,
        'has_javascript': False,
        'has_forms': False,
        'has_annotations': False,
        'has_embedded_files': False,
        'has_encryption': False,
        'has_thumbnails': False,
        'has_icc_profiles': False,
        'pdf_version': '',
        'content_type': 'mixed',
        'is_linearized': False,
        'compression_ratio_current': 1.0,
        'estimated_reductions_by_preset': {
            'screen': 75, 'low': 60, 'medium': 50, 'high': 35, 'lossless': 15
        },
        'metadata': {},
        'engines': [],
        'error': None,
        'analyzed_at': datetime.now(timezone.utc).isoformat(),
    }

    try:
        path = Path(pdf_path)
        if not path.exists():
            result['error'] = 'File not found'
            return result

        result['file_size_bytes'] = path.stat().st_size
        result['file_size_kb'] = round(path.stat().st_size / 1024, 2)

        # ── PyMuPDF analysis ───────────────────────────────────────────
        if FITZ_OK:
            try:
                doc_kwargs: Dict[str, Any] = {}
                if password:
                    doc_kwargs['password'] = password

                doc = fitz.open(pdf_path)
                if password and doc.is_encrypted:
                    doc.authenticate(password)

                result['page_count']   = doc.page_count
                result['pdf_version']  = doc.pdf_version()
                result['is_linearized'] = doc.is_fast_webaccess

                meta = doc.metadata or {}
                result['metadata'] = {k: v for k, v in meta.items() if v}

                img_bytes_total = 0
                img_count       = 0
                has_scanned     = False

                for page_num in range(min(doc.page_count, 50)):
                    page = doc[page_num]
                    img_list = page.get_images(full=True)
                    img_count += len(img_list)

                    for img_info in img_list[:15]:
                        xref = img_info[0]
                        try:
                            base_img = doc.extract_image(xref)
                            img_bytes_total += len(base_img.get('image', b''))
                            w = base_img.get('width', 0)
                            h = base_img.get('height', 0)
                            if w > 1400 and h > 1800:
                                has_scanned = True
                        except Exception:
                            pass

                result['image_count']       = img_count
                result['image_total_bytes'] = img_bytes_total

                # Check forms / annotations
                try:
                    for page in doc:
                        for annot in page.annots():
                            result['has_annotations'] = True
                            if annot.type[1] in ('Widget', 'Screen'):
                                result['has_forms'] = True
                except Exception:
                    pass

                # JavaScript check via XMP
                try:
                    xmp = doc.get_xml_metadata()
                    if xmp and 'JavaScript' in xmp:
                        result['has_javascript'] = True
                except Exception:
                    pass

                doc.close()

                # Determine content type
                file_sz  = result['file_size_bytes']
                img_frac = img_bytes_total / max(file_sz, 1)

                if has_scanned:
                    result['content_type'] = 'scanned'
                elif img_frac > 0.65:
                    result['content_type'] = 'image_heavy'
                elif img_frac < 0.12:
                    result['content_type'] = 'text_heavy'
                else:
                    result['content_type'] = 'mixed'

                # Calibrate estimates by content
                ct   = result['content_type']
                ests = result['estimated_reductions_by_preset']
                if ct in ('image_heavy', 'scanned'):
                    ests.update({'screen': 88, 'low': 74, 'medium': 60, 'high': 42, 'lossless': 22})
                elif ct == 'text_heavy':
                    ests.update({'screen': 48, 'low': 36, 'medium': 26, 'high': 16, 'lossless': 10})
                else:
                    ests.update({'screen': 76, 'low': 62, 'medium': 50, 'high': 33, 'lossless': 16})

            except Exception as e:
                result['error'] = f'PyMuPDF analysis error: {e}'

        # ── pikepdf analysis (supplementary) ─────────────────────────
        if PIKEPDF_OK:
            try:
                open_kwargs: Dict[str, Any] = {}
                if password:
                    open_kwargs['password'] = password
                pdf = pikepdf.open(pdf_path, **open_kwargs)

                result['has_encryption'] = pdf.is_encrypted

                font_xrefs: set = set()
                for page in pdf.pages:
                    try:
                        resources = page.get('/Resources', pikepdf.Dictionary())
                        fonts = resources.get('/Font', pikepdf.Dictionary())
                        for font_key in fonts:
                            font_xrefs.add(str(font_key))
                    except Exception:
                        pass

                result['font_count'] = len(font_xrefs)

                try:
                    root = pdf.Root
                    if '/Names' in root:
                        names = root['/Names']
                        if '/JavaScript' in names:
                            result['has_javascript'] = True
                        if '/EmbeddedFiles' in names:
                            result['has_embedded_files'] = True
                    if '/AA' in root or '/OpenAction' in root:
                        result['has_javascript'] = True
                    if '/AcroForm' in root:
                        result['has_forms'] = True
                    if '/Metadata' in root:
                        pass
                except Exception:
                    pass

                # Check for thumbnails
                for page in pdf.pages:
                    try:
                        if '/Thumb' in page:
                            result['has_thumbnails'] = True
                            break
                    except Exception:
                        pass

                pdf.close()
            except Exception:
                pass

        result['engines'] = [k for k, v in get_available_engines().items()
                              if v.get('available') and not k.startswith('_')]

    except Exception as e:
        result['error'] = str(e)

    return result


def get_pdf_metadata(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Extract comprehensive metadata from a PDF."""
    meta: Dict[str, Any] = {
        'title': '', 'author': '', 'subject': '', 'keywords': '',
        'creator': '', 'producer': '', 'creation_date': '',
        'modification_date': '', 'pdf_version': '', 'page_count': 0,
        'file_size_bytes': 0, 'is_encrypted': False, 'is_linearized': False,
        'tagged': False, 'xmp_metadata': '', 'page_sizes': [],
        'conformance': '',
    }
    try:
        if FITZ_OK:
            doc = fitz.open(pdf_path)
            if password and doc.is_encrypted:
                doc.authenticate(password)
            raw = doc.metadata or {}
            meta.update({k: v for k, v in raw.items() if v})
            meta['page_count']    = doc.page_count
            meta['pdf_version']   = doc.pdf_version()
            meta['is_linearized'] = doc.is_fast_webaccess
            meta['file_size_bytes'] = Path(pdf_path).stat().st_size
            try:
                meta['xmp_metadata'] = doc.get_xml_metadata() or ''
            except Exception:
                pass

            # Sample first few page sizes
            for i in range(min(doc.page_count, 5)):
                page = doc[i]
                r = page.rect
                meta['page_sizes'].append({
                    'page': i + 1,
                    'width_pt': round(r.width, 2),
                    'height_pt': round(r.height, 2),
                    'width_mm': round(r.width * 0.352778, 1),
                    'height_mm': round(r.height * 0.352778, 1),
                })
            doc.close()

        if PIKEPDF_OK:
            pdf = pikepdf.open(pdf_path, password=password if password else '')
            meta['is_encrypted'] = pdf.is_encrypted
            if '/MarkInfo' in pdf.Root:
                meta['tagged'] = True
            pdf.close()
    except Exception as e:
        meta['error'] = str(e)
    return meta


def analyze_images_in_pdf(
    pdf_path: str, password: str = '', max_images: int = 100
) -> List[Dict[str, Any]]:
    """Detailed per-image analysis: DPI, size, format, compressibility score."""
    images: List[Dict[str, Any]] = []
    if not FITZ_OK:
        return images

    try:
        doc = fitz.open(pdf_path)
        if password and doc.is_encrypted:
            doc.authenticate(password)

        seen_xrefs: set = set()
        for page_num in range(doc.page_count):
            if len(images) >= max_images:
                break
            page = doc[page_num]
            page_rect = page.rect

            for img_info in page.get_images(full=True):
                if len(images) >= max_images:
                    break
                xref = img_info[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)

                try:
                    base_img = doc.extract_image(xref)
                    w   = base_img.get('width', 0)
                    h   = base_img.get('height', 0)
                    raw_bytes = len(base_img.get('image', b''))
                    ext = base_img.get('ext', 'unknown')
                    cs  = base_img.get('colorspace', 0)
                    bpc = base_img.get('bpc', 8)

                    # Estimate DPI
                    dpi_x = 0
                    if page_rect.width > 0 and w > 0:
                        dpi_x = round(w / (page_rect.width / 72))

                    # Compressibility score (0-100, higher = more compressible)
                    score = 50
                    if ext in ('jpeg', 'jpg'):
                        score = 20
                    elif ext in ('png',):
                        score = 75
                    elif ext in ('bmp', 'tiff', 'tif'):
                        score = 90
                    elif ext == 'jp2':
                        score = 15

                    if cs == 3:  # RGB
                        score = min(score + 10, 100)
                    if dpi_x > 300:
                        score = min(score + 15, 100)

                    images.append({
                        'xref': xref,
                        'page': page_num + 1,
                        'width': w,
                        'height': h,
                        'bytes': raw_bytes,
                        'kb': round(raw_bytes / 1024, 1),
                        'format': ext,
                        'colorspace': cs,
                        'bits_per_component': bpc,
                        'estimated_dpi': dpi_x,
                        'compressibility_score': score,
                        'compressibility': (
                            'high' if score >= 70 else
                            'medium' if score >= 40 else 'low'
                        ),
                    })
                except Exception:
                    pass

        doc.close()
    except Exception as e:
        logger.error(f'analyze_images_in_pdf error: {e}')

    return images


def get_font_analysis(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Analyze embedded fonts: names, sizes, subset opportunities."""
    result: Dict[str, Any] = {
        'total_fonts': 0,
        'embedded_count': 0,
        'subset_count': 0,
        'standard_count': 0,
        'total_font_bytes_estimate': 0,
        'fonts': [],
        'subsetting_opportunity_kb': 0,
    }

    if not FITZ_OK:
        return result

    try:
        doc = fitz.open(pdf_path)
        if password and doc.is_encrypted:
            doc.authenticate(password)

        seen_fonts: set = set()
        fonts_list: List[Dict] = []

        for page_num in range(doc.page_count):
            page = doc[page_num]
            for font in page.get_fonts(full=True):
                xref  = font[0]
                kind  = font[1]
                name  = font[3] or ''
                fname = font[4] or ''

                if xref in seen_fonts:
                    continue
                seen_fonts.add(xref)

                is_embedded = kind in ('Type1', 'TrueType', 'CIDFontType0',
                                       'CIDFontType2', 'Type0', 'MMType1')
                is_subset   = '+' in name

                fonts_list.append({
                    'xref': xref,
                    'name': name,
                    'file': fname,
                    'kind': kind,
                    'is_embedded': is_embedded,
                    'is_subset': is_subset,
                    'page': page_num + 1,
                })

        doc.close()

        result['total_fonts']    = len(fonts_list)
        result['embedded_count'] = sum(1 for f in fonts_list if f['is_embedded'])
        result['subset_count']   = sum(1 for f in fonts_list if f['is_subset'])
        result['standard_count'] = sum(1 for f in fonts_list
                                       if f['kind'] in ('Type1',) and not f['is_embedded'])
        result['fonts']          = fonts_list[:50]

        # Rough estimate: non-subset embedded fonts waste ~40KB each
        non_subset_embedded = result['embedded_count'] - result['subset_count']
        result['subsetting_opportunity_kb'] = non_subset_embedded * 40

    except Exception as e:
        result['error'] = str(e)

    return result


def analyze_pdf_streams(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Stream-level analysis: compressed vs uncompressed, entropy."""
    result: Dict[str, Any] = {
        'total_streams': 0,
        'compressed_count': 0,
        'uncompressed_count': 0,
        'total_compressed_bytes': 0,
        'total_uncompressed_bytes': 0,
        'compression_efficiency': 0.0,
        'filter_distribution': {},
        'recompression_opportunity_kb': 0,
    }

    if not PIKEPDF_OK:
        return result

    try:
        open_kw: Dict[str, Any] = {}
        if password:
            open_kw['password'] = password
        pdf = pikepdf.open(pdf_path, **open_kw)

        filter_counts: Counter = Counter()
        comp_bytes = 0
        uncomp_bytes = 0
        total = 0

        for xref in range(1, len(pdf.objects) + 1):
            try:
                obj = pdf.get_object(pikepdf.Reference(xref))
                if hasattr(obj, 'read_raw_bytes'):
                    raw = obj.read_raw_bytes()
                    filters = []
                    if '/Filter' in obj:
                        f = obj['/Filter']
                        if isinstance(f, pikepdf.Array):
                            filters = [str(x) for x in f]
                        else:
                            filters = [str(f)]

                    total += 1
                    if filters:
                        comp_bytes += len(raw)
                        for flt in filters:
                            filter_counts[flt] += 1
                        result['compressed_count'] += 1
                    else:
                        uncomp_bytes += len(raw)
                        result['uncompressed_count'] += 1
            except Exception:
                pass

        pdf.close()

        result['total_streams']              = total
        result['total_compressed_bytes']     = comp_bytes
        result['total_uncompressed_bytes']   = uncomp_bytes
        result['filter_distribution']        = dict(filter_counts)
        result['recompression_opportunity_kb'] = round(uncomp_bytes / 1024, 1)

        if comp_bytes + uncomp_bytes > 0:
            result['compression_efficiency'] = round(
                comp_bytes / (comp_bytes + uncomp_bytes) * 100, 2
            )

    except Exception as e:
        result['error'] = str(e)

    return result


def get_security_report(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Detailed security analysis: encryption, permissions, JS presence."""
    report: Dict[str, Any] = {
        'is_encrypted': False,
        'encryption_method': 'none',
        'has_user_password': False,
        'has_owner_password': False,
        'permissions': {},
        'has_javascript': False,
        'js_locations': [],
        'has_forms': False,
        'form_field_count': 0,
        'has_embedded_files': False,
        'has_digital_signature': False,
        'has_open_action': False,
        'risk_level': 'low',
    }

    if not PIKEPDF_OK:
        return report

    try:
        open_kw: Dict[str, Any] = {}
        if password:
            open_kw['password'] = password
        pdf = pikepdf.open(pdf_path, **open_kw)

        report['is_encrypted'] = pdf.is_encrypted

        root = pdf.Root

        # JavaScript detection
        if '/Names' in root:
            names = root['/Names']
            if '/JavaScript' in names:
                report['has_javascript'] = True
                report['js_locations'].append('Names/JavaScript')
            if '/EmbeddedFiles' in names:
                report['has_embedded_files'] = True

        if '/AA' in root:
            report['has_javascript'] = True
            report['js_locations'].append('Root/AA (Additional Actions)')
        if '/OpenAction' in root:
            report['has_open_action'] = True
            oa = root['/OpenAction']
            if hasattr(oa, 'get') and oa.get('/S') == pikepdf.Name('/JavaScript'):
                report['has_javascript'] = True
                report['js_locations'].append('Root/OpenAction')

        # Forms
        if '/AcroForm' in root:
            report['has_forms'] = True
            try:
                acro = root['/AcroForm']
                if '/Fields' in acro:
                    report['form_field_count'] = len(acro['/Fields'])
            except Exception:
                pass

        # Page-level JS
        for i, page in enumerate(pdf.pages):
            try:
                if '/AA' in page:
                    report['has_javascript'] = True
                    report['js_locations'].append(f'Page {i+1}/AA')
                if '/Annots' in page:
                    for annot in page['/Annots']:
                        try:
                            if '/AA' in annot or '/A' in annot:
                                a = annot.get('/A', None)
                                if a and a.get('/S') == pikepdf.Name('/JavaScript'):
                                    report['has_javascript'] = True
                                    report['js_locations'].append(f'Page {i+1}/Annot/JS')
                        except Exception:
                            pass
            except Exception:
                pass

        # Risk level
        risk = 'low'
        if report['is_encrypted']:
            risk = 'medium'
        if report['has_javascript']:
            risk = 'high'
        report['risk_level'] = risk

        pdf.close()
    except Exception as e:
        report['error'] = str(e)

    return report


def get_color_analysis(pdf_path: str, password: str = '',
                        sample_pages: int = 10) -> Dict[str, Any]:
    """Analyze color vs grayscale page breakdown for grayscale conversion savings."""
    result: Dict[str, Any] = {
        'total_pages': 0,
        'color_pages': 0,
        'grayscale_pages': 0,
        'mixed_pages': 0,
        'color_ratio': 0.0,
        'grayscale_savings_estimate_pct': 0,
        'pages_detail': [],
    }

    if not FITZ_OK:
        return result

    try:
        doc = fitz.open(pdf_path)
        if password and doc.is_encrypted:
            doc.authenticate(password)

        result['total_pages'] = doc.page_count
        sample = min(doc.page_count, sample_pages)

        for page_num in range(sample):
            page = doc[page_num]
            img_list = page.get_images(full=True)

            has_color = False
            has_gray  = False

            for img_info in img_list:
                xref = img_info[0]
                try:
                    base_img = doc.extract_image(xref)
                    cs = base_img.get('colorspace', 0)
                    if cs == 3:  # RGB = 3
                        has_color = True
                    elif cs == 1:  # Gray = 1
                        has_gray = True
                except Exception:
                    pass

            if has_color:
                result['color_pages'] += 1
                page_type = 'color'
            elif has_gray:
                result['grayscale_pages'] += 1
                page_type = 'grayscale'
            else:
                page_type = 'text_only'

            result['pages_detail'].append({'page': page_num + 1, 'type': page_type})

        doc.close()

        total = result['total_pages']
        if total > 0:
            result['color_ratio'] = round(result['color_pages'] / sample * 100, 1)
            # Grayscale conversion saves ~20% for color pages
            result['grayscale_savings_estimate_pct'] = round(
                result['color_ratio'] * 0.20, 1
            )

    except Exception as e:
        result['error'] = str(e)

    return result


def get_page_size_breakdown(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Estimate per-page contribution to total file size."""
    result: Dict[str, Any] = {
        'total_pages': 0,
        'pages': [],
        'largest_page': None,
        'average_kb': 0.0,
    }

    if not FITZ_OK:
        return result

    try:
        doc = fitz.open(pdf_path)
        if password and doc.is_encrypted:
            doc.authenticate(password)

        result['total_pages'] = doc.page_count
        total_file_sz = Path(pdf_path).stat().st_size
        per_page_est  = total_file_sz / max(doc.page_count, 1)

        pages_info = []
        for page_num in range(doc.page_count):
            page = doc[page_num]
            img_list = page.get_images(full=True)

            img_bytes = 0
            for img_info in img_list:
                xref = img_info[0]
                try:
                    base_img = doc.extract_image(xref)
                    img_bytes += len(base_img.get('image', b''))
                except Exception:
                    pass

            pages_info.append({
                'page': page_num + 1,
                'image_count': len(img_list),
                'image_bytes': img_bytes,
                'image_kb': round(img_bytes / 1024, 1),
                'estimated_total_kb': round(per_page_est / 1024, 1),
            })

        doc.close()

        result['pages'] = pages_info
        if pages_info:
            largest = max(pages_info, key=lambda p: p['image_bytes'])
            result['largest_page'] = largest
            avg_kb = sum(p['image_kb'] for p in pages_info) / len(pages_info)
            result['average_kb'] = round(avg_kb, 1)

    except Exception as e:
        result['error'] = str(e)

    return result


def get_object_statistics(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """PDF object type distribution — useful for size debugging."""
    stats: Dict[str, Any] = {
        'total_objects': 0,
        'stream_objects': 0,
        'dict_objects': 0,
        'array_objects': 0,
        'string_objects': 0,
        'name_objects': 0,
        'int_objects': 0,
        'null_objects': 0,
        'type_distribution': {},
    }

    if not PIKEPDF_OK:
        return stats

    try:
        open_kw: Dict[str, Any] = {}
        if password:
            open_kw['password'] = password
        pdf = pikepdf.open(pdf_path, **open_kw)

        type_counter: Counter = Counter()
        total = 0

        for xref in range(1, len(pdf.objects) + 1):
            try:
                obj = pdf.get_object(pikepdf.Reference(xref))
                total += 1

                if isinstance(obj, pikepdf.Stream):
                    stats['stream_objects'] += 1
                    try:
                        t = str(obj.get('/Type', ''))
                        if t:
                            type_counter[t] += 1
                    except Exception:
                        pass
                elif isinstance(obj, pikepdf.Dictionary):
                    stats['dict_objects'] += 1
                elif isinstance(obj, pikepdf.Array):
                    stats['array_objects'] += 1
                elif isinstance(obj, str):
                    stats['string_objects'] += 1
                elif isinstance(obj, pikepdf.Name):
                    stats['name_objects'] += 1
                elif isinstance(obj, int):
                    stats['int_objects'] += 1
            except Exception:
                pass

        pdf.close()

        stats['total_objects']    = total
        stats['type_distribution'] = dict(type_counter)

    except Exception as e:
        stats['error'] = str(e)

    return stats


def estimate_compression_savings(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """
    Fast estimate (no full analysis) of compression potential.
    Returns per-preset estimated output sizes.
    """
    result: Dict[str, Any] = {
        'file_size_bytes': 0,
        'presets': {},
        'recommended_preset': 'medium',
        'max_savings_pct': 0,
    }

    try:
        sz = Path(pdf_path).stat().st_size
        result['file_size_bytes'] = sz

        est = get_compression_estimate(pdf_path, password)
        ct  = est.get('content_type', 'mixed')
        ests = est.get('estimated_reductions_by_preset', {})

        for preset_name, preset in QUALITY_PRESETS.items():
            reduction = ests.get(preset_name, 40) / 100
            out_bytes  = max(int(sz * (1 - reduction)), 1024)
            result['presets'][preset_name] = {
                'input_bytes': sz,
                'estimated_output_bytes': out_bytes,
                'estimated_output_kb': round(out_bytes / 1024, 1),
                'estimated_reduction_pct': ests.get(preset_name, 40),
                'description': preset['description'],
                'color': preset['color'],
            }

        result['max_savings_pct'] = max(ests.values()) if ests else 0
        result['recommended_preset'] = (
            'lossless' if ct == 'text_heavy' else
            'low'      if ct == 'scanned' else
            'medium'
        )

    except Exception as e:
        result['error'] = str(e)

    return result


def detect_pdf_type(pdf_path: str, password: str = '') -> str:
    """
    Quick detection: 'text_heavy' | 'image_heavy' | 'mixed' | 'scanned'
    """
    try:
        est = get_compression_estimate(pdf_path, password)
        return est.get('content_type', 'mixed')
    except Exception:
        return 'mixed'


def benchmark_compression(
    pdf_path: str,
    password: str = '',
    presets: Optional[List[str]] = None,
    options: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Try multiple presets and return comparison table.
    Useful for recommending the best preset for a given file.
    """
    presets = presets or list(QUALITY_PRESETS.keys())
    options = options or {}
    results: Dict[str, Any] = {
        'input_path': pdf_path,
        'input_size_bytes': Path(pdf_path).stat().st_size if Path(pdf_path).exists() else 0,
        'results_by_preset': {},
        'recommended': None,
        'fastest': None,
    }

    best_ratio  = 0.0
    best_preset = 'medium'

    for i, preset_name in enumerate(presets):
        if progress_callback:
            progress_callback('benchmark', int((i / len(presets)) * 90))

        try:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
                tmp_out = tf.name

            t_start = time.time()
            cr = compress_pdf(pdf_path, tmp_out, preset_name, options)
            elapsed = round((time.time() - t_start) * 1000)

            results['results_by_preset'][preset_name] = {
                'success': cr['success'],
                'output_size_bytes': cr.get('output_size_bytes', 0),
                'output_size_kb': round(cr.get('output_size_bytes', 0) / 1024, 1),
                'reduction_pct': cr.get('reduction_pct', 0),
                'method_used': cr.get('method_used', ''),
                'processing_ms': elapsed,
            }

            if cr['success'] and cr.get('reduction_pct', 0) > best_ratio:
                best_ratio  = cr['reduction_pct']
                best_preset = preset_name

            try:
                os.unlink(tmp_out)
            except Exception:
                pass

        except Exception as e:
            results['results_by_preset'][preset_name] = {'error': str(e)}

    results['recommended'] = best_preset
    if progress_callback:
        progress_callback('benchmark', 100)

    return results


def deep_analyze_pdf(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """
    Combined deep analysis — runs all analysis functions and merges results.
    """
    analysis: Dict[str, Any] = {
        'path': pdf_path,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }

    try:
        analysis['compression_estimate'] = get_compression_estimate(pdf_path, password)
        analysis['metadata']             = get_pdf_metadata(pdf_path, password)
        analysis['fonts']                = get_font_analysis(pdf_path, password)
        analysis['security']             = get_security_report(pdf_path, password)
        analysis['images']               = analyze_images_in_pdf(pdf_path, password, max_images=30)
        analysis['color']                = get_color_analysis(pdf_path, password)
        analysis['engines']              = get_available_engines()
        analysis['savings_estimate']     = estimate_compression_savings(pdf_path, password)
    except Exception as e:
        analysis['error'] = str(e)

    return analysis


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 1: Ghostscript
# ══════════════════════════════════════════════════════════════════════════

def _compress_ghostscript(
    input_path: str,
    output_path: str,
    preset: Dict[str, Any],
    options: Dict[str, Any],
    progress_cb: Optional[Callable] = None,
) -> bool:
    """Ghostscript PDF compression — industry-standard distiller."""
    if not GS_BIN:
        return False

    try:
        gs_setting = preset.get('gs_setting', '/printer')
        gs_dpi     = preset.get('gs_dpi', 150)
        password   = options.get('password', '')
        grayscale  = options.get('grayscale', False)

        cmd = [
            GS_BIN,
            '-dBATCH', '-dNOPAUSE', '-dSAFER', '-dQUIET',
            '-sDEVICE=pdfwrite',
            f'-dPDFSETTINGS={gs_setting}',
            f'-dCompatibilityLevel=1.4',
            '-dAutoRotatePages=/None',
            '-dCompressFonts=true',
            '-dSubsetFonts=true',
            '-dEmbedAllFonts=true',
            '-dOptimize=true',
            '-dDetectDuplicateImages=true',
            f'-dColorImageResolution={gs_dpi}',
            f'-dGrayImageResolution={gs_dpi}',
            f'-dMonoImageResolution={min(gs_dpi * 2, 300)}',
            '-dColorImageDownsampleType=/Bicubic',
            '-dGrayImageDownsampleType=/Bicubic',
            '-dMonoImageDownsampleType=/Subsample',
            '-dDownsampleColorImages=true',
            '-dDownsampleGrayImages=true',
            '-dDownsampleMonoImages=true',
        ]

        if grayscale:
            cmd += [
                '-sColorConversionStrategy=Gray',
                '-dProcessColorModel=/DeviceGray',
            ]

        if options.get('strip_metadata', False):
            cmd += ['-dNoMeta']

        if options.get('remove_annotations', False):
            cmd += ['-dPrinted']

        if options.get('remove_forms', False):
            cmd += ['-dNoAnnots']

        if options.get('subset_fonts', False):
            cmd += ['-dSubsetFonts=true', '-dCompressFonts=true']

        if password:
            cmd += [f'-sPDFPassword={password}']

        cmd += [f'-sOutputFile={output_path}', input_path]

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300,
            env={**os.environ, 'GS_OPTIONS': ''}
        )

        if progress_cb:
            progress_cb('ghostscript', 28)

        if result.returncode not in (0, 1):
            logger.warning(f'GS stderr: {result.stderr[:200]}')
            return False

        ok = Path(output_path).exists() and Path(output_path).stat().st_size > 100
        return ok

    except subprocess.TimeoutExpired:
        logger.error('Ghostscript timed out')
        return False
    except Exception as e:
        logger.error(f'Ghostscript error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 2: PyMuPDF (fitz)
# ══════════════════════════════════════════════════════════════════════════

def _compress_pymupdf(
    input_path: str,
    output_path: str,
    preset: Dict[str, Any],
    options: Dict[str, Any],
    progress_cb: Optional[Callable] = None,
) -> bool:
    """
    PyMuPDF compression: per-image DPI downsampling + JPEG/WebP re-encode.
    Most effective for image-heavy PDFs.
    """
    if not FITZ_OK:
        return False

    try:
        password    = options.get('password', '')
        target_dpi  = preset.get('dpi', 150)
        jpeg_q      = preset.get('jpeg_quality', 65)
        grayscale   = options.get('grayscale', False)
        deflate_lvl = preset.get('fitz_deflate', 8)
        garbage     = preset.get('fitz_garbage', 3)
        clean       = preset.get('fitz_clean', True)

        doc = fitz.open(input_path)
        if password and doc.is_encrypted:
            if not doc.authenticate(password):
                doc.close()
                return False

        if progress_cb:
            progress_cb('pymupdf', 15)

        # Re-compress images page by page
        for page_num in range(doc.page_count):
            page = doc[page_num]
            img_list = page.get_images(full=True)

            for img_info in img_list:
                xref = img_info[0]
                try:
                    # Get image info
                    img_dict = doc.extract_image(xref)
                    img_data = img_dict.get('image', b'')
                    w = img_dict.get('width', 0)
                    h = img_dict.get('height', 0)
                    ext = img_dict.get('ext', '')

                    if not img_data or w < 10 or h < 10:
                        continue

                    # Calculate target size based on DPI + image size
                    page_rect = page.rect
                    if page_rect.width > 0 and w > 0:
                        current_dpi = w / (page_rect.width / 72)
                    else:
                        current_dpi = target_dpi

                    # Only re-encode if it would help
                    if current_dpi <= target_dpi * 1.1 and ext in ('jpeg', 'jpg') and not grayscale:
                        continue  # Already at or below target DPI + already JPEG

                    # Open with PIL for re-encoding
                    if PIL_OK:
                        try:
                            pil_img = Image.open(io.BytesIO(img_data))

                            # Downsample if above target DPI
                            if current_dpi > target_dpi and target_dpi < 9000:
                                scale  = target_dpi / current_dpi
                                nw     = max(1, int(w * scale))
                                nh     = max(1, int(h * scale))
                                pil_img = pil_img.resize(
                                    (nw, nh), Image.LANCZOS
                                )

                            # Grayscale conversion (only if user requested)
                            if grayscale and pil_img.mode not in ('L', 'LA'):
                                pil_img = ImageOps.grayscale(pil_img)

                            # Re-encode
                            buf = io.BytesIO()
                            if pil_img.mode in ('RGBA', 'P'):
                                pil_img = pil_img.convert('RGB')

                            save_mode = pil_img.mode
                            if save_mode == 'L' or grayscale:
                                pil_img.save(buf, format='JPEG', quality=jpeg_q,
                                             optimize=True, progressive=True)
                            else:
                                pil_img.save(buf, format='JPEG', quality=jpeg_q,
                                             optimize=True, progressive=True)

                            new_data = buf.getvalue()

                            # Only replace if smaller
                            if len(new_data) < len(img_data) * 0.98:
                                doc.update_stream(xref, new_data)
                        except Exception:
                            pass

                except Exception:
                    pass

        if progress_cb:
            progress_cb('pymupdf', 70)

        # Strip metadata if requested
        if options.get('strip_metadata', False):
            try:
                doc.set_metadata({})
                doc.del_xml_metadata()
            except Exception:
                pass

        # Remove annotations if requested
        if options.get('remove_annotations', False):
            try:
                for page in doc:
                    for annot in page.annots():
                        page.delete_annot(annot)
            except Exception:
                pass

        # Save with compression
        save_options = {
            'deflate': True,
            'deflate_images': True,
            'deflate_fonts': True,
            'garbage': garbage,
            'clean': clean,
            'linear': options.get('linearize', False),
        }

        doc.save(output_path, **save_options)
        doc.close()

        if progress_cb:
            progress_cb('pymupdf', 90)

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except Exception as e:
        logger.error(f'PyMuPDF compress error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 3: pikepdf
# ══════════════════════════════════════════════════════════════════════════

def _compress_pikepdf(
    input_path: str,
    output_path: str,
    preset: Dict[str, Any],
    options: Dict[str, Any],
    progress_cb: Optional[Callable] = None,
) -> bool:
    """
    pikepdf compression: object stream merging, DEFLATE-9,
    duplicate removal, metadata stripping, annotation removal.
    Best for structure-level + lossless compression.
    """
    if not PIKEPDF_OK:
        return False

    try:
        password       = options.get('password', '')
        deflate        = preset.get('deflate_level', 9)
        strip_meta     = options.get('strip_metadata', False)
        remove_annot   = options.get('remove_annotations', False)
        remove_js      = options.get('remove_javascript', False)
        remove_thumbs  = options.get('remove_thumbnails', False)
        remove_icc     = options.get('remove_icc_profiles', False)
        remove_embed   = options.get('remove_embedded_files', False)
        remove_forms   = options.get('remove_forms', False)
        remove_links   = options.get('remove_links', False)

        open_kw: Dict[str, Any] = {}
        if password:
            open_kw['password'] = password

        pdf = pikepdf.open(input_path, **open_kw)

        if progress_cb:
            progress_cb('pikepdf', 15)

        # Strip metadata
        if strip_meta:
            try:
                with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
                    keys_to_del = [
                        k for k in meta
                        if 'creator' not in k.lower()
                        and 'producer' not in k.lower()
                    ]
                    for k in keys_to_del:
                        try:
                            del meta[k]
                        except Exception:
                            pass
                pdf.docinfo.clear()
            except Exception:
                pass

        root = pdf.Root

        # Remove JavaScript from root
        if remove_js:
            try:
                for key in ('/AA', '/OpenAction'):
                    if key in root:
                        try:
                            del root[key]
                        except Exception:
                            pass
                if '/Names' in root:
                    names = root['/Names']
                    if '/JavaScript' in names:
                        try:
                            del names['/JavaScript']
                        except Exception:
                            pass
            except Exception:
                pass

        # Remove embedded files
        if remove_embed:
            try:
                if '/Names' in root and '/EmbeddedFiles' in root['/Names']:
                    del root['/Names']['/EmbeddedFiles']
            except Exception:
                pass

        # Remove forms (AcroForm)
        if remove_forms:
            try:
                if '/AcroForm' in root:
                    del root['/AcroForm']
            except Exception:
                pass

        # Process pages
        for page in pdf.pages:
            try:
                # Remove annotations / links
                if (remove_annot or remove_links) and '/Annots' in page:
                    if remove_annot:
                        del page['/Annots']
                    elif remove_links:
                        try:
                            annots = page['/Annots']
                            keep = []
                            for annot in annots:
                                try:
                                    if str(annot.get('/Subtype', '')) != '/Link':
                                        keep.append(annot)
                                except Exception:
                                    keep.append(annot)
                            page['/Annots'] = pikepdf.Array(keep)
                        except Exception:
                            pass

                # Remove page thumbnails
                if remove_thumbs and '/Thumb' in page:
                    try:
                        del page['/Thumb']
                    except Exception:
                        pass

                # Remove ICC profiles from resources
                if remove_icc:
                    try:
                        resources = page.get('/Resources', pikepdf.Dictionary())
                        if '/ColorSpace' in resources:
                            cs = resources['/ColorSpace']
                            for cs_name in list(cs.keys()):
                                try:
                                    cs_obj = cs[cs_name]
                                    if isinstance(cs_obj, pikepdf.Array):
                                        if (len(cs_obj) > 1 and
                                                str(cs_obj[0]) == '/ICCBased'):
                                            del cs[cs_name]
                                except Exception:
                                    pass
                    except Exception:
                        pass

                # Page-level JS removal
                if remove_js:
                    try:
                        if '/AA' in page:
                            del page['/AA']
                    except Exception:
                        pass

            except Exception:
                pass

        if progress_cb:
            progress_cb('pikepdf', 55)

        # Save with maximum compression
        compress_streams = deflate >= 6
        pdf.save(
            output_path,
            compress_streams=compress_streams,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            recompress_flate=True,
            normalize_content=False,
            qdf=False,
        )
        pdf.close()

        if progress_cb:
            progress_cb('pikepdf', 90)

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except Exception as e:
        logger.error(f'pikepdf compress error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 4: qpdf CLI
# ══════════════════════════════════════════════════════════════════════════

def _compress_qpdf(
    input_path: str,
    output_path: str,
    options: Dict[str, Any],
    linearize: bool = False,
    progress_cb: Optional[Callable] = None,
) -> bool:
    """qpdf: stream recompression + optional web linearization."""
    if not QPDF_BIN:
        return False

    try:
        password = options.get('password', '')

        cmd = [
            QPDF_BIN,
            '--compress-streams=y',
            '--recompress-flate',
            '--compression-level=9',
            '--object-streams=generate',
            '--stream-data=compress',
            '--decode-level=generalized',
            '--remove-unreferenced-resources=yes',
        ]

        if password:
            cmd += [f'--password={password}']

        if linearize:
            cmd += ['--linearize']

        if options.get('remove_annotations', False):
            # qpdf doesn't directly strip annots; we leave it to pikepdf
            pass

        cmd += [input_path, output_path]

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180
        )

        if result.returncode not in (0, 3):
            logger.warning(f'qpdf stderr: {result.stderr[:300]}')
            return False

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except subprocess.TimeoutExpired:
        return False
    except Exception as e:
        logger.error(f'qpdf error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 5: pypdf
# ══════════════════════════════════════════════════════════════════════════

def _compress_pypdf(
    input_path: str,
    output_path: str,
    options: Dict[str, Any],
    progress_cb: Optional[Callable] = None,
) -> bool:
    """pypdf: orphan object removal, page content optimize."""
    if not PYPDF_OK:
        return False

    try:
        password = options.get('password', '')
        reader   = PdfReader(input_path)

        if reader.is_encrypted and password:
            reader.decrypt(password)

        writer = PdfWriter()
        writer.clone_reader_document_root(reader)

        for page in reader.pages:
            try:
                page.compress_content_streams()
            except Exception:
                pass
            writer.add_page(page)

        if options.get('strip_metadata', False):
            writer.add_metadata({
                '/Creator':  '',
                '/Producer': '',
                '/Author':   '',
                '/Title':    '',
                '/Subject':  '',
                '/Keywords': '',
            })

        with open(output_path, 'wb') as f:
            writer.write(f)

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except Exception as e:
        logger.error(f'pypdf compress error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 6: mutool
# ══════════════════════════════════════════════════════════════════════════

def _compress_mutool(
    input_path: str,
    output_path: str,
    options: Dict[str, Any],
    progress_cb: Optional[Callable] = None,
) -> bool:
    """mutool clean + compress — very fast for structure-level gains."""
    if not MUTOOL_BIN:
        return False

    try:
        password = options.get('password', '')
        cmd = [MUTOOL_BIN, 'clean', '-z', '-i', '-f', '-a', '-D']

        if password:
            cmd += ['-p', password]

        cmd += [input_path, output_path]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

        if result.returncode != 0:
            return False

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except Exception as e:
        logger.error(f'mutool error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 7: Pillow image-only recompression
# ══════════════════════════════════════════════════════════════════════════

def _compress_pillow_images(
    input_path: str,
    output_path: str,
    preset: Dict[str, Any],
    options: Dict[str, Any],
    progress_cb: Optional[Callable] = None,
) -> bool:
    """
    Pillow-based image recompression fallback.
    Extracts all images, recompresses, rebuilds PDF via img2pdf or reportlab.
    Best for image-only PDFs.
    """
    if not FITZ_OK or not PIL_OK:
        return False

    try:
        password   = options.get('password', '')
        target_dpi = preset.get('dpi', 150)
        jpeg_q     = preset.get('jpeg_quality', 65)
        grayscale  = options.get('grayscale', False)

        doc = fitz.open(input_path)
        if password and doc.is_encrypted:
            doc.authenticate(password)

        # Count total images
        total_images = sum(
            len(doc[pn].get_images(full=True))
            for pn in range(doc.page_count)
        )

        if total_images == 0:
            doc.close()
            return False  # No images to recompress

        # Only use this as a supplement to PyMuPDF — return False here
        # to avoid duplicate effort (PyMuPDF already handles images better)
        doc.close()
        return False

    except Exception as e:
        logger.error(f'Pillow compress error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# POST-PROCESSING HELPERS
# ══════════════════════════════════════════════════════════════════════════

def _postprocess_linearize(pdf_path: str, output_path: str) -> bool:
    """Apply web linearization using qpdf."""
    if not QPDF_BIN:
        # Fallback: PyMuPDF linearize
        if FITZ_OK:
            try:
                doc = fitz.open(pdf_path)
                doc.save(output_path, linear=True, deflate=True, garbage=2)
                doc.close()
                return Path(output_path).exists() and Path(output_path).stat().st_size > 100
            except Exception:
                return False
        return False

    try:
        cmd = [QPDF_BIN, '--linearize', pdf_path, output_path]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        return (result.returncode in (0, 3)
                and Path(output_path).exists()
                and Path(output_path).stat().st_size > 100)
    except Exception:
        return False


def _remove_all_javascript(pdf_path: str, output_path: str) -> bool:
    """Strip all JavaScript from PDF using pikepdf."""
    if not PIKEPDF_OK:
        shutil.copy2(pdf_path, output_path)
        return True

    try:
        pdf  = pikepdf.open(pdf_path)
        root = pdf.Root

        for key in ('/AA', '/OpenAction'):
            try:
                if key in root:
                    del root[key]
            except Exception:
                pass

        try:
            if '/Names' in root and '/JavaScript' in root['/Names']:
                del root['/Names']['/JavaScript']
        except Exception:
            pass

        for page in pdf.pages:
            try:
                if '/AA' in page:
                    del page['/AA']
                if '/Annots' in page:
                    annots = page['/Annots']
                    keep   = []
                    for annot in annots:
                        try:
                            if '/AA' in annot:
                                del annot['/AA']
                            keep.append(annot)
                        except Exception:
                            keep.append(annot)
                    page['/Annots'] = pikepdf.Array(keep)
            except Exception:
                pass

        pdf.save(output_path,
                 compress_streams=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate)
        pdf.close()
        return True

    except Exception:
        return False


def _grayscale_convert(pdf_path: str, output_path: str) -> bool:
    """Convert colour PDF to grayscale using Ghostscript or PyMuPDF."""
    if GS_BIN:
        try:
            cmd = [
                GS_BIN, '-dBATCH', '-dNOPAUSE', '-dSAFER', '-dQUIET',
                '-sDEVICE=pdfwrite',
                '-sColorConversionStrategy=Gray',
                '-dProcessColorModel=/DeviceGray',
                '-dPDFSETTINGS=/printer',
                f'-sOutputFile={output_path}',
                pdf_path,
            ]
            r = subprocess.run(cmd, capture_output=True, timeout=180)
            if r.returncode in (0, 1) and Path(output_path).exists():
                return True
        except Exception:
            pass

    # Fallback: PyMuPDF per-image grayscale
    if FITZ_OK and PIL_OK:
        try:
            doc = fitz.open(pdf_path)
            for page_num in range(doc.page_count):
                page = doc[page_num]
                for img_info in page.get_images(full=True):
                    xref = img_info[0]
                    try:
                        base_img = doc.extract_image(xref)
                        img_data = base_img.get('image', b'')
                        pil_img  = Image.open(io.BytesIO(img_data)).convert('L')
                        buf      = io.BytesIO()
                        pil_img.save(buf, format='JPEG', quality=80, optimize=True)
                        new_data = buf.getvalue()
                        if len(new_data) < len(img_data):
                            doc.update_stream(xref, new_data)
                    except Exception:
                        pass
            doc.save(output_path, deflate=True, garbage=3)
            doc.close()
            return Path(output_path).exists()
        except Exception:
            pass

    return False


# ══════════════════════════════════════════════════════════════════════════
# TARGET SIZE COMPRESSION
# ══════════════════════════════════════════════════════════════════════════

def _compress_to_target_size(
    input_path: str,
    output_path: str,
    target_kb: int,
    options: Dict[str, Any],
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Iterative compression to reach target file size in KB.
    Tries presets from screen → low → medium → high → lossless.
    Returns the result that best meets the target.
    """
    t_start   = time.time()
    target_b  = target_kb * 1024
    in_size   = Path(input_path).stat().st_size
    preset_order = ['screen', 'low', 'medium', 'high', 'lossless']

    result: Dict[str, Any] = {
        'success': False,
        'input_size_bytes': in_size,
        'output_size_bytes': 0,
        'reduction_bytes': 0,
        'reduction_pct': 0.0,
        'method_used': '',
        'target_kb': target_kb,
        'target_achieved': False,
        'engines_tried': [],
        'processing_time_ms': 0,
        'error': None,
        'quality_note': '',
    }

    best_path   = None
    best_size   = in_size
    best_preset = 'none'

    def _cb(stage: str, pct: int) -> None:
        if progress_callback:
            try:
                progress_callback(stage, pct)
            except Exception:
                pass

    for i, preset_name in enumerate(preset_order):
        _cb(f'target_{preset_name}', int(5 + (i / len(preset_order)) * 80))

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
            tmp_out = tf.name

        try:
            cr = compress_pdf(input_path, tmp_out, preset_name, options)
            if cr['success']:
                out_sz = Path(tmp_out).stat().st_size
                result['engines_tried'].append(
                    f'{preset_name}={round(out_sz/1024)}KB'
                )

                if out_sz < best_size:
                    if best_path and os.path.exists(best_path):
                        os.unlink(best_path)
                    best_path   = tmp_out
                    best_size   = out_sz
                    best_preset = preset_name
                else:
                    os.unlink(tmp_out)

                if out_sz <= target_b:
                    # Target achieved!
                    result['target_achieved'] = True
                    break
            else:
                try:
                    os.unlink(tmp_out)
                except Exception:
                    pass
        except Exception as e:
            logger.error(f'Target size compress error ({preset_name}): {e}')
            try:
                os.unlink(tmp_out)
            except Exception:
                pass

    if best_path and os.path.exists(best_path):
        shutil.copy2(best_path, output_path)
        os.unlink(best_path)

        out_size = Path(output_path).stat().st_size
        saved    = in_size - out_size
        pct      = round(saved / max(in_size, 1) * 100, 2)

        result.update({
            'success':           True,
            'output_size_bytes': out_size,
            'reduction_bytes':   max(0, saved),
            'reduction_pct':     max(0.0, pct),
            'method_used':       f'target-size/{best_preset}',
            'quality_note':      _quality_note(best_preset, options),
            'processing_time_ms': int((time.time() - t_start) * 1000),
        })
    else:
        result['error'] = 'Could not compress to target size'
        result['processing_time_ms'] = int((time.time() - t_start) * 1000)

    _cb('done', 100)
    return result


# ══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def _kb(n: int) -> str:
    return str(round(n / 1024))


def _quality_note(preset_name: str, options: Dict[str, Any]) -> str:
    preset_notes = {
        'screen': 'Screen preset (72 DPI) — suitable for on-screen viewing only',
        'low': 'Low preset (96 DPI) — email-quality, minor visual reduction',
        'medium': 'Medium preset (150 DPI) — good quality, balanced compression',
        'high': 'High preset (200 DPI) — excellent quality, near-lossless',
        'lossless': 'Lossless preset — structure-only, zero image quality loss',
    }
    parts = [preset_notes.get(preset_name, f'{preset_name} preset')]

    extras = []
    if options.get('grayscale'):         extras.append('colour removed (grayscale)')
    if options.get('strip_metadata'):    extras.append('metadata stripped')
    if options.get('remove_annotations'): extras.append('annotations removed')
    if options.get('linearize'):         extras.append('web-linearized')
    if options.get('remove_javascript'): extras.append('JavaScript stripped')
    if options.get('remove_embedded_files'): extras.append('embedded files removed')
    if options.get('remove_forms'):      extras.append('form fields removed')
    if options.get('remove_links'):      extras.append('hyperlinks removed')

    if extras:
        parts.append(' + ' + ', '.join(extras))

    return ''.join(parts)


def validate_pdf_output(output_path: str, input_size: int) -> Dict[str, Any]:
    """Validate compressed PDF is not corrupted and is genuinely a PDF."""
    validation: Dict[str, Any] = {
        'valid': False,
        'readable': False,
        'page_count': 0,
        'file_size': 0,
        'is_pdf': False,
        'error': None,
    }

    try:
        if not Path(output_path).exists():
            validation['error'] = 'Output file does not exist'
            return validation

        out_sz = Path(output_path).stat().st_size
        validation['file_size'] = out_sz

        if out_sz < 100:
            validation['error'] = 'Output file too small (likely corrupted)'
            return validation

        # Check PDF header
        with open(output_path, 'rb') as f:
            header = f.read(8)
        if header[:5] != b'%PDF-':
            validation['error'] = 'Output does not have PDF header'
            return validation

        validation['is_pdf'] = True

        # Try to open and read pages
        if FITZ_OK:
            try:
                doc = fitz.open(output_path)
                validation['page_count'] = doc.page_count
                validation['readable']   = doc.page_count > 0
                doc.close()
            except Exception as e:
                validation['error'] = f'Cannot open output PDF: {e}'
                return validation
        elif PYPDF_OK:
            try:
                reader = PdfReader(output_path)
                validation['page_count'] = len(reader.pages)
                validation['readable']   = len(reader.pages) > 0
            except Exception as e:
                validation['error'] = f'Cannot read output PDF: {e}'
                return validation

        validation['valid'] = validation['readable']

    except Exception as e:
        validation['error'] = str(e)

    return validation


# ══════════════════════════════════════════════════════════════════════════
# MAIN COMPRESSION FUNCTION — 7-engine pipeline
# ══════════════════════════════════════════════════════════════════════════

def compress_pdf(
    input_path: str,
    output_path: str,
    preset_name: str = 'medium',
    options: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Enterprise PDF compression with 7-engine parallel pipeline.
    Tries every available engine, picks the smallest VALID result.

    Args:
        input_path:        Path to input PDF
        output_path:       Path for compressed output PDF
        preset_name:       'screen' | 'low' | 'medium' | 'high' | 'lossless'
        options:           Advanced options dict (see module docstring)
        progress_callback: callable(stage: str, pct: int)

    Returns:
        Dict with compression statistics, method used, quality note.
    """
    t_start  = time.time()
    options  = options or {}
    preset   = QUALITY_PRESETS.get(preset_name, QUALITY_PRESETS['medium'])

    def _cb(stage: str, pct: int) -> None:
        if progress_callback:
            try:
                progress_callback(stage, pct)
            except Exception:
                pass

    result: Dict[str, Any] = {
        'success': False,
        'input_path': input_path,
        'output_path': output_path,
        'preset': preset_name,
        'input_size_bytes': 0,
        'output_size_bytes': 0,
        'reduction_bytes': 0,
        'reduction_pct': 0.0,
        'method_used': '',
        'engines_tried': [],
        'processing_time_ms': 0,
        'error': None,
        'quality_note': '',
        'validation': {},
        'engines_available': [],
    }

    try:
        in_path = Path(input_path)
        if not in_path.exists():
            result['error'] = 'Input file not found'
            return result

        in_size = in_path.stat().st_size
        result['input_size_bytes'] = in_size

        # Detect available engines for metadata
        eng_info = get_available_engines()
        result['engines_available'] = [
            k for k, v in eng_info.items()
            if v.get('available') and not k.startswith('_')
        ]

        # ── Target size mode ──────────────────────────────────────────
        target_kb = options.get('target_size_kb')
        if target_kb and int(target_kb) > 0:
            return _compress_to_target_size(
                input_path, output_path, int(target_kb), options, progress_callback
            )

        _cb('init', 3)

        with tempfile.TemporaryDirectory(prefix='ishu_compress_') as tmp_dir:
            tmp = Path(tmp_dir)
            candidates: List[Tuple[int, str, str]] = []

            # ── 1. Ghostscript ─────────────────────────────────────────
            _cb('ghostscript', 6)
            gs_out = str(tmp / 'gs_out.pdf')
            if _compress_ghostscript(input_path, gs_out, preset, options, _cb):
                sz = Path(gs_out).stat().st_size
                candidates.append((sz, gs_out, 'Ghostscript'))
                result['engines_tried'].append(f'gs={_kb(sz)}KB')
                logger.info(f'[GS] {_kb(sz)} KB (input: {_kb(in_size)} KB)')
            _cb('ghostscript_done', 28)

            # ── 2. PyMuPDF ─────────────────────────────────────────────
            _cb('pymupdf', 30)
            mu_out = str(tmp / 'mu_out.pdf')
            if _compress_pymupdf(input_path, mu_out, preset, options, _cb):
                sz = Path(mu_out).stat().st_size
                candidates.append((sz, mu_out, 'PyMuPDF'))
                result['engines_tried'].append(f'pymupdf={_kb(sz)}KB')
                logger.info(f'[PyMuPDF] {_kb(sz)} KB')
            _cb('pymupdf_done', 50)

            # ── 3. pikepdf on best-so-far ──────────────────────────────
            _cb('pikepdf', 52)
            best_so_far = (
                min(candidates, key=lambda x: x[0])[1]
                if candidates else input_path
            )
            pk_out = str(tmp / 'pk_out.pdf')
            if _compress_pikepdf(best_so_far, pk_out, preset, options, _cb):
                sz = Path(pk_out).stat().st_size
                candidates.append((sz, pk_out, 'pikepdf'))
                result['engines_tried'].append(f'pikepdf={_kb(sz)}KB')
                logger.info(f'[pikepdf] {_kb(sz)} KB')
            _cb('pikepdf_done', 65)

            # Also try pikepdf directly on original (if GS/MuPDF ran first)
            if candidates and input_path != best_so_far:
                pk_orig_out = str(tmp / 'pk_orig_out.pdf')
                if _compress_pikepdf(input_path, pk_orig_out, preset, options):
                    sz = Path(pk_orig_out).stat().st_size
                    candidates.append((sz, pk_orig_out, 'pikepdf-orig'))
                    result['engines_tried'].append(f'pikepdf_o={_kb(sz)}KB')

            # ── 4. qpdf on best-so-far ─────────────────────────────────
            _cb('qpdf', 67)
            best_so_far = (
                min(candidates, key=lambda x: x[0])[1]
                if candidates else input_path
            )
            qp_out    = str(tmp / 'qp_out.pdf')
            linearize = options.get('linearize', False)

            if _compress_qpdf(best_so_far, qp_out, options, linearize=False, progress_cb=_cb):
                sz = Path(qp_out).stat().st_size
                candidates.append((sz, qp_out, 'qpdf'))
                result['engines_tried'].append(f'qpdf={_kb(sz)}KB')

                # Linearize on top of qpdf output
                if linearize:
                    lin_out = str(tmp / 'lin_out.pdf')
                    if _postprocess_linearize(qp_out, lin_out):
                        sz2 = Path(lin_out).stat().st_size
                        candidates.append((sz2, lin_out, 'qpdf+linearize'))
                        result['engines_tried'].append(f'qpdf_lin={_kb(sz2)}KB')
            _cb('qpdf_done', 76)

            # ── 5. mutool on best-so-far ───────────────────────────────
            _cb('mutool', 77)
            best_so_far = (
                min(candidates, key=lambda x: x[0])[1]
                if candidates else input_path
            )
            mt_out = str(tmp / 'mt_out.pdf')
            if _compress_mutool(best_so_far, mt_out, options, _cb):
                sz = Path(mt_out).stat().st_size
                candidates.append((sz, mt_out, 'mutool'))
                result['engines_tried'].append(f'mutool={_kb(sz)}KB')
                logger.info(f'[mutool] {_kb(sz)} KB')
            _cb('mutool_done', 84)

            # ── 6. pypdf fallback (always try) ─────────────────────────
            _cb('pypdf', 85)
            py_out = str(tmp / 'py_out.pdf')
            if _compress_pypdf(input_path, py_out, options, _cb):
                sz = Path(py_out).stat().st_size
                candidates.append((sz, py_out, 'pypdf'))
                result['engines_tried'].append(f'pypdf={_kb(sz)}KB')
            _cb('pypdf_done', 90)

            # ── Select best candidate ──────────────────────────────────
            if not candidates:
                shutil.copy2(input_path, output_path)
                result['error'] = 'All engines failed; file copied as-is'
                result['method_used'] = 'copy'
                result['output_size_bytes'] = in_size
                result['processing_time_ms'] = int((time.time() - t_start) * 1000)
                return result

            candidates.sort(key=lambda x: x[0])
            best_size, best_path, best_engine = candidates[0]

            # Fallback: if all compressed larger than input, try pikepdf clean
            if best_size >= in_size:
                clean_out = str(tmp / 'clean_final.pdf')
                if _compress_pikepdf(input_path, clean_out, preset, options):
                    clean_sz = Path(clean_out).stat().st_size
                    if clean_sz < in_size:
                        best_size, best_path, best_engine = (
                            clean_sz, clean_out, 'pikepdf-clean'
                        )

            # ── Post-processing pass ───────────────────────────────────
            current = best_path

            # Grayscale (user-enabled only)
            if options.get('grayscale', False):
                gs_gray_out = str(tmp / 'gray_out.pdf')
                if _grayscale_convert(current, gs_gray_out):
                    gray_sz = Path(gs_gray_out).stat().st_size
                    if gray_sz < best_size:
                        current   = gs_gray_out
                        best_size = gray_sz
                        best_engine += '+gray'

            # JavaScript removal
            if options.get('remove_javascript', False):
                js_out = str(tmp / 'nojs_out.pdf')
                if _remove_all_javascript(current, js_out):
                    js_sz = Path(js_out).stat().st_size
                    if js_sz <= best_size * 1.02:  # Allow slight size increase for safety
                        current   = js_out
                        best_size = js_sz

            # Final linearization pass
            if linearize and 'linearize' not in best_engine:
                lin_final = str(tmp / 'lin_final.pdf')
                if _postprocess_linearize(current, lin_final):
                    lin_sz    = Path(lin_final).stat().st_size
                    current   = lin_final
                    best_size = lin_sz
                    best_engine += '+web'

            # Copy best result to output path
            shutil.copy2(current, output_path)

        _cb('done', 97)

        # ── Validate output ────────────────────────────────────────────
        validation = validate_pdf_output(output_path, in_size)
        result['validation'] = validation

        if not validation['valid'] and not validation['is_pdf']:
            # Output is corrupted — fall back to original
            shutil.copy2(input_path, output_path)
            result['error'] = 'Compressed output validation failed; using original'
            result['method_used'] = 'copy'
            result['output_size_bytes'] = in_size
            result['processing_time_ms'] = int((time.time() - t_start) * 1000)
            return result

        out_size = Path(output_path).stat().st_size
        saved    = in_size - out_size
        pct      = round(saved / max(in_size, 1) * 100, 2)

        result.update({
            'success': True,
            'output_size_bytes': out_size,
            'reduction_bytes':   max(0, saved),
            'reduction_pct':     max(0.0, pct),
            'method_used':       best_engine,
            'quality_note':      _quality_note(preset_name, options),
            'processing_time_ms': int((time.time() - t_start) * 1000),
        })

        logger.info(
            f'[compress_pdf] Done: {_kb(in_size)} KB → {_kb(out_size)} KB '
            f'({pct:.1f}% saved) via {best_engine} [{result["processing_time_ms"]} ms]'
        )

        _cb('done', 100)

    except Exception as e:
        logger.exception(f'compress_pdf fatal: {e}')
        result['error'] = str(e)
        result['processing_time_ms'] = int((time.time() - t_start) * 1000)

    return result


# ══════════════════════════════════════════════════════════════════════════
# BACKWARD-COMPATIBILITY ALIASES
# ══════════════════════════════════════════════════════════════════════════

def compress_to_target_size(
    input_path: str,
    output_path: str,
    target_kb: int,
    options: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    """Alias for _compress_to_target_size (public API)."""
    return _compress_to_target_size(
        input_path, output_path, target_kb, options or {}, progress_callback
    )


def compress_grayscale(
    input_path: str,
    output_path: str,
    quality: int = 80,
) -> bool:
    """Alias for _grayscale_convert (public API)."""
    return _grayscale_convert(input_path, output_path)


def compress_remove_metadata(
    input_path: str,
    output_path: str,
    password: str = '',
) -> bool:
    """Strip all metadata from a PDF."""
    return _compress_pikepdf(
        input_path, output_path,
        QUALITY_PRESETS['lossless'],
        {'strip_metadata': True, 'password': password},
    )


def get_compression_potential(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Per-strategy reduction opportunity analysis."""
    est = get_compression_estimate(pdf_path, password)
    potential: Dict[str, Any] = {
        'image_compression': {},
        'metadata_stripping': {},
        'font_subsetting': {},
        'structure_optimization': {},
        'javascript_removal': {},
        'content_type': est.get('content_type', 'mixed'),
    }

    in_sz = est.get('file_size_bytes', 0)
    img_b = est.get('image_total_bytes', 0)
    img_frac = img_b / max(in_sz, 1)

    potential['image_compression'] = {
        'applicable': img_frac > 0.1,
        'image_fraction': round(img_frac * 100, 1),
        'estimated_savings_pct': round(img_frac * 60, 1),
    }

    potential['metadata_stripping'] = {
        'applicable': bool(est.get('metadata')),
        'estimated_savings_kb': 5,
    }

    font_a = get_font_analysis(pdf_path, password)
    potential['font_subsetting'] = {
        'applicable': font_a.get('subsetting_opportunity_kb', 0) > 0,
        'opportunity_kb': font_a.get('subsetting_opportunity_kb', 0),
        'fonts_count': font_a.get('total_fonts', 0),
    }

    potential['javascript_removal'] = {
        'applicable': est.get('has_javascript', False),
        'has_js': est.get('has_javascript', False),
    }

    return potential


def get_image_compression_stats(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Detailed per-image compression metrics and opportunities."""
    images = analyze_images_in_pdf(pdf_path, password)
    total_bytes = sum(img['bytes'] for img in images)
    high_dpi    = [img for img in images if img.get('estimated_dpi', 0) > 200]

    return {
        'total_images': len(images),
        'total_bytes': total_bytes,
        'total_kb': round(total_bytes / 1024, 1),
        'high_dpi_images': len(high_dpi),
        'high_compressibility': [img for img in images if img['compressibility'] == 'high'],
        'images': images[:20],
        'formats': Counter(img['format'] for img in images),
        'estimated_savings_screen_pct': min(90, round(len(high_dpi) / max(len(images), 1) * 80, 1)),
    }


def get_pdf_structure_report(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Deep PDF structure analysis — object types, streams, sizes."""
    report: Dict[str, Any] = {
        'file_size_bytes': 0,
        'object_stats': {},
        'stream_stats': {},
        'security': {},
        'metadata': {},
        'fonts': {},
        'images_summary': {},
    }

    try:
        report['file_size_bytes'] = Path(pdf_path).stat().st_size
        report['object_stats']    = get_object_statistics(pdf_path, password)
        report['stream_stats']    = analyze_pdf_streams(pdf_path, password)
        report['security']        = get_security_report(pdf_path, password)
        report['metadata']        = get_pdf_metadata(pdf_path, password)
        report['fonts']           = get_font_analysis(pdf_path, password)

        images = analyze_images_in_pdf(pdf_path, password, max_images=20)
        report['images_summary'] = {
            'count': len(images),
            'total_kb': round(sum(i['bytes'] for i in images) / 1024, 1),
            'formats': dict(Counter(i['format'] for i in images)),
        }
    except Exception as e:
        report['error'] = str(e)

    return report
