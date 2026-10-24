# Tour v2 voiceover and music (ElevenLabs)

The owner picked ElevenLabs for the voice and the music (2026-10-24). Voicebox needs more RAM than this laptop has
spare. The key comes from the `ELEVENLABS_API_KEY` user env var; never print it. Beats follow STORYLINES.md v2,
which runs about 52 s.

## Voice
- **Narrator:** warm, friendly, unhurried, a little playful, like a friend explaining over coffee. Not a trailer
  voice, and not American-advert bright. Pick one of ElevenLabs' stock voices, or the owner's own cloned voice if they
  have one.
- **Leo** has one line, in a lighter, cheerful voice. Optional: drop it if two voices feel busy.
- **Model:** eleven_multilingual_v2 (best quality). Output mp3_44100_128, then convert to WAV for HyperFrames.

## Script (about 115 words, with the time each beat starts)
- 0 s, Narrator: "Eleven forty at night. You have an idea, and an empty folder."
- 5 s, Narrator: "So you build it from scratch. Then the errors start. One fix breaks two more things, and it's after
  one a.m."
- 16 s, Narrator: "Here's the thing. Someone has probably built most of it already, for free."
- 20 s, Leo: "Hi, I'm Leo. Tell me your idea."
- 23 s, Narrator: "Leo searches GitHub for you and ranks what he finds by how well it fits, how many people use it, and
  whether you can use it for free."
- 30 s, Narrator: "Real repos, real licences, nothing made up. Pick one, and build on it."
- 38 s, Narrator: "Same idea. Working tonight."
- 44 s, Narrator: "Replore. Find it before you build it."

## Music (ElevenLabs Music, instrumental, no vocals, 52 s)
"Pleasant, warm instrumental for a product explainer. 0-16 s: soft lo-fi piano and mellow beat, a little tired and
late-night, minor-leaning. At 16-20 s a gentle lift. From 20 s: bright, hopeful, light synth arpeggios and soft
plucks over a steady relaxed beat, major key, about 100 BPM, uplifting but calm, never epic or cinematic. Clean ending
on a resolved chord at 52 s. No vocals."
- Mix: music around -20 LUFS under the voice (duck by about 8 dB while the voice is speaking), and -14 LUFS integrated
  for the final video.
- Record the provenance (ElevenLabs, model, date, prompt) in NOTICE.md. The plan must allow commercial use; check the
  ElevenLabs plan terms before it ships.
