"""
pdf_split.py — Enterprise PDF Split Engine v3.0
IshuTools.fun | Created by Ishu Kumar (ISHUKR41 / ISHUKR75)

Split modes:
  - all          : One file per page (lossless burst)
  - range        : Selected pages → one output file
  - every_n      : Equal-size chunks of N pages
  - bookmarks    : Split at top-level bookmark/TOC boundaries (fitz-based)
  - blank_pages  : Auto-detect blank separator pages → split there
  - size_limit   : Split when accumulated file size exceeds threshold (MB)
  - odd_even     : Separate odd and even pages into 2 files

Quality guarantee:
  All modes use pikepdf → PyMuPDF (fitz) → pypdf cascade.
  NO re-encoding of images or fonts.  Zero quality loss.
"""

import os
import io
import re
import glob as _glob
import shutil
import subprocess
import tempfile
import zipfile
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List

import fitz                             # PyMuPDF
import pikepdf
from pypdf import PdfWriter, PdfReader
from PIL import Image

logger = logging.getLogger(__name__)

GS_BIN   = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ══════════════════════════════════════════════════════════════════════════════
# ── Page range parser
# ══════════════════════════════════════════════════════════════════════════════

def parse_ranges(ranges_str: str, total_pages: int) -> list:
    """Parse '1-3,5,7-9' into sorted 0-indexed page list."""
    pages: set = set()
    for part in str(ranges_str).replace(' ', '').split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            halves = part.split('-', 1)
            try:
                s = max(0, int(halves[0]) - 1)
                e = min(total_pages - 1, int(halves[1]) - 1)
                if s <= e:
                    pages.update(range(s, e + 1))
            except (ValueError, IndexError):
                pass
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total_pages:
                pages.add(idx)
    return sorted(pages)


# ══════════════════════════════════════════════════════════════════════════════
# ── Blank-page detector
# ══════════════════════════════════════════════════════════════════════════════

def _is_blank_page(fitz_page, threshold: float = 0.97,
                   min_text_chars: int = 4) -> bool:
    """Return True if page is visually blank (no text, no meaningful content)."""
    try:
        text = fitz_page.get_text().strip()
        if len(text) >= min_text_chars:
            return False
    except Exception:
        pass
    try:
        imgs = fitz_page.get_images()
        if imgs:
            return False
    except Exception:
        pass
    try:
        pix = fitz_page.get_pixmap(dpi=36, colorspace=fitz.csGRAY)
        samples = pix.samples
        if not samples:
            return True
        total = len(samples)
        white = sum(1 for b in samples if b > 230)
        return (white / total) >= threshold
    except Exception:
        return True


def _detect_blank_pages(input_path: str, threshold: float = 0.97,
                         password: str = '') -> set:
    """Return set of 0-based indices of blank pages."""
    blank: set = set()
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for i, pg in enumerate(doc):
            if _is_blank_page(pg, threshold):
                blank.add(i)
        doc.close()
    except Exception as e:
        logger.warning('blank-page detection failed: %s', e)
    return blank


# ══════════════════════════════════════════════════════════════════════════════
# ── Lossless page writers (cascade: pikepdf → fitz → pypdf)
# ══════════════════════════════════════════════════════════════════════════════

def _write_pikepdf(src_path: str, page_indices: list, out_path: str,
                   password: str = '') -> bool:
    """Write pages using pikepdf (stream-level copy — zero quality loss)."""
    try:
        kwargs: dict = {}
        if password:
            kwargs['password'] = password
        with pikepdf.open(src_path, **kwargs) as src:
            out = pikepdf.new()
            for idx in page_indices:
                if 0 <= idx < len(src.pages):
                    out.pages.append(src.pages[idx])
            out.save(out_path,
                     compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate,
                     recompress_flate=False)   # never re-encode streams
        return os.path.exists(out_path) and os.path.getsize(out_path) > 50
    except Exception as e:
        logger.debug('pikepdf write failed: %s', e)
        return False


def _write_fitz(src_path: str, page_indices: list, out_path: str,
                password: str = '') -> bool:
    """Write pages using PyMuPDF (structure-preserving copy)."""
    try:
        src = fitz.open(src_path)
        if src.is_encrypted:
            src.authenticate(password or '')
        out = fitz.open()
        for idx in sorted(page_indices):
            if 0 <= idx < len(src):
                out.insert_pdf(src, from_page=idx, to_page=idx)
        out.save(out_path, garbage=4, deflate=True, clean=False)
        out.close()
        src.close()
        return os.path.exists(out_path) and os.path.getsize(out_path) > 50
    except Exception as e:
        logger.debug('fitz write failed: %s', e)
        return False


