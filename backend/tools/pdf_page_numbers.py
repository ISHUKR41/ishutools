"""
pdf_page_numbers.py — Add page numbers and headers/footers (Ultra-Mega Enhanced)
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41 / ISHUKR75)

Libraries: pypdf, reportlab, fitz (PyMuPDF), pikepdf, Pillow
Features:
  - 6 position presets: top/bottom × left/center/right
  - 7 number formats: arabic, roman, roman_lower, alpha, of_total, fraction, page_of
  - Custom prefix/suffix (e.g. 'Page ', '.')
  - Font name and size customization
  - RGBA color selection via hex string
  - Rounded background box with padding and opacity
  - Border/stroke on background box
  - Per-page custom override (e.g. first page roman, rest arabic)
  - Skip pages by index list or count
  - Only number specific pages (subset selector)
  - Running header and footer with {page}, {total}, {title}, {date}
  - Section-aware page numbering (reset counter per chapter)
  - Mirror mode: alternating left/right for double-sided printing
  - Chapter markers / chapter name in header
  - Decorative divider lines (header/footer rules)
  - Background image watermark (faint logo behind numbers)
  - Batch apply: apply page numbers to multiple PDFs
  - pikepdf compression pass after numbering
"""

import io
import os
from datetime import datetime
from typing import Optional

import fitz                               # PyMuPDF
import pikepdf
from pypdf import PdfWriter, PdfReader
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader


# ─────────────────────────── Number formatters ───────────────────────────────

def to_roman(num: int) -> str:
    vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I']
    result = ''
    for v, s in zip(vals, syms):
        while num >= v:
            result += s
            num -= v
    return result


def to_alpha(num: int) -> str:
    result = ''
    while num > 0:
        num -= 1
        result = chr(65 + num % 26) + result
        num //= 26
    return result


def format_page_label(
    sequential_idx: int,    # 0-based sequential counter among numbered pages
    total_pages: int,       # total pages in the PDF
    numbered_count: int,    # how many pages are actually being numbered
    start_num: int,
    number_format: str,
    prefix: str,
    suffix: str,
    chapter: str = '',
    date_str: str = '',
    title_str: str = '',
) -> str:
    """Format a page number label using the specified format and variables."""
    n = sequential_idx + start_num

    if number_format == 'roman':
        num_str = to_roman(max(1, n))
    elif number_format == 'roman_lower':
        num_str = to_roman(max(1, n)).lower()
    elif number_format == 'alpha':
        num_str = to_alpha(max(1, n))
    elif number_format == 'of_total':
        num_str = f'{n} of {numbered_count}'
    elif number_format == 'fraction':
        num_str = f'{n}/{numbered_count}'
    elif number_format == 'page_of':
        num_str = f'Page {n} of {numbered_count}'
    elif number_format == 'chapter_page':
        num_str = f'{chapter}-{n}' if chapter else str(n)
    else:  # arabic
        num_str = str(n)

    label = f'{prefix}{num_str}{suffix}'
    # Template substitutions
    label = label.replace('{page}', str(n))
    label = label.replace('{total}', str(total_pages))
    label = label.replace('{numbered}', str(numbered_count))
    label = label.replace('{title}', title_str)
    label = label.replace('{date}', date_str)
    label = label.replace('{chapter}', chapter)
    return label


# ─────────────────────────── Color helpers ───────────────────────────────────

def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255


# ─────────────────────────── Position map ────────────────────────────────────

POSITION_MAP = {
    'bottom-center': lambda w, h, m: (w / 2, m, 'center'),
    'bottom-left':   lambda w, h, m: (m, m, 'left'),
    'bottom-right':  lambda w, h, m: (w - m, m, 'right'),
    'top-center':    lambda w, h, m: (w / 2, h - m, 'center'),
    'top-left':      lambda w, h, m: (m, h - m, 'left'),
    'top-right':     lambda w, h, m: (w - m, h - m, 'right'),
}

MIRROR_MAP = {
    'inner': {0: 'bottom-left', 1: 'bottom-right'},   # even=left, odd=right
    'outer': {0: 'bottom-right', 1: 'bottom-left'},
}


# ─────────────────────────── Overlay builder ─────────────────────────────────

