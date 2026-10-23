# Listing Replore (SPEC RS86)

Owner steps to list Replore in Anthropic's plugin directory and the official MCP registry, with the copy ready to
paste. Written 2026-10-23 from the live docs (links at each step); recheck a step's page if a screen looks different.
Nothing here is submitted yet: every step below is the owner's.

## 0. Before you submit (repo state)

The plugin folder is the **whole repository** (`.claude-plugin/plugin.json` sits at the root), so the directory checks
read everything in it. Measured on this branch:

| Check (pre-submission checklist) | Replore today | Result |
|---|---|---|
| Repository under 50 MiB as GitHub archives it, under 256 MiB unpacked, under 10,000 entries | about 20 MB archived, 163 tracked files | Passes |
| Plugin to 512 files or fewer | 163 | Passes |
| Every non-image, non-font file under 256 KiB | 15 video/audio files over it: `video/explainer/assets/...` (`.mp4`, `.webm`), `web/tour.mp4` (2.2 MB), `web/leo-peek.webm` | **Held for a reviewer** |
| Only text, PNG/JPEG/GIF/WebP and fonts | `.mp4`, `.webm` and `.mp3` under `video/` and `web/` | **Held for a reviewer** |
| No credential from the user's machine sent to a server | `scripts/scout.py` sends `GITHUB_TOKEN` (if set) to GitHub; `REPLORE_KEY` (if set) goes to Replore's own function | **Held for a reviewer** (explain in the review notes; both are optional, documented in README and PRIVACY) |
| Hook command: no variable but `${CLAUDE_PLUGIN_ROOT}`, no inline program | exec form since RS25 (2026-10-23) | Passes |
| MCP server started by running a file with plain arguments | `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/mcp_server.py` | Passes |
| README of 40+ words, `LICENSE` | yes | Passes |
| Manifest `description`, `author`, `version`; listing fields and icon | yes (RS85) | Passes |

