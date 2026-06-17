"""
pdf_remove_pages.py — Remove pages from a PDF (Ultra-Mega Enhanced)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: pypdf, pikepdf, fitz (PyMuPDF), reportlab, Pillow, hashlib
Features:
  - Rich page selector: '1,3,5-8', even/odd, last-N, first-N, every-Nth, blank-pages
  - Blank page auto-detection (remove pages with no visible content)
  - Duplicate page detection and removal (content hash)
  - Remove pages by text pattern match (regex)
  - Remove pages smaller/larger than a size threshold
  - Preview mode: show what would be removed without actually removing
  - Compression pass after removal
  - Metadata preservation and update
  - Undo map: record which original pages ended up where
  - Per-page detailed stats
"""

import hashlib
import io
import os
import re
import struct
from datetime import datetime
from typing import Optional

import fitz                              # PyMuPDF
import pikepdf
from PIL import Image
from pypdf import PdfWriter, PdfReader
from pypdf.generic import RectangleObject
from reportlab.pdfgen import canvas as rl_canvas


# ──────────────────────────── Helpers ────────────────────────────────────────

def parse_remove_selector(selector: str, total: int) -> set[int]:
    """
    Parse rich removal selector to a set of 0-based indices to REMOVE.
    Supports:
      '1,3,5-8'     → explicit pages / ranges
      'even'        → all even-numbered pages (2,4,6...)
      'odd'         → all odd-numbered pages (1,3,5...)
      'first:N'     → first N pages
      'last:N'      → last N pages
      'every:N'     → every Nth page
      'every:N:S'   → every Nth starting from page S
    """
    sel = selector.strip().lower()
    if sel == 'even':
        return {i for i in range(total) if (i + 1) % 2 == 0}
    if sel == 'odd':
        return {i for i in range(total) if (i + 1) % 2 != 0}
    if sel.startswith('first:'):
        n = int(sel.split(':')[1])
        return set(range(min(n, total)))
    if sel.startswith('last:'):
        n = int(sel.split(':')[1])
        return set(range(max(0, total - n), total))
    if sel.startswith('every:'):
        parts = sel.split(':')
        step = int(parts[1]) if len(parts) > 1 else 2
        start = int(parts[2]) - 1 if len(parts) > 2 else 0
        return {i for i in range(start, total, step)}

    indices = set()
    for part in selector.replace(' ', '').split(','):
        if not part:
            continue
        if '-' in part and not part.startswith('-'):
            a, b = part.split('-', 1)
            try:
                for n in range(int(a), int(b) + 1):
                    if 1 <= n <= total:
                        indices.add(n - 1)
            except ValueError:
                pass
        elif part.lstrip('-').isdigit():
            n = int(part)
            if 1 <= n <= total:
                indices.add(n - 1)
    return indices


def _content_hash(page) -> str:
    """SHA-256 hash of page text content."""
    try:
        text = page.extract_text() or ''
        return hashlib.sha256(text.encode('utf-8', errors='ignore')).hexdigest()
    except Exception:
        return ''


def _is_blank_page(fitz_page: fitz.Page, text_threshold: int = 10,
                   pixel_threshold: float = 0.02) -> bool:
    """
    Determine if a page is visually blank.
    Checks text content AND renders a small thumbnail to count non-white pixels.
    """
    # Text check
    try:
        text = fitz_page.get_text('text').strip()
        if len(text) > text_threshold:
            return False
    except Exception:
        pass

    # Image check: render at very low res
    try:
        mat = fitz.Matrix(0.3, 0.3)
        pix = fitz_page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        data = pix.samples
        total_px = len(data)
        if total_px == 0:
            return True
        # Count non-white pixels (< 250)
        non_white = sum(1 for b in data if b < 250)
        return (non_white / total_px) < pixel_threshold
    except Exception:
        return False


def _page_matches_pattern(fitz_page: fitz.Page, pattern: str) -> bool:
    """Return True if page text matches the given regex pattern."""
    try:
        text = fitz_page.get_text('text')
        return bool(re.search(pattern, text, re.IGNORECASE))
    except Exception:
        return False


