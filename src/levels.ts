import type { Building } from "./simulation.ts";
export type District = {
  name: string;
  hint: string;
  spawn: [number, number];
  surface: number;
  road: number;
  sky: number;
  layout: Omit<Building, "destroyed">[];
};
const tower = (
  id: string,
  name: string,
  x: number,
  z: number,
  height: number,
  color: number,
): Omit<Building, "destroyed"> => ({
  id,
  name,
  x,
  z,
  width: 1.25,
  depth: 1.25,
  height,
  color,
  protected: false,
});
const noodles = (x: number, z: number): Omit<Building, "destroyed"> => ({
  id: "noodles",
  name: "NOODLE NOOK",
  x,
  z,
  width: 1.8,
  depth: 1.35,
  height: 1.75,
  color: 0xcbd497,
  protected: true,
});
export const LEVELS: District[] = [
  {
    name: "Lunch Break",
    hint: "Learn your reach. Spare lunch.",
    spawn: [0, 5.1],
    surface: 0xb6b48e,
    road: 0x747e70,
    sky: 0x182528,
    layout: [
      tower("a", "BOXWORKS", -3.2, -1.5, 2.9, 0xd69772),
      {
        ...tower("b", "PAPER PLAZA", -1.4, -2, 3.8, 0xdab885),
        width: 1.3,
        depth: 1.2,
      },
      tower("c", "TAPE TOWER", 3.1, -1.6, 3.4, 0xb9a284),
      {
        ...tower("d", "CRATE & CO.", 3.4, 1, 2.65, 0xd18e69),
        width: 1.4,
        depth: 1.2,
      },
      noodles(-0.05, 3.05),
    ],
  },
  {
    name: "Parcel Parade",
    hint: "Lunch moved. Mind the middle.",
    spawn: [0, 5.1],
    surface: 0xaabfc0,
    road: 0x6b8287,
    sky: 0x1c3037,
    layout: [
      tower("a", "STAMP STACK", -4, 0, 3.1, 0xd3a17d),
      tower("b", "WRAP WORKS", -2.4, -1.1, 2.6, 0x99bac0),
      tower("c", "POSTBOX HQ", 2.7, -3, 3.8, 0xe0b176),
      tower("d", "LABEL LAB", 4.5, -1.5, 3.2, 0xa1bfb0),
      noodles(0.8, 1.2),
    ],
  },
  {
    name: "Midnight Snack",
    hint: "Three stomps. Make each one count.",
    spawn: [-6.4, 4.9],
    surface: 0xb5abc7,
    road: 0x827b96,
    sky: 0x211f36,
    layout: [
      tower("a", "MOON MAIL", -3.7, -2.6, 3.3, 0xbca3cf),
      tower("b", "STAR STORAGE", -1.5, -3.6, 3.9, 0xddb484),
      tower("c", "NIGHT OFFICE", 4.6, -1.4, 3.5, 0x9ab6c3),
      tower("d", "DREAM DEPOT", 4.8, 3.8, 2.9, 0xc3a4b0),
      noodles(3.4, 1.2),
    ],
  },
];
