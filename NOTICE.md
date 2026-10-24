# Notices

## Router algorithms (SPEC RS95), ported to JavaScript in `router/src/`
No code was copied verbatim; these formulas and rules were re-implemented from the sources below, which are MIT
licensed. Each licence permits this use, including resale, provided the copyright notice and permission notice are kept,
as they are here.

- **freellmapi** (github.com/tashfeenahmed/freellmapi), `server/src/services/scoring.ts`, `ratelimit.ts`, `router.ts`,
  `provider-quota.ts`: headroom ramp, 429 penalty with decay, cooldown ladder, Retry-After as a floor, learning limits
  from headers and error text without ever raising them. Copyright (c) 2026 Tashfeen Ahmed. MIT License.
- **LiteLLM** (github.com/BerriAI/litellm, MIT outside `enterprise/`; nothing from `enterprise/` was used),
  `litellm/router_utils/cooldown_handlers.py`, `litellm/router_strategy/lowest_tpm_rpm_v2.py`: which errors cool a
  provider (429, 401, 402, 404, 408, 5xx) and pre-increment admission. Copyright (c) 2023 Berri AI. MIT License.
- **Portkey AI Gateway 1.x** (github.com/Portkey-AI/gateway, MIT; not the unlicensed 2.0 branch),
  `src/handlers/retryHandler.ts`, `src/globals.ts`: wait for a retry only when it fits the remaining time budget.
  Copyright (c) 2024 Portkey, Inc. MIT License.
- **one-api** (github.com/songquanpeng/one-api), `monitor/manage.go` (`ShouldDisableChannel`): the signals that a key
  is permanently bad (401, `invalid_api_key`, `account_deactivated`, "organization has been restricted").
  Copyright (c) 2023 JustSong. MIT License.

MIT License text (applies to each notice above):

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