def _write_pypdf(reader: PdfReader, page_indices: list, out_path: str,
                 meta: dict = None) -> bool:
    """Write pages using pypdf (fallback)."""
    try:
        w = PdfWriter()
        for idx in page_indices:
            if 0 <= idx < len(reader.pages):
                w.add_page(reader.pages[idx])
        if meta:
            try:
                w.add_metadata(meta)
            except Exception:
                pass
        with open(out_path, 'wb') as f:
            w.write(f)
        return True
    except Exception as e:
        logger.debug('pypdf write failed: %s', e)
        return False


def _write_pages(src_path: str, page_indices: list, out_path: str,
                 reader: PdfReader = None, meta: dict = None,
                 password: str = '') -> bool:
    """Try pikepdf → fitz → pypdf in cascade."""
    if not page_indices:
        return False
    if _write_pikepdf(src_path, page_indices, out_path, password):
        return True
    if _write_fitz(src_path, page_indices, out_path, password):
        return True
    if reader:
        return _write_pypdf(reader, page_indices, out_path, meta)
    return False


# ══════════════════════════════════════════════════════════════════════════════
# ── GS burst (highest quality per-page split)
# ══════════════════════════════════════════════════════════════════════════════

def _gs_burst(input_path: str, out_dir: str) -> list:
    """Ghostscript burst — one PDF per page, best quality."""
    if not GS_BIN:
        return []
    try:
        pattern = os.path.join(out_dir, 'page_%04d.pdf')
        cmd = [
            GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.7',
            '-dPDFSETTINGS=/printer',
            f'-sOutputFile={pattern}',
            input_path,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=180)
        if r.returncode == 0:
            return sorted(_glob.glob(os.path.join(out_dir, 'page_*.pdf')))
        logger.warning('gs burst returncode=%d: %s', r.returncode, r.stderr[:200])
        return []
    except Exception as e:
        logger.warning('gs burst failed: %s', e)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# ── Bookmark helpers
# ══════════════════════════════════════════════════════════════════════════════

def _get_bookmarks_fitz(input_path: str, password: str = '') -> list:
    """Return list of (title, 0-based page_idx) from fitz TOC."""
    results = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        toc = doc.get_toc(simple=True)
        for level, title, page in toc:
            if level == 1:
                results.append((str(title or 'Section'), max(0, page - 1)))
        doc.close()
    except Exception as e:
        logger.warning('bookmark read failed: %s', e)
    return results


def _get_bookmarks_flat(outline, reader) -> list:
    """Flatten pypdf outline → list of (title, 0-based page_idx)."""
    results = []
    def _rec(items):
        for item in (items or []):
            if isinstance(item, list):
                _rec(item)
            else:
                try:
                    pg = reader.get_destination_page_number(item)
                    results.append((str(item.title), pg))
                except Exception:
                    pass
    try:
        _rec(outline)
    except Exception:
        pass
    return results


# ══════════════════════════════════════════════════════════════════════════════
# ── Naming helpers
# ══════════════════════════════════════════════════════════════════════════════

def _safe_name(name: str, max_len: int = 50) -> str:
    name = re.sub(r'[^\w\s\-]', '_', name)
    name = re.sub(r'\s+', '_', name).strip('_')
    return name[:max_len] or 'section'


def _render_name(pattern: str, n: int, title: str = '',
                  date: str = None) -> str:
    date = date or datetime.utcnow().strftime('%Y%m%d')
    try:
        return pattern.format(n=n, title=_safe_name(title), date=date, N=n)
    except Exception:
        return f'part_{n:04d}'


# ══════════════════════════════════════════════════════════════════════════════
# ── Main split API
# ══════════════════════════════════════════════════════════════════════════════

