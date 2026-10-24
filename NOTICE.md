# Notices

## Fonts (SIL Open Font License 1.1)
- Plus Jakarta Sans: web/fonts/pjs-*.woff2 (@fontsource-variable/plus-jakarta-sans 5.2.8), licence in web/fonts/PlusJakartaSans-OFL.txt
- JetBrains Mono: web/fonts/jbmono-*.woff2 (@fontsource/jetbrains-mono 5.2.8), licence in web/fonts/JetBrainsMono-OFL.txt
- Inter Tight, Instrument Serif, Anton: licences in web/fonts/*-OFL.txt

## Firebase JS SDK (Apache License 2.0)
- web/vendor/firebase-12.19.0/firebase-app.js and firebase-auth.js: the browser builds of the `firebase` npm package
  12.19.0 (Copyright Google LLC), for the optional Google sign-in (SPEC RS94). Only these two modules are shipped. Changes:
  firebase-auth.js imports `./firebase-app.js` instead of the gstatic.com CDN URL, and the source-map comment line is
  removed from both files. Licence in web/vendor/firebase-12.19.0/LICENSE.txt (Apache-2.0, with the BSD-3-Clause
  protobuf notice the SDK ships). Original files: sha256 39a50952b5def557337b2290069c7d7371f3515ad46c44a43b9c520f734d8d14
  (firebase-app.js) and 59f60ce3adcb4c85a5260e963fd14134eec088de5b18ddfb9e95771c72f65264 (firebase-auth.js).

## AI-generated media
- web/hero-plate-dark.webp: the dark hero backdrop, generated in Google Stitch by the owner's account (project "Replore 3D
  Website Redesign", screen dfc82632552c49138567e59e6980f52f, prompt in the screen title: an ultra-wide cyber data matrix
  backdrop, no robots, no text), 1376x768, converted to WebP (quality 84) on 2026-10-25.
- web/leo-intro.webm, web/leo-idle.webm, web/leo-hero.webp: Leo, generated 2026-10-24 in Google Flow by the owner's
  account. Character sheet and frames made with Nano Banana 2.1; the clips (dark-visor version, owner pick) made with Veo 3.1 Lite (720p, 8 s); keyed
  from green and cropped for the web. The sources are in video/explainer/assets/leo/src/. The prompts are in
  video/explainer/LEO_FLOW_STITCH.md. Google's SynthID watermark is embedded; the footer credits Google Veo.
- video/explainer/assets/audio/vo*.mp3: tour voiceover, ElevenLabs (eleven_multilingual_v2, speed 0.9), generated
  2026-10-24 from the script in video/explainer/VOICEOVER.md.
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
