---
name: gunicorn timeout config for IshuTools
description: gunicorn default 30s timeout causes all heavy PDF tools to fail; must set timeout=300
---

## Rule
IshuTools uses `gunicorn.conf.py` at project root with `timeout = 300`.

## Why
Heavy tools (OCR, translate, compress with Ghostscript) take 30-120s to process. Default gunicorn timeout is 30s, causing 502/504 errors that look like "tools not working" to users.

## Config
`gunicorn.conf.py` at project root:
- `worker_class = "gthread"` + `threads = 4` — handles concurrent PDF requests
- `workers = 2` — 2 processes
- `timeout = 300` / `graceful_timeout = 300`
- `reload = True` — dev mode

**Why gthread:** setting `threads > 1` with PDF processing prevents one heavy request from blocking all others.
