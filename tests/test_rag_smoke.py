"""SPEC RS42b: ops/rag_smoke.py — fake network only; checks the cost gate and how replies are judged."""
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ops"))
import rag_smoke as rs  # noqa: E402


class _Resp(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _opener(cfg, reply, calls):
    def op(req, timeout=0):
        calls.append(req.get_method())
        if req.get_method() == "GET":
            return _Resp(json.dumps(cfg).encode())
        body = json.loads(req.data)
        return _Resp(json.dumps(reply(body)).encode())
    return op


def test_no_posts_without_approval(capsys):
    calls = []
    rc = rs.main(["https://x.replore.pages.dev"], opener=_opener({"rag": {"rerank": True, "index": False}}, None, calls))
    assert rc == 1 and calls == ["GET"] and "--yes" in capsys.readouterr().out


def test_rag_off_fails_closed(capsys):
    calls = []
    assert rs.main(["https://x.replore.pages.dev", "--yes"], opener=_opener({"rag": {"rerank": False, "index": False}}, None, calls)) == 1
    assert calls == ["GET"] and "not switched on" in capsys.readouterr().out


def test_pass_when_meaning_scores_come_back():
    calls = []
    rc = rs.main(["https://x.replore.pages.dev", "--yes"],
                 opener=_opener({"rag": {"rerank": True}}, lambda b: {"sim": [0.8, 0.1]}, calls))
    assert rc == 0 and calls.count("POST") == len(rs.CASES)


def test_fail_on_missing_or_wrong_scores():
    flags, repos = {"rerank": True, "index": True}, rs.CASES[0][1]
    assert rs.check_reply(flags, repos, 200, {"sim": [0.8, 0.1], "neighbors": [{"name": "a/b", "score": 0.7}]}) == []
    assert rs.check_reply(flags, repos, 200, {"neighbors": []}) == ["meaning scores missing or wrong length"]
    assert rs.check_reply(flags, repos, 200, {"sim": [0.1, 0.8], "neighbors": []})[0].startswith("fitting repo")
    assert rs.check_reply(flags, repos, 200, {"sim": [0.8, 0.1], "neighbors": [{"name": "bad name"}]}) == ["indexed repos missing or malformed"]
    assert rs.check_reply(flags, repos, 404, {"error": "semantic_off"}) == ["HTTP 404 semantic_off"]


def test_base_must_be_a_plain_https_origin():
    assert rs.main(["http://x.dev", "--yes"], opener=lambda *a, **k: 1 / 0) == 1
    assert rs.main(["https://x.dev/path", "--yes"], opener=lambda *a, **k: 1 / 0) == 1


def test_key_goes_only_to_replore_hosts(monkeypatch):
    """RS34g: the eval/plugin key is never sent to a host that isn't Replore's, and redirects aren't followed."""
    monkeypatch.setenv("REPLORE_EVAL_KEY", "k" * 20)
    for good in ("https://replore.cardzo.co.in", "https://replore.pages.dev", "https://abc123.replore.pages.dev"):
        assert rs.key_host_ok(good + "/api/relevance"), good
    for bad in ("https://evil.pages.dev", "https://evil.example", "https://replore.pages.dev.evil.example",
                "https://a.b.replore.pages.dev", "http://replore.pages.dev", "https://replore.pages.dev:8443",
                "https://xreplore.pages.dev"):
        assert not rs.key_host_ok(bad + "/api/relevance"), bad
    seen = []

    def op(req, timeout=0):
        seen.append(req.get_header("X-replore-eval-key"))
        return _Resp(json.dumps({"sim": [0.8, 0.1]}).encode())
    rs._call("https://evil.example/api/relevance", {"mode": "semantic"}, opener=op)
    rs._call("https://x.replore.pages.dev/api/relevance", {"mode": "semantic"}, opener=op)
    assert seen == [None, "k" * 20]
    assert any(isinstance(h, rs._NoRedirect) for h in rs._OPEN.__self__.handlers)


def test_live_eval_workflow_only_targets_replore_hosts():
    """RS34g: the workflow's endpoint check is an anchored regex, not a glob that matches any host."""
    wf = (Path(__file__).resolve().parents[1] / ".github" / "workflows" / "relevance-eval.yml").read_text(encoding="utf-8")
    assert "https://*.pages.dev" not in wf and "replore\.pages\.dev)/api/relevance$" in wf
    live = (Path(__file__).resolve().parents[1] / "evals" / "relevance_live.mjs").read_text(encoding="utf-8")
    assert 'redirect: "error"' in live and "KEY_HOST" in live
