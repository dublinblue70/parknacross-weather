#!/usr/bin/env python3
"""Apply the approved coastal icon references without altering weather logic.

Safe to rerun. Leaves the PWA identity, start URL, weather code and notification
handlers/preferences unchanged; refreshes only branded image references/cache.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAG = "20261118-coastal-icons"
modified = []

for html in sorted(ROOT.glob("*.html")):
    src = html.read_text(encoding="utf-8")
    head_end = re.search(r"</head\s*>", src, flags=re.I)
    if not head_end:
        continue

    head, body = src[:head_end.start()], src[head_end.start():]
    # URLs are versioned; the resource path and semantics stay the same.
    for name in ("manifest.webmanifest", "favicon.svg", "apple-touch-icon.png"):
        head = re.sub(
            r'((?:href|src)\s*=\s*["\'])' + re.escape(name) + r'(?:\?[^"\']*)?(["\'])',
            lambda m: m.group(1) + name + "?v=" + TAG + m.group(2),
            head,
            flags=re.I,
        )

    # Keep legacy pages installable too, even if their old head had no icons.
    additions = []
    if not re.search(r'rel=["\']manifest["\']', head, flags=re.I):
        additions.append(f'<link rel="manifest" href="manifest.webmanifest?v={TAG}">')
    if not re.search(r'rel=["\']icon["\'][^>]*favicon\.svg', head, flags=re.I):
        additions.append(f'<link rel="icon" type="image/svg+xml" href="favicon.svg?v={TAG}">')
    if not re.search(r'rel=["\']apple-touch-icon["\']', head, flags=re.I):
        additions.append(f'<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png?v={TAG}">')
    if not re.search(r'favicon\.ico', head, flags=re.I):
        additions.append(f'<link rel="icon" type="image/x-icon" href="favicon.ico?v={TAG}">')
    if not re.search(r'safari-pinned-tab\.svg', head, flags=re.I):
        additions.append(f'<link rel="mask-icon" href="safari-pinned-tab.svg?v={TAG}" color="#071f50">')
    if not re.search(r'msapplication-config', head, flags=re.I):
        additions.append(f'<meta name="msapplication-config" content="browserconfig.xml?v={TAG}">')
    if additions:
        head += "\n    " + "\n    ".join(additions) + "\n"

    # Brand-mark images in body are used for the website's navigation header.
    body = re.sub(
        r'((?:src)\s*=\s*["\'])favicon\.svg(?:\?[^"\']*)?(["\'])',
        lambda m: m.group(1) + "favicon.svg?v=" + TAG + m.group(2),
        body,
        flags=re.I,
    )
    updated = head + body
    if updated != src:
        html.write_text(updated, encoding="utf-8")
        modified.append(html.name)

manifest = ROOT / "manifest.webmanifest"
data = json.loads(manifest.read_text(encoding="utf-8"))
for item in data.get("icons", []):
    item["src"] = item["src"].split("?")[0] + "?v=" + TAG
for shortcut in data.get("shortcuts", []):
    for item in shortcut.get("icons", []):
        item["src"] = item["src"].split("?")[0] + "?v=" + TAG
# Important: keep PWA id, scope and start_url exactly as before.
out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
if manifest.read_text(encoding="utf-8") != out:
    manifest.write_text(out, encoding="utf-8")
    modified.append(manifest.name)

sw_path = ROOT / "service-worker.js"
sw = sw_path.read_text(encoding="utf-8")
sw_new = re.sub(
    r'^(const CACHE_NAME = "parknacross-v38-4-257-)[^"]+(";)\s*$',
    lambda m: m.group(1) + TAG + m.group(2),
    sw,
    count=1, flags=re.M,
)
if sw_new == sw and TAG not in sw:
    raise SystemExit("Missing expected service-worker cache version; not changing notification code.")
assets = [
    "./favicon.ico", "./favicon-16.png", "./favicon-32.png",
    "./safari-pinned-tab.svg", "./browserconfig.xml", "./mstile-150x150.png",
    "./icon-256.png",
]
for asset in assets:
    if f'"{asset}"' not in sw_new:
        anchor = '  "./favicon.svg",'
        if anchor not in sw_new:
            raise SystemExit("Missing service worker asset-list anchor")
        sw_new = sw_new.replace(anchor, anchor + "\n  " + json.dumps(asset) + ",", 1)
if sw_new != sw:
    sw_path.write_text(sw_new, encoding="utf-8")
    modified.append(sw_path.name)

# Guardrails: code paths that govern notifications must be unchanged by design.
assert "self.addEventListener(\"push\"" in sw_new
assert "self.addEventListener(\"notificationclick\"" in sw_new
assert data["id"] == "/"
assert data["start_url"] == "./index.html"
assert len([x for x in data["icons"] if x["purpose"] == "maskable"]) >= 2
assert any(x["src"].startswith("icon-512.png?") for x in data["icons"])
assert any(x["src"].startswith("icon-maskable-512.png?") for x in data["icons"])
print(f"PASS: icon references/cache updated in {len(modified)} files: {', '.join(modified)}")
