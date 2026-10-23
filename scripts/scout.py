#!/usr/bin/env python3
"""Find the most-starred open-source GitHub repos matching search queries (SPEC RS1-RS23).

Usage: scout.py "query one" ["query two" ...] [--top 20] [--candidates 40]
                [--license open|any] [--max-age-months 24]
                [--min-stars 50] [--rank fit|balanced|stars]
                [--prefer-starters] [--all] [--group] [--trust] [--json | --markdown | --csv]
"""
import argparse
import csv
import datetime as dt
import http.client
import io
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hybrid  # noqa: E402  RS42
import trust  # noqa: E402  RS56

API = "https://api.github.com/search/repositories"
MAX_QUERIES = 4  # RS8: unauthenticated search limit is 10 requests a minute
MAX_TEXT = 200  # RS9
MAX_QUERY_CHARS = 200  # RS19: GitHub rejects long queries (HTTP 422)
PER_PAGE = 50  # RS4b: results asked per search (filters are in the query, so most of them pass)
REL_SPAN = 20  # RS5: best-match relevance falls from 1 to 0 over the first 20 positions (the goal evals are tuned to this)

# RS3: OSI-approved licenses GitHub commonly detects.
OPEN_LICENSES = {
    "0BSD", "AFL-3.0", "AGPL-3.0", "Apache-2.0", "Artistic-2.0", "BSD-2-Clause", "BSD-3-Clause",
    "BSD-3-Clause-Clear", "BSL-1.0", "CC0-1.0", "ECL-2.0", "EPL-1.0", "EPL-2.0", "EUPL-1.1",
    "EUPL-1.2", "GPL-2.0", "GPL-3.0", "ISC", "LGPL-2.1", "LGPL-3.0", "MIT", "MIT-0", "MPL-2.0",
    "MS-PL", "MS-RL", "NCSA", "OFL-1.1", "OSL-3.0", "PostgreSQL", "Unlicense", "UPL-1.0", "Zlib",
}

# RS14: plain-English license meaning, decided only from the SPDX id.
PERMISSIVE = {"0BSD", "AFL-3.0", "Apache-2.0", "Artistic-2.0", "BSD-2-Clause", "BSD-3-Clause", "BSD-3-Clause-Clear",
              "BSL-1.0", "CC0-1.0", "ECL-2.0", "ISC", "MIT", "MIT-0", "MS-PL", "NCSA", "OFL-1.1", "PostgreSQL",
              "Unlicense", "UPL-1.0", "Zlib"}
WEAK_COPYLEFT = {"EPL-1.0", "EPL-2.0", "LGPL-2.1", "LGPL-3.0", "MPL-2.0", "MS-RL"}
STRONG_COPYLEFT = {"EUPL-1.1", "EUPL-1.2", "GPL-2.0", "GPL-3.0"}
NETWORK_COPYLEFT = {"AGPL-3.0", "OSL-3.0"}
USE_PAID_OK = "OK to use in a paid product"
USE_WEAK = "OK in a paid product, but changes to its own files must stay open"
USE_SHARE = "You must share your app's code if you give the app to others"
USE_NETWORK = "You must share your code, even for a website or online service"
USE_NONE = "No license: you may not reuse this code"
# RS20: "is it completely free?", from the license only.
FREE_YES = "Yes"
FREE_WEAK = "Yes, but changes to its files must stay open"
FREE_SHARE = "Free to use, but you must share your code"
FREE_NO = "No: no license"
FREE_NOTE = ("'Completely free' checks the license only: some projects also sell a paid hosted version or "
             "paid add-ons, which this does not check.")
CSV_FIELDS = ["rank", "repo", "why_relevant", "url", "stars", "license", "can_use_in_paid_product", "completely_free",
              "starter", "how_to_start", "last_push", "query", "description"]
STARTER_MIN_SHARE = 0.10  # RS15: a starter jumps ahead only with >= 10% of its query's top stars
STARTER_TOPICS = {"template", "starter", "starter-kit", "starter-template", "boilerplate"}  # RS15
HINT_TEMPLATE = "On GitHub, click 'Use this template'"
HINT_README = "Follow the Getting started / Installation section of its README"
KEY = ("Key: stars = how many people bookmarked it (popularity, not quality, and stars can be bought); "
       "last push = last time anyone updated it; license labels are a plain summary, not legal advice.")