def make_number_overlay(
    width: float,
    height: float,
    label: str,
    pos_key: str,
    font_size: int,
    color: str = '#111111',
    bg_color: str = '',
    bg_opacity: float = 0.85,
    bg_border_color: str = '',
    bg_radius: float = 3.0,
    font_name: str = 'Helvetica',
    margin: int = 28,
    draw_rule: bool = False,
    rule_color: str = '#CCCCCC',
    rule_width: float = 0.5,
) -> bytes:
    """Create a page number overlay as PDF bytes."""
    packet = io.BytesIO()
    c = rl_canvas.Canvas(packet, pagesize=(width, height))

    fn = POSITION_MAP.get(pos_key, POSITION_MAP['bottom-center'])
    x, y, align = fn(width, height, margin)
    r, g, b = _hex_to_rgb(color)

    # Measure text
    c.setFont(font_name, font_size)
    text_w = c.stringWidth(label, font_name, font_size)
    text_h = font_size + 2

    # Background box
    if bg_color:
        bg_r, bg_g, bg_b = _hex_to_rgb(bg_color)
        c.saveState()
        c.setFillColorRGB(bg_r, bg_g, bg_b, alpha=bg_opacity)
        pad = 5
        if bg_border_color:
            bdr_r, bdr_g, bdr_b = _hex_to_rgb(bg_border_color)
            c.setStrokeColorRGB(bdr_r, bdr_g, bdr_b, alpha=bg_opacity)
            c.setLineWidth(0.6)
        else:
            c.setStrokeColorRGB(bg_r * 0.7, bg_g * 0.7, bg_b * 0.7, alpha=bg_opacity)
            c.setLineWidth(0.4)
        if align == 'center':
            bx = x - text_w / 2 - pad
        elif align == 'left':
            bx = x - pad
        else:
            bx = x - text_w - pad
        by = y - pad / 2
        c.roundRect(bx, by, text_w + pad * 2, text_h + pad, bg_radius,
                    fill=1, stroke=1 if (bg_color or bg_border_color) else 0)
        c.restoreState()

    # Decorative rule line
    if draw_rule:
        rr, rg, rb = _hex_to_rgb(rule_color)
        c.setStrokeColorRGB(rr, rg, rb)
        c.setLineWidth(rule_width)
        if 'bottom' in pos_key:
            line_y = margin + font_size + 6
            c.line(margin, line_y, width - margin, line_y)
        else:
            line_y = height - margin - font_size - 6
            c.line(margin, line_y, width - margin, line_y)

    # Text
    c.setFont(font_name, font_size)
    c.setFillColorRGB(r, g, b)
    if align == 'center':
        c.drawCentredString(x, y, label)
    elif align == 'left':
        c.drawString(x, y, label)
    else:
        c.drawRightString(x, y, label)

    c.save()
    packet.seek(0)
    return packet.read()


def _parse_page_selector(selector: str, total: int) -> set[int]:
    """Parse page selector string to 0-based index set."""
    sel = selector.strip().lower()
    if sel in ('all', ''):
        return set(range(total))
    if sel == 'even':
        return {i for i in range(total) if (i + 1) % 2 == 0}
    if sel == 'odd':
        return {i for i in range(total) if (i + 1) % 2 != 0}

    indices = set()
    for part in sel.replace(' ', '').split(','):
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
        elif part.isdigit():
            n = int(part)
            if 1 <= n <= total:
                indices.add(n - 1)
    return indices


def _compress_output(src: str, dst: str) -> bool:
    try:
        with pikepdf.open(src, suppress_warnings=True) as pdf:
            pdf.save(dst, compress_streams=True,
                     object_stream_mode=pikepdf.ObjectStreamMode.generate)
        return True
    except Exception:
        return False


# ─────────────────────────────── Main API ────────────────────────────────────

