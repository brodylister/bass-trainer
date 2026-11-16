# Bass Trainer

Free practice tools for young marching bass drum players.

- **Rhythm Sandbox** (`index.html`): one bar of rhythm shown as sheet music and as boxes. Each box is as wide as its note lasts, with a green line where the note is struck and a red "cooldown" for the wait before the next one. Cut boxes in 2 or 3, fuse them back, switch notes and rests, and play the bar back with a metronome.
- **Written Split Quiz** (`split-trainer.html`): shows one bar of five-drum split music and asks which counts one drum plays.
- **Split Sandbox** (`split-sandbox.html`): write a split on the staff (cut, fuse, rests, drums 1 to 5, unisons, flams, accents) and hear it on five bass drums.
- **Auditory Rudiment Quiz** (`rudiment-quiz.html`): hear a split and pick the sheet music that matches. Four levels.
- **Discrepancy Quiz** (`discrepancy-quiz.html`): read a rudiment, hear it played with a mistake (timing, volume, rushing or dragging, the drum's sound) and pick what went wrong. Four levels.

Open `index.html` in a browser, or publish with GitHub Pages (Settings > Pages > Deploy from a branch > `main`, `/ (root)`).

## Files

- `index.html`, `sandbox.css`, `sandbox.js`: the Rhythm Sandbox.
- `split-trainer.html`, `app.js`: the Written Split Quiz.
- `split-sandbox.html`, `split-sandbox.js`: the Split Sandbox.
- `rudiment-quiz.html`, `rudiment-quiz.js`: the Auditory Rudiment Quiz.
- `discrepancy-quiz.html`, `discrepancy-quiz.js`: the Discrepancy Quiz.
- `listen-quiz.js`: what the two listening quizzes share (choices, scoring, timer, options).
- `rhythm-model.js`: cutting, fusing and counting, shared by both sandboxes so their tools always match.
- `split-core.js`: five-drum engraving, playback and the rudiment definitions.
- `bass-voice.js`: the sound of a five-drum bassline (D A D F# A), synthesized in the browser.
- `style.css`: shared layout, navigation and footer. `split.css`: the three listening modules.
- `analytics.js`: anonymous visit counting with [GoatCounter](https://www.goatcounter.com) (no cookies). If you reuse this site, change the GoatCounter code at the top of the file to your own, or delete the file's script tag from every page to turn counting off.
- `vendor/vexflow-bravura.js`: VexFlow 4.2.2, which draws the notation in the Bravura music font.

There is no build step.

## License

The original code, design and text are licensed under [CC BY-NC 4.0](LICENSE): free to use and adapt for non-commercial purposes with credit to Brody Lister, keeping the footer acknowledgement or a clear equivalent. VexFlow (MIT) and Bravura (SIL OFL 1.1) keep their own licenses; see `vendor/LICENSES.txt`.

## Roadmap

1. Sheet music trainer: sixteenths, triplets, sextuplets, unisons, four levels, timer, highlight (done)
2. Rhythm Sandbox with metronome playback (done)
3. Count labels under the notes after answering, choice of counting syllables
4. 32nd notes, irregular time signatures, nested tuplets, ties
5. Shared leaderboard (needs a small hosted database, since GitHub Pages only serves files)
6. Listening modules: Split Sandbox, Auditory Rudiment Quiz, Discrepancy Quiz (done)
7. Fours, once 32nd notes exist; stacks in the Split Sandbox
