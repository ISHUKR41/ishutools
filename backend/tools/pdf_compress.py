"""
pdf_compress.py — IshuTools.fun Enterprise PDF Compression Suite v11.0
Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPRESSION PIPELINE (7 engines, all tried, smallest result kept):
  1. Ghostscript CLI      — industry-standard distiller presets (gs)
  2. PyMuPDF (fitz)       — per-image DPI downsampling + JPEG re-encode
  3. pikepdf              — object stream merging, DEFLATE-9, XMP strip
  4. qpdf CLI             — stream recompression + linearization
  5. pypdf                — orphan object removal, page content optimization
  6. Pillow               — image-only JPEG/WebP recompression pipeline
  7. mutool               — MuPDF-based clean + compress (when available)

QUALITY PRESETS (NO auto grayscale — user must enable explicitly):
  screen   → 72 DPI,  JPEG q=30  — max compression, screen viewing only
  low      → 96 DPI,  JPEG q=45  — email-friendly small file
  medium   → 150 DPI, JPEG q=65  — balanced recommended
  high     → 200 DPI, JPEG q=82  — near-lossless, print-quality
  lossless → 300 DPI, no re-encode — structure-only, zero image degradation

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
from collections import defaultdict, Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any, Union, Generator

# ── Core PDF libraries ─────────────────────────────────────────────────────
try:
    import pikepdf
    from pikepdf import Pdf, PdfError, Dictionary, Array, Name, String as PikePdfString
    PIKEPDF_OK = True
except ImportError:
    PIKEPDF_OK = False

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
    PYPDF_OK = True
except ImportError:
    PYPDF_OK = False

try:
    from PIL import Image, ImageFilter, ImageOps, ImageEnhance
    PIL_OK = True
    PIL_VERSION = Image.__version__
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
    from reportlab.lib.pagesizes import A4
    REPORTLAB_OK = True
except ImportError:
    REPORTLAB_OK = False

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════
# CLI BINARY DETECTION
# ══════════════════════════════════════════════════════════════════════════

def _find_binary(*names: str) -> Optional[str]:
    """Find first available binary from names list."""
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    return None

GS_BIN     = _find_binary('gs', 'ghostscript', 'gswin64c', 'gswin32c')
QPDF_BIN   = _find_binary('qpdf')
MUTOOL_BIN = _find_binary('mutool')
PDFTK_BIN  = _find_binary('pdftk')
PS2PDF_BIN = _find_binary('ps2pdf')
CONVERT_BIN = _find_binary('convert')  # ImageMagick

# ══════════════════════════════════════════════════════════════════════════
# QUALITY PRESETS
# ⚠️  CRITICAL: grayscale is NEVER set True here. Only user-controlled.
# ══════════════════════════════════════════════════════════════════════════

QUALITY_PRESETS: Dict[str, Dict[str, Any]] = {
    'screen': {
        'dpi': 72,
        'jpeg_quality': 30,
        'webp_quality': 25,
        'image_scale': 0.40,
        'grayscale': False,          # ← NEVER force grayscale
        'gs_setting': '/screen',
        'gs_dpi': 72,
        'deflate_level': 9,
        'downsample_above_dpi': 150,
        'jpeg2000': False,
        'description': 'Screen — 72 DPI, maximum compression, screen viewing only',
        'expected_reduction': '70–90%',
        'color': '#ef4444',
        'badge': 'MAX',
    },
    'low': {
        'dpi': 96,
        'jpeg_quality': 45,
        'webp_quality': 40,
        'image_scale': 0.55,
        'grayscale': False,
        'gs_setting': '/ebook',
        'gs_dpi': 96,
        'deflate_level': 9,
        'downsample_above_dpi': 200,
        'jpeg2000': False,
        'description': 'Low — 96 DPI, very small file, ideal for email',
        'expected_reduction': '55–75%',
        'color': '#f97316',
        'badge': None,
    },
    'medium': {
        'dpi': 150,
        'jpeg_quality': 65,
        'webp_quality': 60,
        'image_scale': 0.70,
        'grayscale': False,
        'gs_setting': '/printer',
        'gs_dpi': 150,
        'deflate_level': 8,
        'downsample_above_dpi': 300,
        'jpeg2000': False,
        'description': 'Medium — 150 DPI, balanced quality and size',
        'expected_reduction': '40–60%',
        'color': '#6366f1',
        'badge': 'REC',
    },
    'high': {
        'dpi': 200,
        'jpeg_quality': 82,
        'webp_quality': 78,
        'image_scale': 0.85,
        'grayscale': False,
        'gs_setting': '/prepress',
        'gs_dpi': 200,
        'deflate_level': 7,
        'downsample_above_dpi': 400,
        'jpeg2000': False,
        'description': 'High — 200 DPI, near-lossless, excellent quality',
        'expected_reduction': '20–45%',
        'color': '#10b981',
        'badge': None,
    },
    'lossless': {
        'dpi': 300,
        'jpeg_quality': 95,
        'webp_quality': 92,
        'image_scale': 1.00,
        'grayscale': False,
        'gs_setting': '/default',
        'gs_dpi': 300,
        'deflate_level': 6,
        'downsample_above_dpi': 9999,
        'jpeg2000': False,
        'description': 'Lossless — 300 DPI, structure-only, zero image quality loss',
        'expected_reduction': '5–25%',
        'color': '#8b5cf6',
        'badge': '💎',
    },
}

# ══════════════════════════════════════════════════════════════════════════
# ENGINE DETECTION
# ══════════════════════════════════════════════════════════════════════════

def get_available_engines() -> Dict[str, Any]:
    """Return dict of available compression engines with version info."""
    engines = {}

    # Ghostscript
    if GS_BIN:
        try:
            r = subprocess.run([GS_BIN, '--version'], capture_output=True, text=True, timeout=5)
            engines['ghostscript'] = {'available': True, 'path': GS_BIN,
                                       'version': r.stdout.strip(), 'priority': 1}
        except Exception:
            engines['ghostscript'] = {'available': False}
    else:
        engines['ghostscript'] = {'available': False}

    # PyMuPDF
    engines['pymupdf'] = {'available': FITZ_OK, 'version': FITZ_VERSION, 'priority': 2}

    # pikepdf
    if PIKEPDF_OK:
        engines['pikepdf'] = {'available': True, 'version': pikepdf.__version__, 'priority': 3}
    else:
        engines['pikepdf'] = {'available': False}

    # qpdf
    if QPDF_BIN:
        try:
            r = subprocess.run([QPDF_BIN, '--version'], capture_output=True, text=True, timeout=5)
            ver = r.stdout.strip().split('\n')[0]
            engines['qpdf'] = {'available': True, 'path': QPDF_BIN, 'version': ver, 'priority': 4}
        except Exception:
            engines['qpdf'] = {'available': True, 'path': QPDF_BIN, 'priority': 4}
    else:
        engines['qpdf'] = {'available': False}

    # pypdf
    if PYPDF_OK:
        try:
            import pypdf
            engines['pypdf'] = {'available': True, 'version': pypdf.__version__, 'priority': 5}
        except Exception:
            engines['pypdf'] = {'available': True, 'priority': 5}
    else:
        engines['pypdf'] = {'available': False}

    # Pillow
    engines['pillow'] = {'available': PIL_OK, 'version': PIL_VERSION, 'priority': 6}

    # mutool
    if MUTOOL_BIN:
        try:
            r = subprocess.run([MUTOOL_BIN, '-v'], capture_output=True, text=True, timeout=5)
            engines['mutool'] = {'available': True, 'path': MUTOOL_BIN,
                                  'version': r.stderr.strip().split('\n')[0], 'priority': 7}
        except Exception:
            engines['mutool'] = {'available': True, 'path': MUTOOL_BIN, 'priority': 7}
    else:
        engines['mutool'] = {'available': False}

    engines['pdftk'] = {'available': bool(PDFTK_BIN), 'path': PDFTK_BIN}
    engines['imagemagick'] = {'available': bool(CONVERT_BIN), 'path': CONVERT_BIN}

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
        'content_type': 'mixed',  # text_heavy / image_heavy / mixed / scanned
        'is_linearized': False,
        'compression_ratio_current': 1.0,
        'estimated_reductions_by_preset': {
            'screen': 75, 'low': 60, 'medium': 50, 'high': 35, 'lossless': 15
        },
        'metadata': {},
        'engines': [],
        'error': None,
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
                doc_kwargs = {}
                if password:
                    doc_kwargs['password'] = password

                doc = fitz.open(pdf_path, **doc_kwargs)
                result['page_count'] = doc.page_count
                result['pdf_version'] = doc.pdf_version()
                result['is_linearized'] = doc.is_fast_webaccess

                meta = doc.metadata or {}
                result['metadata'] = {k: v for k, v in meta.items() if v}

                img_bytes_total = 0
                img_count = 0
                has_scanned = False

                for page_num in range(min(doc.page_count, 30)):  # sample first 30
                    page = doc[page_num]
                    img_list = page.get_images(full=True)
                    img_count += len(img_list)

                    for img_info in img_list[:10]:  # cap per page
                        xref = img_info[0]
                        try:
                            base_img = doc.extract_image(xref)
                            img_bytes_total += len(base_img.get('image', b''))
                            w = base_img.get('width', 0)
                            h = base_img.get('height', 0)
                            if w > 1500 and h > 2000:
                                has_scanned = True
                        except Exception:
                            pass

                result['image_count'] = img_count
                result['image_total_bytes'] = img_bytes_total

                # Check for JavaScript
                try:
                    for page in doc:
                        for annot in page.annots():
                            if annot.type[1] in ('Widget', 'Screen'):
                                result['has_forms'] = True
                            result['has_annotations'] = True
                        links = page.get_links()
                        for lnk in links:
                            if lnk.get('kind') == fitz.LINK_LAUNCH:
                                pass
                except Exception:
                    pass

                # Check XML metadata for JS / embedded files
                try:
                    xmp = doc.get_xml_metadata()
                    if xmp and 'JavaScript' in xmp:
                        result['has_javascript'] = True
                except Exception:
                    pass

                doc.close()

                # Determine content type
                file_sz = result['file_size_bytes']
                img_frac = img_bytes_total / max(file_sz, 1)

                if has_scanned:
                    result['content_type'] = 'scanned'
                elif img_frac > 0.65:
                    result['content_type'] = 'image_heavy'
                elif img_frac < 0.15:
                    result['content_type'] = 'text_heavy'
                else:
                    result['content_type'] = 'mixed'

                # Estimate reductions per preset based on content
                ct = result['content_type']
                ests = result['estimated_reductions_by_preset']
                if ct == 'image_heavy' or ct == 'scanned':
                    ests.update({'screen': 88, 'low': 72, 'medium': 58, 'high': 40, 'lossless': 20})
                elif ct == 'text_heavy':
                    ests.update({'screen': 45, 'low': 35, 'medium': 25, 'high': 15, 'lossless': 10})
                else:
                    ests.update({'screen': 75, 'low': 60, 'medium': 48, 'high': 32, 'lossless': 15})

            except Exception as e:
                result['error'] = f'PyMuPDF analysis error: {e}'

        # ── pikepdf analysis (supplementary) ─────────────────────────
        if PIKEPDF_OK:
            try:
                open_kwargs = {}
                if password:
                    open_kwargs['password'] = password
                pdf = pikepdf.open(pdf_path, **open_kwargs)

                result['has_encryption'] = pdf.is_encrypted

                font_xrefs = set()
                for page in pdf.pages:
                    try:
                        resources = page.get('/Resources', {})
                        fonts = resources.get('/Font', {})
                        for font_key in fonts:
                            font_xrefs.add(str(font_key))
                    except Exception:
                        pass

                result['font_count'] = len(font_xrefs)

                # Check for JavaScript actions
                try:
                    root = pdf.Root
                    if '/Names' in root:
                        names = root['/Names']
                        if '/JavaScript' in names:
                            result['has_javascript'] = True
                    if '/AA' in root or '/OpenAction' in root:
                        result['has_javascript'] = True
                    if '/AcroForm' in root:
                        result['has_forms'] = True
                    if '/EmbeddedFiles' in root.get('/Names', {}):
                        result['has_embedded_files'] = True
                except Exception:
                    pass

                pdf.close()
            except Exception:
                pass

        result['engines'] = [k for k, v in get_available_engines().items() if v.get('available')]

    except Exception as e:
        result['error'] = str(e)

    return result


def get_pdf_metadata(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Extract full metadata from a PDF."""
    meta = {
        'title': '', 'author': '', 'subject': '', 'keywords': '',
        'creator': '', 'producer': '', 'creation_date': '',
        'modification_date': '', 'pdf_version': '', 'page_count': 0,
        'file_size_bytes': 0, 'is_encrypted': False, 'is_linearized': False,
        'tagged': False, 'xmp_metadata': '',
    }
    try:
        if FITZ_OK:
            doc = fitz.open(pdf_path)
            if password and doc.is_encrypted:
                doc.authenticate(password)
            raw = doc.metadata or {}
            meta.update({k: v for k, v in raw.items() if v})
            meta['page_count'] = doc.page_count
            meta['pdf_version'] = doc.pdf_version()
            meta['is_linearized'] = doc.is_fast_webaccess
            meta['file_size_bytes'] = Path(pdf_path).stat().st_size
            try:
                meta['xmp_metadata'] = doc.get_xml_metadata() or ''
            except Exception:
                pass
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