def _page_dimensions_pt(fitz_page: fitz.Page) -> tuple[float, float]:
    """Return page width and height in points."""
    r = fitz_page.rect
    return r.width, r.height


def _compress_output(input_path: str, output_path: str) -> bool:
    """Compression pass using pikepdf."""
    try:
        with pikepdf.open(input_path) as pdf:
            pdf.save(
                output_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                recompress_flate=True,
            )
        return True
    except Exception:
        return False


def _get_page_stats(fitz_page: fitz.Page, page_num: int) -> dict:
    """Get stats for a single page."""
    try:
        rect = fitz_page.rect
        text = fitz_page.get_text('text')
        images = fitz_page.get_images(full=False)
        return {
            'page': page_num,
            'width_pt': round(rect.width, 1),
            'height_pt': round(rect.height, 1),
            'width_mm': round(rect.width * 25.4 / 72, 1),
            'height_mm': round(rect.height * 25.4 / 72, 1),
            'word_count': len(text.split()),
            'has_images': len(images) > 0,
            'image_count': len(images),
            'is_blank': _is_blank_page(fitz_page),
        }
    except Exception:
        return {'page': page_num, 'error': 'Could not read page'}


# ───────────────────────────── Main API ──────────────────────────────────────

def remove_pages(
    input_path: str,
    output_path: str,
    pages: str = '',
    password: str = '',
    remove_blank: bool = False,
    remove_duplicates: bool = False,
    remove_by_pattern: str = '',
    min_width_pt: float = 0,
    min_height_pt: float = 0,
    max_width_pt: float = 0,
    max_height_pt: float = 0,
    compress: bool = True,
    preview_only: bool = False,
) -> dict:
    """
    Remove pages from a PDF with extensive options.

    Args:
        input_path:         Source PDF
        output_path:        Output PDF
        pages:              Page selector for explicit removal (e.g. '1,3,5-8')
        password:           PDF password if encrypted
        remove_blank:       Auto-detect and remove blank/empty pages
        remove_duplicates:  Remove duplicate pages (content hash)
        remove_by_pattern:  Remove pages containing this regex pattern
        min_width_pt:       Remove pages narrower than this (points)
        min_height_pt:      Remove pages shorter than this (points)
        max_width_pt:       Remove pages wider than this (points; 0=no limit)
        max_height_pt:      Remove pages taller than this (points; 0=no limit)
        compress:           Apply compression pass after removal
        preview_only:       If True, return what WOULD be removed without writing file
    Returns:
        dict with output_path, original_pages, remaining_pages, removed_pages, stats
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        if not reader.decrypt(password or ''):
            raise ValueError('Incorrect password for encrypted PDF.')

    total = len(reader.pages)

    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    # ── Build remove set ───────────────────────────────────────────────────────
    remove_set = set()

    # Explicit selector
    if pages.strip():
        remove_set |= parse_remove_selector(pages, total)

    # Blank page detection
    if remove_blank:
        for i in range(total):
            if _is_blank_page(fitz_doc[i]):
                remove_set.add(i)

    # Pattern removal
    if remove_by_pattern:
        for i in range(total):
            if _page_matches_pattern(fitz_doc[i], remove_by_pattern):
                remove_set.add(i)

    # Size-based removal
    if min_width_pt > 0 or min_height_pt > 0 or max_width_pt > 0 or max_height_pt > 0:
        for i in range(total):
            w, h = _page_dimensions_pt(fitz_doc[i])
            if min_width_pt > 0 and w < min_width_pt:
                remove_set.add(i)
            if min_height_pt > 0 and h < min_height_pt:
                remove_set.add(i)
            if max_width_pt > 0 and w > max_width_pt:
                remove_set.add(i)
            if max_height_pt > 0 and h > max_height_pt:
                remove_set.add(i)

    # Duplicate detection (first occurrence kept, later ones removed)
    if remove_duplicates:
        seen_hashes = {}
        for i in range(total):
            h = _content_hash(reader.pages[i])
            if h:
                if h in seen_hashes:
                    remove_set.add(i)
                else:
                    seen_hashes[h] = i

    # Ensure at least one page remains
    keep_indices = [i for i in range(total) if i not in remove_set]
    if len(keep_indices) == 0:
        raise ValueError(
            'Operation would remove ALL pages. At least one page must remain.')

    # Gather per-page stats for all pages
    page_stats = [_get_page_stats(fitz_doc[i], i + 1) for i in range(total)]
    fitz_doc.close()

    removed_pages = sorted([i + 1 for i in remove_set])
    kept_pages = sorted([i + 1 for i in keep_indices])

    # ── Preview mode — return without writing ──────────────────────────────────
    if preview_only:
        return {
            'preview_only': True,
            'original_pages': total,
            'pages_to_remove': removed_pages,
            'pages_to_keep': kept_pages,
            'remove_count': len(remove_set),
            'keep_count': len(keep_indices),
            'page_stats': page_stats,
        }

    # ── Build output PDF ───────────────────────────────────────────────────────
    writer = PdfWriter()
    undo_map = {}    # new_page_idx → original_page_num
    for new_idx, orig_idx in enumerate(keep_indices):
        writer.add_page(reader.pages[orig_idx])
        undo_map[new_idx + 1] = orig_idx + 1

    # Preserve metadata
    try:
        if reader.metadata:
            meta = dict(reader.metadata)
        else:
            meta = {}
        meta.update({
            '/Producer': 'IshuTools.fun PDF Suite — Remove Pages',
            '/Creator': 'IshuTools.fun',
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        })
        writer.add_metadata(meta)
    except Exception:
        pass

    orig_size = os.path.getsize(input_path)

    with open(output_path, 'wb') as f:
        writer.write(f)

    # ── Compression pass ───────────────────────────────────────────────────────
    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)

    return {
        'output_path': output_path,
        'original_pages': total,
        'remaining_pages': len(keep_indices),
        'removed_pages': removed_pages,
        'kept_pages': kept_pages,
        'remove_count': len(remove_set),
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
        'reduction_pct': round((1 - out_size / max(orig_size, 1)) * 100, 1),
        'undo_map': undo_map,
        'page_stats': page_stats,
    }


def find_blank_pages(input_path: str, password: str = '') -> list[int]:
    """Return list of 1-based page numbers that appear blank."""
    doc = fitz.open(input_path)
    if doc.is_encrypted:
        doc.authenticate(password or '')
    blank = [i + 1 for i in range(doc.page_count) if _is_blank_page(doc[i])]
    doc.close()
    return blank


def find_duplicate_pages(input_path: str, password: str = '') -> list[list[int]]:
    """
    Return groups of duplicate pages (by content hash).
    Each group is a list of 1-based page numbers with identical content.
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    hash_groups: dict[str, list[int]] = {}
    for i, page in enumerate(reader.pages):
        h = _content_hash(page)
        if h:
            hash_groups.setdefault(h, []).append(i + 1)

    return [grp for grp in hash_groups.values() if len(grp) > 1]


def analyze_pdf_pages(input_path: str, password: str = '') -> dict:
    """
    Full page analysis: dimensions, content summary, blank detection, duplicates.
    """
    fitz_doc = fitz.open(input_path)
    if fitz_doc.is_encrypted:
        fitz_doc.authenticate(password or '')

    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = fitz_doc.page_count
    pages = []
    blank_pages = []
    hash_map: dict[str, list[int]] = {}

    for i in range(total):
        stats = _get_page_stats(fitz_doc[i], i + 1)
        h = _content_hash(reader.pages[i])
        stats['content_hash'] = h[:8] if h else ''
        pages.append(stats)
        if stats.get('is_blank'):
            blank_pages.append(i + 1)
        if h:
            hash_map.setdefault(h, []).append(i + 1)

    dup_groups = [grp for grp in hash_map.values() if len(grp) > 1]
    fitz_doc.close()

    return {
        'total_pages': total,
        'file_size_kb': round(os.path.getsize(input_path) / 1024, 1),
        'blank_pages': blank_pages,
        'duplicate_groups': dup_groups,
        'pages': pages,
    }
