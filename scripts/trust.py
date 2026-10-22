#!/usr/bin/env python3
"""Is a repo safe to build on? The plugin's trust check (SPEC RS54), in sync with the web page's (RS53).

Usage: trust.py owner/repo [owner/repo ...] [--json]     (at most 5 repos per run)

For each repo: security health (OpenSSF Scorecard), known vulnerabilities in its latest published package (OSV.dev
IDs via deps.dev), a copy-paste install command, beginner-friendly files, good first issues and the latest release
(GitHub). Display only: it never changes a ranking. Standard library only (RS11); no model, no key (RS1). The GitHub
token, if set, goes to api.github.com only and is never printed (RS8). Every value comes from an API answer or the line
says "couldn't check" (RS7). Behaviour is pinned to the web's by tests/fixtures/trust_cases.json (RS54).
"""
import argparse
import concurrent.futures
import http.client
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

CALL_S = 4            # RS53b: each call capped at 4 s, like the web function
MAX_REPOS = 5         # RS54: GitHub's unauthenticated core limit is 60 calls an hour; a repo costs 4
MAX_ADVISORIES = 10
MAX_BODY = 4_000_000  # a Go package listing is ~200 KB; anything near this is not an answer we trust
GH = "https://api.github.com/repos/"
SCORECARD = "https://api.securityscorecards.dev/projects/github.com/"
DEPS = "https://api.deps.dev/v3/systems/"
# RS53b: GitHub language -> the one ecosystem the forward check tries (kept equal to functions/api/trust.js by a test)
ECOSYSTEM = {"JavaScript": "npm", "TypeScript": "npm", "Python": "pypi", "Rust": "cargo", "Go": "go", "Ruby": "rubygems", "C#": "nuget"}
GO_MAJORS = ["", "/v2", "/v3", "/v4", "/v5", "/v6", "/v7", "/v8", "/v9"]   # Go publishes major N>=2 as `<path>/vN`
INSTALL = {"npm": "npm install ", "pypi": "pip install ", "cargo": "cargo add ", "go": "go get ", "rubygems": "gem install ",
           "nuget": "dotnet add package "}
# RS9: values from the APIs are data; anything outside these shapes is dropped, never shown (same patterns as the web)
REPO_RE = re.compile(r"[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}")
NAME_RE = re.compile(r"[@A-Za-z0-9._/~+-]{1,214}")
VERSION_RE = re.compile(r"[A-Za-z0-9.+_~-]{1,64}")
ADVISORY_RE = re.compile(r"[A-Z][A-Z0-9]{1,15}-[A-Za-z0-9._:-]{1,60}")
LICENSE_RE = re.compile(r"[A-Za-z0-9.+() -]{1,80}")
TAG_RE = re.compile(r"[A-Za-z0-9._/+@-]{1,80}")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
LAST_RE = re.compile(r'<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"')


def valid_repo(r):
    return isinstance(r, str) and bool(REPO_RE.fullmatch(r)) and not re.search(r"/\.\.?$", r)


def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def get_json(url, token=None, timeout=CALL_S):
    """One GET that never raises: (status, json or None, Link header). Status 0 = could not reach the host."""
    headers = {"Accept": "application/json", "User-Agent": "replore"}
    if url.startswith(GH):
        headers["Accept"] = "application/vnd.github+json"
        if token:
            headers["Authorization"] = f"Bearer {token}"   # RS8: only ever sent to api.github.com
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
            status, link, body = r.status, r.headers.get("Link"), r.read(MAX_BODY)
    except urllib.error.HTTPError as e:
        status, link = e.code, (e.headers.get("Link") if e.headers else None)
        try:
            body = e.read(MAX_BODY)
        except (OSError, http.client.HTTPException):
            body = b""
    except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException, ValueError):
        return 0, None, None
    try:
        return status, json.loads(body.decode("utf-8")), link
    except (ValueError, UnicodeDecodeError):
        return status, None, link


# ---- the server half: Scorecard + deps.dev (the web runs this in functions/api/trust.js) ----
def package_candidate(repo, system):
    if not system:
        return None
    return "github.com/" + repo.lower() if system == "go" else repo.split("/")[1].lower()


def shape_scorecard(j):
    if not isinstance(j, dict) or not _num(j.get("score")) or not 0 <= j["score"] <= 10:
        return None
    m = next((c for c in (j.get("checks") if isinstance(j.get("checks"), list) else [])
              if isinstance(c, dict) and c.get("name") == "Maintained"), None)
    ms = m.get("score") if m else None
    date = j.get("date")
    return {"score": _round1(j["score"]),
            "date": date[:10] if isinstance(date, str) and DATE_RE.match(date) else None,
            "maintained": ms if _num(ms) and 0 <= ms <= 10 else None}


