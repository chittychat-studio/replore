"""Replore unit tests. No network: fetch is replaced with fixtures (RS2-RS11)."""
import datetime as dt
import io
import json
import re
import sys
import urllib.error
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import scout  # noqa: E402

NOW = dt.datetime(2026, 10, 12, tzinfo=dt.timezone.utc)


def _page():
    """The whole web page as shipped: markup + its scripts (RS49 moved the code out of index.html into app.js)."""
    return "\n".join((ROOT / "web" / f).read_text(encoding="utf-8") for f in ("index.html", "theme.js", "app.js"))


def repo(name, stars, spdx="MIT", pushed="2026-09-01T00:00:00Z", **kw):
    return {"full_name": name, "stargazers_count": stars, "license": {"spdx_id": spdx} if spdx else None,
            "pushed_at": pushed, "html_url": f"https://github.com/{name}", "description": f"{name} desc",
            "fork": False, "archived": False, **kw}


def fake(pages):
    calls = []

    def f(q, token=None):
        calls.append((q, token))
        return {"items": pages[len(calls) - 1]}
    f.calls = calls
    return f


def run(pages, queries=None, **kw):
    f = fake(pages)
    res = scout.scout(queries or [f"q{i}" for i in range(len(pages))], fetcher=f, now=NOW, **kw)
    return res, f


def test_dedupes_and_ranks_across_queries():
    """RS2, RS5."""
    res, _ = run([[repo("a/gsap", 20000), repo("b/x", 500)], [repo("c/taste", 3000), repo("a/gsap", 20000)]])
    assert [r["full_name"] for r in res["top"]] == ["a/gsap", "c/taste", "b/x"]
    assert [r["rank"] for r in res["top"]] == [1, 2, 3]
    assert res["excluded"]["duplicate"] == 1
    assert res["top"][1]["query"] == "q1"


def test_tie_broken_by_recent_push():
    """RS5: in stars mode, equal stars are broken by the most recent push."""
    res, _ = run([[repo("a/old", 100, pushed="2026-01-01T00:00:00Z"), repo("b/new", 100)]], rank_mode="stars")
    assert [r["full_name"] for r in res["top"]] == ["b/new", "a/old"]


def test_balanced_rank_stops_one_query_swamping_others():
    """RS5: the iOS/website failure: one broad query used to fill the whole top 10."""
    broad = [repo(f"big/r{i}", 100000 - i) for i in range(10)]
    niche = [repo("niche/a", 900), repo("niche/b", 800)]
    other = [repo("other/a", 50)]
    res, _ = run([broad, niche, other], top=3, rank_mode="balanced")
    assert [r["full_name"] for r in res["top"]] == ["big/r0", "niche/a", "other/a"]
    assert [r["full_name"] for r in res["candidates"][3:5]] == ["big/r1", "niche/b"]


def test_stars_rank_mode_keeps_old_order():
    """RS5."""
    broad = [repo(f"big/r{i}", 100000 - i) for i in range(5)]
    res, _ = run([broad, [repo("niche/a", 900)]], top=3, rank_mode="stars")
    assert [r["full_name"] for r in res["top"]] == ["big/r0", "big/r1", "big/r2"]


def test_balanced_round_sorted_by_stars_and_empty_query_skipped():
    """RS5."""
    res, _ = run([[repo("a/low", 10)], [], [repo("b/high", 99)]], rank_mode="balanced")
    assert [r["full_name"] for r in res["top"]] == ["b/high", "a/low"]


def test_fit_score_lifts_relevance_and_freedom():
    """RS5: a precise top-of-search match beats a tangential giant; permissive beats copyleft at a tie."""
    exact = {"rel": 0, "stars": 300, "starter": False, "license_use": scout.USE_PAID_OK}
    giant = {"rel": 12, "stars": 120000, "starter": False, "license_use": scout.USE_PAID_OK}
    assert scout.fit_score(exact) > scout.fit_score(giant)
    mit = {"rel": 0, "stars": 1000, "starter": False, "license_use": scout.USE_PAID_OK}
    agpl = {"rel": 0, "stars": 1000, "starter": False, "license_use": scout.USE_NETWORK}
    assert scout.fit_score(mit) > scout.fit_score(agpl)


def test_fit_is_default_and_ranks_relevant_small_repo_first():
    """RS5: with fit (the default), the exact match at the top of its search outranks a far bigger tangential repo."""
    # tangential giant sits 13th in its query's results (rel=12); the exact match is first in its query (rel=0)
    tangential = [repo(f"big/f{i}", 1) for i in range(12)] + [repo("big/giant", 120000)]
    res, _ = run([[repo("tiny/exact", 300)], tangential])
    assert res["rank_mode"] == "fit"
    assert res["top"][0]["full_name"] == "tiny/exact"


def test_why_relevant_keyword_then_fallback():
    """RS24: shows the matched words, else a best-match fallback."""
    w = scout.why_relevant("rag chatbot", "me/rag-chat", "a RAG chatbot over PDFs", 0)
    assert w.startswith("Matches your search") and "rag" in w
    assert scout.why_relevant("zzz", "x/y", "unrelated", 1) == "Top match for your search"
    assert scout.why_relevant("zzz", "x/y", "unrelated", 9) == "Related to your search"


def test_why_relevant_whole_word_and_ignores_qualifiers():
    """RS24: 'ai' must not match inside 'email'; topic:/language: and negated -terms are never claimed."""
    assert scout.why_relevant("ai chat", "me/mailer", "a fast email client", 0) == "Top match for your search"
    assert scout.why_relevant("ios app -topic:macos", "a/b", "a macOS and iOS helper", 0) == 'Matches your search: "ios"'
    assert scout.why_relevant("rag chatbot", "me/rag", "a RAG chatbot", 0) == 'Matches your search: "rag", "chatbot"'


def test_tail_matches_rank_after_the_head():
    """RS5c (second review, live: zensical at best-match position 32 beat 11ty/lume at 21-29 on stars alone): a repo found
    only past GitHub's first 20 best matches ranks after every head match; the page does the same (test_web_logic.js)."""
    head = [repo(f"head/r{i}", 60) for i in range(20)]
    res, _ = run([head + [repo("tail/giant", 90000), repo("tail/small", 70)]])
    names = [r["full_name"] for r in res["all"]]
    assert names[:20] == [f"head/r{i}" for i in range(20)] and names[20:] == ["tail/giant", "tail/small"]
    assert scout.PER_PAGE == 50 and scout.REL_SPAN == 20


def test_duplicate_keeps_best_relevance_position():
    """RS5: a repo found by two queries is scored under its best (lowest) best-match position, not the first."""
    q1 = [repo(f"q1/r{i}", 1000) for i in range(5)] + [repo("x/dup", 1000)]  # x/dup at rel=5 here
    q2 = [repo("x/dup", 1000)]                                               # and rel=0 here
    res, _ = run([q1, q2])
    dup = next(r for r in res["all"] if r["full_name"] == "x/dup")
    assert dup["rel"] == 0 and dup["query"] == "q0"  # best rel, still grouped under the first finder (RS23)
    assert res["excluded"]["duplicate"] == 1


def test_freedom_tiers_rank_free_above_copyleft_above_none():
    """RS5: permissive > weak > GPL/AGPL > no licence (the last only with --license any)."""
    assert scout._freedom(scout.USE_PAID_OK) > scout._freedom(scout.USE_WEAK) > scout._freedom(scout.USE_SHARE)
    assert scout._freedom(scout.USE_SHARE) == scout._freedom(scout.USE_NETWORK) > scout._freedom(scout.USE_NONE)


def test_fit_starter_bonus_uses_per_query_floor():
    """RS15: a niche query's starter earns the nudge against *its* top repo, not a bigger query's."""
    big = [repo("big/lib", 100000)]
    niche = [repo("niche/lib", 2000), repo("niche/tpl", 500, is_template=True)]
    res, _ = run([big, niche], prefer_starters=True)
    names = [r["full_name"] for r in res["all"]]
    assert names.index("niche/tpl") < names.index("niche/lib")


