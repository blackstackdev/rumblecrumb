import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Game, RADIUS, WINDUP, type Building } from "./simulation.ts";
import { LEVELS } from "./levels.ts";
import {
  SAVE_KEY,
  freshProgress,
  loadProgress,
  persistProgress,
  isUnlocked,
  recordWin,
  finished,
  type Progress,
} from "./progress.ts";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const game = new Game();
const stored = loadProgress(() => localStorage.getItem(SAVE_KEY));
let progress: Progress = stored.progress,
  saveAvailable = stored.available;
const backupKey = SAVE_KEY + ".undo";
let backup = loadProgress(() => localStorage.getItem(backupKey)).progress;
let selectedLevel = progress.best.findIndex((n) => !n);
if (selectedLevel < 0) selectedLevel = 0;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const intro = $("intro"),
  hud = $("hud"),
  dialog = $("dialog"),
  controls = $("play-controls");
const pauseButton = $<HTMLButtonElement>("pause"),
  resetButton = $<HTMLButtonElement>("reset"),
  stompButton = $<HTMLButtonElement>("stomp-button");
let mode: "help" | "pause" | "result" | "clear" | "error" | null = null;
let ready = false,
  goal: THREE.Vector2 | null = null,
  goalStuck = 0,
  soundOn = false,
  audio: AudioContext | null = null;
let world: RAPIER.World,
  player: RAPIER.RigidBody,
  playerCollider: RAPIER.Collider,
  controller: RAPIER.KinematicCharacterController;
let lastTime = 0,
  lastRendered = 0,
  accumulator = 0,
  toastLeft = 0,
  frames = 0,
  frameTotal = 0,
  lastPhase = game.phase;
const keys = new Set<string>();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x182528);
scene.fog = new THREE.Fog(0x182528, 42, 100);
let renderer: THREE.WebGLRenderer;
const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, 0.1, 150);
const cameraTarget = new THREE.Vector3();
const size = new THREE.Vector2();
const occlusionRay = new THREE.Raycaster(),
  occlusionTarget = new THREE.Vector3(),
  occlusionDirection = new THREE.Vector3();
const towerWalls = new Map<
  THREE.Mesh,
  { id: string; material: THREE.MeshStandardMaterial }
>();
const buildings = new Map<
  string,
  { group: THREE.Group; body: RAPIER.RigidBody; halo: THREE.Mesh }
>();
const debris: { mesh: THREE.Mesh; body: RAPIER.RigidBody }[] = [];
const impactWaves: { mesh: THREE.Mesh; age: number }[] = [];
const paperBits: { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number }[] =
  [];
const dustPuffs: { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number }[] =
  [];
const dustMaterial = new THREE.MeshBasicMaterial({
  color: 0xead5ae,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
});
let noiseBuffer: AudioBuffer | null = null;
const board = new THREE.Group(),
  town = new THREE.Group(),
  crumb = new THREE.Group();
const worldMeshes = new THREE.Group();
const raycaster = new THREE.Raycaster(),
  pointer = new THREE.Vector2(),
  ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  point = new THREE.Vector3();
let floorBody: RAPIER.RigidBody;
const unitBox = new THREE.BoxGeometry(1, 1, 1),
  unitSphere = new THREE.SphereGeometry(1, 18, 12),
  unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const materials = new Map<string, THREE.MeshStandardMaterial>();
const buildingVisuals = new Map<
  string,
  { group: THREE.Group; halo: THREE.Mesh }
>();
const limbs: THREE.Group[] = [];
const face = new THREE.Group(),
  crown = new THREE.Group();
let boardSurface: THREE.Mesh, deskSurface: THREE.Mesh;
const roads: THREE.Mesh[] = [],
  districtStamps: THREE.Sprite[] = [];
const brows: THREE.Mesh[] = [];
let smile: THREE.Mesh, shock: THREE.Mesh, sweat: THREE.Mesh;

function mat(color: number, roughness = 0.88) {
  const key = `${color}-${roughness}`;
  if (!materials.has(key))
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key)!;
}
function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  const m = new THREE.Mesh(unitBox, mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function ball(
  parent: THREE.Object3D,
  r: number,
  x: number,
  y: number,
  z: number,
  color: number,
  squash?: [number, number, number],
) {
  const m = new THREE.Mesh(unitSphere, mat(color, 0.68));
  m.scale.set(...(squash ?? [r, r, r]));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cylinder(
  parent: THREE.Object3D,
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  const m = new THREE.Mesh(unitCylinder, mat(color));
  m.scale.set(r, h, r);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function sign(text: string, width: number, bg: string, fg: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = fg;
  ctx.font = "bold 37px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 68, 466);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t });
  const s = new THREE.Sprite(m);
  s.scale.set(width, width / 4, 1);
  return s;
}
function cardboardTexture(color: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 512);
  let v = 4163;
  for (let i = 0; i < 2200; i++) {
    v = (v * 1664525 + 1013904223) >>> 0;
    const x = v % 256;
    v = (v * 1664525 + 1013904223) >>> 0;
    const y = v % 512;
    ctx.fillStyle = i % 2 ? "#ffffff09" : "#3a26120c";
    ctx.fillRect(x, y, 1, 2);
  }
  ctx.strokeStyle = "#65432c35";
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, 246, 502);
  ctx.strokeRect(13, 13, 230, 486);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 2; col++) {
      const x = 38 + col * 109,
        y = 48 + row * 113;
      ctx.fillStyle = "#535e5b";
      ctx.fillRect(x, y, 55, 61);
      ctx.fillStyle = "#899388";
      ctx.fillRect(x + 4, y + 4, 47, 25);
      ctx.strokeStyle = "#c7af85";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, 55, 61);
      ctx.beginPath();
      ctx.moveTo(x + 27, y);
      ctx.lineTo(x + 27, y + 61);
      ctx.stroke();
    }
  ctx.fillStyle = "#f3d4a963";
  ctx.fillRect(119, 0, 18, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function halo(radius: number, color: number) {
  const geo = new THREE.RingGeometry(radius - 0.028, radius + 0.028, 64);
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, m);
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function makeBoard() {
  scene.add(board, town, crumb, worldMeshes);
  box(board, 19.7, 0.7, 14.8, 0, -0.36, 0, 0x98765c);
  box(board, 19.5, 0.12, 14.5, 0, -0.03, 0, 0xd3c29d);
  boardSurface = box(board, 18.4, 0.045, 13.5, 0, 0.035, 0, 0xb6b48e);
  for (let i = 0; i < 10; i++) {
    box(board, 0.007, 0.01, 13.5, -8.5 + i * 1.8, 0.065, 0, 0x9b9c7730);
  }
  roads.push(
    box(board, 15, 0.02, 2.05, 0, 0.075, 0.8, 0x747e70),
    box(board, 1.7, 0.02, 10.7, 0.05, 0.076, -0.6, 0x747e70),
  );
  for (let i = -7; i <= 7; i += 1.15)
    box(board, 0.5, 0.025, 0.045, i, 0.09, 0.8, 0xe2d5b4);
  for (let z = -5; z < 4; z += 1.0)
    box(board, 0.05, 0.025, 0.45, 0.05, 0.09, z, 0xe2d5b4);
  // Cardboard kerbs and scraps preserve the miniature's handmade character.
  for (const z of [-0.25, 1.85])
    box(board, 15, 0.1, 0.12, 0, 0.08, z, 0xcec19b);
  for (const x of [-0.85, 0.95])
    box(board, 0.12, 0.1, 10.2, x, 0.08, -0.65, 0xcec19b);
  const corners = [
    [-7.1, -4.7],
    [7.4, -4.4],
    [-7, 3.9],
    [6.7, 4.4],
  ];
  for (const [x, z] of corners) {
    box(board, 0.7, 0.28, 0.7, x, 0.2, z, 0xc09e73);
    cylinder(board, 0.09, 0.65, x, 0.55, z, 0x7f7460);
    ball(board, 0.55, x, 0.99, z, 0x7f9659, [0.55, 0.6, 0.5]);
    ball(board, 0.38, x + 0.22, 1.15, z - 0.07, 0x8da865);
  }
  const pencil = new THREE.Group();
  box(pencil, 0.19, 0.19, 8, 0, 0, 0, 0xe3b455);
  cylinder(pencil, 0.14, 0.48, 0, 0, 4.1, 0xc99b80).rotation.x = Math.PI / 2;
  pencil.position.set(-10.1, -0.15, 0);
  pencil.rotation.y = 0.12;
  board.add(pencil);
  box(board, 4.4, 0.1, 3, 6, -0.1, -8.7, 0x466459).rotation.y = -0.18;
  box(board, 4.0, 0.04, 2.7, 6, -0.03, -8.7, 0xe8dec6).rotation.y = -0.18;
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mat(0x27382f));
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = -1.2;
  desk.receiveShadow = true;
  scene.add(desk);
  deskSurface = desk;
  for (let i = 0; i < LEVELS.length; i++) {
    const stamp = sign(
      `${LEVELS[i].name.toUpperCase()} / 0${i + 1}`,
      4.7,
      "#d3c29d",
      "#5b654c",
    );
    stamp.position.set(0, 0.27, -6.55);
    board.add(stamp);
    stamp.visible = i === 0;
    districtStamps.push(stamp);
  }
}

