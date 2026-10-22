"""RS52: stamp web/index.html's script URLs with a hash of each file, so browsers fetch the new code after a deploy.

Run after editing web/app.js or web/theme.js:  python ops/stamp_assets.py
(tests/test_scout.py fails until the stamps match the files.)
"""
import hashlib
import pathlib
import re

WEB = pathlib.Path(__file__).resolve().parent.parent / "web"
ASSETS = ("theme.js", "app.js", "hero-shader.js")


def asset_hash(name):
    # line endings normalised, so a Windows checkout (CRLF) and CI (LF) agree
    text = (WEB / name).read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(text).hexdigest()[:10]


def main():
    page = WEB / "index.html"
    html = page.read_text(encoding="utf-8")
    for name in ASSETS:
        html, n = re.subn(r'src="' + re.escape(name) + r'(\?v=[0-9a-f]+)?"',
                          'src="%s?v=%s"' % (name, asset_hash(name)), html)
        if n != 1:
            raise SystemExit("expected one <script src=\"%s\"> in index.html, found %d" % (name, n))
    page.write_text(html, encoding="utf-8", newline="")
    print("stamped " + ", ".join("%s?v=%s" % (a, asset_hash(a)) for a in ASSETS))


if __name__ == "__main__":
    main()