def _round1(x):
    """Round half up to one decimal, like the web's Math.round (Python's round() rounds half to even)."""
    v = math.floor(x * 10 + 0.5) / 10
    return int(v) if v == int(v) else v


def default_version(j):
    vs = j.get("versions") if isinstance(j, dict) and isinstance(j.get("versions"), list) else []
    v = next((x for x in vs if isinstance(x, dict) and x.get("isDefault") and isinstance(x.get("versionKey"), dict)), None)
    s = v["versionKey"].get("version") if v else None
    return s if isinstance(s, str) and VERSION_RE.fullmatch(s) else None


def links_to_repo(j, repo):
    """RS53b: accept a version only when the package itself names this exact repo as its source."""
    want = "github.com/" + repo.lower()
    ps = j.get("relatedProjects") if isinstance(j, dict) and isinstance(j.get("relatedProjects"), list) else []
    return any(isinstance(p, dict) and p.get("relationType") == "SOURCE_REPO" and isinstance(p.get("projectKey"), dict)
               and str(p["projectKey"].get("id") or "").lower() == want for p in ps)


def shape_version(j, system, name, version):
    ids = [a.get("id") for a in (j.get("advisoryKeys") if isinstance(j.get("advisoryKeys"), list) else []) if isinstance(a, dict)]
    ids = [i for i in ids if isinstance(i, str) and ADVISORY_RE.fullmatch(i)]
    lic = [x for x in (j.get("licenses") if isinstance(j.get("licenses"), list) else []) if isinstance(x, str) and LICENSE_RE.fullmatch(x)]
    return {"system": system, "name": name, "version": version, "licenses": lic[:3],
            "advisories": ids[:MAX_ADVISORIES], "advisoryCount": len(ids)}


def scorecard_part(repo, get=None):
    get = get or get_json   # looked up at call time, so tests can swap it
    try:
        status, j, _ = get(SCORECARD + repo)
    except Exception:
        return {"status": "error"}
    if status == 404:
        return {"status": "none"}
    sc = shape_scorecard(j) if status == 200 else None
    return dict(status="ok", **sc) if sc else {"status": "error"}


def package_part(repo, lang, get=None):
    get = get or get_json   # looked up at call time, so tests can swap it
    system = ECOSYSTEM.get(lang) if isinstance(lang, str) else None
    root = package_candidate(repo, system)
    if not root:
        return {"status": "skipped"}
    url = lambda n: DEPS + system + "/packages/" + urllib.parse.quote(n, safe="")
    names = [root + m for m in GO_MAJORS] if system == "go" else [root]

    def probe(n):
        try:
            return get(url(n))
        except Exception:
            return 0, None, None
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(names)) as ex:
        found = list(ex.map(probe, names))
    failed = lambda p: p[0] not in (200, 404)
    i = len(found) - 1   # the highest major that exists wins
    while i >= 0 and not (found[i][0] == 200 and default_version(found[i][1])):
        i -= 1
    if i < 0:
        return {"status": "error"} if any(map(failed, found)) else {"status": "none"}
    if any(map(failed, found[i + 1:])):
        return {"status": "error"}   # a newer major may exist: never show an older one instead
    name, version = names[i], default_version(found[i][1])
    try:
        status, j, _ = get(url(name) + "/versions/" + urllib.parse.quote(version, safe=""))
    except Exception:
        return {"status": "error"}
    if status != 200 or not isinstance(j, dict):
        return {"status": "error"}
    if not links_to_repo(j, repo):
        return {"status": "none"}   # same name, someone else's package
    return dict(status="ok", **shape_version(j, system, name, version))


def trust_for(repo, lang, get=None):
    """The same answer the web's GET /api/trust gives: {repo, scorecard, package}."""
    get = get or get_json   # looked up at call time, so tests can swap it
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        sc, pk = ex.submit(scorecard_part, repo, get), ex.submit(package_part, repo, lang, get)
        return {"repo": repo, "scorecard": sc.result(), "package": pk.result()}


# ---- the GitHub half (the web runs this in the browser, web/app.js ghShape) ----
def last_page(link, n):
    m = LAST_RE.search(link or "")
    return int(m.group(1)) if m else int(n or 0)


