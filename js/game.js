// Pure game logic for Mythic Survivor — no I/O, fully unit-testable.
//
// Rules:
// - 2..8 players per room. Everyone picks an action each round, secretly.
// - Actions: charge (+1 charge, max 3), shield (free, blocks every attack
//   aimed at you this round), attack (spend 1 charge, pick a target).
// - Players start with 0 charges, so round 1 is always charge/shield only —
//   no one can attack until they've charged at least once. Resolution is
//   simultaneous: an attacker who dies this round still lands their own
//   attack.
// - Last MORTAL alive wins. If the final mortals take each other out in the
//   same round, nobody wins.
// - The dead get one chance per death to rise again as a Wraith: answer a
//   gauntlet of 3–10 random trivia questions (all correct). Wraiths play
//   with full actions but can never win — the game ends as soon as at most
//   one mortal remains, and a wraith standing alone means no winner.

export const MAX_PLAYERS = 8;
export const MAX_CHARGES = 3;
export const START_CHARGES = 0;
// How long a lobby stays open for joins.
export const JOIN_WINDOW_MS = 60 * 60 * 1000;

// Creatures from Philippine folklore; SVGs in creatures/
// (game-icons.net, CC BY 3.0)
export const CREATURES = [
  { id: "bakunawa", name: "Bakunawa" }, // moon-eating serpent-dragon
  { id: "tikbalang", name: "Tikbalang" }, // horse-headed trickster
  { id: "valentina", name: "Valentina" }, // serpent queen
  { id: "aswang", name: "Aswang" }, // shapeshifter
  { id: "mulawin", name: "Mulawin" }, // noble bird-warrior
  { id: "sirena", name: "Sirena" }, // mermaid
  { id: "saruman", name: "Saruman" }, // one-eyed grinning giant
  { id: "bul-bul", name: "Bul-bul" }, // jewel-bearing bull creature
];

export function createRoom(code) {
  return {
    code,
    phase: "lobby", // lobby | playing | over
    round: 0,
    hostId: null,
    players: [], // join order preserved
    winnerId: null,
    lastRound: null, // summary of the most recent resolved round
    lobbyDeadline: Date.now() + JOIN_WINDOW_MS, // joins close when this passes
    touchedAt: Date.now(),
  };
}

export function lobbyExpired(room) {
  return room.phase === "lobby" && room.lobbyDeadline !== null && Date.now() > room.lobbyDeadline;
}

export function getPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId) || null;
}

export function alivePlayers(room) {
  return room.players.filter((p) => p.alive);
}

// Only mortals count for the win condition; wraiths are the walking dead.
export function aliveMortals(room) {
  return room.players.filter((p) => p.alive && !p.wraith);
}

