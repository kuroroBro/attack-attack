// Mythic Survivor client. Every player runs this same file; whoever creates
// the room additionally becomes the room's authoritative Host (see
// specs/001-p2p-conversion/plan.md). Non-host players send intents over
// PeerJS and render whatever state the Host last pushed; the Host mutates
// `room` directly via js/game.js and pushes the result to everyone,
// including itself (there is no separate "server process" to loop back
// through — see `push()` below).

import * as game from "./game.js";
import { TRIVIA } from "./trivia.js";
import { hostRoom, joinRoom } from "./room.js";
import { loadSettings, saveSettings } from "./storage.js";

const HOST_ID = "host"; // stable local id for the Host's own player entry
const EMOTES = ["👍", "😂", "😮", "🔥", "💀", "❤️"];

let isHost = false;
let room = null; // authoritative room object — only meaningful when isHost
let net = null; // { broadcast, close } (host) or { send, close } (client)
let state = null; // last known public state
let myId = null;
let pendingAction = null; // my chosen action type before/after submit
let targeting = false; // attack chosen, waiting for a target click
let myTargetId = null;
let lobbyDeadline = null; // local clock: when the join window closes
let homeCreatureId = null; // beast picked on the join screen (optional)
const emotes = new Map(); // playerId -> { emoji, until }
const lastChatAt = new Map(); // playerId -> ms (Host-side rate limit)
const lastEmoteAt = new Map();

const $ = (id) => document.getElementById(id);
const screens = {
  home: $("screen-home"),
  lobby: $("screen-lobby"),
  game: $("screen-game"),
};

function show(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}

function me() {
  return state && state.players.find((p) => p.id === myId);
}

function avatar(creature) {
  // A CSS mask (instead of <img>) lets the icon take the card's currentColor
  const span = document.createElement("span");
  span.className = "avatar";
  span.style.display = "inline-block";
  span.style.webkitMaskImage = `url(creatures/${creature}.svg)`;
  span.style.maskImage = `url(creatures/${creature}.svg)`;
  span.style.webkitMaskSize = "contain";
  span.style.maskSize = "contain";
  span.style.webkitMaskRepeat = "no-repeat";
  span.style.maskRepeat = "no-repeat";
  span.style.webkitMaskPosition = "center";
  span.style.maskPosition = "center";
  span.style.backgroundColor = "currentColor";
  return span;
}

// Countdown until the lobby stops accepting joins. Only the timer text is
// updated each second — a full re-render would interrupt clicks and typing.
function renderLobbyTimer() {
  const el = $("lobby-timer");
  if (!state || state.phase !== "lobby" || lobbyDeadline === null) {
    el.textContent = "";
    return;
  }
  const msLeft = Math.max(0, lobbyDeadline - Date.now());
  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  el.textContent =
    msLeft > 0
      ? `open for joins — ${mins}:${String(secs).padStart(2, "0")} left`
      : "join window closed";
  el.classList.toggle("closing", msLeft < 5 * 60000);
}
setInterval(renderLobbyTimer, 1000);

// Host-only: close lobbies whose join window ran out without the game
// starting (the direct replacement for server.js's sweep interval).
setInterval(() => {
  if (!isHost || !room) return;
  if (game.lobbyExpired(room)) {
    push("roomClosed", { reason: "The join window ran out — create a new room to play" });
    net.close();
    net = null;
    room = null;
    isHost = false;
  }
}, 15 * 1000);

function emoteFor(playerId) {
  const e = emotes.get(playerId);
  if (!e || e.until < Date.now()) return null;
  const span = document.createElement("span");
  span.className = "emote-bubble";
  span.textContent = e.emoji;
  return span;
}