function makeCrumb() {
  ball(crumb, 0.9, 0, 1.02, 0, 0xa9c77a, [0.72, 0.96, 0.61]);
  ball(crumb, 0.8, 0, 1.82, 0.09, 0xbdd489, [0.82, 0.68, 0.66]);
  ball(crumb, 0.6, 0, 1.02, 0.5, 0xe0dda9, [0.49, 0.58, 0.12]);
  const tail = new THREE.Group();
  tail.position.set(0, 0.55, -0.4);
  for (let i = 0; i < 4; i++)
    ball(tail, 0.25, 0, -i * 0.05, -0.17 - i * 0.23, 0x9ab870, [
      0.26 - i * 0.04,
      0.23 - i * 0.03,
      0.28 - i * 0.04,
    ]);
  crumb.add(tail);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.43, 0.32, 0.07);
    ball(leg, 0.3, 0, 0, 0, 0x93b269, [0.28, 0.39, 0.28]);
    ball(leg, 0.25, 0, -0.21, 0.2, 0xaac679, [0.34, 0.18, 0.39]);
    for (let n = 0; n < 3; n++)
      ball(
        leg,
        0.07,
        -0.15 + n * 0.15,
        -0.22,
        0.51,
        0xeee2bf,
        [0.065, 0.06, 0.1],
      );
    crumb.add(leg);
    limbs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(side * 0.73, 1.38, 0.05);
    ball(arm, 0.21, 0, -0.19, 0, 0x98b56b, [0.22, 0.39, 0.23]);
    ball(arm, 0.24, side * 0.03, -0.45, 0.12, 0xb1ca7d);
    crumb.add(arm);
    limbs.push(arm);
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.4, 8),
      mat(0xf0dfaa),
    );
    horn.position.set(side * 0.52, 2.4, -0.13);
    horn.rotation.z = side * -0.2;
    horn.castShadow = true;
    crumb.add(horn);
  }
  crumb.add(crown);
  crown.position.y = 2.55;
  crown.visible = false;
  cylinder(crown, 0.43, 0.12, 0, 0, 0, 0xe7bd65);
  for (const x of [-0.3, 0, 0.3])
    box(crown, 0.12, 0.25, 0.09, x, 0.15, 0.28, 0xffda81);
  crumb.add(face);
  face.position.set(0, 1.92, 0.6);
  for (const x of [-0.29, 0.29]) {
    ball(face, 0.19, x, 0.1, 0, 0xf3edcf, [0.2, 0.23, 0.1]);
    ball(face, 0.095, x, 0.11, 0.09, 0x243e33, [0.097, 0.126, 0.05]);
    ball(face, 0.033, x - 0.025, 0.155, 0.13, 0xffffff);
    ball(face, 0.095, x * 1.65, -0.18, -0.04, 0xdab490, [0.13, 0.075, 0.05]);
  }
  const smilePoints = [];
  for (let i = 0; i <= 16; i++) {
    const x = -0.25 + (i * 0.5) / 16;
    smilePoints.push(
      new THREE.Vector3(x, -0.15 - Math.sin((i / 16) * Math.PI) * 0.11, 0.07),
    );
  }
  const mouthGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(smilePoints),
    18,
    0.026,
    6,
    false,
  );
  smile = new THREE.Mesh(mouthGeo, mat(0x38513c));
  face.add(smile);
  shock = ball(face, 0.15, 0, -0.2, 0.08, 0x38513c, [0.13, 0.19, 0.035]);
  shock.visible = false;
  sweat = ball(face, 0.08, 0.57, 0.1, 0, 0xadd8e0, [0.07, 0.15, 0.04]);
  sweat.visible = false;
  for (const side of [-1, 1])
    brows.push(box(face, 0.22, 0.035, 0.03, side * 0.29, 0.37, 0.04, 0x38513c));
  for (let i = 0; i < 3; i++)
    ball(crumb, 0.14, 0, 1.3 + i * 0.35, -0.6, 0x8ba664, [0.11, 0.19, 0.12]);
}

