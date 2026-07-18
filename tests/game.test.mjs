import test from "node:test";
import assert from "node:assert";
import * as g from "../js/game.js";

function roomWith(names) {
  const room = g.createRoom("TEST");
  names.forEach((name, i) => g.addPlayer(room, `p${i + 1}`, name, null, `token-${i + 1}`));
  return room;
}

function startedRoom(names) {
  const room = roomWith(names);
  g.startGame(room, room.hostId);
  return room;
}

test("players join with 0 charges and unique creatures", () => {
  const room = roomWith(["Ana", "Ben", "Cy"]);
  assert.strictEqual(room.players.length, 3);
  assert.ok(room.players.every((p) => p.charges === 0));
  assert.strictEqual(new Set(room.players.map((p) => p.creature)).size, 3);
  assert.strictEqual(room.hostId, "p1");
});

test("room caps at 8 players and rejects duplicate names", () => {
  const room = roomWith(["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.ok(g.addPlayer(room, "p9", "late").error);
  const small = roomWith(["Ana"]);
  assert.ok(g.addPlayer(small, "px", "ana").error);
});

test("start requires host and 2+ players", () => {
  const room = roomWith(["Ana"]);
  assert.ok(g.startGame(room, "p1").error);
  g.addPlayer(room, "p2", "Ben");
  assert.ok(g.startGame(room, "p2").error);
  assert.deepStrictEqual(g.startGame(room, "p1"), {});
  assert.strictEqual(room.phase, "playing");
});

test("charge caps at 3, but attacking with 0 charges is legal (a dud)", () => {
  const room = startedRoom(["Ana", "Ben"]);
  const ana = g.getPlayer(room, "p1");
  ana.charges = 3;
  assert.ok(g.submitAction(room, "p1", { type: "charge" }).error);
  const ben = g.getPlayer(room, "p2");
  ben.charges = 0;
  assert.deepStrictEqual(g.submitAction(room, "p2", { type: "attack", targetId: "p1" }), { done: false });
});

test("a 0-charge attack is a dud: no hit, no charge spent, no effect on the target", () => {
  const room = startedRoom(["Ana", "Ben"]);
  g.getPlayer(room, "p1").charges = 0;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "charge" });
  const summary = g.resolveRound(room);
  const move = summary.moves.find((m) => m.id === "p1");
  assert.strictEqual(move.dud, true);
  assert.strictEqual(move.eliminated, false);
  assert.strictEqual(move.canceled, false);
  assert.strictEqual(g.getPlayer(room, "p1").charges, 0); // stayed at 0, not -1
  assert.strictEqual(g.getPlayer(room, "p2").alive, true);
  assert.strictEqual(room.phase, "playing");
});

test("a dud attack does not cancel a real attack landing on the dud attacker", () => {
  const room = startedRoom(["Ana", "Ben"]);
  g.getPlayer(room, "p1").charges = 0; // Ana will throw a dud
  g.getPlayer(room, "p2").charges = 1; // Ben has a real charge
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" }); // dud
  g.submitAction(room, "p2", { type: "attack", targetId: "p1" }); // real, aimed right back
  const summary = g.resolveRound(room);
  const anaMove = summary.moves.find((m) => m.id === "p1");
  const benMove = summary.moves.find((m) => m.id === "p2");
  assert.strictEqual(anaMove.dud, true);
  assert.strictEqual(benMove.canceled, false); // a dud can't trigger a cancel
  assert.strictEqual(benMove.eliminated, false);
  assert.strictEqual(anaMove.eliminated, true); // Ben's real attack lands normally
  assert.strictEqual(g.getPlayer(room, "p1").alive, false);
  assert.strictEqual(g.getPlayer(room, "p2").alive, true);
});

test("cannot attack yourself or a dead player", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  g.getPlayer(room, "p1").charges = 1; // isolate the target-validation checks from the charge check
  assert.ok(g.submitAction(room, "p1", { type: "attack", targetId: "p1" }).error);
  g.getPlayer(room, "p3").alive = false;
  assert.ok(g.submitAction(room, "p1", { type: "attack", targetId: "p3" }).error);
});

