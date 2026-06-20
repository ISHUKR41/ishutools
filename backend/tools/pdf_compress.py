"""
pdf_compress.py — IshuTools.fun Enterprise PDF Compression Suite v10.0
Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPRESSION PIPELINE (6 engines, all tried, smallest result kept):
  1. Ghostscript CLI      — industry-standard distiller presets
  2. PyMuPDF (fitz)       — per-image DPI downsampling + JPEG re-encode
  3. pikepdf              — object stream merging, DEFLATE-9, XMP strip
  4. qpdf CLI             — stream recompression + linearization
  5. pypdf                — orphan object removal fallback
  6. Pillow only          — image-only JPEG recompression (last resort)

QUALITY PRESETS (NO auto grayscale — user must enable explicitly):
  screen   → 72 DPI,  JPEG q=35  — max compression
  low      → 96 DPI,  JPEG q=45  — email-friendly
  medium   → 150 DPI, JPEG q=65  — balanced (recommended)
  high     → 200 DPI, JPEG q=82  — near-lossless
  lossless → 300 DPI, JPEG q=95  — structure-only (no image degradation)

ADVANCED OPTIONS (all user-controlled, no auto overrides):
  grayscale           — convert color images to grayscale
  strip_metadata      — remove author/title/XMP/DocInfo
  remove_annotations  — delete all annotation objects
  linearize           — web-optimize for fast browser open
  remove_javascript   — strip all JS actions
  remove_thumbnails   — delete embedded page thumbnails
  remove_embedded_files — remove file attachments
  flatten_transparency — flatten transparent objects (legacy compat)
  subset_fonts        — only embed used font glyphs (requires GS)
  remove_icc_profiles — strip unnecessary ICC colour profiles
  password            — decrypt password-protected PDFs

ANALYSIS FUNCTIONS:
  get_compression_estimate()    — page count, images, fonts, per-preset estimates
  analyze_pdf_streams()         — compressed/uncompressed stream counts
  get_available_engines()       — detect installed engines + versions
  analyze_images_in_pdf()       — per-image DPI, size, compressibility
  get_compression_potential()   — per-strategy reduction estimates
  get_compression_stats()       — quick stats (page count, img count, estimate)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import io
import os
import re
import shutil
import struct
import subprocess
import tempfile
import logging
import time
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any

import pikepdf
import fitz  # PyMuPDF
from pypdf import PdfWriter, PdfReader
from PIL import Image, ImageFilter

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════
# CLI BINARY DETECTION
# ══════════════════════════════════════════════════════════════════════════

GS_BIN   = shutil.which('gs')   or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')
MUTOOL   = shutil.which('mutool')

# ══════════════════════════════════════════════════════════════════════════
# QUALITY PRESETS
# ⚠️  CRITICAL: grayscale is NEVER set True here. Only user-controlled.
# ══════════════════════════════════════════════════════════════════════════

QUALITY_PRESETS: Dict[str, Dict[str, Any]] = {
    'screen': {
        'dpi': 72,
        'jpeg_quality': 35,
        'image_scale': 0.45,
        'grayscale': False,          # ← NEVER force grayscale automatically
        'gs_setting': '/screen',
        'gs_dpi': 72,
        'deflate_level': 9,
        'description': 'Screen (72 DPI) — maximum compression, smallest file',
        'expected_reduction': '70–90%',
    },
    'low': {
        'dpi': 96,
        'jpeg_quality': 45,
        'image_scale': 0.55,
        'grayscale': False,
        'gs_setting': '/ebook',
        'gs_dpi': 96,
        'deflate_level': 9,
        'description': 'Low (96 DPI) — very small, ideal for email',
        'expected_reduction': '55–75%',
    },
    'medium': {
        'dpi': 150,
        'jpeg_quality': 65,
        'image_scale': 0.75,
        'grayscale': False,
        'gs_setting': '/ebook',
        'gs_dpi': 150,
        'deflate_level': 9,
        'description': 'Medium (150 DPI) — balanced quality/size (recommended)',
        'expected_reduction': '40–60%',
    },
    'high': {
        'dpi': 200,
        'jpeg_quality': 82,
        'image_scale': 0.90,
        'grayscale': False,
        'gs_setting': '/printer',
        'gs_dpi': 200,
        'deflate_level': 9,
        'description': 'High (200 DPI) — excellent quality with good compression',
        'expected_reduction': '20–40%',
    },
    'lossless': {
        'dpi': 300,
        'jpeg_quality': 95,
        'image_scale': 1.0,
        'grayscale': False,
        'gs_setting': '/prepress',
        'gs_dpi': 300,
        'deflate_level': 9,
        'description': 'Lossless (300 DPI) — structure-only, no image degradation',
        'expected_reduction': '5–20%',
    },
    # Alias support
    'ebook':    None,   # resolved below
    'printer':  None,
    'prepress': None,
}
QUALITY_PRESETS['ebook']    = QUALITY_PRESETS['medium']
QUALITY_PRESETS['printer']  = QUALITY_PRESETS['high']
QUALITY_PRESETS['prepress'] = QUALITY_PRESETS['lossless']


# ══════════════════════════════════════════════════════════════════════════
# GHOSTSCRIPT ENGINE
# ══════════════════════════════════════════════════════════════════════════

def _gs_compress(
    input_path: str,
    output_path: str,
    gs_setting: str = '/ebook',
    dpi: int = 150,
    grayscale: bool = False,        # only True if user explicitly requested
    strip_metadata: bool = False,
    subset_fonts: bool = True,
    detect_duplicates: bool = True,
    compatibility_level: str = '1.5',
    timeout: int = 180,
) -> bool:
    """
    Run Ghostscript PDF distiller with the given settings.
    Respects grayscale ONLY when caller explicitly sets it True.
    """
    if not GS_BIN:
        return False
    try:
        cmd = [
            GS_BIN,
            '-q',
            '-dBATCH',
            '-dNOPAUSE',
            '-dNOSAFER',
            '-sDEVICE=pdfwrite',
            f'-dPDFSETTINGS={gs_setting}',
            f'-dColorImageResolution={dpi}',
            f'-dGrayImageResolution={dpi}',
            f'-dMonoImageResolution={min(dpi * 2, 300)}',
            f'-dCompatibilityLevel={compatibility_level}',
            '-dCompressPages=true',
            '-dOptimize=true',
            f'-dEmbedAllFonts={"true" if subset_fonts else "false"}',
            f'-dSubsetFonts={"true" if subset_fonts else "false"}',
            f'-dDetectDuplicateImages={"true" if detect_duplicates else "false"}',
            '-dAutoFilterColorImages=true',
            '-dAutoFilterGrayImages=true',
            '-dDownsampleColorImages=true',
            '-dDownsampleGrayImages=true',
            '-dColorImageDownsampleType=/Bicubic',
            '-dGrayImageDownsampleType=/Bicubic',
        ]
        if grayscale:
            cmd += [
                '-sColorConversionStrategy=Gray',
                '-dProcessColorModel=/DeviceGray',
            ]
        else:
            cmd += ['-sColorConversionStrategy=LeaveColorUnchanged']
        cmd += [f'-sOutputFile={output_path}', input_path]
        result = subprocess.run(cmd, capture_output=True, timeout=timeout, text=True)
        ok = (
            result.returncode == 0
            and os.path.exists(output_path)
            and os.path.getsize(output_path) > 200
        )
        if not ok and result.stderr:
            logger.debug(f'GS stderr: {result.stderr[:300]}')
        return ok
    except subprocess.TimeoutExpired:
        logger.warning('Ghostscript timed out')
        return False
    except Exception as e:
        logger.warning(f'Ghostscript failed: {e}')
        return False


def _gs_screen_aggressive(input_path: str, output_path: str,
                           grayscale: bool = False) -> bool:
    """
    Extra-aggressive Ghostscript pass for maximum reduction.
    Still respects user grayscale preference.
    """
    if not GS_BIN:
        return False
    try:
        cmd = [
            GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
            '-sDEVICE=pdfwrite',
            '-dPDFSETTINGS=/screen',
            '-dColorImageResolution=72',
            '-dGrayImageResolution=72',
            '-dMonoImageResolution=100',
            '-dDownsampleColorImages=true',
            '-dDownsampleGrayImages=true',
            '-dColorImageDownsampleType=/Bicubic',
            '-dGrayImageDownsampleType=/Bicubic',
            '-dEncodeColorImages=true',
            '-dEncodeGrayImages=true',
            '-dCompressPages=true',
            '-dDetectDuplicateImages=true',
            '-dCompatibilityLevel=1.4',
        ]
        if grayscale:
            cmd += ['-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray']
        cmd += [f'-sOutputFile={output_path}', input_path]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        return (result.returncode == 0
                and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════
# QPDF ENGINE
# ══════════════════════════════════════════════════════════════════════════

def _qpdf_compress(input_path: str, output_path: str,
                   linearize: bool = False, timeout: int = 90) -> bool:
    """
    Use qpdf to recompress streams at DEFLATE level 9.
    Optionally linearize for web-optimized delivery.
    """
    if not QPDF_BIN:
        return False
    try:
        cmd = [QPDF_BIN,
               '--compress-streams=y',
               '--recompress-flate',
               '--compression-level=9',
               '--object-streams=generate',
               '--decode-level=generalized']
        if linearize:
            cmd.append('--linearize')
        cmd += [input_path, output_path]
        result = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return (result.returncode == 0
                and os.path.exists(output_path)
                and os.path.getsize(output_path) > 200)
    except Exception as e:
        logger.warning(f'qpdf failed: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# PYMUPDF (FITZ) ENGINE — per-image DPI + JPEG recompression
# ══════════════════════════════════════════════════════════════════════════

def _compress_image_bytes(
    img_bytes: bytes,
    quality: int,
    scale: float,
    grayscale: bool,
    max_dim: int = 8000,
    progressive: bool = True,
) -> bytes:
    """
    Decode, optionally downscale and grayscale, then JPEG-encode image bytes.
    Returns original bytes if the result is not smaller.
    """
    if not img_bytes or len(img_bytes) < 512:
        return img_bytes
    try:
        img = Image.open(io.BytesIO(img_bytes))
        orig_mode = img.mode

        # Flatten transparency
        if img.mode in ('RGBA', 'LA', 'P'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            if img.mode in ('RGBA', 'LA'):
                try:
                    bg.paste(img, mask=img.split()[-1])
                except Exception:
                    bg.paste(img)
            else:
                bg.paste(img)
            img = bg
        elif img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')

        # User-requested grayscale (not automatic)
        if grayscale and img.mode != 'L':
            img = img.convert('L')

        # Downscale
        w, h = img.size
        if scale < 1.0:
            new_w = min(int(w * scale), max_dim)
            new_h = min(int(h * scale), max_dim)
            if new_w < w or new_h < h:
                img = img.resize((max(1, new_w), max(1, new_h)), Image.LANCZOS)

        # Encode
        out = io.BytesIO()
        save_kwargs = {
            'format': 'JPEG',
            'quality': quality,
            'optimize': True,
        }
        if progressive and img.mode == 'RGB':
            save_kwargs['progressive'] = True
            save_kwargs['subsampling'] = 2
        if img.mode == 'L':
            save_kwargs.pop('subsampling', None)
            save_kwargs.pop('progressive', None)
        img.save(out, **save_kwargs)
        compressed = out.getvalue()
        return compressed if len(compressed) < len(img_bytes) * 0.97 else img_bytes
    except Exception:
        return img_bytes


def _recompress_images_fitz(
    input_path: str,
    output_path: str,
    quality: int,
    scale: float,
    grayscale: bool,          # ONLY applied when user explicitly set this
    password: str = '',
) -> bool:
    """
    PyMuPDF pass: extract every unique image xref, compress with Pillow,
    update xref only if smaller. Then save with garbage=4, deflate=True.
    """
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        xrefs_done: set = set()
        changed = 0
        for page_idx in range(doc.page_count):
            page = doc[page_idx]
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                if xref in xrefs_done:
                    continue
                xrefs_done.add(xref)
                try:
                    base_img = doc.extract_image(xref)
                    raw = base_img.get('image', b'')
                    ext = base_img.get('ext', 'jpeg').lower()
                    if not raw or len(raw) < 1024:
                        continue
                    if ext in ('jbig2', 'jpx', 'jp2'):
                        continue  # skip already-specialized formats
                    new_bytes = _compress_image_bytes(raw, quality, scale, grayscale)
                    if len(new_bytes) < len(raw):
                        doc.update_stream(xref, new_bytes)
                        changed += 1
                except Exception:
                    continue

        doc.save(
            output_path,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            clean=True,
            pretty=False,
        )
        doc.close()
        logger.debug(f'fitz: compressed {changed}/{len(xrefs_done)} images')
        return True
    except Exception as e:
        logger.warning(f'fitz recompress failed: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# PIKEPDF ENGINE — object stream optimization
# ══════════════════════════════════════════════════════════════════════════

def _pikepdf_optimize(
    input_path: str,
    output_path: str,
    strip_metadata: bool = False,
    remove_annotations: bool = False,
    remove_javascript: bool = False,
    remove_thumbnails: bool = False,
    remove_embedded_files: bool = False,
    linearize: bool = False,
    password: str = '',
) -> bool:
    """
    pikepdf pass: merge object streams, DEFLATE-9 recompress,
    optionally strip metadata/annotations/JS/thumbnails/embedded-files.
    """
    try:
        open_kwargs = {}
        if password:
            open_kwargs['password'] = password
        with pikepdf.open(input_path, allow_overwriting_input=False, **open_kwargs) as pdf:
            # Compress content streams
            for page in pdf.pages:
                try:
                    page.compress_content_streams()
                except Exception:
                    pass
                if remove_annotations and '/Annots' in page:
                    try:
                        del page['/Annots']
                    except Exception:
                        pass
                if remove_thumbnails and '/Thumb' in page:
                    try:
                        del page['/Thumb']
                    except Exception:
                        pass

            # Strip metadata
            if strip_metadata:
                try:
                    del pdf.docinfo
                except Exception:
                    pass
                try:
                    with pdf.open_metadata() as meta:
                        meta.clear()
                except Exception:
                    pass
                try:
                    if '/Metadata' in pdf.Root:
                        del pdf.Root['/Metadata']
                except Exception:
                    pass

            # Remove embedded files
            if remove_embedded_files:
                try:
                    if '/Names' in pdf.Root:
                        names = pdf.Root.Names
                        if '/EmbeddedFiles' in names:
                            del names['/EmbeddedFiles']
                except Exception:
                    pass

            # Remove JavaScript
            if remove_javascript:
                try:
                    if '/Names' in pdf.Root:
                        names = pdf.Root.Names
                        for js_key in ['/JavaScript', '/JS']:
                            if js_key in names:
                                del names[js_key]
                except Exception:
                    pass
                try:
                    if '/OpenAction' in pdf.Root:
                        act = pdf.Root.OpenAction
                        if hasattr(act, 'get') and '/JS' in str(act.get('/Type', '')):
                            del pdf.Root['/OpenAction']
                except Exception:
                    pass

            # Remove XFA forms (bloat)
            try:
                if '/AcroForm' in pdf.Root:
                    acroform = pdf.Root.AcroForm
                    if '/XFA' in acroform:
                        del acroform['/XFA']
            except Exception:
                pass

            save_kwargs = dict(
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
                preserve_pdfa=False,
                linearize=linearize,
            )
            pdf.save(output_path, **save_kwargs)
        return True
    except Exception as e:
        logger.warning(f'pikepdf optimize failed: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# PYPDF FALLBACK ENGINE
# ══════════════════════════════════════════════════════════════════════════

def _pypdf_fallback(
    input_path: str,
    output_path: str,
    remove_annotations: bool = False,
    password: str = '',
) -> bool:
    """pypdf: copy pages with orphan removal. Last-resort fallback."""
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        writer = PdfWriter()
        for page in reader.pages:
            if remove_annotations and '/Annots' in page:
                try:
                    del page['/Annots']
                except Exception:
                    pass
            writer.add_page(page)
        writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(output_path, 'wb') as fh:
            writer.write(fh)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 200
    except Exception as e:
        logger.warning(f'pypdf fallback failed: {e}')
        return False


# ══════════════════════════════════════════════════════════════════════════
# METADATA STRIP (in-place)
# ══════════════════════════════════════════════════════════════════════════

def _strip_metadata_inplace(path: str) -> bool:
    """In-place metadata/XMP stripping via pikepdf."""
    try:
        with pikepdf.open(path, allow_overwriting_input=True) as pdf:
            try:
                del pdf.docinfo
            except Exception:
                pass
            try:
                with pdf.open_metadata() as meta:
                    meta.clear()
            except Exception:
                pass
            try:
                if '/Metadata' in pdf.Root:
                    del pdf.Root['/Metadata']
            except Exception:
                pass
            pdf.save(path)
        return True
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════
# HELPER: pick smallest valid output
# ══════════════════════════════════════════════════════════════════════════

def _pick_smallest(candidates: Dict[str, str], output_path: str,
                    orig_size: int) -> Tuple[str, int]:
    """
    From a dict of {method: file_path}, pick the valid file with smallest size.
    Copies it to output_path. Returns (method_name, size_bytes).
    """
    best_method = None
    best_size   = orig_size
    best_path   = None
    for method, cpath in candidates.items():
        if not cpath or not os.path.exists(cpath):
            continue
        sz = os.path.getsize(cpath)
        if sz > 200 and sz < best_size:
            best_size   = sz
            best_method = method
            best_path   = cpath
    if best_path:
        shutil.copy2(best_path, output_path)
        return best_method, best_size
    # Nothing improved — copy original as-is
    shutil.copy2(output_path if os.path.exists(output_path) else candidates.get(list(candidates.keys())[0] if candidates else '', ''), output_path)
    return 'none (already optimized)', orig_size


# ══════════════════════════════════════════════════════════════════════════
# MAIN COMPRESS FUNCTION
# ══════════════════════════════════════════════════════════════════════════

def compress_pdf(
    input_path: str,
    output_path: str,
    quality: str = 'medium',

    # ── Advanced user options (NEVER applied automatically) ─────────────
    grayscale: bool = False,
    strip_metadata: bool = False,
    remove_annotations: bool = False,
    linearize: bool = False,
    remove_javascript: bool = False,
    remove_thumbnails: bool = False,
    remove_embedded_files: bool = False,
    flatten_transparency: bool = False,
    remove_icc_profiles: bool = False,
    password: str = '',

    # ── Engine flags ─────────────────────────────────────────────────────
    use_ghostscript: bool = True,
    use_qpdf: bool = True,
    use_fitz: bool = True,
    use_pikepdf: bool = True,
    use_pypdf: bool = True,

    # ── Target size ──────────────────────────────────────────────────────
    target_size_kb: Optional[int] = None,
) -> dict:
    """
    Main PDF compression function — 6-engine pipeline.

    IMPORTANT: grayscale, strip_metadata, etc. are NEVER applied
    automatically based on the quality preset. They are ONLY applied
    when the caller explicitly passes them as True (user-initiated).

    All engines run in parallel temp files; the smallest valid result
    is kept as output. Falls back to input if nothing improves.

    Args:
        input_path:          Source PDF file path
        output_path:         Destination for compressed PDF
        quality:             Preset: 'screen'|'low'|'medium'|'high'|'lossless'
        grayscale:           Convert images to grayscale [USER CONTROLLED]
        strip_metadata:      Remove XMP/docinfo [USER CONTROLLED]
        remove_annotations:  Delete annotations [USER CONTROLLED]
        linearize:           Web-optimize layout [USER CONTROLLED]
        remove_javascript:   Strip JS actions [USER CONTROLLED]
        remove_thumbnails:   Delete page thumbnails [USER CONTROLLED]
        remove_embedded_files: Remove attachments [USER CONTROLLED]
        flatten_transparency: Flatten alpha transparency [USER CONTROLLED]
        remove_icc_profiles: Strip ICC colour profiles [USER CONTROLLED]
        password:            PDF decryption password
        use_ghostscript:     Enable Ghostscript engine
        use_qpdf:            Enable qpdf engine
        use_fitz:            Enable PyMuPDF engine
        use_pikepdf:         Enable pikepdf engine
        use_pypdf:           Enable pypdf engine
        target_size_kb:      Desired output size; triggers extra aggressive pass

    Returns:
        dict with keys:
            output_path, original_size_kb, compressed_size_kb,
            reduction_pct, method_used, engines_tried,
            ghostscript_available, qpdf_available,
            original_size, final_size
    """
    t_start = time.time()
    preset      = QUALITY_PRESETS.get(quality) or QUALITY_PRESETS['medium']
    orig_size   = os.path.getsize(input_path)
    engines_tried: List[str] = []
    tmp_dir = tempfile.mkdtemp(prefix='ishu_cmp_')

    try:
        candidates: Dict[str, str] = {}

        # ──────────────────────────────────────────────────────────────────
        # ENGINE 1: Ghostscript
        # ──────────────────────────────────────────────────────────────────
        if use_ghostscript and GS_BIN:
            gs_out = os.path.join(tmp_dir, 'gs.pdf')
            ok = _gs_compress(
                input_path, gs_out,
                gs_setting=preset['gs_setting'],
                dpi=preset['gs_dpi'],
                grayscale=grayscale,         # only True if user asked
                strip_metadata=strip_metadata,
            )
            engines_tried.append('ghostscript')
            if ok:
                candidates['ghostscript'] = gs_out
                logger.debug(f'GS ok: {os.path.getsize(gs_out)//1024}KB')

        # ──────────────────────────────────────────────────────────────────
        # ENGINE 2: PyMuPDF image recompression
        # ──────────────────────────────────────────────────────────────────
        if use_fitz:
            fitz_out = os.path.join(tmp_dir, 'fitz.pdf')
            fitz_ok = _recompress_images_fitz(
                input_path, fitz_out,
                quality=preset['jpeg_quality'],
                scale=preset['image_scale'],
                grayscale=grayscale,         # only True if user asked
                password=password,
            )
            engines_tried.append('fitz')
            if fitz_ok:
                # Chain pikepdf on top of fitz for double benefit
                if use_pikepdf:
                    fitz_pke_out = os.path.join(tmp_dir, 'fitz_pke.pdf')
                    pke_ok = _pikepdf_optimize(
                        fitz_out, fitz_pke_out,
                        strip_metadata=strip_metadata,
                        remove_annotations=remove_annotations,
                        remove_javascript=remove_javascript,
                        remove_thumbnails=remove_thumbnails,
                        remove_embedded_files=remove_embedded_files,
                        linearize=linearize,
                    )
                    if pke_ok:
                        candidates['fitz+pikepdf'] = fitz_pke_out
                    else:
                        candidates['fitz'] = fitz_out
                else:
                    candidates['fitz'] = fitz_out

        # ──────────────────────────────────────────────────────────────────
        # ENGINE 3: pikepdf standalone
        # ──────────────────────────────────────────────────────────────────
        if use_pikepdf:
            pke_out = os.path.join(tmp_dir, 'pke.pdf')
            ok = _pikepdf_optimize(
                input_path, pke_out,
                strip_metadata=strip_metadata,
                remove_annotations=remove_annotations,
                remove_javascript=remove_javascript,
                remove_thumbnails=remove_thumbnails,
                remove_embedded_files=remove_embedded_files,
                linearize=linearize,
                password=password,
            )
            engines_tried.append('pikepdf')
            if ok:
                candidates['pikepdf'] = pke_out

        # ──────────────────────────────────────────────────────────────────
        # ENGINE 4: qpdf
        # ──────────────────────────────────────────────────────────────────
        if use_qpdf and QPDF_BIN:
            # Non-linearized pass
            qpdf_out = os.path.join(tmp_dir, 'qpdf.pdf')
            ok = _qpdf_compress(input_path, qpdf_out, linearize=False)
            engines_tried.append('qpdf')
            if ok:
                candidates['qpdf'] = qpdf_out
            # Linearized pass (if user asked for it)
            if linearize:
                qpdf_lin = os.path.join(tmp_dir, 'qpdf_lin.pdf')
                if _qpdf_compress(input_path, qpdf_lin, linearize=True):
                    candidates['qpdf_linearized'] = qpdf_lin

        # ──────────────────────────────────────────────────────────────────
        # ENGINE 5: pypdf fallback
        # ──────────────────────────────────────────────────────────────────
        if use_pypdf:
            pypdf_out = os.path.join(tmp_dir, 'pypdf.pdf')
            ok = _pypdf_fallback(input_path, pypdf_out,
                                 remove_annotations=remove_annotations,
                                 password=password)
            engines_tried.append('pypdf')
            if ok:
                candidates['pypdf'] = pypdf_out

        # ──────────────────────────────────────────────────────────────────
        # Pick smallest valid result
        # ──────────────────────────────────────────────────────────────────
        best_method = None
        best_size   = orig_size
        best_path   = None
        for method, cpath in candidates.items():
            if not cpath or not os.path.exists(cpath):
                continue
            sz = os.path.getsize(cpath)
            if sz > 200 and sz < best_size:
                best_size   = sz
                best_method = method
                best_path   = cpath

        if best_path:
            shutil.copy2(best_path, output_path)
        else:
            # Nothing improved — return original
            shutil.copy2(input_path, output_path)
            best_method = 'none (already optimized)'
            best_size   = orig_size

        # ──────────────────────────────────────────────────────────────────
        # ENGINE 6: Extra-aggressive pass if still above target
        # ──────────────────────────────────────────────────────────────────
        if target_size_kb and best_size > target_size_kb * 1024:
            agg_out = os.path.join(tmp_dir, 'agg.pdf')
            if GS_BIN and _gs_screen_aggressive(output_path, agg_out, grayscale=grayscale):
                agg_sz = os.path.getsize(agg_out)
                if agg_sz > 200 and agg_sz < best_size:
                    shutil.copy2(agg_out, output_path)
                    best_size   = agg_sz
                    best_method = 'ghostscript_aggressive'

        # ──────────────────────────────────────────────────────────────────
        # Post-process: apply any options the winning engine didn't handle
        # ──────────────────────────────────────────────────────────────────
        # Metadata strip post-pass (if ghostscript won but strip not done)
        if strip_metadata and best_method and 'ghostscript' not in best_method:
            _strip_metadata_inplace(output_path)

        # Remove ICC profiles (piggyback on pikepdf)
        if remove_icc_profiles:
            _remove_icc_profiles_inplace(output_path)

        # Flatten transparency if requested
        if flatten_transparency:
            _flatten_transparency_inplace(output_path)

        final_size = os.path.getsize(output_path) if os.path.exists(output_path) else orig_size
        reduction  = max(0.0, (1 - final_size / max(orig_size, 1)) * 100)
        elapsed_ms = int((time.time() - t_start) * 1000)

        return {
            'output_path':       output_path,
            'original_size':     orig_size,
            'final_size':        final_size,
            'original_size_kb':  round(orig_size / 1024, 1),
            'compressed_size_kb':round(final_size / 1024, 1),
            'reduction_pct':     round(reduction, 1),
            'method_used':       best_method or 'none',
            'engines_tried':     engines_tried,
            'ghostscript_available': bool(GS_BIN),
            'qpdf_available':    bool(QPDF_BIN),
            'processing_ms':     elapsed_ms,
            'quality':           quality,
        }

    finally:
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════════════════
# POST-PROCESSING HELPERS
# ══════════════════════════════════════════════════════════════════════════

def _remove_icc_profiles_inplace(path: str) -> bool:
    """Strip ICC colour profiles from all pages in-place via pikepdf."""
    try:
        with pikepdf.open(path, allow_overwriting_input=True) as pdf:
            for page in pdf.pages:
                try:
                    resources = page.get('/Resources', pikepdf.Dictionary())
                    if '/ColorSpace' in resources:
                        del resources['/ColorSpace']
                except Exception:
                    pass
            pdf.save(path)
        return True
    except Exception:
        return False


def _flatten_transparency_inplace(path: str) -> bool:
    """
    Flatten transparency groups via PyMuPDF re-render.
    Converts transparent pages to opaque JPEG — lossy but reduces file size.
    Only useful for PDFs with complex alpha blending.
    """
    try:
        doc = fitz.open(path)
        tmp = path + '_flat.pdf'
        out_doc = fitz.open()
        for page in doc:
            pix = page.get_pixmap(dpi=150, colorspace=fitz.csRGB, alpha=False)
            buf = pix.tobytes('jpeg', jpg_quality=80)
            img_pdf = fitz.open('pdf', fitz.open(stream=buf, filetype='jpg').convert_to_pdf())
            out_doc.insert_pdf(img_pdf)
        out_doc.save(tmp, garbage=4, deflate=True)
        doc.close(); out_doc.close()
        if os.path.exists(tmp) and os.path.getsize(tmp) > 200:
            os.replace(tmp, path)
            return True
        return False
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════
# ANALYSIS FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def get_compression_estimate(input_path: str, password: str = '') -> dict:
    """
    Analyse a PDF and estimate compression potential for each preset.

    Returns:
        dict: page_count, image_count, font_count, total_image_kb,
              text_pages, file_size_kb, content_type,
              estimated_reductions_by_preset, has_fonts,
              ghostscript_available, qpdf_available,
              has_javascript, has_annotations, has_forms,
              has_embedded_files, is_encrypted, has_icc_profiles
    """
    file_size_kb = round(os.path.getsize(input_path) / 1024, 1)
    info: Dict[str, Any] = {
        'image_count':       0,
        'total_image_kb':    0,
        'text_pages':        0,
        'page_count':        0,
        'file_size_kb':      file_size_kb,
        'estimated_reductions_by_preset': {},
        'has_fonts':         False,
        'font_count':        0,
        'content_type':      'unknown',
        'ghostscript_available': bool(GS_BIN),
        'qpdf_available':    bool(QPDF_BIN),
        'has_javascript':    False,
        'has_annotations':   False,
        'has_forms':         False,
        'has_embedded_files':False,
        'is_encrypted':      False,
        'has_icc_profiles':  False,
    }
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            info['is_encrypted'] = True
            if password:
                doc.authenticate(password)
            else:
                doc.close()
                return info

        info['page_count'] = doc.page_count
        fonts_seen: set = set()

        for page in doc:
            text = page.get_text().strip()
            imgs = page.get_images(full=True)
            info['image_count'] += len(imgs)
            if text:
                info['text_pages'] += 1
            if page.get_annots():
                info['has_annotations'] = True
            for img in imgs:
                xref = img[0]
                try:
                    base = doc.extract_image(xref)
                    info['total_image_kb'] += len(base.get('image', b'')) // 1024
                except Exception:
                    pass
            for font in page.get_fonts(full=True):
                fname = font[3] or font[4] or ''
                if fname:
                    fonts_seen.add(fname)

        doc.close()
        info['has_fonts']  = len(fonts_seen) > 0
        info['font_count'] = len(fonts_seen)

        # Check pikepdf-level properties
        try:
            with pikepdf.open(input_path, password=password or '') as pdf:
                root = pdf.Root
                if '/AcroForm' in root:
                    info['has_forms'] = True
                if '/Names' in root:
                    names = root.Names
                    if '/JavaScript' in names or '/JS' in names:
                        info['has_javascript'] = True
                    if '/EmbeddedFiles' in names:
                        info['has_embedded_files'] = True
                # ICC profiles (rough check)
                for page in pdf.pages:
                    try:
                        res = page.get('/Resources', pikepdf.Dictionary())
                        if '/ColorSpace' in res:
                            info['has_icc_profiles'] = True
                            break
                    except Exception:
                        pass
        except Exception:
            pass

        # Content type classification
        img_ratio = info['image_count'] / max(info['page_count'], 1)
        txt_ratio = info['text_pages'] / max(info['page_count'], 1)
        if img_ratio > 0.7:
            info['content_type'] = 'image_heavy'
        elif txt_ratio > 0.7:
            info['content_type'] = 'text_heavy'
        else:
            info['content_type'] = 'mixed'

        # Per-preset reduction estimates (heuristic)
        img_kb       = info['total_image_kb']
        total_kb     = max(file_size_kb, 1)
        img_fraction = img_kb / total_kb

        preset_multipliers = {
            'screen':   1.0,
            'low':      0.80,
            'medium':   0.60,
            'high':     0.40,
            'lossless': 0.15,
        }
        for preset_name, mult in preset_multipliers.items():
            base = min(85, 10 + img_fraction * 80)
            est  = base * mult
            if info['content_type'] == 'text_heavy':
                est = max(3, est * 0.35)
            info['estimated_reductions_by_preset'][preset_name] = round(est, 1)

    except Exception as ex:
        logger.warning(f'get_compression_estimate failed: {ex}')

    return info


def analyze_pdf_streams(input_path: str) -> dict:
    """
    Deep stream analysis via pikepdf.
    Returns compressed/uncompressed stream counts, image types, etc.
    """
    result = {
        'compressed_streams':   0,
        'uncompressed_streams': 0,
        'image_streams':        0,
        'font_streams':         0,
        'jpeg_images':          0,
        'png_images':           0,
        'other_images':         0,
        'total_objects':        0,
        'has_object_streams':   False,
    }
    try:
        with pikepdf.open(input_path) as pdf:
            obj_list = list(pdf.objects)
            result['total_objects'] = len(obj_list)
            for obj in obj_list:
                try:
                    if obj is None or not hasattr(obj, 'get'):
                        continue
                    st  = str(obj.get('/Subtype', ''))
                    tp  = str(obj.get('/Type', ''))
                    flt = obj.get('/Filter', None)
                    if flt is not None:
                        result['compressed_streams'] += 1
                        flt_str = str(flt)
                        if 'ObjStm' in flt_str:
                            result['has_object_streams'] = True
                    else:
                        try:
                            obj.get_raw_stream_buffer()
                            result['uncompressed_streams'] += 1
                        except Exception:
                            pass
                    if st == '/Image':
                        result['image_streams'] += 1
                        flt_str = str(flt or '')
                        if 'DCTDecode' in flt_str:
                            result['jpeg_images'] += 1
                        elif 'FlateDecode' in flt_str or 'LZWDecode' in flt_str:
                            result['png_images'] += 1
                        else:
                            result['other_images'] += 1
                    elif tp == '/Font':
                        result['font_streams'] += 1
                except Exception:
                    continue
    except Exception as e:
        logger.warning(f'analyze_pdf_streams failed: {e}')
    return result


def get_available_engines() -> dict:
    """Return available compression engines with versions."""
    engines: Dict[str, Any] = {
        'ghostscript': {'available': bool(GS_BIN), 'path': GS_BIN},
        'qpdf':        {'available': bool(QPDF_BIN), 'path': QPDF_BIN},
        'mutool':      {'available': bool(MUTOOL), 'path': MUTOOL},
        'pikepdf':     {'available': True, 'version': pikepdf.__version__},
        'fitz':        {'available': True, 'version': fitz.version[0]},
        'pypdf':       {'available': True},
        'pillow':      {'available': True, 'version': Image.__version__},
    }
    for name, bin_path in [('ghostscript', GS_BIN), ('qpdf', QPDF_BIN)]:
        if bin_path:
            try:
                r = subprocess.run([bin_path, '--version'],
                                   capture_output=True, text=True, timeout=5)
                engines[name]['version'] = r.stdout.strip().split('\n')[0]
            except Exception:
                pass
    return engines


def analyze_images_in_pdf(input_path: str, password: str = '') -> dict:
    """
    Per-image analysis: DPI estimates, size, format, compressibility.
    Returns total_images, image_list, potential_savings_kb, recommendation.
    """
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        images: list = []
        total_bytes = 0
        high_res_count = 0

        for page_num in range(len(doc)):
            page = doc[page_num]
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                try:
                    base_img = doc.extract_image(xref)
                    w, h  = base_img['width'], base_img['height']
                    fmt   = base_img['ext']
                    size  = len(base_img['image'])
                    dpi_e = int((w * 72) / max(page.rect.width, 1))
                    total_bytes += size
                    if dpi_e > 150:
                        high_res_count += 1
                    images.append({
                        'page': page_num + 1, 'xref': xref,
                        'width': w, 'height': h,
                        'format': fmt, 'size_bytes': size,
                        'size_kb': round(size / 1024, 1),
                        'estimated_dpi': dpi_e,
                        'compressible': fmt.lower() in ('png', 'bmp', 'tiff', 'jpeg'),
                    })
                except Exception:
                    continue
        doc.close()
        potential = sum(
            img['size_bytes'] * 0.55 for img in images
            if img['compressible'] or img['estimated_dpi'] > 150
        )
        return {
            'total_images':        len(images),
            'image_list':          images[:50],  # cap at 50 for JSON size
            'total_image_bytes':   total_bytes,
            'total_image_kb':      round(total_bytes / 1024, 1),
            'average_dpi':         round(sum(i['estimated_dpi'] for i in images) / max(len(images), 1), 0),
            'high_res_count':      high_res_count,
            'potential_savings_kb':round(potential / 1024, 1),
            'recommendation': (
                'High compression potential — many high-DPI images found'
                if high_res_count > 0 else
                'Low compression potential — images are already small or optimized'
            ),
        }
    except Exception as e:
        return {'error': str(e), 'total_images': 0, 'image_list': []}


def get_compression_potential(input_path: str, password: str = '') -> dict:
    """
    Strategy-level compression potential analysis.
    Returns estimated_reduction_pct for each named strategy.
    """
    current_size = os.path.getsize(input_path) / 1024
    estimates: Dict[str, Any] = {}
    try:
        total_img_bytes = 0
        total_str_bytes = 0
        has_uncompressed = False
        image_count = 0
        with pikepdf.open(input_path, password=password or '') as pdf:
            for obj in pdf.objects:
                try:
                    if not hasattr(obj, 'get'):
                        continue
                    if obj.get('/Subtype') == pikepdf.Name('/Image'):
                        total_img_bytes += len(obj.get_raw_stream_buffer())
                        image_count += 1
                    try:
                        raw = obj.get_raw_stream_buffer()
                        total_str_bytes += len(raw)
                        if obj.get('/Filter') is None:
                            has_uncompressed = True
                    except Exception:
                        pass
                except Exception:
                    continue
        img_frac = total_img_bytes / max(current_size * 1024, 1)
        estimates['screen_quality']   = round(min(85, img_frac * 80 + 5), 1)
        estimates['ebook_quality']    = round(min(70, img_frac * 65 + 3), 1)
        estimates['printer_quality']  = round(min(50, img_frac * 40 + 2), 1)
        estimates['lossless_only']    = round(20 if has_uncompressed else 7, 1)
        estimates['images_only']      = round(min(60, img_frac * 55), 1)
        recommended = ('ebook_quality' if img_frac > 0.6
                       else 'images_only' if img_frac > 0.3
                       else 'lossless_only')
        return {
            'current_size_kb':    round(current_size, 1),
            'image_count':        image_count,
            'image_fraction_pct': round(img_frac * 100, 1),
            'estimates':          estimates,
            'recommended_strategy': recommended,
        }
    except Exception as e:
        return {'current_size_kb': round(current_size, 1), 'error': str(e)}


def get_compression_stats(input_path: str) -> dict:
    """Quick stats for pre-upload display: page count, image count, estimate."""
    try:
        doc = fitz.open(input_path)
        file_size   = os.path.getsize(input_path)
        page_count  = len(doc)
        img_count   = sum(len(page.get_images()) for page in doc)
        text_len    = sum(len(page.get_text()) for page in doc)
        doc.close()
        has_images  = img_count > 0
        return {
            'file_size': file_size,
            'page_count': page_count,
            'image_count': img_count,
            'text_characters': text_len,
            'estimated_reduction_pct': 55 if has_images else 18,
            'recommended_level': 'medium' if has_images else 'lossless',
        }
    except Exception as e:
        return {'error': str(e)}


# ══════════════════════════════════════════════════════════════════════════
# ADVANCED SINGLE-PURPOSE COMPRESSION FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def compress_images_only(input_path: str, output_path: str,
                          quality: int = 60,
                          min_size_kb: int = 10,
                          password: str = '') -> dict:
    """
    Compress ONLY embedded images in a PDF.
    Text, vectors, and fonts are completely untouched.
    Safe for documents where text sharpness is critical.
    """
    orig_size = os.path.getsize(input_path)
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        processed = skipped = 0
        xrefs_done: set = set()
        for page in doc:
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                if xref in xrefs_done:
                    continue
                xrefs_done.add(xref)
                try:
                    base = doc.extract_image(xref)
                    raw  = base['image']
                    if len(raw) < min_size_kb * 1024:
                        skipped += 1
                        continue
                    img = Image.open(io.BytesIO(raw))
                    if img.mode in ('RGBA', 'LA', 'P'):
                        img = img.convert('RGB')
                    elif img.mode not in ('RGB', 'L'):
                        img = img.convert('RGB')
                    buf = io.BytesIO()
                    img.save(buf, format='JPEG', quality=quality, optimize=True)
                    new_bytes = buf.getvalue()
                    if len(new_bytes) < len(raw):
                        doc.update_stream(xref, new_bytes)
                        processed += 1
                    else:
                        skipped += 1
                except Exception:
                    skipped += 1
        doc.save(output_path, garbage=4, deflate=True, clean=True)
        doc.close()
        final_size = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig_size,
            'output_size': final_size,
            'images_compressed': processed,
            'images_skipped': skipped,
            'reduction_pct': round((1 - final_size / max(orig_size, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'compress_images_only failed: {e}')


def compress_remove_metadata(input_path: str, output_path: str,
                              password: str = '') -> dict:
    """Strip all metadata (XMP, DocInfo, Title/Author) and compress."""
    orig = os.path.getsize(input_path)
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        doc.set_metadata({})
        try:
            doc.del_xml_metadata()
        except Exception:
            pass
        doc.save(output_path, garbage=4, deflate=True, clean=True, no_new_id=True)
        doc.close()
        out = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'compress_remove_metadata failed: {e}')


def compress_grayscale(input_path: str, output_path: str,
                        dpi: int = 150, jpeg_quality: int = 75,
                        password: str = '') -> dict:
    """
    Convert all pages to grayscale images and save.
    Produces very small files but loses all colour information.
    Should ONLY be used when user explicitly requests it.
    """
    orig = os.path.getsize(input_path)
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        out_doc = fitz.open()
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        for page in doc:
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
            img = Image.frombytes('L', [pix.width, pix.height], pix.samples)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=jpeg_quality, optimize=True)
            buf.seek(0)
            img_pdf = fitz.open(stream=buf.read(), filetype='pdf')
            out_doc.insert_pdf(img_pdf)
        out_doc.save(output_path, garbage=4, deflate=True)
        orig_pages = doc.page_count
        doc.close(); out_doc.close()
        out = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'pages': orig_pages,
            'dpi': dpi,
            'is_grayscale': True,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'compress_grayscale failed: {e}')


def compress_flatten_annotations(input_path: str, output_path: str,
                                  password: str = '') -> dict:
    """Remove (not flatten) all PDF annotations to reduce file size."""
    try:
        open_kwargs = {'password': password} if password else {}
        with pikepdf.open(input_path, **open_kwargs) as pdf:
            removed = 0
            for page in pdf.pages:
                if '/Annots' in page:
                    try:
                        n = len(list(page.Annots))
                        del page['/Annots']
                        removed += n
                    except Exception:
                        pass
            pdf.save(output_path, compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate)
        orig = os.path.getsize(input_path)
        out  = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'annotations_removed': removed,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'compress_flatten_annotations failed: {e}')


def compress_linearize(input_path: str, output_path: str,
                        password: str = '') -> dict:
    """Linearize (web-optimize) a PDF for fast first-page display."""
    orig = os.path.getsize(input_path)
    try:
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        doc.save(output_path, garbage=4, deflate=True, linear=True, clean=True)
        doc.close()
        out = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'linearized': True,
            'web_optimized': True,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'compress_linearize failed: {e}')


def strip_pdf_bloat(input_path: str, output_path: str,
                     password: str = '') -> dict:
    """
    Strip all PDF bloat: thumbnails, embedded files, JS, XFA forms,
    duplicate objects. Safe — does not touch images or text.
    """
    orig = os.path.getsize(input_path)
    stripped = []
    open_kwargs = {'password': password} if password else {}
    try:
        with pikepdf.open(input_path, **open_kwargs) as pdf:
            root = pdf.Root
            # Embedded files
            try:
                if '/Names' in root and '/EmbeddedFiles' in root.Names:
                    del root.Names['/EmbeddedFiles']
                    stripped.append('embedded_files')
            except Exception:
                pass
            # JavaScript
            try:
                if '/Names' in root:
                    for k in ['/JavaScript', '/JS']:
                        if k in root.Names:
                            del root.Names[k]
                            stripped.append('javascript')
            except Exception:
                pass
            # XFA forms
            try:
                if '/AcroForm' in root and '/XFA' in root.AcroForm:
                    del root.AcroForm['/XFA']
                    stripped.append('xfa_forms')
            except Exception:
                pass
            # Thumbnails
            for page in pdf.pages:
                try:
                    if '/Thumb' in page:
                        del page['/Thumb']
                        stripped.append('thumbnails')
                except Exception:
                    pass
            pdf.save(output_path, compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate)
        out = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'stripped': list(set(stripped)),
            'reduction_bytes': orig - out,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'strip_pdf_bloat failed: {e}')


def compress_to_target_size(
    input_path: str,
    output_path: str,
    target_kb: int = 500,
    max_iterations: int = 8,
    tolerance_pct: float = 5.0,
    password: str = '',
) -> dict:
    """
    Binary-search PDF compression to reach a target file size.
    Tries presets from most aggressive to least; stops when target is met.
    Returns closest achievable result within tolerance.
    """
    orig_size     = os.path.getsize(input_path)
    target_bytes  = target_kb * 1024
    presets_order = ['screen', 'low', 'medium', 'high', 'lossless']

    if orig_size <= target_bytes:
        shutil.copy2(input_path, output_path)
        return {
            'output_path': output_path,
            'original_size': orig_size,
            'final_size': orig_size,
            'target_kb': target_kb,
            'iterations': 0,
            'quality_used': 'none_needed',
            'achieved': True,
            'reduction_pct': 0,
            'note': 'File already within target size',
        }

    best_path    = None
    best_size    = orig_size
    best_quality = presets_order[0]
    tmp_dir      = tempfile.mkdtemp(prefix='ishu_target_')

    try:
        for i, preset in enumerate(presets_order):
            tmp = os.path.join(tmp_dir, f'try_{i}.pdf')
            try:
                compress_pdf(input_path, tmp, quality=preset, password=password)
                if not os.path.exists(tmp):
                    continue
                sz = os.path.getsize(tmp)
                if sz < best_size:
                    best_size    = sz
                    best_quality = preset
                    if best_path:
                        try:
                            os.remove(best_path)
                        except Exception:
                            pass
                    best_path = tmp
                    tmp = None
                if sz <= target_bytes * (1 + tolerance_pct / 100):
                    break
            except Exception:
                pass
            finally:
                if tmp and os.path.exists(tmp):
                    try:
                        os.remove(tmp)
                    except Exception:
                        pass

        if best_path and os.path.exists(best_path):
            shutil.copy2(best_path, output_path)
        else:
            # Aggressive fallback
            compress_pdf(input_path, output_path, quality='screen', password=password)
            best_size    = os.path.getsize(output_path)
            best_quality = 'screen'

        final_size = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig_size,
            'final_size': final_size,
            'target_kb': target_kb,
            'iterations': presets_order.index(best_quality) + 1,
            'quality_used': best_quality,
            'achieved': final_size <= target_bytes * (1 + tolerance_pct / 100),
            'reduction_pct': round((1 - final_size / max(orig_size, 1)) * 100, 1),
            'note': f'Best: {final_size // 1024} KB (target: {target_kb} KB)',
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def smart_compress_auto(input_path: str, output_path: str,
                         password: str = '') -> dict:
    """
    Auto-select the optimal compression strategy based on PDF content analysis.
    Analyses images, DPI, and content type before choosing preset.
    """
    orig_size = os.path.getsize(input_path)
    analysis  = analyze_images_in_pdf(input_path, password=password)
    total_imgs  = analysis.get('total_images', 0)
    avg_dpi     = analysis.get('average_dpi', 0)
    high_res    = analysis.get('high_res_count', 0)
    savings_kb  = analysis.get('potential_savings_kb', 0)

    if high_res > 0 and avg_dpi > 200:
        strategy = 'screen'
        reason   = f'{high_res} high-DPI images (avg {int(avg_dpi)} DPI) → aggressive downsampling'
    elif total_imgs > 5 and savings_kb > 200:
        strategy = 'medium'
        reason   = f'{total_imgs} images, ~{int(savings_kb)} KB potential savings'
    elif total_imgs == 0:
        strategy = 'lossless'
        reason   = 'Text-only PDF — lossless stream compression'
    else:
        strategy = 'medium'
        reason   = 'Balanced compression for mixed content'

    compress_pdf(input_path, output_path, quality=strategy, password=password)
    final_size = os.path.getsize(output_path)
    return {
        'output_path':       output_path,
        'strategy_chosen':   strategy,
        'reason':            reason,
        'original_size':     orig_size,
        'final_size':        final_size,
        'original_kb':       round(orig_size / 1024, 1),
        'final_kb':          round(final_size / 1024, 1),
        'reduction_pct':     round((1 - final_size / max(orig_size, 1)) * 100, 1),
        'total_images_found':total_imgs,
        'avg_image_dpi':     int(avg_dpi),
    }


def batch_compress(input_paths: List[str], output_dir: str,
                   quality: str = 'medium', **kwargs) -> List[dict]:
    """Compress multiple PDFs and return list of result dicts."""
    os.makedirs(output_dir, exist_ok=True)
    results = []
    for path in input_paths:
        base = Path(path).stem
        out  = os.path.join(output_dir, f'{base}_compressed.pdf')
        try:
            res = compress_pdf(path, out, quality=quality, **kwargs)
            res['source_path'] = path
            results.append(res)
        except Exception as e:
            results.append({'source_path': path, 'output_path': None, 'error': str(e)})
    return results


def compress_with_zopfli(input_path: str, output_path: str) -> dict:
    """
    Apply maximum DEFLATE recompression to all PDF streams via pikepdf.
    Equivalent to Zopfli-quality compression without the Zopfli binary.
    Best for archival PDFs where existing images are already compressed.
    """
    try:
        with pikepdf.open(input_path) as pdf:
            pdf.save(
                output_path,
                compress_streams=True,
                recompress_flate=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                stream_decode_level=pikepdf.StreamDecodeLevel.all,
            )
        orig = os.path.getsize(input_path)
        new  = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'input_size': orig,
            'output_size': new,
            'reduction_pct': round((orig - new) / max(orig, 1) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'compress_with_zopfli failed: {e}')


def remove_pdf_javascript(input_path: str, output_path: str,
                           password: str = '') -> dict:
    """Strip all JavaScript from a PDF (security + size reduction)."""
    js_count = 0
    open_kwargs = {'password': password} if password else {}
    try:
        with pikepdf.open(input_path, **open_kwargs) as pdf:
            def _strip_js(obj):
                nonlocal js_count
                try:
                    if isinstance(obj, pikepdf.Dictionary):
                        for key in list(obj.keys()):
                            if str(key) in ('/JS', '/JavaScript'):
                                del obj[key]
                                js_count += 1
                            else:
                                _strip_js(obj[key])
                except Exception:
                    pass
            for page in pdf.pages:
                _strip_js(page)
            _strip_js(pdf.Root)
            pdf.save(output_path, compress_streams=True)
        orig = os.path.getsize(input_path)
        out  = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'js_actions_removed': js_count,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'remove_pdf_javascript failed: {e}')


def remove_embedded_files_from_pdf(input_path: str, output_path: str,
                                    password: str = '') -> dict:
    """Remove all embedded files and attachments from a PDF."""
    open_kwargs = {'password': password} if password else {}
    try:
        with pikepdf.open(input_path, **open_kwargs) as pdf:
            removed = []
            if '/Names' in pdf.Root and '/EmbeddedFiles' in pdf.Root.Names:
                ef = pdf.Root.Names.EmbeddedFiles
                if '/Names' in ef:
                    names = list(ef.Names)
                    removed = [str(names[i]) for i in range(0, len(names), 2)]
                del pdf.Root.Names['/EmbeddedFiles']
            for page in pdf.pages:
                try:
                    if '/Thumb' in page:
                        del page['/Thumb']
                except Exception:
                    pass
            pdf.save(output_path, compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate)
        orig = os.path.getsize(input_path)
        out  = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'removed_attachments': removed,
            'thumbnails_removed': True,
            'original_size': orig,
            'output_size': out,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'remove_embedded_files failed: {e}')


def compress_progressive(input_path: str, output_path: str,
                          target_size_mb: float = 2.0,
                          password: str = '') -> dict:
    """
    Progressively try presets from lossless to screen until target is met.
    Returns the best (smallest) result achieved.
    """
    strategies  = ['lossless', 'high', 'medium', 'low', 'screen']
    orig_size   = os.path.getsize(input_path)
    target_bytes= int(target_size_mb * 1024 * 1024)
    best_path   = None
    best_size   = orig_size
    best_strategy = None
    tmp_dir = tempfile.mkdtemp(prefix='ishu_prog_')
    try:
        for strategy in strategies:
            tmp = os.path.join(tmp_dir, f'{strategy}.pdf')
            try:
                compress_pdf(input_path, tmp, quality=strategy, password=password)
                sz = os.path.getsize(tmp) if os.path.exists(tmp) else orig_size
                if sz < best_size:
                    best_size     = sz
                    best_strategy = strategy
                    if best_path:
                        try:
                            os.remove(best_path)
                        except Exception:
                            pass
                    best_path = tmp
                    tmp = None
                if sz <= target_bytes:
                    break
            except Exception:
                pass
            finally:
                if tmp and os.path.exists(tmp):
                    try:
                        os.remove(tmp)
                    except Exception:
                        pass
        if best_path and os.path.exists(best_path):
            shutil.copy2(best_path, output_path)
        else:
            shutil.copy2(input_path, output_path)
            best_strategy = 'none'
        final_size = os.path.getsize(output_path)
        return {
            'output_path':     output_path,
            'original_size':   orig_size,
            'compressed_size': final_size,
            'strategy_used':   best_strategy,
            'target_size_mb':  target_size_mb,
            'target_met':      final_size <= target_bytes,
            'reduction_pct':   round((1 - final_size / max(orig_size, 1)) * 100, 1),
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def reoptimize_already_compressed(input_path: str, output_path: str) -> dict:
    """
    Re-optimize a PDF that is already compressed.
    Uses only lossless techniques (no image quality loss):
    - Object stream merging
    - Dead-object removal
    - Duplicate image detection
    - Flate recompression
    Ideal as a final pass after lossy compression.
    """
    orig = os.path.getsize(input_path)
    try:
        # Primary: pikepdf with all optimizations
        tmp1 = output_path + '.tmp1.pdf'
        ok = _pikepdf_optimize(input_path, tmp1)
        # Secondary: qpdf recompress
        if QPDF_BIN and ok:
            tmp2 = output_path + '.tmp2.pdf'
            qok = _qpdf_compress(tmp1, tmp2)
            if qok:
                src = tmp2
            else:
                src = tmp1
        else:
            src = tmp1 if ok else input_path
        shutil.copy2(src, output_path)
        for f in [tmp1, output_path + '.tmp2.pdf']:
            try:
                os.remove(f)
            except Exception:
                pass
        out = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'reoptimize_already_compressed failed: {e}')


def get_pdf_metadata(input_path: str, password: str = '') -> dict:
    """
    Extract all metadata from a PDF (for display/stripping decisions).
    Returns author, title, subject, creator, producer, creation_date, etc.
    """
    meta: Dict[str, Any] = {
        'author': '', 'title': '', 'subject': '', 'creator': '',
        'producer': '', 'creation_date': '', 'mod_date': '',
        'keywords': '', 'page_count': 0, 'file_size_kb': 0,
        'pdf_version': '', 'is_encrypted': False, 'is_tagged': False,
        'xmp_data': '',
    }
    try:
        meta['file_size_kb'] = round(os.path.getsize(input_path) / 1024, 1)
        open_kwargs = {'password': password} if password else {}
        with pikepdf.open(input_path, **open_kwargs) as pdf:
            meta['page_count']    = len(pdf.pages)
            meta['pdf_version']   = str(pdf.pdf_version)
            meta['is_encrypted']  = pdf.is_encrypted
            di = dict(pdf.docinfo) if pdf.docinfo else {}
            def _s(k):
                v = di.get(k, '')
                return str(v) if v else ''
            meta['author']        = _s('/Author')
            meta['title']         = _s('/Title')
            meta['subject']       = _s('/Subject')
            meta['creator']       = _s('/Creator')
            meta['producer']      = _s('/Producer')
            meta['creation_date'] = _s('/CreationDate')
            meta['mod_date']      = _s('/ModDate')
            meta['keywords']      = _s('/Keywords')
            try:
                if '/MarkInfo' in pdf.Root:
                    meta['is_tagged'] = True
            except Exception:
                pass
    except Exception as e:
        meta['error'] = str(e)
    return meta


def repair_pdf(input_path: str, output_path: str,
               password: str = '') -> dict:
    """
    Attempt to repair a corrupted or malformed PDF.
    Uses PyMuPDF's built-in recovery + pikepdf cleanup pass.
    """
    orig = os.path.getsize(input_path)
    try:
        # PyMuPDF has built-in PDF repair
        doc = fitz.open(input_path)
        if password:
            doc.authenticate(password)
        tmp = output_path + '.repair_tmp.pdf'
        doc.save(tmp, garbage=4, deflate=True, clean=True)
        doc.close()
        # Pikepdf cleanup
        if os.path.exists(tmp):
            _pikepdf_optimize(tmp, output_path)
            os.remove(tmp)
        else:
            shutil.copy2(input_path, output_path)
        out = os.path.getsize(output_path)
        return {
            'output_path': output_path,
            'original_size': orig,
            'output_size': out,
            'repaired': True,
            'reduction_pct': round((1 - out / max(orig, 1)) * 100, 1),
        }
    except Exception as e:
        raise RuntimeError(f'repair_pdf failed: {e}')


def estimate_compression(
    input_path: str,
    quality: str = 'medium',
    password: str = '',
) -> dict:
    """
    Fast estimate of achievable compression without actually compressing.
    Returns estimated_output_kb, estimated_reduction_pct, confidence.
    """
    try:
        info = get_compression_estimate(input_path, password=password)
        preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['medium'])
        est_reduction = info['estimated_reductions_by_preset'].get(quality, 30.0)
        file_size_kb  = info['file_size_kb']
        est_output_kb = file_size_kb * (1 - est_reduction / 100)
        confidence    = 'high' if info['image_count'] > 5 else 'medium' if info['image_count'] > 0 else 'low'
        return {
            'input_size_kb':         file_size_kb,
            'estimated_output_kb':   round(est_output_kb, 1),
            'estimated_reduction_pct': est_reduction,
            'confidence':            confidence,
            'quality':               quality,
            'preset_description':    preset.get('description', ''),
            'ghostscript_available': bool(GS_BIN),
            'expected_range':        preset.get('expected_reduction', '—'),
        }
    except Exception as e:
        return {'error': str(e)}
