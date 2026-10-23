"""SPEC RS85: directory-ready manifest, icon and skill frontmatter. No network."""
import json
import re
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ops"))
import make_icon  # noqa: E402

PLUGIN = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
MARKET = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))


def _png_chunks(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    i, out = 8, []
    while i < len(data):
        (n,) = struct.unpack(">I", data[i:i + 4])
        kind, body = data[i + 4:i + 8], data[i + 8:i + 8 + n]
        (crc,) = struct.unpack(">I", data[i + 8 + n:i + 12 + n])
        assert crc == zlib.crc32(kind + body) & 0xFFFFFFFF, kind
        out.append((kind, body))
        i += 12 + n
    return out


def test_icon_is_a_512_square_png():
    icon = ROOT / PLUGIN["icon"].removeprefix("./")
    assert PLUGIN["icon"].startswith("./") and icon.exists()
    chunks = _png_chunks(icon.read_bytes())
    assert chunks[0][0] == b"IHDR" and chunks[-1][0] == b"IEND"
    w, h, depth, ctype = struct.unpack(">IIBB", chunks[0][1][:10])
    assert (w, h, depth, ctype) == (512, 512, 8, 2)
    raw = zlib.decompress(b"".join(b for k, b in chunks if k == b"IDAT"))
    assert len(raw) == 512 * (1 + 512 * 3)
    assert icon.stat().st_size < 256 * 1024   # directory: well under its per-file limits


def test_icon_generator_is_stdlib_and_writes_valid_png():
    src = (ROOT / "ops" / "make_icon.py").read_text(encoding="utf-8")
    imports = set(re.findall(r"^\s*(?:import|from)\s+([a-zA-Z_]+)", src, re.M))
    assert imports <= {"struct", "sys", "zlib", "pathlib"}, imports
    tiny = make_icon.png_bytes(b"\x00" + b"\x10\x20\x30" * 2 + b"\x00" + b"\x10\x20\x30" * 2, size=2)
    assert struct.unpack(">II", _png_chunks(tiny)[0][1][:8]) == (2, 2)
    # the mark: ring colour on the ring, needle colour at the needle tip, background in the corner
    assert make_icon._colour(16, 3.5) == make_icon.RING
    assert make_icon._colour(20, 12.5) == make_icon.NEEDLE
    assert make_icon._colour(1, 1) == make_icon.BG


def test_listing_fields_and_marketplace_parity():
    for k in ("homepage", "documentationUrl", "supportUrl", "privacyPolicyUrl"):
        assert PLUGIN[k].startswith("https://"), k
    assert PLUGIN["homepage"] == "https://replore.cardzo.co.in"
    assert PLUGIN["privacyPolicyUrl"] == "https://github.com/chittychat-studio/replore/blob/main/PRIVACY.md"
    assert PLUGIN["author"]["url"].startswith("https://")
    entry = MARKET["plugins"][0]
    assert entry["description"] == PLUGIN["description"]
    assert "—" not in PLUGIN["description"]   # RS66
    assert entry["category"] and entry["tags"] and all(isinstance(t, str) for t in entry["tags"])
    assert MARKET.get("description")


def test_skill_frontmatter_names_it_and_scopes_tools():
    text = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    front = text.split("\n---\n", 1)[0]
    assert re.search(r"^name: find$", front, re.M)
    rules = re.findall(r'^\s+- "(.+)"$', front.split("allowed-tools:", 1)[1], re.M)
    assert rules and all(r.startswith("Bash(") for r in rules)
    for py in ("python3", "python", "py -3"):
        for script in ("scout.py", "trust.py"):
            assert f"Bash({py} *${{CLAUDE_PLUGIN_ROOT}}/scripts/{script}*)" in rules
    # only the launcher probe and the plugin's own scripts (RX4)
    assert all(r.endswith("--version)") or "${CLAUDE_PLUGIN_ROOT}/scripts/" in r for r in rules)


def test_pypi_package_and_registry_entry_agree():
    """RS86: pyproject.toml (PyPI) and server.json (MCP registry) match each other and the plugin version (RS50)."""
    import tomllib
    proj = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    server = json.loads((ROOT / "server.json").read_text(encoding="utf-8"))
    p = proj["project"]
    assert p["dependencies"] == []   # RS11: standard library only
    assert p["version"] == PLUGIN["version"] == server["version"] == server["packages"][0]["version"]
    pkg = server["packages"][0]
    assert pkg["registryType"] == "pypi" and pkg["identifier"] == p["name"] and pkg["transport"] == {"type": "stdio"}
    assert server["name"] == "io.github.chittychat-studio/replore"
    assert server["$schema"].startswith("https://static.modelcontextprotocol.io/schemas/")
    assert len(server["description"]) <= 100
    # the registry proves PyPI ownership with this line in the package README
    readme = (ROOT / p["readme"]).read_text(encoding="utf-8")
    assert re.search(r"^<!-- mcp-name: io\.github\.chittychat-studio/replore -->$", readme, re.M)
    # console scripts point at modules that exist in the mapped folder and define main()
    folder = ROOT / proj["tool"]["setuptools"]["package-dir"]["replore"]
    assert p["scripts"] == {"replore": "replore.scout:main", "replore-mcp": "replore.mcp_server:main"}
    for target in p["scripts"].values():
        mod, fn = target.split(":")
        src = (folder / (mod.split(".", 1)[1] + ".py")).read_text(encoding="utf-8")
        assert re.search(rf"^def {fn}\(", src, re.M), target
    assert {e["name"] for e in pkg.get("environmentVariables", [])} <= {"GITHUB_TOKEN", "REPLORE_KEY"}
    assert all(e["isRequired"] is False for e in pkg.get("environmentVariables", []))


def test_listing_doc_names_the_owner_steps():
    doc = (ROOT / "docs" / "LISTING.md").read_text(encoding="utf-8")
    for s in ("claude.ai/directory/manage", "Plugin bundle", "Validate", "mcp-publisher login github",
              "mcp-publisher publish", "pulsemcp.com/submit", "glama.ai/mcp/servers", "video/"):
        assert s in doc, s


def test_monetisation_plan_and_prices_stay_out_of_the_spec():
    """RS88: the plan lists each step with a status; planned prices live only in docs/MONETIZATION.md."""
    plan = (ROOT / "docs" / "MONETIZATION.md").read_text(encoding="utf-8")
    for s in ("8 USD a month", "72 USD a year", "Stripe Payment Link", "99 USD a month", "25 USD a seat", "own GitHub token",
              "0.011 USD per 1,000 neurons", "PRO_SIGNING_SECRET", "STRIPE_SECRET_KEY", "PRO_PRICE_IDS", "Stripe Tax",
              "seller of record", "50% off", "duration **once**", "restricted key",
              "https://replore.cardzo.co.in/pro?session_id={CHECKOUT_SESSION_ID}", "PyPI", "PulseMCP", "Anthropic paid plan"):
        assert s in plan, s
    assert "not verified" in plan.lower()
    for status in ("done", "built", "owner step", "not started"):
        assert status in plan, status
    price = re.compile(r"\b(8|72|99|25) ?(USD|\$)|\$ ?(8|72|99|25)\b")
    for doc in ("SPEC.md", "README.md"):
        assert not price.search((ROOT / doc).read_text(encoding="utf-8")), doc
    assert "—" not in plan