def gh_shape(raw):
    c, rl, g = (raw.get(k) or {} for k in ("community", "release", "gfi"))
    limited = any(x.get("s") in (403, 429) for x in (c, rl, g))
    f = c.get("j", {}).get("files") if c.get("s") == 200 and isinstance(c.get("j"), dict) else None
    rel = None
    if rl.get("s") == 404:
        rel = "none"
    elif rl.get("s") == 200 and isinstance(rl.get("j"), dict):
        tag, pub = str(rl["j"].get("tag_name") or ""), str(rl["j"].get("published_at") or "")
        if TAG_RE.fullmatch(tag) and DATE_RE.match(pub):
            rel = {"tag": tag, "date": pub[:10]}
    gfi = last_page(g.get("link"), len(g["j"])) if g.get("s") == 200 and isinstance(g.get("j"), list) else None
    # JS truthiness, like the web's `!!f.readme`: GitHub sends {} or an object when a file exists, null when not
    present = lambda x: x is not None and x is not False and x != 0 and x != ""
    return {"limited": limited,
            "files": {"readme": present(f.get("readme")), "contributing": present(f.get("contributing")),
                      "coc": present(f.get("code_of_conduct"))} if isinstance(f, dict) else None,
            "release": rel, "gfi": gfi}


def github_part(repo, token=None, get=None):
    get = get or get_json   # looked up at call time, so tests can swap it
    paths = ["/community/profile", "/releases/latest", "/issues?labels=good%20first%20issue&state=open&per_page=1"]

    def one(p):
        try:
            s, j, link = get(GH + repo + p, token)
        except Exception:
            s, j, link = 0, None, None
        return {"s": s, "j": j, "link": link}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        c, r, g = ex.map(one, paths)
    return gh_shape({"community": c, "release": r, "gfi": g})


def repo_meta(repo, token=None, get=None):
    """Language and license for a repo named on the command line (scout.py already has both)."""
    get = get or get_json   # looked up at call time, so tests can swap it
    try:
        s, j, _ = get(GH + repo, token)
    except Exception:
        s, j = 0, None
    if s == 404:
        return {"status": "not_found"}
    if s in (403, 429):
        return {"status": "limited"}
    if s != 200 or not isinstance(j, dict):
        return {"status": "error"}
    lang = j.get("language") if isinstance(j.get("language"), str) else ""
    lic = (j.get("license") or {}).get("spdx_id") if isinstance(j.get("license"), dict) else None
    return {"status": "ok", "language": lang, "spdx": lic if isinstance(lic, str) and LICENSE_RE.fullmatch(lic) else ""}


def check(repo, lang, spdx, token=None, get=None):
    """One repo, both halves: {repo, language, license, github, scorecard, package}."""
    get = get or get_json   # looked up at call time, so tests can swap it
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        gh, tr = ex.submit(github_part, repo, token, get), ex.submit(trust_for, repo, lang, get)
        tr = tr.result()
        return {"repo": repo, "language": lang or "", "license": spdx or "", "github": gh.result(),
                "scorecard": tr["scorecard"], "package": tr["package"]}


def check_many(rows, token=None, get=None):
    """rows: [(repo, lang, spdx)] -> results in the same order, at most MAX_REPOS, checked in parallel."""
    get = get or get_json   # looked up at call time, so tests can swap it
    rows = list(rows)[:MAX_REPOS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(rows))) as ex:
        return list(ex.map(lambda r: check(r[0], r[1], r[2], token, get), rows))


# ---- wording: the same phrases as the web panel (web/app.js trustHtml), pinned by the shared render cases ----
def _ago(date):
    return date   # plain ISO date: stable in terminals, transcripts and CSV-minded tools