const reach = halo(RADIUS, 0xc6df8e);
reach.position.y = 0.12;
scene.add(reach);
reach.visible = false;
const destination = halo(0.24, 0xf0cc9e);
destination.position.y = 0.13;
scene.add(destination);
destination.visible = false;
function comicImpact() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.font = "italic 900 139px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#304b3e";
  ctx.strokeText("KRA-THOOM!", 512, 131, 965);
  ctx.fillStyle = "#ffdaad";
  ctx.fillText("KRA-THOOM!", 512, 131, 965);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      rotation: 0.09,
      depthTest: false,
    }),
  );
  sprite.scale.set(4, 1, 1);
  return sprite;
}
const impactWord = comicImpact();
scene.add(impactWord);
impactWord.visible = false;

function clearTown() {
  for (const { mesh, body } of debris) {
    world.removeRigidBody(body);
    worldMeshes.remove(mesh);
  }
  debris.length = 0;
  for (const b of buildings.values()) world.removeRigidBody(b.body);
  buildings.clear();
  town.clear();
  for (const wall of towerWalls.values()) {
    wall.material.opacity = 1;
  }
  for (const p of paperBits) worldMeshes.remove(p.mesh);
  paperBits.length = 0;
  for (const p of dustPuffs) worldMeshes.remove(p.mesh);
  dustPuffs.length = 0;
  impactWord.visible = false;
  for (const w of impactWaves) {
    worldMeshes.remove(w.mesh);
    w.mesh.geometry.dispose();
    (w.mesh.material as THREE.Material).dispose();
  }
  impactWaves.length = 0;
}
function buildTown() {
  for (const b of game.buildings) {
    const visualKey = `${game.level}:${b.id}`,
      cached = buildingVisuals.get(visualKey);
    if (cached) {
      town.add(cached.group);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.height / 2, b.z),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(b.width / 2, b.height / 2, b.depth / 2),
        body,
      );
      buildings.set(b.id, { ...cached, body });
      continue;
    }
    const group = new THREE.Group();
    group.position.set(b.x, 0, b.z);
    town.add(group);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.height / 2, b.z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(b.width / 2, b.height / 2, b.depth / 2),
      body,
    );
    const ring = halo(
      Math.max(b.width, b.depth) * 0.78,
      b.protected ? 0xcce690 : 0xf5bc8d,
    );
    ring.position.set(0, 0.12, 0);
    group.add(ring);
    if (!b.protected) {
      const t = cardboardTexture(`#${b.color.toString(16)}`);
      const textured = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
      const wall = new THREE.Mesh(unitBox, textured);
      wall.scale.set(b.width, b.height, b.depth);
      wall.position.y = b.height / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
      textured.transparent = true;
      towerWalls.set(wall, { id: visualKey, material: textured });
      box(
        group,
        b.width + 0.08,
        0.1,
        b.depth + 0.08,
        0,
        b.height + 0.04,
        0,
        0xe3c79f,
      );
      box(group, 0.22, 0.11, b.depth + 0.1, 0, b.height + 0.06, 0, 0xf1d6a9);
      const label = sign(b.name, b.width * 1.4, "#eeccae", "#5b4c3d");
      label.position.set(0, b.height * 0.68, b.depth / 2 + 0.03);
      group.add(label);
      cylinder(group, 0.025, 0.6, b.width * 0.36, b.height + 0.36, 0, 0x876746);
      box(
        group,
        0.48,
        0.27,
        0.025,
        b.width * 0.36 + 0.22,
        b.height + 0.5,
        0,
        0xef936c,
      );
      const n = sign("TOPPLE", 1.25, "#b36b4b", "#fff0d1");
      n.position.set(0, b.height + 0.97, 0);
      group.add(n);
    } else {
      box(group, b.width, b.height, b.depth, 0, b.height / 2, 0, 0xd4d8a4);
      box(
        group,
        b.width + 0.28,
        0.17,
        b.depth + 0.27,
        0,
        b.height + 0.12,
        0,
        0x3b6a56,
      );
      const roof = box(
        group,
        b.width + 0.4,
        0.1,
        b.depth + 0.42,
        0,
        b.height + 0.26,
        0,
        0x52785c,
      );
      roof.rotation.z = 0.045;
      for (let x = -0.78; x < 0.9; x += 0.32)
        box(
          group,
          0.17,
          0.3,
          0.1,
          x,
          b.height - 0.08,
          b.depth / 2 + 0.08,
          0xe8c998,
        );
      const label = sign("NOODLE NOOK", 2.3, "#284b40", "#f2dfaf");
      label.position.set(0, 1.12, 0.74);
      group.add(label);
      const protect = sign("SAVE LUNCH ♡", 2.35, "#c9df9b", "#314d35");
      protect.position.set(0, b.height + 1.05, 0);
      group.add(protect);
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(0xf1e2bc),
      );
      bowl.rotation.x = Math.PI;
      bowl.position.set(0.68, b.height + 0.42, 0.38);
      group.add(bowl);
      const sticks = box(
        group,
        0.025,
        0.42,
        0.025,
        0.66,
        b.height + 0.7,
        0.35,
        0x966648,
      );
      sticks.rotation.z = 0.4;
    }
    buildingVisuals.set(visualKey, { group, halo: ring });
    buildings.set(b.id, { group, body, halo: ring });
  }
}