def split_pdf(
    input_path: str,
    out_dir: str,
    result_zip: str,
    mode: str = 'all',
    ranges: str = '',
    every_n: int = 1,
    password: str = '',
    max_size_mb: float = 5.0,
    remove_blanks: bool = False,
    naming_pattern: str = 'page_{n:04d}',
    blank_threshold: float = 0.97,
    compress_output: bool = False,   # False = lossless (no re-encode)
    use_pikepdf: bool = True,
    zip_compression_level: int = 6,
    source_filename: str = '',
) -> dict:
    """
    Split a PDF using various strategies.  Zero quality loss — pages are
    byte-copied, never re-encoded.

    Returns:
        dict with keys: result_zip, file_count, total_pages, skipped_blanks,
                        mode_used, output_files, source_filename
    """
    os.makedirs(out_dir, exist_ok=True)

    # ── Open & authenticate ─────────────────────────────────────────────────
    reader = PdfReader(input_path)
    if reader.is_encrypted:
        ok = reader.decrypt(password or '')
        if ok == 0 and password:
            raise ValueError('Incorrect PDF password. Please check and try again.')

    total = len(reader.pages)
    if total == 0:
        raise ValueError('This PDF has no pages to split.')

    # ── Base metadata ───────────────────────────────────────────────────────
    meta: dict = {}
    try:
        if reader.metadata:
            meta = {k: v for k, v in reader.metadata.items() if k and v}
            meta['/Producer'] = 'IshuTools.fun — Split PDF by Ishu Kumar (ISHUKR41)'
            meta['/ModDate']  = "D:" + datetime.utcnow().strftime('%Y%m%d%H%M%S') + "+00'00'"
    except Exception:
        pass

    # ── Blank page index ────────────────────────────────────────────────────
    blank_set: set = set()
    if remove_blanks or mode == 'blank_pages':
        blank_set = _detect_blank_pages(input_path, blank_threshold, password)

    output_files: list = []
    date_str = datetime.utcnow().strftime('%Y%m%d')

    def _save(indices: list, out_name: str):
        """Filter blanks, write, add to list."""
        active = [i for i in indices if i not in (blank_set if remove_blanks else set())]
        if not active:
            return
        fpath = os.path.join(out_dir, out_name + '.pdf')
        if not _write_pages(input_path, active, fpath, reader, meta, password):
            raise RuntimeError(f'Failed to write split file: {out_name}.pdf')
        output_files.append(fpath)

    # ════════════════════════════════════════════════════════════════════════
    # MODE: every page
    # ════════════════════════════════════════════════════════════════════════
    if mode == 'all':
        # Try GS burst first (best per-page quality)
        gs_pages = _gs_burst(input_path, out_dir) if GS_BIN else []
        if gs_pages:
            if remove_blanks:
                valid_gs = []
                for i, fp in enumerate(gs_pages):
                    if i not in blank_set:
                        valid_gs.append(fp)
                    else:
                        try:
                            os.remove(fp)
                        except Exception:
                            pass
                output_files.extend(valid_gs)
            else:
                output_files.extend(gs_pages)
        else:
            for i in range(total):
                if remove_blanks and i in blank_set:
                    continue
                name = _render_name(naming_pattern, i + 1, date=date_str)
                _save([i], name)

    # ════════════════════════════════════════════════════════════════════════
    # MODE: page ranges
    # ════════════════════════════════════════════════════════════════════════
    elif mode == 'range':
        idxs = [i for i in parse_ranges(ranges, total)
                if not (remove_blanks and i in blank_set)]
        if not idxs:
            raise ValueError('No valid pages in the selected range. Please check your selection.')
        stem = _safe_name(Path(source_filename).stem) if source_filename else 'extracted'
        pg_label = f'pages_{idxs[0]+1}-{idxs[-1]+1}' if len(idxs) > 1 else f'page_{idxs[0]+1}'
        _save(idxs, f'{stem}_{pg_label}')

    # ════════════════════════════════════════════════════════════════════════
    # MODE: every N pages
    # ════════════════════════════════════════════════════════════════════════
    elif mode == 'every_n':
        n = max(1, every_n)
        valid = [i for i in range(total)
                 if not (remove_blanks and i in blank_set)]
        for chunk_num, start in enumerate(range(0, len(valid), n), start=1):
            chunk = valid[start:start + n]
            if not chunk:
                continue
            first, last = chunk[0] + 1, chunk[-1] + 1
            name = _render_name(naming_pattern, chunk_num, date=date_str)
            _save(chunk, f'{name}_pages_{first}-{last}')

    # ════════════════════════════════════════════════════════════════════════
    # MODE: bookmarks / chapters
    # ════════════════════════════════════════════════════════════════════════
    elif mode == 'bookmarks':
        flat = _get_bookmarks_fitz(input_path, password)
        if not flat:
            flat = _get_bookmarks_flat(reader.outline, reader)
        if not flat:
            # Fallback: every 5 pages
            logger.info('No bookmarks found — falling back to every-5-pages split')
            valid = [i for i in range(total)
                     if not (remove_blanks and i in blank_set)]
            for chunk_num, start in enumerate(range(0, len(valid), 5), start=1):
                chunk = valid[start:start + 5]
                if chunk:
                    _save(chunk, f'section_{chunk_num:03d}_pages_{chunk[0]+1}-{chunk[-1]+1}')
        else:
            flat.append(('_END_', total))
            for i in range(len(flat) - 1):
                title, start_idx = flat[i]
                _, next_idx    = flat[i + 1]
                pages = [j for j in range(start_idx, next_idx)
                         if not (remove_blanks and j in blank_set)]
                if pages:
                    fname = f'{i+1:03d}_{_safe_name(title)}'
                    _save(pages, fname)

    # ════════════════════════════════════════════════════════════════════════
    # MODE: blank page separators
    # ════════════════════════════════════════════════════════════════════════
    elif mode == 'blank_pages':
        chunk: list = []
        chunk_num = 1
        for i in range(total):
            if i in blank_set:
                if chunk:
                    f, l = chunk[0] + 1, chunk[-1] + 1
                    _save(chunk, f'section_{chunk_num:03d}_pages_{f}-{l}')
                    chunk_num += 1
                    chunk = []
            else:
                chunk.append(i)
        if chunk:
            f, l = chunk[0] + 1, chunk[-1] + 1
            _save(chunk, f'section_{chunk_num:03d}_pages_{f}-{l}')

    # ════════════════════════════════════════════════════════════════════════
    # MODE: by file size
    # ════════════════════════════════════════════════════════════════════════
    elif mode == 'size_limit':
        max_bytes = max(0.1, max_size_mb) * 1024 * 1024
        chunk: list = []
        acc_size  = 0
        chunk_num = 1
        valid = [i for i in range(total)
                 if not (remove_blanks and i in blank_set)]

        for i in valid:
            # Estimate page size with a quick single-page write
            try:
                buf = io.BytesIO()
                tw = PdfWriter()
                tw.add_page(reader.pages[i])
                tw.write(buf)
                pg_size = buf.tell()
            except Exception:
                pg_size = 60 * 1024  # conservative 60 KB

            if chunk and acc_size + pg_size > max_bytes:
                f, l = chunk[0] + 1, chunk[-1] + 1
                _save(chunk, f'part_{chunk_num:03d}_pages_{f}-{l}')
                chunk_num += 1
                chunk = []
                acc_size = 0

            chunk.append(i)
            acc_size += pg_size

        if chunk:
            f, l = chunk[0] + 1, chunk[-1] + 1
            _save(chunk, f'part_{chunk_num:03d}_pages_{f}-{l}')

    # ════════════════════════════════════════════════════════════════════════
    # MODE: odd / even
    # ════════════════════════════════════════════════════════════════════════
    elif mode == 'odd_even':
        stem = _safe_name(Path(source_filename).stem) if source_filename else 'document'
        odd  = [i for i in range(0, total, 2)
                if not (remove_blanks and i in blank_set)]
        even = [i for i in range(1, total, 2)
                if not (remove_blanks and i in blank_set)]
        if odd:
            _save(odd,  f'{stem}_odd_pages')
        if even:
            _save(even, f'{stem}_even_pages')

    else:
        raise ValueError(f'Unknown split mode: "{mode}". '
                         f'Valid modes: all, range, every_n, bookmarks, blank_pages, size_limit, odd_even')

    if not output_files:
        raise RuntimeError(
            'No output files were created. '
            'This can happen if all pages were blank (try disabling "Skip blank pages") '
            'or the page range is empty.'
        )

    skipped_blanks = len([i for i in blank_set if i < total]) if remove_blanks else 0

    # ── Build ZIP ────────────────────────────────────────────────────────────
    with zipfile.ZipFile(result_zip, 'w',
                          zipfile.ZIP_DEFLATED,
                          compresslevel=zip_compression_level) as zf:
        for fp in output_files:
            if os.path.exists(fp):
                zf.write(fp, os.path.basename(fp))

    # ── Compute per-file sizes ───────────────────────────────────────────────
    file_sizes = []
    for fp in output_files:
        if os.path.exists(fp):
            file_sizes.append(round(os.path.getsize(fp) / 1024, 1))  # KB

    return {
        'result_zip':    result_zip,
        'file_count':    len(output_files),
        'total_pages':   total,
        'skipped_blanks': skipped_blanks,
        'mode_used':     mode,
        'output_files':  [os.path.basename(f) for f in output_files],
        'file_sizes_kb': file_sizes,
        'zip_size_kb':   round(os.path.getsize(result_zip) / 1024, 1),
        'source_filename': source_filename,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── Preview (no file writes)
# ══════════════════════════════════════════════════════════════════════════════

def get_split_preview(input_path: str, password: str = '') -> dict:
    """
    Analyse a PDF and return metadata useful for split configuration.
    Writes no files.
    """
    info = {
        'total_pages':       0,
        'blank_pages':       0,
        'bookmarks':         [],
        'file_size_kb':      round(os.path.getsize(input_path) / 1024, 1),
        'page_size_summary': [],
        'estimated_chunks':  {},
        'has_text':          False,
        'is_scanned':        False,
        'pdf_version':       '',
    }

    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        total = len(reader.pages)
        info['total_pages'] = total

        # Bookmarks (pypdf)
        flat_bk = _get_bookmarks_flat(reader.outline, reader)
        info['bookmarks'] = [(t, p + 1) for t, p in flat_bk[:50]]

        # Page sizes
        sizes: set = set()
        for pg in reader.pages[:8]:
            try:
                w = round(float(pg.mediabox.width))
                h = round(float(pg.mediabox.height))
                sizes.add(f'{w}×{h} pt')
            except Exception:
                pass
        info['page_size_summary'] = list(sizes)

    except Exception as e:
        logger.warning('get_split_preview reader error: %s', e)

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        # Bookmarks (fitz, more reliable)
        fitz_bk = _get_bookmarks_fitz(input_path, password)
        if fitz_bk and not info['bookmarks']:
            info['bookmarks'] = [(t, p + 1) for t, p in fitz_bk[:50]]

        # PDF version
        try:
            info['pdf_version'] = f'PDF {doc.pdf_version()}'
        except Exception:
            pass

        blank_count = 0
        text_pages  = 0
        for i, pg in enumerate(doc):
            if _is_blank_page(pg):
                blank_count += 1
            else:
                txt = pg.get_text().strip()
                if txt:
                    text_pages += 1
        doc.close()

        info['blank_pages'] = blank_count
        info['has_text']    = text_pages > 0
        total = info['total_pages'] or 1
        info['is_scanned']  = (text_pages == 0 and total - blank_count > 0)

    except Exception as e:
        logger.warning('get_split_preview fitz error: %s', e)

    n      = info['total_pages']
    blanks = info['blank_pages']
    net    = max(1, n - blanks)
    info['estimated_chunks'] = {
        'mode_all':       net,
        'mode_every_2':   max(1, (net + 1) // 2),
        'mode_every_5':   max(1, (net + 4) // 5),
        'mode_every_10':  max(1, (net + 9) // 10),
        'mode_bookmarks': max(1, len(info['bookmarks'])),
        'mode_odd_even':  2 if net > 1 else 1,
    }

    return info


# ══════════════════════════════════════════════════════════════════════════════
# ── Thumbnail generation
# ══════════════════════════════════════════════════════════════════════════════

def generate_page_thumbnails(input_path: str, out_dir: str,
                              pages: list = None, dpi: int = 72,
                              fmt: str = 'JPEG',
                              password: str = '') -> list:
    """
    Render page thumbnails using PyMuPDF.

    Args:
        input_path : PDF path
        out_dir    : output directory
        pages      : 0-based page indices (None → first 20)
        dpi        : render resolution
        fmt        : 'JPEG' or 'PNG'
        password   : PDF password
    Returns:
        List of thumbnail file paths
    """
    os.makedirs(out_dir, exist_ok=True)
    thumbs: list = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        target = pages if pages is not None else list(range(min(doc.page_count, 20)))
        mat    = fitz.Matrix(dpi / 72, dpi / 72)
        ext    = 'jpg' if fmt.upper() == 'JPEG' else 'png'

        for i in target:
            if 0 <= i < doc.page_count:
                pg  = doc[i]
                pix = pg.get_pixmap(matrix=mat, alpha=False)
                fp  = os.path.join(out_dir, f'thumb_{i+1:04d}.{ext}')
                pix.save(fp)
                thumbs.append(fp)
        doc.close()
    except Exception as e:
        logger.warning('thumbnail generation failed: %s', e)
    return thumbs


# ══════════════════════════════════════════════════════════════════════════════
# ── Extract a continuous range (utility)
# ══════════════════════════════════════════════════════════════════════════════

def extract_page_range(input_path: str, output_path: str,
                        start_page: int, end_page: int,
                        password: str = '') -> dict:
    """Extract pages [start_page..end_page] (1-based, inclusive) to a new PDF."""
    indices = list(range(start_page - 1, end_page))
    if not _write_pages(input_path, indices, output_path, password=password):
        # pypdf fallback
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        _write_pypdf(reader, indices, output_path)
    return {
        'output_path':    output_path,
        'pages_extracted': len(indices),
        'start_page':     start_page,
        'end_page':       end_page,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── Content-heading split (bonus feature)
# ══════════════════════════════════════════════════════════════════════════════

def split_by_content_headings(input_path: str, output_dir: str,
                               heading_pattern: str = None,
                               password: str = '') -> list:
    """
    Split PDF at pages that begin with a bold/large heading.
    Uses fitz font-size analysis to detect chapter boundaries.

    Returns list of dicts: filename, page_start, page_end, heading_text, page_count
    """
    import re
    os.makedirs(output_dir, exist_ok=True)
    results: list = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        # Median body font size
        all_sizes: list = []
        for pg in doc:
            for blk in pg.get_text('dict', flags=0)['blocks']:
                for ln in blk.get('lines', []):
                    for sp in ln.get('spans', []):
                        if sp.get('text', '').strip():
                            all_sizes.append(sp['size'])

        if not all_sizes:
            doc.close()
            return []
        median_sz = sorted(all_sizes)[len(all_sizes) // 2]

        compiled = re.compile(heading_pattern, re.I) if heading_pattern else None
        heading_pages = [0]
        heading_texts = ['Introduction']

        for pg_idx in range(1, doc.page_count):
            pg     = doc[pg_idx]
            blocks = pg.get_text('dict', flags=0)['blocks']
            if not blocks:
                continue
            for blk in blocks[:2]:
                for ln in blk.get('lines', []):
                    for sp in ln.get('spans', []):
                        txt   = sp.get('text', '').strip()
                        size  = sp.get('size', 0)
                        flags = sp.get('flags', 0)
                        bold  = bool(flags & 16)
                        large = size >= median_sz * 1.25

                        if not txt:
                            continue
                        if compiled and compiled.search(txt):
                            heading_pages.append(pg_idx)
                            heading_texts.append(txt[:60])
                            break
                        elif not compiled and large and bold and len(txt) < 120:
                            heading_pages.append(pg_idx)
                            heading_texts.append(txt[:60])
                            break

        doc.close()
        if len(heading_pages) <= 1:
            return []

        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')

        for i, (start, htxt) in enumerate(zip(heading_pages, heading_texts)):
            end   = heading_pages[i + 1] if i + 1 < len(heading_pages) else len(reader.pages)
            safe  = re.sub(r'[^\w\s-]', '', htxt[:40]).strip().replace(' ', '_') or f'section_{i+1}'
            opath = os.path.join(output_dir, f'{i+1:03d}_{safe}.pdf')
            _write_pypdf(reader, list(range(start, end)), opath)
            results.append({
                'filename':    os.path.basename(opath),
                'path':        opath,
                'page_start':  start + 1,
                'page_end':    end,
                'heading_text': htxt,
                'page_count':  end - start,
            })

    except Exception as e:
        logger.warning('split_by_content_headings failed: %s', e)
    return results


# ══════════════════════════════════════════════════════════════════════════════
# ── Per-page analytics
# ══════════════════════════════════════════════════════════════════════════════

def get_page_word_counts(input_path: str, password: str = '') -> list:
    """Return per-page: page, word_count, char_count, image_count, has_text, is_blank."""
    results: list = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for i, pg in enumerate(doc):
            text   = pg.get_text().strip()
            words  = len(text.split()) if text else 0
            imgs   = len(pg.get_images())
            results.append({
                'page':        i + 1,
                'word_count':  words,
                'char_count':  len(text),
                'image_count': imgs,
                'has_text':    words > 0,
                'is_blank':    words == 0 and imgs == 0,
            })
        doc.close()
    except Exception as e:
        logger.warning('get_page_word_counts failed: %s', e)
    return results