def trust_lines(gh, tr, spdx, repo):
    na = "couldn't check"
    sc = (tr or {}).get("scorecard") or None
    pk = (tr or {}).get("package") or None
    lines = []
    if sc and sc.get("status") == "ok":
        m = sc.get("maintained")
        lines.append(f"Security health {sc['score']:g}/10" + (f" · maintained {m:g}/10" if _num(m) else "")
                     + f" · OpenSSF Scorecard https://scorecard.dev/viewer/?uri=github.com/{repo}")
    else:
        lines.append("Security health " + ("not scored by OpenSSF Scorecard yet" if sc and sc.get("status") == "none" else na))
    if pk and pk.get("status") == "ok" and NAME_RE.fullmatch(str(pk.get("name"))) and VERSION_RE.fullmatch(str(pk.get("version"))):
        ids = [i for i in (pk.get("advisories") or []) if isinstance(i, str) and ADVISORY_RE.fullmatch(i)]
        n = max(int(pk.get("advisoryCount") or 0), len(ids))
        head = f"Known vulnerabilities in {pk['name']} {pk['version']}: "
        lines.append(head + ("✓ none known" if n == 0 else f"⚠ {n} known — "
                             + ", ".join(f"{i} (https://osv.dev/vulnerability/{i})" for i in ids) + (" …" if n > len(ids) else "")))
        cmd = install_cmd(pk.get("system"), pk.get("name"))
        if cmd:
            lines.append("Install " + cmd)
        lic = [x for x in (pk.get("licenses") or []) if isinstance(x, str) and LICENSE_RE.fullmatch(x)]
        if lic and spdx not in lic:
            lines.append(f"Package license {', '.join(lic)} (the repo says {spdx or 'none'})")
    elif pk and pk.get("status") == "none":
        lines.append("Package no published package matched this repo")
    elif not pk or pk.get("status") == "error":
        lines.append("Known vulnerabilities " + na)
    if gh and gh.get("limited"):
        lines.append("GitHub's hourly limit is used up — try again later (or set GITHUB_TOKEN)")
    else:
        f = (gh or {}).get("files")
        mark = lambda b, t: ("✓ " if b else "✗ ") + t
        files = " · ".join([mark(f["readme"], "README"), mark(f["contributing"], "contributing guide"),
                            mark(f["coc"], "code of conduct")]) if f else na
        gfi = (gh or {}).get("gfi")
        lines.append("Beginner-friendly " + files + (f" · {gfi} good first issue" + ("" if gfi == 1 else "s") if gfi is not None else ""))
        rel = (gh or {}).get("release")
        lines.append("Latest release " + ("no releases yet" if rel == "none" else f"{rel['tag']}, {_ago(rel['date'])}" if rel else na))
    return lines


NOTE = "For information — it doesn't change the ranking. Sources: OpenSSF Scorecard, deps.dev, OSV.dev, GitHub."


def install_cmd(system, name):
    return INSTALL[system] + name if system in INSTALL and NAME_RE.fullmatch(str(name or "")) else ""


def lines_for(result):
    """Lines for one check() result."""
    tr = {"scorecard": result.get("scorecard"), "package": result.get("package")}
    return trust_lines(result.get("github"), tr, result.get("license", ""), result["repo"])


def render(results):
    out = []
    for r in results:
        out.append(f"{r['repo']} — Safe to build on?")
        out += ["  " + x for x in (r["lines"] if "lines" in r else lines_for(r))]
        out.append("")
    return "\n".join(out + [NOTE])


def main(argv=None):
    for s in (sys.stdout, sys.stderr):   # RS48: ✓ ✗ ⚠ print on Windows consoles too
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("repos", nargs="+", help="owner/repo (or a github.com link), at most %d" % MAX_REPOS)
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    repos = []
    for r in a.repos:
        r = re.sub(r"^https?://(www\.)?github\.com/", "", r.strip()).rstrip("/")
        r = r[:-4] if r.endswith(".git") else r
        if not valid_repo(r):
            print(f"replore: '{r[:60]}' is not owner/repo.", file=sys.stderr)
            return 2
        if r not in repos:
            repos.append(r)
    if len(repos) > MAX_REPOS:
        print(f"replore: at most {MAX_REPOS} repos per check (GitHub allows 60 calls an hour without a token).", file=sys.stderr)
        return 2
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")   # RS8: never printed
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(repos)) as ex:
        metas = list(ex.map(lambda r: repo_meta(r, token), repos))
    rows, results = [], []
    for repo, m in zip(repos, metas):
        if m["status"] == "ok":
            rows.append((repo, m["language"], m["spdx"]))
    checked = iter(check_many(rows, token))
    for repo, m in zip(repos, metas):
        if m["status"] == "ok":
            r = next(checked)
            r["lines"] = lines_for(r)
        else:
            msg = {"not_found": "not found on GitHub", "limited": "GitHub's hourly limit is used up — try again later (or set GITHUB_TOKEN)"}
            r = {"repo": repo, "error": m["status"], "lines": [msg.get(m["status"], "couldn't check")]}
        results.append(r)
    print(json.dumps(results, indent=2, ensure_ascii=False) if a.json else render(results))
    return 0


if __name__ == "__main__":
    sys.exit(main())
