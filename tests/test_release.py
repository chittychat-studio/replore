"""SPEC RS81: release process. The tag, plugin.json, SERVER_INFO and CHANGELOG.md must agree; the workflow is safe."""
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ops"))
import release_notes  # noqa: E402


def test_current_version_has_release_notes():
    plugin, server = release_notes.versions()
    assert plugin == server
    body = release_notes.notes("v" + plugin)
    assert body.startswith("Everything below") or body.startswith("###")
    assert "## [" not in body and "]: https://" not in body   # one section only, no link references


def test_changelog_is_keep_a_changelog_shaped():
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    heads = re.findall(r"^## \[([^\]]+)\]", text, re.M)
    assert heads[0] == "Unreleased" and all(re.fullmatch(r"\d+\.\d+\.\d+", h) for h in heads[1:])
    assert re.search(r"^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$", text, re.M)
    assert "keepachangelog.com" in text and re.search(r"^\[Unreleased\]: https://", text, re.M)
    assert "—" not in text   # house style: no em dashes


@pytest.mark.parametrize("tag", ["0.4.0", "v0.4", "v0.4.0-rc1", "", "v9.9.9"])
def test_bad_or_mismatched_tags_fail(tag):
    with pytest.raises(SystemExit):
        release_notes.notes(tag)


def test_mismatched_versions_fail(tmp_path):
    (tmp_path / ".claude-plugin").mkdir()
    (tmp_path / "scripts").mkdir()
    (tmp_path / ".claude-plugin" / "plugin.json").write_text(json.dumps({"version": "1.2.3"}), encoding="utf-8")
    (tmp_path / "scripts" / "mcp_server.py").write_text('SERVER_INFO = {"name": "replore", "version": "1.2.2"}', encoding="utf-8")
    (tmp_path / "CHANGELOG.md").write_text("## [1.2.3] - 2026-01-01\n\n- x\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="bump both"):
        release_notes.notes("v1.2.3", tmp_path)
    (tmp_path / "scripts" / "mcp_server.py").write_text('SERVER_INFO = {"name": "replore", "version": "1.2.3"}', encoding="utf-8")
    assert release_notes.notes("v1.2.3", tmp_path) == "- x"
    (tmp_path / "CHANGELOG.md").write_text("## [1.2.2] - 2026-01-01\n\n- y\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="no '## \\[1.2.3\\]'"):
        release_notes.notes("v1.2.3", tmp_path)


def test_release_workflow_is_tag_only_pinned_and_least_privilege():
    wf = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8").replace("\r\n", "\n")
    assert 'tags: ["v*"]' in wf and "branches" not in wf
    assert wf.count("contents: write") == 1 and re.search(r"^permissions:\n  contents: read", wf, re.M)
    assert re.search(r"jobs:\n  release:\n(    .*\n)*    permissions:\n      contents: write", wf)
    assert "python3 ops/release_notes.py" in wf and "gh release create" in wf and "--verify-tag" in wf
    assert "${{ github.ref_name }}" not in wf.split("run:")[1].split("\n")[0]   # the tag reaches run: via env only
    for uses in re.findall(r"uses: (\S+)", wf):
        assert re.fullmatch(r"[\w.-]+/[\w.-]+@[0-9a-f]{40}", uses), uses   # RS50: SHA-pinned


def test_readme_documents_the_release_steps():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "CHANGELOG.md" in readme and "git tag v" in readme and "SERVER_INFO" in readme