# RS18 + RS29b: repo descriptions that offer account takeover, spyware, stealers, cracks, DDoS, cheats or "free premium"
# generators are always dropped and counted as `harmful`. Same patterns, in the same order, as HARM in web/app.js
# (tests/fixtures/parity_items.json checks both engines drop the same repos).
_SVC = r"(whats ?app|instagram|facebook|snapchat|telegram|gmail|tiktok|email|wifi|someone'?s? account)"
HARM = [re.compile(p, re.I) for p in (
    r"hack(ing|er)?\s+(of\s+|a\s+|an\s+|the\s+)?" + _SVC, _SVC + r"\s+(account\s+)?(hack|hacking|hacker|cracker)",
    r"account takeover", r"stalkerware|spyware", r"credential stealer|password stealer|stealer\b", # RS18: crack / keygen / ddos only in a piracy or attack context; the bare words dropped ordinary repos
    r"\bkeygens?\b.{0,40}\b(crack|serial|patch|activat)|\b(crack|serial|patch|activat)\w*\b.{0,40}\bkeygens?\b",
    r"\bcrack(ed|s)?\s+(for\s+|of\s+)?(paid\s+|premium\s+)?(software|windows|office|adobe|photoshop|games?|apps?|licen[cs]es?)\b|\bcracked\s+(version|apk|software|games?|apps?)\b|\b(software|licen[cs]e|activation|serial|game)\s+crack(s|ing|er)?\b|\bwarez\b",
    r"\bddos\s+(attack\s+)?(tool|script|bot|botnet|panel|flooder)s?\b|\b(ip\s+)?(stresser|booter)s?\b|\bddos(ing)?\s+(any\s+|a\s+|the\s+)?(website|server|ip|target)s?\b", r"game (cheat|hack)|aimbot|wallhack", r"free (premium|robux|v-?bucks|coins) generator")]


def harmful_repo(desc):
    """RS18: True when a (cleaned) repo description matches one of the harmful-tool patterns."""
    return any(p.search(desc or "") for p in HARM)


_NAME = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
_CTRL = re.compile(r"[\x00-\x1f\x7f-\x9f​-‏  ‪-‮⁦-⁩]")  # RS9: incl. line/para separators


class ScoutError(Exception):
    """RS7: any failure that must end the run."""


def utf8_stdio(*streams):
    """RS48: a Windows console defaults to cp1252, so an emoji in a repo description crashed the print.
    Switch the standard streams to UTF-8 (unprintable characters become '?', never an exception)."""
    for s in streams or (sys.stdout, sys.stderr):
        if hasattr(s, "reconfigure"):
            try:
                s.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass  # a stream that can't be switched keeps working as before


def _u16(text):
    return len(text.encode("utf-16-le")) // 2


def _u16cut(text, n):
    return text.encode("utf-16-le")[: 2 * n].decode("utf-16-le", errors="ignore")


def clean(text):
    """RS9: strip control/bidi characters and cap length. RS28f/RS42: long text ends at a word with an ellipsis,
    measured in UTF-16 units: exactly the web page's clean(), so both clients score the same text."""
    text = _CTRL.sub(" ", text or "").strip()
    if _u16(text) <= MAX_TEXT:
        return text
    cut = _u16cut(text, MAX_TEXT - 1)
    sp = cut.rfind(" ")
    if sp >= 0 and _u16(cut[:sp]) > 140:
        cut = cut[:sp]
    return re.sub("[\\s,.;:\\-\u2013\u2014]+$", "", cut) + "\u2026"


GH_MAX_QUERY = 256  # GitHub's limit for the whole q string (qualifiers included)


def _typed(q, key):
    """True when the user already wrote this qualifier (also negated, e.g. -stars:), so we never add a second one."""
    return re.search(r"(?:^|\s)-?" + key + ":", q, re.I) is not None


def build_query(q, max_age_months=0, min_stars=0, now=None):
    """RS2, RS4, RS4b: exclude forks and archived repos, and push the staleness and star filters into the search so
    GitHub's 1,000-result window and our page of results are spent on repos that can pass. Same rule as the page's
    ghQuery() (RS29b; shared cases in tests/fixtures/qualifier_cases.json). A qualifier the user typed is left alone;
    one that would push the query past GitHub's 256 characters is dropped (the client-side filters still apply).
    No AND/OR/NOT is ever added, so GitHub's limit of 5 operators is untouched."""
    out = q.strip().strip("﻿").strip()   # RS29b: like JS trim(), which also removes a byte-order mark
    quals = [x for k, x in (("fork", "fork:false"), ("archived", "archived:false"), ("is", "is:public")) if not _typed(out, k)]
    if max_age_months > 0 and not _typed(out, "pushed"):
        now = now or dt.datetime.now(dt.timezone.utc)
        quals.append("pushed:>=" + (now - dt.timedelta(days=30.44 * max_age_months)).date().isoformat())
    if min_stars > 0 and not _typed(out, "stars"):
        quals.append(f"stars:>={min_stars}")
    for x in quals:
        if _u16(out) + 1 + len(x) <= GH_MAX_QUERY:   # RS29b: UTF-16 units, as the page's .length counts
            out += " " + x
    return out