test("shield blocks any number of attacks, attack spends a charge", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  g.getPlayer(room, "p1").charges = 1;
  g.getPlayer(room, "p2").charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p3" });
  g.submitAction(room, "p2", { type: "attack", targetId: "p3" });
  g.submitAction(room, "p3", { type: "shield" });
  g.resolveRound(room);
  assert.ok(g.getPlayer(room, "p3").alive);
  assert.strictEqual(g.getPlayer(room, "p1").charges, 0);
  assert.strictEqual(g.getPlayer(room, "p2").charges, 0);
  assert.strictEqual(room.phase, "playing");
  assert.strictEqual(room.round, 2);
});

test("unshielded target is eliminated; last one standing wins", () => {
  const room = startedRoom(["Ana", "Ben"]);
  g.getPlayer(room, "p1").charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "charge" });
  g.resolveRound(room);
  assert.strictEqual(g.getPlayer(room, "p2").alive, false);
  assert.strictEqual(room.phase, "over");
  assert.strictEqual(room.winnerId, "p1");
});

test("mutual attacks collide and cancel — no elimination, charges still spent", () => {
  const room = startedRoom(["Ana", "Ben"]);
  g.getPlayer(room, "p1").charges = 1;
  g.getPlayer(room, "p2").charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "attack", targetId: "p1" });
  const summary = g.resolveRound(room);
  assert.strictEqual(g.getPlayer(room, "p1").alive, true);
  assert.strictEqual(g.getPlayer(room, "p2").alive, true);
  assert.strictEqual(g.getPlayer(room, "p1").charges, 0);
  assert.strictEqual(g.getPlayer(room, "p2").charges, 0);
  assert.ok(summary.moves.every((m) => m.canceled === true && m.eliminated === false));
  assert.strictEqual(room.phase, "playing");
  assert.strictEqual(room.round, 2);
});

test("a mutual-attack cancel doesn't extend to a 3-way cycle", () => {
  // p1 → p2 → p3 → p1: no direct pair attacks each other back, so this is
  // not a cancellation — every hit lands normally.
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  for (const p of room.players) p.charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "attack", targetId: "p3" });
  g.submitAction(room, "p3", { type: "attack", targetId: "p1" });
  const summary = g.resolveRound(room);
  assert.ok(summary.moves.every((m) => m.canceled === false && m.eliminated === true));
  assert.strictEqual(room.phase, "over");
  assert.strictEqual(room.winnerId, null); // all mortals fell together
});

test("an attacker who dies this round still lands their attack", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  g.getPlayer(room, "p1").charges = 1;
  g.getPlayer(room, "p2").charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "attack", targetId: "p3" });
  g.submitAction(room, "p3", { type: "charge" });
  g.resolveRound(room);
  assert.strictEqual(g.getPlayer(room, "p2").alive, false);
  assert.strictEqual(g.getPlayer(room, "p3").alive, false);
  assert.strictEqual(room.phase, "over");
  assert.strictEqual(room.winnerId, "p1");
});

test("charging grows charges up to the cap over rounds", () => {
  const room = startedRoom(["Ana", "Ben"]);
  for (let i = 0; i < 3; i++) {
    g.submitAction(room, "p1", { type: "charge" });
    g.submitAction(room, "p2", { type: "shield" });
    g.resolveRound(room);
  }
  assert.strictEqual(g.getPlayer(room, "p1").charges, 3);
  assert.ok(g.submitAction(room, "p1", { type: "charge" }).error);
});

test("actions can be changed until everyone is in", () => {
  const room = startedRoom(["Ana", "Ben"]);
  g.submitAction(room, "p1", { type: "charge" });
  const r = g.submitAction(room, "p1", { type: "shield" });
  assert.strictEqual(r.done, false);
  assert.strictEqual(g.getPlayer(room, "p1").action.type, "shield");
});

