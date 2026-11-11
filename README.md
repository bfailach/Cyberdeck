<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/brand/cyberdeck-wordmark-light.svg">
    <img src="src/assets/brand/cyberdeck-wordmark-dark.svg" alt="cyberdeck" width="420">
  </picture>
</p>

# Cyberdeck — Breach Protocol Training

A desktop practice game for the Breach Protocol hacking minigame from Cyberpunk 2077 (patch 2.0+ rules).
It is a fan-made training tool. It uses original fonts, icons and artwork and is not affiliated with CD PROJEKT RED.

## Play

**Play in your browser:** https://bfailach.github.io/Cyberdeck/ (published automatically from `main` by GitHub Actions).

Or run it locally:

```bash
npm install
npm run dev     # play in the browser at http://localhost:5173
npm run app     # build and open the desktop window (Electron)
npm test        # engine tests
```

## Rules (patch 2.0+)
- Your first pick must come from the **top row**. After that, picks alternate between the **column** and the **row** of your last pick.
- Each pick adds its code to the **buffer**. A daemon uploads when its whole sequence appears in the buffer as consecutive codes.
- A daemon fails once it can no longer fit in the remaining buffer slots.
- The timer runs as soon as the breach opens. Settings can switch it to the patch 2.0 behaviour, where it waits for your first pick.

## Controls
| Key | Action |
|---|---|
| Arrows / WASD | Move along the active row or column |
| Enter / F / Space | Select code |
| 1 / 2 / 3 | Hint / Undo / Freeze timer (each use costs 10% of the score) |
| Esc | Close the breach (counts as a fail) / back to menu |
| R / N | Retry the same puzzle / new puzzle (result screen) |
| M | Sound on/off |
| 1–3 (assists), R (refund perks) | see the on-screen prompts |
| F11 | Fullscreen (desktop app) |

Mouse works too: hover to preview, click to select.

## Scoring
| Item | Points |
|---|---|
| DATAMINE_V1 / V2 / V3 / ICEPICK | 100 / 200 / 300 / 300, +50 for each code beyond 3 |
| Time left | 5 per second |
| Unused buffer slots | 50 each |
| All daemons uploaded | +250 |
| Matching the optimal path length | +150 |
| Each assist used | −10% of the total |

Stars: ★ at least one daemon, ★★ all daemons, ★★★ all daemons on the optimal path with no assists.
Uploading every daemon unlocks the next level.

## Menus
Main menu: **Continue** (your highest unlocked level), **Select level**, **Skill tree**, **Settings** (music and effects volume, soundtrack, your own music file, timer mode, reset progress), **Credits** and **Quit** (desktop app only).

## Progression and skill tree
**XP** is the sum of your best score on every level, so replaying a level only adds XP when you beat your own best; there is nothing to farm.
XP raises your **Netrunner level**, and every level-up gives **1 perk point**. Each level needs more XP than the last
(cumulative XP for level *n* = 600·(n−1) + 10·(n−1)²): about 8 points after your first five levels, about 40 at full mastery.

Each branch is a **chain**: a perk needs the one before it, a minimum Netrunner level, and capstones also need stars.
The whole tree costs 69 points, more than a normal run earns, so you choose a build. Press **R** to refund everything.

| Branch | Chain (cost per tier · requirement) |
|---|---|
| Breach | Extended Uplink +5/+10/+15 s (2/3/4) → Overclocked Uplink, time bonus ×1.5 (3 · LV 6) → Buffer Expansion +1/+2 slots (4/6 · LV 12) → **Time Dilation**, timer 20% slower (7 · LV 24, 36★) |
| Daemons | Datamine Mastery +10/20/30% (2/3/4) → Sequence Scanner (3 · LV 5) → Clean Execution, optimal bonus 300 (3 · LV 10) → **Daemon Overload**, all-daemons bonus 500 (7 · LV 22, 36★) |
| Assists | Hint Cache +1/+2 (1/2) → Rollback Buffer +1/+2 undos (2/3 · LV 3) → Cryo Loop +1 freeze, 8 s (2/3 · LV 8) → **Light Touch**, assists cost 5% (5 · LV 18, 24★) |

## Music and sound
"Black ICE" is an original dark industrial track written for this game (148 BPM, E Phrygian: distorted kick, reese bass, industrial clanks, low "braam" hits and palm-muted power-chord chugs). It is generated live in code (WebAudio), so there are no audio files and no licensing to worry about. It is muffled in the menus and opens up fully during a breach.
Sound effects (clicks, data sweeps, glitches, thumps) are synthesized the same way, in `src/ui/sfx.js`.

**Using your own track:** Settings → *Load music file* lets you pick an audio file from your computer (for example a track from the official Cyberpunk 2077 soundtrack you own). The file stays on your machine (browser storage) and is never added to this repository. Switch between it and Black ICE with *Soundtrack*. The Credits screen credits the track; "The Rebel Path" is recognized automatically (P.T. Adamczyk, Cyberpunk 2077 Original Score, © CD PROJEKT S.A.).

## Levels
20 levels. Difficulty rises in four ways: the matrix grows (5×5 → 6×6 → 7×7), the timer and buffer slack shrink, daemons get longer and more numerous, and fewer assists are available.
Every puzzle is generated so that all daemons can be uploaded. A solver checks each one and records the shortest solution.

## Project layout
```
src/engine/   rules, generator, solver, scoring, perks, level curve (pure JS, tested with node --test)
src/ui/       styles, sound effects and the soundtrack sequencer (music.js)
src/main.js   screens, input, game loop
src/assets/brand/  logo (wordmark for dark/light backgrounds) and app icon, as SVG
electron/     desktop window
build/        app icons for the desktop build (icon.png, icon.ico, icon.icns)
docs/         repository social preview image
```

## Roadmap
- More daemons and perk effects
- Windows/macOS/Linux installers (electron-builder)
