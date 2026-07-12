# Plan: Mythic Survivor — Peer-to-Peer Conversion

**Spec**: [spec.md](./spec.md)

## Architecture

Vanilla ES2020 modules, no build step, no framework — the repo IS the
deployable artifact for GitHub Pages, same convention as the sibling games.

```
index.html            screens (home, lobby, game) — ported from public/index.html
css/style.css          ported from public/style.css, unchanged (no server refs in it)
js/game.js              pure rules engine — ported from game.js, ESM, no I/O
js/trivia.js             1000-question pool as plain data (ESM), was trivia.json
js/storage.js            localStorage: last-used name + creature
js/room.js               PeerJS room wrapper — NEW shape, see below
js/main.js               DOM wiring + host-side room-authority logic
vendor/peerjs.min.js     vendored PeerJS client (copied from word-scramble)
creatures/*.svg          unchanged
tests/game.test.mjs      ported from game.test.js, ESM
tools/gen-trivia.js      unchanged generator, now writes js/trivia.js
.github/workflows/deploy.yml   test job → GitHub Pages deploy job
```

Removed entirely: `server.js`, `Dockerfile`, `.dockerignore`,
`package.json`/`package-lock.json`/`node_modules` (Express + Socket.IO
deps), `trivia.json` (superseded by `js/trivia.js`), `public/` (contents
moved to repo root).

### Networking model — per-player peers, not Host+Display

This is the one place this project's networking shape genuinely differs
from every sibling game, because every player (not just one Host) has
private state and sends actions. `js/room.js` therefore exports a
different pair of functions than the Host+Display siblings:

- `hostRoom({ onMessage, onPeerClose })` — creates the PeerJS ID
  `survivor-room-<CODE>`. For each incoming connection, assigns that
  connection's PeerJS `conn.peer` as the player id (stable per connection,
  globally unique — the direct replacement for Socket.IO's `socket.id`).
  Incoming `{ t, reqId, payload }` messages are handed to `onMessage(playerId,
  t, payload)`; the caller (`main.js`) runs the matching `game.js` function
  and calls back `reply(playerId, reqId, result)` for a targeted ack, plus
  `broadcast(state)` to push a full snapshot to every connection. This is
  structurally `server.js`'s per-event handlers, replayed over PeerJS
  instead of Socket.IO — see Decisions #3.
- `joinRoom(code, { onState, onClose })` — connects to the Host's PeerJS id
  and returns `send(t, payload)` (returns a Promise, resolved when the
  matching `{ reqId }` ack arrives — a small RPC shim replacing Socket.IO's
  per-emit callback) plus `close()`.
- The Host device runs **both** roles at once: `main.js` detects
  `isHost` and calls the same `game.js` functions directly (in-process,
  no network hop) instead of going through `room.js`'s `send()`, then
  broadcasts the resulting state to everyone else exactly as a remote
  action would. There's no Socket.IO-style "server process" distinct from
  a "client tab" anymore — the Host's browser tab is both.
- Distinct PeerJS ID prefix `survivor-room-` so rooms never collide with
  the sibling games' rooms on the shared public broker.

### Redaction — unchanged in shape, changed in guarantee

`toPublicState` and `serveQuestion` already exclude pending action
types/targets and trivia correct-answer indexes from every payload sent to
non-Host clients — that logic ports over untouched. What changes is *whose
process* holds the un-redacted room object: previously a neutral Node
process; now the Host player's own browser tab. See Decisions #1.

## Decisions