test("disconnect keeps a private, rejoinable seat without changing host", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  g.submitAction(room, "p2", { type: "attack", targetId: "p1" });
  const empty = g.removePlayer(room, "p1");
  assert.strictEqual(empty, false);
  const ana = g.getPlayer(room, "p1");
  assert.strictEqual(ana.alive, true);
  assert.strictEqual(ana.connected, false);
  assert.ok(ana.left);
  assert.strictEqual(room.hostId, "p1");
  assert.ok(g.rejoinPlayer(room, "p1-new", "wrong").error);
  assert.strictEqual(g.rejoinPlayer(room, "p1-new", "token-1").player, ana);
  assert.strictEqual(ana.id, "p1-new");
  assert.strictEqual(room.hostId, "p1-new");
  assert.strictEqual(ana.connected, true);
  assert.strictEqual(g.getPlayer(room, "p2").action.targetId, "p1-new");
});

test("offline players default to charge so connected players can resolve", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  g.removePlayer(room, "p3");
  g.submitAction(room, "p1", { type: "shield" });
  g.submitAction(room, "p2", { type: "shield" });
  assert.strictEqual(g.allActionsIn(room), true);
  const summary = g.resolveRound(room);
  assert.strictEqual(summary.moves.find((m) => m.name === "Cy").action, "charge");
  assert.strictEqual(g.getPlayer(room, "p3").charges, 1);
});

test("rejoin token and other private player internals are never broadcast", () => {
  const room = startedRoom(["Ana", "Ben"]);
  const pub = g.toPublicState(room, "p1");
  assert.strictEqual(pub.players[0].resumeToken, undefined);
  assert.strictEqual(pub.players[0].connected, true);
});

test("public state hides pending actions always, and charges from everyone but the viewer", () => {
  const room = startedRoom(["Ana", "Ben"]);
  g.getPlayer(room, "p1").charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });

  const forAna = g.toPublicState(room, "p1");
  const anaSeenByHerself = forAna.players.find((p) => p.id === "p1");
  const benSeenByAna = forAna.players.find((p) => p.id === "p2");
  assert.strictEqual(anaSeenByHerself.submitted, true);
  assert.strictEqual(anaSeenByHerself.action, undefined);
  assert.strictEqual(anaSeenByHerself.charges, 1); // her own charges, visible to her
  assert.strictEqual(benSeenByAna.charges, undefined); // not Ben's

  const forBen = g.toPublicState(room, "p2");
  const anaSeenByBen = forBen.players.find((p) => p.id === "p1");
  const benSeenByHimself = forBen.players.find((p) => p.id === "p2");
  assert.strictEqual(anaSeenByBen.charges, undefined); // Ben can't see Ana's
  assert.strictEqual(benSeenByHimself.charges, 0); // but sees his own

  const spectatorView = g.toPublicState(room); // no viewerId → nobody's charges shown
  assert.ok(spectatorView.players.every((p) => p.charges === undefined));
});

test("players can rename, but not to a taken name", () => {
  const room = roomWith(["Ana", "Ben"]);
  assert.deepStrictEqual(g.renamePlayer(room, "p1", "  Anastasia "), {});
  assert.strictEqual(g.getPlayer(room, "p1").name, "Anastasia");
  assert.ok(g.renamePlayer(room, "p1", "ben").error);
  assert.ok(g.renamePlayer(room, "p1", "   ").error);
  // renaming to your own name (case change) is fine
  assert.deepStrictEqual(g.renamePlayer(room, "p1", "ANASTASIA"), {});
});

test("a preferred beast at join time is honored, or falls back if taken/invalid", () => {
  const room = g.createRoom("TEST");
  g.addPlayer(room, "p1", "Ana", "sirena");
  assert.strictEqual(g.getPlayer(room, "p1").creature, "sirena");
  // taken → first free beast instead
  g.addPlayer(room, "p2", "Ben", "sirena");
  assert.strictEqual(g.getPlayer(room, "p2").creature, "bakunawa");
  // invalid id → first free beast
  g.addPlayer(room, "p3", "Cy", "chupacabra");
  assert.strictEqual(g.getPlayer(room, "p3").creature, "tikbalang");
  // no preference → unchanged behavior
  g.addPlayer(room, "p4", "Dan");
  assert.strictEqual(g.getPlayer(room, "p4").creature, "valentina");
});

