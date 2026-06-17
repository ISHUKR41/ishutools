"""
pdf_edit.py — Add text annotations, highlights, or sticky notes to a PDF
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41)
"""
import fitz  # PyMuPDF


def _hex_to_rgb(hex_color: str):
    """Convert a CSS hex color (#RRGGBB) to an (r, g, b) float tuple [0-1]."""
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return r / 255, g / 255, b / 255


def edit_pdf(
    input_path: str,
    output_path: str,
    action: str    = 'add_text',
    text: str      = '',
    page_num: int  = 1,
    x: float       = 100.0,
    y: float       = 100.0,
    font_size: int = 14,
    color: str     = '#000000',
) -> str:
    """
    Edit a PDF by adding text, highlight, or a sticky note annotation.

    Args:
        input_path:  Source PDF path
        output_path: Output PDF path
        action:      'add_text' | 'highlight' | 'note'
        text:        Text to add / annotation content
        page_num:    1-based page number
        x, y:        Position on page (points from top-left)
        font_size:   Font size for text actions
        color:       Hex colour string (e.g. '#FF0000')
    Returns:
        output_path on success
    """
    doc = fitz.open(input_path)

    # Clamp page index
    idx = max(0, min(page_num - 1, doc.page_count - 1))
    page = doc[idx]
    rgb  = _hex_to_rgb(color)

    if action == 'add_text':
        # Insert text annotation (free text)
        rect = fitz.Rect(x, y, x + 300, y + font_size * 2)
        annot = page.add_freetext_annot(
            rect, text or 'IshuTools annotation',
            fontsize=font_size,
            text_color=rgb,
            fill_color=(1, 1, 0.8),   # light yellow background
            border_color=(0.9, 0.7, 0),
        )
        annot.update()

    elif action == 'highlight':
        # Highlight existing text that matches `text`
        areas = page.search_for(text or '')
        if areas:
            for rect in areas:
                annot = page.add_highlight_annot(rect)
                annot.set_colors(stroke=rgb)
                annot.update()

    elif action == 'note':
        # Sticky note annotation
        point = fitz.Point(x, y)
        annot = page.add_text_annot(point, text or 'Note', icon='Note')
        annot.set_colors(stroke=rgb, fill=rgb)
        annot.update()

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return output_path