// creatureId is an optional preference (picked on the join screen); if it's
// invalid or already taken the player gets the first free beast instead.
export function addPlayer(room, playerId, name, creatureId, resumeToken = null) {
  if (room.phase !== "lobby") return { error: "Game already in progress" };
  if (lobbyExpired(room)) return { error: "This lobby has expired — create a new room" };
  if (room.players.length >= MAX_PLAYERS) return { error: "Room is full (8 players max)" };
  const trimmed = String(name || "").trim().slice(0, 20);
  if (!trimmed) return { error: "Name is required" };
  if (room.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    return { error: "That name is already taken in this room" };
  }
  const used = new Set(room.players.map((p) => p.creature));
  const wanted = CREATURES.find((c) => c.id === creatureId && !used.has(c.id));
  const creature = wanted || CREATURES.find((c) => !used.has(c.id));
  const player = {
    id: playerId,
    name: trimmed,
    creature: creature.id,
    creatureName: creature.name,
    alive: true,
    charges: START_CHARGES,
    action: null,
    wraith: false,
    canRevive: false, // set on elimination; one trivia chance per death
    quiz: null, // active trivia challenge, host-side only
    connected: true,
    resumeToken: resumeToken || null,
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = playerId;
  return { player };
}

export function rejoinPlayer(room, playerId, resumeToken) {
  if (!resumeToken) return { error: "No saved seat found" };
  const player = room.players.find((p) => p.resumeToken === resumeToken);
  if (!player) return { error: "No saved seat found" };
  const previousId = player.id;
  player.id = playerId;
  for (const other of room.players) {
    if (other.action?.targetId === previousId) other.action.targetId = playerId;
  }
  if (room.hostId === previousId) room.hostId = playerId;
  player.connected = true;
  player.left = false;
  return { player };
}

export function renamePlayer(room, playerId, name) {
  const player = getPlayer(room, playerId);
  if (!player) return { error: "You are not in this room" };
  const trimmed = String(name || "").trim().slice(0, 20);
  if (!trimmed) return { error: "Name is required" };
  if (room.players.some((p) => p.id !== playerId && p.name.toLowerCase() === trimmed.toLowerCase())) {
    return { error: "That name is already taken in this room" };
  }
  player.name = trimmed;
  return {};
}

// Beast can only change between games so mid-round identities stay stable.
export function chooseCreature(room, playerId, creatureId) {
  if (room.phase !== "lobby") return { error: "Beasts can only be changed in the lobby" };
  const player = getPlayer(room, playerId);
  if (!player) return { error: "You are not in this room" };
  const creature = CREATURES.find((c) => c.id === creatureId);
  if (!creature) return { error: "Unknown beast" };
  if (room.players.some((p) => p.id !== playerId && p.creature === creatureId)) {
    return { error: "That beast is already taken" };
  }
  player.creature = creature.id;
  player.creatureName = creature.name;
  return {};
}

// Returns true if the room is now empty and should be deleted.
export function removePlayer(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player) return room.players.length === 0;
  player.connected = false;
  player.left = true;
  return room.players.filter((p) => p.connected).length === 0;
}

export function startGame(room, byId) {
  if (room.phase === "playing") return { error: "Game already started" };
  if (byId !== room.hostId) return { error: "Only the host can start the game" };
  const connectedPlayers = room.players.filter((p) => p.connected);
  if (connectedPlayers.length < 2) return { error: "Need at least 2 connected players" };
  room.players = connectedPlayers;
  for (const p of room.players) {
    p.alive = true;
    p.charges = START_CHARGES;
    p.action = null;
    p.wraith = false;
    p.canRevive = false;
    p.quiz = null;
  }
  room.phase = "playing";
  room.round = 1;
  room.winnerId = null;
  room.lastRound = null;
  room.lobbyDeadline = null; // the game started; no join window to enforce
  return {};
}

// "Play again" from the over screen: back to lobby, same seats.
export function resetToLobby(room, byId) {
  if (byId !== room.hostId) return { error: "Only the host can reset the room" };
  if (room.phase !== "over") return { error: "Game is not over" };
  room.players = room.players.filter((p) => p.connected);
  room.phase = "lobby";
  room.round = 0;
  room.winnerId = null;
  room.lastRound = null;
  room.lobbyDeadline = Date.now() + JOIN_WINDOW_MS; // fresh join window
  for (const p of room.players) {
    p.alive = true;
    p.charges = START_CHARGES;
    p.action = null;
    p.wraith = false;
    p.canRevive = false;
    p.quiz = null;
  }
  return {};
}

// action: { type: 'charge'|'shield'|'attack', targetId? }
// Players may change their action until the whole round is in.
export function submitAction(room, playerId, action) {
  if (room.phase !== "playing") return { error: "Game is not in progress" };
  const player = getPlayer(room, playerId);
  if (!player) return { error: "You are not in this game" };
  if (!player.alive) return { error: "You have been eliminated" };

  const type = action && action.type;
  if (type === "charge") {
    if (player.charges >= MAX_CHARGES) return { error: `Already at max charges (${MAX_CHARGES})` };
    player.action = { type };
  } else if (type === "shield") {
    player.action = { type };
  } else if (type === "attack") {
    // No minimum charge to declare an attack — a 0-charge attack is legal,
    // it just resolves as a dud (see resolveRound).
    const target = getPlayer(room, action.targetId);
    if (!target || !target.alive) return { error: "Pick a living target" };
    if (target.id === playerId) return { error: "You cannot attack yourself" };
    player.action = { type, targetId: target.id };
  } else {
    return { error: "Unknown action" };
  }
  return { done: allActionsIn(room) };
}

