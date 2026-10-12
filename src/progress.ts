import { LEVELS } from "./levels.ts";
export const SAVE_KEY = "rumblecrumb.progress.v1";
export type Progress = { version: 1; best: number[] };
export function freshProgress(): Progress {
  return { version: 1, best: LEVELS.map(() => 0) };
}
export function readProgress(raw: string | null): Progress {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      value?.version !== 1 ||
      !Array.isArray(value.best) ||
      value.best.length !== LEVELS.length
    )
      return freshProgress();
    const best = value.best.map((n: unknown) =>
      Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 3 ? Number(n) : 0,
    );
    for (let i = 1; i < best.length; i++) if (!best[i - 1]) best[i] = 0;
    return { version: 1, best };
  } catch {
    return freshProgress();
  }
}
export function isUnlocked(p: Progress, index: number) {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < LEVELS.length &&
    (index === 0 || p.best[index - 1] > 0)
  );
}
export function recordWin(p: Progress, index: number, used: number): Progress {
  if (!isUnlocked(p, index) || !Number.isInteger(used) || used < 1 || used > 3)
    return p;
  const best = [...p.best];
  best[index] = best[index] ? Math.min(best[index], used) : used;
  return { version: 1, best };
}
export function finished(p: Progress) {
  return p.best.every((n) => n > 0);
}

export function loadProgress(read: () => string | null) {
  try {
    return { progress: readProgress(read()), available: true };
  } catch {
    return { progress: freshProgress(), available: false };
  }
}
export function persistProgress(write: (raw: string) => void, p: Progress) {
  try {
    write(JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
