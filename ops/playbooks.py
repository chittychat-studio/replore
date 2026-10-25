"""SPEC RS97: turn the owner's Pro playbooks (git-ignored playbooks/<id>.md) into the JSON the PLAYBOOKS KV namespace holds.

Usage:  python ops/playbooks.py [NAMESPACE_ID]
Writes playbooks/out/<id>.json and playbooks/out/index.json, then prints the wrangler commands that store them
(pb:<id> and pb:index). Standard library only. A playbook file is a "# Title" line, then "## N. Step title" sections;
the text under each step heading is its body (paragraphs, "- " bullets, **bold**, `code`, https links). Lines before the
first step (an intro) and "---" rules are dropped. The ids and limits match functions/api/pro/playbook.js.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "playbooks"
OUT = SRC / "out"
ID = re.compile(r"^[a-z0-9-]{1,60}$")
STEP = re.compile(r"^##\s+(?:\d+[.)]\s*)?(.+?)\s*$")


def parse(text, pid):
    title, steps, cur = None, [], None
    for line in text.replace("\r", "").split("\n"):
        if title is None and line.startswith("# "):
            title = line[2:].strip()
            continue
        m = STEP.match(line)
        if m:
            cur = {"title": m.group(1), "body": []}
            steps.append(cur)
            continue
        if cur is not None and line.strip() != "---":
            cur["body"].append(line.rstrip())
    steps = [{"title": s["title"], "body": "\n".join(s["body"]).strip()} for s in steps]
    problems = []
    if not ID.match(pid):
        problems.append("file name must be 1-60 of a-z, 0-9, -")
    if not title or len(title) > 120:
        problems.append("needs a '# Title' line (up to 120 characters)")
    if not 1 <= len(steps) <= 60:
        problems.append("needs 1 to 60 '## N. Step' sections")
    for i, s in enumerate(steps, 1):
        if not 0 < len(s["title"]) <= 160 or not 0 < len(s["body"]) <= 8000:
            problems.append("step %d: title 1-160 characters, body 1-8000" % i)
    return {"id": pid, "title": title, "steps": steps}, problems


def main(argv):
    ns = argv[1] if len(argv) > 1 else "<NAMESPACE_ID>"
    files = sorted(SRC.glob("*.md")) if SRC.is_dir() else []
    if not files:
        print("No playbooks/*.md found.")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    index, bad = [], False
    for f in files:
        book, problems = parse(f.read_text(encoding="utf-8"), f.stem)
        if problems:
            bad = True
            print("%s: %s" % (f.name, "; ".join(problems)))
            continue
        (OUT / (f.stem + ".json")).write_text(json.dumps(book, ensure_ascii=False), encoding="utf-8")
        index.append({"id": book["id"], "title": book["title"], "steps": len(book["steps"])})
    if bad:
        return 1
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print("Run these (needs your Cloudflare login). No redeploy needed: the site reads KV live.")
    for row in index:
        print('npx wrangler kv key put "pb:%s" --path "playbooks/out/%s.json" --namespace-id %s --remote' % (row["id"], row["id"], ns))
    print('npx wrangler kv key put "pb:index" --path "playbooks/out/index.json" --namespace-id %s --remote' % ns)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