// ---------- Lobby ----------
function renderLobby() {
  $("lobby-code").textContent = state.code;
  renderLobbyTimer();
  const box = $("lobby-players");
  box.innerHTML = "";
  for (const p of state.players) {
    const card = document.createElement("div");
    card.className = "lobby-player";
    card.appendChild(avatar(p.creature));
    const name = document.createElement("div");
    name.className = "pname";
    name.textContent = p.name + (p.id === myId ? " (you)" : "");
    const cname = document.createElement("div");
    cname.className = "cname";
    cname.innerHTML =
      (p.id === state.hostId ? '<span class="host-star">★</span> ' : "") + p.creatureName;
    card.append(name, cname);
    const bubble = emoteFor(p.id);
    if (bubble) card.appendChild(bubble);
    box.appendChild(card);
  }

  // Customize: rename + beast picker (free beasts only)
  const rn = $("rename-input");
  if (document.activeElement !== rn) rn.value = me() ? me().name : "";
  const picker = $("creature-picker");
  picker.innerHTML = "";
  const takenBy = new Map(state.players.map((p) => [p.creature, p.id]));
  for (const c of state.creatures) {
    const btn = document.createElement("button");
    btn.className = "creature-btn";
    const owner = takenBy.get(c.id);
    if (owner === myId) btn.classList.add("mine");
    btn.disabled = owner !== undefined && owner !== myId;
    btn.appendChild(avatar(c.id));
    const label = document.createElement("span");
    label.className = "clabel";
    label.textContent = c.name;
    btn.appendChild(label);
    btn.addEventListener("click", () =>
      callAction("creature", { creatureId: c.id }).then((res) => {
        if (res.error) toast(res.error);
      }, (err) => toast(err.message))
    );
    picker.appendChild(btn);
  }

  const isRoomHost = state.hostId === myId;
  $("start-btn").classList.toggle("hidden", !isRoomHost);
  $("start-btn").disabled = state.players.length < 2;
  $("lobby-hint").textContent = isRoomHost
    ? state.players.length < 2
      ? "Waiting for at least one challenger…"
      : `${state.players.length}/8 players — start when ready`
    : "Waiting for the host to start…";
}

// ---------- Game ----------
function renderGame() {
  const my = me();
  $("round-label").textContent =
    state.phase === "over" ? "Battle over" : `Round ${state.round}`;
  $("game-code").textContent = `room ${state.code}`;

  // Banner
  const banner = $("banner");
  if (state.phase === "over") {
    banner.classList.remove("hidden", "grim");
    if (state.winnerId) {
      const w = state.players.find((p) => p.id === state.winnerId);
      banner.textContent = `🏆 ${w.name} the ${w.creatureName} survives!`;
    } else {
      banner.classList.add("grim");
      banner.textContent = "☠ All creatures have fallen. No one wins.";
    }
  } else {
    banner.classList.add("hidden");
  }

  // Board
  const board = $("board");
  board.innerHTML = "";
  const iCanTarget = targeting && my && my.alive && state.phase === "playing";
  for (const p of state.players) {
    const card = document.createElement("div");
    card.className = "pcard";
    if (p.id === myId) card.classList.add("me");
    if (!p.alive) card.classList.add("dead");
    if (p.wraith) card.classList.add("wraith");
    if (iCanTarget && p.alive && p.id !== myId) card.classList.add("targetable");
    if (myTargetId === p.id) card.classList.add("targeted");

    card.appendChild(avatar(p.creature));
    const name = document.createElement("div");
    name.className = "pname";
    name.textContent =
      (p.wraith ? "👻 " : "") + p.name + (p.id === myId ? " (you)" : "");
    const cname = document.createElement("div");
    cname.className = "cname";
    cname.textContent =
      (p.wraith ? "Wraith · " : "") + p.creatureName + (p.left ? " · left" : "");
    card.append(name, cname);

    const ready = document.createElement("div");
    ready.className = "ready-dot";
    if (state.phase === "playing" && p.alive) {
      ready.textContent = p.submitted ? "✓ ready" : "choosing…";
      if (p.submitted) ready.classList.add("in");
    } else if (state.phase === "playing" && !p.alive && p.quizzing) {
      ready.textContent = "facing the spirits…";
    }
    card.appendChild(ready);

    if (iCanTarget && p.alive && p.id !== myId) {
      card.addEventListener("click", () => chooseTarget(p.id));
    }
    const bubble = emoteFor(p.id);
    if (bubble) card.appendChild(bubble);
    board.appendChild(card);
  }

  // Action bar
  const bar = $("action-bar");
  const inRound = state.phase === "playing" && my && my.alive;
  bar.classList.toggle("hidden", !inRound);
  if (inRound) {
    $("act-charge").disabled = my.charges >= state.maxCharges;
    $("act-attack").disabled = my.charges < 1;
    $("act-shield").disabled = false;
    for (const btn of document.querySelectorAll(".act")) {
      btn.classList.toggle("selected", btn.dataset.action === pendingAction);
    }
    const wraithTag = my.wraith ? "You haunt as a Wraith (you cannot win). " : "";
    $("action-hint").textContent = targeting
      ? "Pick a creature to attack"
      : my.submitted
      ? "Move locked in — you can still change it until everyone is ready"
      : `${wraithTag}Choose your move`;
  }
  if (state.phase === "playing" && my && !my.alive) {
    bar.classList.remove("hidden");
    $("action-hint").textContent = my.quizzing
      ? "The spirits are testing you…"
      : my.canRevive
      ? "You were eliminated — but the spirits offer a way back"
      : "You were eliminated — spectating";
    for (const btn of document.querySelectorAll(".act")) btn.disabled = true;
  }
  $("revive-btn").classList.toggle(
    "hidden",
    !(state.phase === "playing" && my && !my.alive && my.canRevive && !my.quizzing)
  );

  const isOverHost = state.phase === "over" && state.hostId === myId;
  $("again-btn").classList.toggle("hidden", !isOverHost);
  const overHint = $("over-hint");
  const waitingOnHost = state.phase === "over" && !isOverHost;
  overHint.classList.toggle("hidden", !waitingOnHost);
  if (waitingOnHost) {
    overHint.textContent =
      "Waiting for the host to start a rematch — everyone stays in this lobby.";
  }
}

