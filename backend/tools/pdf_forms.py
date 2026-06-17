"""
pdf_forms.py — List and fill PDF form fields
IshuTools.fun | Professional PDF Suite
Author: Ishu Kumar (ISHUKR41)
"""
import fitz  # PyMuPDF


def list_form_fields(input_path: str) -> list:
    """
    Return a list of all fillable form fields in a PDF.

    Returns a list of dicts: [{name, field_type, value, rect, page}, ...]
    """
    doc    = fitz.open(input_path)
    fields = []
    for page_idx, page in enumerate(doc):
        for widget in page.widgets():
            fields.append({
                'name'      : widget.field_name,
                'field_type': widget.field_type_string,
                'value'     : widget.field_value,
                'rect'      : list(widget.rect),
                'page'      : page_idx + 1,
            })
    doc.close()
    return fields


def fill_pdf_form(input_path: str, output_path: str, fields: dict = None) -> str:
    """
    Fill PDF form fields with provided values.

    Args:
        input_path:  Source PDF with form fields
        output_path: Output PDF with filled fields
        fields:      Dict mapping field name → value to fill
                     e.g. {'FirstName': 'Ishu', 'DateOfBirth': '2000-01-01'}
    Returns:
        output_path on success
    """
    if fields is None:
        fields = {}

    doc = fitz.open(input_path)

    for page in doc:
        for widget in page.widgets():
            name = widget.field_name
            if name in fields:
                val = fields[name]
                # Handle checkbox/radio (truthy → check)
                ft  = widget.field_type_string
                if ft in ('CheckBox', 'RadioButton'):
                    widget.field_value = bool(val)
                else:
                    widget.field_value = str(val)
                widget.update()

    # Flatten the form (make fields non-editable in output)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return output_path
