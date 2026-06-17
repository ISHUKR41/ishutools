"""
pdf_split.py - Enterprise PDF Split Suite
IshuTools.fun | Professional PDF Suite

Split modes:
  - all:         One file per page
  - range:       Specific pages → one output file
  - every_n:     Chunks of N pages
  - bookmarks:   Split at top-level bookmark boundaries
  - blank_pages: Split at detected blank separator pages
  - size_limit:  Split when accumulated size exceeds threshold (MB)
  - odd_even:    Separate odd and even pages

Features:
  - Ghostscript burst mode (best quality per-page split)
  - qpdf per-page extraction
  - PyMuPDF blank page detection (pixel analysis + Otsu)
  - Content-based section detection (heading detection via OCR/text)
  - Metadata preservation per split file
  - Custom naming patterns ({n}, {title}, {date})
  - Zip archive output with compression levels
  - Batch split directory
  - Split preview (no files written)
  - Page thumbnail generation
  - Encryption support
"""

import os
import io
import re
import shutil
import subprocess
import tempfile
import zipfile
import logging
from datetime import datetime
from typing import Optional

import fitz
import pikepdf
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
from PIL import Image

logger = logging.getLogger(__name__)

GS_BIN = shutil.which('gs') or shutil.which('ghostscript')
QPDF_BIN = shutil.which('qpdf')


# ── Page range parser ─────────────────────────────────────────────────────────

def parse_ranges(ranges_str: str, total_pages: int) -> list:
    """Parse '1-3,5,7-9' into sorted 0-indexed page numbers."""
    pages = set()
    for part in str(ranges_str).replace(' ', '').split(','):
        if '-' in part:
            a, b = part.split('-', 1)
            try:
                s = max(0, int(a) - 1)
                e = min(total_pages - 1, int(b) - 1)
                pages.update(range(s, e + 1))
            except ValueError:
                pass
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total_pages:
                pages.add(idx)
    return sorted(pages)


# ── Blank page detection ──────────────────────────────────────────────────────

def _is_blank_page(fitz_page, threshold: float = 0.98,
                   min_text_chars: int = 5) -> bool:
    """Detect if a page is blank using pixel analysis and text content."""
    # Quick text check first
    try:
        text = fitz_page.get_text().strip()
        if len(text) >= min_text_chars:
            return False
    except Exception:
        pass

    # Pixel analysis
    try:
        pix = fitz_page.get_pixmap(dpi=36, colorspace=fitz.csGRAY)
        samples = pix.samples
        if not samples:
            return True
        total = len(samples)
        white = sum(1 for b in samples if b > 235)
        return (white / total) >= threshold
    except Exception:
        return len(fitz_page.get_text().strip()) == 0


def _detect_blank_pages(input_path: str, threshold: float = 0.98) -> set:
    """Return set of 0-based indices of blank pages."""
    blank = set()
    try:
        doc = fitz.open(input_path)
        for i, pg in enumerate(doc):
            if _is_blank_page(pg, threshold):
                blank.add(i)
        doc.close()
    except Exception:
        pass
    return blank


# ── Write helpers ─────────────────────────────────────────────────────────────

def _write_part(reader: PdfReader, page_indices: list,
                out_path: str, base_metadata: dict = None,
                compress: bool = True):
    """Write selected pages from reader to out_path."""
    writer = PdfWriter()
    for idx in page_indices:
        if 0 <= idx < len(reader.pages):
            writer.add_page(reader.pages[idx])
    if base_metadata:
        try:
            writer.add_metadata(base_metadata)
        except Exception:
            pass
    if compress:
        try:
            writer.compress_identical_objects(remove_identicals=True,
                                               remove_orphans=True)
        except Exception:
            pass
    with open(out_path, 'wb') as f:
        writer.write(f)


def _write_part_pikepdf(src_path: str, page_indices: list, out_path: str):
    """Write selected pages using pikepdf for better fidelity."""
    try:
        with pikepdf.open(src_path) as src_pdf:
            new_pdf = pikepdf.new()
            for idx in page_indices:
                if 0 <= idx < len(src_pdf.pages):
                    new_pdf.pages.append(src_pdf.pages[idx])
            new_pdf.save(out_path,
                         compress_streams=True,
                         object_stream_mode=pikepdf.ObjectStreamMode.generate)
        return True
    except Exception:
        return False


def _write_part_fitz(src_path: str, page_indices: list, out_path: str) -> bool:
    """Write selected pages using PyMuPDF."""
    try:
        src = fitz.open(src_path)
        out = fitz.open()
        for idx in sorted(page_indices):
            if 0 <= idx < len(src):
                out.insert_pdf(src, from_page=idx, to_page=idx)
        out.save(out_path, garbage=4, deflate=True)
        out.close()
        src.close()
        return True
    except Exception:
        return False


# ── GS burst ─────────────────────────────────────────────────────────────────

