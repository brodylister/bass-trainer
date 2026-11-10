# Bass Trainer

Free practice tools for young marching bass drum players.

- **Box-Cooldown Sandbox** (`index.html`): one bar of rhythm shown as sheet music and as boxes. Each box is as wide as its note lasts, with a green line where the note is struck and a red "cooldown" for the wait before the next one. Cut boxes in 2 or 3, fuse them back, switch notes and rests, and play the bar back with a metronome.
- **Bass Split Trainer** (`split-trainer.html`): shows one bar of five-drum split music and asks which counts one drum plays.

Open `index.html` in a browser, or publish with GitHub Pages (Settings > Pages > Deploy from a branch > `main`, `/ (root)`).

## Files

- `index.html`, `sandbox.css`, `sandbox.js`: the Box-Cooldown Sandbox.
- `split-trainer.html`, `app.js`: the Bass Split Trainer.
- `style.css`: shared layout, navigation and footer.
- `vendor/vexflow-bravura.js`: VexFlow 4.2.2, which draws the notation in the Bravura music font.

There is no build step.

## License

The original code, design and text are licensed under [CC BY-NC 4.0](LICENSE): free to use and adapt for non-commercial purposes with credit to Brody Lister, keeping the footer acknowledgement or a clear equivalent. VexFlow (MIT) and Bravura (SIL OFL 1.1) keep their own licenses; see `vendor/LICENSES.txt`.

## Roadmap

1. Sheet music trainer: sixteenths, triplets, sextuplets, unisons, four levels, timer, highlight (done)
2. Box-Cooldown Sandbox with metronome playback (done)
3. Count labels under the notes after answering, choice of counting syllables
4. 32nd notes, irregular time signatures, nested tuplets, ties
5. Shared leaderboard (needs a small hosted database, since GitHub Pages only serves files)
6. Listening trainers: spotting split errors by ear
