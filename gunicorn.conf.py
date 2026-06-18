# gunicorn.conf.py — IshuTools.fun Configuration
# Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun

# Binding
bind = "0.0.0.0:5000"

# Worker configuration — gthread for concurrent PDF processing
worker_class = "gthread"
workers = 2
threads = 4

# Critical: heavy PDF processing (OCR, translate, compress) needs long timeout
timeout = 300
graceful_timeout = 300
keepalive = 5

# Request size limits
limit_request_line = 8190
limit_request_fields = 200

# Logging
loglevel = "info"
accesslog = "-"
errorlog = "-"
capture_output = True

# Auto-reload disabled for Replit compatibility
reload = False