@pytest.mark.parametrize("spdx,want", [
    ("MIT", "USE_PAID_OK"), ("Apache-2.0", "USE_PAID_OK"), ("CC0-1.0", "USE_PAID_OK"), ("BSD-3-Clause", "USE_PAID_OK"),
    ("MPL-2.0", "USE_WEAK"), ("LGPL-3.0", "USE_WEAK"),
    ("GPL-3.0", "USE_SHARE"), ("GPL-2.0", "USE_SHARE"), ("EUPL-1.2", "USE_SHARE"),
    ("AGPL-3.0", "USE_NETWORK"), ("OSL-3.0", "USE_NETWORK"),
    (None, "USE_NONE"), ("NOASSERTION", "USE_NONE"), ("CC-BY-NC-4.0", "USE_NONE"),
])
def test_license_use_plain_english(spdx, want):
    """RS14."""
    assert scout.license_use(spdx) == getattr(scout, want)


def test_every_open_license_has_a_label():
    """RS14: no open license falls through to 'no license'."""
    labelled = scout.PERMISSIVE | scout.WEAK_COPYLEFT | scout.STRONG_COPYLEFT | scout.NETWORK_COPYLEFT
    assert scout.OPEN_LICENSES <= labelled


def test_starter_detection_and_hint():
    """RS15."""
    res, _ = run([[repo("a/tpl", 3, is_template=True), repo("b/topic", 2, topics=["Boilerplate", "react"]),
                   repo("c/lib", 1, topics=["ui"])]])
    by = {r["full_name"]: r for r in res["candidates"]}
    assert by["a/tpl"]["starter"] and by["a/tpl"]["start_hint"] == scout.HINT_TEMPLATE
    assert by["b/topic"]["starter"] and by["b/topic"]["start_hint"] == scout.HINT_README
    assert not by["c/lib"]["starter"]


def test_prefer_starters_within_each_query():
    """RS15: starters first inside a query; balanced rounds still apply across queries."""
    q0 = [repo("lib/big", 50000), repo("tpl/small", 6000, is_template=True)]
    q1 = [repo("other/x", 7000)]
    res, _ = run([q0, q1], prefer_starters=True, rank_mode="balanced")
    assert [r["full_name"] for r in res["candidates"]] == ["other/x", "tpl/small", "lib/big"]
    res, _ = run([q0, q1], rank_mode="balanced")
    assert [r["full_name"] for r in res["candidates"]] == ["lib/big", "other/x", "tpl/small"]


def test_tiny_starter_does_not_jump_a_popular_library():
    """RS15: live regression, a 65-star template outranked a 12,992-star animation library."""
    q = [repo("barbajs/barba", 12992), repo("tiny/tpl", 65, is_template=True), repo("ok/tpl", 1300, is_template=True)]
    res, _ = run([q], prefer_starters=True, rank_mode="balanced")
    assert [r["full_name"] for r in res["candidates"]] == ["ok/tpl", "barbajs/barba", "tiny/tpl"]


def test_text_and_markdown_show_labels_and_key():
    """RS10, RS14, RS15, RS17."""
    res, _ = run([[repo("a/tpl", 3, spdx="AGPL-3.0", is_template=True)]], license_mode="open")
    txt, md = scout.render(res), scout.render_markdown(res)
    for out in (txt, md):
        assert scout.USE_NETWORK in out and scout.HINT_TEMPLATE.replace("'", "") in out.replace("'", "").replace("\\", "")
        assert "stars can be bought" in out and "not legal advice" in out
        assert "fit" in out
    assert "[starter]" in txt and "| yes |" in md
    empty, _ = run([[]])
    assert "stars can be bought" in scout.render(empty) and "stars can be bought" in scout.render_markdown(empty)


def test_cli_rank_and_starter_flags(monkeypatch, capsys):
    """RS5, RS15."""
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("a/b", 500)]})
    assert scout.main(["--rank", "stars", "--prefer-starters", "--json", "x"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["rank_mode"] == "stars" and data["prefer_starters"] is True


def test_skill_vibe_coder_rules():
    """RS16, RS17, RS14, RS15."""
    skill = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    assert "-topic:macos" in skill and "--prefer-starters" in skill
    assert "winget install Python.Python.3.12" in skill and "Add python.exe to PATH" in skill
    assert "license_use" in skill and "start_hint" in skill and "stars can be bought" in skill


def test_workflow_passes_rank_and_starters_via_env():
    """RS13, RS5, RS15."""
    wf = (ROOT / ".github" / "workflows" / "find.yml").read_text(encoding="utf-8")
    assert "RANK: ${{ inputs.rank }}" in wf and "PREFER_STARTERS: ${{ inputs.prefer_starters }}" in wf
    assert '"--rank", os.environ["RANK"]' in wf


def test_top_and_candidates_limits():
    """RS5."""
    res, _ = run([[repo(f"o/r{i}", 1000 - i) for i in range(20)]], top=3, candidates=10)
    assert len(res["top"]) == 3 and len(res["candidates"]) == 10


def test_query_always_excludes_forks_and_archived():
    """RS2, RS4b: forks/archived out, and the staleness + star filters go into the GitHub query itself."""
    _, f = run([[]])
    assert f.calls[0][0] == "q0 fork:false archived:false is:public pushed:>=2024-10-11"
    _, f = run([[]], min_stars=50, max_age_months=0)
    assert f.calls[0][0] == "q0 fork:false archived:false is:public stars:>=50"


def test_query_qualifiers_match_the_web_page():
    """RS4b, RS29b: the same inputs give the same q string in scout.py and the page (Node test reads the same file)."""
    fx = json.loads((ROOT / "tests" / "fixtures" / "qualifier_cases.json").read_text(encoding="utf-8"))
    now = dt.datetime.fromisoformat(fx["now"].replace("Z", "+00:00"))
    for c in fx["cases"]:
        got = scout.build_query(c["q"], c["max_age_months"], c["min_stars"], now)
        assert got == c["expect"], c["name"]
        assert len(got) <= scout.GH_MAX_QUERY and not re.search(r"\b(AND|OR|NOT)\b", got)


def test_client_filters_still_apply_when_github_ignores_qualifiers():
    """RS4b: defence in depth: a stale / low-star / forked repo in the reply is still excluded and counted."""
    res, _ = run([[repo("a/old", 900, pushed="2020-01-01T00:00:00Z"), repo("a/tiny", 3), repo("a/f", 900, fork=True),
                   repo("a/ok", 900)]], min_stars=50)
    assert [r["full_name"] for r in res["top"]] == ["a/ok"]
    assert (res["excluded"]["stale"], res["excluded"]["low_stars"], res["excluded"]["fork_or_archived"]) == (1, 1, 1)


def test_forks_archived_disabled_excluded():
    """RS2."""
    res, _ = run([[repo("a/f", 9, fork=True), repo("a/z", 9, archived=True), repo("a/d", 9, disabled=True),
                   repo("a/ok", 1)]])
    assert [r["full_name"] for r in res["top"]] == ["a/ok"]
    assert res["excluded"]["fork_or_archived"] == 3


@pytest.mark.parametrize("spdx", [None, "NOASSERTION", "CC-BY-NC-4.0", "SSPL-1.0"])
def test_non_open_license_excluded_by_default(spdx):
    """RS3."""
    res, _ = run([[repo("a/x", 9, spdx=spdx), repo("a/ok", 1, spdx="Apache-2.0")]])
    assert [r["full_name"] for r in res["top"]] == ["a/ok"]
    assert res["excluded"]["license"] == 1


def test_license_any_keeps_and_flags_unlicensed():
    """RS3."""
    res, _ = run([[repo("a/none", 9, spdx=None), repo("a/nc", 8, spdx="CC-BY-NC-4.0"), repo("a/mit", 1)]],
                 license_mode="any")
    by = {r["full_name"]: r for r in res["top"]}
    assert "all rights reserved" in by["a/none"]["license"] and not by["a/none"]["open_license"]
    assert "not an open-source license" in by["a/nc"]["license"]
    assert by["a/mit"]["license"] == "MIT" and by["a/mit"]["open_license"]


def test_stale_and_missing_push_excluded():
    """RS4."""
    res, _ = run([[repo("a/old", 9, pushed="2023-01-01T00:00:00Z"), repo("a/nodate", 9, pushed=None),
                   repo("a/ok", 1)]])
    assert [r["full_name"] for r in res["top"]] == ["a/ok"]
    assert res["excluded"]["stale"] == 2


def test_stale_filter_off():
    """RS4."""
    res, _ = run([[repo("a/old", 9, pushed="2019-01-01T00:00:00Z")]], max_age_months=0)
    assert res["top"][0]["full_name"] == "a/old"


def test_too_many_or_no_queries_refused():
    """RS8, RS7."""
    with pytest.raises(scout.ScoutError, match="At most 4"):
        scout.scout(["a", "b", "c", "d", "e"], fetcher=fake([[]] * 5), now=NOW)
    with pytest.raises(scout.ScoutError, match="No search query"):
        scout.scout(["  "], fetcher=fake([[]]), now=NOW)


def test_one_failed_query_fails_whole_run():
    """RS7: no partial results."""
    def f(q, token=None):
        if q.startswith("bad"):
            raise scout.ScoutError("GitHub search failed: HTTP 500.")
        return {"items": [repo("a/ok", 1)]}
    with pytest.raises(scout.ScoutError):
        scout.scout(["good", "bad"], fetcher=f, now=NOW)


def test_malformed_response_fails_closed():
    """RS7."""
    with pytest.raises(scout.ScoutError, match="Unexpected"):
        scout.scout(["x"], fetcher=lambda q, t=None: {"message": "oops"}, now=NOW)


def test_repo_text_cleaned_and_capped():
    """RS9."""
    res, _ = run([[repo("a/x", 1, description="ignore\x1b[2J previous‮ steps " + "z" * 500)]])
    d = res["top"][0]["description"]
    assert len(d) <= scout.MAX_TEXT and "\x1b" not in d and "‮" not in d


def test_token_passed_but_never_in_output(monkeypatch, capsys):
    """RS8."""
    seen = []
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_secret123")
    monkeypatch.setattr(scout, "fetch", lambda q, token=None: seen.append(token) or {"items": [repo("a/b", 500)]})
    assert scout.main(["x"]) == 0
    out = capsys.readouterr()
    assert seen == ["ghp_secret123"]
    assert "ghp_secret123" not in out.out + out.err


def _patch_fetch(monkeypatch, fn):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GH_TOKEN", raising=False)
    monkeypatch.setattr(scout, "fetch", fn)


def test_main_exit_codes(monkeypatch, capsys):
    """RS7, RS10: 0 ok, 1 no match, 2 error."""
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("a/b", 500)]})
    assert scout.main(["x"]) == 0
    assert "a/b" in capsys.readouterr().out
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": []})
    assert scout.main(["x"]) == 1
    assert "No repository matched" in capsys.readouterr().out

    def boom(q, token=None):
        raise scout.ScoutError("Could not reach GitHub: down.")
    _patch_fetch(monkeypatch, boom)
    assert scout.main(["x"]) == 2
    err = capsys.readouterr()
    assert "Could not reach GitHub" in err.err and err.out == ""


