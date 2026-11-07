# Cyberdeck — Breach Protocol Training

A desktop practice game for the Breach Protocol hacking minigame from Cyberpunk 2077 (patch 2.0+ rules).
It is a fan-made training tool. It uses original fonts, icons and artwork and is not affiliated with CD PROJEKT RED.

## Play

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
- The timer starts with your first pick.

## Controls
| Key | Action |
|---|---|
| Arrows / WASD | Move along the active row or column |
| Enter / F / Space | Select code |
| 1 / 2 / 3 | Hint / Undo / Freeze timer (each use costs 10% of the score) |
| Esc | Close the breach (counts as a fail) / back to menu |
| R / N | Retry the same puzzle / new puzzle (result screen) |
| M | Sound on/off |
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

## Levels
20 levels. Difficulty rises in four ways: the matrix grows (5×5 → 6×6 → 7×7), the timer and buffer slack shrink, daemons get longer and more numerous, and fewer assists are available.
Every puzzle is generated so that all daemons can be uploaded. A solver checks each one and records the shortest solution.

## Project layout
```
src/engine/   rules, generator, solver, scoring, level curve (pure JS, tested with node --test)
src/ui/       styles and synthesized audio
src/main.js   screens, input, game loop
electron/     desktop window
```

## Roadmap
- Netrunner skill tree (earn points from scores and spend them on perks)
- More daemons and perk effects
- Windows/macOS/Linux installers (electron-builder)
