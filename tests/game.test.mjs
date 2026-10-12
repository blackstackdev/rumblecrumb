import test from "node:test";
import assert from "node:assert/strict";
import { Game, LAYOUT, WINDUP } from "../src/simulation.ts";
function settle(g) {
  for (let i = 0; i < 180; i++) g.tick(1 / 60);
}
test("repeatable two-position win preserves the noodle shop", () => {
  const g = new Game();
  g.reset();
  g.move(-3, 0.25);
  assert.equal(g.stomp(), true);
  settle(g);
  assert.deepEqual(g.lastHit, ["a", "b"]);
  g.move(5, -0.25);
  assert.equal(g.stomp(), true);
  settle(g);
  assert.deepEqual(g.lastHit, ["c", "d"]);
  assert.equal(g.phase, "won");
  assert.equal(g.shopSafe, true);
  assert.equal(g.down, 4);
  assert.equal(g.stomps, 1);
});
test("unsafe aim fails even with actions remaining", () => {
  const g = new Game();
  g.reset();
  g.move(-1, 4.5);
  g.stomp();
  settle(g);
  assert.equal(g.phase, "lost");
  assert.equal(g.shopSafe, false);
  assert.match(g.resultReason, /noodle/);
});
test("three wasted stomps loses; no fourth or terminal mutation", () => {
  const g = new Game();
  g.reset();
  g.move(-7, 4);
  for (let i = 0; i < 3; i++) {
    assert.ok(g.stomp());
    settle(g);
  }
  assert.equal(g.phase, "lost");
  assert.equal(g.stomps, 0);
  assert.equal(g.stomp(), false);
  const pos = [g.x, g.z];
  g.move(1, 1);
  assert.deepEqual([g.x, g.z], pos);
});
test("pause freezes time, input and cooldown; rapid repeated stomp ignored", () => {
  const g = new Game();
  g.reset();
  g.move(-7, 4);
  g.stomp();
  assert.equal(g.stomp(), false);
  g.paused = true;
  const t = g.time;
  g.tick(1);
  g.move(2, 2);
  assert.equal(g.time, t);
  assert.equal(g.x, -7);
  assert.equal(g.stomp(), false);
});
test("reset restores the exact scene, counters and no inherited loss", () => {
  const g = new Game();
  g.reset();
  g.move(0, 4);
  g.stomp();
  settle(g);
  g.reset();
  assert.equal(g.phase, "playing");
  assert.equal(g.down, 0);
  assert.equal(g.stomps, 3);
  assert.equal(g.shopSafe, true);
  assert.deepEqual(
    g.buildings,
    LAYOUT.map((b) => ({ ...b, destroyed: false })),
  );
});
test("large frame gaps are bounded and cannot immediately resolve outcome", () => {
  const g = new Game();
  g.reset();
  g.move(0, 4);
  g.stomp();
  g.tick(40);
  assert.equal(g.phase, "playing");
  assert.equal(g.windupAge, 0.1);
  assert.equal(g.down, 0);
  assert.equal(g.time, 0.1);
});

test("wind-up locks position, spends only at landing and emits impact once", () => {
  const g = new Game();
  g.reset();
  g.move(-3, 0.25);
  assert.equal(g.stomp(), true);
  g.move(5, -0.25);
  assert.equal(g.x, -3);
  assert.equal(g.stomps, 3);
  assert.equal(g.down, 0);
  assert.equal(g.takeImpact(), null);
  for (let i = 0; i < 28; i++) g.tick(1 / 60);
  assert.ok(g.windupAge < WINDUP);
  assert.equal(g.down, 0);
  g.tick(1 / 60);
  assert.equal(g.stomps, 2);
  assert.equal(g.down, 2);
  assert.deepEqual(
    g.takeImpact().map((b) => b.id),
    ["a", "b"],
  );
  assert.equal(g.takeImpact(), null);
});
test("pause during wind-up freezes landing and resume lands once", () => {
  const g = new Game();
  g.reset();
  g.move(-3, 0.25);
  g.stomp();
  g.tick(0.1);
  g.paused = true;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  assert.equal(g.windupAge, 0.1);
  assert.equal(g.down, 0);
  g.paused = false;
  settle(g);
  assert.equal(g.down, 2);
  assert.equal(g.stomps, 2);
});
test("restart cancels a pending stomp and clears an undelivered impact", () => {
  const g = new Game();
  g.reset();
  g.move(-3, 0.25);
  g.stomp();
  g.tick(0.1);
  g.reset();
  settle(g);
  assert.equal(g.down, 0);
  assert.equal(g.stomps, 3);
  assert.equal(g.windupAge, -1);
  assert.equal(g.takeImpact(), null);
  g.move(-3, 0.25);
  g.stomp();
  settle(g);
  g.reset();
  assert.equal(g.takeImpact(), null);
});