**Recommendation (owner's call): move `video/` to its own repository** (for example `chittychat-studio/replore-video`)
before submitting. It is the explainer's HyperFrames source (RS64), about 40 MB on disk with the untracked renders, and
nobody who installs the plugin needs it. Moving it removes most of the "held" findings and makes every install smaller.
`web/tour.mp4` and `web/leo-peek.webm` would still be held: they are the web page's Tour video and Leo's peek clip and
must stay in `web/` for Cloudflare Pages. A reviewer hold is not a rejection, so you can also submit with them in place
and say in the notes that they are site media the plugin never runs.

**The alternative I did not take: a plugin subfolder** (for example `plugin/` holding `.claude-plugin/`, `skills/`,
`hooks/` and a copy of `scripts/`). It would leave the media out of the plugin, but:
- `scripts/` is shared by the plugin, the MCP server, the GitHub Action, the evals and the tests; a subfolder means
  either duplicating it (two copies to keep in sync, against RS29) or moving it and changing every path that names it;
- the checklist is stricter for subfolder plugins: hook and MCP commands that run a non-shell file (our `python3 ...py`)
  are held as "Scripts the validator couldn't follow", which a root plugin avoids;
- `/plugin marketplace add chittychat-studio/replore` and every README instruction would change for existing users.
Moving `video/` out is one repository move with no code change, so it is the smaller step.

## 1. Anthropic plugin directory

Docs: [Submit your plugin](https://claude.com/docs/plugins/submit), [pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist).

1. Have a **paid Claude plan** (Pro, Max, Team or Enterprise) on the account that will submit, and connect **GitHub** to
   claude.ai (Settings, Connectors) with access to `chittychat-studio/replore`.
2. Open <https://claude.ai/directory/manage> and select **Submit new**.
3. **What would you like to submit?** select **Plugin bundle**.
4. **Source:** repository `https://github.com/chittychat-studio/replore`, branch `main`. Plugin path: leave empty (the
   plugin is the repository root).
5. Select **Validate**. Fix anything marked **Blocking**, push, then **Re-validate**. Expect the policy holds listed in
   section 0; they do not stop the submission.
6. Fill in the listing with the copy below. The form reads the icon and the homepage, documentation, support and
   privacy links from `.claude-plugin/plugin.json` (RS85).
7. **Data handling:** answer with the text below (truthful as built; PRIVACY.md is the source).
8. Tick the **compliance acknowledgements** (Anthropic Software Directory Policy) after reading them.
9. **Submit.** Review status shows on the plugin's page in the portal; each new commit on `main` is scanned again.

### Listing copy (paste as is)

- **Name:** Replore
- **One-line description:** The repo scout for vibe coders: find the open-source GitHub repos that fit what you are building.
- **Category:** Development
- **Tags:** github, open-source, repo-search, discovery, licenses, vibe-coding, mcp
- **Long description:**

  > Describe what you are building in plain words, and Replore finds the open-source GitHub repos that best fit it,
  > ranked by relevance, popularity and how freely you can use the license. You get a comparison table: stars, what
  > each repo does, how well it fits, a plain-English license verdict (OK in a paid product? completely free?), the last
  > update and how to start. Hand it a product requirements doc and it searches feature by feature. Ask "which of these
  > are safe to build on?" and it checks security health (OpenSSF Scorecard), known vulnerabilities (deps.dev and
  > OSV.dev), the latest release and beginner-friendliness.
  >
  > Install adds the `/replore:find` skill and an MCP server with two tools, `find_repos` and `check_repos`. It runs on
  > your computer with Python 3.11+ and the standard library only. Searches go straight from your computer to the
  > GitHub API. No account, no API key, and no model calls: your own Claude writes the searches and judges the fit.
  > Repo names and descriptions are treated as data, never instructions. Web version: https://replore.cardzo.co.in

### Data-handling answers

- **Does the plugin collect, store or transmit personal data?** No personal data is collected or stored by Replore. The
  plugin runs on the user's computer. To search, it sends the search words to the GitHub API (api.github.com), with the
  user's IP address, under GitHub's privacy statement. When the user asks for the safety check, it sends public repo
  names (and their language) to GitHub, OpenSSF Scorecard (api.securityscorecards.dev) and deps.dev (api.deps.dev).
- **Credentials:** none required. If the user sets `GITHUB_TOKEN`, it is sent only to GitHub to raise the rate limit
  and is never printed or logged. If the user sets a Replore Pro key (`REPLORE_KEY`) and asks for meaning ranking
  (`--semantic`), the key and the project description go only to Replore's own server function (replore.cardzo.co.in),
  which checks the key with Polar and stores neither.
- **Local storage:** an optional security log, off by default. Only if the user sets `REPLORE_SECURITY_LOG`, a hook
  writes flagged prompts (first 200 characters) to a log file **on the user's own machine**; it is never transmitted.
- **Third parties:** GitHub, OpenSSF Scorecard, deps.dev (only on request), Replore's server (only with `--semantic`).
- **Privacy policy:** https://github.com/chittychat-studio/replore/blob/main/PRIVACY.md

## 2. Official MCP registry (registry.modelcontextprotocol.io)

Docs: [registry README](https://github.com/modelcontextprotocol/registry),
[quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx),
[package types](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx).

The registry lists metadata only; the code must be in a package registry. Replore ships as the PyPI package
**`replore-mcp`** (`pyproject.toml`, standard library only, no dependencies). It installs two commands:
`replore-mcp` (the MCP server, `scripts/mcp_server.py` `main`) and `replore` (the CLI, `scripts/scout.py` `main`). The
package is named for the server so that a client which launches it with `uvx replore-mcp` (the registry's
`runtimeHint`) starts the server, not the CLI. `server.json` at the repo root is the registry entry:
name `io.github.chittychat-studio/replore`, package `pypi` / `replore-mcp`, transport `stdio`, optional
`GITHUB_TOKEN` and `REPLORE_KEY`. Ownership proof for PyPI is the line `mcp-name: io.github.chittychat-studio/replore`
in the package README; it is in `README.md` as an HTML comment.

Steps:
1. **PyPI account:** create one at <https://pypi.org/account/register/> and turn on 2FA. Reserve the name by publishing.
2. **Build and upload** (on your machine, from the repo root):
   ```
   python -m pip install build twine
   python -m build                 # writes dist/replore_mcp-0.4.0.tar.gz and the .whl
   python -m twine upload dist/*   # PyPI asks for an API token (Account settings, API tokens)
   ```
   Check: `pipx run --spec replore-mcp replore --help` or `uvx --from replore-mcp replore "diet tracker app"`.
   Not yet verified: the build was not run here (`build` is not installed on the build machine); only the TOML was parsed.
3. **Install `mcp-publisher`:** macOS `brew install mcp-publisher`; Windows PowerShell:
   ```
   $arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
   Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
   tar xf mcp-publisher.tar.gz mcp-publisher.exe; rm mcp-publisher.tar.gz
   ```
   and move `mcp-publisher.exe` onto your PATH.
4. **Log in with GitHub** (the `io.github.chittychat-studio/` namespace needs a login that can act for the
   `chittychat-studio` organisation; make your organisation membership public if the login is refused):
   `mcp-publisher login github`, then open the printed link and enter the code.
5. **Publish** from the repo root: `mcp-publisher publish`. Success prints "Successfully published".
6. **Verify:** `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.chittychat-studio/replore"`.
7. On every release: bump the version in `pyproject.toml` and both places in `server.json` together with
   `plugin.json` and `SERVER_INFO` (RS50, tested), upload the new package, then `mcp-publisher publish` again.

## 3. Other MCP directories

- **PulseMCP** (<https://www.pulsemcp.com/submit>): as of 2026-10-23 the page says it is **not accepting new
  submissions** and recommends publishing to the official MCP registry first, which it will pick up automatically. So
  step 2 is the PulseMCP step; check the page again after publishing.
- **Glama** (<https://glama.ai/mcp/servers>, button **Add Server**): submit the GitHub URL
  `https://github.com/chittychat-studio/replore`. Not verified here: the form's fields and checks (third-party notes
  mention a Docker build check and a `glama.json` file listing maintainers); read the form before adding files for it.

## Owner checklist

- [ ] Decide on moving `video/` to its own repository (section 0), then do it.
- [ ] Paid Claude plan on the submitting account; GitHub connected on claude.ai.
- [ ] Submit the plugin bundle at claude.ai/directory/manage (section 1).
- [ ] PyPI account with 2FA; upload `replore-mcp` (section 2).
- [ ] `mcp-publisher login github` and `publish` (section 2).
- [ ] Glama Add Server (section 3); PulseMCP when it reopens.
