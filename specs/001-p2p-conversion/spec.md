# Feature Specification: Mythic Survivor — Peer-to-Peer Conversion

**Feature branch**: `001-p2p-conversion`
**Status**: Draft
**Created**: 2026-07-12

## Overview

Mythic Survivor is an existing real-time elimination game for 2–8 players
(charge/shield/attack, Philippine-folklore creature skin, Wraith trivia
revival). It currently ships as a Socket.IO + Express server deployed to
Cloud Run, with rooms held in server memory. This feature converts it to a
static, serverless build — vanilla JS, no build step, peer-to-peer over
PeerJS/WebRTC — so it can be hosted on GitHub Pages like the sibling games
(`timed-wordy`, `icon-guess-the-word`, `word-scramble`). The game rules
themselves are unchanged; this is an architecture migration.

Unlike the Host+Display sibling games, every player here is a full
participant with private information (their own pending move; a personal
trivia gauntlet on death) — there is no separate "shared screen" role. One
player's device becomes the authoritative Host for the room; every player,
including the Host, plays from their own device.

## User Stories

### US-1: Create or join a room
As a player, I want to create a room or join one with a 4-character code, so
my group can play together from our own phones.

**Acceptance criteria**
- Creating a room picks a free room code and opens a lobby; the creator is
  the Host and first player.
- Joining requires a name (unique in the room, 1–20 chars) and enters the
  same lobby. An optional beast preference is honored if free, otherwise the
  first free beast is assigned.
- Up to 8 players per room. The lobby closes to new joins 60 minutes after
  creation (unchanged from the existing game); if the game hasn't started by
  then, the room closes and everyone returns home.
- If the room code doesn't resolve to a reachable Host peer, joining fails
  with a plain-language error.

### US-2: Lobby customization
As a player in the lobby, I want to rename myself and pick my beast, so I
can find myself on the board and get the creature I want.

**Acceptance criteria**
- Renaming and beast selection work identically to the current game: no
  duplicate names, no duplicate beasts, only allowed while `phase === lobby`.
- The Host sees a **Start the battle** button once 2+ players have joined;
  everyone else sees a waiting hint.

### US-3: Play a round
As a player, I want to secretly choose Charge, Shield, or Attack each round
and see all moves resolve at once, so no one can react to what I picked.

**Acceptance criteria**
- Rules are unchanged from the existing game: 1 starting charge, max 3;
  Shield blocks every attack aimed at that player this round; Attack costs 1
  charge and is chosen with a target; simultaneous resolution (a dying
  attacker's own attack still lands).
- Other players' pending action **type** and **target** must never appear on
  the wire before the round resolves — only a `submitted: true/false` flag
  is broadcast mid-round, exactly as today.
- A round resolves the instant every living player has locked in a move.
- Last mortal standing wins; simultaneous last-mortal elimination is a draw
  (a lone surviving Wraith does not win).

### US-4: Wraith revival gauntlet
As an eliminated player, I want one chance per death to answer a trivia
gauntlet and rise as a Wraith, so I'm not just spectating for the rest of
the game.

**Acceptance criteria**
- Unchanged from the existing game: 3–10 random questions (pool of 1000),
  all correct to revive; one wrong answer burns the chance until the next
  death. Wraiths play with full actions but can never win.
- The correct answer for the *current* question is never sent to any client
  before that client submits an answer for it (see plan.md Decisions #1 for
  the P2P-specific trust caveat this inherits).

### US-5: Chat and emotes
As a player, I want lightweight chat and quick emote reactions, so the room
still feels social when we're not all in the same physical space.

**Acceptance criteria**
- Unchanged: free-text chat (200 char cap, basic rate limit) and six preset
  emote reactions that bubble over the sender's card for ~2s.

### US-6: Rematch
As the Host, I want "Play again" to return the whole room to the same lobby
with the same seats, so we can run it back without everyone re-joining.

**Acceptance criteria**
- Unchanged: only the Host can trigger it, only from the `over` phase, and
  it resets to `lobby` with a fresh 60-minute join window.

### US-7: Disconnect handling
As a player, I want the game to keep working sensibly if someone's
connection drops, so one dropped phone doesn't stall the room.

**Acceptance criteria**
- Mid-game disconnect marks that player eliminated (seat stays visible,
  marked "left") rather than removing them, matching current behavior.
- A round can't wait forever on a player who is gone — if a disconnect
  leaves the round's `allActionsIn` check satisfied, resolution proceeds.
- If the Host disconnects, the room cannot continue (see plan.md Decisions
  #2) — this is a new, explicitly accepted limitation vs. the server build.

## Functional Requirements

- **FR-1** Static site only: must run from GitHub Pages (no backend, no
  build step required to serve).
- **FR-2** Game logic stays a pure, testable module (`js/game.js`) with no
  DOM or network code — ported near-verbatim from the existing `game.js`.
- **FR-3** Host-authoritative networking over PeerJS: only the Host mutates
  room state; every other player's client sends intents and renders
  whatever snapshot it last received.
- **FR-4** No secret field is ever broadcast to non-Host clients: pending
  action types/targets before resolution, and trivia correct-answer indexes,
  are excluded from every outbound message exactly as the current
  `toPublicState`/`serveQuestion` already do.
- **FR-5** No ads, no analytics, no tracking, no accounts.

## Non-goals

- No gameplay/rules changes — this is strictly an architecture migration.
- No reconnection/session-resume support (matches the current game: a
  dropped connection means rejoin fresh, there is no "resume as the same
  player" flow either before or after this change).
- No relay/TURN fallback beyond what the public PeerJS broker + browser
  WebRTC already provide — same reachability envelope as the sibling games.
- No attempt to prevent a technically capable Host from inspecting their own
  browser's memory to see secrets early — see plan.md Decisions #1.
