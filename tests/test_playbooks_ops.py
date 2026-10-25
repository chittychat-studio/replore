"""SPEC RS97: ops/playbooks.py turns a playbook markdown file into the stored JSON shape."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("playbooks", Path(__file__).resolve().parent.parent / "ops" / "playbooks.py")
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)


def test_parse_steps_and_drops_intro_and_rules():
    book, problems = pb.parse("# Title\nIntro text\n---\n## 1. First\nBody one\n- a\n\n## 2) Second\nBody two\n---\n", "my-book")
    assert problems == []
    assert book == {"id": "my-book", "title": "Title", "steps": [{"title": "First", "body": "Body one\n- a"}, {"title": "Second", "body": "Body two"}]}


def test_refuses_bad_files():
    assert pb.parse("no title\n## 1. A\nb", "ok")[1]
    assert pb.parse("# T\nno steps", "ok")[1]
    assert pb.parse("# T\n## 1. A\n", "ok")[1]          # empty body
    assert pb.parse("# T\n## 1. A\nb", "Bad Id")[1]
    assert pb.parse("# T\n## 1. A\n" + "x" * 8001, "ok")[1]


def test_playbooks_folder_is_git_ignored():
    ignore = (Path(__file__).resolve().parent.parent / ".gitignore").read_text(encoding="utf-8")
    assert "\nplaybooks/" in ignore