function render() {
  $("chat-box").classList.toggle("hidden", !state);
  // The gauntlet only makes sense while the battle is running
  if (!state || state.phase !== "playing") $("quiz-modal").classList.add("hidden");
  if (!state) return show("home");
  if (state.phase === "lobby") {
    show("lobby");
    renderLobby();
  } else {
    show("game");
    renderGame();
  }
}

// ---------- Actions ----------
// Every user-initiated intent flows through here. On the Host's own device
// it's applied directly (no network hop); everyone else sends it to the
// Host over PeerJS and awaits the ack.
function callAction(event, payload) {
  if (isHost) return Promise.resolve(handleEvent(myId, event, payload));
  return net.send(event, payload);
}

function sendAction(action) {
  callAction("action", action).then(
    (res) => { if (res.error) toast(res.error); },
    (err) => toast(err.message)
  );
}

function pickAction(type) {
  if (type === "attack") {
    targeting = true;
    pendingAction = "attack";
    myTargetId = null;
    render();
    return;
  }
  targeting = false;
  myTargetId = null;
  pendingAction = type;
  sendAction({ type });
}

function chooseTarget(targetId) {
  targeting = false;
  myTargetId = targetId;
  sendAction({ type: "attack", targetId });
}

// ---------- Log ----------
const ACTION_LABEL = { charge: "⚡ charged", shield: "🛡️ shielded", attack: "⚔️ attacked" };
function appendRoundLog(summary) {
  const log = $("log");
  const head = document.createElement("div");
  head.className = "round-head";
  head.textContent = `Round ${summary.round}`;
  log.prepend(head);
  const lines = [];
  for (const m of summary.moves) {
    let text = `${m.wraith ? "👻 " : ""}${m.name} ${ACTION_LABEL[m.action]}`;
    if (m.action === "attack") text += ` ${m.targetName}`;
    if (m.canceled) text += " — blows collided, no one falls ⚔️";
    else if (m.eliminated) text += " — eliminated ☠";
    lines.push({ text, kill: m.eliminated });
  }
  // show lines under the head, newest round on top
  for (const line of lines.reverse()) {
    const div = document.createElement("div");
    div.textContent = line.text;
    if (line.kill) div.className = "kill";
    head.after(div);
  }
}

