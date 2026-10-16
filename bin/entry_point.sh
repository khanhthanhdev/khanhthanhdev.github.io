#!/bin/bash
set -euo pipefail

exec bundle exec jekyll serve --watch --port=8080 --host=0.0.0.0 --livereload --force_polling