export function allActionsIn(room) {
  const alive = alivePlayers(room);
  const connected = alive.filter((p) => p.connected);
  if (connected.length > 0) return connected.every((p) => p.action !== null);
  return alive.length > 0 && alive.every((p) => p.action !== null);
}

// Resolve one round simultaneously. Call only when allActionsIn(room).
// Returns the round summary (also stored on room.lastRound).
//
// A direct mutual attack — X attacks Y and Y attacks X in the same round —
// cancels out: neither lands, as if the blows collided. Both attackers still
// spend their charge; only the elimination is called off. This does not
// extend to longer cycles (X→Y, Y→Z, Z→X all resolve normally) — only a
// literal pair attacking each other cancels.
//
// An attack declared with 0 charges is legal but a dud: no charge to spend
// (there's none), no hit, and — because nothing real was thrown — it can't
// cancel an incoming attack either. An attack aimed at a dud attacker lands
// exactly as if that dud attacker had shielded-or-not normally; it is only
// the *dud's own* strike that fizzles.
export function resolveRound(room) {
  const actors = alivePlayers(room);
  // An offline player who has not submitted defaults to charging. This lets
  // connected players finish the simultaneous round without granting the
  // missing seat an automatic shield or destroying its rejoinable identity.
  for (const p of actors) {
    if (!p.connected && p.action === null) p.action = { type: "charge" };
  }
  const shielded = new Set(
    actors.filter((p) => p.action.type === "shield").map((p) => p.id)
  );

  // Snapshot dud/real status for every attack *before* any charges are
  // spent — otherwise decrementing an attacker's own charge while resolving
  // them would make them look like a dud by the time their opponent's
  // mutual-attack check runs against them.
  const isDudAttack = new Map();
  for (const p of actors) {
    if (p.action.type === "attack") isDudAttack.set(p.id, p.charges < 1);
  }

  function isMutualAttack(p) {
    if (isDudAttack.get(p.id)) return false;
    const target = getPlayer(room, p.action.targetId);
    return (
      !!target &&
      !!target.action &&
      target.action.type === "attack" &&
      target.action.targetId === p.id &&
      !isDudAttack.get(target.id)
    );
  }

  const hit = new Set();
  const canceled = new Set();
  const dud = new Set();
  for (const p of actors) {
    const a = p.action;
    if (a.type === "charge") {
      p.charges = Math.min(MAX_CHARGES, p.charges + 1);
    } else if (a.type === "attack") {
      if (isDudAttack.get(p.id)) {
        dud.add(p.id); // no charge to spend, no hit, no cancel — a no-op
        continue;
      }
      p.charges -= 1;
      if (isMutualAttack(p)) {
        canceled.add(p.id);
      } else if (!shielded.has(a.targetId)) {
        hit.add(a.targetId);
      }
    }
  }

  const summary = {
    round: room.round,
    moves: actors.map((p) => ({
      id: p.id,
      name: p.name,
      creature: p.creature,
      wraith: p.wraith,
      action: p.action.type,
      targetId: p.action.targetId || null,
      targetName: p.action.targetId ? getPlayer(room, p.action.targetId).name : null,
      eliminated: hit.has(p.id),
      canceled: canceled.has(p.id),
      dud: dud.has(p.id),
    })),
  };

  for (const id of hit) {
    const p = getPlayer(room, id);
    p.alive = false;
    p.canRevive = true; // one trivia chance per death — wraiths included
    p.quiz = null;
  }
  for (const p of actors) p.action = null;

  // Wraiths can't win: the battle ends once at most one mortal remains.
  const mortals = aliveMortals(room);
  if (mortals.length <= 1) {
    room.phase = "over";
    room.winnerId = mortals.length === 1 ? mortals[0].id : null;
  } else {
    room.round += 1;
  }
  room.lastRound = summary;
  return summary;
}