// ---------- Host authority ----------
// The direct replacement for server.js's per-event socket handlers, called
// either in-process (the Host's own actions) or from room.js's onMessage
// (a remote player's request). Only ever runs on the Host's device.
function handleEvent(playerId, event, payload) {
  payload = payload || {};
  switch (event) {
    case "joinRoom": {
      const res = game.addPlayer(room, playerId, payload.name, payload.creatureId);
      if (res.error) return { error: res.error };
      broadcastState();
      return { code: room.code, playerId, state: game.toPublicState(room, playerId) };
    }
    case "rename": {
      const res = game.renamePlayer(room, playerId, payload.name);
      if (res.error) return { error: res.error };
      broadcastState();
      return {};
    }
    case "creature": {
      const res = game.chooseCreature(room, playerId, payload.creatureId);
      if (res.error) return { error: res.error };
      broadcastState();
      return {};
    }
    case "chat": {
      const player = game.getPlayer(room, playerId);
      if (!player) return { error: "Not in a room" };
      const msg = String(payload.text || "").trim().slice(0, 200);
      if (!msg) return {};
      const now = Date.now();
      if (now - (lastChatAt.get(playerId) || 0) < 400) return { error: "Slow down a little" };
      lastChatAt.set(playerId, now);
      room.touchedAt = now;
      push("chat", { id: playerId, name: player.name, text: msg });
      return {};
    }
    case "emote": {
      if (!game.getPlayer(room, playerId)) return { error: "Not in a room" };
      if (!EMOTES.includes(payload.emoji)) return { error: "Unknown emote" };
      const now = Date.now();
      if (now - (lastEmoteAt.get(playerId) || 0) < 800) return {};
      lastEmoteAt.set(playerId, now);
      room.touchedAt = now;
      push("emote", { id: playerId, emoji: payload.emoji });
      return {};
    }
    case "startGame": {
      const res = game.startGame(room, playerId);
      if (res.error) return { error: res.error };
      broadcastState();
      return {};
    }
    case "action": {
      const res = game.submitAction(room, playerId, payload);
      if (res.error) return { error: res.error };
      broadcastState();
      maybeResolve();
      return {};
    }
    case "startQuiz": {
      const res = game.startQuiz(room, playerId, TRIVIA);
      if (res.error) return { error: res.error };
      broadcastState(); // others see the "facing the spirits" status
      return res;
    }
    case "answerQuiz": {
      const res = game.answerQuiz(room, playerId, payload.choice, TRIVIA);
      if (res.error) return { error: res.error };
      if (res.revived) {
        const player = game.getPlayer(room, playerId);
        push("chat", {
          id: null,
          name: "☠ The Spirits",
          text: `${player.name} has risen as a Wraith! They can no longer win… but they can still haunt.`,
        });
      }
      if (res.revived || res.failed) broadcastState();
      return res;
    }
    case "playAgain": {
      const res = game.resetToLobby(room, playerId);
      if (res.error) return { error: res.error };
      broadcastState();
      return {};
    }
    default:
      return { error: "Unknown request" };
  }
}

// Pushes an unsolicited event to every other player AND applies it to the
// Host's own local view — there is no network loopback to the Host itself.
function push(event, payload) {
  net.broadcast(event, payload);
  handlePush(event, payload);
}

// Unlike push(), a state snapshot differs per recipient — each player's own
// charges are included, everyone else's are withheld (js/game.js's
// toPublicState). net.broadcastEach computes that per-connection; the
// Host's own view (no network hop) is applied directly the same way.
function broadcastState() {
  room.touchedAt = Date.now();
  net.broadcastEach("state", (playerId) => game.toPublicState(room, playerId));
  handlePush("state", game.toPublicState(room, myId));
}

function maybeResolve() {
  if (room.phase !== "playing" || !game.allActionsIn(room)) return;
  const summary = game.resolveRound(room);
  push("roundResult", summary);
  broadcastState();
}

function handlePeerClose(playerId) {
  if (!room) return;
  const empty = game.removePlayer(room, playerId);
  if (empty) {
    net.close();
    net = null;
    room = null;
    isHost = false;
    return;
  }
  broadcastState();
  // A round can't wait on a player who is gone
  maybeResolve();
  // If the disconnect left at most one mortal mid-game, the battle ends
  // (wraiths cannot win, so they don't keep it going)
  if (room.phase === "playing") {
    const mortals = game.aliveMortals(room);
    if (mortals.length <= 1) {
      room.phase = "over";
      room.winnerId = mortals.length === 1 ? mortals[0].id : null;
      broadcastState();
    }
  }
}