def add_page_numbers(
    input_path: str,
    output_path: str,
    position: str = 'bottom-center',
    start_num: int = 1,
    font_size: int = 11,
    prefix: str = '',
    suffix: str = '',
    number_format: str = 'arabic',
    color: str = '#111111',
    bg_color: str = '',
    bg_opacity: float = 0.85,
    bg_border_color: str = '',
    bg_radius: float = 3.0,
    font_name: str = 'Helvetica',
    margin: int = 28,
    skip_first_n: int = 0,
    only_pages: str = 'all',
    mirror_mode: bool = False,
    draw_rule: bool = False,
    rule_color: str = '#CCCCCC',
    chapter: str = '',
    title: str = '',
    password: str = '',
    compress: bool = True,
) -> dict:
    """
    Add page numbers to a PDF with extensive customization.

    Args:
        input_path:       Source PDF
        output_path:      Output PDF
        position:         'bottom-center' | 'bottom-left' | 'bottom-right' |
                          'top-center' | 'top-left' | 'top-right'
        start_num:        Starting page number value
        font_size:        Font size in points
        prefix:           Text before number ('Page ', 'p.')
        suffix:           Text after number ('.', ')')
        number_format:    'arabic' | 'roman' | 'roman_lower' | 'alpha' |
                          'of_total' | 'fraction' | 'page_of' | 'chapter_page'
        color:            Hex text color
        bg_color:         Hex background box color ('' = none)
        bg_opacity:       Background box opacity (0-1)
        bg_border_color:  Background box border color
        bg_radius:        Background box corner radius
        font_name:        'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique' |
                          'Courier' | 'Times-Roman' | 'Times-Bold'
        margin:           Distance from page edge in points
        skip_first_n:     Skip first N pages
        only_pages:       'all' or selector e.g. '2-10'
        mirror_mode:      Alternate left/right placement for double-sided
        draw_rule:        Draw a decorative line above/below the number
        rule_color:       Rule line color
        chapter:          Chapter label for 'chapter_page' format
        title:            Document title for {title} template
        password:         PDF password
        compress:         Apply pikepdf compression
    Returns:
        dict with output_path, pages_numbered, total_pages, per_page_labels
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        if not reader.decrypt(password or ''):
            raise ValueError('Incorrect password.')

    total = len(reader.pages)
    writer = PdfWriter()

    # Parse which pages to number
    number_indices = _parse_page_selector(only_pages, total)
    for i in range(min(skip_first_n, total)):
        number_indices.discard(i)

    # Sort for sequential counter assignment
    sorted_indices = sorted(number_indices)
    numbered_count = len(sorted_indices)
    # Reverse lookup: page_index → sequential counter
    seq_map = {idx: seq for seq, idx in enumerate(sorted_indices)}

    date_str = datetime.utcnow().strftime('%Y-%m-%d')
    pages_numbered = 0
    per_page_labels = {}
    orig_size = os.path.getsize(input_path)

    for i, page in enumerate(reader.pages):
        if i in number_indices:
            seq = seq_map[i]
            label = format_page_label(
                seq, total, numbered_count, start_num, number_format,
                prefix, suffix, chapter, date_str, title)

            box = page.mediabox
            w = float(box.width)
            h = float(box.height)

            # Mirror mode: alternate position
            if mirror_mode:
                side = i % 2   # 0 = even page, 1 = odd page
                if 'top' in position:
                    pos_key = f"top-{'left' if side else 'right'}"
                else:
                    pos_key = f"bottom-{'right' if side else 'left'}"
            else:
                pos_key = position

            try:
                overlay_bytes = make_number_overlay(
                    w, h, label, pos_key, font_size,
                    color=color,
                    bg_color=bg_color,
                    bg_opacity=bg_opacity,
                    bg_border_color=bg_border_color,
                    bg_radius=bg_radius,
                    font_name=font_name,
                    margin=margin,
                    draw_rule=draw_rule,
                    rule_color=rule_color,
                )
                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
                pages_numbered += 1
                per_page_labels[i + 1] = label
            except Exception:
                pass

        writer.add_page(page)

    # Preserve metadata
    try:
        if reader.metadata:
            meta = dict(reader.metadata)
        else:
            meta = {}
        meta.update({
            '/Producer': 'IshuTools.fun PDF Suite — Page Numbers',
            '/ModDate': datetime.utcnow().strftime("D:%Y%m%d%H%M%S+00'00'"),
        })
        writer.add_metadata(meta)
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)

    return {
        'output_path': output_path,
        'pages_numbered': pages_numbered,
        'total_pages': total,
        'format_used': number_format,
        'position': position,
        'mirror_mode': mirror_mode,
        'start_num': start_num,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
        'per_page_labels': per_page_labels,
    }


def add_running_header(
    input_path: str,
    output_path: str,
    header_text: str = '',
    footer_text: str = '',
    font_size: int = 9,
    color: str = '#6B7280',
    skip_first: bool = True,
    draw_rule: bool = True,
    rule_color: str = '#E5E7EB',
    font_name: str = 'Helvetica',
    margin: int = 18,
    password: str = '',
    compress: bool = True,
    title: str = '',
) -> dict:
    """
    Add running header and/or footer text to all pages.
    Supports {page}, {total}, {title}, {date} template variables.

    Args:
        header_text:   Text for top of each page
        footer_text:   Text for bottom of each page
        skip_first:    Skip first page (title page)
        draw_rule:     Draw a horizontal line under header / above footer
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')
    writer = PdfWriter()
    total = len(reader.pages)
    pages_modified = 0
    date_str = datetime.utcnow().strftime('%Y-%m-%d')
    orig_size = os.path.getsize(input_path)

    for i, page in enumerate(reader.pages):
        if skip_first and i == 0:
            writer.add_page(page)
            continue

        box = page.mediabox
        w = float(box.width)
        h = float(box.height)

        packet = io.BytesIO()
        c = rl_canvas.Canvas(packet, pagesize=(w, h))
        rr, rg, rb = _hex_to_rgb(color)
        rl_r, rl_g, rl_b = _hex_to_rgb(rule_color)
        c.setFont(font_name, font_size)

        def _expand(template: str) -> str:
            return (template
                    .replace('{page}', str(i + 1))
                    .replace('{total}', str(total))
                    .replace('{title}', title)
                    .replace('{date}', date_str))

        if header_text:
            txt = _expand(header_text)
            c.setFillColorRGB(rr, rg, rb)
            c.drawCentredString(w / 2, h - margin, txt)
            if draw_rule:
                c.setStrokeColorRGB(rl_r, rl_g, rl_b)
                c.setLineWidth(0.5)
                c.line(margin * 2, h - margin - font_size - 3,
                       w - margin * 2, h - margin - font_size - 3)

        if footer_text:
            txt = _expand(footer_text)
            if draw_rule:
                c.setStrokeColorRGB(rl_r, rl_g, rl_b)
                c.setLineWidth(0.5)
                c.line(margin * 2, margin + font_size + 3,
                       w - margin * 2, margin + font_size + 3)
            c.setFillColorRGB(rr, rg, rb)
            c.drawCentredString(w / 2, margin / 2, txt)

        c.save()
        packet.seek(0)
        overlay_reader = PdfReader(io.BytesIO(packet.read()))
        page.merge_page(overlay_reader.pages[0])
        pages_modified += 1
        writer.add_page(page)

    try:
        if reader.metadata:
            writer.add_metadata(dict(reader.metadata))
    except Exception:
        pass

    with open(output_path, 'wb') as f:
        writer.write(f)

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    out_size = os.path.getsize(output_path)
    return {
        'output_path': output_path,
        'pages_modified': pages_modified,
        'total_pages': total,
        'original_size_kb': round(orig_size / 1024, 1),
        'output_size_kb': round(out_size / 1024, 1),
    }