1. **Host-player trust trade-off, explicitly accepted.** In the server
   build, no player — including the room creator — could see another
   player's pending move or a trivia answer before it was supposed to be
   revealed, because the authoritative state lived on a neutral server.
   After this conversion, the Host's browser tab holds that same
   unredacted state (other players' locked-in moves before reveal, trivia
   correct-answer indexes) for as long as the room is open. A technically
   curious Host could open devtools and read it early. Confirmed with the
   project owner before starting this migration (2026-07-12): treat this
   like a physical game host holding the deck — honor-system trust, the
   same trade-off every Host+Display sibling game already makes for its
   Host role, just extended here because the Host is also a player. Not
   mitigated further (e.g. no attempt at client-side obfuscation of
   `trivia.js`'s answers) because obfuscation of data the browser must
   still execute is not real protection and would only cost complexity.
2. **No Host migration / room dies with the Host, accepted as a new
   limitation.** The server build tolerated any single player disconnecting,
   including reassigning `hostId` to the next player for *game-state
   purposes* (who can click Start/Play Again). In this build, the Host is
   also the sole network relay — if the Host's tab closes, every other
   player's PeerJS connection drops with it and the room cannot continue,
   even though `game.js`'s `removePlayer` still reassigns `hostId` for
   in-game bookkeeping. Building Host migration (promoting another peer to
   relay and having everyone reconnect to them) is real distributed-systems
   work with its own failure modes; deferred rather than built speculatively
   for a casual party game (see tasks.md Open backlog).
3. **`main.js` inlines what `server.js` used to do, rather than a separate
   "server module".** Since the Host's tab must run the same per-event
   logic `server.js` ran (validate → mutate via `game.js` → broadcast),
   duplicating that as a distinct module the Host "spawns" would be a
   distinction without a difference in a single-tab browser context.
   `main.js` branches on `isHost` at the call site instead.
4. **Trivia ships as a plain data module, not fetched JSON.** Matches the
   sibling convention (`js/words.js`, `js/categories.js`) of content as an
   ES module import rather than a runtime `fetch()` — one less network
   round-trip, and consistent with "content as data" from the skill.
   `tools/gen-trivia.js` is updated to emit `js/trivia.js` directly instead
   of `trivia.json`; the question-generation logic itself is untouched.
5. **Cloud Run deployment removed, not kept as a fallback.** Confirmed with
   the project owner (2026-07-12): once the GitHub Pages build is verified
   working, `server.js`, `Dockerfile`, and the npm server dependencies are
   deleted rather than kept side-by-side, so there's exactly one deployment
   target going forward, matching every sibling game.
6. **Charge counts need per-viewer redaction, not a single broadcast
   payload (v2).** Every other push in this game (`chat`, `emote`,
   `roundResult`, `roomClosed`, and `state` before v2) is identical for
   every recipient, so `room.js`'s original `broadcast(event, payload)` —
   one JSON string, sent to every connection — was sufficient. Hiding
   charges from everyone but their owner breaks that: the `state` push now
   differs per recipient (each player's own charges included, everyone
   else's omitted). Rather than bolt viewer-awareness onto `game.js` (which
   must stay side-effect-free and shouldn't know about connections) or onto
   `broadcast` (which would force every other event through the same
   per-recipient path for no reason), `room.js` gained a second primitive,
   `broadcastEach(event, payloadFor)`, used only for `state`; every other
   event still uses the original uniform `broadcast`. `toPublicState(room,
   viewerId)` takes the viewer as a parameter and returns that viewer's
   redacted view — called once per connection by `broadcastEach`, and once
   directly (no network hop) for the Host's own view.
7. **Attack-vs-attack cancellation is a literal-pair check, not a general
   cycle-breaker (v2).** Detecting "X attacked someone who attacked X back"
   only requires checking each attacker's declared target's own action —
   O(actors) work, no graph traversal. A longer cycle (X→Y→Z→X) still
   resolves as three separate ordinary hits; deliberately not treated as
   "everyone cancels," since that would take real cycle-detection for a
   mechanic nobody asked for.

## Changelog

- **v1** (2026-07-12): Converted from Socket.IO/Express/Cloud Run to
  static PeerJS/GitHub Pages. No gameplay changes. SDD docs added
  retroactively for this migration (the original game was built without
  them).
- **v2** (2026-07-12): Three rule/UX changes, all requested directly (no
  Step-0 re-ask, since these are small deltas on an already-shipped game):
  removed the starting charge (`START_CHARGES` 1 → 0, so round 1 is
  charge/shield only); a direct mutual attack now cancels instead of
  eliminating both players (Decision #7); and charge counts are now
  private — hidden from the UI *and* redacted at the network level so a
  non-owning player's client never receives them (Decision #6), matching
  this project's existing "redact at the network level, not just the UI"
  convention for the trivia gauntlet.