// ---------- Inbound event dispatch (both Host loopback and network push) ----------
function handlePush(event, payload) {
  switch (event) {
    case "state": {
      // Back in the lobby (rematch) → last game's log is stale
      if (state && state.phase !== "lobby" && payload.phase === "lobby") $("log").innerHTML = "";
      state = payload;
      lobbyDeadline = payload.lobbyMsLeft !== null ? Date.now() + payload.lobbyMsLeft : null;
      const my = me();
      // Clear local action UI when a new round starts (state wiped submissions)
      if (my && !my.submitted && !targeting) {
        pendingAction = null;
        myTargetId = null;
      }
      render();
      break;
    }
    case "roundResult": {
      pendingAction = null;
      myTargetId = null;
      targeting = false;
      appendRoundLog(payload);
      break;
    }
    case "chat": {
      const box = $("chat-messages");
      const div = document.createElement("div");
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = `${payload.name}: `;
      div.append(who, document.createTextNode(payload.text));
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
      break;
    }
    case "emote": {
      emotes.set(payload.id, { emoji: payload.emoji, until: Date.now() + 2000 });
      render();
      setTimeout(render, 2100); // let the bubble expire
      break;
    }
    case "roomClosed": {
      state = null;
      lobbyDeadline = null;
      history.replaceState(null, "", location.pathname);
      render();
      toast(payload.reason || "The room was closed");
      break;
    }
  }
}

function handleNetClose(reason) {
  toast(reason || "Connection lost — refresh to rejoin");
}

// ---------- Home screen wiring ----------
const settings = loadSettings();

// Beast picker on the join screen. game.CREATURES is the same module both
// the Host and every client run, so there's nothing to fetch.
homeCreatureId = settings.creatureId;
{
  const picker = $("home-creature-picker");
  for (const c of game.CREATURES) {
    const btn = document.createElement("button");
    btn.className = "creature-btn";
    if (c.id === homeCreatureId) btn.classList.add("mine");
    btn.appendChild(avatar(c.id));
    const label = document.createElement("span");
    label.className = "clabel";
    label.textContent = c.name;
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      // clicking the selected beast again returns to auto-assign
      homeCreatureId = homeCreatureId === c.id ? null : c.id;
      for (const b of picker.querySelectorAll(".creature-btn")) {
        b.classList.toggle("mine", b.dataset.creature === homeCreatureId);
      }
    });
    btn.dataset.creature = c.id;
    picker.appendChild(btn);
  }
}
if (settings.name) $("name-input").value = settings.name;

function enterRoom(res) {
  myId = res.playerId;
  state = res.state;
  lobbyDeadline = res.state.lobbyMsLeft !== null ? Date.now() + res.state.lobbyMsLeft : null;
  history.replaceState(null, "", `?room=${res.code}`);
  render();
  const my = me();
  if (my) saveSettings({ name: my.name, creatureId: my.creature });
  if (homeCreatureId && my && my.creature !== homeCreatureId) {
    toast(`That beast was taken — you are the ${my.creatureName} (change it below)`);
  }
}

function resetToHome() {
  isHost = false;
  room = null;
  net = null;
  myId = null;
}

$("create-btn").addEventListener("click", async () => {
  const name = $("name-input").value.trim();
  if (!name) return toast("Enter your name first");
  $("create-btn").disabled = true;
  try {
    const hostNet = await hostRoom({
      onMessage: handleEvent,
      onPeerClose: handlePeerClose,
      onError: (msg) => toast(msg),
    });
    room = game.createRoom(hostNet.code);
    const res = game.addPlayer(room, HOST_ID, name, homeCreatureId);
    if (res.error) {
      hostNet.close();
      room = null;
      return toast(res.error);
    }
    isHost = true;
    net = hostNet;
    myId = HOST_ID;
    enterRoom({ code: room.code, playerId: myId, state: game.toPublicState(room, myId) });
  } catch (err) {
    resetToHome();
    toast(err.message || "Could not create a room");
  } finally {
    $("create-btn").disabled = false;
  }
});