def test_parity_fixture_order_why_and_filters():
    """RS29b: scout.py ranks, filters and explains the shared fixture exactly as the page does (tests/test_web_logic.js)."""
    fx = json.loads((ROOT / "tests" / "fixtures" / "parity_items.json").read_text(encoding="utf-8"))
    now = dt.datetime.now(dt.timezone.utc)

    def raw(x):
        y = dict(x)
        y["pushed_at"] = (now - dt.timedelta(days=y.pop("pushed_days_ago"))).strftime("%Y-%m-%dT%H:%M:%SZ")
        return y
    pages = iter([[raw(x) for x in lst] for lst in fx["lists"]])
    res = scout.scout(fx["queries"], fetcher=lambda q, t=None: {"items": next(pages)}, now=now, top=None, candidates=None,
                      min_stars=fx["min_stars"], max_age_months=fx["max_age_months"], prefer_starters=fx["prefer_starters"])
    assert [r["full_name"] for r in res["all"]] == fx["expect"]["order"]
    assert res["excluded"] == fx["expect"]["excluded"]
    for r in res["all"]:
        hits = fx["expect"]["hits"][r["full_name"]]
        assert r["why"] == ("Matches your search: " + ", ".join(f'"{h}"' for h in hits) if hits else
                            "Top match for your search" if r["rel"] <= 3 else "Related to your search"), r["full_name"]
    assert scout.harmful_repo("WhatsApp Hacking Learn about ethical hacking of WhatsApp accounts")
    assert not scout.harmful_repo("A privacy-focused nutrition tracker")


def test_emoji_description_prints_on_cp1252_console(monkeypatch):
    """RS48: live crash on Windows: an emoji in a repo description raised UnicodeEncodeError on a cp1252 console."""
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("a/b", 500, description="Fast 🚀 animations ✨")]})
    for fmt in ([], ["--markdown"], ["--csv"]):
        buf, err = io.BytesIO(), io.BytesIO()
        monkeypatch.setattr(sys, "stdout", io.TextIOWrapper(buf, encoding="cp1252"))
        monkeypatch.setattr(sys, "stderr", io.TextIOWrapper(err, encoding="cp1252"))
        assert scout.main(fmt + ["x"]) == 0
        sys.stdout.flush()
        assert "🚀" in buf.getvalue().decode("utf-8")


