# Bass Split Trainer

A sight reading trainer for marching bass drum. It shows one bar of five-drum split music and asks which counts one drum plays.

Open `index.html` in a browser, or publish with GitHub Pages (Settings > Pages > Deploy from a branch > `main`, `/ (root)`).

## Files

- `index.html`, `style.css`, `app.js`: the whole site. No build step.
- `vendor/vexflow-bravura.js`: VexFlow 4.2.2 (MIT), which draws the notation in the Bravura music font.

## Roadmap

1. Sheet music trainer: sixteenths, triplets, sextuplets, unisons, four levels, timer, highlight (done)
2. Count labels under the notes after answering, choice of counting syllables
3. 32nd notes, irregular time signatures, nested tuplets
4. Shared leaderboard (needs a small hosted database, since GitHub Pages only serves files)
5. Listening trainers: playback of the bar, spotting split errors by ear
