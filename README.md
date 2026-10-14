# KMR Snake

Neon snake for Meta Ray-Ban Display glasses and the Meta Neural Band.

- **Swipe** to turn, **pinch** to pause.
- Three modes, each with its own global leaderboard: **Classic** (walls are deadly), **Portal** (go through the edges) and **Maze** (walls inside the board).
- Every 10 fruit raises the score multiplier. Gold stars are worth 5× and grow you by two.
- Earn coins every run (plus a daily bonus) and spend them on 12 skins. 4 more are earned: score 300, eat 50 fruit in one run, play 25 games, score 400 in Maze.
- Uses the same player name as KMR Casino on the same glasses.

Play: https://webmanagments.github.io/kmr-snake/

## Develop

```
npm install
npm run dev        # http://localhost:5173
npm run build      # builds into docs/ (served by GitHub Pages)
```

The leaderboards live in the KMR Casino Firebase database under `arcade/` (rules in the kmr repo's `firebase-rules.json`).