def test_main_json(monkeypatch, capsys):
    """RS10."""
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("a/b", 500)]})
    assert scout.main(["x", "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["top"][0] == {"full_name": "a/b", "stars": 500, "license": "MIT", "open_license": True,
                              "license_use": scout.USE_PAID_OK, "free": scout.FREE_YES, "starter": False,
                              "start_hint": scout.HINT_README,
                              "pushed": "2026-09-01", "url": "https://github.com/a/b", "query": "x",
                              "description": "a/b desc", "rel": 0, "why": "Top match for your search",
                              "topics": [], "language": "", "rank": 1}
    assert data["rank_mode"] == "fit" and data["prefer_starters"] is False
    assert set(data["excluded"]) == {"fork_or_archived", "license", "stale", "low_stars", "harmful", "duplicate"}
    assert data["min_stars"] == 50


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_fetch_builds_request_and_maps_errors(monkeypatch):
    """RS2, RS7, RS8: the real fetch, with urlopen stubbed."""
    got = {}

    def ok(req, timeout):
        got["url"], got["auth"] = req.full_url, req.get_header("Authorization")
        return _Resp(b'{"items": []}')
    monkeypatch.setattr(scout.urllib.request, "urlopen", ok)
    assert scout.fetch("gsap fork:false", token="t0k") == {"items": []}
    assert "per_page=50" in got["url"] and "sort=stars" not in got["url"] and got["auth"] == "Bearer t0k"

    def http(code, remaining=None):
        def f(req, timeout):
            raise urllib.error.HTTPError(req.full_url, code, "x", {"X-RateLimit-Remaining": remaining}, None)
        return f
    for fn, msg in [(http(403, "0"), "rate limit"), (http(422), "rejected"), (http(500), "HTTP 500")]:
        monkeypatch.setattr(scout.urllib.request, "urlopen", fn)
        with pytest.raises(scout.ScoutError, match=msg):
            scout.fetch("q")

    def down(req, timeout):
        raise urllib.error.URLError("no route")
    monkeypatch.setattr(scout.urllib.request, "urlopen", down)
    with pytest.raises(scout.ScoutError, match="Could not reach"):
        scout.fetch("q")
    monkeypatch.setattr(scout.urllib.request, "urlopen", lambda r, timeout: _Resp(b"<html>"))
    with pytest.raises(scout.ScoutError, match="not JSON"):
        scout.fetch("q")


def test_stdlib_only_and_no_model_calls():
    """RS1, RS11."""
    src = (ROOT / "scripts" / "scout.py").read_text(encoding="utf-8")
    imports = set(re.findall(r"^\s*(?:import|from)\s+([a-zA-Z_]+)", src, re.M))
    assert imports <= {"argparse", "csv", "datetime", "http", "io", "json", "math", "os", "re", "sys", "urllib",
                       "hybrid", "trust"}, imports   # RS42/RS56: hybrid and trust are the local stdlib-only modules below
    assert not re.search(r"anthropic|openai|claude", src, re.I)
    hsrc = (ROOT / "scripts" / "hybrid.py").read_text(encoding="utf-8")
    assert set(re.findall(r"^\s*(?:import|from)\s+([a-zA-Z_]+)", hsrc, re.M)) <= {"json", "math", "os", "re", "urllib", "collections"}
    assert not re.search(r"anthropic|openai|api_key|Authorization", hsrc, re.I)   # no model key, ever (RS1)
    tsrc = (ROOT / "scripts" / "trust.py").read_text(encoding="utf-8")   # RS56
    assert set(re.findall(r"^\s*(?:import|from)\s+([a-zA-Z_]+)", tsrc, re.M)) <= {"argparse", "concurrent", "http", "json", "math", "os", "re", "sys", "urllib"}
    assert not re.search(r"anthropic|openai|api_key", tsrc, re.I)
    assert tsrc.count("Authorization") == 1 and 'if url.startswith(GH):' in tsrc   # the one header: GitHub's token, to GitHub only (RS8)


def test_skill_calls_real_script():
    """RS1."""
    skill = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    assert "${CLAUDE_PLUGIN_ROOT}/scripts/scout.py" in skill
    assert (ROOT / "scripts" / "scout.py").exists()


def test_skill_asks_for_task_when_no_description():
    """RS1a."""
    skill = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    front = skill.split("---")[1]
    assert "argument-hint:" in front
    assert "$ARGUMENTS" in skill
    assert "What are you building, or what task do you need a GitHub repo for?" in skill
    assert skill.index("RS1a") < skill.index("scripts/scout.py"), "must ask before running the search"


def test_markdown_summary_escapes_repo_text():
    """RS13, RS9: repo text cannot inject Markdown, HTML or links into the job summary."""
    res, _ = run([[repo("a/ok", 5, description="<img src=x> [click](http://evil) | **bold**"),
                   repo("b/odd", 3)]])
    res["top"][1]["full_name"] = "b/odd](http://evil)"
    md = scout.render_markdown(res)
    assert "\\<img src=x\\>" in md and "\\*\\*bold\\*\\*" in md and "\\|" in md
    assert re.search(r"(?<!\\)<img", md) is None
    assert "](http://evil)" not in md
    assert "[a/ok](https://github.com/a/ok)" in md
    assert "| 1 |" in md and "semantic relevance check" in md


def test_markdown_no_match(monkeypatch, capsys):
    """RS13, RS7."""
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": []})
    assert scout.main(["--markdown", "x"]) == 1
    assert "No repository matched" in capsys.readouterr().out


def test_workflow_passes_inputs_via_env_only():
    """RS13: workflow inputs never interpolated into the shell script."""
    wf = (ROOT / ".github" / "workflows" / "find.yml").read_text(encoding="utf-8")
    run_block = wf.split("run: |", 1)[1]
    assert "${{" not in run_block
    assert "workflow_dispatch" in wf and "contents: read" in wf
    assert '"--", *queries' in run_block


def test_min_stars_filter_and_cli_default(monkeypatch, capsys):
    """RS4a: live 'diet app' run put 41- and 48-star repos in the top 3."""
    res, _ = run([[repo("wger/wger", 7104), repo("tiny/a", 41)], [repo("tiny/b", 48)]], min_stars=50)
    assert [r["full_name"] for r in res["candidates"]] == ["wger/wger"]
    assert res["excluded"]["low_stars"] == 2
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("tiny/a", 49)]})
    assert scout.main(["x"]) == 1
    assert "low_stars=1" in capsys.readouterr().out
    assert scout.main(["--min-stars", "0", "x"]) == 0


def test_long_query_refused_before_network():
    """RS19: live run, a pasted sentence got HTTP 422 from GitHub."""
    calls = []
    long_q = "i want to build a really nice looking app " * 6
    with pytest.raises(scout.ScoutError, match="too long.*1-3 keywords"):
        scout.scout([long_q], fetcher=lambda q, t=None: calls.append(q) or {"items": []}, now=NOW)
    assert calls == []


def test_error_names_user_query_not_qualifiers():
    """RS19: messages never show the added fork/archived qualifiers."""
    def f(q, token=None):
        raise scout.ScoutError("GitHub rejected it (HTTP 422). Use 1-3 keywords per search.")
    with pytest.raises(scout.ScoutError) as e:
        scout.scout(["calorie counter"], fetcher=f, now=NOW)
    assert "'calorie counter'" in str(e.value) and "fork:false" not in str(e.value)


def test_workflow_fails_on_error_but_not_on_no_match():
    """RS19: live runs showed errors as green because the default shell had no pipefail."""
    wf = (ROOT / ".github" / "workflows" / "find.yml").read_text(encoding="utf-8")
    step = wf.split("- name: Search GitHub", 1)[1]
    assert "shell: bash" in step
    assert "sys.exit(0 if code == 1 else code)" in step
    assert "MIN_STARS: ${{ inputs.min_stars }}" in step and '"--min-stars", os.environ["MIN_STARS"]' in step


def test_skill_edge_case_rules():
    """RS1b, RS18, RS19."""
    skill = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    assert "diet app" in skill and "Do not block on a question" in skill
    assert "Do you mean learning security / testing an app you own, or a hackathon project?" in skill
    assert "Only test systems you own or have written permission to test." in skill
    for word in ("account takeover", "stalkerware", "credential stealers", "keygens", "generators"):
        assert word in skill
    assert "only finds open-source code on GitHub" in skill


def test_defaults_are_top20_with_40_candidates():
    """RS29: top 20, shortlist 40 so the relevance gate can drop and still have 20."""
    res, _ = run([[repo(f"o/r{i}", 1000 - i) for i in range(50)]])
    assert len(res["top"]) == 20 and len(res["candidates"]) == 40


@pytest.mark.parametrize("spdx,want", [("MIT", "FREE_YES"), ("MPL-2.0", "FREE_WEAK"), ("GPL-3.0", "FREE_SHARE"),
                                       ("AGPL-3.0", "FREE_SHARE"), (None, "FREE_NO"), ("NOASSERTION", "FREE_NO")])
def test_completely_free_from_license(spdx, want):
    """RS20."""
    assert scout.free_text(spdx) == getattr(scout, want)


def test_csv_output_rows_and_formula_guard(monkeypatch, capsys):
    """RS20: CSV for Excel/Sheets; repo text starting with = is not run as a formula."""
    import csv as _csv
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [
        repo("a/b", 900, description="=HYPERLINK(evil)"), repo("c/d", 800, spdx="GPL-3.0")]})
    assert scout.main(["--csv", "x"]) == 0
    rows = list(_csv.reader(capsys.readouterr().out.splitlines()))
    assert rows[0] == scout.CSV_FIELDS
    assert rows[1][1] == "a/b" and rows[1][4] == "900" and rows[1][7] == scout.FREE_YES
    assert rows[1][12].startswith("'=")
    assert rows[2][7] == scout.FREE_SHARE and len(rows) == 3


def test_csv_formula_guard_on_every_text_cell():
    """RS20: query, why, name, licence label and description all get the guard (=, +, -, @, tab, CR)."""
    import csv as _csv
    res, _ = run([[repo("@evil/x", 900, spdx="=HYPERLINK(1)", description="+SUM(A1)"),
                   repo("ok/y", 800, description="\tTAB"), repo("ok/z", 700, description="\rCR")]],
                 queries=["-topic:macos ios"], license_mode="any")
    next(r for r in res["candidates"] if r["full_name"] == "@evil/x")["why"] = "=cmd|' /C calc'!A0"
    rows = list(_csv.reader(scout.render_csv(res).splitlines()))
    head = rows[0]
    cell = dict(zip(head, next(r for r in rows[1:] if r[1].endswith("@evil/x"))))
    for col in ("repo", "why_relevant", "license", "query", "description"):
        assert cell[col].startswith("'"), (col, cell[col])
    assert cell["stars"] == "900" and cell["url"].startswith("https://")
    # RS9's clean() already turns a leading tab / CR into nothing; the guard still covers them for any other text cell
    assert all(scout._csv_cell(c + "x") == "'" + c + "x" for c in scout.CSV_FORMULA_START)
    assert scout._csv_cell("plain") == "plain" and scout._csv_cell(5) == 5


