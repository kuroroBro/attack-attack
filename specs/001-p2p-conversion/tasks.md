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
- [x] `git init`, first commit, GitHub remote created
      (`kuroroBro/attack-attack`), pushed, Pages enabled, live URL verified
      serving the current build (`https://kuroroBro.github.io/attack-attack/`).

## Phase 7 — Rule changes: no starting charge, mutual-attack cancel, private charges (post-launch addition)
- [x] `js/game.js`: `START_CHARGES` 1 → 0 (round 1 is charge/shield only).
- [x] `js/game.js`: `resolveRound` — a direct mutual attack (X↔Y target each
      other) cancels instead of eliminating both; charge is still spent.
      Added a `canceled` flag per move in the round summary; dropped the
      unused `charges` field from round-summary moves (it would have leaked
      post-round charges to every viewer — see next item).
- [x] `js/game.js`: `toPublicState(room, viewerId)` — charges included only
      for the matching player, `undefined` (dropped by `JSON.stringify`)
      for everyone else.
- [x] `js/room.js`: added `broadcastEach(event, payloadFor)` alongside the
      existing uniform `broadcast`, for pushes that must differ per
      recipient (currently only `state`).
- [x] `js/main.js`: `broadcastState()` uses `broadcastEach` for remote
      peers and calls `toPublicState(room, myId)` directly for the Host's
      own view; removed the charge-pip UI (`pips()` + its CSS) and the
      exact charge count from the action-hint text; round log shows
      "blows collided, no one falls" for a canceled mutual attack.
- [x] `index.html` / `README.md`: updated rules copy for 0 starting
      charges, mutual-attack cancellation, and private charges.
- [x] `tests/game.test.mjs`: updated every test that assumed 1 starting
      charge (added explicit `.charges = 1` setup where a test needs an
      immediate attack); replaced the old "mutual attacks eliminate both"
      test with cancellation tests (a direct pair, and a 3-cycle that does
      *not* cancel); rewrote the charge-redaction test for the new
      per-viewer `toPublicState` signature. 26/26 passing.
- [x] Playwright playtest against the local build: confirmed zero `.pip`
      elements render, the Attack button is disabled at round 1, the
      action-hint contains no digit, and a live mutual attack between two
      real tabs produces "blows collided" on both logs with neither player
      marked dead.

## Phase 8 — Attacking with 0 charges is a dud, not blocked (post-launch addition)
- [x] `js/game.js`: `submitAction` no longer errors on a 0-charge attack —
      only target validity (alive, not self) is checked at declare time.
- [x] `js/game.js`: `resolveRound` snapshots dud/real status per attacker
      before spending any charges (`isDudAttack` map), then uses that
      snapshot both for the attacker's own outcome (no charge spent, no
      hit) and for `isMutualAttack` (a dud can neither cause nor be
      canceled-into a mutual cancellation — a real attack lands on a dud
      attacker exactly like any other unshielded target). Added a `dud`
      flag per move in the round summary.
- [x] `js/main.js`: removed the `act-attack` disabled-at-0-charges gate;
      round log shows "no charge, the strike fizzles" for a dud move.
- [x] `index.html` / `README.md`: rules copy updated.
- [x] `tests/game.test.mjs`: replaced the old "attack requires a charge"
      error-case test with one confirming a 0-charge attack is accepted;
      added dedicated dud-resolution tests (a lone dud does nothing; a
      dud does not cancel a real attack landing on it). Caught and fixed
      a real bug during this (plan.md Decision #8) where dud status was
      being read from already-mutated charges instead of a pre-round
      snapshot. 28/28 passing.
- [x] Playwright playtest against two live tabs: confirmed the Attack
      button is enabled at round 1, a dud attack produces no elimination
      and the "fizzles" log line, and — in a dud-vs-real exchange — the
      real attacker's strike still eliminates the dud-throwing player.

## Phase 9 — Private player rejoin (post-launch addition)
- [x] Persist a random per-room token and player name in localStorage, and
      automatically rejoin saved seats when their room URL is reloaded.
- [x] Rebind the existing player record to the new PeerJS id while preserving
      alive/eliminated, mortal/Wraith, charges, trivia, and locked-action state.
- [x] Mark disconnected seats offline without eliminating them; ignore offline
      missing actions for readiness and resolve them as Charge.
- [x] Exclude private tokens from public state; remove offline seats when a new
      game or rematch lobby begins.
- [x] Add rules/storage coverage and update README, spec, and plan.

## Open backlog (intentionally deferred)

- Host migration on Host disconnect (plan.md Decision #2) — the room
  currently cannot survive the Host's tab closing. Promoting another peer
  to relay and having the rest reconnect is real follow-up work, not
  bundled into this migration.
