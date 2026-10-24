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
- web/leo-intro.webm, web/leo-idle.webm, web/leo-hero.webp: Leo, generated 2026-10-24 in Google Flow by the owner's
  account. Character sheet and frames made with Nano Banana 2.1; the clips (dark-visor version, owner pick) made with Veo 3.1 Lite (720p, 8 s); keyed
  from green and cropped for the web. The sources are in video/explainer/assets/leo/src/. The prompts are in
  video/explainer/LEO_FLOW_STITCH.md. Google's SynthID watermark is embedded; the footer credits Google Veo.
- video/explainer/assets/audio/vo*.mp3: tour voiceover, ElevenLabs (eleven_multilingual_v2, speed 0.9), generated
  2026-10-24 from the script in video/explainer/VOICEOVER.md.