def test_markdown_top_table_then_extra_candidates_and_free_note():
    """RS20, RS10: top 20 printed once, the rest under 'More candidates'."""
    res, _ = run([[repo(f"o/r{i}", 1000 - i) for i in range(30)]])
    md = scout.render_markdown(res)
    assert "### Top 20" in md and "### More candidates" in md
    assert md.count("[o/r0]") == 1 and "[o/r29]" in md
    assert "Completely free?" in md and scout.FREE_NOTE in md
    small, _ = run([[repo("a/b", 900)]], top=10)
    assert "More candidates" not in scout.render_markdown(small)


def test_skill_comparison_table_and_prompt_fields():
    """RS20, RS21."""
    skill = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    for col in ("What it does", "Relevance", "OK in a paid product?", "Completely free?", "How to start"):
        assert col in skill
    assert "up to 20" in skill and "Stop when you have 20" in skill
    for field in ("What I'm building", "Platform", "Stack", "Selling it?", "Starting from scratch?"):
        assert field in skill


def test_readme_has_prompt_examples_and_template():
    """RS21."""
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "## Example prompts" in readme and "## Prompt template" in readme
    for goal in ("Website", "Mobile app", "AI agent", "Data", "Games", "Learning"):
        assert f"**{goal}" in readme


def test_csv_block_under_markdown_cannot_break_fence(monkeypatch, capsys):
    """RS20, RS9: one search, CSV fenced under the summary; repo text with ``` can't close the fence."""
    fence = chr(96) * 3
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("a/b", 900, description=fence + " x")]})
    assert scout.main(["--markdown", "--csv-block", "x"]) == 0
    out = capsys.readouterr().out
    assert "## CSV" in out and out.count(fence) == 2 and out.rstrip().endswith(fence)


def test_workflow_csv_option():
    """RS20, RS13."""
    wf = (ROOT / ".github" / "workflows" / "find.yml").read_text(encoding="utf-8")
    assert "CSV: ${{ inputs.csv }}" in wf and '["--csv-block"] if os.environ["CSV"] == "true"' in wf