function destroyBuilding(b: Building) {
  const entry = buildings.get(b.id)!;
  town.remove(entry.group);
  world.removeRigidBody(entry.body);
  buildings.delete(b.id);
  const layers = b.protected ? 2 : 4;
  for (let y = 0; y < layers; y++)
    for (let x = 0; x < 2; x++) {
      const w = b.width / 2 - 0.035,
        h = b.height / layers - 0.03,
        d = b.depth * 0.83;
      const mesh = new THREE.Mesh(unitBox, mat(b.color));
      mesh.scale.set(w, h, d);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const px = b.x + ((x - 0.5) * b.width) / 2,
        py = ((y + 0.5) * b.height) / layers,
        pz = b.z;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(px, py, pz)
          .setLinearDamping(0.55)
          .setAngularDamping(0.8),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
          .setFriction(0.82)
          .setRestitution(0.12)
          .setDensity(0.4),
        body,
      );
      const dir = new THREE.Vector2(px - game.x, pz - game.z).normalize();
      const strength = 2.1 + y * 0.42;
      body.setLinvel(
        {
          x: dir.x * strength + (x - 0.5) * 0.85,
          y: 2.5 + y * 0.33,
          z: dir.y * strength,
        },
        true,
      );
      body.setAngvel(
        { x: 0.7 + y * 0.12, y: (x - 0.5) * 1.2, z: dir.x * 0.9 },
        true,
      );
      mesh.position.set(px, py, pz);
      worldMeshes.add(mesh);
      debris.push({ mesh, body });
    }
}
function sound(kind: "stomp" | "windup" | "win" | "lose") {
  if (!soundOn || !audio) return;
  const now = audio.currentTime;
  const tones =
    kind === "win"
      ? [261.6, 329.6, 392, 523.2]
      : kind === "lose"
        ? [220, 174.6, 130.8]
        : kind === "windup"
          ? [110]
          : [96, 52];
  tones.forEach((freq, i) => {
    const osc = audio!.createOscillator(),
      gain = audio!.createGain();
    const t = now + i * 0.1;
    osc.type = kind === "stomp" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (kind === "stomp")
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.34);
    if (kind === "windup")
      osc.frequency.exponentialRampToValueAtTime(190, t + 0.2);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(
      kind === "stomp" ? 0.19 : kind === "windup" ? 0.045 : 0.065,
      t + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 0.45);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
  if (kind === "stomp") {
    noiseBuffer ??= audio.createBuffer(
      1,
      Math.floor(audio.sampleRate * 0.3),
      audio.sampleRate,
    );
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = audio.createBufferSource(),
      filter = audio.createBiquadFilter(),
      gain = audio.createGain();
    source.buffer = noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1700, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.28);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start();
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
}
function toast(text: string) {
  $("announcement").textContent = text;
  $("announcement").classList.add("visible");
  toastLeft = 3;
}
function stomp() {
  if (!game.stomp()) return;
  goal = null;
  keys.clear();
  sound("windup");
  updateHud();
}
function impact(hit: Building[]) {
  sound("stomp");
  for (const b of hit) destroyBuilding(b);
  for (let i = 0; i < 3; i++) {
    const mesh = halo(0.65, 0xf3d5a3);
    mesh.position.set(game.x, 0.14 + i * 0.01, game.z);
    worldMeshes.add(mesh);
    impactWaves.push({ mesh, age: -i * 0.07 });
  }
  impactWord.position.set(game.x, 3.0, game.z);
  impactWord.visible = true;
  for (let i = 0; i < 42; i++) {
    const m = new THREE.Mesh(unitBox, mat(i % 3 === 0 ? 0xece1bd : 0xc5ad83));
    m.scale.set(0.07 + (i % 4) * 0.02, 0.018, 0.16);
    m.position.set(game.x, 0.18, game.z);
    const a = (i / 42) * Math.PI * 2,
      speed = 2.6 + (i % 5) * 0.4;
    worldMeshes.add(m);
    paperBits.push({
      mesh: m,
      velocity: new THREE.Vector3(
        Math.cos(a) * speed,
        2.8 + (i % 4) * 0.4,
        Math.sin(a) * speed,
      ),
      age: 0,
    });
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2,
      m = new THREE.Mesh(unitSphere, dustMaterial);
    m.scale.set(0.22, 0.12, 0.22);
    m.position.set(
      game.x + Math.cos(a) * 0.5,
      0.14,
      game.z + Math.sin(a) * 0.5,
    );
    worldMeshes.add(m);
    dustPuffs.push({
      mesh: m,
      velocity: new THREE.Vector3(Math.cos(a) * 2.7, 0.18, Math.sin(a) * 2.7),
      age: 0,
    });
  }
  toast(
    hit.some((b) => b.protected)
      ? "Oh, Crumb. That was the noodle shop."
      : hit.length
        ? `${hit.length} tower${hit.length > 1 ? "s" : ""} down. ${game.stomps} stomp${game.stomps !== 1 ? "s" : ""} left.`
        : "A big stomp. A very small result.",
  );
  updateHud();
}

function reset(start = true, level = selectedLevel) {
  selectedLevel = level;
  keys.clear();
  goal = null;
  goalStuck = 0;
  game.reset(start, level);
  accumulator = 0;
  const district = LEVELS[level];
  boardSurface.material = mat(district.surface);
  roads.forEach((r) => (r.material = mat(district.road)));
  deskSurface.material = mat(level === 0 ? 0x27382f : district.sky);
  (scene.background as THREE.Color).setHex(district.sky);
  (scene.fog as THREE.Fog).color.setHex(district.sky);
  districtStamps.forEach((stamp, i) => (stamp.visible = i === level));
  resize();
  clearTown();
  buildTown();
  player.setTranslation({ x: game.x, y: 0.85, z: game.z }, true);
  player.setNextKinematicTranslation({ x: game.x, y: 0.85, z: game.z });
  dialog.hidden = true;
  intro.hidden = start;
  hud.hidden = !start;
  controls.hidden = !start;
  mode = null;
  lastPhase = game.phase;
  $("announcement").classList.remove("visible");
  $("announcement").textContent = "";
  toastLeft = 0;
  updateHud();
  renderDistricts();
  if (start) renderer.domElement.focus({ preventScroll: true });
}
function updateHud() {
  $("district-tag").textContent =
    `0${game.level + 1} / ${LEVELS[game.level].name.toUpperCase()}`;
  $("targets").textContent = `${game.down} / ${game.targetCount}`;
  $("stomps").textContent = Array.from({ length: 3 }, (_, i) =>
    i < game.stomps ? "●" : "○",
  ).join(" ");
  $("shop-state").textContent = game.shopSafe
    ? "NOODLES SAFE ♡"
    : "LUNCH CANCELLED";
  pauseButton.disabled =
    game.phase === "intro" || game.phase === "won" || game.phase === "lost";
  resetButton.disabled = game.phase === "intro";
  stompButton.disabled = !game.canStomp;
  pauseButton.textContent = game.paused ? "Resume" : "Pause";
  const inRange = game.buildings.filter((b) => game.inReach(b));
  const danger = inRange.some((b) => b.protected);
  $("aim-info").textContent =
    game.windupAge >= 0
      ? "Big feet. Bigger commitment…"
      : game.phase === "settling"
        ? "Let the cardboard settle…"
        : danger
          ? "Careful! The noodle shop is in your stomp ring."
          : `${inRange.length ? `${inRange.length} tower${inRange.length > 1 ? "s" : ""} in reach` : "Walk close. The ring shows your reach."} · Space to stomp`;
  (reach.material as THREE.MeshBasicMaterial).color.setHex(
    danger ? 0xe99472 : 0xc6df8e,
  );
  document.body.dataset.district = String(game.level + 1);
  document.body.dataset.savedBest = progress.best.join(",");
  document.body.dataset.phase = game.phase;
  document.body.dataset.paused = String(game.paused);
  document.body.dataset.position = `${game.x.toFixed(2)},${game.z.toFixed(2)}`;
  document.body.dataset.debris = String(debris.length);
  document.body.dataset.stompStage =
    game.windupAge >= 0 ? "windup" : game.impactAge < 0.65 ? "impact" : "ready";
  document.body.dataset.effectParticles = String(
    paperBits.length + dustPuffs.length,
  );
  document.body.dataset.reaction =
    game.phase === "won"
      ? "celebrate"
      : game.phase === "lost"
        ? !game.shopSafe
          ? "horror"
          : "sulk"
        : "none";
  if (world) document.body.dataset.rigidBodies = String(world.bodies.len());
}
function saveProgress() {
  saveAvailable = persistProgress(
    (raw) => localStorage.setItem(SAVE_KEY, raw),
    progress,
  );
}
function renderDistricts() {
  const list = $("district-list");
  list.replaceChildren();
  LEVELS.forEach((district, i) => {
    const button = document.createElement("button");
    button.className = "district-choice";
    button.disabled = !ready || !isUnlocked(progress, i);
    button.setAttribute("aria-pressed", String(selectedLevel === i));
    button.setAttribute("aria-label", `District ${i + 1}: ${district.name}`);
    const number = document.createElement("span");
    number.className = "district-number";
    number.textContent = `0${i + 1}`;
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = district.name;
    const note = document.createElement("small");
    note.textContent = !isUnlocked(progress, i)
      ? `Clear District ${i} to unlock`
      : progress.best[i]
        ? `Lunch saved · best ${progress.best[i]} stomp${progress.best[i] === 1 ? "" : "s"}`
        : "4 towers · 3 stomps";
    text.append(name, note);
    const status = document.createElement("span");
    status.className = "district-mark";
    status.textContent = !isUnlocked(progress, i)
      ? "—"
      : progress.best[i]
        ? "✓"
        : "↗";
    button.append(number, text, status);
    button.addEventListener("click", () => reset(false, i));
    list.append(button);
  });
  $("district-hint").textContent = LEVELS[selectedLevel].hint;
  $("start").textContent = progress.best[selectedLevel]
    ? "Replay this district ↗"
    : "Let Crumb loose ↗";
  $("save-status").textContent = saveAvailable
    ? "Progress stays in this browser. No account needed."
    : "Progress is temporary: this browser could not save it.";
  $("clear-progress").hidden = !progress.best.some((n) => n > 0);
  $("undo-progress").hidden = !backup.best.some((n) => n > 0);
  $("intro-description").textContent = finished(progress)
    ? "Three lunches saved. Your cardboard crown is earned. Replay a district and beat your best."
    : "Three tiny districts. One hungry monster. Flatten the towers. Spare the noodle shop.";
}
function openMap() {
  if (ready) reset(false, selectedLevel);
}
function showDialog(type: typeof mode) {
  mode = type;
  dialog.hidden = false;
  $("dialog-close").hidden = type === "error";
  $("dialog-map").hidden = type !== "result";
  $("dialog-close").textContent =
    type === "result"
      ? "Replay this district ↻"
      : type === "clear"
        ? "Keep my progress"
        : "Back to the city";
  const a = $<HTMLButtonElement>("dialog-action");
  a.hidden = false;
  if (type === "help") {
    $("dialog-eyebrow").textContent = "A SMALL GUIDE TO BIG FEET";
    $("dialog-title").textContent = "Aim for chaos. Save lunch.";
    $("dialog-description").textContent =
      "Move with WASD or arrows, click the tabletop to walk, or hold the on-screen arrows.\n\nYour ring marks the stomp radius. Walk near the orange towers, then press Space or STOMP. The ring turns orange when the noodle shop is in danger.\n\nCrumb plants his feet for a short wind-up before each hit: your aim stays locked until he lands.\n\nFour towers. Three stomps. No timer. Escape pauses. R restarts.";
    a.textContent = "Got it";
  }
  if (type === "pause") {
    $("dialog-eyebrow").textContent = "A LITTLE BREATHER";
    $("dialog-title").textContent = "Crumb is resting.";
    $("dialog-description").textContent =
      "The city can wait. Your stomps are right where you left them.";
    a.textContent = "Back to stomping";
  }
  if (type === "result") {
    const won = game.phase === "won",
      last = game.level === LEVELS.length - 1;
    $("dialog-eyebrow").textContent =
      won && last
        ? "CARDBOARD CROWN EARNED"
        : won
          ? "DISTRICT CLEARED"
          : "A MINOR CARDBOARD INCIDENT";
    $("dialog-title").textContent =
      won && last
        ? "Tiny menace. Legendary lunch."
        : won
          ? "Big mess. Lunch intact."
          : !game.shopSafe
            ? "You flattened lunch."
            : "Still a few boxes standing.";
    $("dialog-description").textContent =
      won && last
        ? `Three districts flattened. Three lunches saved.\nBest across all districts: ${progress.best.reduce((n, b) => n + b, 0)} stomps. The crown is yours.`
        : won
          ? `${game.down} towers toppled in ${3 - game.stomps} stomps.\nBest here: ${progress.best[game.level]} stomps. The noodle shop lives another day.`
          : game.resultReason + "\nWatch the orange ring. Try a new position.";
    a.textContent = won
      ? last
        ? "Back to districts ↗"
        : "Next district ↗"
      : "Give Crumb another go ↻";
    $("dialog-map").hidden = won && last;
    if (!saveAvailable && won)
      $("dialog-description").textContent +=
        "\nProgress is temporary: this browser could not save it.";
  }
  if (type === "clear") {
    $("dialog-eyebrow").textContent = "A FRESH CARDBOARD CITY";
    $("dialog-title").textContent = "Reset your progress?";
    $("dialog-description").textContent =
      "This resets unlocks and best stomp counts in this browser. You can undo it from the districts screen.";
    a.textContent = "Yes, reset progress";
  }
}
function closeDialog() {
  if (mode === "clear") {
    dialog.hidden = true;
    mode = null;
    return;
  }
  if (mode === "result") {
    reset();
    return;
  }
  dialog.hidden = true;
  mode = null;
  game.paused = false;
  keys.clear();
  updateHud();
  renderer.domElement.focus({ preventScroll: true });
}
function togglePause() {
  if (!ready || game.phase === "intro" || ["won", "lost"].includes(game.phase))
    return;
  if (game.paused) closeDialog();
  else {
    game.paused = true;
    keys.clear();
    showDialog("pause");
    updateHud();
  }
}
function move(dx: number, dz: number, dt: number) {
  if (!game.canMove) return;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;
  const speed = 3.55;
  controller.computeColliderMovement(
    playerCollider,
    { x: (dx / length) * speed * dt, y: 0, z: (dz / length) * speed * dt },
    RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
  );
  const allowed = controller.computedMovement();
  if (goal) {
    goalStuck = Math.hypot(allowed.x, allowed.z) < 0.005 ? goalStuck + dt : 0;
    if (goalStuck > 1) {
      goal = null;
      goalStuck = 0;
      toast("A box is in the way. Click a clear spot to walk.");
    }
  }
  game.move(game.x + allowed.x, game.z + allowed.z);
  player.setNextKinematicTranslation({ x: game.x, y: 0.85, z: game.z });
}
function actionDirection(action: string) {
  return action === "up"
    ? [0, -1]
    : action === "down"
      ? [0, 1]
      : action === "left"
        ? [-1, 0]
        : [1, 0];
}
function keyAction(code: string) {
  return ["KeyW", "ArrowUp", "w"].includes(code)
    ? "up"
    : ["KeyS", "ArrowDown", "s"].includes(code)
      ? "down"
      : ["KeyA", "ArrowLeft", "a"].includes(code)
        ? "left"
        : ["KeyD", "ArrowRight", "d"].includes(code)
          ? "right"
          : null;
}

$("start").addEventListener("click", () => {
  if (ready) reset();
});
$("reset").addEventListener("click", () => {
  if (ready) reset();
});
$("stomp-button").addEventListener("click", stomp);
$("pause").addEventListener("click", togglePause);
$("help").addEventListener("click", () => {
  if (!ready) return;
  game.paused = true;
  keys.clear();
  showDialog("help");
  updateHud();
});
$("dialog-close").addEventListener("click", closeDialog);
$("dialog-action").addEventListener("click", () => {
  if (mode === "clear") {
    backup = progress;
    persistProgress((raw) => localStorage.setItem(backupKey, raw), backup);
    progress = freshProgress();
    saveProgress();
    reset(false, 0);
    return;
  }
  if (mode === "result") {
    if (game.phase === "won" && game.level < LEVELS.length - 1)
      reset(true, game.level + 1);
    else if (game.phase === "won") openMap();
    else reset();
    return;
  }
  closeDialog();
});
$("dialog-map").addEventListener("click", openMap);
$("map").addEventListener("click", openMap);
$("clear-progress").addEventListener("click", () => showDialog("clear"));
$("undo-progress").addEventListener("click", () => {
  progress = backup;
  backup = freshProgress();
  persistProgress((raw) => localStorage.setItem(backupKey, raw), backup);
  saveProgress();
  reset(
    false,
    progress.best.findIndex((n) => !n) < 0
      ? 0
      : progress.best.findIndex((n) => !n),
  );
});
$("sound").addEventListener("click", () => {
  soundOn = !soundOn;
  if (soundOn) {
    audio ??= new AudioContext();
    void audio.resume();
  }
  $("sound").textContent = soundOn ? "Sound on" : "Sound off";
  $("sound").setAttribute(
    "aria-label",
    soundOn ? "Mute sound" : "Enable sound",
  );
});
window.addEventListener("keydown", (e) => {
  const action = keyAction(e.code) || keyAction(e.key);
  if (action || ["Space", "Escape", "KeyR"].includes(e.code))
    e.preventDefault();
  if (e.target instanceof HTMLButtonElement && e.code === "Space") return;
  if (e.code === "Escape" && !e.repeat) {
    if (!dialog.hidden && (mode === "help" || mode === "clear")) closeDialog();
    else togglePause();
    return;
  }
  if (e.code === "KeyR" && !e.repeat && ready && game.phase !== "intro") {
    reset();
    return;
  }
  if ((e.code === "Space" || e.key === " ") && !e.repeat) {
    stomp();
    return;
  }
  if (action && game.canMove) {
    renderer.domElement.focus({ preventScroll: true });
    goal = null;
    if (!keys.has(action)) {
      const [dx, dz] = actionDirection(action);
      move(dx, dz, 0.1);
      world.step();
    }
    keys.add(action);
  }
});
window.addEventListener("keyup", (e) => {
  const action = keyAction(e.code) || keyAction(e.key);
  if (action) keys.delete(action);
});
window.addEventListener("blur", () => {
  keys.clear();
  if (ready && game.phase === "playing" && !game.paused) togglePause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    if (ready && ["playing", "settling"].includes(game.phase) && !game.paused)
      togglePause();
  }
  lastTime = 0;
  accumulator = 0;
});
document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((b) => {
  const action = b.dataset.move!;
  b.addEventListener("pointerdown", (e) => {
    if (!game.canMove) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    goal = null;
    const [dx, dz] = actionDirection(action);
    move(dx, dz, 0.1);
    world.step();
    keys.add(action);
  });
  const release = () => keys.delete(action);
  b.addEventListener("pointerup", release);
  b.addEventListener("pointercancel", release);
  b.addEventListener("lostpointercapture", release);
  b.addEventListener("click", (e) => {
    if (e.detail === 0 && game.canMove) {
      const [dx, dz] = actionDirection(action);
      move(dx, dz, 0.1);
      world.step();
    }
  });
});

