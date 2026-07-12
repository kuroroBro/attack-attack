# Mythic Survivor

Real-time elimination game for 2–8 players (the classic charge/shield/attack
hand game, with a Philippine-folklore creature skin: Bakunawa, Tikbalang,
Valentina, Aswang, Mulawin, Sirena, Saruman, Bul-bul). Rooms are
link-based — create one, share the code, last creature standing wins. A free,
ad-free, static site — no backend, no build step, peer-to-peer over WebRTC.

## Rules

- Everyone starts with **1 charge** and secretly picks a move each round:
  - **⚡ Charge** — gain a charge (max 3)
  - **🛡 Shield** — free; blocks *every* attack aimed at you this round
  - **⚔ Attack** — spend 1 charge and pick a target; they're eliminated
    unless they shielded
- Moves resolve simultaneously — an attacker who falls still lands their blow.
- The dead get one chance per death to rise as a **Wraith**: answer a random
  gauntlet of 3–10 trivia questions (4 choices each, from a pool of 1000 —
  see `js/trivia.js`, regenerated with `node tools/gen-trivia.js`). All
  correct → they rejoin with full powers, but a Wraith can never win.
- Last **mortal** standing wins — the game ends the moment at most one mortal
  remains. If the last mortals fall together, nobody wins, even a surviving
  Wraith.

A lobby stays open for joins for **60 minutes** (a countdown is shown by the
room code). If the game never starts, the room closes and players are sent
back to the home screen. Starting a game cancels the countdown; each rematch
lobby gets a fresh window.

In the lobby players can rename themselves and pick any free beast. Every
screen has room chat and quick emotes (bubbles pop over the sender's card).
After a game the host's "Play again" returns the whole room to the same
lobby for a rematch.

## Architecture

Vanilla JS, no build step, no framework — the repo IS the deployable
artifact, same convention as the other games in this workspace
(`timed-wordy`, `icon-guess-the-word`, `word-scramble`). See
`specs/001-p2p-conversion/plan.md` for the full architecture writeup,
including the trust-model trade-off below.

- `js/game.js` — pure game logic (rooms, actions, round resolution). No I/O.
- `js/trivia.js` — the 1000-question trivia pool, as data.
- `js/storage.js` — remembers your last-used name and beast.
- `js/room.js` — PeerJS/WebRTC networking. Every player is a full peer
  (unlike the Host+Display sibling games): whoever creates a room becomes
  its authoritative Host, and every other player's client sends intents
  over a data channel and renders whatever state the Host last pushed.
- `js/main.js` — DOM wiring, plus the Host-side event handling that plays
  the role `server.js` used to.
- `tests/game.test.mjs` — unit tests (`node --test tests/game.test.mjs`).
- Creature icons in `creatures/` are by Lorc and Delapouite from
  [game-icons.net](https://game-icons.net) (CC BY 3.0).

**Trust model**: because the Host is also a player (not a neutral server),
the Host's own browser tab holds the same secrets a neutral server used to
— other players' locked-in moves before a round resolves, and trivia
correct-answer indexes. A technically curious Host could inspect their own
browser to see these early. This is treated as an accepted, honor-system
trade-off (like a physical game host holding the deck), not a bug — see
`specs/001-p2p-conversion/plan.md` Decision #1.

**A room dies if the Host's tab closes** — the Host is also the sole
network relay, so there's no Host migration in this version. See plan.md
Decision #2.

## Run locally

Any static file server works, e.g.:

```sh
npx serve .          # or: python3 -m http.server 8080
node --test tests/game.test.mjs
```

## Deploy

Push to `main` — `.github/workflows/deploy.yml` runs the unit tests, then
publishes the repo root to GitHub Pages.