def fetch(query, token=None, timeout=20):
    """RS2, RS7, RS8: one search request; raises ScoutError on any failure."""
    # RS2: best-match (relevance) order seeds fit ranking (RS5); stars stay in each result and still weigh in RS5
    params = urllib.parse.urlencode({"q": query, "per_page": PER_PAGE})   # RS4b: one page, filters already in q
    req = urllib.request.Request(f"{API}?{params}", headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "replore",
    })
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code in (403, 429) and e.headers.get("X-RateLimit-Remaining") == "0":
            raise ScoutError("GitHub rate limit reached. Wait a minute, or set GITHUB_TOKEN, then retry.") from None
        if e.code == 422:
            raise ScoutError("GitHub rejected it (HTTP 422). Use 1-3 keywords per search.") from None
        raise ScoutError(f"GitHub search failed: HTTP {e.code}.") from None
    except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as e:
        raise ScoutError(f"Could not reach GitHub: {getattr(e, 'reason', e)}.") from None
    except json.JSONDecodeError:
        raise ScoutError("GitHub returned a response that is not JSON.") from None


def license_use(spdx):
    """RS14."""
    if spdx in PERMISSIVE:
        return USE_PAID_OK
    if spdx in WEAK_COPYLEFT:
        return USE_WEAK
    if spdx in STRONG_COPYLEFT:
        return USE_SHARE
    if spdx in NETWORK_COPYLEFT:
        return USE_NETWORK
    return USE_NONE


def free_text(spdx):
    """RS20."""
    use = license_use(spdx)
    return {USE_PAID_OK: FREE_YES, USE_WEAK: FREE_WEAK, USE_SHARE: FREE_SHARE,
            USE_NETWORK: FREE_SHARE}.get(use, FREE_NO)


_WORD = re.compile(r"[a-z0-9]+")


def _freedom(use):
    """RS5: permissive > weak copyleft > GPL/AGPL > no licence (the last only reachable with --license any)."""
    return (1.0 if use == USE_PAID_OK else 0.7 if use == USE_WEAK
            else 0.45 if use in (USE_SHARE, USE_NETWORK) else 0.1)


def fit_score(r, prefer_starters=False, floor=0.0):
    """RS5: relevant (0.45) + popular (0.35) + free to use (0.20), with the RS15 starter nudge."""
    rel = 1 - min(1, (r.get("rel", 0) or 0) / REL_SPAN)             # best-match position (RS2); top match = 1
    star = min(1, math.log10((r["stars"] or 0) + 1) / 5)        # log-scaled popularity (~100k stars = 1)
    free = _freedom(r["license_use"])
    bonus = 0.08 if (prefer_starters and r["starter"] and r["stars"] >= floor) else 0.0
    return 0.45 * rel + 0.35 * star + 0.20 * free + bonus


_PAGE_SPLIT = re.compile(r"[^a-z0-9 +#.]")   # RS29b: the page's tokenizer (sigTokens / whyRelevant), character for character


def _page_words(text):
    return _PAGE_SPLIT.sub(" ", (text or "").lower()).split()


def why_relevant(query, name, desc, rel):
    """RS24: one honest line on why a repo is here — a whole-word keyword match, not an AI judgement.
    RS29b: the matched words are exactly the page's (same tokenizer, same filler words as hybrid.STOP / the page's STOP);
    only the wording differs (the page says "Matches: a, b" and shows no line without a match, RS37)."""
    # drop search qualifiers (topic:/language:/is:…) and negated terms (-foo) so we never claim a match on them
    plain = " ".join(t for t in (query or "").split() if ":" not in t and not t.startswith("-"))
    toks = [w for w in _page_words(plain) if len(w) > 1 and w not in hybrid.STOP]
    words = set(_page_words(name + " " + desc))  # match whole words, so "ai" ≠ "email"
    hits = []
    for t in toks:
        if t in words and t not in hits:
            hits.append(t)
        if len(hits) >= 3:
            break
    if hits:
        return "Matches your search: " + ", ".join(f'"{h}"' for h in hits)
    return "Top match for your search" if (rel is not None and rel <= 3) else "Related to your search"


MAX_BROADER = 2   # RS78a: at most two extra searches, so a run stays at 6 of GitHub's 10 searches a minute
NO_MATCH = "No repository matched after filtering."


def kw_words(text):
    """RS78a: the page's kwWords(): lower case, the page's tokenizer, filler words (hybrid.STOP) dropped."""
    return [w for w in _page_words(text) if w not in hybrid.STOP]


