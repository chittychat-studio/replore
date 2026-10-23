"""RS52: stamp web/index.html's script URLs with a hash of each file, so browsers fetch the new code after a deploy.

Run after editing web/app.js or web/theme.js, or replacing a media file below:  python ops/stamp_assets.py
RS76: media files are stamped too (the peek clip in app.js; the Tour video and poster in index.html), so a replaced
clip never comes from an old browser or CDN cache.
(tests/test_scout.py fails until the stamps match the files.)
"""
import hashlib
import pathlib
import re

WEB = pathlib.Path(__file__).resolve().parent.parent / "web"
ASSETS = ("theme.js", "app.js")
MEDIA_IN_JS = ("leo-peek.webm",)                      # referenced as "leo-peek.webm" in app.js
MEDIA_IN_HTML = ("tour.mp4", "tour-poster.jpg")       # src="..." / poster="..." in index.html


def asset_hash(name):
    # line endings normalised, so a Windows checkout (CRLF) and CI (LF) agree
    text = (WEB / name).read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(text).hexdigest()[:10]


def media_hash(name):
    return hashlib.sha256((WEB / name).read_bytes()).hexdigest()[:10]


def stamp(text, name, where):
    text, n = re.subn(r'"' + re.escape(name) + r'(\?v=[0-9a-f]+)?"', '"%s?v=%s"' % (name, media_hash(name)), text)
    if n < 1:
        raise SystemExit("expected %s in %s" % (name, where))
    return text


def main():
    js = WEB / "app.js"
    code = js.read_text(encoding="utf-8")
    for name in MEDIA_IN_JS:
        code = stamp(code, name, "app.js")
    js.write_text(code, encoding="utf-8", newline="")
    page = WEB / "index.html"
    html = page.read_text(encoding="utf-8")
    for name in MEDIA_IN_HTML:
        html = stamp(html, name, "index.html")
    for name in ASSETS:
        html, n = re.subn(r'src="' + re.escape(name) + r'(\?v=[0-9a-f]+)?"',
                          'src="%s?v=%s"' % (name, asset_hash(name)), html)
        if n != 1:
            raise SystemExit("expected one <script src=\"%s\"> in index.html, found %d" % (name, n))
    page.write_text(html, encoding="utf-8", newline="")
    print("stamped " + ", ".join("%s?v=%s" % (a, asset_hash(a)) for a in ASSETS))


if __name__ == "__main__":
    main()
