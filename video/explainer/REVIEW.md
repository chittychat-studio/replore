# Review: "11:40 pm, then the scout" (first delivery, 2026-10-23)

Render: `renders/replore-explainer.mp4`, 52.0 s, 1920x1080, 30 fps, H.264 + AAC, 12.6 MB.

## Creative calls
- Storylines A and C mixed at the owner's request: the pain at her desk, then the scout bot searching. Storyline B was not built.
- The scout is an original 3D bot made in Google Flow (Nano Banana 2.1 stills, Veo 3.1 Lite clips), cut out from chroma green.
  An earlier code-drawn detective and a flat silhouette of her were rejected by the owner.
- Her desk is one Flow 3D still; the chat and Replore screens are real UI warped onto the laptop screen (matrix3d).
- The map world is a plain lit dark-blue studio floor. Contour lines were rejected (again), so there are none.
- Real data only: the three results and licences are scout.py's top three for the PDF chatbot search (2026-10-23).

## Measured vs. looked at
- `hyperframes check`: passes, no errors. Deliberate overlaps (code wall, error box, the incoming tab) are marked.
- Loudness measured, not heard: -16.8 LUFS integrated, -5.7 dBFS peak. Sound effects only (Pixabay, bundled); no music bed,
  because there is no music source on this machine.
- Frames looked at across every scene on contact sheets, plus eight frames from the final file.

## Weakest shot and next steps
- The bot scene's stills and clips swap pose with a hard cut; a short cross-dissolve or more Veo clips would smooth it.
- The modal in the payoff is on screen ~1.2 s, a glance rather than a read (kept on purpose: the chat repeats it).
- Add a music bed (owner's track or a HeyGen catalogue track once `heygen` is signed in).

## Warnings kept on purpose
- `nested_media_start_basis_ambiguous`: media times are local to each scene, as intended.
- `line_unread` on the transitional Replore page in the desk scene and on the modal: they are passed through, not read.