def relaxed_queries(text, tried=()):
    """RS78a: the page's relaxedQueries(), word for word (shared cases in tests/fixtures/relaxed_cases.json). When every
    search came back empty (GitHub ANDs every word), search broader: first without version-like words ("opus5.5",
    "gpt-4o", "v2": model names and versions rarely appear in repo text), then with the two strongest words."""
    w = kw_words(text)
    plain = [x for x in w if not re.search(r"\d", x)]
    out = []

    def add(q):
        q = q.strip()
        if q and q not in tried and q not in out:
            out.append(q)
    if plain and len(plain) < len(w):
        add(" ".join(plain[:3]))
    if len(plain) >= 2:
        add(" ".join(plain[:2]))
    return out[:MAX_BROADER]


def _quoted(qs):
    return " and ".join(f'"{q}"' for q in qs)


def _split_quals(q):
    """Words vs qualifiers (topic:x, language:y, -topic:z, -word) of one query."""
    toks = q.split()
    return [t for t in toks if ":" not in t and not t.startswith("-")], [t for t in toks if ":" in t or t.startswith("-")]


def broader_queries(queries, description=None):
    """RS78a: the plugin's broader searches. The words come from the description when given (as on the page), else from
    the queries; a qualifier every query carried (e.g. language:python, -topic:macos) is kept on each broader search."""
    parts = [_split_quals(q) for q in queries]
    text = description if (description and description.strip()) else " ".join(" ".join(w) for w, _ in parts)
    common = [t for t in parts[0][1] if all(t in qs for _, qs in parts[1:])] if parts else []
    tried = [q for q in queries] + [" ".join(w) for w, _ in parts]
    return [(q + " " + " ".join(common)).strip() for q in relaxed_queries(text, tried)]


def _tail(r):
    """RS5c: 1 when a repo was found only past GitHub's first REL_SPAN best matches (it would compete on stars alone)."""
    return 1 if (r.get("rel") or 0) >= REL_SPAN else 0


def _order(rows, prefer_starters):
    """RS5, RS15: one query's own order, by fit (tail matches after the head, RS5c)."""
    floor = max((r["stars"] for r in rows), default=0) * STARTER_MIN_SHARE
    return sorted(rows, key=lambda r: (_tail(r), -fit_score(r, prefer_starters, floor), -r["stars"], -r["_pushed"], r["full_name"]))


def rank(by_query, mode="fit", prefer_starters=False):
    """RS5: fit score across all matches (default), round-robin by stars (balanced), or plain stars."""
    allr = [r for rows in by_query for r in rows]
    if mode == "fit":
        # RS15: the starter floor is per-query ("that query's most-starred match"), not global
        scored = []
        for rows in by_query:
            floor = max((r["stars"] for r in rows), default=0) * STARTER_MIN_SHARE
            scored += [(fit_score(r, prefer_starters, floor), r) for r in rows]
        scored.sort(key=lambda t: (_tail(t[1]), -t[0], -t[1]["stars"], -t[1]["_pushed"], t[1]["full_name"]))   # RS5c
        return [r for _, r in scored]
    if mode == "stars":
        return sorted(allr, key=lambda r: (-r["stars"], -r["_pushed"], r["full_name"]))
    # balanced: round-robin by stars so one broad query cannot swamp the list (RS5)
    def _stars_order(rows):
        floor = max((r["stars"] for r in rows), default=0) * STARTER_MIN_SHARE
        return sorted(rows, key=lambda r: (not (prefer_starters and r["starter"] and r["stars"] >= floor),
                                           -r["stars"], -r["_pushed"], r["full_name"]))
    lists = [_stars_order(rows) for rows in by_query]
    out = []
    for i in range(max((len(x) for x in lists), default=0)):
        rnd = [x[i] for x in lists if i < len(x)]
        out += sorted(rnd, key=lambda r: (-r["stars"], -r["_pushed"], r["full_name"]))
    return out


def _pushed(item):
    try:
        return dt.datetime.fromisoformat(item["pushed_at"].replace("Z", "+00:00"))
    except (KeyError, AttributeError, ValueError):
        return None