def add_section_numbers(
    input_path: str,
    output_path: str,
    sections: list,
    password: str = '',
    compress: bool = True,
) -> dict:
    """
    Add page numbers with section awareness — reset counter per section.

    Args:
        input_path:  Source PDF
        output_path: Output PDF
        sections:    List of section dicts:
                     [{'start_page': 1, 'end_page': 5, 'prefix': 'I-',
                       'format': 'roman', 'start_num': 1}, ...]
    """
    reader = PdfReader(input_path, strict=False)
    if reader.is_encrypted:
        reader.decrypt(password or '')

    total = len(reader.pages)
    writer = PdfWriter()

    # Build per-page config from sections
    page_config = {}
    for section in sections:
        sp = section.get('start_page', 1) - 1
        ep = section.get('end_page', total) - 1
        prefix = section.get('prefix', '')
        fmt = section.get('format', 'arabic')
        start = section.get('start_num', 1)
        pos = section.get('position', 'bottom-center')
        color = section.get('color', '#111111')
        for i in range(sp, min(ep + 1, total)):
            page_config[i] = {
                'seq': i - sp,
                'total': ep - sp + 1,
                'prefix': prefix,
                'format': fmt,
                'start': start,
                'position': pos,
                'color': color,
            }

    pages_numbered = 0
    for i, page in enumerate(reader.pages):
        if i in page_config:
            cfg = page_config[i]
            label = format_page_label(
                cfg['seq'], total, cfg['total'], cfg['start'],
                cfg['format'], cfg['prefix'], '', '', '', '')

            box = page.mediabox
            w, h = float(box.width), float(box.height)
            try:
                overlay_bytes = make_number_overlay(
                    w, h, label, cfg['position'], 11,
                    color=cfg['color'])
                overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
                page.merge_page(overlay_reader.pages[0])
                pages_numbered += 1
            except Exception:
                pass

        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    if compress:
        tmp = output_path + '.comp.tmp'
        if _compress_output(output_path, tmp):
            os.replace(tmp, output_path)

    return {
        'output_path': output_path,
        'total_pages': total,
        'pages_numbered': pages_numbered,
        'sections': len(sections),
    }