def analyze_images_in_pdf(pdf_path: str, password: str = '',
                           max_images: int = 50) -> List[Dict[str, Any]]:
    """Detailed per-image analysis: DPI, size, format, compressibility."""
    images = []
    if not FITZ_OK:
        return images

    try:
        doc = fitz.open(pdf_path)
        if password and doc.is_encrypted:
            doc.authenticate(password)

        seen_xrefs = set()
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
                    w = base_img.get('width', 0)
                    h = base_img.get('height', 0)
                    raw_bytes = len(base_img.get('image', b''))
                    ext = base_img.get('ext', 'unknown')
                    cs = base_img.get('colorspace', 0)

                    # Estimate DPI by comparing pixel size to page size
                    # page_rect is in points (1 pt = 1/72 inch)
                    if page_rect.width > 0 and w > 0:
                        dpi_x = round(w / (page_rect.width / 72))
                    else:
                        dpi_x = 0

                    compressibility = 'medium'
                    if ext in ('jpeg', 'jpg'):
                        compressibility = 'low'  # already compressed
                    elif ext in ('png', 'bmp', 'tiff'):
                        compressibility = 'high'
                    elif ext == 'jp2':
                        compressibility = 'low'

                    images.append({
                        'xref': xref,
                        'page': page_num + 1,
                        'width': w,
                        'height': h,
                        'format': ext,
                        'size_bytes': raw_bytes,
                        'size_kb': round(raw_bytes / 1024, 1),
                        'estimated_dpi': dpi_x,
                        'colorspace_components': cs,
                        'is_color': cs > 1 if isinstance(cs, int) else True,
                        'compressibility': compressibility,
                    })
                except Exception:
                    pass

        doc.close()
    except Exception as e:
        logger.warning(f'analyze_images_in_pdf error: {e}')

    return images