def scout(queries, fetcher=fetch, top=20, candidates=40, license_mode="open", max_age_months=24,
          now=None, token=None, rank_mode="fit", prefer_starters=False, min_stars=0,
          description=None, semantic_on=False, semantic_fn=None, broaden=True):
    """RS2-RS5: search, merge, filter, rank. Returns a result dict; raises ScoutError (RS7).
    RS78a: when every search comes back empty after filtering, up to two broader searches run (see relaxed_queries)
    and the result's `note` says so; `broadened` lists them.
    RS42: rank_mode "hybrid" re-orders by fit + BM25 against `description`; semantic_on (opt-in) adds meaning
    scores and live-confirmed indexed repos from Replore's endpoint."""
    queries = [q.strip() for q in queries if q and q.strip()]
    if not queries:
        raise ScoutError("No search query given.")
    if len(queries) > MAX_QUERIES:
        raise ScoutError(f"At most {MAX_QUERIES} queries per run (GitHub rate limit); got {len(queries)}.")
    for q in queries:  # RS19
        if len(q) > MAX_QUERY_CHARS:
            raise ScoutError(f"A search is too long ({len(q)} characters, max {MAX_QUERY_CHARS}). "
                             "Use 1-3 keywords per search, e.g. 'calorie counter'.")
    if not 0 <= max_age_months <= 600 or not 0 <= min_stars <= 10**8:  # RS7: out-of-range input fails closed, not a crash
        raise ScoutError("max-age-months must be 0-600 and min-stars 0-100000000.")
    now = now or dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=30.44 * max_age_months) if max_age_months > 0 else None

    excluded = {"fork_or_archived": 0, "license": 0, "stale": 0, "low_stars": 0, "harmful": 0, "duplicate": 0}
    seen, by_query = {}, []  # name -> its kept row (or None if the name was seen but filtered out)
    def take(q, items, kept, rel_floor=0, ex=None, why=None):
        ex = excluded if ex is None else ex  # RS42: confirm searches don't add to the user-facing exclusion counts
        for idx, it in enumerate(items):
            idx += rel_floor
            if not isinstance(it, dict):
                continue
            name = it.get("full_name")
            if not name:
                continue
            if name in seen:
                prev = seen[name]  # RS5: a repo is counted once, under its best (lowest) relevance position
                if prev is not None and idx < prev["rel"]:
                    prev["rel"] = idx
                    prev["why"] = why_relevant(prev["query"], prev["full_name"], prev["description"], idx)
                ex["duplicate"] += 1
                continue
            seen[name] = None  # mark seen; set to the row below once it survives the filters
            if it.get("fork") or it.get("archived") or it.get("disabled"):
                ex["fork_or_archived"] += 1
                continue
            spdx = (it.get("license") or {}).get("spdx_id")
            is_open = spdx in OPEN_LICENSES
            if license_mode == "open" and not is_open:
                ex["license"] += 1
                continue
            pushed = _pushed(it)
            if cutoff and (pushed is None or pushed < cutoff):
                ex["stale"] += 1
                continue
            if int(it.get("stargazers_count") or 0) < min_stars:  # RS4a
                ex["low_stars"] += 1
                continue
            if harmful_repo(clean(it.get("description"))):  # RS18, RS29b: same drop as the page, after the same filters
                ex["harmful"] += 1
                continue
            if is_open:
                label = spdx
            elif not spdx or spdx == "NOASSERTION":
                label = "none (no license: all rights reserved by default)"
            else:
                label = f"{spdx} (not an open-source license)"
            topics = {str(t).lower() for t in (it.get("topics") or [])}
            is_template = bool(it.get("is_template"))
            cname, cdesc = clean(name), clean(it.get("description"))
            row = {
                "full_name": cname,
                "stars": int(it.get("stargazers_count") or 0),
                "license": label,
                "open_license": is_open,
                "license_use": license_use(spdx),
                "free": free_text(spdx),
                "starter": is_template or bool(topics & STARTER_TOPICS),
                "start_hint": HINT_TEMPLATE if is_template else HINT_README,
                "pushed": pushed.date().isoformat() if pushed else "unknown",
                "_pushed": pushed.timestamp() if pushed else 0.0,
                "url": clean(it.get("html_url") or f"https://github.com/{name}"),
                "query": q,
                "description": cdesc,
                "rel": idx,  # RS2: best-match position, drives relevance in fit ranking (RS5)
                "why": why or why_relevant(q, cname, cdesc, idx),  # RS24
                "topics": [str(t).lower() for t in (it.get("topics") or [])][:8],  # RS42: same rule as the page
                "language": it.get("language") if isinstance(it.get("language"), str) else "",  # RS56: picks the package ecosystem
            }
            kept.append(row)
            seen[name] = row

    def run(q):
        kept = []
        by_query.append(kept)
        try:
            data = fetcher(build_query(q, max_age_months, min_stars, now), token)
        except ScoutError as e:  # RS19: name the user's search, never the added qualifiers
            raise ScoutError(f"Search {q!r}: {e}") from None
        items = data.get("items") if isinstance(data, dict) else None  # RS7: malformed response fails closed
        if not isinstance(items, list):
            raise ScoutError(f"Unexpected GitHub response for {q!r}.")
        take(q, items, kept)

    for q in queries:
        run(q)
    broadened, note = [], None
    if broaden and not any(by_query):   # RS78a: nothing matched every word; a broader search fails closed like any other
        broadened = broader_queries(queries, description)
        for q in broadened:
            run(q)
        queries = queries + broadened
        if broadened and any(by_query):
            note = "Nothing matched every word, so the search was broadened to " + _quoted(broadened) + "."

    fit_mode = "fit" if rank_mode == "hybrid" else rank_mode
    kept = rank(by_query, fit_mode, prefer_starters)  # RS5, RS15
    # RS42 hybrid: the same rule as the page. The first 30 rows (what the page sends) get meaning scores; indexed repos
    # are confirmed by ONE live GitHub search, appended in score order, then fit + BM25 (+ meaning) are fused by RRF.
    semantic_status, sims, extra, head, tail, fused = None, None, [], kept[:30], kept[30:], rank_mode == "hybrid"
    if semantic_on:
        res = (semantic_fn or hybrid.semantic)(description or " ".join(queries), head)
        semantic_status = "ok" if res else "unavailable"
        if res:
            if res["sim"] is not None and len(res["sim"]) == len(head):
                sims = list(res["sim"])
            fused = fused or sims is not None or res["neighbors"] is not None   # same trigger as the page
            nb = [x for x in (res["neighbors"] or []) if x["name"] not in seen]
            score = {x["name"].lower(): x["score"] for x in nb}
            if nb:
                try:
                    data = fetcher(build_query(hybrid.confirm_queries([x["name"] for x in nb])[0]), token)
                except ScoutError:
                    data = None  # unconfirmed indexed repos are dropped (fail closed), the keyword results stand
                items = data.get("items") if isinstance(data, dict) else None
                if isinstance(items, list):
                    take("found by meaning", [it for it in items if isinstance(it, dict)
                                              and str(it.get("full_name", "")).lower() in score],
                         extra, rel_floor=10, ex={k: 0 for k in excluded}, why=hybrid.FOUND_WHY)
                extra.sort(key=lambda r: -score.get(r["full_name"].lower(), 0.0))
                if sims is not None:
                    sims += [score.get(r["full_name"].lower(), 0.0) for r in extra]
    if fused:
        kept = hybrid.hybrid_order(head + extra, description or " ".join(queries), sims) + tail
    if not kept:   # RS78a: an empty result always says why, also in --json
        note = NO_MATCH + (" Broader searches " + _quoted(broadened) + " found nothing either." if broadened else "")
    # RS23: per-feature groups (a repo appears under the first query that returned it); build before _pushed is dropped
    groups = [{"query": queries[i], "repos": _order(by_query[i], prefer_starters)} for i in range(len(queries))]
    for i, r in enumerate(kept, 1):
        r["rank"] = i
    for r in kept:
        r.pop("_pushed", None)
    cap = len(kept) if top is None else max(top, 1)
    ccap = len(kept) if candidates is None else max(candidates, cap)
    return {
        "queries": queries,
        "license_mode": license_mode,
        "max_age_months": max_age_months,
        "min_stars": min_stars,
        "rank_mode": rank_mode,
        "semantic": semantic_status,
        "found_by_meaning": [r["full_name"] for r in extra],
        "prefer_starters": prefer_starters,
        "broadened": broadened,   # RS78a
        "note": note,             # RS78a: why the list is broader, or why it is empty; None otherwise
        "excluded": excluded,
        "top": kept[:cap],
        "candidates": kept[:ccap],
        "all": kept,
        "groups": groups,
    }