test("beast can be picked in the lobby if free, never mid-game", () => {
  const room = roomWith(["Ana", "Ben"]);
  const benCreature = g.getPlayer(room, "p2").creature;
  assert.ok(g.chooseCreature(room, "p1", benCreature).error);
  assert.ok(g.chooseCreature(room, "p1", "chupacabra").error);
  assert.deepStrictEqual(g.chooseCreature(room, "p1", "bul-bul"), {});
  const ana = g.getPlayer(room, "p1");
  assert.strictEqual(ana.creature, "bul-bul");
  assert.strictEqual(ana.creatureName, "Bul-bul");
  g.startGame(room, "p1");
  assert.ok(g.chooseCreature(room, "p1", "valentina").error);
});

test("join window: expired lobby rejects joins; starting clears it; rematch renews it", () => {
  const room = roomWith(["Ana", "Ben"]);
  assert.ok(room.lobbyDeadline > Date.now());
  assert.strictEqual(g.lobbyExpired(room), false);

  room.lobbyDeadline = Date.now() - 1;
  assert.strictEqual(g.lobbyExpired(room), true);
  assert.match(g.addPlayer(room, "p3", "Cy").error, /expired/);

  g.startGame(room, "p1");
  assert.strictEqual(room.lobbyDeadline, null);
  assert.strictEqual(g.lobbyExpired(room), false); // only lobbies expire

  g.getPlayer(room, "p1").charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "charge" });
  g.resolveRound(room);
  g.resetToLobby(room, "p1");
  assert.ok(room.lobbyDeadline > Date.now());
  const state = g.toPublicState(room, "p1");
  assert.ok(state.lobbyMsLeft > 0 && state.lobbyMsLeft <= g.JOIN_WINDOW_MS);
});

// Small pool for quiz tests; answers are known so we can steer the outcome
const POOL = Array.from({ length: 20 }, (_, i) => ({
  q: `Q${i}?`,
  a: `right${i}`,
  d: [`wrong${i}a`, `wrong${i}b`, `wrong${i}c`],
}));

function answerCorrectly(room, id) {
  const p = g.getPlayer(room, id);
  return g.answerQuiz(room, id, p.quiz.correctChoice, POOL);
}

function killPlayer(room, victimId, attackerId) {
  g.getPlayer(room, attackerId).charges = 1;
  g.getPlayer(room, victimId).charges = 0; // force victim to charge, not shield
  const others = g.alivePlayers(room).filter((p) => p.id !== victimId && p.id !== attackerId);
  g.submitAction(room, attackerId, { type: "attack", targetId: victimId });
  g.submitAction(room, victimId, { type: "charge" });
  for (const p of others) g.submitAction(room, p.id, { type: "shield" });
  g.resolveRound(room);
  // keep follow-up rounds predictable regardless of what was spent here
  for (const p of g.alivePlayers(room)) p.charges = 1;
}

test("quiz: only the freshly dead may start, gauntlet is 3-10 questions", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  assert.ok(g.startQuiz(room, "p1", POOL).error); // alive
  killPlayer(room, "p3", "p1");
  assert.ok(g.getPlayer(room, "p3").canRevive);
  const res = g.startQuiz(room, "p3", POOL);
  assert.ok(res.question);
  assert.strictEqual(res.question.choices.length, 4);
  assert.ok(res.question.choices.includes(POOL[g.getPlayer(room, "p3").quiz.questions[0]].a));
  const total = res.question.total;
  assert.ok(total >= g.QUIZ_MIN && total <= g.QUIZ_MAX);
  assert.ok(g.startQuiz(room, "p3", POOL).error); // already quizzing
});

test("quiz: one wrong answer burns the chance for this death", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  killPlayer(room, "p3", "p1");
  g.startQuiz(room, "p3", POOL);
  const p3 = g.getPlayer(room, "p3");
  const wrong = (p3.quiz.correctChoice + 1) % 4;
  const res = g.answerQuiz(room, "p3", wrong, POOL);
  assert.strictEqual(res.failed, true);
  assert.strictEqual(p3.alive, false);
  assert.strictEqual(p3.canRevive, false);
  assert.match(g.startQuiz(room, "p3", POOL).error, /already judged/);
});

