// Pure game logic for Mythic Survivor — no I/O, fully unit-testable.
//
// Rules:
// - 2..8 players per room. Everyone picks an action each round, secretly.
// - Actions: charge (+1 charge, max 3), shield (free, blocks every attack
//   aimed at you this round), attack (spend 1 charge, pick a target).
// - Players start with 1 charge. Resolution is simultaneous: an attacker who
//   dies this round still lands their own attack.
// - Last MORTAL alive wins. If the final mortals take each other out in the
//   same round, nobody wins.
// - The dead get one chance per death to rise again as a Wraith: answer a
//   gauntlet of 3–10 random trivia questions (all correct). Wraiths play
//   with full actions but can never win — the game ends as soon as at most
//   one mortal remains, and a wraith standing alone means no winner.

export const MAX_PLAYERS = 8;
export const MAX_CHARGES = 3;
export const START_CHARGES = 1;
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
export function addPlayer(room, playerId, name, creatureId) {
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
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = playerId;
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
  if (room.phase === "lobby" || room.phase === "over") {
    room.players = room.players.filter((p) => p.id !== playerId);
  } else {
    // Mid-game: leaving means elimination, seat stays visible on the board
    player.alive = false;
    player.action = null;
    player.left = true;
  }
  if (room.hostId === playerId) {
    const next = room.players.find((p) => !p.left);
    room.hostId = next ? next.id : null;
  }
  return room.players.filter((p) => !p.left).length === 0;
}

export function startGame(room, byId) {
  if (room.phase === "playing") return { error: "Game already started" };
  if (byId !== room.hostId) return { error: "Only the host can start the game" };
  if (room.players.length < 2) return { error: "Need at least 2 players" };
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
    if (player.charges < 1) return { error: "Attacking needs a charge" };
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
  return alive.length > 0 && alive.every((p) => p.action !== null);
}

// Resolve one round simultaneously. Call only when allActionsIn(room).
// Returns the round summary (also stored on room.lastRound).
export function resolveRound(room) {
  const actors = alivePlayers(room);
  const shielded = new Set(
    actors.filter((p) => p.action.type === "shield").map((p) => p.id)
  );

  const hit = new Set();
  for (const p of actors) {
    const a = p.action;
    if (a.type === "charge") {
      p.charges = Math.min(MAX_CHARGES, p.charges + 1);
    } else if (a.type === "attack") {
      p.charges -= 1;
      if (!shielded.has(a.targetId)) hit.add(a.targetId);
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
      charges: p.charges,
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

// State safe to broadcast: everyone's charges are public, pending actions are
// not (only a submitted flag).
export function toPublicState(room) {
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
      charges: p.charges,
      submitted: p.action !== null,
      wraith: p.wraith,
      canRevive: p.canRevive,
      quizzing: p.quiz !== null,
    })),
  };
}