async function join(code, name) {
  $("join-btn").disabled = true;
  try {
    const joined = await joinRoom(code, { onPush: handlePush, onClose: handleNetClose });
    net = joined;
    isHost = false;
    const res = await net.send("joinRoom", { name, creatureId: homeCreatureId });
    if (res.error) {
      net.close();
      net = null;
      return toast(res.error);
    }
    myId = joined.id;
    enterRoom(res);
  } catch (err) {
    resetToHome();
    toast(err.message || "Could not join that room");
  } finally {
    $("join-btn").disabled = false;
  }
}

$("join-btn").addEventListener("click", () => {
  const name = $("name-input").value.trim();
  const code = $("code-input").value.trim().toUpperCase();
  if (!name) return toast("Enter your name first");
  if (!code) return toast("Enter a room code");
  join(code, name);
});

$("copy-link-btn").addEventListener("click", () => {
  const url = `${location.origin}${location.pathname}?room=${state.code}`;
  navigator.clipboard.writeText(url).then(
    () => toast("Invite link copied"),
    () => toast(url)
  );
});

$("start-btn").addEventListener("click", () => {
  callAction("startGame").then(
    (res) => {
      if (res.error) toast(res.error);
      $("log").innerHTML = "";
    },
    (err) => toast(err.message)
  );
});

$("again-btn").addEventListener("click", () => {
  callAction("playAgain").then(
    (res) => { if (res.error) toast(res.error); },
    (err) => toast(err.message)
  );
});

for (const btn of document.querySelectorAll(".act")) {
  btn.addEventListener("click", () => pickAction(btn.dataset.action));
}

// ---------- Wraith trivia ----------
function showQuestion(qd) {
  $("quiz-progress").textContent = `Question ${qd.number} of ${qd.total}`;
  $("quiz-question").textContent = qd.q;
  const box = $("quiz-choices");
  box.innerHTML = "";
  qd.choices.forEach((choiceText, i) => {
    const btn = document.createElement("button");
    btn.className = "btn quiz-choice";
    btn.textContent = choiceText;
    btn.addEventListener("click", () => {
      for (const b of box.querySelectorAll("button")) b.disabled = true;
      callAction("answerQuiz", { choice: i }).then(
        (res) => {
          if (res.error) {
            $("quiz-modal").classList.add("hidden");
            return toast(res.error);
          }
          if (res.failed) {
            $("quiz-modal").classList.add("hidden");
            return toast("Wrong! The spirits turn away…");
          }
          if (res.revived) {
            $("quiz-modal").classList.add("hidden");
            return toast("You rise as a Wraith! You cannot win — but you can haunt.");
          }
          showQuestion(res.question);
        },
        (err) => {
          $("quiz-modal").classList.add("hidden");
          toast(err.message);
        }
      );
    });
    box.appendChild(btn);
  });
  $("quiz-modal").classList.remove("hidden");
}

$("revive-btn").addEventListener("click", () => {
  callAction("startQuiz").then(
    (res) => {
      if (res.error) return toast(res.error);
      showQuestion(res.question);
    },
    (err) => toast(err.message)
  );
});

$("rename-btn").addEventListener("click", () => {
  const name = $("rename-input").value.trim();
  if (!name) return toast("Enter a name first");
  callAction("rename", { name }).then(
    (res) => { if (res.error) toast(res.error); },
    (err) => toast(err.message)
  );
});

function sendChat() {
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text) return;
  callAction("chat", { text }).then(
    (res) => {
      if (res.error) return toast(res.error);
      input.value = "";
    },
    (err) => toast(err.message)
  );
}
$("chat-send").addEventListener("click", sendChat);
$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

for (const btn of document.querySelectorAll(".emote-btn")) {
  btn.addEventListener("click", () =>
    callAction("emote", { emoji: btn.dataset.emoji }).then(
      (res) => { if (res.error) toast(res.error); },
      (err) => toast(err.message)
    )
  );
}

// Deep link: ?room=CODE
const roomParam = new URLSearchParams(location.search).get("room");
if (roomParam) {
  $("code-input").value = roomParam.toUpperCase();
  $("name-input").focus();
}
