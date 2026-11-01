#!/usr/bin/env python3
"""Copy tracked files into a Pages directory, leaving out non-public paths.

keepitil.com is a GitHub Pages branch deploy. `.nojekyll` is in the repo, so a
Jekyll `_config.yml` exclude list never runs. Turning Jekyll on would also
rewrite `{{` inside game JavaScript. This script is the file list the Actions
workflow publishes instead. It does not delete anything from git.

Run from the repository root:

    python3 scripts/publish-public-site.py
    python3 scripts/publish-public-site.py --check
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

# Directory prefixes end with /. Exact files do not.
# These are not linked from the public site, or they are repo machinery.
EXCLUDED = (
    ".github/",
    ".gitignore",
    "games/kbeats-preview/",
    "games/kmob-staging/",
    "games/kwars-build89/",
    "brand/tuitea/README.md",
    "games/13/vendor/basis/README.md",
    "app/tuitea/app/assets/assets/audio/README.md",
    "app/tuitea/app/fallback-fonts/README.md",
    "scripts/",
)

# Pages and app files that must survive the copy. A miss here means the
# filter is too wide.
REQUIRED = (
    "index.html",
    "CNAME",
    ".nojekyll",
    ".well-known/apple-app-site-association",
    "wifi-remote.html",
    "privacy.html",
    "games/index.html",
    "games/kmob/index.html",
    "games/kbeats/index.html",
    "games/kbeats/js/app.js",
    "games/13/icon.svg",
    "games/kwars/index.html",
    "app/tuitea/flags.json",
    "app/tuitea/native.json",
    "app/tuitea/app/index.html",
    "app/tuitea/app/assets/assets/legal/privacy.md",
    "wifi-remote-config.json",
)


def excluded(path: str) -> bool:
    for rule in EXCLUDED:
        if rule.endswith("/"):
            if path == rule[:-1] or path.startswith(rule):
                return True
        elif path == rule:
            return True
    return False


def tracked_files() -> list[str]:
    out = subprocess.check_output(["git", "ls-files", "-z"])
    return [p.decode() for p in out.split(b"\0") if p]


def publish(dest: str) -> tuple[int, int]:
    if os.path.isdir(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)
    kept = 0
    dropped = 0
    for path in tracked_files():
        if excluded(path):
            dropped += 1
            continue
        target = os.path.join(dest, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(path, target)
        kept += 1
    return kept, dropped


def check(dest: str) -> None:
    missing = [path for path in REQUIRED if not os.path.isfile(os.path.join(dest, path))]
    leaked = []
    for dirpath, _, names in os.walk(dest):
        for name in names:
            rel = os.path.relpath(os.path.join(dirpath, name), dest).replace(os.sep, "/")
            if excluded(rel):
                leaked.append(rel)
    app = os.path.join(dest, "games/kbeats/js/app.js")
    template_ok = os.path.isfile(app) and "${{" in open(app, encoding="utf-8").read()
    if missing or leaked or not template_ok:
        for path in missing:
            print("missing required file:", path, file=sys.stderr)
        for path in leaked:
            print("excluded file was copied:", path, file=sys.stderr)
        if not template_ok:
            print("game JS template markers were not copied unchanged", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="_site")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
    os.chdir(root)
    kept, dropped = publish(args.out)
    check(args.out)
    print(f"public files: {kept} copied, {dropped} left out, checked {args.out}")
    if args.check:
        shutil.rmtree(args.out)


if __name__ == "__main__":
    main()
