# Tasks: Mythic Survivor — Peer-to-Peer Conversion

## Phase 1 — Rules engine (ported, unchanged behavior)
- [x] Port `game.js` to `js/game.js`: `require`/`module.exports` → ESM
      `import`/`export`, drop `process.env.SURVIVOR_JOIN_WINDOW_MS` (no
      Node env in a static site) in favor of a plain constant.
- [x] Port `game.test.js` to `tests/game.test.mjs`: `require` → ESM
      imports. All existing assertions preserved as-is.
- [x] `node --test tests/game.test.mjs` passes.

## Phase 2 — Content
- [x] Update `tools/gen-trivia.js` to emit `js/trivia.js`
      (`export const TRIVIA = [...]`) instead of `trivia.json`; question
      data and generation logic untouched.
- [x] Regenerate and commit `js/trivia.js`.

## Phase 3 — Settings persistence
- [x] `js/storage.js`: remember last-used name + creature id in
      localStorage, `DEFAULT_SETTINGS` as the single source of defaults.

## Phase 4 — Networking layer
- [x] `js/room.js`: `hostRoom()` / `joinRoom()` per-player-peer shape (see
      plan.md), distinct ID prefix `survivor-room-`.
- [x] Vendor `vendor/peerjs.min.js` (copy from `word-scramble`).

## Phase 5 — UI
- [x] `index.html`: port `public/index.html` to repo root, update script
      tags (vendor peerjs + `type="module"` main.js), no markup/screen
      changes needed.
- [x] `css/style.css`: move `public/style.css` as-is (no server
      references in it).
- [x] `js/main.js`: port `public/app.js`. Replace every `socket.emit(evt,
      payload, cb)` call with either a direct local `game.js` call
      (`isHost` branch) or `room.send(evt, payload)` (non-Host branch);
      replace the single `socket.on('state', ...)` with the Host's own
      post-mutation broadcast render plus non-Host clients' `onState`.
- [x] `creatures/*.svg`: copy unchanged from `public/creatures/`.
- [x] Manual playtest: 2+ browser tabs, full game loop (lobby → round →
      elimination → Wraith trivia → win → rematch) works with one tab as
      Host. Verified with Playwright against the real public PeerJS broker:
      2-player game (create/join/lobby sync/secret simultaneous
      actions/shield blocks attack/win condition) and a 3-player game
      (elimination → revive-btn → Wraith trivia gauntlet, confirmed the
      correct-answer index never appears in the eliminated player's DOM).

## Phase 6 — Deploy
- [x] `.github/workflows/deploy.yml`: test job (`node --test
      tests/game.test.mjs`) gating GitHub Pages deploy of repo root.
- [x] `.nojekyll` at repo root.
- [x] Remove `server.js`, `Dockerfile`, `.dockerignore`, `package.json`,
      `package-lock.json`, `node_modules/`, `trivia.json`, `public/`,
      root-level `game.js`/`game.test.js` (superseded by `js/` + `tests/`).
- [x] Update `README.md`: static/PeerJS architecture, local dev via any
      static file server, GitHub Pages deploy, drop Cloud Run/Docker
      instructions.
- [ ] `git init`, first commit, GitHub remote created, pushed, Pages
      enabled, live URL verified serving the current build. (Needs the
      project owner to confirm the target GitHub repo before this step —
      see chat.)

## Open backlog (intentionally deferred)

- Host migration on Host disconnect (plan.md Decision #2) — the room
  currently cannot survive the Host's tab closing. Promoting another peer
  to relay and having the rest reconnect is real follow-up work, not
  bundled into this migration.
- Reconnect/session-resume for any dropped player (Host or not) — matches
  the pre-existing game's behavior (also absent in the server build), not
  a regression introduced here, but worth reconsidering now that "the
  Host's own connection" is a new single point of failure.