test("quiz: clearing the gauntlet revives the player as a wraith", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  killPlayer(room, "p3", "p1");
  g.startQuiz(room, "p3", POOL);
  const p3 = g.getPlayer(room, "p3");
  let res;
  do {
    res = answerCorrectly(room, "p3");
  } while (res.question);
  assert.strictEqual(res.revived, true);
  assert.strictEqual(p3.alive, true);
  assert.strictEqual(p3.wraith, true);
  assert.strictEqual(p3.charges, 0); // revival resets to the same starting charges as a fresh player
  const state = g.toPublicState(room, "p3");
  const pub = state.players.find((p) => p.id === "p3");
  assert.strictEqual(pub.wraith, true);
  assert.strictEqual(pub.quiz, undefined); // internals never broadcast
});

test("wraiths play but cannot win: last mortal standing wins over a live wraith", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  killPlayer(room, "p3", "p1");
  g.startQuiz(room, "p3", POOL);
  let res;
  do {
    res = answerCorrectly(room, "p3");
  } while (res.question);
  // Wraith p3 kills mortal p2 → one mortal (p1) left → p1 wins immediately
  g.getPlayer(room, "p3").charges = 1; // revival reset it to 0; give the wraith a charge to attack with
  g.submitAction(room, "p3", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p1", { type: "shield" });
  g.submitAction(room, "p2", { type: "charge" });
  g.resolveRound(room);
  assert.strictEqual(room.phase, "over");
  assert.strictEqual(room.winnerId, "p1");
  assert.strictEqual(g.getPlayer(room, "p3").alive, true); // wraith outlived, didn't win
});

test("a wraith as sole survivor means no winner", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  killPlayer(room, "p3", "p1");
  g.startQuiz(room, "p3", POOL);
  let res;
  do {
    res = answerCorrectly(room, "p3");
  } while (res.question);
  // p1 attacks p2 (p2 falls); wraith p3 attacks p1 in the same round (p1
  // falls too — a direct mutual attack would cancel, but this isn't one,
  // p1 and p3 aren't targeting each other). Both mortals gone at once,
  // wraith survives alone → nobody wins.
  g.getPlayer(room, "p3").charges = 1; // revival reset it to 0
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "charge" });
  g.submitAction(room, "p3", { type: "attack", targetId: "p1" });
  g.resolveRound(room);
  assert.strictEqual(room.phase, "over");
  assert.strictEqual(room.winnerId, null);
  assert.strictEqual(g.getPlayer(room, "p3").alive, true);
});

test("a wraith who dies again gets a fresh trivia chance", () => {
  const room = startedRoom(["Ana", "Ben", "Cy", "Dan"]);
  killPlayer(room, "p4", "p1");
  g.startQuiz(room, "p4", POOL);
  let res;
  do {
    res = answerCorrectly(room, "p4");
  } while (res.question);
  assert.ok(g.getPlayer(room, "p4").wraith);
  killPlayer(room, "p4", "p2");
  assert.strictEqual(g.getPlayer(room, "p4").alive, false);
  assert.strictEqual(g.getPlayer(room, "p4").canRevive, true);
  assert.ok(g.startQuiz(room, "p4", POOL).question);
});

test("quiz answers are rejected once the battle is over", () => {
  const room = startedRoom(["Ana", "Ben", "Cy"]);
  killPlayer(room, "p3", "p1");
  g.startQuiz(room, "p3", POOL);
  killPlayer(room, "p2", "p1"); // p1 is now the last mortal → game over
  assert.strictEqual(room.phase, "over");
  const res = g.answerQuiz(room, "p3", 0, POOL);
  assert.match(res.error, /ended/);
});

test("play again resets everyone back to the lobby", () => {
  const room = startedRoom(["Ana", "Ben"]);
  g.getPlayer(room, "p1").charges = 1;
  g.submitAction(room, "p1", { type: "attack", targetId: "p2" });
  g.submitAction(room, "p2", { type: "charge" });
  g.resolveRound(room);
  assert.strictEqual(room.phase, "over");
  assert.deepStrictEqual(g.resetToLobby(room, "p1"), {});
  assert.strictEqual(room.phase, "lobby");
  assert.ok(room.players.every((p) => p.alive && p.charges === 0));
});
