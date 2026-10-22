# SPEC: "11:40 pm, then the scout" (Replore explainer, A + C mix)

GOAL:    a vibe coder who watched once knows: before you ask an AI to build it, Replore finds the open-source repo that
         already does most of it and tells you if you can use it; they remember "Find it before you build it."
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, no voiceover, large on-screen lines carry the words.
TIME:    52 s x 30 = 1560 frames. Scenes: desk 0-12 s, search 12-16 s, scout 16-34 s, payoff 34-44 s, end 44-52 s.

LOOK:    two worlds, one palette (the site's own tokens, quoted exactly):
         navy #22374a, slate #3f6f8e, slate-2 #5b88a6, mist #c7d6e2, page #f4f6f8, card #ffffff, ink #1e2a36,
         muted #5f6b78, line #dde3e9, night #121a22, night-2 #17212b, good #426832 on #e4ecdc.
         ONE accent: lantern amber #e7a95a (fill) / #c9853a (shade). It may appear only on the lantern flame, its light
         pool and the three ranked points. Nowhere in the desk world except the mug.
         Display: Anton 400, titles 96-150 px, tracking -1%. Body: Inter Tight 600/700, 30-44 px. Code and labels:
         JetBrains Mono 400/500, 26-30 px. Nothing that must be read under 28 px.
         Desk world medium = flat cut paper: solid fills only, every object a hard-edged shape, one cast shadow per
         object (offset 0 14 px, blur 0, #000 at 22%), 1.5% paper grain (seeded noise SVG), no gradients.
         Scout world medium = a printed field map at night: ground night #121a22 with 2% grain; contour lines are ink
         (#3f6f8e at 55%, 2.5 px, round caps), never lit; the lantern light is a cel-shaded pool, two hard-edged
         ellipses (#e7a95a at 16% and 9%), never a blur. Screens in both worlds are the real Replore UI rebuilt in
         its own CSS (card A, the search box, the plan bar).
OBJECTS: the laptop: dark aluminium lid edge #2a333d, bezel 18 px, hinge bar, screen fills 62% of frame width.
         the clock: menu-bar time, top right of the laptop screen, JetBrains Mono 30 px.
         her: a cut-paper silhouette from behind (hair bun, shoulders, a hoodie), bottom-left, 46% frame height.
         the mug: flat cylinder with a handle, amber, steam as two mist strokes.
         the desk lamp: angled arm and shade, light falls as a flat pale trapezoid on the desk.
         the window: four panes, night sky #17212b, three stars as 3 px dots (no twinkle).
         the scout: 260 px tall: wide-brim hat, round head with two dot eyes, scarf, short coat, backpack with flap
         and strap, boots; carries a lantern on its left hand; a brass spyglass (#c9853a) when searching.
         signpost: wooden post #8a6a48 with a mist board; the sentence is painted on it.
         repo markers: little survey stakes (a 4 px dot on a 14 px line); the three ranked ones become cairn
         flags with a name plate and a licence sign hung below.
         the backpack: carries plan cards; the flap closes with a zip.
MOTION:  enter = expo.out (0.5-0.7 s); move = power2.inOut; exit = power3.in, 40-50% of the entrance;
         camera = power2.inOut, 0.8-1.4 s. Character springs: damping 0.55 (elastic.out(1,0.55)) on position and
         scale only. Walk cycle 0.5 s a step, bob 6 px, head leads limbs by 2 frames. Stagger: words 70 ms,
         list items 60 ms, letters typed at 34 ms. Line boil on the scout outline at 12 fps, 0.8 px, seeded.

SHOTS:
 1  f0-120   (0-4 s) Desk. Hero: the laptop screen. Chat box holds "build me a chatbot that answers questions
             from my PDFs"; the AI reply types "Sure! Let's start from scratch..." Read: clock 11:40 pm (whole shot),
             the ask (0.4-4 s). Sound: lo-fi bed in, two key ticks. Hand-off: the reply keeps growing into code.
 2  f120-360 (4-12 s) The pile. Hero: code scrolling up the chat, file chips multiplying (app.py ... 9 files),
             the clock rolling 11:40 -> 12:52 am. At 8.8 s a red error block lands: "ModuleNotFoundError: No
             module named 'faiss'". At 9.6 s she sighs: shoulders drop 14 px, head tips 4 deg, settle. Line "Two hours.
             Still from scratch." (10.2-12 s). Sound: error thud on 8.8 s. Hand-off: a browser tab slides in.
 3  f360-480 (12-16 s) Replore. Hero: the real search box, 1100 px wide, "What are you building?". The same
             sentence types in (34 ms a letter, key ticks), cursor clicks Find at 14.9 s; the box's navy fill grows past
             the frame (0.65 s, power2.in) and becomes the night map. Hand-off: object becomes the world.
 4  f480-1020 (16-34 s) The scout searches (camera over a 3600 x 2000 map):
             16.0 lantern clicks on (2-frame step), the pool appears; the sentence lands on the signpost board.
             18.0 the scout lifts the spyglass (anticipation 4 frames), stakes pop across the map: label
                  "Searching GitHub" sits on the spyglass's sightline (18.4-21 s).
             21.0 most stakes sink; three become flagged cairns, numbered 1 2 3: label "Ranking by fit" (21.2-23.4 s).
             23.4 the camera tracks with the scout walking to #1 (kotaemon).
             25.0 it reads the hung licence sign "Apache-2.0 · Free for commercial use" (25.2-27 s).
             27.0 it lifts the cairn's hatch: a paper unfolds, "Wiki: ask about it" (27.2-28.8 s).
             29.0 the name plate goes into the backpack, zip, label "Add to plan" (29.2-30.8 s).
             31.0 #2 pdfGPT, "MIT · Free for commercial use", packed in one motion (31-33 s).
             33.2 the scout turns to camera, lifts the backpack. Sound: footsteps, lantern click, zip x2.
 5  f1020-1320 (34-44 s) Payoff. The backpack fills the frame (carry across) and opens onto her screen: three real
             cards (kotaemon, pdfGPT, pdftochat), two marked "In plan", "Open in Claude" pressed (36.6 s); the chat
             reopens with the plan: "I'm building: a chatbot that answers questions from my PDFs. Built on:
             Cinnamon/kotaemon, bhaskatripathi/pdfGPT"; the reply "kotaemon already does upload, chunking and chat.
             We start there." Clock 12:58 am -> 1:04 am. Read: reply 39.6-44 s.
 6  f1320-1560 (44-52 s) End. Navy ground with printed contour lines (from the map). "Find it before you build it."
             two lines, Anton 150 px, left-aligned at x 160; the scout walks in from the right carrying the compass
             mark and sets it beside "Replore"; "replore.cardzo.co.in" in mono. Last line held 4 s.

BANNED:  the spec.md defaults (dark void with small floating things, glow/bloom/neon/lens flare/orbs/rings/particles,
         purple-blue or mesh gradients, glass cards, cream-paper serif look, numbered 01/02 labels, pill chips as
         decoration, everything centred, everything fading and sliding up, text moving while read, titles drifting,
         corner labels and HUD, three cards in a row as decoration, a title over a dimmed screenshot, logo docked in a
         corner), plus for this owner: quote marks around the typed query, emoji or glyph icons, any light drawn as a
         blur, a lit-up contour map, ASCII globe glow, AI-looking 3D, stock "sparkle" effects.
QA:      t=1.0 clock + ask readable; t=9.0 the error reads; t=10.5 sigh pose + line; t=14.0 query in the real box;
         t=15.4 mid-zoom (no jump); t=17.0 lantern + signpost readable; t=19.5 "Searching GitHub"; t=22.0 three numbered
         cairns; t=26.0 licence sign readable; t=28.0 wiki paper; t=30.0 "Add to plan"; t=36.0 three cards, two in
         plan; t=42.0 reply readable; t=49.0 end line + mark + URL. All text >= 28 px and inside the 80% title-safe box.
