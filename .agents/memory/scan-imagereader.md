---
name: scan_to_pdf ImageReader fix
description: reportlab drawImage() does NOT accept BytesIO directly — must use ImageReader wrapper
---

## Rule
Always wrap BytesIO with `ImageReader(buf)` from `reportlab.lib.utils` before passing to `c.drawImage()`.

## Why
reportlab's `drawImage()` accepts file paths, `ImageReader` objects, or file-like objects in older versions, but newer versions (4.x) reject raw BytesIO, raising "expected str, bytes or os.PathLike object, not BytesIO".

## How to apply
```python
from reportlab.lib.utils import ImageReader
buf = io.BytesIO()
img.save(buf, format='JPEG', ...)
buf.seek(0)
c.drawImage(ImageReader(buf), x, y, width=w, height=h)  # NOT c.drawImage(buf, ...)
```

Also: for invisible text overlay in searchable PDFs, use `c.saveState()` / `c.setFillAlpha(0.002)` / `c.restoreState()` instead of the unsupported `c.setFillColorRGB(0,0,0, alpha=0)` form.
