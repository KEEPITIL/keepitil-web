#!/bin/sh
# Exit 0 (and print the branch) when an existing prerender/run-* branch on origin already carries exactly the pages in the working tree
# (event/ + sitemap-events.xml): the same work is already waiting for a person to open a PR, so a scheduled run must not push a duplicate.
# Exit 1 when no such branch exists (push a new one). Read-only: it only fetches and diffs.
set -e
git fetch -q origin '+refs/heads/prerender/*:refs/remotes/origin/prerender/*' 2>/dev/null || true
# stage the generated paths (new pages are untracked in a fresh checkout; the push step stages them anyway), then compare the index with each branch
git add -A -- event sitemap-events.xml
for b in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/prerender/run-*'); do
  if git diff --cached --quiet "$b" -- event sitemap-events.xml 2>/dev/null; then echo "$b"; exit 0; fi
done
exit 1