def _gs_burst(input_path: str, out_dir: str,
              naming: str = 'page_%04d.pdf') -> list:
    """Use Ghostscript to burst PDF into individual pages."""
    if not GS_BIN:
        return []
    try:
        out_pattern = os.path.join(out_dir, naming)
        cmd = [
            GS_BIN, '-q', '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.5',
            f'-sOutputFile={out_pattern}',
            input_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0:
            import glob
            return sorted(glob.glob(os.path.join(out_dir, 'page_*.pdf')))
        return []
    except Exception as e:
        logger.warning(f'GS burst failed: {e}')
        return []


# ── qpdf page extraction ──────────────────────────────────────────────────────

def _qpdf_extract_pages(input_path: str, page_indices: list,
                         out_path: str) -> bool:
    """Use qpdf to extract specific pages (1-based)."""
    if not QPDF_BIN:
        return False
    try:
        pages_arg = ','.join(str(i + 1) for i in page_indices)
        cmd = [
            QPDF_BIN, input_path,
            '--pages', input_path, pages_arg,
            '--',
            out_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode == 0 and os.path.exists(out_path) and \
               os.path.getsize(out_path) > 100
    except Exception:
        return False


# ── Bookmark helpers ──────────────────────────────────────────────────────────

def _get_bookmarks_flat(outline, reader) -> list:
    """Flatten nested PDF outline → list of (title, page_idx) tuples."""
    results = []
    def _recurse(items):
        for item in items:
            if isinstance(item, list):
                _recurse(item)
            else:
                try:
                    page_idx = reader.get_destination_page_number(item)
                    results.append((str(item.title), page_idx))
                except Exception:
                    pass
    try:
        _recurse(outline)
    except Exception:
        pass
    return results


# ── Safe filename ─────────────────────────────────────────────────────────────

def _safe_name(name: str, max_len: int = 50) -> str:
    """Convert arbitrary string to safe filename."""
    name = re.sub(r'[^\w\s\-]', '_', name)
    name = re.sub(r'\s+', '_', name).strip('_')
    return name[:max_len] or 'section'


# ── Naming pattern renderer ───────────────────────────────────────────────────

def _render_name(pattern: str, n: int, title: str = '',
                 date: str = None) -> str:
    """Render naming pattern with {n}, {n:04d}, {title}, {date}."""
    date = date or datetime.utcnow().strftime('%Y%m%d')
    try:
        name = pattern.format(n=n, title=_safe_name(title),
                               date=date, N=n)
    except Exception:
        name = f'part_{n:04d}'
    return name


# ── Main API ──────────────────────────────────────────────────────────────────

def split_pdf(
    input_path: str,
    out_dir: str,
    result_zip: str,
    mode: str = 'all',
    ranges: str = '',
    every_n: int = 1,
    password: str = '',
    max_size_mb: float = 0.0,
    remove_blanks: bool = False,
    naming_pattern: str = 'page_{n:04d}',
    blank_threshold: float = 0.98,
    compress_output: bool = True,
    use_pikepdf: bool = True,
    zip_compression_level: int = 6,
) -> dict:
    """
    Split a PDF using various strategies.

    Args:
        input_path:         Source PDF
        out_dir:            Directory to store split files
        result_zip:         Path for ZIP archive of results
        mode:               'all' | 'range' | 'every_n' | 'bookmarks' |
                            'blank_pages' | 'size_limit' | 'odd_even'
        ranges:             Page range string (mode='range')
        every_n:            Pages per chunk (mode='every_n')
        password:           PDF password if encrypted
        max_size_mb:        Target max MB per part (mode='size_limit')
        remove_blanks:      Skip blank pages in output
        naming_pattern:     Filename pattern {n}, {title}, {date}
        blank_threshold:    Whiteness threshold for blank detection (0-1)
        compress_output:    Compress each split PDF
        use_pikepdf:        Use pikepdf for writing (higher fidelity)
        zip_compression_level: ZIP deflate level (0-9)

    Returns:
        dict: result_zip, file_count, total_pages, skipped_blanks, mode_used
    """
    os.makedirs(out_dir, exist_ok=True)

    reader = PdfReader(input_path)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    total = len(reader.pages)

    # Base metadata
    base_meta = {}
    try:
        if reader.metadata:
            base_meta = dict(reader.metadata)
            base_meta['/Producer'] = 'IshuTools.fun PDF Suite'
            base_meta['/ModDate'] = datetime.utcnow().strftime(
                "D:%Y%m%d%H%M%S+00'00'")
    except Exception:
        pass

    # Detect blank pages
    blank_indices = _detect_blank_pages(input_path, blank_threshold) \
        if remove_blanks else set()
    skipped_blanks = 0

    output_files = []
    date_str = datetime.utcnow().strftime('%Y%m%d')

    def _write(indices, out_name, title=''):
        """Write pages to out_dir/out_name.pdf and add to output_files."""
        active = [i for i in indices if i not in blank_indices]
        if not active:
            return
        out_file = os.path.join(out_dir, out_name + '.pdf')
        written = False
        if use_pikepdf:
            written = _write_part_pikepdf(input_path, active, out_file)
        if not written:
            written = _write_part_fitz(input_path, active, out_file)
        if not written:
            _write_part(reader, active, out_file, base_meta, compress_output)
        output_files.append(out_file)

    # ── mode: all (one page per file) ────────────────────────────────────────
    if mode == 'all':
        for i in range(total):
            if i in blank_indices:
                skipped_blanks += 1
                continue
            name = _render_name(naming_pattern, i + 1, date=date_str)
            _write([i], name)

    # ── mode: range ───────────────────────────────────────────────────────────
    elif mode == 'range':
        page_indices = [i for i in parse_ranges(ranges, total)
                        if i not in blank_indices]
        if not page_indices:
            raise ValueError('No valid pages in specified range.')
        _write(page_indices, 'extracted_range')

    # ── mode: every_n ─────────────────────────────────────────────────────────
    elif mode == 'every_n':
        n = max(1, every_n)
        valid = [i for i in range(total) if i not in blank_indices]
        for chunk_num, start in enumerate(range(0, len(valid), n), start=1):
            chunk = valid[start:start + n]
            first = chunk[0] + 1
            last = chunk[-1] + 1
            name = _render_name(naming_pattern, chunk_num,
                                 title=f'part_{chunk_num}', date=date_str)
            _write(chunk, f'{name}_pages_{first}-{last}')

    # ── mode: bookmarks ───────────────────────────────────────────────────────
    elif mode == 'bookmarks':
        flat = _get_bookmarks_flat(reader.outline, reader)
        if not flat:
            flat = [(f'Page {i+1}', i) for i in range(total)]

        flat.append(('_END_', total))
        for seg_idx in range(len(flat) - 1):
            title, start_idx = flat[seg_idx]
            _, next_idx = flat[seg_idx + 1]
            seg_pages = [i for i in range(start_idx, next_idx)]
            if not seg_pages:
                continue
            name = f'{seg_idx+1:03d}_{_safe_name(title)}'
            _write(seg_pages, name, title=title)

    # ── mode: blank_pages ─────────────────────────────────────────────────────
    elif mode == 'blank_pages':
        blanks = _detect_blank_pages(input_path, blank_threshold)
        current_chunk = []
        chunk_num = 1
        for i in range(total):
            if i in blanks:
                if current_chunk:
                    first = current_chunk[0] + 1
                    last = current_chunk[-1] + 1
                    name = f'section_{chunk_num:03d}_pages_{first}-{last}'
                    _write(current_chunk, name)
                    chunk_num += 1
                    current_chunk = []
            else:
                current_chunk.append(i)
        if current_chunk:
            first = current_chunk[0] + 1
            last = current_chunk[-1] + 1
            _write(current_chunk, f'section_{chunk_num:03d}_pages_{first}-{last}')

    # ── mode: size_limit ──────────────────────────────────────────────────────
    elif mode == 'size_limit':
        max_bytes = max(0.1, max_size_mb) * 1024 * 1024
        current_chunk = []
        current_size = 0
        chunk_num = 1
        valid = [i for i in range(total) if i not in blank_indices]

        for i in valid:
            page = reader.pages[i]
            try:
                buf = io.BytesIO()
                tmp_writer = PdfWriter()
                tmp_writer.add_page(page)
                tmp_writer.write(buf)
                page_size = buf.tell()
            except Exception:
                page_size = 50 * 1024  # estimate 50KB

            if current_chunk and current_size + page_size > max_bytes:
                first = current_chunk[0] + 1
                last = current_chunk[-1] + 1
                name = f'part_{chunk_num:03d}_pages_{first}-{last}'
                _write(current_chunk, name)
                chunk_num += 1
                current_chunk = []
                current_size = 0

            current_chunk.append(i)
            current_size += page_size

        if current_chunk:
            first = current_chunk[0] + 1
            last = current_chunk[-1] + 1
            _write(current_chunk, f'part_{chunk_num:03d}_pages_{first}-{last}')

    # ── mode: odd_even ────────────────────────────────────────────────────────
    elif mode == 'odd_even':
        odd_pages = [i for i in range(0, total, 2) if i not in blank_indices]
        even_pages = [i for i in range(1, total, 2) if i not in blank_indices]
        if odd_pages:
            _write(odd_pages, 'odd_pages')
        if even_pages:
            _write(even_pages, 'even_pages')

    else:
        raise ValueError(f'Unknown split mode: {mode}')

    if not output_files:
        raise RuntimeError('No output files created. Check mode and page selection.')

    skipped_blanks = sum(1 for i in blank_indices if i < total)

    # Create ZIP archive
    with zipfile.ZipFile(result_zip, 'w',
                          zipfile.ZIP_DEFLATED,
                          compresslevel=zip_compression_level) as zf:
        for fp in output_files:
            if os.path.exists(fp):
                zf.write(fp, os.path.basename(fp))

    return {
        'result_zip': result_zip,
        'file_count': len(output_files),
        'total_pages': total,
        'skipped_blanks': skipped_blanks,
        'mode_used': mode,
        'output_files': [os.path.basename(f) for f in output_files],
    }


# ── Thumbnail generation ──────────────────────────────────────────────────────

def generate_page_thumbnails(input_path: str, out_dir: str,
                              pages: list = None, dpi: int = 72,
                              format: str = 'JPEG',
                              password: str = '') -> list:
    """
    Generate thumbnail images for PDF pages.

    Args:
        input_path: PDF file path
        out_dir:    Output directory for thumbnails
        pages:      0-based page indices (None = all pages, max 20)
        dpi:        Render DPI
        format:     'JPEG' or 'PNG'
        password:   PDF password
    Returns:
        List of thumbnail file paths
    """
    os.makedirs(out_dir, exist_ok=True)
    thumbs = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted and password:
            doc.authenticate(password)

        target_pages = pages if pages is not None else list(range(min(doc.page_count, 20)))

        for i in target_pages:
            if 0 <= i < doc.page_count:
                page = doc[i]
                mat = fitz.Matrix(dpi / 72, dpi / 72)
                pix = page.get_pixmap(matrix=mat)
                ext = 'jpg' if format.upper() == 'JPEG' else 'png'
                out_file = os.path.join(out_dir, f'thumb_{i+1:04d}.{ext}')
                pix.save(out_file)
                thumbs.append(out_file)
        doc.close()
    except Exception as e:
        logger.warning(f'Thumbnail generation failed: {e}')
    return thumbs


# ── Split preview ─────────────────────────────────────────────────────────────

def get_split_preview(input_path: str, password: str = '') -> dict:
    """
    Preview split results without writing any files.

    Returns dict with total_pages, blank_pages, bookmarks,
    file_size_kb, page_size_summary, estimated_chunks.
    """
    info = {
        'total_pages': 0,
        'blank_pages': 0,
        'bookmarks': [],
        'file_size_kb': round(os.path.getsize(input_path) / 1024, 1),
        'page_size_summary': [],
        'estimated_chunks': {},
    }
    try:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        info['total_pages'] = len(reader.pages)

        flat = _get_bookmarks_flat(reader.outline, reader)
        info['bookmarks'] = [(t, p + 1) for t, p in flat[:30]]

        sizes = set()
        for p in reader.pages[:10]:
            w = round(float(p.mediabox.width))
            h = round(float(p.mediabox.height))
            sizes.add(f'{w}x{h}pt')
        info['page_size_summary'] = list(sizes)

    except Exception:
        pass

    try:
        doc = fitz.open(input_path)
        for i, pg in enumerate(doc):
            if _is_blank_page(pg):
                info['blank_pages'] += 1
        doc.close()
    except Exception:
        pass

    n = info['total_pages']
    blanks = info['blank_pages']
    info['estimated_chunks'] = {
        'mode_all': n - blanks,
        'mode_every_2': max(1, (n - blanks + 1) // 2),
        'mode_every_5': max(1, (n - blanks + 4) // 5),
        'mode_bookmarks': max(1, len(info['bookmarks'])),
    }

    return info


def extract_page_range(input_path: str, output_path: str,
                        start_page: int, end_page: int,
                        password: str = '') -> dict:
    """
    Extract a continuous page range into a single PDF.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        start_page:  1-based start page
        end_page:    1-based end page (inclusive)
        password:    PDF password
    Returns:
        dict with output_path, pages_extracted
    """
    indices = list(range(start_page - 1, end_page))
    written = _write_part_pikepdf(input_path, indices, output_path)
    if not written:
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')
        _write_part(reader, indices, output_path)
    return {
        'output_path': output_path,
        'pages_extracted': len(indices),
        'start_page': start_page,
        'end_page': end_page,
    }


# ── Additional Enterprise Split Functions ──────────────────────────────────────


def split_by_content_headings(input_path: str, output_dir: str,
                               heading_pattern: str = None,
                               password: str = '') -> list:
    """
    Split a PDF at pages that begin with a heading/chapter marker.

    Uses fitz text analysis to detect heading-like text (large bold font
    at top of page) and splits at each heading boundary.

    Args:
        input_path:      Source PDF
        output_dir:      Directory to write split files
        heading_pattern: Optional regex pattern for heading detection
        password:        PDF password if encrypted

    Returns:
        List of dicts: filename, page_start, page_end, heading_text
    """
    import re, os
    os.makedirs(output_dir, exist_ok=True)

    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')

        # Detect median body font size
        all_sizes = []
        for pg in doc:
            for blk in pg.get_text('dict', flags=0)['blocks']:
                for ln in blk.get('lines', []):
                    for sp in ln.get('spans', []):
                        if sp.get('text', '').strip():
                            all_sizes.append(sp['size'])
        median_size = sorted(all_sizes)[len(all_sizes) // 2] if all_sizes else 12

        # Find heading pages
        heading_pages = [0]  # Always start a section at page 0
        heading_texts = ['Start']

        compiled = re.compile(heading_pattern, re.I) if heading_pattern else None

        for pg_idx in range(1, doc.page_count):
            pg = doc[pg_idx]
            blocks = pg.get_text('dict', flags=0)['blocks']
            if not blocks:
                continue
            first_block = blocks[0]
            for ln in first_block.get('lines', []):
                for sp in ln.get('spans', []):
                    txt = sp.get('text', '').strip()
                    size = sp.get('size', 0)
                    flags = sp.get('flags', 0)
                    is_bold = bool(flags & 2**4)
                    is_large = size >= median_size * 1.3

                    if compiled:
                        if compiled.search(txt):
                            heading_pages.append(pg_idx)
                            heading_texts.append(txt[:60])
                            break
                    elif is_large and is_bold and len(txt) < 120 and txt:
                        heading_pages.append(pg_idx)
                        heading_texts.append(txt[:60])
                        break

        doc.close()
        if len(heading_pages) <= 1:
            return []

        # Write split files
        results = []
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            reader.decrypt(password or '')

        for i, (start, htxt) in enumerate(zip(heading_pages, heading_texts)):
            end = heading_pages[i + 1] if i + 1 < len(heading_pages) else len(reader.pages)
            safe = re.sub(r'[^\w\s-]', '', htxt[:40]).strip().replace(' ', '_') or f'section_{i+1}'
            out_path = os.path.join(output_dir, f'{i+1:03d}_{safe}.pdf')
            writer = PdfWriter()
            for pg_i in range(start, end):
                if pg_i < len(reader.pages):
                    writer.add_page(reader.pages[pg_i])
            with open(out_path, 'wb') as f:
                writer.write(f)
            results.append({
                'filename': os.path.basename(out_path),
                'path': out_path,
                'page_start': start + 1,
                'page_end': end,
                'heading_text': htxt,
                'page_count': end - start,
            })

        return results

    except Exception as e:
        logger.warning(f'split_by_content_headings failed: {e}')
        return []


def merge_split_outputs(split_dir: str, output_path: str,
                         sort_by: str = 'name') -> dict:
    """
    Re-merge all PDFs in a split output directory back into one file.
    Useful for round-trip testing or re-merging after editing split pages.

    Args:
        split_dir:  Directory with split PDF files
        output_path: Output merged PDF path
        sort_by:    'name' | 'mtime' | 'size' - sort order

    Returns:
        dict: file_count, total_pages, output_path
    """
    import glob, os
    pdf_files = glob.glob(os.path.join(split_dir, '*.pdf'))
    if not pdf_files:
        raise ValueError(f'No PDF files found in {split_dir}')

    if sort_by == 'mtime':
        pdf_files.sort(key=lambda p: os.path.getmtime(p))
    elif sort_by == 'size':
        pdf_files.sort(key=lambda p: os.path.getsize(p))
    else:
        pdf_files.sort()

    writer = PdfWriter()
    total_pages = 0
    for path in pdf_files:
        try:
            reader = PdfReader(path)
            for pg in reader.pages:
                writer.add_page(pg)
                total_pages += 1
        except Exception as e:
            logger.warning(f'Skipping {path}: {e}')

    with open(output_path, 'wb') as f:
        writer.write(f)

    return {
        'file_count': len(pdf_files),
        'total_pages': total_pages,
        'output_path': output_path,
    }


def get_page_word_counts(input_path: str, password: str = '') -> list:
    """
    Return per-page word count, character count, and image count.
    Useful for content analysis before splitting.

    Returns:
        List of dicts per page: page, word_count, char_count, image_count,
        has_text, is_blank
    """
    results = []
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            doc.authenticate(password or '')
        for i, pg in enumerate(doc):
            text = pg.get_text().strip()
            words = len(text.split()) if text else 0
            imgs = len(pg.get_images())
            results.append({
                'page': i + 1,
                'word_count': words,
                'char_count': len(text),
                'image_count': imgs,
                'has_text': words > 0,
                'is_blank': words == 0 and imgs == 0,
            })
        doc.close()
    except Exception as e:
        logger.warning(f'get_page_word_counts failed: {e}')
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# ── ENTERPRISE ADDITIONS - Smart split, content-aware, bookmark-based ────────
# ═══════════════════════════════════════════════════════════════════════════════

def split_by_bookmarks(input_path: str, output_dir: str,
                        password: str = '') -> dict:
    """
    Split a PDF into separate files based on its bookmark (TOC) structure.
    Each top-level bookmark becomes a separate PDF file.

    Returns list of created files with their bookmark titles.
    """
    import fitz, os

    doc = fitz.open(input_path)
    if doc.is_encrypted and password:
        doc.authenticate(password)

    toc = doc.get_toc()
    if not toc:
        raise ValueError('No bookmarks found in this PDF. Use page-range split instead.')

    # Filter top-level bookmarks (level 1)
    top_bookmarks = [(title, page - 1) for level, title, page in toc if level == 1]

    created_files = []
    for i, (title, start_page) in enumerate(top_bookmarks):
        end_page = top_bookmarks[i + 1][1] - 1 if i + 1 < len(top_bookmarks) else doc.page_count - 1

        safe_title = ''.join(c if c.isalnum() or c in ' -_' else '_' for c in title)[:50]
        out_name = f'{i+1:02d}_{safe_title}.pdf'
        out_path = os.path.join(output_dir, out_name)

        out_doc = fitz.open()
        out_doc.insert_pdf(doc, from_page=start_page, to_page=end_page)
        out_doc.save(out_path, garbage=4, deflate=True)
        out_doc.close()
        created_files.append({'file': out_name, 'title': title,
                               'pages': end_page - start_page + 1})

    doc.close()
    return {'created': created_files, 'total_sections': len(created_files)}


def split_by_file_size(input_path: str, output_dir: str,
                        max_size_mb: float = 10.0,
                        password: str = '') -> dict:
    """
    Split a PDF so each output part is no larger than max_size_mb.
    Pages are grouped greedily until the target size is reached.
    """
    import fitz, os

    doc = fitz.open(input_path)
    if doc.is_encrypted and password:
        doc.authenticate(password)

    max_bytes = int(max_size_mb * 1024 * 1024)
    parts = []
    current_pages = []
    part_num = 1

    for pg_idx in range(doc.page_count):
        current_pages.append(pg_idx)

        # Estimate size by building the part
        if len(current_pages) % 5 == 0 or pg_idx == doc.page_count - 1:
            test_doc = fitz.open()
            for p in current_pages:
                test_doc.insert_pdf(doc, from_page=p, to_page=p)
            import io
            buf = io.BytesIO()
            test_doc.save(buf)
            est_size = buf.tell()
            test_doc.close()

            if est_size > max_bytes and len(current_pages) > 1:
                # Save without the last page
                save_pages = current_pages[:-1]
                out_path = os.path.join(output_dir, f'part_{part_num:03d}.pdf')
                out_doc = fitz.open()
                for p in save_pages:
                    out_doc.insert_pdf(doc, from_page=p, to_page=p)
                out_doc.save(out_path, garbage=4, deflate=True)
                out_doc.close()
                parts.append({'file': f'part_{part_num:03d}.pdf', 'pages': len(save_pages)})
                part_num += 1
                current_pages = [pg_idx]

    # Save remaining
    if current_pages:
        out_path = os.path.join(output_dir, f'part_{part_num:03d}.pdf')
        out_doc = fitz.open()
        for p in current_pages:
            out_doc.insert_pdf(doc, from_page=p, to_page=p)
        out_doc.save(out_path, garbage=4, deflate=True)
        out_doc.close()
        parts.append({'file': f'part_{part_num:03d}.pdf', 'pages': len(current_pages)})

    doc.close()
    return {'parts': parts, 'total_parts': len(parts)}


def split_and_zip(input_path: str, output_zip: str, mode: str = 'all',
                   ranges: str = '', every_n: int = 1) -> dict:
    """
    Split PDF and package all output files in a ZIP archive.
    This is the primary split function called by the API endpoint.
    Uses the existing split_pdf function and returns a ZIP.
    """
    import tempfile, zipfile, os

    out_dir = tempfile.mkdtemp()
    result = split_pdf.__wrapped__(input_path, out_dir, output_zip,
                                    mode=mode, ranges=ranges, every_n=every_n) \
             if hasattr(split_pdf, '__wrapped__') else \
             split_pdf(input_path, out_dir, output_zip, mode=mode,
                       ranges=ranges, every_n=every_n)
    return {'output_zip': output_zip}


# ═══════════════════════════════════════════════════════════════════════════
# ── ADDITIONAL SPLIT FUNCTIONS ──────────────────────────────────────────────


def extract_text_as_txt(input_path: str, output_txt_path: str) -> dict:
    """Extract all text from PDF to a plain .txt file."""
    import fitz
    doc = fitz.open(input_path)
    lines = []
    for pg_idx, page in enumerate(doc):
        text = page.get_text('text').strip()
        if text:
            lines.append(f'--- Page {pg_idx+1} ---')
            lines.append(text)
    doc.close()
    with open(output_txt_path, 'w', encoding='utf-8') as f:
        f.write('\n\n'.join(lines))
    return {'output_path': output_txt_path, 'page_count': doc.page_count}


def split_by_file_size(input_path: str, output_dir: str, max_size_mb: float = 5.0) -> dict:
    """Split PDF into parts each no larger than max_size_mb."""
    import fitz, os, io
    from pypdf import PdfWriter, PdfReader
    os.makedirs(output_dir, exist_ok=True)
    reader = PdfReader(input_path)
    total = len(reader.pages)
    max_bytes = int(max_size_mb * 1024 * 1024)
    parts = []
    i = 0; part_num = 1
    while i < total:
        lo, hi = 1, total - i
        while lo < hi:
            mid = (lo + hi + 1) // 2
            writer = PdfWriter()
            for j in range(i, i + mid):
                writer.add_page(reader.pages[j])
            buf = io.BytesIO()
            writer.write(buf)
            if buf.tell() <= max_bytes:
                lo = mid
            else:
                hi = mid - 1
        n = max(1, lo)
        writer = PdfWriter()
        for j in range(i, i + n):
            writer.add_page(reader.pages[j])
        out_path = os.path.join(output_dir, f'part_{part_num:03d}.pdf')
        with open(out_path, 'wb') as f:
            writer.write(f)
        parts.append({'path': out_path, 'pages': n, 'size_bytes': os.path.getsize(out_path)})
        i += n; part_num += 1
    return {'parts': parts, 'total_parts': len(parts)}


def split_at_bookmarks(input_path: str, output_dir: str) -> dict:
    """Split PDF at each top-level bookmark/outline entry."""
    import fitz, re, os
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(input_path)
    toc = doc.get_toc(simple=True)
    total = doc.page_count
    if not toc:
        return {'error': 'No bookmarks found in PDF', 'parts': []}
    top_level = [(title, page-1) for lvl, title, page in toc if lvl == 1]
    if not top_level:
        top_level = [(title, page-1) for lvl, title, page in toc]
    parts = []
    for idx, (title, start_pg) in enumerate(top_level):
        end_pg = top_level[idx+1][1] if idx+1 < len(top_level) else total
        safe_title = re.sub(r'[^\w\s-]', '', title).strip()[:50] or f'section_{idx+1}'
        out_path = os.path.join(output_dir, f'{idx+1:02d}_{safe_title}.pdf')
        sub = fitz.open()
        sub.insert_pdf(doc, from_page=start_pg, to_page=end_pg-1)
        sub.save(out_path)
        sub.close()
        parts.append({'path': out_path, 'title': title, 'pages': end_pg - start_pg})
    doc.close()
    return {'parts': parts, 'total_parts': len(parts)}


# ═══════════════════════════════════════════════════════════════════════════════
# ENTERPRISE ADVANCED FUNCTIONS - pdf_split.py
# ═══════════════════════════════════════════════════════════════════════════════

def split_by_text_pattern(input_path: str, output_dir: str, pattern: str) -> dict:
    """Split PDF wherever a page contains text matching the given regex pattern."""
    import fitz, re
    doc = fitz.open(input_path)
    os.makedirs(output_dir, exist_ok=True)
    groups = []
    current_group = []
    for i, page in enumerate(doc):
        text = page.get_text()
        if re.search(pattern, text, re.IGNORECASE) and current_group:
            groups.append(current_group[:])
            current_group = []
        current_group.append(i)
    if current_group:
        groups.append(current_group)
    output_files = []
    for gi, group in enumerate(groups):
        out_path = os.path.join(output_dir, f'part_{gi+1:03d}.pdf')
        out_doc = fitz.open()
        for pg in group:
            out_doc.insert_pdf(doc, from_page=pg, to_page=pg)
        out_doc.save(out_path, garbage=4, deflate=True)
        out_doc.close()
        output_files.append(out_path)
    doc.close()
    return {'output_files': output_files, 'part_count': len(groups), 'pattern': pattern}

def split_extract_odd_even(input_path: str, odd_path: str, even_path: str) -> dict:
    """Split PDF into two: one with odd pages, one with even pages (for duplex printing)."""
    import fitz
    doc = fitz.open(input_path)
    odd_doc = fitz.open()
    even_doc = fitz.open()
    for i in range(len(doc)):
        if i % 2 == 0:
            odd_doc.insert_pdf(doc, from_page=i, to_page=i)
        else:
            even_doc.insert_pdf(doc, from_page=i, to_page=i)
    odd_doc.save(odd_path, garbage=4, deflate=True)
    even_doc.save(even_path, garbage=4, deflate=True)
    doc.close(); odd_doc.close(); even_doc.close()
    return {'odd_path': odd_path, 'even_path': even_path, 'odd_pages': -1, 'even_pages': -1}

def split_by_max_pages(input_path: str, output_dir: str, max_pages_per_file: int = 10) -> dict:
    """Split PDF into chunks of at most max_pages_per_file pages each."""
    import fitz
    doc = fitz.open(input_path)
    os.makedirs(output_dir, exist_ok=True)
    n = len(doc)
    output_files = []
    for start in range(0, n, max_pages_per_file):
        end = min(start + max_pages_per_file - 1, n - 1)
        out_doc = fitz.open()
        out_doc.insert_pdf(doc, from_page=start, to_page=end)
        out_path = os.path.join(output_dir, f'pages_{start+1}_to_{end+1}.pdf')
        out_doc.save(out_path, garbage=4, deflate=True)
        out_doc.close()
        output_files.append(out_path)
    doc.close()
    return {'output_files': output_files, 'part_count': len(output_files), 'max_pages_per_file': max_pages_per_file}

def split_remove_blank_pages(input_path: str, output_path: str, threshold: int = 100) -> dict:
    """Split out blank pages from PDF."""
    import fitz
    doc = fitz.open(input_path)
    out = fitz.open()
    removed = 0
    for i, page in enumerate(doc):
        text = page.get_text().strip()
        pix = page.get_pixmap(matrix=fitz.Matrix(0.5,0.5), colorspace=fitz.csGRAY)
        avg = sum(pix.samples) / len(pix.samples) if pix.samples else 255
        if text or avg < 250:
            out.insert_pdf(doc, from_page=i, to_page=i)
        else:
            removed += 1
    out.save(output_path, garbage=4, deflate=True)
    total = len(out)
    out.close(); doc.close()
    return {'output_path': output_path, 'original_pages': len(doc) if not doc.is_closed else -1, 'remaining_pages': total, 'blank_pages_removed': removed}


# ═══════════════════════════════════════════════════════════════
# ENHANCED SPLIT FUNCTIONS — camelot · heading detection · smart split
# IshuTools.fun | Ishu Kumar (ISHUKR41 / ISHUKR75)
# ═══════════════════════════════════════════════════════════════

def split_and_extract_tables_csv(
    input_path: str,
    output_dir: str,
    pages: str = 'all',
    flavor: str = 'lattice',
    password: str = '',
) -> dict:
    """
    Extract all tables from a PDF and save each as a separate CSV file.
    Uses camelot (lattice/stream) with tabula fallback.

    Args:
        input_path:  Source PDF
        output_dir:  Directory for CSV output files
        pages:       Pages to process ('all' or '1,3,5-8')
        flavor:      'lattice' (bordered tables) or 'stream' (borderless)
        password:    PDF password if protected

    Returns:
        dict with csv_files, total_tables, tables_per_page
    """
    os.makedirs(output_dir, exist_ok=True)
    csv_files = []
    tables_per_page = {}
    errors = []

    # Try camelot first
    try:
        import camelot
        tables = camelot.read_pdf(
            input_path, pages=pages, flavor=flavor,
            password=password if password else None,
        )
        for i, tbl in enumerate(tables):
            out_csv = os.path.join(output_dir, f'table_{i+1:03d}_page{tbl.page}.csv')
            tbl.to_csv(out_csv)
            csv_files.append(out_csv)
            pg = str(tbl.page)
            tables_per_page[pg] = tables_per_page.get(pg, 0) + 1
        return {
            'csv_files': csv_files,
            'total_tables': len(csv_files),
            'tables_per_page': tables_per_page,
            'engine': 'camelot',
            'output_dir': output_dir,
        }
    except Exception as e_cam:
        errors.append(f'camelot: {e_cam}')

    # Tabula fallback
    try:
        import tabula
        dfs = tabula.read_pdf(input_path, pages=pages, multiple_tables=True)
        for i, df in enumerate(dfs):
            if df.empty:
                continue
            out_csv = os.path.join(output_dir, f'table_{i+1:03d}.csv')
            df.to_csv(out_csv, index=False)
            csv_files.append(out_csv)
        return {
            'csv_files': csv_files,
            'total_tables': len(csv_files),
            'tables_per_page': {},
            'engine': 'tabula',
            'output_dir': output_dir,
        }
    except Exception as e_tab:
        errors.append(f'tabula: {e_tab}')

    # pdfplumber fallback
    try:
        import pdfplumber
        import csv
        with pdfplumber.open(input_path, password=password if password else None) as pdf:
            tbl_num = 0
            for pg_num, pg in enumerate(pdf.pages):
                tbls = pg.extract_tables()
                for tbl in tbls:
                    if not tbl:
                        continue
                    tbl_num += 1
                    out_csv = os.path.join(output_dir, f'table_{tbl_num:03d}_page{pg_num+1}.csv')
                    with open(out_csv, 'w', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        writer.writerows(tbl)
                    csv_files.append(out_csv)
                    pg_key = str(pg_num + 1)
                    tables_per_page[pg_key] = tables_per_page.get(pg_key, 0) + 1
        return {
            'csv_files': csv_files,
            'total_tables': len(csv_files),
            'tables_per_page': tables_per_page,
            'engine': 'pdfplumber',
            'output_dir': output_dir,
        }
    except Exception as e_plumb:
        errors.append(f'pdfplumber: {e_plumb}')

    return {'csv_files': [], 'total_tables': 0, 'errors': errors}


def split_smart_by_heading(
    input_path: str,
    output_dir: str,
    result_zip: str,
    min_heading_size: float = 14.0,
    password: str = '',
) -> dict:
    """
    Smart split: detect large-font headings and split at each chapter/section.
    Uses PyMuPDF text block analysis.

    Args:
        input_path:        Source PDF
        output_dir:        Directory for split files
        result_zip:        Path for ZIP archive of results
        min_heading_size:  Minimum font size to consider as heading
        password:          PDF password if protected

    Returns:
        dict with result_zip, file_count, sections
    """
    import fitz as _fitz, zipfile, shutil

    os.makedirs(output_dir, exist_ok=True)
    doc = _fitz.open(input_path)
    if password:
        doc.authenticate(password)

    # Detect heading pages
    heading_pages = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text('dict').get('blocks', [])
        for blk in blocks:
            for line in blk.get('lines', []):
                for span in line.get('spans', []):
                    if span.get('size', 0) >= min_heading_size and span.get('text', '').strip():
                        heading_pages.append((page_num, span['text'].strip()[:50]))
                        break
                else:
                    continue
                break

    if not heading_pages:
        # No headings found — fall back to split every 10 pages
        heading_pages = [(i * 10, f'Section_{i+1}') for i in range(len(doc) // 10 + 1)]

    # Deduplicate: keep first heading per page
    seen = {}
    dedup = []
    for pnum, title in heading_pages:
        if pnum not in seen:
            seen[pnum] = True
            dedup.append((pnum, title))

    # Build sections
    sections = []
    for i, (start_pg, title) in enumerate(dedup):
        end_pg = dedup[i + 1][0] - 1 if i + 1 < len(dedup) else len(doc) - 1
        sections.append({'start': start_pg, 'end': end_pg, 'title': title})

    # Extract each section
    output_files = []
    for i, sec in enumerate(sections):
        safe_title = ''.join(c for c in sec['title'] if c.isalnum() or c in ' _-')[:30].strip()
        out_name = f'{i+1:03d}_{safe_title or "section"}.pdf'
        out_path = os.path.join(output_dir, out_name)
        new_doc = _fitz.open()
        new_doc.insert_pdf(doc, from_page=sec['start'], to_page=sec['end'])
        new_doc.save(out_path, garbage=4, deflate=True)
        new_doc.close()
        output_files.append(out_path)
        sec['output_file'] = out_name

    doc.close()

    # Zip results
    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in output_files:
            zf.write(f, os.path.basename(f))

    return {
        'result_zip': result_zip,
        'file_count': len(output_files),
        'sections': sections,
        'heading_threshold_pt': min_heading_size,
    }


def split_by_pdfplumber_text_change(
    input_path: str,
    output_dir: str,
    result_zip: str,
    similarity_threshold: float = 0.3,
    password: str = '',
) -> dict:
    """
    Split PDF at content-change boundaries detected by text similarity analysis.
    Consecutive pages with very different content trigger a new section.

    Args:
        input_path:            Source PDF
        output_dir:            Directory for output files
        result_zip:            ZIP archive path
        similarity_threshold:  Jaccard similarity below this = new section
        password:              PDF password

    Returns:
        dict with result_zip, file_count, split_points
    """
    import zipfile

    os.makedirs(output_dir, exist_ok=True)

    try:
        import pdfplumber
    except ImportError:
        return split_pdf(input_path, output_dir, result_zip, mode='every_n', every_n=5, password=password)

    def jaccard(a: str, b: str) -> float:
        wa = set(a.lower().split())
        wb = set(b.lower().split())
        if not wa or not wb:
            return 0.0
        return len(wa & wb) / len(wa | wb)

    with pdfplumber.open(input_path, password=password if password else None) as pdf:
        page_texts = [pg.extract_text() or '' for pg in pdf.pages]

    n = len(page_texts)
    split_points = [0]
    for i in range(1, n):
        sim = jaccard(page_texts[i - 1], page_texts[i])
        if sim < similarity_threshold:
            split_points.append(i)
    split_points.append(n)

    import fitz as _fitz
    doc = _fitz.open(input_path)
    if password:
        doc.authenticate(password)

    output_files = []
    for i in range(len(split_points) - 1):
        start = split_points[i]
        end = split_points[i + 1] - 1
        out_path = os.path.join(output_dir, f'section_{i+1:03d}_pages{start+1}-{end+1}.pdf')
        new_doc = _fitz.open()
        new_doc.insert_pdf(doc, from_page=start, to_page=end)
        new_doc.save(out_path, garbage=4, deflate=True)
        new_doc.close()
        output_files.append(out_path)

    doc.close()

    with zipfile.ZipFile(result_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in output_files:
            zf.write(f, os.path.basename(f))

    return {
        'result_zip': result_zip,
        'file_count': len(output_files),
        'split_points': split_points[1:-1],
        'total_pages': n,
        'sections': len(output_files),
    }


# ── ADDITIONAL FUNCTIONS — IshuTools v2.0 ────────────────────────────────────

def split_by_bookmark(input_path: str, output_dir: str) -> dict:
    """Split PDF at bookmark (outline) positions into separate files."""
    import os
    try:
        doc = fitz.open(input_path)
        toc = doc.get_toc()
        if not toc:
            doc.close()
            return {'error': 'No bookmarks found in this PDF.'}
        os.makedirs(output_dir, exist_ok=True)
        output_files = []
        for i, (level, title, page_num) in enumerate(toc):
            if level != 1:
                continue
            start_page = page_num - 1
            if i + 1 < len(toc):
                next_level1 = next((t for t in toc[i+1:] if t[0] == 1), None)
                end_page = (next_level1[2] - 2) if next_level1 else doc.page_count - 1
            else:
                end_page = doc.page_count - 1
            safe_title = ''.join(c if c.isalnum() or c in ' _-' else '_' for c in title)[:40]
            out_path = os.path.join(output_dir, f'{i+1:02d}_{safe_title}.pdf')
            new_doc = fitz.open()
            new_doc.insert_pdf(doc, from_page=start_page, to_page=end_page)
            new_doc.save(out_path, garbage=4, deflate=True)
            new_doc.close()
            output_files.append({'title': title, 'pages': f'{start_page+1}-{end_page+1}', 'file': out_path})
        doc.close()
        return {'files_created': len(output_files), 'outputs': output_files}
    except Exception as e:
        return {'error': str(e)}


def split_alternating(input_path: str, output_path_odd: str, output_path_even: str) -> dict:
    """Split PDF into odd pages (1,3,5...) and even pages (2,4,6...) for duplex printing."""
    try:
        doc = fitz.open(input_path)
        total = doc.page_count
        odd_doc = fitz.open()
        even_doc = fitz.open()
        for pg in range(total):
            if pg % 2 == 0:
                odd_doc.insert_pdf(doc, from_page=pg, to_page=pg)
            else:
                even_doc.insert_pdf(doc, from_page=pg, to_page=pg)
        odd_doc.save(output_path_odd, garbage=4, deflate=True)
        even_doc.save(output_path_even, garbage=4, deflate=True)
        odd_doc.close(); even_doc.close(); doc.close()
        return {
            'odd_file': output_path_odd, 'even_file': output_path_even,
            'odd_pages': (total + 1) // 2, 'even_pages': total // 2
        }
    except Exception as e:
        return {'error': str(e)}


def extract_blank_pages(input_path: str, output_path: str, threshold: int = 50) -> dict:
    """Remove blank or near-blank pages from a PDF (based on text/image content)."""
    try:
        doc = fitz.open(input_path)
        new_doc = fitz.open()
        removed = []
        for pg_num, page in enumerate(doc):
            text = page.get_text().strip()
            images = page.get_images()
            if len(text) < threshold and len(images) == 0:
                removed.append(pg_num + 1)
            else:
                new_doc.insert_pdf(doc, from_page=pg_num, to_page=pg_num)
        new_doc.save(output_path, garbage=4, deflate=True)
        new_doc.close(); doc.close()
        return {
            'output_path': output_path,
            'pages_removed': removed,
            'pages_kept': doc.page_count - len(removed)
        }
    except Exception as e:
        return {'error': str(e)}
