#!/usr/bin/env bash
# Fails when the private repository is named anywhere in this repository (the site is public).
# Used by .githooks/pre-commit, .githooks/pre-push and the publish workflow.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/..)"
# The pattern is built from two halves so that this script does not match itself.
pattern="nachtgespenst""-original"
if git grep -n -I -i -e "$pattern" -- . ':!scripts/check-private-names.sh' >/dev/null 2>&1 || \
   grep -rIn -i --exclude-dir=.git --exclude=check-private-names.sh -e "$pattern" . >/dev/null 2>&1; then
    echo "check-private-names: the private repository is named in this public repository:" >&2
    grep -rIn -i --exclude-dir=.git --exclude=check-private-names.sh -e "$pattern" . >&2 || true
    exit 1
fi
