# Leo, Stitch version (RS92): Google Flow prompt pack

Owner decision 2026-10-24: Leo becomes the robot from the Stitch design ("yes exactly this"), replacing the
black-visor, satchel and magnifier Leo. Reference: `references/stitch/leo-stitch.png` (git-ignored; only 435x237, so
ask the owner for a larger export before generating). These clips and stills replace web/leo-peek.webm and the
scout-*.webp stills, and later the tour video's scout, once the owner approves them.

## Character sheet (generate first in Flow with Imagen / Nano Banana, then use as the reference for every clip)
"An original friendly small robot named Leo: glossy pearl-white rounded body and limbs with soft lavender-grey joints,
a large rounded helmet head with a glowing cyan (#00F0FF) visor screen that shows a simple smiling face (two curved
happy eyes and a small smile, drawn in bright cyan light), round white ear discs with soft cyan accent rings, the word
'LEO' in clean light-blue letters on his chest plate with a small round emblem above it. Friendly, curious, slightly
chunky proportions, 3D animated-film quality, glossy but not plastic. Character sheet: front, three-quarter, side and
back views, neutral standing hover pose, on a solid flat chroma green background (#00B140), no text other than LEO on
the chest."
Keep him clearly different from Sony's Astro Bot (no blue body panels or antenna clusters) and from EVE (not egg-shaped).

## Shared style line (paste at the end of every clip prompt)
"Lit for a dark sci-fi interface: neon cyan (#00F0FF) rim light from the left, soft violet (#8B5CF6) fill from the
right, cyan glow from his visor face lighting his chest a little. Solid flat chroma green background (#00B140), no
floor, no props except the hologram described, no extra text. Camera locked off, full body in frame with room
around him, 16:9."

## Hero clip (the one the home page needs first; owner request 2026-10-24)
The site draws the cyber background itself (grid, particles, code rain) across the whole hero, so Leo is generated
ALONE on chroma green, together with his hologram ring, and both are cut out as one.
0. **Hero intro**: "Leo flies in from the far upper-left background toward the camera, doing one smooth full turn
   (360 degrees around his vertical axis) as he comes, and settles into a hover just right of centre, facing the
   viewer. A holographic radar ring of thin cyan circles, tick marks and a sweeping arc is floating at his right,
   about the size of his head. He raises his right hand and touches its edge; the ring lights up brighter, starts
   spinning slowly and pulses once. He smiles at the viewer and keeps hovering." (about 6 to 8 s; the last second
   must match the idle loop's first frame.)
0b. **Hero idle (loop)**: "Leo hovers beside the slowly spinning holographic radar ring, one hand resting near its edge,
   bobbing gently, blinking and smiling. Starts and ends on the same pose so it loops seamlessly."
On the page: 0 plays once (muted, inline), then crossfades into 0b on a loop. Under reduced motion, the page shows the
last frame of 0 as a still. Cut-out note: keep the ring's glow soft and inside the frame, so the alpha matte has no
hard edge.

## More clips (Veo in Flow, image-to-video from the character sheet, about 4 to 8 s each)
1. **Idle hover (loop)**: "Leo hovers, bobbing gently, his visor face blinks and smiles. Starts and ends on the
   same pose so it loops."
2. **Fly-in**: "Leo flies in from the far left background, turns toward camera mid-flight, settles into a hover and
   smiles at the viewer."
3. **Wave**: "Leo hovers and waves hello with his right hand, his visor eyes curving into a big smile."
4. **Searching**: "Leo raises his right hand and taps a floating holographic radar ring made of thin cyan circles
   and tick marks; the ring spins and pulses as he scans, light reflecting on his body."
5. **Found**: "The hologram ring flashes and closes, Leo's visor shows excited happy eyes, he gives a thumbs-up."
6. **Peek**: "Leo slides in from the right edge of the frame, peeks out with a curious face, then floats fully into
   view." (Keep his whole head inside the frame for the whole clip.)

## After Flow
- Cut out the chroma green into VP9 WebM with alpha, plus a WebP still per pose (hero, wave, search, searching) and an
  HEVC-with-alpha or CSS-sprite fallback for Safari (as now).
- Keep each web clip under about 1.5 MB, muted, playsinline, with a poster.
- Hash-stamp with ops/stamp_assets.py, and record each file's provenance (Flow, model, date, prompt number) in NOTICE.md.
- The owner picks the takes before anything ships. The /pro page, Launch window and 404 page use the same stills.

## v3 (owner 2026-10-25): cinematic plates plus a green-screen Leo lit to match

The dark hero now uses the Stitch plate `web/hero-plate-dark.webp` (RS92). These prompts make the 4K versions, the
light twin, and a Leo that blends into them. Generate the plates first, then light Leo to match them.

### P1. Dark plate, 4K (Flow, Imagen; or Stitch when its quota resets)
"Ultra-wide 21:9 panoramic backdrop, 3840x1646: a deep obsidian and navy cybernetic data space. A 3D perspective grid
floor and ceiling of thin neon cyan (#00F0FF) lines receding to a vanishing point slightly right of centre. Holographic
circular radar HUD rings and telemetry panels glowing cyan in the left third. Floating bokeh light nodes at several
focal depths, mostly cyan and teal with some electric violet (#B026FF), large and soft in the foreground, small and sharp
far away. Soft out-of-focus vertical digital code streams in the far distance. Volumetric haze, cinematic depth of field,
subtle chromatic dispersion. Clean dark negative space in the centre-right for text. No robots, no characters, no text,
no logos, no watermark."

### P2. Light plate, 4K (same composition)
"The light-mode twin of P1, same camera and layout: base of soft white and pale ice-blue haze (#F4F9FC to #E3F1F7), grid
lines and HUD rings in deep teal (#0E7490) and cyan (#0891B2) at gentle contrast, bokeh in cyan and teal with a few soft
violet (#7C3AED) nodes, distant code streams in pale teal. Bright and airy, never grey or muddy. Clean negative space in
the centre-right for dark text. No robots, no characters, no text, no logos, no watermark."

### P3. Optional: plate loop (Veo, image-to-video from P1, then from P2)
"Very slow forward dolly into the grid, bokeh drifting gently at different speeds, code streams falling slowly, HUD
rings rotating a few degrees. Camera move is smooth and constant. 8 seconds; the last frame matches the first so it
loops seamlessly. No new objects appear." (Keep under about 2 MB as 1280-wide WebM; the still plate stays as poster.)

### P4. Leo on green, lit for the plates (Veo, image-to-video from the character sheet)
Prompt: "Leo hovers in place, gently bobbing, his right fingertip touching the edge of a holographic cyan radar ring
floating at his right, the ring slowly turning. He blinks and smiles at the viewer. Starts and ends on the same pose so it
loops." Then paste this lighting and green-screen line:
"Lighting matched to a dark cyber scene: strong neon cyan (#00F0FF) rim light from behind on both edges, a cool cyan glow
from the ring lighting his right side and hand, soft teal-navy fill, a faint violet kick on his left shoulder. His white
body shows only cyan, teal and navy reflections; his dark glossy visor reflects the cyan ring, never green. Solid, evenly
lit chroma green background (#00B140) far behind him, no green bounce or reflections on him, no shadow on the
background, no floor. Sharp edges, no motion blur, no depth-of-field blur on Leo. No sparks, smoke, particles or lens
flares (they cannot be keyed). Camera locked off, Leo and the ring fully in frame with wide margins on every side, 16:9."
Make the intro (fly-in, as clip 0 above) with the same lighting line. On the page Leo gets the theme halo (a dark edge
in light, a pale rim in dark), so one take serves both themes.

**Use the front view only** (owner 2026-10-25): start every clip from Leo's front view, never from the four-view character sheet. The old fly-in was made from the sheet and turned Leo through his side and back views, so he looked like he was turning away from the viewer. No spins: he faces the camera the whole clip.

### After v3
Hand me the files: I key Leo (spill removal, soft matte, feather on every side), cut the plates to WebP (and the loops to
WebM with a poster), stamp them, and record each file's provenance in NOTICE.md.
