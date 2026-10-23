"""Site files around the web page: SEO basics (RS80) and the secondary pages' house rules (RS49, RS55, RS66)."""
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
CANON = "https://replore.cardzo.co.in/"
BANNED = re.compile("[\U0001F000-\U0001FAFF☀-➿✦★⑂✕✓✗☑☐"
                    "☰⚙↗⧉＋☼☾▸]")   # RS55, same set as test_scout.py


def _secondary_pages():
    return sorted(p for p in WEB.glob("*.html") if p.name != "index.html")


def test_robots_and_sitemap():
    """RS80: robots allows all and points at the sitemap; the sitemap lists canonical URLs with a lastmod."""
    robots = (WEB / "robots.txt").read_text(encoding="utf-8")
    lines = [l.strip() for l in robots.splitlines() if l.strip() and not l.startswith("#")]
    assert "User-agent: *" in lines and "Allow: /" in lines and not any(l.startswith("Disallow") for l in lines)
    assert "Sitemap: " + CANON + "sitemap.xml" in lines
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = ET.parse(WEB / "sitemap.xml").getroot().findall("s:url", ns)
    locs = [u.find("s:loc", ns).text for u in urls]
    assert locs[0] == CANON and all(l.startswith(CANON) for l in locs) and "pages.dev" not in "".join(locs)
    assert all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", u.find("s:lastmod", ns).text) for u in urls)
    for loc in locs[1:]:   # every listed secondary page exists
        assert (WEB / loc[len(CANON):]).exists(), loc


def test_canonical_link_on_the_page():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    assert html.count('<link rel="canonical" href="%s">' % CANON) == 1


def test_no_redirects_file_for_domain_redirects():
    """RS80: Pages' _redirects cannot redirect a whole domain; the pages.dev 301 is a Bulk Redirect rule (dashboard)."""
    red = WEB / "_redirects"
    assert not red.exists() or "pages.dev" not in red.read_text(encoding="utf-8")
    assert "Bulk Redirect" in (ROOT / "SPEC.md").read_text(encoding="utf-8")


def test_404_page_in_the_site_look():
    """RS80: a 404 page exists (Pages then answers unknown paths with 404), in the site's fonts and theme, linking home."""
    html = (WEB / "404.html").read_text(encoding="utf-8")
    assert '<script src="/theme.js"></script>' in html and 'href="/fonts.css"' in html and 'href="/page.css"' in html
    assert 'href="/"' in html and '<meta name="robots" content="noindex">' in html
    assert (WEB / "page.css").exists()


def test_headers_rule_covers_every_page():
    """RS49/RS80: the one _headers rule is /*, so 404.html and the secondary pages get the same CSP."""
    hdr = (WEB / "_headers").read_text(encoding="utf-8")
    rules = [l for l in hdr.splitlines() if l and not l[0].isspace() and not l.startswith("#")]
    assert rules == ["/*"]


def test_secondary_pages_follow_the_house_rules():
    """RS49 no inline script or handler; RS55 no emoji or glyph icons; RS66 no em dash in what a visitor reads."""
    pages = _secondary_pages()
    assert pages, "expected 404.html at least"
    for p in pages:
        html = p.read_text(encoding="utf-8")
        assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I), p.name
        assert not re.search(r"\son[a-z]+\s*=", html, re.I) and "javascript:" not in html, p.name
        assert not BANNED.search(html), p.name
        visible = re.sub(r"<!--.*?-->|<style.*?</style>|<script.*?</script>", "", html, flags=re.S)
        assert "—" not in visible, p.name
        assert '<html lang="en">' in html and 'name="viewport"' in html, p.name
    css = (WEB / "page.css").read_text(encoding="utf-8")
    assert "http" not in css   # self-hosted fonts only (RS33)


def test_docs_match_the_code():
    """RS63, RS34e, RS51, RS5: the README, SPEC, PRIVACY, SKILL and AGENTS texts say what the code does (parity audit
    2026-10-23 found five-button cards, an old default model, --top 10 and a missing check_repos)."""
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    spec = (ROOT / "SPEC.md").read_text(encoding="utf-8")
    rel = (ROOT / "functions" / "api" / "relevance.js").read_text(encoding="utf-8")
    first = re.search(r'WAI_MODELS = \["([^"]+)"', rel).group(1)
    assert first in readme and first in spec and "llama-3.1-8b-instruct-fp8`, then" not in readme
    assert "five buttons" not in readme and "stars and forks" not in readme and "\U0001F6E1" not in readme
    assert "Is it safe to build on?" in (WEB / "app.js").read_text(encoding="utf-8") and "Is it safe to build on?" in readme
    for f in ("PRIVACY.md",):
        assert "Diagram, Digest, Wiki, Browse, Edit" not in (ROOT / f).read_text(encoding="utf-8")
    assert "Diagram, Digest, Wiki, Browse, Edit" not in (WEB / "index.html").read_text(encoding="utf-8")
    scout = (ROOT / "scripts" / "scout.py").read_text(encoding="utf-8")
    top = re.search(r'"--top", type=int, default=(\d+)', scout).group(1)
    assert "`--top` (default %s" % top in spec
    skill = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    steps = re.findall(r"^(\d+)\. \*\*", skill, re.M)
    assert len(steps) == len(set(steps)), steps   # no two steps share a number
    assert "check_repos" in (ROOT / "AGENTS.md").read_text(encoding="utf-8")