// ---------- Wraith trivia ----------
// A dead player may face the spirits: answer every question in a gauntlet of
// QUIZ_MIN..QUIZ_MAX random trivia questions to rise again as a Wraith. One
// wrong answer burns the chance for this death.
export const QUIZ_MIN = 3;
export const QUIZ_MAX = 10;

function serveQuestion(player, pool, rng) {
  const entry = pool[player.quiz.questions[player.quiz.pos]];
  const choices = [entry.a, ...entry.d]
    .map((c) => [rng(), c])
    .sort((x, y) => x[0] - y[0])
    .map(([, c]) => c);
  player.quiz.correctChoice = choices.indexOf(entry.a);
  return {
    q: entry.q,
    choices,
    number: player.quiz.pos + 1,
    total: player.quiz.questions.length,
  };
}

export function startQuiz(room, playerId, pool, rng = Math.random) {
  if (room.phase !== "playing") return { error: "The battle is not in progress" };
  const player = getPlayer(room, playerId);
  if (!player) return { error: "You are not in this game" };
  if (player.alive) return { error: "Only the dead may face the spirits" };
  if (player.quiz) return { error: "You are already answering the spirits" };
  if (!player.canRevive) return { error: "The spirits have already judged you" };

  const count = QUIZ_MIN + Math.floor(rng() * (QUIZ_MAX - QUIZ_MIN + 1));
  const questions = [];
  const used = new Set();
  while (questions.length < count) {
    const idx = Math.floor(rng() * pool.length);
    if (used.has(idx)) continue;
    used.add(idx);
    questions.push(idx);
  }
  player.quiz = { questions, pos: 0, correctChoice: null };
  return { question: serveQuestion(player, pool, rng) };
}

export function answerQuiz(room, playerId, choice, pool, rng = Math.random) {
  const player = getPlayer(room, playerId);
  if (!player || !player.quiz) return { error: "You have no trivia challenge in progress" };
  if (room.phase !== "playing") {
    player.quiz = null;
    return { error: "The battle has ended" };
  }
  if (player.alive) {
    player.quiz = null;
    return { error: "You are not dead" };
  }

  if (choice !== player.quiz.correctChoice) {
    player.quiz = null;
    player.canRevive = false; // chance burned until the next death
    return { failed: true };
  }

  player.quiz.pos += 1;
  if (player.quiz.pos < player.quiz.questions.length) {
    return { question: serveQuestion(player, pool, rng) };
  }

  // Gauntlet cleared — rise as a Wraith
  player.quiz = null;
  player.canRevive = false;
  player.alive = true;
  player.wraith = true;
  player.charges = START_CHARGES;
  player.action = null;
  return { revived: true };
}

// State safe to broadcast, from `viewerId`'s point of view: pending actions
// are never included (only a submitted flag), and charge counts are private
// — a player's own charges are included only in the state built for that
// same player; everyone else's are omitted entirely, not just hidden in the
// UI. Pass no viewerId (or one that matches no player) to get a state with
// every player's charges withheld, e.g. for a spectator view.
export function toPublicState(room, viewerId) {
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    hostId: room.hostId,
    winnerId: room.winnerId,
    lastRound: room.lastRound,
    maxCharges: MAX_CHARGES,
    creatures: CREATURES,
    // Remaining ms, not an absolute time, so client clocks can't skew it
    lobbyMsLeft:
      room.phase === "lobby" && room.lobbyDeadline !== null
        ? Math.max(0, room.lobbyDeadline - Date.now())
        : null,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      creature: p.creature,
      creatureName: p.creatureName,
      alive: p.alive,
      left: !!p.left,
      connected: p.connected,
      charges: p.id === viewerId ? p.charges : undefined,
      submitted: p.action !== null,
      wraith: p.wraith,
      canRevive: p.canRevive,
      quizzing: p.quiz !== null,
    })),
  };
}