def test_web_page_is_safe_static(monkeypatch):
    """RS22: no embedded secret, no external scripts, uses the public search API, logic mirrors the script."""
    html = _page()
    # no key or token anywhere: the page never asks for, stores, or embeds one
    import re as _re
    assert not _re.search(r"gh[pousr]_[A-Za-z0-9]{20,}", html), "looks like a real token is embedded"
    assert not _re.search(r"github_pat_[A-Za-z0-9_]{20,}", html)
    assert 'id="token"' not in html and "findrepo_gh_token" not in html
    assert "models.github" not in html and "Authorization" not in html
    # RS33: no third-party asset requests — GSAP 3.12.5 and the fonts are self-hosted; page degrades without GSAP
    index = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    srcs = _re.findall(r'<script[^>]+src="([^"]+)"', index)
    srcs = [s.split("?v=")[0] for s in srcs]   # RS52: app.js / theme.js carry a ?v=<hash> stamp
    assert srcs == ["theme.js", "vendor/gsap.min.js", "app.js"], srcs   # RS49: no inline script; app.js after GSAP
    assert '<script src="vendor/gsap.min.js" defer>' in index and _re.search(r'<script src="app\.js\?v=[0-9a-f]{10}" defer>', index)   # RS24: GSAP first
    assert not _re.search(r"<script(?![^>]*src=)[^>]*>", index) and not _re.search(r"\son[a-z]+\s*=", index)
    assert "<html lang=\"en\">" in index   # RS24: no forced light theme; the system setting applies until the visitor picks one
    gsap = (ROOT / "web" / "vendor" / "gsap.min.js").read_text(encoding="utf-8")
    assert gsap.lstrip("/*! \n").startswith("GSAP 3.12.5") and "standard-licen" in gsap  # pinned, license header kept
    sheets = _re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html)
    assert sheets == ["fonts.css"], sheets
    fcss = (ROOT / "web" / "fonts.css").read_text(encoding="utf-8")
    fonts = _re.findall(r"url\((fonts/[^)]+)\)", fcss)
    assert fonts and all((ROOT / "web" / f).exists() for f in fonts), fonts
    assert "http" not in fcss.split("*/", 1)[1]  # no remote font URLs
    for lic in ("Anton-OFL.txt", "InterTight-OFL.txt", "JetBrainsMono-OFL.txt"):   # RS47: every bundled font ships its licence
        assert (ROOT / "web" / "fonts" / lic).exists(), lic
    assert "Spectral" not in html and '"Inter",' not in html
    for host in ("googleapis", "gstatic", "cdnjs", "unpkg", "jsdelivr"):
        assert host not in html.lower(), host
    # calls the public search API in best-match order (RS2), forks/archived excluded; fit ranking (RS5) re-ranks
    assert "api.github.com/search/repositories" in html
    assert "function ghQuery" in html and '"fork:false"' in html and '"archived:false"' in html and "per_page=" in html and "PER_PAGE=50" in html
    assert "sort=stars" not in html  # RS5: best-match seeds fit ranking; stars no longer forced on the fetch
    assert "rankByFit" in html and "fitScore" in html
    assert "whyRelevant" in html and "'Matches: '" in html  # RS24/RS37: a card says why only on a real word match
    for slop in ("Related to your search", "Top match for your search", "start shipping", "Like our work?",
                 "Here’s what happens", "class=\"eyebrow\""):
        assert slop not in html, slop  # RS37 copy discipline
    # license sets kept in sync with scout.py
    assert all(l in html for l in ("AGPL-3.0", "MPL-2.0", "MIT", "Unlicense"))
    assert "STARTER_MIN_SHARE" in html and "0.10" in html
    assert "max 200 characters" in html  # RS19 length guard
    # RS24 cards surface the license meaning, free answer and starter flag (short labels + full text in titles)
    assert "OK to use in a paid product" in html and "Starter" in html and "Completely free?" in html
    # RS21 clickable example prompts (quick-picks under the search bar) fill the box and run
    assert 'id="quickpicks"' in html and "EXAMPLES" in html and "buildQuickpicks" in html
    assert "function pickExample" in html and "pickExample(ex)" in html
    # RS23 PRD upload is client-side only (FileReader, never uploaded)
    assert 'id="prd"' in html and "FileReader" in html and "prdFeatures" in html
    assert "never uploaded" in html
    # RS22: how-to-run-in-Claude-Code and the >10 edge-case CTA both point to the plugin
    assert "/plugin install replore@replore" in html and "/replore:find" in html
    assert "Use the plugin" in html and "PLUGIN_CTA" in html
    # RS31/RS32: the plugin modal has two tabs — Claude Code one-command, and any other agent via MCP / AGENTS.md
    assert 'data-tab="cc"' in html and 'data-tab="other"' in html and "mcp_server.py" in html and "AGENTS.md" in html
    assert "passed the filters" in html  # the "want every suitable repo?" plugin banner
    # RS29c (retired): the per-results keyword-search banner is gone
    assert "LEXICAL_NOTE" not in html
    # RS29: the redundant "Paid-use OK"/"Completely free" filter chips are collapsed into one commercial-use chip
    assert "Free for commercial use" in html and "data-com=" in html
    assert 'data-paid=' not in html and 'data-free=' not in html
    # RS30: a "Next steps" menu item opens a guidance modal (no model call, points to the plugin)
    assert 'id="nextBtn"' in html and 'id="nextModal"' in html and "Next steps" in html
    assert "Generate plan" in html and "Build it with your AI agent" in html
    # RS27a: similar-repo requires text and is narrowed by it (no silent drop); "find similar" alone is blocked
    assert "RS27a" in html and "· matching" in html and "Add a few words too" in html
    # RS29d: two on/off filters, no "All" chip; an empty filtered set still offers "Clear filter"
    assert "function resFlags" in html and 'aria-pressed="false"' in html and '["all","All"]' not in html
    assert 'id="resClear"' in html and "Clear filter" in html
    # search-bar ✕ resets everything (text, similar repo, filters, picks, results) — shared with the logo
    assert 'id="clearQ"' in html and "function resetAll" in html and 'addEventListener("click",resetAll)' in html
    # light/dark toggle (RS24)
    assert 'id="theme"' in html and "data-theme" in html and "findrepo_theme" in html
    # RS24 Tour: a current screenshot of the live page is committed and embedded (replaces the stale gif)
    assert 'src="tour.png"' in html and (ROOT / "web" / "tour.png").exists()
    # RS28 select-to-PRD hand-off: no model call/key; copy + deep-link to the user's own Claude
    assert 'class="pick-cb"' in html and 'id="prdModal"' in html and 'id="prdPrompt"' in html
    assert "claude.ai/new?q=" in html and "Copy prompt" in html
    assert "chatgpt.com/?q=" in html and "gemini.google.com/app" in html   # RS28b
    # RS44: tip jar is a Stripe Payment Link only (no key), hidden while empty; GitHub credit + no GitHub logo
    assert 'var TIP_URL="";' in html or re.search(r'var TIP_URL="https://buy\.stripe\.com/[A-Za-z0-9_\-]+";', html)
    assert not re.search(r"(sk|pk|rk)_(live|test)_[A-Za-z0-9]", html), "no Stripe key may ever be in the page"
    assert html.count('class="mut tip-el"') == 1 and "fund more open-source projects" in html
    assert 'class="tip-el tip-qr" hidden' in html and (ROOT / "web" / "tip-qr.png").exists()   # RS44 QR, hidden with the tip
    assert "Replore is not affiliated with or endorsed by GitHub" in html and "GitHub® is a trademark of GitHub, Inc." in html
    assert not re.search(r"octocat|mark-github", html, re.I)
    assert '"You are the principal architect for my vibe coding app, with 15+ years of experience building similar apps.' in html   # RS28e
    assert "million dollar" not in html
    assert "list it under GAPS instead of stretching" in html   # RS28c
    # RS42 wording: every RAG mention on the page starts hidden and is shown only when the server reports it on
    for m in re.finditer(r"<[^>]*class=\"[^\"]*rag-only[^\"]*\"[^>]*>", html):
        assert "hidden" in m.group(0), m.group(0)
    assert len(re.findall(r'class="[^"]*rag-only', html)) >= 3 and "function applyRagCopy" in html
    assert "Hybrid search (RAG)" in (ROOT / "README.md").read_text(encoding="utf-8")
    assert 'id="prdMany"' in html and "picks.length<=10" in html and "Plans work best with 10 or fewer repos" in html   # RS28f
    assert "ask me 5 short questions that would most improve this plan" in html and "wait for my answers" in html   # RS28d
    skill = (ROOT / "skills" / "find" / "SKILL.md").read_text(encoding="utf-8")
    assert "Needs first, shell last (RS16a" in skill and "No good match" in skill and "RS28c" in skill   # web and plugin in sync
    assert "var GENERIC=" in html and "RS16a" in html
    # RS28b: Gemini copies BEFORE opening its tab (a focused new tab makes the browser refuse the clipboard write)
    cto = html[html.index("function copyThenOpen("):]
    cto = cto[:cto.index("window.open(openUrl")]
    assert 'execCommand("copy")' in cto and "say(false)" in cto      # copy happens before the tab opens
    assert 'copyThenOpen("Gemini","https://gemini.google.com/app"' in html
    # RS28g: a long prompt never hides Claude/ChatGPT; they switch to copy-then-open
    assert 'linkMode(openLink, tooLong ? "https://claude.ai/new" : url, tooLong)' in html
    assert 'openLink.setAttribute("hidden"' not in html and 'gpt.setAttribute("hidden"' not in html
    assert 'class="hero-pill"' in html and "The repo scout for vibe coders" in html and "Find it before you build it" in html   # RS54 owner tagline
    # RS34: the page does run an AI relevance check, so no copy may claim otherwise
    for stale in ("There is no AI in this page", "For AI-written searches, a relevance check", "runs a semantic relevance check"):
        assert stale not in html, stale
    # RS28a: 'Select all shown' acts on visible cards only; the prompt makes the AI triage USE / REFERENCE ONLY / REJECT
    assert 'id="resSelAll"' in html and "function shownPickBoxes" in html and 'style.display!=="none"' in html
    assert "USE, REFERENCE ONLY" in html and "build only on the ones you USE" in html and 'id="prdLong"' in html
    # RS34: relevance check wired in, silent — off-topic repos are left out, no on-screen note; outcome kept in data-gate
    assert 'fetch("/api/relevance"' in html and "function relevanceGate" in html and 'setAttribute("data-gate"' in html
    for gone in ("Couldn\\u2019t check relevance", "AI hid", 'id="showOff"', "free AI checks are used up", "gate-note"):
        assert gone not in html, gone
    # RS35 trending: gallery tabs + home carousel; API-sorted, not scraped; no auto-rotate under reduced motion
    assert "function showTrending" in html and 'id="trendCar"' in html and 'id="trendBtn"' in html
    assert "&sort=" in html and "github.com/trending" not in html
    assert "body.view-trending .tcar, body.has-results .tcar{display:none}" in html  # no Rising list twice; results focus
    assert 'class="tbento"' in html and "tb-big" in html and "tb-sm" in html   # RS63: bento grid, no auto-turning ring
    # RS36 thinking orb pill: the search loading indicator (RS61: no longer under the home demo; the ASCII globe is there)
    assert "function startDotOrb" in html and "function think(" in html and 'id="homeThink"' not in html
    assert 'class="think-orb" aria-hidden="true"' in html and "draw(); if(reduce) return;" in html and "canvas.isConnected" in html
    assert 'think(st,"Checking which repos fit")' in html and "function startOrb" not in html
    # RS34: dropped repos sit at the end under a divider and show without a click (no hidden undo button)
    assert 'class="left-div"' in html and "Less likely to fit" in html and 'data-left="1"' in html
    assert 'id="showLeft"' not in html and "more we left out" not in html
    # RS24/RS28 result card: owner tile without image fetch, prominent add-to-plan toggle, topics from the API
    assert "function ownerHue" in html and 'class="pk-add"' in html and "ico(\"check\")+'In plan" in html and "avatars.githubusercontent" not in html
    # RS38: below-the-fold cards reveal on entering the viewport; restored markup never stays invisible
    assert "function queueReveal" in html and "IntersectionObserver" in html and 'c.classList.remove("rv-wait"); });' in html
    # RS39: the owner's public Web3Forms access key is configured (UUID shape), so Send really emails Cardzo
    assert re.search(r'var WEB3FORMS_KEY="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";', html)
    # RS41 traffic hardening on the page: GitHub budget read, shorter check payload, bot-check deadline, allowance memory, one search at a time
    for s in ('x-ratelimit-remaining', 'window.__ghLeft<=1', '.slice(0,100)', 'topics||[]).slice(0,5)', 'function tokenWithin', 'replore_ai_off_until',
              'if(window.__busy) return;   // RS41', 'window.__gateCtl.abort()'):
        assert s in html, s
    # RS36: demo steps use inline SVG art (theme colours), not emoji
    assert "var ART={" in html and "ico:ART.describe" in html and 'ico:"🔍"' not in html
    # RS24 richness: cursor tilt + star count-up are native (no extra library)
    assert "attachTilt" in html and 'class="cnt"' in html
    for t in ("portfolio website", "iPhone app", "trip planner", "practice app"):
        assert t in html