def render(result):
    """RS10: plain table for people."""
    out = [f"Queries: {'; '.join(result['queries'])}",
           f"Filters: license={result['license_mode']}, last push within "
           f"{result['max_age_months'] or 'any'} months, at least {result['min_stars']} stars, no forks, no archived",
           f"Ranking: {_rank_text(result)}",
           "Excluded: " + ", ".join(f"{k}={v}" for k, v in result["excluded"].items()), ""]
    if not result["candidates"]:
        out += [result.get("note") or NO_MATCH, "", KEY]
        return "\n".join(out)
    if result.get("note"):   # RS78a
        out += ["Note: " + result["note"], ""]
    out.append("Shortlist:")
    for r in result["candidates"]:
        star = "  [starter]" if r["starter"] else ""
        out.append(f"{r['rank']:>2}. {r['full_name']}  ★{r['stars']:,}  {r['license']}  pushed {r['pushed']}{star}")
        out.append(f"    {r['why']}")
        out.append(f"    {r['license_use']} | Completely free? {r['free']}")
        out.append(f"    {r['url']}  [query: {r['query']}]")
        out.append(f"    How to start: {r['start_hint']}")
        out.append(f"    {_desc(r)}")
        if r.get("trust"):   # RS56
            out.append("    Safe to build on?")
            out += [f"      {x}" for x in r["trust"]["lines"]]
    if any(r.get("trust") for r in result["candidates"]):
        out.append("    " + trust.NOTE)
    out += ["", KEY, FREE_NOTE]
    return "\n".join(out)


