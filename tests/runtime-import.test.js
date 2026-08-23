
import test from "node:test";
import assert from "node:assert/strict";
import { createSeededRng } from "../engine/rng.js";
import { PitcheraGameController } from "../engine/adapter.js";

test("runtime exposes deterministic RNG", () => {
  const a = createSeededRng(42), b = createSeededRng(42);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test("runtime controller API exists", () => {
  const c = new PitcheraGameController();
  assert.equal(typeof c.init, "function");
  assert.equal(typeof c.createLocalGame, "function");
  assert.equal(typeof c.dispatch, "function");
});
