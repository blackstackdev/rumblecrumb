import test from "node:test";
import assert from "node:assert/strict";
import { Game, RADIUS } from "../src/simulation.ts";
import { LEVELS } from "../src/levels.ts";
import {
  freshProgress,
  readProgress,
  isUnlocked,
  recordWin,
  finished,
  loadProgress,
  persistProgress,
} from "../src/progress.ts";
const routes = [
  [
    [-3, 0.25],
    [5, -0.25],
  ],
  [
    [-4.3, 0.5],
    [4.6, -3.4],
  ],
  [
    [-4.3, -4],
    [6.3, -3.4],
    [6.5, 4.8],
  ],
];
function settle(g) {
  for (let i = 0; i < 180; i++) g.tick(1 / 60);
  g.takeImpact();
}
for (let i = 0; i < LEVELS.length; i++)
  test(`district ${i + 1} has a legal safe winning arrangement`, () => {
    const g = new Game();
    g.reset(true, i);
    assert.equal(g.targetCount, 4);
    for (const [x, z] of routes[i]) {
      g.move(x, z);
      assert.equal(g.canStomp, true);
      assert.equal(
        g.buildings.some((b) => b.protected && g.inReach(b)),
        false,
      );
      g.stomp();
      settle(g);
    }
    assert.equal(g.phase, "won");
    assert.equal(g.shopSafe, true);
    assert.equal(g.stomps, 3 - routes[i].length);
    g.reset();
    assert.equal(g.level, i);
    assert.deepEqual([g.x, g.z], LEVELS[i].spawn);
    assert.equal(g.down, 0);
  });
test("midnight east pair cannot share a safe stomp", () => {
  const c = LEVELS[2].layout.find((b) => b.id === "c"),
    d = LEVELS[2].layout.find((b) => b.id === "d"),
    shop = LEVELS[2].layout.find((b) => b.protected);
  const half = Math.hypot(c.x - d.x, c.z - d.z) / 2;
  const mid = [(c.x + d.x) / 2, (c.z + d.z) / 2];
  const lensBound = Math.sqrt(RADIUS ** 2 - half ** 2);
  assert.ok(Math.hypot(mid[0] - shop.x, mid[1] - shop.z) + lensBound < RADIUS);
  for (const b of LEVELS[2].layout.filter((b) => ["a", "b"].includes(b.id)))
    for (const east of [c, d])
      assert.ok(Math.hypot(b.x - east.x, b.z - east.z) > 2 * RADIUS);
});
test("district change cancels pending wind-up, effects and inherited loss", () => {
  const g = new Game();
  g.reset();
  g.stomp();
  g.tick(0.1);
  g.reset(true, 1);
  settle(g);
  assert.equal(g.down, 0);
  assert.equal(g.stomps, 3);
  assert.equal(g.phase, "playing");
  assert.equal(g.windupAge, -1);
  assert.equal(g.takeImpact(), null);
});
test("invalid district indices cannot poison the mission", () => {
  const g = new Game();
  for (const n of [-1, 3, NaN, 1.5])
    assert.throws(() => g.reset(true, n), RangeError);
  assert.equal(g.level, 0);
});
test("earned unlocks and best counts survive round-trip; replays cannot lower a record", () => {
  let p = freshProgress();
  assert.equal(isUnlocked(p, 1), false);
  p = recordWin(p, 0, 3);
  assert.equal(isUnlocked(p, 1), true);
  p = recordWin(p, 0, 2);
  p = recordWin(p, 0, 3);
  assert.equal(p.best[0], 2);
  p = recordWin(p, 1, 2);
  p = recordWin(p, 2, 3);
  assert.equal(finished(p), true);
  assert.deepEqual(readProgress(JSON.stringify(p)), p);
});
test("invalid saves and unearned records cannot bypass progression", () => {
  for (const raw of [
    null,
    "oops",
    "{}",
    '{"version":2,"best":[2,2,3]}',
    '{"version":1,"best":[1]}',
  ])
    assert.deepEqual(readProgress(raw), freshProgress());
  assert.deepEqual(
    readProgress('{"version":1,"best":[0,2,3]}'),
    freshProgress(),
  );
  assert.deepEqual(
    readProgress('{"version":1,"best":[2,999,3]}').best,
    [2, 0, 0],
  );
  let p = freshProgress();
  assert.equal(recordWin(p, 2, 1), p);
  assert.equal(recordWin(p, 0, 0), p);
  assert.equal(recordWin(p, 0, 4), p);
});
test("blocked and full browser storage return usable temporary progress", () => {
  const blocked = loadProgress(() => {
    throw new Error("SecurityError");
  });
  assert.equal(blocked.available, false);
  assert.deepEqual(blocked.progress, freshProgress());
  const p = recordWin(blocked.progress, 0, 2);
  assert.equal(isUnlocked(p, 1), true);
  assert.equal(
    persistProgress(() => {
      throw new Error("QuotaExceededError");
    }, p),
    false,
  );
  let raw = null;
  assert.equal(
    persistProgress((value) => (raw = value), p),
    true,
  );
  assert.deepEqual(loadProgress(() => raw).progress, p);
});