def render_markdown_grouped(result):
    """RS23: one section per feature/query, every suitable repo listed (no 10-cap)."""
    out = ["## replore results — grouped by need", "",
           f"**Filters:** license={result['license_mode']}, last push within "
           f"{result['max_age_months'] or 'any'} months, at least {result['min_stars']} stars, no forks, no archived  ",
           "**Excluded:** " + ", ".join(f"{k}={v}" for k, v in result["excluded"].items()), ""]
    if result.get("note"):   # RS78a
        out += [f"**Note:** {_md(result['note'])}", ""]
    total = 0
    for g in result["groups"]:
        out += [f"### {_md(g['query'])}  ({len(g['repos'])})", ""]
        if not g["repos"]:
            out += ["_No match for this need._", ""]; continue
        out += ["| Repo | Why relevant | Stars | What it does | License | OK in a paid product? | Completely free? | Starter? | Last push |",
                "|---|---|---|---|---|---|---|---|---|"]
        for r in g["repos"]:
            total += 1
            name = r["full_name"]
            link = f"[{_md(name)}](https://github.com/{name})" if _NAME.fullmatch(name) else _md(name)
            out.append(f"| {link} | {_md(r['why'])} | {r['stars']:,} | {_md(_desc(r))} | {_md(r['license'])} | "
                       f"{r['license_use']} | {r['free']} | {'yes' if r['starter'] else 'no'} | {r['pushed']} |")
        out.append("")
    out += _trust_markdown(result)
    out += [f"{total} open-source repos across {len(result['groups'])} needs, each group ranked by fit "
            "(relevance, stars, license). Grouped by the first search that found each; not a scan of every "
            "repository. The plugin skill adds a semantic relevance check on top.", "", KEY, "", FREE_NOTE]
    return "\n".join(out)


NO_DESC = "No description on GitHub"   # RS45: same words as the web page; JSON and CSV keep the empty value (data)


def _desc(r):
    return r["description"] or NO_DESC


CSV_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _csv_cell(v):
    """RS20: a text cell that starts like a formula gets a leading ' so Excel / Sheets show it as text, never run it."""
    return "'" + v if isinstance(v, str) and v.startswith(CSV_FORMULA_START) else v


