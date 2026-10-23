"""SPEC RS81: check a release tag against every version, then print its CHANGELOG section (the release notes).

Usage: python ops/release_notes.py v0.4.0 > notes.md   (run by .github/workflows/release.yml on a pushed v* tag)
Exit 1 with a plain message when the tag, .claude-plugin/plugin.json, SERVER_INFO in scripts/mcp_server.py and
CHANGELOG.md don't agree, or the section is empty. Standard library only.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TAG = re.compile(r"v(\d+\.\d+\.\d+)")


def versions(root=ROOT):
    plugin = json.loads((root / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))["version"]
    m = re.search(r'SERVER_INFO\s*=\s*\{[^}]*"version":\s*"([^"]+)"', (root / "scripts" / "mcp_server.py").read_text(encoding="utf-8"))
    return plugin, (m.group(1) if m else None)


def section(changelog, version):
    """The body under '## [version]' up to the next '## [' heading (link references at the end are dropped)."""
    text = changelog.replace("\r\n", "\n")
    m = re.search(r"^## \[" + re.escape(version) + r"\][^\n]*\n(.*?)(?=^## \[|^\[[^\]]+\]: |\Z)", text, re.M | re.S)
    return m.group(1).strip() if m else ""


def notes(tag, root=ROOT):
    m = TAG.fullmatch(tag or "")
    if not m:
        raise SystemExit(f"release: tag {tag!r} is not vX.Y.Z")
    want = m.group(1)
    plugin, server = versions(root)
    if plugin != want or server != want:
        raise SystemExit(f"release: tag {tag} but plugin.json has {plugin} and mcp_server.py SERVER_INFO has {server}; "
                         "bump both (RS50) before tagging")
    body = section((root / "CHANGELOG.md").read_text(encoding="utf-8"), want)
    if not body:
        raise SystemExit(f"release: CHANGELOG.md has no '## [{want}]' section with notes")
    return body


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python ops/release_notes.py vX.Y.Z")
    sys.stdout.reconfigure(encoding="utf-8")
    print(notes(sys.argv[1]))