function resize() {
  const width = innerWidth,
    height = innerHeight,
    aspect = width / height;
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const span = ["won", "lost"].includes(game.phase)
    ? width < 760
      ? 16
      : 14
    : width < 760
      ? width < height
        ? 28 / aspect
        : 22
      : game.phase === "intro"
        ? 28
        : 20;
  camera.left = (-span * aspect) / 2;
  camera.right = (span * aspect) / 2;
  camera.top = span / 2;
  camera.bottom = -span / 2;
  camera.updateProjectionMatrix();
}

function frame(time: number) {
  const limit = game.paused || game.phase === "intro" ? 30 : 60;
  if (time - lastRendered < 1000 / limit - 0.1) return;
  lastRendered = time;
  const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
  lastTime = time;
  frames++;
  frameTotal += dt;
  if (!game.paused && game.phase !== "intro") {
    accumulator = Math.min(accumulator + dt, 0.09);
    while (accumulator >= 1 / 60) {
      let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0),
        dz = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
      if (goal && game.canMove) {
        dx = goal.x - game.x;
        dz = goal.y - game.z;
        if (Math.hypot(dx, dz) < 0.12) {
          goal = null;
          dx = dz = 0;
        }
      }
      move(dx, dz, 1 / 60);
      game.tick(1 / 60);
      const hit = game.takeImpact();
      if (hit) impact(hit);
      world.step();
      accumulator -= 1 / 60;
    }
    for (const d of debris) {
      const p = d.body.translation(),
        q = d.body.rotation();
      d.mesh.position.set(p.x, p.y, p.z);
      d.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    for (let i = impactWaves.length - 1; i >= 0; i--) {
      const w = impactWaves[i];
      w.age += dt;
      w.mesh.visible = w.age >= 0;
      w.mesh.scale.setScalar(1 + Math.max(0, w.age) * 6);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.7 - w.age,
      );
      if (w.age > 1) {
        worldMeshes.remove(w.mesh);
        w.mesh.geometry.dispose();
        (w.mesh.material as THREE.Material).dispose();
        impactWaves.splice(i, 1);
      }
    }
    for (let i = paperBits.length - 1; i >= 0; i--) {
      const b = paperBits[i];
      b.age += dt;
      b.velocity.y -= 6 * dt;
      b.mesh.position.addScaledVector(b.velocity, dt);
      b.mesh.position.y = Math.max(0.08, b.mesh.position.y);
      b.mesh.rotation.x += dt * 3;
      b.mesh.rotation.z += dt * 2;
      if (b.age > 1.8) {
        worldMeshes.remove(b.mesh);
        paperBits.splice(i, 1);
      }
    }
    for (let i = dustPuffs.length - 1; i >= 0; i--) {
      const p = dustPuffs[i];
      p.age += dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.scale.set(
        0.22 + p.age * 0.75,
        0.12 + p.age * 0.25,
        0.22 + p.age * 0.75,
      );
      dustMaterial.opacity = Math.max(0, 0.32 * (1 - p.age / 1.05));
      if (p.age > 1.05) {
        worldMeshes.remove(p.mesh);
        dustPuffs.splice(i, 1);
      }
    }
    if (toastLeft > 0) {
      toastLeft -= dt;
      if (toastLeft <= 0) $("announcement").classList.remove("visible");
    }
  }
  const now = game.time;
  crumb.position.set(game.x, 0, game.z);
  const idle = Math.sin(now * 2.3) * 0.035,
    gait = game.walkDistance * 7;
  const active = game.canMove && (keys.size > 0 || !!goal);
  limbs[0].rotation.x = active ? Math.sin(gait) * 0.42 : 0;
  limbs[2].rotation.x = active ? -Math.sin(gait) * 0.42 : 0;
  limbs[1].rotation.x = active ? -Math.sin(gait) * 0.22 : 0;
  limbs[3].rotation.x = active ? Math.sin(gait) * 0.22 : 0;
  for (const limb of limbs) limb.rotation.z = 0;
  limbs[1].position.y = limbs[3].position.y = 1.38;
  const a = game.impactAge,
    w = game.windupAge;
  crumb.scale.set(1, 1, 1);
  crumb.position.y = idle;
  crumb.rotation.z = 0;
  crumb.rotation.x = 0;
  if (w >= 0) {
    const p = w / WINDUP;
    if (p < 0.45) {
      const q = Math.sin(((p / 0.45) * Math.PI) / 2);
      crumb.scale.set(1 + 0.18 * q, 1 - 0.24 * q, 1 + 0.12 * q);
      crumb.rotation.x = 0.12 * q;
      limbs[1].rotation.x = -0.8 * q;
      limbs[3].rotation.x = -0.8 * q;
    } else {
      const q = (p - 0.45) / 0.55;
      crumb.position.y = Math.sin(q * Math.PI) * 0.72;
      crumb.scale.set(0.92, 1.16, 1);
      limbs[1].rotation.x = -1.65;
      limbs[3].rotation.x = -1.65;
      limbs[2].rotation.x = -0.55;
    }
  } else if (a < 0.6) {
    const squash = Math.max(0, 1 - a / 0.17),
      bounce = Math.sin(Math.min(1, a / 0.6) * Math.PI) * 0.16;
    crumb.scale.set(1 + 0.28 * squash, 1 - 0.32 * squash, 1 + 0.22 * squash);
    crumb.position.y = idle + bounce;
    limbs[1].rotation.z = -0.5 * squash;
    limbs[3].rotation.z = 0.5 * squash;
  }
  const celebrating = game.phase === "won",
    horrified = game.phase === "lost" && !game.shopSafe,
    sulking = game.phase === "lost" && game.shopSafe;
  smile.visible = !horrified;
  shock.visible = horrified;
  sweat.visible = horrified;
  smile.rotation.z = sulking ? Math.PI : 0;
  brows.forEach(
    (b, i) =>
      (b.rotation.z =
        (i === 0 ? 1 : -1) *
        (horrified ? 0.45 : w >= 0 ? -0.3 : sulking ? 0.3 : 0)),
  );
  crown.visible =
    finished(progress) &&
    (game.phase === "intro" ||
      (celebrating && game.level === LEVELS.length - 1));
  if (celebrating) {
    crumb.position.y = 0.08 + Math.abs(Math.sin(now * 5)) * 0.19;
    crumb.rotation.z = Math.sin(now * 5) * 0.1;
    limbs[1].position.y = limbs[3].position.y = 1.72;
    limbs[1].rotation.z = 2.25 + Math.sin(now * 8) * 0.18;
    limbs[3].rotation.z = -2.25 - Math.sin(now * 8) * 0.18;
    limbs[0].rotation.x = Math.sin(now * 5) * 0.25;
    limbs[2].rotation.x = -Math.sin(now * 5) * 0.25;
  }
  if (horrified) {
    limbs[1].rotation.x = -1.85;
    limbs[3].rotation.x = -1.85;
    limbs[1].rotation.z = -0.35;
    limbs[3].rotation.z = 0.35;
    crumb.rotation.z = reduced ? 0 : Math.sin(now * 13) * 0.025;
    crumb.scale.set(1.04, 0.92, 1);
  }
  if (sulking) {
    crumb.rotation.x = 0.18;
    crumb.scale.y = 0.92;
  }
  const desired =
    game.phase === "intro" || celebrating || horrified || sulking
      ? 0.55
      : game.facing;
  let delta = desired - crumb.rotation.y;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (!game.paused) crumb.rotation.y += delta * Math.min(1, dt * 10);
  face.scale.y = !horrified && Math.sin(now * 1.15) > 0.995 ? 0.15 : 1;
  impactWord.visible = a < 0.85 && game.phase !== "intro";
  if (impactWord.visible) {
    impactWord.position.y = 3 + Math.min(a, 0.85) * 0.65;
    impactWord.scale.set(
      4 * (1 + Math.sin(Math.min(a / 0.16, 1) * Math.PI) * 0.15),
      1,
      1,
    );
    (impactWord.material as THREE.SpriteMaterial).opacity = Math.min(
      1,
      Math.max(0, (0.85 - a) / 0.22),
    );
  }
  reach.position.x = game.x;
  reach.position.z = game.z;
  reach.visible = game.phase === "playing";
  reach.scale.setScalar(
    w >= 0 ? 1 + Math.sin((w / WINDUP) * Math.PI) * 0.035 : 1,
  );
  destination.visible = !!goal;
  if (goal) destination.position.set(goal.x, 0.13, goal.y);
  for (const b of game.buildings) {
    const entry = buildings.get(b.id);
    if (entry)
      (entry.halo.material as THREE.MeshBasicMaterial).opacity = game.inReach(b)
        ? 0.95
        : 0.28;
  }
  const introOffset = game.phase === "intro" && innerWidth > 760 ? -10 : 0;
  const portraitOffset = innerWidth < 760 && innerWidth < innerHeight ? -4 : 0;
  const resultView = ["won", "lost"].includes(game.phase);
  const target = resultView
    ? new THREE.Vector3(
        game.x - (innerWidth > 760 ? 2.8 : 0),
        innerWidth < 760 ? -3 : 0,
        game.z,
      )
    : new THREE.Vector3(introOffset, 0, portraitOffset);
  cameraTarget.lerp(target, Math.min(1, dt * 3));
  camera.position.set(
    17 + cameraTarget.x,
    21 + cameraTarget.y,
    23 + cameraTarget.z,
  );
  camera.lookAt(cameraTarget);
  // Fade only authored tower walls intersecting the view to Crumb; their physics stays solid.
  occlusionTarget.set(game.x, 1.25, game.z);
  occlusionDirection.subVectors(occlusionTarget, camera.position);
  const viewDistance = occlusionDirection.length();
  occlusionRay.set(camera.position, occlusionDirection.normalize());
  occlusionRay.far = viewDistance;
  let faded = 0;
  for (const [mesh, data] of towerWalls) {
    const active = mesh.parent?.parent === town;
    const blocked =
      active &&
      game.phase === "playing" &&
      occlusionRay.intersectObject(mesh, false).length > 0;
    data.material.opacity = blocked ? 0.22 : 1;
    if (blocked) faded++;
  }
  document.body.dataset.fadedWalls = String(faded);
  if (!reduced && a < 0.3 && !game.paused) {
    camera.position.x += Math.sin(a * 90) * 0.22 * (1 - a / 0.3);
    camera.position.y += Math.sin(a * 70) * 0.13 * (1 - a / 0.3);
    camera.lookAt(cameraTarget);
  }
  if (lastPhase !== game.phase && ["won", "lost"].includes(game.phase)) {
    if (game.phase === "won") {
      progress = recordWin(progress, game.level, 3 - game.stomps);
      saveProgress();
      renderDistricts();
    }
    resize();
    showDialog("result");
    sound(game.phase === "won" ? "win" : "lose");
  }
  lastPhase = game.phase;
  updateHud();
  renderer.render(scene, camera);
  document.body.dataset.drawCalls = String(renderer.info.render.calls);
  document.body.dataset.geometries = String(renderer.info.memory.geometries);
  document.body.dataset.textures = String(renderer.info.memory.textures);
  if (frames % 30 === 0)
    document.body.dataset.averageFps = String(
      Math.round(frames / Math.max(0.01, frameTotal)),
    );
}