def test_security_headers_and_csp():
    """RS49: Pages serves CSP + HSTS + framing/permission headers; the CSP allows exactly what the page loads."""
    hdr = (ROOT / "web" / "_headers").read_text(encoding="utf-8")
    lines = [l.strip() for l in hdr.splitlines() if l.strip() and not l.lstrip().startswith("#")]
    assert lines[0] == "/*"
    h = dict(l.split(": ", 1) for l in lines[1:])
    assert h["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains" and h["X-Frame-Options"] == "DENY"
    assert h["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"
    csp = {d.split()[0]: d.split()[1:] for d in h["Content-Security-Policy"].split("; ")}
    assert "'unsafe-inline'" not in csp["script-src"] and "'unsafe-eval'" not in csp["script-src"]
    assert csp["frame-ancestors"] == ["'none'"] and csp["default-src"] == ["'self'"]
    app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    fetched = set(re.findall(r'fetch\("https://([a-z0-9.-]+)', app)) | {"api.github.com"}
    assert {"https://" + x for x in fetched} <= set(csp["connect-src"]), fetched
    scripts = set(re.findall(r'\.src="https://([a-z0-9.-]+)', app))
    assert scripts and {"https://" + x for x in scripts} <= set(csp["script-src"]), scripts
    assert "https://static.cloudflareinsights.com" in csp["script-src"] and "https://cloudflareinsights.com" in csp["connect-src"]
    assert "https://challenges.cloudflare.com" in csp["frame-src"]
    assert "web/_headers" in (ROOT / "README.md").read_text(encoding="utf-8")


def _contrast(a, b):
    def lum(h):
        c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def test_accessibility_baseline():
    """RS46: live regions, named dialogs, 24px close/copy targets, >= 4.5:1 verdict tags and footer notes."""
    index = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    assert '<div id="status" class="status" role="status" aria-live="polite">' in index
    assert '<div id="out" class="results">' in index   # not a live region: 60 cards would be read out whole
    assert '<p id="srStatus" class="sr-only" role="status" aria-live="polite">' in index and "function resultSummary" in app
    assert 'setAttribute("aria-labelledby",h2.id)' in app
    heads = re.findall(r'<div class="modal" id="[^"]+"><div class="sheet[^"]*">([\s\S]*?)</h2>', index)
    assert len(heads) == index.count('<div class="modal"') == 9 and not any('class="modal"' in h for h in heads)   # every dialog has its own heading
    assert re.search(r"\.x\{[^}]*min-width:32px;min-height:32px", index) and re.search(r"\.cmd \.copy\{[^}]*min-height:26px", index)
    for theme in (index.split(":root{", 1)[1], index.split(':root[data-theme="dark"]{', 1)[1]):
        var = lambda n: re.search(r"--" + n + r":(#[0-9a-f]{6})", theme).group(1)
        assert _contrast(var("good"), var("goodbg")) >= 4.5 and _contrast(var("warn"), var("warnbg")) >= 4.5
        assert _contrast(var("muted"), var("bg")) >= 4.5
    for rule in (".gh-credit{", ".privacy-note{"):
        assert "opacity" not in index.split(rule, 1)[1].split("}", 1)[0], rule


def test_one_official_deploy_and_cardzo_credit():
    """RS22/RS40: Cloudflare Pages is the only deploy (the GitHub Pages copy had no relevance Function); footer credits Cardzo."""
    assert not (ROOT / ".github" / "workflows" / "pages.yml").exists()
    html = _page()
    assert 'href="https://cardzo.co.in" target="_blank" rel="noopener noreferrer"' in html and "Cardzo</a> product" in html


def test_all_uncaps_and_groups_by_feature():
    """RS23: --all returns every match; groups hold each feature's repos, deduped to the first finder."""
    pages = [[repo("auth/a", 900), repo("shared/x", 500)], [repo("pay/a", 700), repo("shared/x", 500)]]
    res, _ = run(pages, queries=["user auth", "payments"], top=None, candidates=None)
    assert len(res["all"]) == 3  # shared/x counted once
    assert [g["query"] for g in res["groups"]] == ["user auth", "payments"]
    assert [r["full_name"] for r in res["groups"][0]["repos"]] == ["auth/a", "shared/x"]  # first finder keeps it
    assert [r["full_name"] for r in res["groups"][1]["repos"]] == ["pay/a"]


def test_grouped_markdown_sections_and_counts():
    """RS23."""
    pages = [[repo("a/1", 900)], [repo("b/1", 800), repo("b/2", 700)]]
    res, _ = run(pages, queries=["login", "billing"], top=None, candidates=None)
    md = scout.render_markdown_grouped(res)
    assert "### login  (1)" in md and "### billing  (2)" in md
    assert "3 open-source repos across 2 needs" in md and scout.FREE_NOTE in md


def test_cli_all_and_group(monkeypatch, capsys):
    """RS23."""
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("a/b", 500)]})
    assert scout.main(["--all", "--json", "x"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert "groups" in data and data["top"] == data["all"]
    _patch_fetch(monkeypatch, lambda q, token=None: {"items": [repo("a/b", 500)]})
    assert scout.main(["--markdown", "--group", "x"]) == 0
    assert "grouped by need" in capsys.readouterr().out


def test_workflow_all_group_options():
    """RS23."""
    wf = (ROOT / ".github" / "workflows" / "find.yml").read_text(encoding="utf-8")
    assert "ALL: ${{ inputs.all }}" in wf and "GROUP: ${{ inputs.group }}" in wf
    assert '["--all"] if os.environ["ALL"]' in wf and '["--group"] if os.environ["GROUP"]' in wf



def test_privacy_notice_matches_what_the_code_does():
    """RS33: the published privacy claims stay true — CI fails if a data flow is added without updating them."""
    html = _page()
    priv = (ROOT / "PRIVACY.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert 'id="privacyModal"' in html and "PRIVACY.md" in html and "privacy-note" in html
    assert "PRIVACY.md" in readme and "not legal advice" in priv and "Last updated" in priv
    # "no cookies / no analytics / no tracking" must stay literally true
    for banned in ("document.cookie", "sessionStorage", "indexedDB", "gtag(", "googletagmanager", "plausible",
                   "sendBeacon", "posthog", "umami", "analytics.js"):
        assert banned not in html, banned
    # only these hosts are contacted; PRIVACY.md names each of them
    hosts = set(re.findall(r"https://([a-z0-9.-]+)", html))
    allowed = {"api.github.com", "github.com", "claude.ai", "claude.com", "replore.pages.dev", "cardzo.co.in", "chatgpt.com", "gemini.google.com", "api.web3forms.com", "groq.com", "www.cloudflare.com", "challenges.cloudflare.com", "buy.stripe.com", "replore.cardzo.co.in", "gitdiagram.com", "gitingest.com", "deepwiki.com", "github1s.com", "github.dev",
               "scorecard.dev", "osv.dev"}  # RS53 trust links (navigations); RS34/RS34a provider terms, RS34c Turnstile, RS44 tips, RS51 Explore links
    assert hosts <= allowed, hosts - allowed
    for named in ("api.github.com", "Cloudflare", "claude.ai", "security.log", "200 characters", "off by default",
                  "Groq", "Cloudflare Workers AI", "Turnstile", "relevance check", "stores nothing", "Feedback", "chatgpt.com", "gemini.google.com", "Web3Forms", "Stripe",
                  "Cloudflare Web Analytics", "static.cloudflareinsights.com", "cookieless", "gitdiagram.com", "gitingest.com", "deepwiki.com", "github1s.com", "github.dev",
                  "OpenSSF Scorecard", "api.securityscorecards.dev", "deps.dev", "OSV.dev", "Safe to build on?"):  # RS34/RS53b data flows must be disclosed
        assert named in priv, named
    # RS33: the host's Cloudflare Web Analytics beacon is on, so no copy may promise "no analytics"; each place names it
    for doc, text in (("index.html", html), ("PRIVACY.md", priv), ("README.md", readme)):
        assert not re.search(r"no (visitor )?analytics", text, re.I), doc
        assert "Cloudflare Web Analytics" in text and "static.cloudflareinsights.com" in text, doc
    assert re.search(r"Last updated: \d{1,2} \w+ 20\d\d \([^)]*Cloudflare Web Analytics", priv)
    # the hook really writes only on a match, at most 200 chars, locally
    hook = (ROOT / "hooks" / "security_log.py").read_text(encoding="utf-8")
    assert "if not hits:" in hook and "text[:200]" in hook and "urllib" not in hook
    assert "if _log_path() is None:" in hook  # opt-in: off unless REPLORE_SECURITY_LOG is set (RS25)


def test_empty_description_is_said_plainly():
    """RS45: a repo with no GitHub description says so in text and markdown; JSON/CSV keep the empty value."""
    res, _ = run([[repo("openai/math", 15000, description=None), repo("a/b", 10)]])
    txt, md, csv_out = scout.render(res), scout.render_markdown(res), scout.render_csv(res)
    assert "No description on GitHub" in txt and "No description on GitHub" in md
    assert "No description on GitHub" not in csv_out
    assert next(r for r in res["candidates"] if r["full_name"] == "openai/math")["description"] == ""
    html = _page()
    assert 'var NO_DESC="No description on GitHub";' in html and scout.NO_DESC == "No description on GitHub"
    assert 'esc(r.desc||"—")' not in html
def test_about_text_matches_what_the_page_does():
    """RS34, RS16a, RS43: About must not say poor fits are hidden (they move to 'Less likely to fit')."""
    html = _page()
    about = html[html.index('id="aboutModal"'):html.index("</div></div>", html.index('id="aboutModal"'))]
    assert "hides repos" not in about and "Less likely to fit" in about and "Less likely to fit" in html.split('id="aboutModal"')[1]
    assert "specific needs first" in about and "within an hour" in about and "not legal advice" in about


def test_rs47_look_and_motion_kit():
    """RS47: owner palette + self-hosted type, masked hero lines, magnets, odometer, trending ring + ticker."""
    html = _page()
    fcss = (ROOT / "web" / "fonts.css").read_text(encoding="utf-8")
    for fam in ("'Anton'", "'Inter Tight'", "'JetBrains Mono'"):
        assert fam in fcss, fam
    assert "--accent:#3f6f8e" in html and "--btn-grad:" in html and "192,83,44" not in html
    assert 'class="ln" aria-hidden="true"' in html and 'aria-label="Describe it. Get repos that fit."' in html and "var segs=" not in html
    assert "data-magnet" in html and 'G.quickTo(el,"x"' in html and "(hover:hover) and (pointer:fine)" in html
    assert "function odometer(" in html and "function snapHtml(" in html and "html:out.innerHTML" not in html
    assert 'class="tring"' not in html and 'class="ttape"' not in html and "TAPE_ICON" not in html and "✦</b>" not in html   # RS62
    assert 'role="listitem"' in html and "rows.slice(1).map" in html   # RS63: every tile is a plain focusable link



def test_release_hygiene():
    """RS50: one version, SHA-pinned actions, exact dev pins, no root CLAUDE.md in the plugin."""
    sys.path.insert(0, str(ROOT / "scripts"))
    import mcp_server
    plugin = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
    assert plugin["version"] == mcp_server.SERVER_INFO["version"] == "0.4.0"
    for wf in (ROOT / ".github" / "workflows").glob("*.yml"):
        for use in re.findall(r"uses:\s*(\S+)", wf.read_text(encoding="utf-8")):
            assert re.fullmatch(r"[\w.-]+/[\w.-]+@[0-9a-f]{40}", use), (wf.name, use)
    reqs = [l for l in (ROOT / "requirements-dev.txt").read_text(encoding="utf-8").splitlines() if l and not l.startswith("#")]
    assert reqs and all(re.fullmatch(r"[A-Za-z0-9_.-]+==[0-9][0-9A-Za-z.]*", l) for l in reqs), reqs
    assert not (ROOT / "CLAUDE.md").exists() and (ROOT / ".claude" / "CLAUDE.md").exists()
    # the `protect main` ruleset requires a check named `ci`: a job of that name that waits for every test job,
    # always runs (skipped would count as passing) and fails unless they all succeeded
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8").replace("\r\n", "\n")
    job = re.search(r"^  ci:\n((?:    .*\n|\s*\n)+)", ci + "\n", re.M)
    assert job, "ci.yml needs a job named ci (the required status check)"
    body = job.group(1)
    assert "needs: test" in body and "if: always()" in body and 'needs.test.result }}" = "success"' in body, body


def test_script_urls_carry_the_current_file_hash():
    """RS52: index.html loads app.js / theme.js as <name>?v=<hash of the file>, so a deploy is never hidden behind a
    browser's cached copy (the custom domain lets browsers keep scripts for 4 hours). Fix: python ops/stamp_assets.py"""
    sys.path.insert(0, str(ROOT / "ops"))
    import stamp_assets
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    for name in stamp_assets.ASSETS:
        want = 'src="%s?v=%s"' % (name, stamp_assets.asset_hash(name))
        assert want in html, "run: python ops/stamp_assets.py (" + want + ")"


def test_web_page_has_no_emoji_or_glyph_icons():
    """RS55: no colour emoji or symbol characters standing in for icons anywhere the page renders."""
    banned = re.compile("[\U0001F000-\U0001FAFF☀-➿✦★⑂✕✓✗☑☐"
                        "☰⚙↗⧉＋☼☾▸]")
    for name in ("index.html", "app.js", "theme.js"):
        text = (ROOT / "web" / name).read_text(encoding="utf-8")
        hits = sorted({m.group() for m in banned.finditer(text)})
        assert not hits, (name, hits)
    js = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    assert "var ICONS=" in js and "function ico(" in js
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert '<link rel="icon" href="favicon.svg"' in html and (ROOT / "web" / "favicon.svg").exists()


def test_spec_rule_ids_are_unique():
    """Every SPEC rule ID names one rule (2026-10-22: parallel sessions shipped two RS52s, two RS53s, then two RS54s).
    Before committing a new rule, take max + 1 from the latest main."""
    spec = (ROOT / "SPEC.md").read_text(encoding="utf-8")
    ids = re.findall(r"^\s*- \*\*(R[SX]\d+[a-z]?)\b", spec, re.M)
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    assert len(ids) > 50 and not dupes, f"duplicate SPEC rule IDs: {dupes}"


def _jpeg_size(data):
    """(width, height) from a baseline or progressive JPEG's SOF marker, standard library only."""
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker, seg = data[i + 1], int.from_bytes(data[i + 2:i + 4], "big")
        if marker in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(data[i + 7:i + 9], "big"), int.from_bytes(data[i + 5:i + 7], "big")
        i += 2 + seg
    return None


def test_link_preview_tags_and_image():
    """RS57: Open Graph / Twitter tags point at a 1200x630 JPEG small enough for WhatsApp; README shows the banner."""
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    for tag in ('property="og:title"', 'property="og:description"', 'property="og:url"', 'name="twitter:card" content="summary_large_image"',
                'property="og:image" content="https://replore.cardzo.co.in/og.jpg"', 'name="twitter:image" content="https://replore.cardzo.co.in/og.jpg"'):
        assert tag in html, tag
    og = (ROOT / "web" / "og.jpg").read_bytes()
    assert og[:2] == b"\xff\xd8" and len(og) < 250_000 and _jpeg_size(og) == (1200, 630)
    assert (ROOT / "docs" / "banner.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    assert "](docs/banner.png)" in (ROOT / "README.md").read_text(encoding="utf-8")
    assert (ROOT / "ops" / "share" / "card.html").exists()


def test_harm_filter_shared_cases():
    """RS18, RS29b: piracy/attack tools are dropped; ordinary repos that merely say 'crack', 'ddos' or 'keygen' are kept.
    The same file is checked against web/app.js in tests/test_web_logic.js."""
    fx = json.loads((ROOT / "tests" / "fixtures" / "harm_cases.json").read_text(encoding="utf-8"))
    assert [d for d in fx["harmful"] if not scout.harmful_repo(d)] == []
    assert [d for d in fx["fine"] if scout.harmful_repo(d)] == []
    js = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    for p in scout.HARM[2:]:   # the first two are built from the service list; the rest must be character-identical
        assert "/" + p.pattern + "/i" in js, p.pattern


def test_home_demo_is_the_real_product_and_honest():
    """RS61: the home demo shows real Replore results for real quick-pick searches, labelled as examples, with no
    network call, no star counts, and the ASCII globe on desktop only."""
    js = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    start = js.index("var LIVE_DEMO=")
    block = js[start:js.index("// remember the last results", start)]
    assert "buildLiveDemo(hd)" in js and "Example: Replore" in block and "fetch(" not in block
    assert block.count('{q:"') == 3 and "☆" not in block and "kstars(" not in block
    for lic in re.findall(r'\["[^"]+","([^"]+)","', block):
        assert lic in ("MIT", "Apache-2.0"), lic
    assert "max-width: 999px" in block and "prefers-reduced-motion" in block and "isConnected" in block