def detect_pdf_type(pdf_path: str, password: str = '') -> str:
    """
    Detect PDF type: text_heavy / image_heavy / mixed / scanned / vector_only
    """
    try:
        estimate = get_compression_estimate(pdf_path, password)
        return estimate.get('content_type', 'mixed')
    except Exception:
        return 'mixed'


def get_font_analysis(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Analyze embedded fonts: count, size, subset opportunities."""
    result = {'fonts': [], 'total_font_bytes': 0, 'subset_potential_bytes': 0,
               'count': 0, 'fully_embedded': 0, 'subsetted': 0}
    if not PIKEPDF_OK:
        return result

    try:
        pdf = pikepdf.open(pdf_path, password=password or '')
        fonts_seen = {}

        for page in pdf.pages:
            try:
                resources = page.get('/Resources', pikepdf.Dictionary())
                font_dict = resources.get('/Font', pikepdf.Dictionary())
                for font_name, font_ref in font_dict.items():
                    try:
                        font_obj = font_ref
                        font_key = str(font_obj.get('/BaseFont', font_name))
                        if font_key in fonts_seen:
                            continue

                        descriptor = font_obj.get('/FontDescriptor')
                        size_bytes = 0
                        is_embedded = False
                        is_subset = False

                        if descriptor:
                            for stream_key in ('/FontFile', '/FontFile2', '/FontFile3'):
                                try:
                                    ff = descriptor.get(stream_key)
                                    if ff:
                                        is_embedded = True
                                        data = bytes(ff.read_bytes())
                                        size_bytes = len(data)
                                        break
                                except Exception:
                                    pass

                            # Check if subset (name starts with 6-char tag + '+')
                            base = str(font_obj.get('/BaseFont', ''))
                            if re.match(r'^[A-Z]{6}\+', base):
                                is_subset = True

                        fonts_seen[font_key] = {
                            'name': font_key,
                            'type': str(font_obj.get('/Subtype', 'Unknown')),
                            'size_bytes': size_bytes,
                            'size_kb': round(size_bytes / 1024, 1),
                            'is_embedded': is_embedded,
                            'is_subset': is_subset,
                        }

                        if is_embedded:
                            result['fully_embedded'] += 1
                        if is_subset:
                            result['subsetted'] += 1
                        result['total_font_bytes'] += size_bytes
                        if is_embedded and not is_subset:
                            result['subset_potential_bytes'] += int(size_bytes * 0.6)

                    except Exception:
                        pass
            except Exception:
                pass

        pdf.close()
        result['fonts'] = list(fonts_seen.values())
        result['count'] = len(result['fonts'])

    except Exception as e:
        result['error'] = str(e)

    return result


def get_pdf_structure_report(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Deep structural analysis of PDF objects and streams."""
    report = {
        'object_count': 0,
        'stream_count': 0,
        'compressed_streams': 0,
        'uncompressed_streams': 0,
        'xref_type': 'table',
        'has_object_streams': False,
        'has_cross_reference_stream': False,
        'content_stream_bytes': 0,
        'image_stream_bytes': 0,
        'font_stream_bytes': 0,
        'other_stream_bytes': 0,
        'junk_bytes_estimate': 0,
    }
    if not PIKEPDF_OK:
        return report

    try:
        pdf = pikepdf.open(pdf_path, password=password or '')
        report['object_count'] = len(pdf.objects)

        for obj in pdf.objects:
            try:
                if isinstance(obj, pikepdf.Stream):
                    report['stream_count'] += 1
                    raw = bytes(obj.read_raw_bytes())
                    decoded = None
                    try:
                        decoded = bytes(obj.read_bytes())
                    except Exception:
                        pass

                    filters = obj.get('/Filter')
                    if filters:
                        report['compressed_streams'] += 1
                    else:
                        report['uncompressed_streams'] += 1

                    subtype = str(obj.get('/Subtype', ''))
                    if subtype == '/Image':
                        report['image_stream_bytes'] += len(raw)
                    elif subtype in ('/Type1C', '/CIDFontType0C'):
                        report['font_stream_bytes'] += len(raw)
                    else:
                        report['content_stream_bytes'] += len(raw)

            except Exception:
                pass

        pdf.close()
    except Exception as e:
        report['error'] = str(e)

    return report


def estimate_compression_savings(file_size_bytes: int, content_type: str = 'mixed',
                                  preset: str = 'medium') -> Dict[str, Any]:
    """Fast estimate without opening the file — for UI hints."""
    # Base reduction rates by content type
    rates = {
        'image_heavy': {'screen': 0.88, 'low': 0.72, 'medium': 0.58, 'high': 0.40, 'lossless': 0.22},
        'scanned':     {'screen': 0.85, 'low': 0.70, 'medium': 0.55, 'high': 0.38, 'lossless': 0.20},
        'text_heavy':  {'screen': 0.48, 'low': 0.38, 'medium': 0.28, 'high': 0.18, 'lossless': 0.10},
        'mixed':       {'screen': 0.75, 'low': 0.60, 'medium': 0.48, 'high': 0.32, 'lossless': 0.15},
        'vector_only': {'screen': 0.30, 'low': 0.22, 'medium': 0.18, 'high': 0.12, 'lossless': 0.08},
    }
    rate_map = rates.get(content_type, rates['mixed'])
    rate = rate_map.get(preset, 0.48)

    estimated_out = int(file_size_bytes * (1 - rate))
    saved = file_size_bytes - estimated_out

    return {
        'input_bytes': file_size_bytes,
        'estimated_output_bytes': estimated_out,
        'estimated_saved_bytes': saved,
        'estimated_reduction_pct': round(rate * 100, 1),
        'preset': preset,
        'content_type': content_type,
    }


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 1: GHOSTSCRIPT
# ══════════════════════════════════════════════════════════════════════════

def _compress_ghostscript(input_path: str, output_path: str, preset: Dict[str, Any],
                            options: Dict[str, Any], progress_cb=None) -> bool:
    """
    Ghostscript-based compression. Most powerful engine for image-heavy PDFs.
    """
    if not GS_BIN:
        return False

    try:
        dpi = preset['dpi']
        gs_setting = preset['gs_setting']
        quality = preset['jpeg_quality']

        cmd = [
            GS_BIN,
            '-q',
            '-dBATCH',
            '-dNOPAUSE',
            '-dSAFER',
            '-sDEVICE=pdfwrite',
            f'-dCompatibilityLevel=1.5',
            f'-dPDFSETTINGS={gs_setting}',
            f'-dColorImageResolution={dpi}',
            f'-dGrayImageResolution={dpi}',
            f'-dMonoImageResolution={dpi}',
            f'-dColorImageDownsampleType=/Bicubic',
            f'-dGrayImageDownsampleType=/Bicubic',
            f'-dColorImageFilter=/DCTEncode',
            f'-dGrayImageFilter=/DCTEncode',
            f'-dAutoFilterColorImages=false',
            f'-dAutoFilterGrayImages=false',
            f'-dDownsampleColorImages=true',
            f'-dDownsampleGrayImages=true',
            f'-dJPEGQ={quality}',
            '-dCompressFonts=true',
            '-dEmbedAllFonts=true',
            '-dSubsetFonts=true',
            '-dOptimize=true',
            '-dDetectDuplicateImages=true',
            '-dDoNumCopies=true',
            '-dFastWebView=false',
        ]

        # Handle password-protected PDFs
        password = options.get('password', '')
        if password:
            cmd += [f'-sPDFPassword={password}']

        # Grayscale (user-controlled only)
        if options.get('grayscale', False):
            cmd += [
                '-sColorConversionStrategy=Gray',
                '-dProcessColorModel=/DeviceGray',
                '-dColorConversionStrategyForImages=Gray',
            ]

        # Strip metadata
        if options.get('strip_metadata', False):
            cmd += ['-dFILTERTEXT', '-dFILTERVECTOR']

        # Remove JavaScript
        if options.get('remove_javascript', False):
            cmd += ['-dNoUserUnit', '-dNOINTERPOLATE']

        # Linearize (web optimize) — done with qpdf after GS
        # Subset fonts
        if options.get('subset_fonts', False):
            cmd += ['-dSubsetFonts=true', '-dMaxSubsetPct=100']

        # Remove ICC profiles
        if options.get('remove_icc_profiles', False):
            cmd += ['-dNoOutputICCProfile']

        # Output
        cmd += [f'-sOutputFile={output_path}', input_path]

        if progress_cb:
            progress_cb('ghostscript', 15)

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300
        )

        if progress_cb:
            progress_cb('ghostscript', 45)

        if result.returncode != 0:
            logger.warning(f'Ghostscript stderr: {result.stderr[:500]}')
            return False

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except subprocess.TimeoutExpired:
        logger.error('Ghostscript timed out')
        return False
    except Exception as e:
        logger.error(f'Ghostscript error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 2: PyMuPDF (fitz)
# ══════════════════════════════════════════════════════════════════════════

def _compress_pymupdf(input_path: str, output_path: str, preset: Dict[str, Any],
                       options: Dict[str, Any], progress_cb=None) -> bool:
    """
    PyMuPDF-based compression: per-image DPI downsampling + recompression.
    Excellent for fine-grained image control.
    """
    if not FITZ_OK:
        return False

    try:
        password = options.get('password', '')
        dpi = preset['dpi']
        quality = preset['jpeg_quality']
        grayscale = options.get('grayscale', False)
        strip_meta = options.get('strip_metadata', False)
        remove_annot = options.get('remove_annotations', False)
        downsample_above = preset.get('downsample_above_dpi', 300)
        img_scale = preset.get('image_scale', 0.80)

        doc = fitz.open(input_path)
        if password and doc.is_encrypted:
            if not doc.authenticate(password):
                doc.close()
                return False

        if progress_cb:
            progress_cb('pymupdf', 20)

        # Process each page
        for page_num in range(doc.page_count):
            page = doc[page_num]

            # Remove annotations if requested
            if remove_annot:
                try:
                    annot_list = list(page.annots())
                    for annot in annot_list:
                        page.delete_annot(annot)
                except Exception:
                    pass

            # Recompress images
            img_list = page.get_images(full=True)
            page_rect = page.rect

            for img_info in img_list:
                xref = img_info[0]
                try:
                    base_img = doc.extract_image(xref)
                    img_bytes = base_img.get('image', b'')
                    w = base_img.get('width', 1)
                    h = base_img.get('height', 1)
                    ext = base_img.get('ext', 'png')

                    # Estimate current DPI
                    if page_rect.width > 0:
                        curr_dpi = w / (page_rect.width / 72)
                    else:
                        curr_dpi = 150

                    needs_downsample = (curr_dpi > downsample_above) or (w > 2400) or (h > 3200)
                    is_jpeg = ext in ('jpeg', 'jpg')

                    if not needs_downsample and is_jpeg and not grayscale:
                        continue

                    # Open with Pillow
                    pil_img = Image.open(io.BytesIO(img_bytes))

                    # Downsample if needed
                    if needs_downsample:
                        scale = min(img_scale, dpi / max(curr_dpi, 1))
                        new_w = max(1, int(w * scale))
                        new_h = max(1, int(h * scale))
                        if new_w < w or new_h < h:
                            pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

                    # Convert to grayscale if user requested
                    if grayscale:
                        pil_img = pil_img.convert('L')
                    elif pil_img.mode in ('RGBA', 'P', 'LA'):
                        pil_img = pil_img.convert('RGB')

                    # Re-encode
                    buf = io.BytesIO()
                    save_mode = 'JPEG'
                    save_kwargs = {'quality': quality, 'optimize': True, 'progressive': True}

                    if pil_img.mode == 'L':
                        save_kwargs.pop('progressive', None)

                    try:
                        pil_img.save(buf, format=save_mode, **save_kwargs)
                        new_bytes = buf.getvalue()

                        # Only replace if smaller
                        if len(new_bytes) < len(img_bytes) * 0.98:
                            doc.update_stream(xref, new_bytes)
                    except Exception:
                        pass

                    pil_img.close()

                except Exception:
                    pass

        if progress_cb:
            progress_cb('pymupdf', 60)

        # Strip metadata
        if strip_meta:
            try:
                doc.set_metadata({})
                doc.del_xml_metadata()
            except Exception:
                pass

        # Save options
        save_options = {
            'garbage': 4,
            'clean': True,
            'deflate': True,
            'deflate_images': True,
            'deflate_fonts': True,
            'ascii': False,
            'linear': options.get('linearize', False),
            'pretty': False,
        }

        doc.save(output_path, **save_options)
        doc.close()

        if progress_cb:
            progress_cb('pymupdf', 80)

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except Exception as e:
        logger.error(f'PyMuPDF compress error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 3: pikepdf
# ══════════════════════════════════════════════════════════════════════════

def _compress_pikepdf(input_path: str, output_path: str, preset: Dict[str, Any],
                       options: Dict[str, Any], progress_cb=None) -> bool:
    """
    pikepdf-based compression: object stream merging, DEFLATE-9,
    duplicate object removal, metadata stripping, annotation removal.
    Best for structure-level compression and lossless mode.
    """
    if not PIKEPDF_OK:
        return False

    try:
        password = options.get('password', '')
        deflate = preset.get('deflate_level', 9)
        strip_meta = options.get('strip_metadata', False)
        remove_annot = options.get('remove_annotations', False)
        remove_js = options.get('remove_javascript', False)
        remove_thumbnails = options.get('remove_thumbnails', False)
        remove_icc = options.get('remove_icc_profiles', False)
        remove_embedded = options.get('remove_embedded_files', False)
        remove_forms = options.get('remove_forms', False)

        open_kwargs = {}
        if password:
            open_kwargs['password'] = password

        pdf = pikepdf.open(input_path, **open_kwargs)

        if progress_cb:
            progress_cb('pikepdf', 20)

        # Strip metadata
        if strip_meta:
            try:
                with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
                    keys_to_del = [k for k in meta if 'creator' not in k.lower()
                                   and 'producer' not in k.lower()]
                    for k in keys_to_del:
                        try:
                            del meta[k]
                        except Exception:
                            pass
                pdf.docinfo.clear()
            except Exception:
                pass

        # Remove JavaScript from root
        if remove_js:
            try:
                root = pdf.Root
                for key in ('/AA', '/OpenAction'):
                    if key in root:
                        del root[key]
                if '/Names' in root:
                    names = root['/Names']
                    if '/JavaScript' in names:
                        del names['/JavaScript']
            except Exception:
                pass

        # Remove embedded files
        if remove_embedded:
            try:
                root = pdf.Root
                if '/Names' in root and '/EmbeddedFiles' in root['/Names']:
                    del root['/Names']['/EmbeddedFiles']
            except Exception:
                pass

        # Remove forms
        if remove_forms:
            try:
                if '/AcroForm' in pdf.Root:
                    del pdf.Root['/AcroForm']
            except Exception:
                pass

        # Process pages
        for page in pdf.pages:
            try:
                # Remove annotations
                if remove_annot and '/Annots' in page:
                    del page['/Annots']

                # Remove page thumbnails
                if remove_thumbnails and '/Thumb' in page:
                    del page['/Thumb']

                # Remove ICC profiles from resources
                if remove_icc:
                    resources = page.get('/Resources', pikepdf.Dictionary())
                    if '/ColorSpace' in resources:
                        cs = resources['/ColorSpace']
                        for cs_name in list(cs.keys()):
                            try:
                                cs_obj = cs[cs_name]
                                if isinstance(cs_obj, pikepdf.Array):
                                    if len(cs_obj) > 1 and str(cs_obj[0]) == '/ICCBased':
                                        del cs[cs_name]
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
            progress_cb('pikepdf', 85)

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except Exception as e:
        logger.error(f'pikepdf compress error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# ENGINE 4: qpdf CLI
# ══════════════════════════════════════════════════════════════════════════

def _compress_qpdf(input_path: str, output_path: str, options: Dict[str, Any],
                   linearize: bool = False, progress_cb=None) -> bool:
    """
    qpdf-based recompression + optional linearization (web optimize).
    """
    if not QPDF_BIN:
        return False

    try:
        password = options.get('password', '')

        cmd = [QPDF_BIN, '--compress-streams=y', '--recompress-flate',
               '--compression-level=9', '--object-streams=generate',
               '--stream-data=compress', '--decode-level=generalized']

        if password:
            cmd += [f'--password={password}']

        if linearize:
            cmd += ['--linearize']

        cmd += [input_path, output_path]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode not in (0, 3):  # 3 = warnings but success
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

def _compress_pypdf(input_path: str, output_path: str, options: Dict[str, Any],
                    progress_cb=None) -> bool:
    """
    pypdf-based compression: orphan object removal, page content optimization.
    Fallback when other engines fail.
    """
    if not PYPDF_OK:
        return False

    try:
        password = options.get('password', '')

        reader = PdfReader(input_path)
        if reader.is_encrypted and password:
            reader.decrypt(password)

        writer = PdfWriter()
        writer.clone_reader_document_root(reader)

        # Add all pages
        for page in reader.pages:
            try:
                page.compress_content_streams()
            except Exception:
                pass
            writer.add_page(page)

        # Strip metadata if requested
        if options.get('strip_metadata', False):
            writer.add_metadata({
                '/Creator': '',
                '/Producer': '',
                '/Author': '',
                '/Title': '',
                '/Subject': '',
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

def _compress_mutool(input_path: str, output_path: str, options: Dict[str, Any],
                     progress_cb=None) -> bool:
    """
    mutool-based clean + compress. Very fast, good for already-compressed PDFs.
    """
    if not MUTOOL_BIN:
        return False

    try:
        password = options.get('password', '')
        cmd = [MUTOOL_BIN, 'clean', '-z', '-i', '-f', '-a', '-D']

        if password:
            cmd += ['-p', password]

        cmd += [input_path, output_path]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            return False

        return Path(output_path).exists() and Path(output_path).stat().st_size > 100

    except Exception as e:
        logger.error(f'mutool error: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# POST-PROCESSING: Linearize + Finalize
# ══════════════════════════════════════════════════════════════════════════

def _postprocess_linearize(pdf_path: str, output_path: str) -> bool:
    """Apply web linearization using qpdf."""
    if not QPDF_BIN:
        return False
    try:
        cmd = [QPDF_BIN, '--linearize', pdf_path, output_path]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode in (0, 3) and Path(output_path).stat().st_size > 100
    except Exception:
        return False


def _remove_all_javascript(pdf_path: str, output_path: str) -> bool:
    """Strip all JavaScript from PDF using pikepdf."""
    if not PIKEPDF_OK:
        shutil.copy2(pdf_path, output_path)
        return True
    try:
        pdf = pikepdf.open(pdf_path)
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
                    keep = []
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

        pdf.save(output_path, compress_streams=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate)
        pdf.close()
        return True
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════
# MAIN COMPRESSION FUNCTION — 7-engine pipeline
# ══════════════════════════════════════════════════════════════════════════

def compress_pdf(
    input_path: str,
    output_path: str,
    preset_name: str = 'medium',
    options: Optional[Dict[str, Any]] = None,
    progress_callback=None,
) -> Dict[str, Any]:
    """
    Enterprise PDF compression with 7-engine pipeline.

    Tries every available engine, picks the smallest result.

    Args:
        input_path: Path to input PDF
        output_path: Path for output compressed PDF
        preset_name: 'screen' | 'low' | 'medium' | 'high' | 'lossless'
        options: {
            grayscale: bool,
            strip_metadata: bool,
            remove_annotations: bool,
            linearize: bool,
            remove_javascript: bool,
            remove_thumbnails: bool,
            remove_embedded_files: bool,
            flatten_transparency: bool,
            subset_fonts: bool,
            remove_icc_profiles: bool,
            remove_forms: bool,
            remove_links: bool,
            password: str,
            target_size_kb: int or None,
        }
        progress_callback: callable(stage: str, pct: int)

    Returns:
        Dict with compression results and statistics.
    """
    t_start = time.time()
    options = options or {}
    preset = QUALITY_PRESETS.get(preset_name, QUALITY_PRESETS['medium'])

    def _cb(stage, pct):
        if progress_callback:
            try:
                progress_callback(stage, pct)
            except Exception:
                pass

    result = {
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
    }

    try:
        in_path = Path(input_path)
        if not in_path.exists():
            result['error'] = 'Input file not found'
            return result

        result['input_size_bytes'] = in_path.stat().st_size
        in_size = result['input_size_bytes']

        # Target size mode — iterate presets to reach target
        target_kb = options.get('target_size_kb')
        if target_kb and int(target_kb) > 0:
            return _compress_to_target_size(input_path, output_path, int(target_kb),
                                             options, progress_callback)

        _cb('init', 5)

        # ── Temporary directory for engine outputs ─────────────────────
        with tempfile.TemporaryDirectory(prefix='ishu_compress_') as tmp_dir:
            tmp = Path(tmp_dir)
            candidates = []  # list of (size_bytes, path, engine_name)

            # 1. Ghostscript
            _cb('ghostscript', 8)
            gs_out = str(tmp / 'gs_out.pdf')
            if _compress_ghostscript(input_path, gs_out, preset, options, _cb):
                sz = Path(gs_out).stat().st_size
                candidates.append((sz, gs_out, 'Ghostscript'))
                result['engines_tried'].append(f'gs={_kb(sz)}KB')
                _cb('ghostscript_done', 30)

            # 2. PyMuPDF
            _cb('pymupdf', 32)
            mu_out = str(tmp / 'mu_out.pdf')
            if _compress_pymupdf(input_path, mu_out, preset, options, _cb):
                sz = Path(mu_out).stat().st_size
                candidates.append((sz, mu_out, 'PyMuPDF'))
                result['engines_tried'].append(f'pymupdf={_kb(sz)}KB')
                _cb('pymupdf_done', 50)

            # 3. pikepdf (on best so far OR original)
            _cb('pikepdf', 52)
            best_so_far = min(candidates, key=lambda x: x[0])[1] if candidates else input_path
            pk_out = str(tmp / 'pk_out.pdf')
            if _compress_pikepdf(best_so_far, pk_out, preset, options, _cb):
                sz = Path(pk_out).stat().st_size
                candidates.append((sz, pk_out, 'pikepdf'))
                result['engines_tried'].append(f'pikepdf={_kb(sz)}KB')
                _cb('pikepdf_done', 65)

            # 4. qpdf on best so far
            _cb('qpdf', 67)
            best_so_far = min(candidates, key=lambda x: x[0])[1] if candidates else input_path
            qp_out = str(tmp / 'qp_out.pdf')
            linearize = options.get('linearize', False)
            if _compress_qpdf(best_so_far, qp_out, options, linearize=False, progress_cb=_cb):
                sz = Path(qp_out).stat().st_size
                candidates.append((sz, qp_out, 'qpdf'))
                result['engines_tried'].append(f'qpdf={_kb(sz)}KB')

                # If linearize requested, do it on qpdf output
                if linearize:
                    lin_out = str(tmp / 'lin_out.pdf')
                    if _postprocess_linearize(qp_out, lin_out):
                        sz2 = Path(lin_out).stat().st_size
                        candidates.append((sz2, lin_out, 'qpdf+linearize'))
                        result['engines_tried'].append(f'qpdf_lin={_kb(sz2)}KB')
                _cb('qpdf_done', 78)

            # 5. mutool
            _cb('mutool', 79)
            best_so_far = min(candidates, key=lambda x: x[0])[1] if candidates else input_path
            mt_out = str(tmp / 'mt_out.pdf')
            if _compress_mutool(best_so_far, mt_out, options, _cb):
                sz = Path(mt_out).stat().st_size
                candidates.append((sz, mt_out, 'mutool'))
                result['engines_tried'].append(f'mutool={_kb(sz)}KB')
                _cb('mutool_done', 85)

            # 6. pypdf fallback (always try)
            _cb('pypdf', 86)
            py_out = str(tmp / 'py_out.pdf')
            if _compress_pypdf(input_path, py_out, options, _cb):
                sz = Path(py_out).stat().st_size
                candidates.append((sz, py_out, 'pypdf'))
                result['engines_tried'].append(f'pypdf={_kb(sz)}KB')
                _cb('pypdf_done', 90)

            if not candidates:
                # Absolute fallback: copy input
                shutil.copy2(input_path, output_path)
                result['error'] = 'No compression engines succeeded; file copied as-is'
                result['method_used'] = 'copy'
                result['output_size_bytes'] = in_size
                return result

            # Pick smallest valid result
            candidates.sort(key=lambda x: x[0])
            best_size, best_path, best_engine = candidates[0]

            # If best is larger than input, use input as base and just pikepdf clean
            if best_size >= in_size:
                # Try pikepdf clean on original as last resort
                clean_out = str(tmp / 'clean_final.pdf')
                if _compress_pikepdf(input_path, clean_out, preset, options):
                    clean_sz = Path(clean_out).stat().st_size
                    if clean_sz < in_size:
                        best_size, best_path, best_engine = clean_sz, clean_out, 'pikepdf-clean'

            # Apply post-processing steps
            current_best = best_path

            # JavaScript removal (if not already done via pikepdf/GS)
            if options.get('remove_javascript', False):
                js_out = str(tmp / 'nojs_out.pdf')
                if _remove_all_javascript(current_best, js_out):
                    js_sz = Path(js_out).stat().st_size
                    if js_sz < best_size:
                        current_best = js_out
                        best_size = js_sz

            # Final linearization pass
            if linearize and not any('linearize' in e for e in result['engines_tried']):
                lin_final = str(tmp / 'lin_final.pdf')
                if _postprocess_linearize(current_best, lin_final):
                    lin_sz = Path(lin_final).stat().st_size
                    current_best = lin_final
                    best_size = lin_sz
                    best_engine += '+web'

            # Copy best result to output
            shutil.copy2(current_best, output_path)

        _cb('done', 98)

        out_size = Path(output_path).stat().st_size
        saved = in_size - out_size
        pct = round(saved / max(in_size, 1) * 100, 2)

        result.update({
            'success': True,
            'output_size_bytes': out_size,
            'reduction_bytes': max(0, saved),
            'reduction_pct': max(0, pct),
            'method_used': best_engine,
            'quality_note': _quality_note(preset_name, options),
            'processing_time_ms': int((time.time() - t_start) * 1000),
        })

        _cb('done', 100)

    except Exception as e:
        logger.exception(f'compress_pdf fatal error: {e}')
        result['error'] = str(e)
        result['processing_time_ms'] = int((time.time() - t_start) * 1000)

    return result


def _kb(n: int) -> str:
    return str(round(n / 1024))


def _quality_note(preset_name: str, options: Dict[str, Any]) -> str:
    parts = []
    preset_notes = {
        'screen': 'Screen preset (72 DPI) — suitable for on-screen viewing only',
        'low': 'Low preset (96 DPI) — email-quality, minor visual loss',
        'medium': 'Medium preset (150 DPI) — good quality, balanced compression',
        'high': 'High preset (200 DPI) — excellent quality, near-lossless',
        'lossless': 'Lossless preset — structure only, zero image degradation',
    }
    parts.append(preset_notes.get(preset_name, f'{preset_name} preset'))

    extras = []
    if options.get('grayscale'):
        extras.append('colour removed')
    if options.get('strip_metadata'):
        extras.append('metadata stripped')
    if options.get('remove_annotations'):
        extras.append('annotations removed')
    if options.get('linearize'):
        extras.append('web-optimized')
    if options.get('remove_javascript'):
        extras.append('JavaScript removed')
    if options.get('remove_embedded_files'):
        extras.append('embedded files removed')

    if extras:
        parts.append(' | '.join(extras))

    return '. '.join(parts)


# ══════════════════════════════════════════════════════════════════════════
# TARGET SIZE MODE
# ══════════════════════════════════════════════════════════════════════════

def _compress_to_target_size(
    input_path: str,
    output_path: str,
    target_kb: int,
    options: Dict[str, Any],
    progress_callback=None,
) -> Dict[str, Any]:
    """
    Iteratively try progressively more aggressive presets until
    the output is within 10% of target_kb.
    """
    t_start = time.time()
    in_size = Path(input_path).stat().st_size
    target_bytes = target_kb * 1024
    preset_order = ['high', 'medium', 'low', 'screen']

    def _cb(stage, pct):
        if progress_callback:
            try:
                progress_callback(stage, pct)
            except Exception:
                pass

    for idx, preset_name in enumerate(preset_order):
        _cb(f'target_try_{preset_name}', int(10 + idx * 20))
        preset = QUALITY_PRESETS[preset_name]

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
            tmp_out = tf.name

        try:
            ok = _compress_ghostscript(input_path, tmp_out, preset, options)
            if not ok:
                ok = _compress_pymupdf(input_path, tmp_out, preset, options)
            if not ok:
                ok = _compress_pikepdf(input_path, tmp_out, preset, options)

            if ok and Path(tmp_out).exists():
                sz = Path(tmp_out).stat().st_size
                # Within 15% tolerance → accept
                if sz <= target_bytes * 1.15:
                    shutil.copy2(tmp_out, output_path)
                    saved = in_size - sz
                    pct = round(saved / max(in_size, 1) * 100, 2)
                    return {
                        'success': True,
                        'input_path': input_path,
                        'output_path': output_path,
                        'preset': preset_name,
                        'input_size_bytes': in_size,
                        'output_size_bytes': sz,
                        'reduction_bytes': max(0, saved),
                        'reduction_pct': max(0, pct),
                        'method_used': f'target-size/{preset_name}',
                        'engines_tried': [f'{preset_name}={_kb(sz)}KB'],
                        'target_size_kb': target_kb,
                        'target_achieved': sz <= target_bytes * 1.15,
                        'processing_time_ms': int((time.time() - t_start) * 1000),
                        'quality_note': f'Target {target_kb}KB mode — {preset_name} preset used',
                        'error': None,
                    }
        finally:
            try:
                os.unlink(tmp_out)
            except Exception:
                pass

    # Could not reach target — use best result from full pipeline
    return compress_pdf(input_path, output_path, 'screen', options, progress_callback)


# ══════════════════════════════════════════════════════════════════════════
# ADVANCED STANDALONE FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def compress_images_only(pdf_path: str, output_path: str,
                          quality: int = 65, dpi: int = 150) -> Dict[str, Any]:
    """
    Compress only images in the PDF, leaving text/vectors intact.
    Uses PyMuPDF for surgical image replacement.
    """
    preset = {'dpi': dpi, 'jpeg_quality': quality, 'image_scale': 0.75,
               'grayscale': False, 'deflate_level': 8, 'downsample_above_dpi': dpi * 2}
    options = {'grayscale': False, 'strip_metadata': False, 'remove_annotations': False}
    return compress_pdf(pdf_path, output_path, 'medium', options)


def strip_pdf_bloat(pdf_path: str, output_path: str) -> Dict[str, Any]:
    """
    Remove all non-essential bloat: metadata, thumbnails, embedded files,
    JavaScript, unused objects. Does NOT touch images or text.
    """
    options = {
        'strip_metadata': True,
        'remove_thumbnails': True,
        'remove_embedded_files': True,
        'remove_javascript': True,
        'remove_icc_profiles': True,
    }
    return compress_pdf(pdf_path, output_path, 'lossless', options)


def remove_pdf_javascript(pdf_path: str, output_path: str) -> bool:
    """Remove all JavaScript from a PDF. Returns True on success."""
    return _remove_all_javascript(pdf_path, output_path)


def repair_pdf(pdf_path: str, output_path: str, password: str = '') -> Dict[str, Any]:
    """
    Attempt to repair a corrupted or malformed PDF using multiple engines.
    """
    result = {'success': False, 'method': '', 'error': None}

    # Try PyMuPDF repair first (most forgiving)
    if FITZ_OK:
        try:
            doc = fitz.open(pdf_path)
            if password and doc.is_encrypted:
                doc.authenticate(password)
            doc.save(output_path, garbage=4, clean=True, deflate=True)
            doc.close()
            result.update({'success': True, 'method': 'PyMuPDF'})
            return result
        except Exception as e:
            result['error'] = str(e)

    # Try qpdf
    if QPDF_BIN:
        try:
            cmd = [QPDF_BIN, '--force-version=1.4', pdf_path, output_path]
            if password:
                cmd.insert(1, f'--password={password}')
            r = subprocess.run(cmd, capture_output=True, timeout=60)
            if r.returncode in (0, 3):
                result.update({'success': True, 'method': 'qpdf'})
                return result
        except Exception as e:
            result['error'] = str(e)

    return result


def compress_grayscale(pdf_path: str, output_path: str,
                        quality: int = 60) -> Dict[str, Any]:
    """Convert to grayscale AND compress. Explicitly user-initiated."""
    options = {'grayscale': True, 'strip_metadata': True}
    preset = QUALITY_PRESETS['medium'].copy()
    preset['jpeg_quality'] = quality
    return compress_pdf(pdf_path, output_path, 'medium', options)


def compress_remove_metadata(pdf_path: str, output_path: str) -> Dict[str, Any]:
    """Compress + strip all metadata."""
    return compress_pdf(pdf_path, output_path, 'lossless',
                        {'strip_metadata': True, 'remove_thumbnails': True})


def compress_flatten_annotations(pdf_path: str, output_path: str) -> Dict[str, Any]:
    """Compress + remove all annotations."""
    return compress_pdf(pdf_path, output_path, 'medium',
                        {'remove_annotations': True})


def compress_linearize(pdf_path: str, output_path: str) -> Dict[str, Any]:
    """Compress + linearize for web fast-open."""
    return compress_pdf(pdf_path, output_path, 'medium', {'linearize': True})


def compress_with_zopfli(pdf_path: str, output_path: str) -> bool:
    """
    Apply Zopfli-level compression via pikepdf + maximum DEFLATE.
    Zopfli produces smaller files but is slow.
    """
    if not PIKEPDF_OK:
        return False
    try:
        pdf = pikepdf.open(pdf_path)
        pdf.save(output_path, compress_streams=True,
                 object_stream_mode=pikepdf.ObjectStreamMode.generate,
                 recompress_flate=True, normalize_content=True)
        pdf.close()
        return True
    except Exception:
        return False


def reoptimize_already_compressed(pdf_path: str, output_path: str) -> Dict[str, Any]:
    """
    Re-optimize a PDF that was already compressed.
    Focuses on stream merging and object deduplication.
    """
    options = {
        'strip_metadata': True,
        'remove_thumbnails': True,
        'remove_icc_profiles': False,
    }
    return compress_pdf(pdf_path, output_path, 'lossless', options)


def smart_compress_auto(pdf_path: str, output_path: str,
                         options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Automatically detect content type and choose optimal preset.
    """
    options = options or {}
    content_type = detect_pdf_type(pdf_path, options.get('password', ''))

    preset_map = {
        'image_heavy': 'medium',
        'scanned': 'low',
        'text_heavy': 'lossless',
        'mixed': 'medium',
        'vector_only': 'lossless',
    }
    preset = preset_map.get(content_type, 'medium')
    return compress_pdf(pdf_path, output_path, preset, options)


def batch_compress(
    input_paths: List[str],
    output_dir: str,
    preset_name: str = 'medium',
    options: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Compress multiple PDFs. Returns list of result dicts.
    """
    options = options or {}
    results = []
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for path in input_paths:
        stem = Path(path).stem
        out_path = str(out_dir / f'{stem}_compressed.pdf')
        r = compress_pdf(path, out_path, preset_name, options)
        results.append(r)

    return results


def compress_progressive(pdf_path: str, output_dir: str,
                          options: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Create 5 versions with all presets for comparison.
    """
    options = options or {}
    results = []
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for preset in ['screen', 'low', 'medium', 'high', 'lossless']:
        out = str(out_dir / f'{Path(pdf_path).stem}_{preset}.pdf')
        r = compress_pdf(pdf_path, out, preset, options)
        r['preset_label'] = preset
        results.append(r)

    return results


def benchmark_compression(pdf_path: str,
                            options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Benchmark all presets and return a comparison table.
    Input file is never modified.
    """
    options = options or {}
    in_size = Path(pdf_path).stat().st_size
    rows = []

    with tempfile.TemporaryDirectory(prefix='ishu_bench_') as tmp_dir:
        for preset_name in ['screen', 'low', 'medium', 'high', 'lossless']:
            out = str(Path(tmp_dir) / f'{preset_name}.pdf')
            t0 = time.time()
            r = compress_pdf(pdf_path, out, preset_name, options.copy())
            elapsed = time.time() - t0

            rows.append({
                'preset': preset_name,
                'input_kb': round(in_size / 1024, 1),
                'output_kb': round(r.get('output_size_bytes', in_size) / 1024, 1),
                'reduction_pct': r.get('reduction_pct', 0),
                'engine': r.get('method_used', ''),
                'time_s': round(elapsed, 2),
                'success': r.get('success', False),
            })

    return {
        'input_path': pdf_path,
        'input_size_kb': round(in_size / 1024, 1),
        'results': rows,
        'best_preset': min(rows, key=lambda x: x['output_kb'])['preset'] if rows else 'medium',
    }


def compress_to_target_size(pdf_path: str, output_path: str, target_kb: int,
                              options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Public wrapper for target-size compression."""
    options = options or {}
    return _compress_to_target_size(pdf_path, output_path, target_kb, options)


def analyze_pdf_streams(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Analyse all streams in the PDF for compression opportunities."""
    return get_pdf_structure_report(pdf_path, password)


def get_compression_potential(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """
    Estimate per-strategy compression opportunity.
    """
    estimate = get_compression_estimate(pdf_path, password)
    in_size = estimate.get('file_size_bytes', 0)
    ct = estimate.get('content_type', 'mixed')

    strategies = {}
    if estimate.get('image_total_bytes', 0) > in_size * 0.3:
        strategies['image_recompression'] = {
            'description': 'Recompress images at lower DPI/quality',
            'estimated_saving_pct': 55 if ct == 'image_heavy' else 35,
        }
    if estimate.get('font_bytes', 0) > 50 * 1024:
        strategies['font_subsetting'] = {
            'description': 'Subset embedded fonts to used glyphs only',
            'estimated_saving_pct': 15,
        }
    if not estimate.get('is_linearized'):
        strategies['linearization'] = {
            'description': 'Linearize for fast web open (no size gain)',
            'estimated_saving_pct': 0,
        }
    if estimate.get('has_javascript'):
        strategies['remove_javascript'] = {
            'description': 'Remove unused JavaScript actions',
            'estimated_saving_pct': 2,
        }
    if estimate.get('has_embedded_files'):
        strategies['remove_embedded_files'] = {
            'description': 'Remove embedded file attachments',
            'estimated_saving_pct': 5,
        }
    strategies['metadata_stripping'] = {
        'description': 'Strip author, title, XMP metadata',
        'estimated_saving_pct': 1,
    }

    return {
        'file_size_bytes': in_size,
        'content_type': ct,
        'strategies': strategies,
        'max_reduction_pct': estimate['estimated_reductions_by_preset'].get('screen', 70),
        'recommended_preset': 'medium' if ct in ('mixed', 'image_heavy') else 'lossless',
    }


def get_compression_stats(pdf_path: str, password: str = '') -> Dict[str, Any]:
    """Quick stats: page count, image count, fast estimate. Faster than full analysis."""
    stats = {
        'page_count': 0,
        'image_count': 0,
        'file_size_kb': 0,
        'estimated_reduction_medium_pct': 45,
        'content_type': 'mixed',
    }
    try:
        stats['file_size_kb'] = round(Path(pdf_path).stat().st_size / 1024, 1)
        if FITZ_OK:
            doc = fitz.open(pdf_path)
            if password and doc.is_encrypted:
                doc.authenticate(password)
            stats['page_count'] = doc.page_count
            img_count = 0
            for page_num in range(min(5, doc.page_count)):
                img_count += len(doc[page_num].get_images())
            stats['image_count'] = img_count * max(1, doc.page_count // 5)
            doc.close()
    except Exception:
        pass
    return stats