async function boot() {
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    $("world").appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Tabletop playfield");
    renderer.domElement.setAttribute("tabindex", "0");
    scene.add(new THREE.HemisphereLight(0xf7ecd2, 0x637561, 2.5));
    const sun = new THREE.DirectionalLight(0xffdfb0, 3.5);
    sun.position.set(-8, 18, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.025;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xcbe9d0, 1);
    rim.position.set(10, 8, -5);
    scene.add(rim);
    await RAPIER.init();
    world = new RAPIER.World({ x: 0, y: -12, z: 0 });
    world.timestep = 1 / 60;
    floorBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.12, 0),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(9.8, 0.12, 7.4).setFriction(0.9),
      floorBody,
    );
    player = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        0,
        0.85,
        game.z,
      ),
    );
    playerCollider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.43, 0.4),
      player,
    );
    controller = world.createCharacterController(0.015);
    controller.setSlideEnabled(true);
    controller.setApplyImpulsesToDynamicBodies(false);
    makeBoard();
    makeCrumb();
    buildTown();
    cameraTarget.set(
      innerWidth > 760 ? -10 : 0,
      0,
      innerWidth < 760 && innerWidth < innerHeight ? -4 : 0,
    );
    resize();
    ready = true;
    $<HTMLButtonElement>("start").disabled = false;
    $<HTMLButtonElement>("map").disabled = false;
    reset(false, selectedLevel);
    renderer.domElement.addEventListener("pointerdown", (e) => {
      if (!game.canMove || e.button !== 0) return;
      pointer.set(
        (e.clientX / innerWidth) * 2 - 1,
        1 - (e.clientY / innerHeight) * 2,
      );
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(ground, point)) {
        goal = new THREE.Vector2(
          Math.max(-8, Math.min(8, point.x)),
          Math.max(-5, Math.min(5, point.z)),
        );
        renderer.domElement.focus({ preventScroll: true });
      }
    });
    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      game.paused = true;
      keys.clear();
      mode = "error";
      dialog.hidden = false;
      $("dialog-eyebrow").textContent = "THE TABLE NEEDS A MOMENT";
      $("dialog-title").textContent = "Graphics paused.";
      $("dialog-description").textContent =
        "The browser lost its graphics context. Reload to restore the tabletop.";
      $("dialog-action").hidden = true;
      $("dialog-close").hidden = true;
      $("dialog-map").hidden = true;
    });
    renderer.domElement.addEventListener("webglcontextrestored", () =>
      location.reload(),
    );
    renderer.setAnimationLoop(frame);
    document.body.dataset.ready = "true";
    updateHud();
  } catch (error) {
    console.error(error);
    intro.hidden = true;
    mode = "error";
    dialog.hidden = false;
    $("dialog-eyebrow").textContent = "CRUMB COULD NOT WAKE UP";
    $("dialog-title").textContent = "The tabletop did not load.";
    $("dialog-description").textContent =
      "This prototype needs WebGL 2 and its local physics files. Try current Chrome or Edge with graphics acceleration enabled, then reload.";
    $("dialog-action").hidden = true;
    $("dialog-close").hidden = true;
    $("dialog-map").hidden = true;
    document.body.dataset.ready = "false";
  }
}
void boot();
