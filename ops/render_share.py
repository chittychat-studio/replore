"""SPEC RS57: render ops/share/card.html to the link-preview image and the README banner with headless Chrome/Edge.

  python ops/render_share.py            # writes web/og.jpg (1200x630) and docs/banner.png (1280x640)

Each render has a 60 s limit and the browser exits on its own (--headless --screenshot). The preview image is saved
as JPEG with Pillow (maintainer tool only, not shipped): WhatsApp skips link previews over ~300 KB.
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "ops" / "share" / "card.html"
OUTPUTS = ((ROOT / "web" / "og.jpg", 1200, 630), (ROOT / "docs" / "banner.png", 1280, 640))
MAX_OG_BYTES = 250_000
CANDIDATES = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome", "chromium", "chromium-browser", "msedge",
)


def find_browser():
    for c in CANDIDATES:
        p = c if os.path.isabs(c) else shutil.which(c)
        if p and os.path.exists(p):
            return p
    raise SystemExit("no Chrome, Chromium or Edge found")


def render(browser, out, w, h):
    shot = out.with_suffix(".png")
    with tempfile.TemporaryDirectory() as profile:   # throwaway profile, so the user's own browser is never touched
        subprocess.run([browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                        "--force-device-scale-factor=1", "--user-data-dir=" + profile,
                        "--virtual-time-budget=3000", f"--window-size={w},{h}", f"--screenshot={shot}",
                        SRC.as_uri()], check=True, timeout=60, capture_output=True)
    if not shot.exists() or shot.stat().st_size < 10_000:
        raise SystemExit(f"render failed: {shot}")
    if out.suffix == ".jpg":
        from PIL import Image   # maintainer-only dependency
        Image.open(shot).convert("RGB").save(out, "JPEG", quality=86, optimize=True, progressive=True)
        shot.unlink()
        if out.stat().st_size > MAX_OG_BYTES:
            raise SystemExit(f"{out.name} is {out.stat().st_size // 1024} KB; keep it under {MAX_OG_BYTES // 1000} KB")
    print(f"wrote {out.relative_to(ROOT)} ({w}x{h}, {out.stat().st_size // 1024} KB)")


def main():
    browser = find_browser()
    for out, w, h in OUTPUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        render(browser, out, w, h)


if __name__ == "__main__":
    sys.exit(main())
