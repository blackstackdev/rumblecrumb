import { LEVELS } from "./levels.ts";
export type Phase = "intro" | "playing" | "settling" | "won" | "lost";
export type Building = {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  protected: boolean;
  destroyed: boolean;
  color: number;
};
export const RADIUS = 3.05;
export const WINDUP = 0.48;
export const LAYOUT = LEVELS[0].layout;
export class Game {
  level = 0;
  phase: Phase = "intro";
  paused = false;
  x = 0;
  z = 5.55;
  facing = Math.PI;
  stomps = 3;
  time = 0;
  impactAge = 99;
  settleLeft = 0;
  buildings: Building[] = [];
  walkDistance = 0;
  lastHit: string[] = [];
  resultReason = "";
  windupAge = -1;
  private impactEvent: Building[] | null = null;
  constructor() {
    this.reset(false);
  }
  reset(start = true, level = this.level) {
    if (!Number.isInteger(level) || !LEVELS[level])
      throw new RangeError("Unknown district");
    this.level = level;
    this.phase = start ? "playing" : "intro";
    this.paused = false;
    [this.x, this.z] = LEVELS[level].spawn;
    this.facing = Math.PI;
    this.stomps = 3;
    this.time = 0;
    this.impactAge = 99;
    this.settleLeft = 0;
    this.walkDistance = 0;
    this.lastHit = [];
    this.resultReason = "";
    this.windupAge = -1;
    this.impactEvent = null;
    this.buildings = LEVELS[level].layout.map((b) => ({
      ...b,
      destroyed: false,
    }));
  }
  get targetCount() {
    return this.buildings.filter((b) => !b.protected).length;
  }
  get down() {
    return this.buildings.filter((b) => !b.protected && b.destroyed).length;
  }
  get shopSafe() {
    return !this.buildings.find((b) => b.protected)!.destroyed;
  }
  get canMove() {
    return (
      this.phase === "playing" &&
      !this.paused &&
      this.windupAge < 0 &&
      this.impactAge > 0.14
    );
  }
  get canStomp() {
    return this.canMove && this.stomps > 0 && this.impactAge > 0.65;
  }
  inReach(b: Building) {
    return !b.destroyed && Math.hypot(this.x - b.x, this.z - b.z) <= RADIUS;
  }
  move(x: number, z: number) {
    if (!this.canMove) return;
    const nx = Math.max(-8.2, Math.min(8.2, x)),
      nz = Math.max(-5.1, Math.min(5.1, z));
    const dx = nx - this.x,
      dz = nz - this.z;
    this.walkDistance += Math.hypot(dx, dz);
    if (Math.hypot(dx, dz) > 0.001) this.facing = Math.atan2(dx, dz);
    this.x = nx;
    this.z = nz;
  }
  stomp() {
    if (!this.canStomp) return false;
    this.windupAge = 0;
    return true;
  }
  takeImpact() {
    const event = this.impactEvent;
    this.impactEvent = null;
    return event;
  }
  private landStomp() {
    this.windupAge = -1;
    this.stomps--;
    this.impactAge = 0;
    const hit = this.buildings.filter((b) => this.inReach(b));
    for (const b of hit) b.destroyed = true;
    this.lastHit = hit.map((b) => b.id);
    this.impactEvent = hit;
    if (!this.shopSafe || this.down === this.targetCount || this.stomps === 0) {
      this.phase = "settling";
      this.settleLeft = 2.1;
    }
  }
  tick(dt: number) {
    if (this.paused || this.phase === "intro") return;
    dt = Math.min(Math.max(0, dt), 0.1);
    this.time += dt;
    this.impactAge += dt;
    if (this.windupAge >= 0) {
      this.windupAge += dt;
      if (this.windupAge >= WINDUP) this.landStomp();
    } else if (this.phase === "settling") {
      this.settleLeft -= dt;
      if (this.settleLeft <= 0) {
        this.phase =
          this.shopSafe && this.down === this.targetCount ? "won" : "lost";
        this.resultReason = !this.shopSafe
          ? "The noodle shop took a hit. Lunch is cancelled."
          : this.down < this.targetCount
            ? "Out of stomps. Those towers are still standing."
            : "All four towers down. Lunch survived.";
      }
    }
  }
}
