import test from "node:test";
import assert from "node:assert";
import { loadPlayerSession, savePlayerSession } from "../js/storage.js";

const store = new Map();
global.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
};

test.beforeEach(() => store.clear());

test("player sessions persist independently by normalized room code", () => {
  savePlayerSession("ab12", { resumeToken: "secret-a", name: "Ana" });
  savePlayerSession("CD34", { resumeToken: "secret-b", name: "Ben" });
  assert.deepStrictEqual(loadPlayerSession("AB12"), { resumeToken: "secret-a", name: "Ana" });
  assert.deepStrictEqual(loadPlayerSession("cd34"), { resumeToken: "secret-b", name: "Ben" });
});

test("malformed sessions are ignored", () => {
  localStorage.setItem("survivor.playerSessions.v1", JSON.stringify({ TEST: { name: "Ana" } }));
  assert.strictEqual(loadPlayerSession("TEST"), null);
});