def render_csv(result):
    """RS20: spreadsheet rows (top + candidates). Every text cell is formula-guarded: query, why, name, licence, text."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(CSV_FIELDS)
    for r in result["candidates"]:
        w.writerow([_csv_cell(v) for v in (
            r["rank"], r["full_name"], r["why"], r["url"], r["stars"], r["license"], r["license_use"], r["free"],
            "yes" if r["starter"] else "no", r["start_hint"], r["pushed"], r["query"], r["description"])])
    return buf.getvalue().rstrip("\n")


def _rank_text(result):
    """RS5, RS15."""
    m = result["rank_mode"]
    text = ("fit: relevant, then popular, then free to use" if m == "fit"
            else "balanced: each search's best match first, then by stars" if m == "balanced"
            else "by stars across all searches")
    return text + ("; starter templates first" if result["prefer_starters"] else "")


def _md(text):
    """RS9, RS13: escape repo text so it cannot inject Markdown/HTML into a job summary."""
    return re.sub(r"([\\`*_{}\[\]()#+!|<>~])", r"\\\1", text or "")


def _trust_markdown(result):
    """RS56: the trust check for the repos it ran on, one list per repo, same words as the web panel (RS53)."""
    rows = [r for r in result["candidates"] if r.get("trust")]
    if not rows:
        return []
    out = ["### Safe to build on? (top %d)" % len(rows), ""]
    for r in rows:
        out.append(f"**#{r['rank']} {_md(r['full_name'])}**")
        out += [f"- {_md(x)}" for x in r["trust"]["lines"]]
        out.append("")
    return out + [_md(trust.NOTE), ""]


def add_trust(result, token=None, get=None):
    """RS56: run the trust check on the top repos (at most trust.MAX_REPOS) and attach it to them. Display only."""
    rows = result["candidates"][:trust.MAX_REPOS]
    spdx = lambda r: r["license"] if r.get("open_license") else ""
    checked = trust.check_many([(r["full_name"], r.get("language", ""), spdx(r)) for r in rows], token,
                               get or trust.get_json)
    for r, c in zip(rows, checked):
        c["lines"] = trust.lines_for(c)
        r["trust"] = c
    return result


def render_markdown(result):
    """RS10, RS13: Markdown for a GitHub Actions job summary."""
    out = ["## replore results", "",
           f"**Queries:** {_md('; '.join(result['queries']))}  ",
           f"**Filters:** license={result['license_mode']}, last push within "
           f"{result['max_age_months'] or 'any'} months, at least {result['min_stars']} stars, no forks, no archived  ",
           f"**Ranking:** {_rank_text(result)}  ",
           "**Excluded:** " + ", ".join(f"{k}={v}" for k, v in result["excluded"].items()), ""]
    if not result["candidates"]:
        out += [_md(result.get("note") or NO_MATCH), "", KEY]
        return "\n".join(out)
    if result.get("note"):   # RS78a
        out += [f"**Note:** {_md(result['note'])}", ""]
    extra = result["candidates"][len(result["top"]):]
    for title, rows in (("Top %d" % len(result["top"]), result["top"]),
                        ("More candidates (used if the relevance check drops some)", extra)):
        if not rows:
            continue
        out += [f"### {title}", "",
                "| # | Repo | Why relevant | Stars | What it does | License | OK in a paid product? | Completely free? | "
                "Starter? | Last push | How to start | Query |",
                "|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for r in rows:
            name = r["full_name"]
            link = f"[{_md(name)}](https://github.com/{name})" if _NAME.fullmatch(name) else _md(name)
            out.append(f"| {r['rank']} | {link} | {_md(r['why'])} | {r['stars']:,} | {_md(_desc(r))} | "
                       f"{_md(r['license'])} | {r['license_use']} | {r['free']} | {'yes' if r['starter'] else 'no'} | "
                       f"{r['pushed']} | {_md(r['start_hint'])} | {_md(r['query'])} |")
        out.append("")
    out += _trust_markdown(result)
    out += ["Ranked by fit (relevance, stars, license) among GitHub search matches, not a scan of every "
            "repository. The plugin skill adds a semantic relevance check on top.", "", KEY, "", FREE_NOTE]
    return "\n".join(out)


def main(argv=None):
    utf8_stdio()  # RS48
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("queries", nargs="+")
    p.add_argument("--top", type=int, default=20)
    p.add_argument("--candidates", type=int, default=40)
    p.add_argument("--all", dest="all_matches", action="store_true", help="no cap: every suitable repo (RS23)")
    p.add_argument("--group", action="store_true", help="group results by need/feature, for a PRD (RS23)")
    p.add_argument("--license", dest="license_mode", choices=["open", "any"], default="open")
    p.add_argument("--max-age-months", type=int, default=24)
    p.add_argument("--min-stars", type=int, default=50)
    p.add_argument("--rank", dest="rank_mode", choices=["fit", "balanced", "stars", "hybrid"], default="fit")
    p.add_argument("--describe", default=None, help="RS42: the whole project description, for --rank hybrid")
    p.add_argument("--semantic", action="store_true",
                   help="RS42 opt-in: meaning scores + indexed repos from Replore's server (sends the description)")
    p.add_argument("--prefer-starters", action="store_true")
    p.add_argument("--trust", action="store_true",
                   help="RS56: also check the top 5 are safe to build on (OpenSSF Scorecard, deps.dev, GitHub)")
    fmt = p.add_mutually_exclusive_group()
    fmt.add_argument("--json", action="store_true")
    fmt.add_argument("--markdown", action="store_true")
    fmt.add_argument("--csv", action="store_true")
    p.add_argument("--csv-block", action="store_true", help="with --markdown: add a fenced CSV block (RS20)")
    a = p.parse_args(argv)
    if a.top < 1 or a.candidates < 1 or a.max_age_months < 0 or a.min_stars < 0:
        p.error("--top and --candidates must be >= 1, --max-age-months and --min-stars >= 0")
    top = None if a.all_matches else a.top
    cand = None if a.all_matches else a.candidates
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")  # RS8: never printed
    try:
        res = scout(a.queries, fetcher=fetch, top=top, candidates=cand, license_mode=a.license_mode,
                    max_age_months=a.max_age_months, token=token, rank_mode=a.rank_mode,
                    prefer_starters=a.prefer_starters, min_stars=a.min_stars,
                    description=a.describe, semantic_on=a.semantic)
    except ScoutError as e:
        print(f"replore: {e}", file=sys.stderr)
        return 2
    if a.trust and res["candidates"]:
        add_trust(res, token)   # RS56: never fails the search; a failed part says "couldn't check"
    out = (json.dumps(res, indent=2, ensure_ascii=False) if a.json
           else render_markdown_grouped(res) if (a.markdown and a.group)
           else render_markdown(res) if a.markdown else render_csv(res) if a.csv else render(res))
    if a.markdown and a.csv_block and res["candidates"]:
        fence = chr(96) * 3
        out += ("\n\n## CSV (copy into Excel / Google Sheets)\n\n" + fence + "csv\n"
                + render_csv(res).replace(fence, chr(39) * 3) + "\n" + fence)
    print(out)
    return 0 if res["candidates"] else 1


if __name__ == "__main__":
    sys.exit(main())
