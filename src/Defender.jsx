import React, { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Settings, Volume2, VolumeX, X } from "lucide-react";

/* ============================================================================
   DEFENDER  —  arcade-style clone (React + HTML5 Canvas)
   ----------------------------------------------------------------------------
   The game renders into a low-resolution pixel buffer (H = 400 logical px,
   width adapts to the viewport's aspect ratio) which is blitted to the screen
   with nearest-neighbour scaling, so all pixel art stays razor sharp.
   Optional CRT glow / scanlines are composited on top of the sharp image.

   CONTROLS
     ← / →   Reverse + Thrust        ↑ / ↓   Climb / Dive (fight the gravity!)
     SPACE   Laser                   B       Smart Bomb
     H       Hyperspace              Z       Reverse only     SHIFT  Thrust
     ENTER   Start                   P       Pause
   DISPLAY
     F Fullscreen   C CRT   V Scenery   L Lighting   T Trails
     K Shake/Flash  Q Particle density   I Integer scaling   M Sound   O Menu
   ============================================================================ */

// ---------------------------------------------------------------------------
// World constants
// ---------------------------------------------------------------------------
const H = 400; // logical height (fixed)
let W = 640; // logical width – adapts to viewport aspect ratio
const W_MIN = 560;
const W_MAX = 800;
const HUD_H = 62;
const PLAY_TOP = HUD_H + 6;
const GROUND_Y = 378; // the line humanoids walk on
const WORLD_W = 5120; // the planet wraps after this many pixels
const PX = 2; // one sprite pixel = 2 logical pixels
const TCOLS = WORLD_W / PX; // terrain columns
const SPAWN_T = 1.0; // enemy materialisation time

const wrap = (x) => ((x % WORLD_W) + WORLD_W) % WORLD_W;
const mod = (x, m) => ((x % m) + m) % m;
const wdelta = (a, b) => {
  let d = wrap(b - a);
  if (d > WORLD_W / 2) d -= WORLD_W;
  return d;
};
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// ---------------------------------------------------------------------------
// Palette & colour ramps
// ---------------------------------------------------------------------------
const PAL = {
  W: "#ffffff", w: "#c8c8dc", k: "#70708c", K: "#3a3a4c",
  R: "#ff2a2a", r: "#a01818", G: "#40ff50", g: "#18a028",
  B: "#3c5cff", b: "#2030a0", Y: "#ffe838", y: "#c0a020",
  O: "#ff8c18", o: "#b05a10", P: "#a048ff", p: "#6028b0",
  M: "#ff3cff", m: "#a018a8", C: "#38f0ff", c: "#1890b8",
  T: "#ff9ccc", L: "#b8ff58", S: "#9cb8ff", N: "#ffc8a0", D: "#803010",
};
const RAMP = {
  fire: ["#ffffff", "#fffbd0", "#fff060", "#ffc020", "#ff8010", "#ff4010", "#d01818", "#801010", "#401010"],
  plasma: ["#ffffff", "#d0ffff", "#60f0ff", "#30a0ff", "#3050ff", "#6020c0", "#301060"],
  toxic: ["#ffffff", "#e8ffc0", "#a0ff50", "#40e030", "#10a020", "#086010", "#043008"],
  magenta: ["#ffffff", "#ffd0ff", "#ff70ff", "#ff30c0", "#c01090", "#700860", "#300430"],
  spark: ["#ffffff", "#ffffa0", "#ffe040", "#ff9020", "#a04010"],
  smoke: ["#707080", "#585868", "#444454", "#34343f", "#24242c", "#18181e"],
  cyan: ["#ffffff", "#c0ffff", "#40f0ff", "#20a0d0", "#106080", "#083040"],
  gold: ["#ffffff", "#fff4b0", "#ffe040", "#ffb020", "#c07010", "#603808"],
};
const ENEMY_RAMP = { lander: RAMP.toxic, mutant: RAMP.magenta, bomber: RAMP.plasma, pod: RAMP.magenta, swarmer: RAMP.fire, baiter: RAMP.toxic };
const EXPLO_SCALE = { lander: 1, mutant: 1, bomber: 1.25, pod: 1.8, swarmer: 0.55, baiter: 1.35 };
const LASER_COLS = ["#ffffff", "#ff3030", "#ffe040", "#40ff50", "#38f0ff", "#ff3cff", "#ffa020", "#a048ff"];
const LASER_DIM = ["#606070", "#601010", "#605010", "#106018", "#105860", "#601060", "#603808", "#381860"];

// ---------------------------------------------------------------------------
// Pixel-art sprites (each entry is a list of animation frames)
// ---------------------------------------------------------------------------
const SPRITES = {
  // the Defender: raked tail fin, long tapering wedge, needle nose, magenta belly pod
  ship: [[
    "Ww......................",
    "WWw.....................",
    "WWWw....................",
    "WWWWwwwwwwwww...........",
    "WWWWWWWWWWWWWWWWw.......",
    "kWWWWWWWWWWWWWWWWWWWWWWW",
    "kkMMMMMMMMWWWWWWWWw.....",
    "..mMMMMMm...............",
  ]],
  lander: [
    ["...GGG...", ".GGGGGGG.", "GGYGYGYGG", "GGGGGGGGG", ".gGGGGGg.", "..g.g.g..", ".g..g..g.", "g...g...g"],
    ["...GGG...", ".GGGGGGG.", "GYGYGYGYG", "GGGGGGGGG", ".gGGGGGg.", "..g.g.g..", ".g..g..g.", "g...g...g"],
  ],
  mutant: [
    ["M..MMM..M", ".MMGMGMM.", "MGMMMMMGM", "MMGMGMGMM", ".MMMMMMM.", "..M.M.M..", ".M..M..M.", "M...M...M"],
    ["G..MGM..G", ".MGMMMGM.", "MMMGMGMMM", "MGMMGMMGM", ".MGMMMGM.", "..G.M.G..", ".M..G..M.", "G...M...G"],
  ],
  bomber: [
    ["BBBBBBBB", "BSSSSSSB", "BSbbbbSB", "BSbWWbSB", "BSbWWbSB", "BSbbbbSB", "BSSSSSSB", "BBBBBBBB"],
    [".BBBBBB.", ".BSSSSB.", ".BSbbSB.", ".BbWWbB.", ".BbWWbB.", ".BSbbSB.", ".BSSSSB.", ".BBBBBB."],
    ["...BB...", "..BSSB..", ".BSbbSB.", "BSbWWbSB", "BSbWWbSB", ".BSbbSB.", "..BSSB..", "...BB..."],
    [".BBBBBB.", ".BSSSSB.", ".BSbbSB.", ".BbWWbB.", ".BbWWbB.", ".BSbbSB.", ".BSSSSB.", ".BBBBBB."],
  ],
  pod: [
    ["..P..P..", ".PMPPMP.", "PMRRRRMP", ".PRYYRP.", ".PRYYRP.", "PMRRRRMP", ".PMPPMP.", "..P..P.."],
    [".P....P.", "..MPPM..", ".MRRRRM.", "PPRYYRPP", "PPRYYRPP", ".MRRRRM.", "..MPPM..", ".P....P."],
  ],
  swarmer: [
    [".RRR.", "RYOYR", ".RRR.", "R...R"],
    ["R...R", ".RRR.", "RYOYR", ".RRR."],
  ],
  baiter: [
    ["...LLLLLL...", ".LLGGGGGGLL.", "LGGYGGYGGYGL", ".LLGGGGGGLL."],
    ["...LLLLLL...", ".LLGGGGGGLL.", "LGYGGYGGYGGL", ".LLGGGGGGLL."],
  ],
  mine: [
    [".W.", "WBW", ".W."],
    ["B.B", ".W.", "B.B"],
  ],
  // 0-2 walk cycle, 3-4 arms up (carried / falling / cheering)
  human: [
    [".NNN.", ".NNN.", "CCCCC", "C.C.C", "..C..", ".P.P.", ".P.P.", "P...P"],
    [".NNN.", ".NNN.", ".CCC.", ".CCC.", "..C..", "..P..", "..PP.", "..P.."],
    [".NNN.", ".NNN.", "CCCCC", "C.C.C", "..C..", ".P.P.", "P..P.", "P...P"],
    ["C...C", "CNNNC", ".NNN.", ".CCC.", "..C..", "..C..", ".P.P.", "P...P"],
    [".C.C.", "CNNNC", ".NNN.", ".CCC.", "..C..", "..C..", "..P..", ".P.P."],
  ],
};
const ANIM_FPS = { lander: 3, mutant: 9, bomber: 8, pod: 5, swarmer: 10, baiter: 7, mine: 8 };

function bakeRows(rows, flip = false, solid = null, px = PX) {
  const w = rows[0].length,
    h = rows.length;
  const c = makeCanvas(w * px, h * px);
  const ctx = c.getContext("2d");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      ctx.fillStyle = solid || PAL[ch] || "#fff";
      ctx.fillRect((flip ? w - 1 - x : x) * px, y * px, px, px);
    }
  return c;
}
function pixList(rows) {
  const out = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && out.push({ x: x * PX, y: y * PX, c: PAL[ch] })));
  return out;
}
function bakeSet(frames, trailColor = "#3060ff") {
  return {
    rows: frames,
    w: frames[0][0].length * PX,
    h: frames[0].length * PX,
    frames: frames.map((f) => bakeRows(f)),
    framesL: frames.map((f) => bakeRows(f, true)),
    sil: frames.map((f) => bakeRows(f, false, "#ffffff")),
    silL: frames.map((f) => bakeRows(f, true, "#ffffff")),
    red: frames.map((f) => bakeRows(f, false, "#ff3030")),
    redL: frames.map((f) => bakeRows(f, true, "#ff3030")),
    trail: bakeRows(frames[0], false, trailColor),
    trailL: bakeRows(frames[0], true, trailColor),
    pix: frames.map((f) => pixList(f)),
    pixL: frames.map((f) => pixList(f.map((r) => [...r].reverse().join("")))),
  };
}

// ---------------------------------------------------------------------------
// 5x7 pixel font (with a small cache of pre-rendered strings)
// ---------------------------------------------------------------------------
const FONT = {
  "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11111 00010 00100 00010 00001 10001 01110",
  "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110", D: "11100 10010 10001 10001 10001 10010 11100",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  " ": "00000 00000 00000 00000 00000 00000 00000", "-": "00000 00000 00000 11111 00000 00000 00000",
  ":": "00000 00100 00100 00000 00100 00100 00000", ".": "00000 00000 00000 00000 00000 01100 01100",
  "!": "00100 00100 00100 00100 00100 00000 00100", ",": "00000 00000 00000 00000 00110 00100 01000",
  "/": "00001 00010 00010 00100 01000 01000 10000", "+": "00000 00100 00100 11111 00100 00100 00000",
  "=": "00000 00000 11111 00000 11111 00000 00000", "(": "00010 00100 01000 01000 01000 00100 00010",
  ")": "01000 00100 00010 00010 00010 00100 01000", "<": "00010 00100 01000 10000 01000 00100 00010",
  ">": "01000 00100 00010 00001 00010 00100 01000", "'": "00100 00100 00000 00000 00000 00000 00000",
  "?": "01110 10001 00001 00010 00100 00000 00100", "*": "00000 10101 01110 11111 01110 10101 00000",
};
const GLYPHS = {};
for (const k of Object.keys(FONT)) GLYPHS[k] = FONT[k].split(" ");
const textW = (text, size) => String(text).length * 6 * size - size;

const TEXT_CACHE = new Map();
function textCanvas(text, size, color) {
  const key = text + "|" + size + "|" + color;
  let c = TEXT_CACHE.get(key);
  if (c) return c;
  if (TEXT_CACHE.size > 500) TEXT_CACHE.clear();
  c = makeCanvas(textW(text, size), 7 * size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  for (let i = 0; i < text.length; i++) {
    const rows = GLYPHS[text[i]] || GLYPHS["?"];
    for (let r = 0; r < 7; r++) for (let cc = 0; cc < 5; cc++) if (rows[r][cc] === "1") ctx.fillRect(i * 6 * size + cc * size, r * size, size, size);
  }
  TEXT_CACHE.set(key, c);
  return c;
}
function alignX(x, w, align) {
  return Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
}
// static-colour text (cached)
function drawText(ctx, text, x, y, size, color, align = "left", shadow = null) {
  text = String(text).toUpperCase();
  if (!text.length) return;
  const w = textW(text, size);
  const sx = alignX(x, w, align);
  if (shadow) ctx.drawImage(textCanvas(text, size, shadow), sx + size, Math.round(y) + size);
  ctx.drawImage(textCanvas(text, size, color), sx, Math.round(y));
}
// per-pixel colour function text (used for shimmering titles)
function drawTextFn(ctx, text, x, y, size, colorFn, align = "left") {
  text = String(text).toUpperCase();
  const sx = alignX(x, textW(text, size), align);
  y = Math.round(y);
  for (let i = 0; i < text.length; i++) {
    const rows = GLYPHS[text[i]] || GLYPHS["?"];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (rows[r][c] === "1") {
          ctx.fillStyle = colorFn(i, r, c);
          ctx.fillRect(sx + i * 6 * size + c * size, y + r * size, size, size);
        }
  }
}

// ---------------------------------------------------------------------------
// Sound — synthesised with the Web Audio API
// ---------------------------------------------------------------------------
class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.thrustOn = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.45;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 340;
    this.thrustGain = ctx.createGain();
    this.thrustGain.gain.value = 0;
    src.connect(f).connect(this.thrustGain).connect(this.master);
    src.start();
  }
  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }
  get t() {
    return this.ctx.currentTime;
  }
  tone({ type = "square", f0 = 440, f1 = f0, dur = 0.1, vol = 0.2, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    const t0 = this.t + delay;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  burst({ dur = 0.4, vol = 0.4, f0 = 2500, f1 = 150, q = 0.7, delay = 0, type = "lowpass" }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    const t0 = this.t + delay;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.02);
  }
  laser() {
    this.tone({ type: "sawtooth", f0: 1900, f1: 120, dur: 0.16, vol: 0.16 });
    this.tone({ type: "square", f0: 950, f1: 60, dur: 0.1, vol: 0.07 });
  }
  hit() {
    this.burst({ dur: 0.08, vol: 0.25, f0: 6000, f1: 1500, type: "bandpass", q: 1 });
  }
  explode(size = 1) {
    this.burst({ dur: 0.3 + 0.2 * size, vol: 0.5, f0: 3200, f1: 90 });
    this.tone({ type: "square", f0: 240, f1: 30, dur: 0.22 * size, vol: 0.14 });
  }
  pop() {
    this.burst({ dur: 0.18, vol: 0.22, f0: 2200, f1: 200 });
  }
  shipHit() {
    for (let i = 0; i < 5; i++) this.tone({ type: "square", f0: 1400 - i * 200, f1: 1000 - i * 150, dur: 0.09, vol: 0.14, delay: i * 0.09 });
  }
  shipExplode() {
    this.burst({ dur: 1.8, vol: 0.75, f0: 4000, f1: 50, q: 1.5 });
    this.burst({ dur: 0.9, vol: 0.4, f0: 9000, f1: 400, delay: 0.15 });
    this.tone({ type: "sawtooth", f0: 700, f1: 30, dur: 1.5, vol: 0.25 });
    for (let i = 0; i < 7; i++) this.burst({ dur: 0.25, vol: 0.3, f0: 2500, f1: 200, delay: 0.2 + i * 0.17 });
  }
  smartBomb() {
    this.burst({ dur: 1.2, vol: 0.7, f0: 9000, f1: 120, q: 2 });
    this.tone({ type: "sawtooth", f0: 2200, f1: 60, dur: 1.0, vol: 0.22 });
    this.tone({ type: "square", f0: 80, f1: 1800, dur: 0.45, vol: 0.12 });
    this.tone({ type: "triangle", f0: 60, f1: 30, dur: 1.2, vol: 0.4 });
  }
  enemyShot() {
    this.tone({ type: "square", f0: 720, f1: 300, dur: 0.07, vol: 0.07 });
  }
  materialize() {
    this.tone({ type: "triangle", f0: 200, f1: 1200, dur: 0.5, vol: 0.06 });
  }
  pickup() {
    [660, 880, 1100, 1320].forEach((f, i) => this.tone({ type: "square", f0: f, dur: 0.08, vol: 0.14, delay: i * 0.06 }));
  }
  rescue() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone({ type: "square", f0: f, dur: 0.1, vol: 0.14, delay: i * 0.07 }));
  }
  humanDie() {
    this.tone({ type: "sawtooth", f0: 500, f1: 60, dur: 0.5, vol: 0.18 });
  }
  abduct() {
    this.tone({ type: "square", f0: 200, f1: 900, dur: 0.3, vol: 0.09 });
    this.tone({ type: "square", f0: 200, f1: 900, dur: 0.3, vol: 0.09, delay: 0.3 });
  }
  mutate() {
    for (let i = 0; i < 5; i++) this.tone({ type: "sawtooth", f0: 300, f1: 1200, dur: 0.12, vol: 0.11, delay: i * 0.1 });
  }
  hyperOut() {
    for (let i = 0; i < 10; i++) this.tone({ type: "square", f0: 300 + i * 160, dur: 0.04, vol: 0.1, delay: i * 0.035 });
    this.burst({ dur: 0.5, vol: 0.25, f0: 200, f1: 8000, type: "bandpass", q: 3 });
  }
  hyperIn() {
    for (let i = 0; i < 8; i++) this.tone({ type: "square", f0: 1800 - i * 180, dur: 0.04, vol: 0.1, delay: i * 0.035 });
  }
  reverse() {
    this.burst({ dur: 0.12, vol: 0.12, f0: 1200, f1: 300, type: "bandpass", q: 2 });
  }
  scrape() {
    this.burst({ dur: 0.15, vol: 0.2, f0: 5000, f1: 800, type: "highpass", q: 1 });
  }
  extraLife() {
    [880, 1100, 1320, 1760, 1320, 1760, 2200].forEach((f, i) => this.tone({ type: "square", f0: f, dur: 0.09, vol: 0.14, delay: i * 0.08 }));
  }
  waveStart() {
    [220, 330, 440, 660, 880].forEach((f, i) => this.tone({ type: "square", f0: f, f1: f * 1.02, dur: 0.14, vol: 0.14, delay: i * 0.1 }));
  }
  waveClear() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: "square", f0: f, dur: 0.18, vol: 0.14, delay: i * 0.15 }));
  }
  tally(i) {
    this.tone({ type: "square", f0: 600 + i * 80, dur: 0.06, vol: 0.1 });
  }
  planetBoom() {
    this.burst({ dur: 3, vol: 0.85, f0: 2200, f1: 40, q: 1 });
    this.tone({ type: "sawtooth", f0: 160, f1: 20, dur: 3, vol: 0.3 });
  }
  baiterWarn() {
    for (let i = 0; i < 3; i++) this.tone({ type: "square", f0: 1400, f1: 900, dur: 0.1, vol: 0.09, delay: i * 0.14 });
  }
  thrust(on) {
    if (!this.thrustGain || on === this.thrustOn) return;
    this.thrustOn = on;
    const g = this.thrustGain.gain;
    g.cancelScheduledValues(this.t);
    g.setValueAtTime(g.value, this.t);
    g.linearRampToValueAtTime(on && !this.muted ? 0.35 : 0, this.t + 0.08);
  }
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const SHIP = {
  ACC: 780, // horizontal thrust (px/s²)
  MAX_VX: 580,
  DRAG: 0.55, // horizontal coast drag – the ship carries a lot of momentum
  VACC: 1750, // climb / dive thrust
  MAX_VY: 380,
  MAX_FALL: 300,
  VDRAG_IN: 4.2, // vertical damping while steering
  VDRAG_IDLE: 0.9, // vertical damping while coasting (gravity wins)
  GRAVITY: 250, // real pull: release ↑ and the ship sinks — keep feathering the climb
  W: 24 * PX,
  H: 8 * PX,
};
const SCORES = { lander: 150, mutant: 150, baiter: 200, bomber: 250, pod: 1000, swarmer: 150 };
const EXTRA_EVERY = 10000;
const START_LIVES = 3;
const START_BOMBS = 3;
const HUMANS_PER_WAVE = 10;
const DEFAULT_SETTINGS = {
  crt: true, // scanlines + phosphor glow + vignette
  scenery: true, // parallax mountains, nebula, terrain strata
  lighting: true, // explosion light on terrain, laser glow
  trails: true, // motion afterimages
  shake: true, // screen shake & full-screen flashes
  fxHigh: true, // particle density
  integer: false, // pixel-perfect integer scaling
  sound: true,
};

// ---------------------------------------------------------------------------
// Terrain: a varied, wrapping mountain range (jagged ranges, mesas, spires,
// rolling hills, valleys) stored per 2px column
// ---------------------------------------------------------------------------
const STRIP_TOP = GROUND_Y - 178;
function makeTerrain() {
  const hMin = GROUND_Y - 160,
    hMax = GROUND_Y - 6;
  let pts = [];
  let i = 0;
  let y = GROUND_Y - 40;
  pts.push({ i: 0, y, s: false });
  const push = (ni, ny, smooth = false) => {
    i = ni;
    y = clamp(ny, hMin, hMax);
    pts.push({ i, y, s: smooth });
  };
  while (i < TCOLS - 60) {
    const f = pick(["range", "range", "range", "mesa", "valley", "spire", "hills", "range"]);
    if (f === "range") {
      const n = rndi(3, 7);
      for (let k = 0; k < n; k++) {
        push(i + rndi(5, 16), y - rnd(18, 70));
        push(i + rndi(5, 16), y + rnd(18, 70));
      }
    } else if (f === "mesa") {
      push(i + rndi(3, 6), GROUND_Y - rnd(80, 125));
      const top = y;
      const len = rndi(20, 45);
      const end = i + len;
      while (i < end - 5) push(i + rndi(3, 7), top + rndi(-1, 1) * PX);
      push(Math.max(end, i + 2), top);
      push(i + rndi(3, 6), GROUND_Y - rnd(12, 40));
    } else if (f === "valley") {
      push(i + rndi(10, 18), GROUND_Y - rnd(6, 16), true);
      const end = i + rndi(30, 60);
      while (i < end) push(i + rndi(6, 12), GROUND_Y - rnd(6, 20));
    } else if (f === "spire") {
      push(i + rndi(10, 15), GROUND_Y - rnd(140, 160));
      push(i + rndi(3, 5), y + rnd(20, 40));
      push(i + rndi(6, 10), GROUND_Y - rnd(20, 50));
    } else {
      const n = rndi(2, 4);
      for (let k = 0; k < n; k++) {
        push(i + rndi(14, 24), GROUND_Y - rnd(40, 85), true);
        push(i + rndi(14, 24), GROUND_Y - rnd(12, 40), true);
      }
    }
  }
  pts = pts.filter((p) => p.i < TCOLS - 12);
  pts.push({ i: TCOLS, y: pts[0].y, s: true });
  const col = new Int16Array(TCOLS);
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k],
      b = pts[k + 1];
    for (let c = a.i; c < b.i && c < TCOLS; c++) {
      let t = (c - a.i) / (b.i - a.i);
      if (b.s) t = (1 - Math.cos(t * Math.PI)) / 2; // rounded hills
      col[c] = Math.round((a.y + (b.y - a.y) * t) / PX) * PX;
    }
  }
  return col;
}
const terrainAt = (col, x) => col[Math.floor(wrap(x) / PX) % TCOLS];

// Pre-render the whole range into a strip (plus a wrap margin) once.
function renderTerrainStrip(col, enhanced) {
  const w = WORLD_W + W_MAX + 16,
    h = H - STRIP_TOP;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const Y = (v) => v - STRIP_TOP;
  const n = w / PX;
  for (let k = 0; k < n; k++) {
    const i = k % TCOLS;
    const y0 = col[i],
      y1 = col[(i + 1) % TCOLS],
      yp = col[(i - 1 + TCOLS) % TCOLS];
    const x = k * PX;
    const top = Math.min(y0, y1),
      bot = Math.max(y0, y1);
    if (enhanced) {
      ctx.fillStyle = "#000";
      ctx.fillRect(x, Y(top), PX, GROUND_Y - top);
      // echo contours give the range depth (the classic strata look)
      // faint dotted ridge lines echo the contour for depth
      const bands = [
        [0.22, "#5a2610"],
        [0.5, "#3e1a0a"],
      ];
      for (const [s, cc] of bands) {
        const ey = Math.round((y0 + (GROUND_Y - y0) * s) / PX) * PX;
        const ey1 = Math.round((y1 + (GROUND_Y - y1) * s) / PX) * PX;
        if (ey < GROUND_Y - PX * 2 && i % 2 === 0) {
          ctx.fillStyle = cc;
          ctx.fillRect(x, Y(Math.min(ey, ey1)), PX, Math.abs(ey1 - ey) + PX);
        }
      }
      // sparse speckle that fades with depth (a light dusting, not noise)
      for (let yy = top + PX * 2; yy < GROUND_Y; yy += PX) {
        const depth = (yy - top) / Math.max(1, GROUND_Y - top);
        const hv = hash(i * 1.37 + yy * 0.71);
        if (hv < 0.045 * (1 - depth * 0.8)) {
          ctx.fillStyle = hv < 0.012 ? "#8a3e14" : "#3a1808";
          ctx.fillRect(x, Y(yy), PX, PX);
        }
      }
    }
    ctx.fillStyle = "#6a2806";
    ctx.fillRect(x, Y(top) + PX, PX, bot - top + PX);
    ctx.fillStyle = "#ec781e";
    ctx.fillRect(x, Y(top), PX, bot - top + PX);
    // bright caps on the peaks
    if (y0 < yp && y0 <= y1) {
      ctx.fillStyle = "#ffc46a";
      ctx.fillRect(x, Y(y0), PX, PX);
    }
  }
  if (enhanced) {
    for (let k = 0; k < n; k++) {
      const i = k % TCOLS,
        x = k * PX;
      ctx.fillStyle = i % 3 === 0 ? "#7a3812" : "#3e1a08";
      ctx.fillRect(x, Y(GROUND_Y), PX, PX);
      for (let yy = GROUND_Y + PX * 2; yy < H; yy += PX) {
        const hv = hash(i * 3.1 + yy * 1.3);
        if (hv < 0.035) {
          ctx.fillStyle = hv < 0.01 ? "#5a3418" : "#2a1408";
          ctx.fillRect(x, Y(yy), PX, PX);
        }
      }
    }
  } else {
    ctx.fillStyle = "#5a2408";
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, Y(GROUND_Y), 4, 1);
  }
  return c;
}

// Distant mountain range (parallax 0.5 → period = WORLD_W / 2)
const FAR_P = WORLD_W / 2;
function renderFarStrip() {
  const w = FAR_P + W_MAX + 16,
    top = GROUND_Y - 200,
    h = GROUND_Y - top;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const f = [2, 3, 5, 7, 11].map((n) => ({ n, ph: rnd(0, 6.28), a: rnd(0.4, 1) }));
  const hAt = (x) => {
    let v = 0;
    for (const q of f) v += q.a * (1 - Math.abs(Math.sin((Math.PI * q.n * x) / FAR_P + q.ph))) / q.n ** 0.35;
    return v;
  };
  let mn = 1e9,
    mx = -1e9;
  const cols = [];
  for (let x = 0; x < FAR_P; x += PX) {
    const v = hAt(x);
    cols.push(v);
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
  }
  const n = w / PX;
  for (let k = 0; k < n; k++) {
    const i = k % cols.length;
    const t = (cols[i] - mn) / (mx - mn);
    const yy = Math.round((GROUND_Y - 50 - t * 140) / PX) * PX;
    const x = k * PX;
    ctx.fillStyle = "#07051a";
    ctx.fillRect(x, yy - top, PX, GROUND_Y - yy);
    for (let y2 = yy + PX * 2; y2 < GROUND_Y; y2 += PX) {
      const hv = hash(i * 2.3 + y2 * 0.9);
      if (hv < 0.07 * (1 - (y2 - yy) / (GROUND_Y - yy + 1))) {
        ctx.fillStyle = "#17123a";
        ctx.fillRect(x, y2 - top, PX, PX);
      }
    }
    ctx.fillStyle = t > 0.8 ? "#4a3c8c" : "#262058";
    ctx.fillRect(x, yy - top, PX, PX);
  }
  return { canvas: c, top };
}

// Pixel-dithered nebula clouds (parallax 0.25 → period = WORLD_W / 4)
const NEB_P = WORLD_W / 4;
function renderNebula() {
  const w = NEB_P + W_MAX + 16,
    top = PLAY_TOP,
    h = GROUND_Y - 40 - top;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const tints = [
    ["#2a1050", "#1c0c38", "#110824"],
    ["#0c1c48", "#0a1434", "#070c22"],
    ["#30103a", "#200a2a", "#12061a"],
  ];
  const blobs = [];
  for (let i = 0; i < 7; i++) blobs.push({ x: rnd(0, NEB_P), y: rnd(20, h - 20), r: rnd(50, 130), t: pick(tints), sq: rnd(0.4, 0.8) });
  for (const b of blobs) {
    for (const ox of [-NEB_P, 0, NEB_P]) {
      const bx = b.x + ox;
      for (let y = Math.max(0, b.y - b.r); y < Math.min(h, b.y + b.r); y += PX)
        for (let x = bx - b.r; x < bx + b.r; x += PX) {
          if (x < 0 || x >= w) continue;
          const dx = (x - bx) / b.r,
            dy = (y - b.y) / (b.r * b.sq);
          const d = Math.sqrt(dx * dx + dy * dy) + (hash(x * 0.13 + y * 0.29) - 0.5) * 0.35;
          if (d >= 1) continue;
          const dens = (1 - d) * (1 - d);
          const cx = Math.round(x / PX),
            cy = Math.round(y / PX);
          const checker = (cx + cy) % 2 === 0;
          if (hash(cx * 7.7 + cy * 3.3 + b.r) < dens * 0.9 && (checker || dens > 0.45)) {
            ctx.fillStyle = d < 0.35 ? b.t[0] : d < 0.7 ? b.t[1] : b.t[2];
            ctx.fillRect(cx * PX, cy * PX, PX, PX);
          }
        }
    }
  }
  return { canvas: c, top };
}

// Three star layers; each period is WORLD_W·p so the wrap stays seamless
function makeStars() {
  const layers = [
    { p: 0.25, n: 70, cols: ["#34345a", "#44446a", "#2c2c4c"], s: 1 },
    { p: 0.5, n: 60, cols: ["#6a6a96", "#8484b0", "#7070a0"], s: 1 },
    { p: 0.75, n: 46, cols: ["#d0d0f0", "#ffffff", "#a8c8ff", "#ffe4c8", "#ffc8ff"], s: 2 },
  ];
  return layers.map((L) => {
    const period = WORLD_W * L.p;
    const stars = [];
    for (let i = 0; i < L.n; i++)
      stars.push({ x: rndi(0, period - 1), y: rndi(PLAY_TOP + 2, GROUND_Y - 36), c: pick(L.cols), s: L.s === 2 && Math.random() < 0.5 ? 1 : L.s, ph: rnd(0, 10), tw: rnd(0.5, 3) });
    return { ...L, period, stars };
  });
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
function makeEnemy(type, x, y, wave) {
  const fr = SPRITES[type][0];
  const e = {
    type, x: wrap(x), y, vx: 0, vy: 0,
    w: fr[0].length * PX, h: fr.length * PX,
    t: rnd(0, 10), seed: rnd(0, 1000),
    state: "seek", target: null, human: null,
    fire: rnd(1.5, 4), jitter: 0, dead: false,
    spawnT: SPAWN_T, doomT: -1, hist: [],
  };
  switch (type) {
    case "lander":
      e.vx = pick([-1, 1]) * rnd(50, 80);
      break;
    case "mutant":
      e.vx = rnd(-100, 100);
      e.fire = rnd(0.6, 1.6);
      break;
    case "bomber":
      e.vx = pick([-1, 1]) * rnd(50, 70);
      e.vy = rnd(30, 60) * pick([-1, 1]);
      e.fire = 1.1;
      break;
    case "pod":
      e.vx = pick([-1, 1]) * rnd(25, 45);
      e.vy = rnd(-20, 20);
      break;
    case "swarmer":
      e.vx = rnd(-200, 200);
      e.vy = rnd(-120, 120);
      e.fire = rnd(1, 3);
      break;
    case "baiter":
      e.fire = rnd(0.6, 1.2);
      break;
    default:
      break;
  }
  e.fire /= 1 + Math.min(wave - 1, 10) * 0.06;
  return e;
}

function makeHuman(x) {
  return {
    x: wrap(x), y: GROUND_Y - 8 * PX,
    vx: pick([-1, 1]) * rnd(8, 16), vy: 0,
    state: "walk", carrier: null, fallFrom: 0,
    walkT: rnd(1, 4), phase: rnd(0, 4), cheer: 0, face: 1, dead: false,
  };
}

function makeShip() {
  return {
    x: WORLD_W / 2, y: (PLAY_TOP + GROUND_Y) / 2 - 30,
    vx: 0, vy: 0, dir: 1,
    thrusting: false, thrustLevel: 0, vin: 0,
    invul: 0, carrying: null,
    hyper: false, hyperT: 0, hyperJumped: false,
    visible: true, camOff: W * 0.27, hist: [], scrapeCD: 0,
  };
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
function createGame(sfx) {
  const g = {
    sfx,
    mode: "title", modeT: 0, time: 0, frame: 0, paused: false,
    score: 0, hiScore: 0, lives: START_LIVES, bombs: START_BOMBS, wave: 1, nextExtra: EXTRA_EVERY,
    ship: makeShip(), camX: 0,
    enemies: [], bullets: [], lasers: [], humans: [], mines: [],
    particles: [], fx: [], timers: [], lights: [], popups: [],
    terrain: makeTerrain(), terrainVer: 1, stars: makeStars(),
    planetDestroyed: false,
    landersToSpawn: 0, spawnT: 0, waveT: 0, baiterT: 0,
    flash: 0, flashColor: "#fff", shake: 0, warp: 0, bombFX: null,
    msg: null, toast: null, tally: null, deathStage: 0,
    laserCD: 0, keys: {}, pressed: {}, attractT: 0,
    settings: { ...DEFAULT_SETTINGS }, fxMul: 1, pCap: 6000,
  };
  g.camX = wrap(g.ship.x - W * 0.27);
  return g;
}

function applySettings(g, s) {
  g.settings = { ...s };
  g.fxMul = s.fxHigh ? 1 : 0.4;
  g.pCap = s.fxHigh ? 6000 : 1800;
}

function resetHumans(g) {
  g.humans = [];
  for (let i = 0; i < HUMANS_PER_WAVE; i++) g.humans.push(makeHuman((i + 0.5) * (WORLD_W / HUMANS_PER_WAVE) + rnd(-150, 150)));
}

function newTerrain(g) {
  g.terrain = makeTerrain();
  g.terrainVer++;
}

function startGame(g) {
  g.score = 0;
  g.lives = START_LIVES;
  g.bombs = START_BOMBS;
  g.wave = 1;
  g.nextExtra = EXTRA_EVERY;
  g.planetDestroyed = false;
  newTerrain(g);
  g.ship = makeShip();
  g.camX = wrap(g.ship.x - g.ship.camOff);
  g.particles = [];
  g.fx = [];
  g.timers = [];
  g.lights = [];
  g.popups = [];
  resetHumans(g);
  startWave(g, 1);
}

function startWave(g, wave) {
  g.wave = wave;
  g.mode = "playing";
  g.modeT = 0;
  g.enemies = [];
  g.bullets = [];
  g.lasers = [];
  g.mines = [];
  g.tally = null;
  g.waveT = 0;
  g.baiterT = 0;
  if (wave > 1 && (wave - 1) % 5 === 0) {
    // every 5th wave the planet is rebuilt and humanoids replenished
    g.planetDestroyed = false;
    newTerrain(g);
    resetHumans(g);
  }
  const s = g.ship;
  s.vx = 0;
  s.vy = 0;
  s.invul = 2.5;
  s.hyper = false;
  s.visible = true;
  const totalLanders = Math.min(30, 15 + (wave - 1) * 3);
  const first = Math.min(totalLanders, 5 + Math.min(wave, 4));
  g.landersToSpawn = totalLanders - first;
  g.spawnT = 8;
  for (let i = 0; i < first; i++) spawnLander(g);
  const bombers = wave >= 2 ? Math.min(6, 1 + Math.floor(wave / 2)) : 0;
  const pods = wave >= 2 ? Math.min(5, Math.floor((wave - 1) / 2) + 1) : 0;
  for (let i = 0; i < bombers; i++) g.enemies.push(makeEnemy("bomber", farFromShip(g), rnd(PLAY_TOP + 20, GROUND_Y - 120), wave));
  for (let i = 0; i < pods; i++) g.enemies.push(makeEnemy("pod", farFromShip(g), rnd(PLAY_TOP + 20, GROUND_Y - 100), wave));
  g.msg = { lines: [`ATTACK WAVE ${wave}`], t: 2.4, max: 2.4 };
  g.sfx.waveStart();
}

function farFromShip(g) {
  return wrap(g.ship.x + pick([-1, 1]) * rnd(W * 0.8, WORLD_W / 2 - 100));
}

function spawnLander(g) {
  const type = g.planetDestroyed ? "mutant" : "lander";
  g.enemies.push(makeEnemy(type, farFromShip(g), rnd(PLAY_TOP + 20, PLAY_TOP + 140), g.wave));
}

function addScore(g, pts) {
  g.score += pts;
  if (g.score > g.hiScore) g.hiScore = g.score;
  while (g.score >= g.nextExtra) {
    g.nextExtra += EXTRA_EVERY;
    g.lives++;
    g.bombs++;
    g.sfx.extraLife();
    popup(g, g.ship.x, g.ship.y - 34, "EXTRA SHIP + BOMB", RAMP.gold[2], 2.2, 1);
  }
}

function popup(g, x, y, text, color = "#fff", t = 1.3, size = 1) {
  g.popups.push({ x: wrap(x), y, text: String(text), t, max: t, color, size });
}

// ---------------------------------------------------------------------------
// FX engine — every effect is made of square pixels
// ---------------------------------------------------------------------------
const K_SQ = 0; // plain square fragment
const K_STREAK = 1; // fast spark drawn as a short line along its velocity
const K_DEBRIS = 2; // heavy fragment: falls, bounces on the ground, lingers
const K_SPARK = 3; // tiny flickering glint
const K_EMBER = 4; // slow glowing ember that drifts and cools

function addP(g, x, y, vx, vy, life, s, c, drag = 0, grav = 0, kind = K_SQ) {
  if (g.particles.length >= g.pCap) return null;
  const p = { x: wrap(x), y, vx, vy, life, max: life, s, c, drag, grav, kind, rest: false };
  g.particles.push(p);
  return p;
}
const cnt = (g, n) => Math.max(1, Math.round(n * g.fxMul));
function addFx(g, o) {
  g.fx.push({ t: 0, ...o, x: wrap(o.x) });
}
function flashFx(g, x, y, size, life = 0.12, col = "#ffffff") {
  addFx(g, { type: "flash", x, y, size, life, col });
}
function ringFx(g, x, y, speed, life, c1, c2 = "#ffffff", squash = 1, r0 = 2) {
  addFx(g, { type: "ring", x, y, r: r0, speed, life, c1, c2, squash });
}
function light(g, x, y, r, life, col = "#ffd060") {
  if (g.lights.length < 28) g.lights.push({ x: wrap(x), y, r, life, max: life, col });
}
function later(g, t, fn) {
  g.timers.push({ t, fn });
}
function shakeIt(g, amt) {
  g.shake = Math.min(1.6, g.shake + amt);
}

function sparks(g, x, y, n, ang, spread, speed, ramp = RAMP.spark, grav = 140) {
  for (let i = 0; i < cnt(g, n); i++) {
    const a = ang + rnd(-spread, spread),
      sp = rnd(speed * 0.35, speed);
    addP(g, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.15, 0.5), 1, ramp, 2.2, grav, K_STREAK);
  }
}
function dust(g, x, y, n) {
  for (let i = 0; i < cnt(g, n); i++)
    addP(g, x + rnd(-4, 4), y, rnd(-90, 90), rnd(-70, -10), rnd(0.3, 0.6), pick([1, 2]), pick(["#9a7a5a", "#6a4a30", "#b09070"]), 2.5, 220, K_SQ);
}
function sparkle(g, x, y, n, ramp = RAMP.cyan) {
  for (let i = 0; i < cnt(g, n); i++)
    addP(g, x + rnd(-8, 8), y + rnd(-8, 8), rnd(-40, 40), rnd(-130, -40), rnd(0.5, 1.1), pick([1, 1, 2]), ramp, 1.5, -20, K_SPARK);
}

// Multi-stage explosion: flash → shock ring → fireball → sparks → embers →
// falling debris → secondary detonations, plus a light pulse on the terrain.
function explosion(g, x, y, scale = 1, ramp = RAMP.fire, secondaries = null) {
  flashFx(g, x, y, 8 + 7 * scale, 0.1 + 0.03 * scale);
  ringFx(g, x, y, 150 + 110 * scale, 0.3 + 0.08 * scale, ramp[2], "#ffffff");
  if (scale >= 1.2) ringFx(g, x, y, 90 + 50 * scale, 0.5, ramp[4], ramp[3]);
  const sq = Math.sqrt(scale);
  for (let i = 0; i < cnt(g, 22 * scale); i++) {
    const a = rnd(0, 6.283),
      sp = rnd(20, 210) * sq;
    addP(g, x + rnd(-3, 3), y + rnd(-3, 3), Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.25, 0.75), pick([2, 2, 3, 4]), ramp, 3.2, 0, K_SQ);
  }
  for (let i = 0; i < cnt(g, 8 * scale); i++) {
    const a = rnd(0, 6.283),
      sp = rnd(10, 120) * sq;
    addP(g, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.3, 0.6), pick([3, 4]), RAMP.fire, 3.5, 0, K_SQ);
  }
  sparks(g, x, y, 16 * scale, 0, Math.PI, 420 + 80 * scale);
  for (let i = 0; i < cnt(g, 10 * scale); i++) {
    const a = rnd(0, 6.283),
      sp = rnd(20, 110);
    addP(g, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 20, rnd(0.9, 2.0), pick([1, 2]), ramp, 1.0, -15, K_EMBER);
  }
  for (let i = 0; i < cnt(g, 5 * scale); i++)
    addP(g, x, y, rnd(-150, 150) * sq, rnd(-240, -40), rnd(2.5, 5), pick([2, 2, 3]), pick(["#8a8aa0", "#5c5c70", ramp[4], ramp[5]]), 0.3, 420, K_DEBRIS);
  light(g, x, y, 70 + 50 * scale, 0.3 + 0.15 * scale, ramp[2]);
  const sec = secondaries ?? Math.floor(scale * 1.6);
  for (let k = 0; k < sec; k++)
    later(g, rnd(0.07, 0.3) + k * 0.09, () =>
      miniBlast(g, x + rnd(-16, 16) * scale, y + rnd(-12, 12) * scale, 0.45 * scale + 0.2, Math.random() < 0.5 ? ramp : RAMP.fire)
    );
  shakeIt(g, 0.07 * scale);
}
function miniBlast(g, x, y, s, ramp) {
  flashFx(g, x, y, 6 + 6 * s, 0.08);
  ringFx(g, x, y, 120 * s + 60, 0.22, ramp[2], "#ffffff");
  for (let i = 0; i < cnt(g, 12 * s); i++) {
    const a = rnd(0, 6.283),
      sp = rnd(20, 160) * s;
    addP(g, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.2, 0.5), pick([2, 3]), ramp, 3.5, 0, K_SQ);
  }
  sparks(g, x, y, 8 * s, 0, Math.PI, 300);
  light(g, x, y, 40 + 30 * s, 0.2, ramp[2]);
  g.sfx.pop();
}

// Break a sprite into its actual pixels: most fly outward, some splinter into
// 1px shards, some become heavy chunks that fall, bounce and linger.
function shatter(g, x, y, rows, flip, vx0 = 0, vy0 = 0, power = 1) {
  const w = rows[0].length,
    h = rows.length;
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (ch === ".") continue;
      const col = PAL[ch];
      const cc = flip ? w - 1 - c : c;
      const px = x - (w * PX) / 2 + cc * PX,
        py = y - (h * PX) / 2 + r * PX;
      const dx = cc + 0.5 - w / 2,
        dy = r + 0.5 - h / 2;
      const ang = Math.atan2(dy, dx) + rnd(-0.6, 0.6);
      const sp = rnd(50, 160) * power * (0.7 + Math.hypot(dx, dy) * 0.1);
      const vx = Math.cos(ang) * sp + vx0 * 0.35,
        vy = Math.sin(ang) * sp + vy0 * 0.35;
      const roll = Math.random();
      if (roll < 0.14) {
        for (let k = 0; k < 3; k++)
          addP(g, px + rnd(0, 2), py + rnd(0, 2), vx * rnd(1.2, 2) + rnd(-40, 40), vy * rnd(1.2, 2) + rnd(-40, 40), rnd(0.3, 0.8), 1, col, 1.2, 80, K_SPARK);
      } else if (roll < 0.3) {
        addP(g, px, py, vx * 0.6, vy * 0.6 - 40, rnd(2.5, 5), pick([3, 4]), col, 0.5, 380, K_DEBRIS);
      } else {
        addP(g, px, py, vx, vy, rnd(0.6, 1.7), 2, col, rnd(0.6, 2.0), rnd(0, 90), K_SQ);
      }
    }
}

function updateParticles(g, dt) {
  const a = g.particles;
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    if (!p.rest) {
      if (p.drag) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f;
        p.vy *= f;
      }
      p.vy += p.grav * dt;
      p.x = wrap(p.x + p.vx * dt);
      p.y += p.vy * dt;
      if (p.kind === K_DEBRIS && p.y >= GROUND_Y - p.s) {
        p.y = GROUND_Y - p.s;
        if (Math.abs(p.vy) < 55) {
          p.rest = true;
          p.vx = 0;
          p.vy = 0;
          p.life = Math.min(p.life, rnd(1.5, 3.5));
          p.max = Math.max(p.max, p.life);
        } else {
          p.vy = -p.vy * 0.35;
          p.vx *= 0.55;
        }
      }
      if (p.y < PLAY_TOP - 30 || p.y > H + 10) continue;
    }
    a[j++] = p;
  }
  a.length = j;
}

function updateFx(g, dt) {
  for (const e of g.fx) {
    e.t += dt;
    if (e.type === "ring") e.r = Math.max(0, e.r + e.speed * dt * (1 - (0.5 * e.t) / e.life));
    else if (e.type === "ghost") e.x = wrap(e.x + e.vx * dt);
  }
  g.fx = g.fx.filter((e) => e.t < e.life);
  for (const l of g.lights) l.life -= dt;
  g.lights = g.lights.filter((l) => l.life > 0);
  if (g.timers.length) {
    const due = [];
    g.timers = g.timers.filter((tm) => {
      tm.t -= dt;
      if (tm.t <= 0) {
        due.push(tm);
        return false;
      }
      return true;
    });
    due.forEach((tm) => tm.fn());
  }
}
function updatePopups(g, dt) {
  for (const p of g.popups) {
    p.t -= dt;
    p.y -= 20 * dt;
  }
  g.popups = g.popups.filter((p) => p.t > 0);
}

const frameIndex = (g, e) => mod(Math.floor((g.time + e.seed) * ANIM_FPS[e.type]), SPRITES[e.type].length);

function killEnemy(g, e, award = true) {
  if (e.dead) return;
  e.dead = true;
  const sc = EXPLO_SCALE[e.type];
  shatter(g, e.x, e.y, SPRITES[e.type][frameIndex(g, e)], false, e.vx, e.vy, 1 + sc * 0.3);
  explosion(g, e.x, e.y, sc, ENEMY_RAMP[e.type]);
  g.sfx.explode(sc);
  if (award) {
    addScore(g, SCORES[e.type]);
    popup(g, e.x, e.y - 16, SCORES[e.type], e.type === "pod" ? RAMP.gold[2] : "#ffe838", 1.2, e.type === "pod" ? 2 : 1);
  }
  if (e.human) {
    const h = e.human;
    h.state = "falling";
    h.carrier = null;
    h.vy = 0;
    h.fallFrom = h.y;
    e.human = null;
  }
  if (e.type === "pod") {
    const n = 4 + Math.min(3, Math.floor(g.wave / 2));
    for (let i = 0; i < n; i++) {
      const s = makeEnemy("swarmer", e.x + rnd(-10, 10), e.y + rnd(-10, 10), g.wave);
      s.spawnT = 0;
      s.vx = rnd(-260, 260);
      s.vy = rnd(-200, 200);
      g.enemies.push(s);
    }
  }
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
function fireLaser(g) {
  const s = g.ship;
  if (g.lasers.length >= 4 || g.laserCD > 0 || s.hyper || !s.visible) return;
  g.laserCD = 0.11;
  const nx = s.x + s.dir * (SHIP.W / 2 - 2),
    ny = s.y + 3;
  g.lasers.push({ x: wrap(nx), y: ny, dir: s.dir, len: 0, tail: 0, vx: s.vx, t: 0, dead: false });
  flashFx(g, nx, ny, 7, 0.06);
  sparks(g, nx, ny, 3, s.dir > 0 ? 0 : Math.PI, 0.5, 260, RAMP.spark, 0);
  g.sfx.laser();
}

function laserImpact(g, x, y, dir) {
  flashFx(g, x, y, 12, 0.1);
  ringFx(g, x, y, 160, 0.18, "#ffffff", "#ffe838");
  sparks(g, x, y, 14, dir > 0 ? Math.PI : 0, 1.1, 380);
  light(g, x, y, 50, 0.18, "#fff0c0");
  g.sfx.hit();
}

function smartBomb(g) {
  const s = g.ship;
  if (g.bombs <= 0 || s.hyper || !s.visible) return;
  g.bombs--;
  g.bombFX = { t: 0 };
  g.sfx.smartBomb();
  shakeIt(g, 0.9);
  flashFx(g, s.x, s.y, 44, 0.3);
  ringFx(g, s.x, s.y, 1150, 0.75, "#ffffff", "#38f0ff", 0.55, 10);
  ringFx(g, s.x, s.y, 820, 0.85, "#ff3cff", "#ffffff", 0.55, 6);
  ringFx(g, s.x, s.y, 560, 0.95, "#ffe838", "#ff8c18", 0.55, 2);
  light(g, s.x, s.y, 420, 0.7, "#ffffff");
  sparks(g, s.x, s.y, 70, 0, Math.PI, 760, RAMP.plasma, 0);
  for (let i = 0; i < cnt(g, 40); i++) {
    const a = rnd(0, 6.283),
      sp = rnd(80, 300);
    addP(g, s.x, s.y, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, rnd(0.5, 1.1), pick([2, 3]), pick([RAMP.plasma, RAMP.magenta]), 2, 0, K_SQ);
  }
  // every enemy on screen is struck by a pixel bolt and detonates as the wave reaches it
  for (const e of g.enemies) {
    if (e.dead || e.doomT >= 0) continue;
    const sx = wdelta(g.camX, e.x);
    if (sx > -e.w && sx < W + e.w) {
      const d = Math.hypot(wdelta(s.x, e.x), e.y - s.y);
      e.doomT = d / 950 + 0.04;
      addFx(g, { type: "bolt", x: s.x, y: s.y, tx: e.x, ty: e.y, life: e.doomT + 0.12, seed: rnd(0, 99) });
    }
  }
  const onScreen = (o) => {
    const sx = wdelta(g.camX, o.x);
    return sx > -10 && sx < W + 10;
  };
  g.mines = g.mines.filter((m) => {
    if (!onScreen(m)) return true;
    sparks(g, m.x, m.y, 8, 0, Math.PI, 260, RAMP.plasma);
    flashFx(g, m.x, m.y, 6, 0.08);
    return false;
  });
  g.bullets = g.bullets.filter((b) => {
    if (!onScreen(b)) return true;
    sparks(g, b.x, b.y, 3, 0, Math.PI, 200, RAMP.magenta);
    return false;
  });
}

function dropCarried(g) {
  const s = g.ship;
  if (!s.carrying) return;
  const h = s.carrying;
  h.state = "falling";
  h.fallFrom = h.y;
  h.vy = 0;
  s.carrying = null;
}

function hyperspace(g) {
  const s = g.ship;
  if (s.hyper || !s.visible) return;
  s.hyper = true;
  s.hyperT = 0;
  s.hyperJumped = false;
  s.thrustLevel = 0;
  g.sfx.hyperOut();
  g.sfx.thrust(false);
  dropCarried(g);
  ringFx(g, s.x, s.y, -170, 0.38, "#38f0ff", "#ffffff", 1, 64);
  for (let i = 0; i < cnt(g, 40); i++) {
    const a = rnd(0, 6.283),
      r = rnd(40, 90);
    addP(g, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.7, -Math.cos(a) * r * 2.8, -Math.sin(a) * r * 2, 0.34, 1, RAMP.cyan, 0, 0, K_STREAK);
  }
}

function updateHyper(g, dt) {
  const s = g.ship;
  s.hyperT += dt;
  const t = s.hyperT;
  g.warp = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.45) / 0.5);
  if (t >= 0.42 && !s.hyperJumped) {
    s.hyperJumped = true;
    s.x = rnd(0, WORLD_W);
    s.y = rnd(PLAY_TOP + 40, GROUND_Y - 90);
    s.vx = 0;
    s.vy = 0;
    s.camOff = s.dir > 0 ? W * 0.27 : W * 0.73;
    g.camX = wrap(s.x - s.camOff);
    s.hist = [];
    g.flash = 0.2;
    g.flashColor = "#c0ffff";
    g.sfx.hyperIn();
    ringFx(g, s.x, s.y, 280, 0.5, "#ffffff", "#38f0ff", 1, 4);
    ringFx(g, s.x, s.y, 160, 0.6, "#a048ff", "#38f0ff", 1, 2);
  }
  if (t >= 0.95) {
    s.hyper = false;
    g.warp = 0;
    if (Math.random() < 0.12) {
      killShip(g); // the gamble didn't pay off
    } else {
      s.invul = 1.0;
      flashFx(g, s.x, s.y, 18, 0.14, "#c0ffff");
      sparks(g, s.x, s.y, 24, 0, Math.PI, 320, RAMP.cyan, 0);
    }
  }
}

function killShip(g) {
  if (g.mode !== "playing") return;
  const s = g.ship;
  g.mode = "dying";
  g.modeT = 0;
  g.deathStage = 0;
  s.hyper = false;
  g.warp = 0;
  g.sfx.thrust(false);
  g.sfx.shipHit();
  dropCarried(g);
}

// stage two of the death sequence: the ship blows apart
function detonateShip(g) {
  const s = g.ship;
  const x = s.x,
    y = s.y;
  s.visible = false;
  g.sfx.shipExplode();
  g.flash = 0.22; // brief — the explosion itself should be the star
  g.flashColor = "#ffffff";
  shakeIt(g, 1.3);
  shatter(g, x, y, SPRITES.ship[0], s.dir < 0, s.vx, s.vy, 2.4);
  explosion(g, x, y, 2.6, RAMP.fire, 0);
  ringFx(g, x, y, 540, 0.9, "#ffffff", "#ff3cff", 1, 4);
  ringFx(g, x, y, 340, 1.1, "#ffe838", "#ff2a2a", 1, 2);
  for (let i = 0; i < cnt(g, 48); i++) {
    const a = (i / 48) * 6.283 + rnd(-0.05, 0.05),
      sp = rnd(380, 660);
    addP(g, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.9, 1.6), pick([1, 2]), pick([RAMP.spark, RAMP.plasma, RAMP.magenta]), 0.8, 0, K_STREAK);
  }
  for (let k = 0; k < 8; k++)
    later(g, 0.12 + k * 0.13, () => {
      const a = rnd(0, 6.283),
        r = 14 + k * 9;
      explosion(g, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, rnd(0.6, 1.1), pick([RAMP.fire, RAMP.plasma, RAMP.magenta, RAMP.gold]), 0);
      g.sfx.pop();
    });
  light(g, x, y, 260, 1.2, "#fff0c0");
}

function respawn(g) {
  const s = g.ship;
  s.vx = 0;
  s.vy = 0;
  s.y = (PLAY_TOP + GROUND_Y) / 2 - 30;
  s.visible = true;
  s.invul = 3;
  s.hyper = false;
  s.thrustLevel = 0;
  s.hist = [];
  g.bullets = [];
  g.lasers = [];
  g.mines = [];
  g.enemies = g.enemies.filter((e) => e.type !== "baiter" && !e.dead);
  for (const e of g.enemies) {
    if (e.human) {
      e.human.state = "walk";
      e.human.carrier = null;
      e.human.y = GROUND_Y - 8 * PX;
      e.human = null;
      e.state = "seek";
    }
    e.x = wrap(s.x + pick([-1, 1]) * rnd(W * 1.4, WORLD_W / 2 - 100));
    e.y = rnd(PLAY_TOP + 20, GROUND_Y - 80);
    e.spawnT = SPAWN_T;
    e.doomT = -1;
    e.hist = [];
  }
  g.baiterT = 0;
  g.mode = "playing";
  g.modeT = 0;
  g.sfx.waveStart();
  ringFx(g, s.x, s.y, 200, 0.5, "#ffffff", "#38f0ff", 1, 4);
}

function destroyPlanet(g) {
  g.planetDestroyed = true;
  g.flash = 1.2;
  g.flashColor = "#ff6020";
  shakeIt(g, 1.6);
  g.sfx.planetBoom();
  g.msg = { lines: ["PLANET DESTROYED", "ALL LANDERS HAVE MUTATED"], t: 3.5, max: 3.5 };
  // the visible range breaks apart into its own pixels
  const cam = Math.round(g.camX);
  for (let x = -40; x < W + 40; x += PX) {
    const wx = cam + x;
    const ty = terrainAt(g.terrain, wx);
    if (Math.random() < 0.75)
      addP(g, wx, ty, rnd(-90, 90), rnd(-430, -120), rnd(1.5, 3.5), pick([2, 2, 3, 4]), pick(["#ec781e", "#ffc46a", "#6a2806", "#ff4010"]), 0.3, 300, K_DEBRIS);
    if (x % 8 === 0 && Math.random() < 0.6)
      addP(g, wx, GROUND_Y - rnd(0, 40), rnd(-30, 30), rnd(-260, -90), rnd(0.5, 1.2), pick([2, 3, 4]), RAMP.fire, 1.2, 60, K_SQ);
  }
  for (let k = 0; k < 14; k++)
    later(g, k * 0.1 + rnd(0, 0.1), () => {
      explosion(g, wrap(g.camX + rnd(0, W)), GROUND_Y - rnd(0, 100), rnd(1, 2), pick([RAMP.fire, RAMP.gold]), 0);
      g.sfx.explode(1.4);
    });
  for (const e of g.enemies) {
    if (e.type === "lander" && !e.dead) {
      e.type = "mutant";
      e.state = "hunt";
      e.human = null;
      e.fire = rnd(0.5, 1.5);
      flashFx(g, e.x, e.y, 10, 0.12, "#ff3cff");
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function update(g, dt) {
  g.time += dt;
  const p = g.pressed;
  if (g.toast && (g.toast.t -= dt) <= 0) g.toast = null;
  g.histAcc = (g.histAcc || 0) + dt;
  g.histTick = g.histAcc >= 1 / 60;
  if (g.histTick) g.histAcc = 0;

  if (g.mode === "title" || g.mode === "gameover") {
    g.attractT += dt;
    g.camX = wrap(g.camX + 70 * dt);
    updateParticles(g, dt);
    updateFx(g, dt);
    updatePopups(g, dt);
    updateHumans(g, dt, false);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 1.5);
    if (g.flash > 0) g.flash -= dt;
    if (p.start) startGame(g);
    g.pressed = {};
    return;
  }

  if (p.pause) g.paused = !g.paused;
  if (g.paused) {
    g.pressed = {};
    g.sfx.thrust(false);
    return;
  }

  g.modeT += dt;
  if (g.flash > 0) g.flash -= dt;
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 1.5);
  if (g.msg && (g.msg.t -= dt) <= 0) g.msg = null;
  if (g.bombFX && (g.bombFX.t += dt) > 1.2) g.bombFX = null;
  const s = g.ship;

  if (g.mode === "waveclear") {
    updateParticles(g, dt);
    updateFx(g, dt);
    updatePopups(g, dt);
    updateHumans(g, dt, false);
    updateTally(g, dt);
    if (g.tally && g.tally.done > 1.6) startWave(g, g.wave + 1);
    g.pressed = {};
    return;
  }

  if (g.mode === "dying") {
    if (g.deathStage === 0) {
      // the world freezes while the ship flickers and sparks...
      if (Math.random() < 0.6) sparks(g, s.x + rnd(-14, 14), s.y + rnd(-4, 4), 2, rnd(0, 6.28), 1, 200);
      if (g.modeT > 0.55) {
        g.deathStage = 1;
        detonateShip(g);
      }
    }
    updateParticles(g, dt);
    updateFx(g, dt);
    updatePopups(g, dt);
    updateHumans(g, dt, false);
    if (g.modeT > 3.6) {
      if (g.lives > 0) {
        g.lives--;
        respawn(g);
      } else {
        g.mode = "gameover";
        g.modeT = 0;
        g.attractT = 0;
        g.sfx.thrust(false);
      }
    }
    g.pressed = {};
    return;
  }

  // ---------------- playing ----------------
  g.waveT += dt;
  if (g.laserCD > 0) g.laserCD -= dt;
  if (s.invul > 0) s.invul -= dt;
  if (s.hyper) updateHyper(g, dt);
  else updateShip(g, dt);
  if (g.mode !== "playing") {
    g.pressed = {};
    return;
  }

  // camera: the ship glides to the rear third of the screen, looking ahead
  const target = s.dir > 0 ? W * 0.27 : W * 0.73;
  s.camOff += (target - s.camOff) * (1 - Math.exp(-3.2 * dt));
  g.camX = wrap(s.x - s.camOff);

  // lasers
  for (const L of g.lasers) {
    L.t += dt;
    const prev = L.len;
    if (!L.dead) L.len = Math.min(L.len + 2800 * dt, W * 1.15);
    if (L.t > 0.2 || L.dead) L.tail += 3600 * dt;
    L.x = wrap(L.x + L.vx * dt);
    if (L.len > prev && Math.random() < 0.9 * g.fxMul) {
      const d = rnd(prev, L.len);
      addP(g, L.x + L.dir * d, L.y + pick([-2, 3]), L.vx * 0.6 + rnd(-30, 30), rnd(-20, 20), rnd(0.1, 0.3), 1, pick(LASER_COLS), 2, 0, K_SPARK);
    }
    if (L.tail >= L.len) L.remove = true;
  }
  g.lasers = g.lasers.filter((L) => !L.remove);

  updateEnemies(g, dt);

  // reinforcements
  const activeLanders = g.enemies.filter((e) => (e.type === "lander" || e.type === "mutant") && !e.dead).length;
  if (g.landersToSpawn > 0) {
    g.spawnT -= dt;
    if (g.spawnT <= 0 || activeLanders <= 2) {
      const n = Math.min(g.landersToSpawn, 4 + Math.min(g.wave, 4));
      for (let i = 0; i < n; i++) spawnLander(g);
      g.landersToSpawn -= n;
      g.spawnT = 14;
    }
  }

  // baiters punish dawdling
  g.baiterT += dt;
  const baiterDelay = Math.max(22, 45 - g.wave * 2);
  const baiters = g.enemies.filter((e) => e.type === "baiter" && !e.dead).length;
  if (g.baiterT > baiterDelay && baiters < 1 + Math.floor(g.wave / 3)) {
    const b = makeEnemy("baiter", wrap(s.x + pick([-1, 1]) * rnd(W * 0.55, W * 0.85)), rnd(PLAY_TOP + 20, GROUND_Y - 60), g.wave);
    g.enemies.push(b);
    g.baiterT = baiterDelay - rnd(8, 14);
    g.sfx.baiterWarn();
  }

  // enemy shots
  for (const b of g.bullets) {
    b.x = wrap(b.x + b.vx * dt);
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.y < PLAY_TOP || b.y > GROUND_Y + 10) b.life = 0;
  }
  g.bullets = g.bullets.filter((b) => b.life > 0);
  for (const m of g.mines) m.life -= dt;
  g.mines = g.mines.filter((m) => m.life > 0);

  updateHumans(g, dt, true);
  updateParticles(g, dt);
  updateFx(g, dt);
  updatePopups(g, dt);
  if (g.mode === "playing") collisions(g);
  g.enemies = g.enemies.filter((e) => !e.dead);

  if (!g.planetDestroyed && g.mode === "playing" && g.humans.every((h) => h.dead)) destroyPlanet(g);

  // wave complete?
  if (g.mode === "playing" && g.landersToSpawn === 0 && g.modeT > 2) {
    if (!g.enemies.some((e) => e.type !== "baiter" && !e.dead)) {
      g.mode = "waveclear";
      g.modeT = 0;
      g.enemies.forEach((e) => e.type === "baiter" && explosion(g, e.x, e.y, 1, RAMP.toxic, 0));
      g.enemies = [];
      g.bullets = [];
      g.mines = [];
      g.sfx.thrust(false);
      g.sfx.waveClear();
      const alive = g.humans.filter((h) => !h.dead).length;
      const per = 100 * Math.min(g.wave, 5);
      g.tally = { alive, per, shown: 0, t: -0.8, done: 0 };
      addScore(g, alive * per);
    }
  }
  g.pressed = {};
}

function updateTally(g, dt) {
  const T = g.tally;
  if (!T) return;
  T.t += dt;
  if (T.shown < T.alive) {
    if (T.t >= 0.16) {
      T.t = 0;
      T.shown++;
      g.sfx.tally(T.shown);
    }
  } else T.done += dt;
}

function updateShip(g, dt) {
  const s = g.ship,
    k = g.keys,
    p = g.pressed;
  let thrust = false;
  const prevDir = s.dir;
  if (k.ArrowRight || k.KeyD) {
    s.dir = 1;
    thrust = true;
  } else if (k.ArrowLeft || k.KeyA) {
    s.dir = -1;
    thrust = true;
  }
  if (p.reverse) s.dir = -s.dir;
  if (k.ShiftLeft || k.ShiftRight || k.KeyX) thrust = true;
  if (s.dir !== prevDir) {
    // reverse: afterimage of the old facing and a retro-burst from the nose
    addFx(g, { type: "ghost", x: s.x, y: s.y, vx: s.vx * 0.5, dir: prevDir, life: 0.22 });
    const nose = s.x + prevDir * (SHIP.W / 2);
    for (let i = 0; i < cnt(g, 10); i++)
      addP(g, nose, s.y + rnd(0, 5), prevDir * rnd(80, 220) + s.vx * 0.7, rnd(-40, 40), rnd(0.12, 0.3), pick([1, 2]), RAMP.plasma, 3, 0, K_SQ);
    g.sfx.reverse();
  }
  s.thrusting = thrust;
  s.thrustLevel = thrust ? Math.min(1, s.thrustLevel + dt * 7) : Math.max(0, s.thrustLevel - dt * 3.5);
  g.sfx.thrust(thrust);

  if (thrust) s.vx += s.dir * SHIP.ACC * dt;
  else s.vx *= Math.exp(-SHIP.DRAG * dt);
  s.vx = clamp(s.vx, -SHIP.MAX_VX, SHIP.MAX_VX);

  let vin = 0;
  if (k.ArrowUp || k.KeyW) vin -= 1;
  if (k.ArrowDown || k.KeyS) vin += 1;
  s.vin = vin;
  const prevVy = s.vy;
  s.vy += SHIP.GRAVITY * dt;
  if (vin !== 0) {
    s.vy += vin * SHIP.VACC * dt;
    s.vy *= Math.exp(-SHIP.VDRAG_IN * dt);
  } else s.vy *= Math.exp(-SHIP.VDRAG_IDLE * dt);
  s.vy = clamp(s.vy, -SHIP.MAX_VY, vin > 0 ? SHIP.MAX_VY : SHIP.MAX_FALL);

  s.x = wrap(s.x + s.vx * dt);
  s.y += s.vy * dt;
  const minY = PLAY_TOP + SHIP.H / 2,
    maxY = GROUND_Y - SHIP.H / 2 - 2;
  if (s.y < minY) {
    s.y = minY;
    s.vy = Math.max(0, s.vy);
  }
  if (s.scrapeCD > 0) s.scrapeCD -= dt;
  if (s.y > maxY) {
    s.y = maxY;
    if (prevVy > 160 && s.scrapeCD <= 0) {
      // belly-flop on the surface: sparks and dust, no damage
      sparks(g, s.x, GROUND_Y - 1, 14, -Math.PI / 2, 1.2, 260);
      dust(g, s.x, GROUND_Y - 2, 12);
      shakeIt(g, 0.12);
      g.sfx.scrape();
      s.scrapeCD = 0.3;
    }
    s.vy = Math.min(0, s.vy);
    if (Math.abs(s.vx) > 160 && Math.random() < 0.5) sparks(g, s.x - s.dir * 10, GROUND_Y - 1, 1, s.dir > 0 ? -2.6 : -0.5, 0.4, 220);
  }

  if (p.fire || k.Space) fireLaser(g);
  if (p.bomb) smartBomb(g);
  if (p.hyper) hyperspace(g);

  // main engine exhaust
  const L = s.thrustLevel;
  const nozX = s.x - s.dir * (SHIP.W / 2),
    nozY = s.y + 3;
  if (L > 0.05) {
    const n = (thrust ? 190 : 60) * L * g.fxMul * dt;
    let m = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (m-- > 0) {
      const spark = Math.random() < 0.1;
      addP(g, nozX, nozY + rnd(-3, 3), -s.dir * rnd(180, 420) * (0.5 + L * 0.5) + s.vx * 0.85, rnd(-35, 35), spark ? rnd(0.2, 0.4) : rnd(0.1, 0.32), spark ? 1 : pick([1, 2, 2, 3]), spark ? RAMP.spark : RAMP.fire, spark ? 1 : 2.6, 0, spark ? K_STREAK : K_SQ);
    }
  }
  // manoeuvring jets
  if (vin !== 0 && Math.random() < 0.7 * g.fxMul) {
    const jy = vin < 0 ? s.y + SHIP.H / 2 : s.y - SHIP.H / 2 + 4;
    addP(g, s.x + rnd(-10, 4) * s.dir, jy, s.vx * 0.9 + rnd(-20, 20), -vin * rnd(70, 160), rnd(0.08, 0.2), 1, RAMP.cyan, 3, 0, K_SQ);
  }

  if (g.histTick) {
    s.hist.unshift({ x: s.x, y: s.y, dir: s.dir });
    if (s.hist.length > 6) s.hist.pop();
  }
}

// ---------------------------------------------------------------------------
// Enemy AI
// ---------------------------------------------------------------------------
function shootAt(g, e, speed, spread = 0.25) {
  const s = g.ship;
  if (s.hyper || !s.visible) return;
  const sx = wdelta(g.camX, e.x);
  if (sx < -W * 0.3 || sx > W * 1.3) return;
  const dx = wdelta(e.x, s.x) + s.vx * 0.35,
    dy = s.y - e.y;
  const a = Math.atan2(dy, dx) + rnd(-spread, spread);
  g.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 3 });
  flashFx(g, e.x, e.y, 4, 0.05, "#ffffff");
  g.sfx.enemyShot();
}

function updateEnemies(g, dt) {
  const s = g.ship;
  const wave = g.wave;
  const diff = 1 + Math.min(wave - 1, 10) * 0.09;
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.t += dt;
    if (e.doomT >= 0) {
      e.doomT -= dt;
      if (e.doomT < 0) killEnemy(g, e, true);
      continue;
    }
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      if (e.spawnT <= 0) {
        const sx = wdelta(g.camX, e.x);
        if (sx > -20 && sx < W + 20) {
          flashFx(g, e.x, e.y, 9, 0.1);
          g.sfx.materialize();
        }
      }
      continue;
    }
    const dxS = wdelta(e.x, s.x);
    const dyS = s.y - e.y;
    e.fire -= dt;

    switch (e.type) {
      case "lander": {
        if (e.state === "seek") {
          if (!e.target || e.target.state !== "walk" || e.target.dead) {
            e.target = null;
            let best = 1e9;
            for (const h of g.humans) {
              if (h.dead || h.state !== "walk") continue;
              const d = Math.abs(wdelta(e.x, h.x));
              if (d < best) {
                best = d;
                e.target = h;
              }
            }
          }
          if (e.target) {
            const dx = wdelta(e.x, e.target.x);
            const sp = 70 * diff;
            e.vx += clamp(dx * 2, -sp, sp) * dt * 3 - e.vx * dt * 2;
            e.vx = clamp(e.vx, -sp, sp);
            const ty = PLAY_TOP + 110 + Math.sin(e.t * 1.5) * 50;
            e.vy = (ty - e.y) * 1.6;
            if (Math.abs(dx) < 10 && Math.random() < dt * 0.55) {
              e.state = "descend";
              e.vx = 0;
            }
          } else {
            e.vx += Math.sin(e.t * 0.7) * 30 * dt;
            e.vx = clamp(e.vx, -60, 60);
            e.vy = Math.cos(e.t * 0.9) * 40;
          }
        } else if (e.state === "descend") {
          const h = e.target;
          if (!h || h.dead || h.state !== "walk") {
            e.state = "seek";
            break;
          }
          e.vx = clamp(wdelta(e.x, h.x) * 3, -60, 60);
          e.vy = 58 * diff;
          if (e.y >= h.y - 26) {
            e.state = "abduct";
            e.human = h;
            h.state = "carried";
            h.carrier = e;
            e.vy = -27 * Math.sqrt(diff);
            g.sfx.abduct();
          }
        } else if (e.state === "abduct") {
          const h = e.human;
          if (!h || h.state !== "carried") {
            e.state = "seek";
            e.human = null;
            break;
          }
          e.vx = Math.sin(e.t * 2) * 25;
          e.vy = -27 * Math.sqrt(diff);
          if (e.y <= PLAY_TOP + 12) {
            // reached orbit: the humanoid is absorbed and the lander mutates
            h.dead = true;
            h.state = "dead";
            h.carrier = null;
            shatter(g, h.x, h.y + 8, SPRITES.human[3], false, 0, -60, 0.8);
            e.human = null;
            e.type = "mutant";
            e.state = "hunt";
            e.fire = 1;
            flashFx(g, e.x, e.y, 18, 0.15, "#ff3cff");
            ringFx(g, e.x, e.y, 220, 0.4, "#ff3cff", "#40ff50");
            for (let i = 0; i < cnt(g, 30); i++) {
              const a = rnd(0, 6.283),
                sp = rnd(40, 180);
              addP(g, e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.3, 0.8), pick([1, 2]), RAMP.magenta, 2, 0, K_SQ);
            }
            g.sfx.mutate();
            popup(g, e.x, e.y + 22, "MUTANT!", "#ff3cff");
          }
        }
        if (e.fire <= 0) {
          shootAt(g, e, 150 + wave * 10, 0.35);
          e.fire = rnd(3, 6) / diff;
        }
        break;
      }
      case "mutant": {
        e.jitter -= dt;
        if (e.jitter <= 0) {
          e.jitter = rnd(0.15, 0.4);
          const sp = 210 * diff;
          e.tvx = clamp(dxS, -1, 1) * sp * rnd(0.5, 1.2) + rnd(-120, 120);
          e.tvy = clamp(dyS, -1, 1) * 180 * rnd(0.3, 1.2) + rnd(-150, 150);
        }
        e.vx += ((e.tvx || 0) - e.vx) * Math.min(1, 6 * dt);
        e.vy += ((e.tvy || 0) - e.vy) * Math.min(1, 6 * dt);
        const dist = Math.hypot(dxS, dyS);
        if (dist < 90 && dist > 0.001) {
          const push = (90 - dist) * 14;
          e.vx -= (dxS / dist) * push * dt;
          e.vy -= (dyS / dist) * push * dt;
        }
        if (e.fire <= 0) {
          shootAt(g, e, 180 + wave * 10, 0.25);
          e.fire = rnd(1.2, 2.4) / diff;
        }
        break;
      }
      case "bomber": {
        if (Math.sin(e.t * 2.5) > 0.97 && Math.random() < 0.3) e.vy = -e.vy;
        if (e.fire <= 0) {
          const sx = wdelta(g.camX, e.x);
          if (sx > -W * 0.2 && sx < W * 1.2) g.mines.push({ x: e.x, y: e.y, life: 14, seed: rnd(0, 9) });
          e.fire = 1.0 / Math.sqrt(diff);
        }
        if (Math.random() < 0.004) e.vx = -e.vx;
        break;
      }
      case "pod":
        e.vy = Math.sin(e.t * 0.8) * 30;
        break;
      case "swarmer": {
        const sp = 230 * diff;
        e.vx += (clamp(dxS, -1, 1) * 500 + Math.sin(e.t * 5 + e.seed) * 200) * dt;
        e.vy += (clamp(dyS, -1, 1) * 500 + Math.cos(e.t * 4 + e.seed) * 250) * dt;
        const v = Math.hypot(e.vx, e.vy);
        if (v > sp) {
          e.vx *= sp / v;
          e.vy *= sp / v;
        }
        if (e.fire <= 0) {
          if (Math.abs(dxS) < W) shootAt(g, e, 230, 0.15);
          e.fire = rnd(1.5, 3.5) / diff;
        }
        break;
      }
      case "baiter": {
        const sp = SHIP.MAX_VX * 1.05 + wave * 8;
        e.vx += (clamp(dxS * 4, -sp, sp) - e.vx) * Math.min(1, 2.2 * dt);
        e.vy += (clamp(dyS * 4, -260, 260) - e.vy) * Math.min(1, 3 * dt);
        if (e.fire <= 0) {
          shootAt(g, e, 280 + wave * 10, 0.12);
          e.fire = rnd(0.6, 1.1);
        }
        break;
      }
      default:
        break;
    }

    e.x = wrap(e.x + e.vx * dt);
    e.y += e.vy * dt;
    const minY = PLAY_TOP + e.h / 2,
      maxY = GROUND_Y - e.h / 2 - (e.type === "lander" ? 0 : 6);
    if (e.y < minY) {
      e.y = minY;
      if (e.type !== "lander") e.vy = Math.abs(e.vy);
    }
    if (e.y > maxY) {
      e.y = maxY;
      e.vy = -Math.abs(e.vy);
    }
    if (g.histTick && (e.type === "baiter" || e.type === "swarmer" || e.type === "mutant")) {
      e.hist.unshift({ x: e.x, y: e.y });
      if (e.hist.length > 5) e.hist.pop();
    }
  }
}

// ---------------------------------------------------------------------------
// Humanoids
// ---------------------------------------------------------------------------
function updateHumans(g, dt, allowCatch) {
  const s = g.ship;
  const standY = GROUND_Y - 8 * PX;
  for (const h of g.humans) {
    if (h.dead) continue;
    if (h.cheer > 0) h.cheer -= dt;
    switch (h.state) {
      case "walk":
        h.walkT -= dt;
        if (h.walkT <= 0) {
          h.walkT = rnd(2, 6);
          h.vx = pick([-1, 1, 0]) * rnd(8, 16);
        }
        if (h.cheer > 0) break;
        h.x = wrap(h.x + h.vx * dt);
        h.phase += Math.abs(h.vx) * dt * 0.3;
        if (h.vx) h.face = Math.sign(h.vx);
        h.y = standY;
        break;
      case "carried":
        if (h.carrier && !h.carrier.dead) {
          h.x = h.carrier.x;
          h.y = h.carrier.y + h.carrier.h / 2 + 14; // dangling in the tractor beam
        } else {
          h.state = "falling";
          h.carrier = null;
          h.fallFrom = h.y;
          h.vy = 0;
        }
        break;
      case "falling":
        h.vy = Math.min(h.vy + 130 * dt, 220);
        h.y += h.vy * dt;
        if (h.y >= standY) {
          h.y = standY;
          if (h.y - h.fallFrom > 150 || g.planetDestroyed) {
            h.dead = true;
            h.state = "dead";
            shatter(g, h.x, h.y + 8, SPRITES.human[3], false, 0, 60, 1.1);
            for (let i = 0; i < cnt(g, 14); i++) addP(g, h.x, h.y + 14, rnd(-120, 120), rnd(-160, -30), rnd(0.3, 0.7), pick([1, 2]), pick(["#ff2a2a", "#a01818", "#ff9ccc"]), 1.5, 400, K_DEBRIS);
            g.sfx.humanDie();
          } else {
            h.state = "walk";
            h.vy = 0;
            h.cheer = 0.9;
            dust(g, h.x, GROUND_Y - 1, 10);
            addScore(g, 250);
            popup(g, h.x, h.y - 16, 250, "#38f0ff");
            g.sfx.pickup();
          }
        } else if (allowCatch && s.visible && !s.hyper && g.mode === "playing" && !s.carrying) {
          if (Math.abs(wdelta(s.x, h.x)) < SHIP.W / 2 + 4 && Math.abs(h.y - s.y) < SHIP.H / 2 + 14) {
            h.state = "held";
            s.carrying = h;
            addScore(g, 500);
            popup(g, s.x, s.y - 22, 500, "#38f0ff", 1.3, 2);
            ringFx(g, h.x, h.y + 8, 160, 0.3, "#38f0ff", "#ffffff");
            sparkle(g, h.x, h.y + 8, 12);
            g.sfx.pickup();
          }
        }
        break;
      case "held":
        h.x = wrap(s.x + Math.sin(g.time * 5) * 1.5);
        h.y = s.y + SHIP.H / 2 + 6;
        if (!s.visible) {
          h.state = "falling";
          h.fallFrom = h.y;
          h.vy = 0;
          s.carrying = null;
        } else if (h.y >= standY - 4 && !g.planetDestroyed) {
          h.state = "walk";
          h.y = standY;
          s.carrying = null;
          h.cheer = 1.4;
          addScore(g, 500);
          popup(g, h.x, h.y - 26, "RESCUED 500", "#40ff50", 1.6, 1);
          ringFx(g, h.x, h.y + 8, 200, 0.45, "#40ff50", "#ffffff");
          sparkle(g, h.x, h.y + 6, 24, RAMP.toxic);
          dust(g, h.x, GROUND_Y - 1, 8);
          g.sfx.rescue();
        }
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(wdelta(ax, bx)) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
}

function collisions(g) {
  const s = g.ship;
  for (const L of g.lasers) {
    if (L.dead) continue;
    let best = null,
      bestD = 1e9;
    for (const e of g.enemies) {
      if (e.dead || e.spawnT > 0 || e.doomT >= 0) continue;
      if (Math.abs(e.y - L.y) > e.h / 2 + 1) continue;
      const d = wdelta(L.x, e.x) * L.dir;
      if (d < L.tail - e.w / 2 || d > L.len + e.w / 2) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) {
      const hitD = Math.max(0, bestD - best.w / 2);
      laserImpact(g, L.x + L.dir * hitD, L.y, L.dir);
      killEnemy(g, best);
      L.len = hitD;
      L.dead = true;
    }
  }

  if (!s.visible || s.hyper) return;
  const vulnerable = s.invul <= 0;
  for (const e of g.enemies) {
    if (e.dead || e.spawnT > 0 || e.doomT >= 0) continue;
    if (vulnerable && aabb(s.x, s.y, SHIP.W - 10, SHIP.H - 4, e.x, e.y, e.w - 2, e.h - 2)) {
      killEnemy(g, e);
      killShip(g);
      return;
    }
  }
  if (!vulnerable) return;
  for (const b of g.bullets) {
    if (aabb(s.x, s.y, SHIP.W - 10, SHIP.H - 2, b.x, b.y, 4, 4)) {
      b.life = 0;
      killShip(g);
      return;
    }
  }
  for (const m of g.mines) {
    if (aabb(s.x, s.y, SHIP.W - 10, SHIP.H - 2, m.x, m.y, 6, 6)) {
      m.life = 0;
      killShip(g);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering (everything is drawn into the low-res pixel buffer)
// ---------------------------------------------------------------------------
function pxLine(ctx, x0, y0, x1, y1, size) {
  const dx = x1 - x0,
    dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / size));
  for (let i = 0; i <= steps; i++) ctx.fillRect(Math.round(x0 + (dx * i) / steps), Math.round(y0 + (dy * i) / steps), size, size);
}

function ensureStrips(g, R) {
  const key = g.terrainVer + (g.settings.scenery ? "e" : "c");
  if (R.terrainKey !== key) {
    R.terrain = renderTerrainStrip(g.terrain, g.settings.scenery);
    R.terrainKey = key;
  }
  if (!R.far) R.far = renderFarStrip();
  if (!R.neb) R.neb = renderNebula();
}

function render(g, ctx, R) {
  ensureStrips(g, R);
  const S = g.settings;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  let ox = 0,
    oy = 0;
  if (S.shake && g.shake > 0) {
    const a = g.shake * 5;
    ox = Math.round(rnd(-a, a));
    oy = Math.round(rnd(-a, a));
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HUD_H, W, H - HUD_H);
  ctx.clip();
  ctx.translate(ox, oy);
  drawBackground(g, ctx, R);
  drawWorld(g, ctx, R);
  ctx.restore();
  drawScreenFlash(g, ctx, R);
  drawHUD(g, ctx, R);
  drawOverlays(g, ctx, R);
}

function drawBackground(g, ctx, R) {
  const S = g.settings,
    camX = g.camX;
  const bombGlow = g.bombFX && g.bombFX.t < 0.5;
  if (S.scenery) {
    const n = R.neb;
    ctx.drawImage(n.canvas, mod(Math.round(camX * 0.25), NEB_P), 0, W, n.canvas.height, 0, n.top, W, n.canvas.height);
  }
  // stars — three parallax layers, twinkling; stretched into streaks during hyperspace
  const warp = g.warp;
  for (const L of g.stars) {
    const off = Math.round(camX * L.p);
    for (const st of L.stars) {
      const x = mod(st.x - off, L.period);
      if (x >= W) continue;
      const tw = Math.sin(g.time * st.tw + st.ph);
      if (tw < -0.93 && L.p > 0.3) continue;
      ctx.fillStyle = bombGlow ? "#ffffff" : tw > 0.9 && L.p > 0.7 ? "#ffffff" : st.c;
      if (warp > 0.02) {
        const len = Math.round(warp * 70 * L.p) + st.s;
        ctx.fillRect(x - len, st.y, len * 2, st.s);
      } else ctx.fillRect(x, st.y, st.s, st.s);
    }
  }
  if (g.planetDestroyed) {
    // a scorched, smouldering floor is all that's left
    const off = Math.round(camX);
    for (let x = -mod(off, 6); x < W; x += 6) {
      const hv = hash(Math.floor((x + off) / 6) * 1.7 + Math.floor(g.time * 4));
      ctx.fillStyle = hv < 0.15 ? "#ff6020" : hv < 0.4 ? "#601808" : "#2a0c04";
      ctx.fillRect(x, GROUND_Y, 3, PX);
    }
    return;
  }
  if (S.scenery) {
    const f = R.far;
    ctx.drawImage(f.canvas, mod(Math.round(camX * 0.5), FAR_P), 0, W, f.canvas.height, 0, f.top, W, f.canvas.height);
  }
  const t = R.terrain;
  ctx.drawImage(t, mod(Math.round(camX), WORLD_W), 0, W, t.height, 0, STRIP_TOP, W, t.height);
  if (S.lighting) drawTerrainLights(g, ctx);
}

// explosions light up the mountain contour and the ground in pixel steps
function drawTerrainLights(g, ctx) {
  if (!g.lights.length) return;
  const camI = Math.round(g.camX);
  for (const l of g.lights) {
    const lk = l.life / l.max;
    const lsx = wdelta(camI, l.x);
    if (lsx < -l.r || lsx > W + l.r) continue;
    const start = Math.floor((camI + lsx - l.r) / PX) * PX;
    const end = camI + lsx + l.r;
    for (let wx = start; wx <= end; wx += PX) {
      const sx = wx - camI;
      if (sx < 0 || sx >= W) continue;
      const i = mod(wx / PX, TCOLS);
      const y0 = g.terrain[i],
        y1 = g.terrain[(i + 1) % TCOLS];
      const top = Math.min(y0, y1);
      const dx = sx - lsx;
      const I = (1 - Math.hypot(dx, (top - l.y) * 0.7) / l.r) * lk;
      if (I > 0.12) {
        ctx.fillStyle = I > 0.6 ? "#fff6d0" : I > 0.35 ? l.col : "#ff9a30";
        ctx.fillRect(sx, top, PX, Math.abs(y1 - y0) + PX);
      }
      const Ig = (1 - Math.hypot(dx, (GROUND_Y - l.y) * 0.7) / l.r) * lk;
      if (Ig > 0.15) {
        ctx.fillStyle = Ig > 0.5 ? "#ffd070" : "#a05020";
        ctx.fillRect(sx, GROUND_Y, PX, PX);
      }
    }
  }
}

function drawWorld(g, ctx, R) {
  const camX = g.camX;
  const fr = Math.floor(g.time * 60);
  for (const m of g.mines) {
    const sx = Math.round(wdelta(camX, m.x));
    if (sx < -8 || sx > W + 8) continue;
    ctx.drawImage(R.mine.frames[Math.floor((g.time + m.seed) * 8) % 2], sx - 3, Math.round(m.y) - 3);
  }
  for (const h of g.humans) drawHuman(g, ctx, R, h);
  for (const e of g.enemies) drawEnemy(g, ctx, R, e);
  drawShip(g, ctx, R);
  drawLasers(g, ctx);
  for (const b of g.bullets) {
    const sx = Math.round(wdelta(camX, b.x));
    if (sx < -6 || sx > W + 6) continue;
    const by = Math.round(b.y);
    ctx.fillStyle = "#702070";
    ctx.fillRect(Math.round(sx - b.vx * 0.014) - 1, Math.round(by - b.vy * 0.014) - 1, 2, 2);
    ctx.fillStyle = (fr >> 1) % 2 ? "#ffffff" : "#ff3cff";
    ctx.fillRect(sx - 2, by - 2, 4, 4);
  }
  drawFx(g, ctx, R);
  drawParticles(g, ctx);
  for (const p of g.popups) {
    const sx = Math.round(wdelta(camX, p.x));
    if (sx < -90 || sx > W + 90) continue;
    const age = p.max - p.t;
    const col = age < 0.1 ? "#ffffff" : p.t < 0.35 && (fr >> 2) % 2 ? "#606060" : p.color;
    drawText(ctx, p.text, sx, Math.round(p.y), p.size, col, "center", "#000000");
  }
}

function drawMaterialize(ctx, pix, sx, sy, w, h, k, seed, time) {
  // k = 1: pixels scattered far away → k = 0: assembled sprite
  const e = k * k;
  const tf = Math.floor(time * 30);
  for (let i = 0; i < pix.length; i++) {
    const p = pix[i];
    const a = hash(seed + i * 1.7) * 6.2832;
    const r = (22 + hash(seed * 0.7 + i * 3.1) * 70) * e;
    ctx.fillStyle = k > 0.5 && (i + tf) % 3 === 0 ? "#ffffff" : p.c;
    ctx.fillRect(Math.round(sx - w / 2 + p.x + Math.cos(a) * r), Math.round(sy - h / 2 + p.y + Math.sin(a) * r * 0.75), PX, PX);
  }
}

function drawHuman(g, ctx, R, h) {
  if (h.dead) return;
  const sx = Math.round(wdelta(g.camX, h.x));
  if (sx < -12 || sx > W + 12) return;
  const set = R.human;
  let f = 1,
    flip = h.face < 0,
    y = Math.round(h.y);
  const t = g.time;
  if (h.state === "walk") {
    if (h.cheer > 0) {
      const b = Math.floor(t * 8) % 2;
      f = b ? 3 : 4;
      y -= b ? 2 : 0; // hop and wave
    } else f = h.vx ? [0, 1, 2, 1][Math.floor(h.phase) % 4] : 1;
  } else if (h.state === "carried") {
    f = 3 + (Math.floor(t * 6) % 2); // kicking & struggling
    flip = Math.floor(t * 3) % 2 === 0;
  } else if (h.state === "falling") {
    f = 3 + (Math.floor(t * 14) % 2); // flailing
    flip = Math.floor(t * 7) % 2 === 0;
    if (h.vy > 50) {
      ctx.fillStyle = "#38f0ff";
      const len = Math.round(h.vy * 0.05);
      for (let i = 0; i < 3; i++) ctx.fillRect(sx - 5 + i * 5, y - 3 - len - (i % 2) * 3, 1, len);
    }
  } else if (h.state === "held") f = 3 + (Math.floor(t * 3) % 2);
  ctx.drawImage((flip ? set.framesL : set.frames)[f], sx - set.w / 2, y);
}

function drawTractor(ctx, sx, y0, y1, t) {
  const span = Math.max(1, y1 - y0);
  for (let y = y0; y < y1; y += 2) {
    const b = mod(Math.floor((y + t * 70) / 2), 4);
    if (b > 1) continue;
    const k = (y - y0) / span;
    const w = 2 + Math.round(k * 3) * 2;
    ctx.fillStyle = b === 0 ? "#b8ff58" : "#40ff50";
    ctx.fillRect(sx - w / 2, y, w, 2);
  }
}

function drawEnemy(g, ctx, R, e) {
  if (e.dead) return;
  const sx = Math.round(wdelta(g.camX, e.x));
  if (sx < -e.w - 80 || sx > W + e.w + 80) return;
  const set = R[e.type];
  const fi = frameIndex(g, e);
  const y = Math.round(e.y);
  if (e.spawnT > 0) {
    drawMaterialize(ctx, set.pix[fi], sx, y, set.w, set.h, e.spawnT / SPAWN_T, e.seed, g.time);
    return;
  }
  if (g.settings.trails && e.hist.length > 1) {
    for (let i = e.hist.length - 1; i >= 1; i--) {
      const hp = e.hist[i];
      ctx.globalAlpha = 0.4 * (1 - i / e.hist.length);
      ctx.drawImage(set.trail, Math.round(wdelta(g.camX, hp.x)) - set.w / 2, Math.round(hp.y) - set.h / 2);
    }
    ctx.globalAlpha = 1;
  }
  const img = e.doomT >= 0 && Math.floor(g.time * 30) % 2 ? set.sil[fi] : set.frames[fi];
  const jx = e.type === "mutant" && Math.random() < 0.12 ? pick([-1, 1]) : 0; // mutant shimmer
  ctx.drawImage(img, sx - set.w / 2 + jx, y - set.h / 2);
  if (e.type === "lander") {
    if (e.state === "abduct" && e.human) drawTractor(ctx, sx, y + set.h / 2, Math.round(e.human.y), g.time);
    else if (e.state === "descend" && Math.floor(g.time * 8) % 2) {
      ctx.fillStyle = "#ff2a2a";
      ctx.fillRect(sx - 1, y + set.h / 2, 2, 2);
    }
  }
}

function drawFlame(g, ctx, x0, y0, w, dir) {
  const s = g.ship;
  const L = s.thrustLevel;
  const rear = dir > 0 ? x0 : x0 + w;
  const at = (i) => (dir > 0 ? rear - (i + 1) * PX : rear + i * PX);
  if (L < 0.05) {
    if (Math.random() < 0.6) {
      ctx.fillStyle = Math.random() < 0.5 ? "#ff8010" : "#c01818";
      ctx.fillRect(at(0), y0 + 5 * PX, PX, PX);
    }
    return;
  }
  // a layered plume: white-hot core, yellow/orange body, red ragged tips
  const maxLen = 4 + 15 * L;
  const rows = [
    [5, 1, 0.3],
    [4, 0.72, 0.12],
    [6, 0.68, 0.12],
  ];
  if (L > 0.45) rows.push([3, 0.36, 0], [7, 0.32, 0]);
  for (const [ry, rl, core] of rows) {
    const n = Math.max(2, Math.round(maxLen * rl * rnd(0.72, 1)));
    for (let i = 0; i < n; i++) {
      const t = i / maxLen;
      if (i > n * 0.6 && Math.random() < 0.3) continue;
      ctx.fillStyle = t < core ? "#ffffff" : t < 0.3 ? "#fff060" : t < 0.48 ? "#ffc020" : t < 0.66 ? "#ff8010" : t < 0.84 ? "#ff4010" : "#c01818";
      ctx.fillRect(at(i), y0 + ry * PX, PX, PX);
    }
  }
  // detached flicker puffs just past the tip
  if (L > 0.5 && Math.random() < 0.7) {
    ctx.fillStyle = Math.random() < 0.5 ? "#ff4010" : "#ffc020";
    const i = Math.round(maxLen + rnd(1, 4));
    ctx.fillRect(at(i), y0 + rndi(4, 6) * PX, PX, PX);
  }
}

function drawShip(g, ctx, R) {
  const s = g.ship,
    set = R.ship;
  if (g.mode === "title" || g.mode === "gameover" || !s.visible) return;
  const sx = Math.round(wdelta(g.camX, s.x)),
    sy = Math.round(s.y);
  const flip = s.dir < 0;
  const x0 = sx - set.w / 2,
    y0 = sy - set.h / 2;
  if (s.hyper) {
    const t = s.hyperT;
    if (t < 0.42) {
      // stretch into a streak and collapse
      const k = t / 0.42;
      const sw = set.w * (1 + k * 5),
        sh = Math.max(2, Math.round(set.h * (1 - k * 0.85)));
      const img = k > 0.35 ? (flip ? set.silL[0] : set.sil[0]) : flip ? set.framesL[0] : set.frames[0];
      ctx.drawImage(img, Math.round(sx - sw / 2 + s.dir * k * 50), Math.round(sy - sh / 2), Math.round(sw), sh);
    } else if (t > 0.5) {
      drawMaterialize(ctx, flip ? set.pixL[0] : set.pix[0], sx, sy, set.w, set.h, clamp(1 - (t - 0.5) / 0.42, 0, 1), 7.3, g.time);
    }
    return;
  }
  if (g.mode === "dying") {
    if (g.deathStage === 0) {
      const f = Math.floor(g.modeT * 20) % 3;
      const arr = f === 0 ? (flip ? set.silL : set.sil) : f === 1 ? (flip ? set.redL : set.red) : flip ? set.framesL : set.frames;
      ctx.drawImage(arr[0], x0 + rndi(-1, 1), y0);
    }
    return;
  }
  if (g.settings.trails && Math.abs(s.vx) > 260 && s.hist.length > 1) {
    const a = Math.min(1, (Math.abs(s.vx) - 260) / 300);
    for (let i = s.hist.length - 1; i >= 1; i--) {
      const hp = s.hist[i];
      ctx.globalAlpha = 0.35 * a * (1 - i / s.hist.length);
      ctx.drawImage(hp.dir < 0 ? set.trailL : set.trail, Math.round(wdelta(g.camX, hp.x)) - set.w / 2, Math.round(hp.y) - set.h / 2);
    }
    ctx.globalAlpha = 1;
  }
  if (s.carrying) {
    ctx.fillStyle = Math.floor(g.time * 10) % 2 ? "#38f0ff" : "#ffffff";
    ctx.fillRect(sx - 1, y0 + set.h, 2, 4);
  }
  drawFlame(g, ctx, x0, y0, set.w, s.dir);
  const sil = s.invul > 0 && Math.floor(g.time * 12) % 3 === 0;
  ctx.drawImage((sil ? (flip ? set.silL : set.sil) : flip ? set.framesL : set.frames)[0], x0, y0);
  if (s.invul > 0) {
    // shield sparkle orbiting the ship while invulnerable
    ctx.fillStyle = Math.floor(g.time * 20) % 2 ? "#38f0ff" : "#ffffff";
    for (let i = 0; i < 6; i++) {
      const a = g.time * 5 + (i * Math.PI) / 3;
      ctx.fillRect(Math.round((sx + Math.cos(a) * 28) / PX) * PX, Math.round((sy + Math.sin(a) * 12) / PX) * PX, PX, PX);
    }
  }
}

function drawLasers(g, ctx) {
  const lit = g.settings.lighting;
  const tf = Math.floor(g.time * 24);
  const SEG = 8;
  for (const L of g.lasers) {
    const ox = wdelta(g.camX, L.x);
    const y = Math.round(L.y);
    const span = L.len - L.tail;
    if (span <= 0) continue;
    for (let d = L.tail; d < L.len; d += SEG) {
      const segLen = Math.min(SEG, L.len - d);
      const xa = ox + L.dir * d,
        xb = ox + L.dir * (d + segLen);
      const x = Math.round(Math.min(xa, xb)),
        w = Math.max(1, Math.round(Math.abs(xb - xa)));
      if (x > W || x + w < 0) continue;
      const idx = Math.floor(d / SEG);
      const tt = (d - L.tail) / span; // 0 at the tail → 1 at the head
      if (tt < 0.4 && hash(idx * 3.7 + tf) > tt / 0.4 + 0.15) continue; // tail breaks into dashes
      const ci = (idx + tf) % LASER_COLS.length;
      ctx.fillStyle = LASER_COLS[ci];
      ctx.fillRect(x, y, w, 2);
      if (lit) {
        ctx.fillStyle = LASER_DIM[ci];
        ctx.fillRect(x, y - 1, w, 1);
        ctx.fillRect(x, y + 2, w, 1);
      }
    }
    if (!L.dead) {
      const hx = Math.round(ox + L.dir * L.len);
      const hx0 = L.dir > 0 ? hx - 12 : hx;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(hx0, y, 12, 2);
      ctx.fillRect(hx - 1, y - 2, 2, 6);
      if (lit) {
        ctx.fillStyle = "#9090b0";
        ctx.fillRect(hx0, y - 1, 12, 1);
        ctx.fillRect(hx0, y + 2, 12, 1);
      }
    }
  }
}

function drawBolt(ctx, g, e, sx, sy) {
  const tx = Math.round(wdelta(g.camX, e.tx)),
    ty = Math.round(e.ty);
  const seg = 9;
  const tf = Math.floor(g.time * 30);
  const dx = tx - sx,
    dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len,
    ny = dx / len;
  let px = sx,
    py = sy;
  ctx.fillStyle = tf % 2 ? "#ffffff" : "#38f0ff";
  for (let i = 1; i <= seg; i++) {
    const k = i / seg;
    const j = i === seg ? 0 : (hash(e.seed + i * 5.1 + tf) - 0.5) * 26;
    const qx = sx + dx * k + nx * j,
      qy = sy + dy * k + ny * j;
    pxLine(ctx, px, py, qx, qy, PX);
    if (i === 4 && hash(e.seed + tf) > 0.5) pxLine(ctx, qx, qy, qx + nx * 14 + dx * 0.05, qy + ny * 14 + dy * 0.05, PX);
    px = qx;
    py = qy;
  }
}

function drawFx(g, ctx, R) {
  const fr = Math.floor(g.time * 60);
  for (const e of g.fx) {
    const sx = Math.round(wdelta(g.camX, e.x)),
      y = Math.round(e.y);
    const k = e.t / e.life;
    if (e.type === "flash") {
      if (sx < -60 || sx > W + 60) continue;
      const L = Math.round((e.size * (1 - k)) / PX) * PX;
      if (L <= 0) continue;
      ctx.fillStyle = k < 0.4 ? "#ffffff" : e.col === "#ffffff" ? "#ffe838" : e.col;
      ctx.fillRect(sx - L, y - 1, L * 2, 2);
      ctx.fillRect(sx - 1, y - L, 2, L * 2);
      const d = Math.round((L * 0.6) / PX) * PX;
      for (let i = PX; i <= d; i += PX) {
        ctx.fillRect(sx + i - 1, y + i - 1, 2, 2);
        ctx.fillRect(sx - i - 1, y + i - 1, 2, 2);
        ctx.fillRect(sx + i - 1, y - i - 1, 2, 2);
        ctx.fillRect(sx - i - 1, y - i - 1, 2, 2);
      }
      const c = Math.round((L * 0.3) / PX) * PX;
      if (c > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx - c, y - c, c * 2, c * 2);
      }
    } else if (e.type === "ring") {
      const r = e.r;
      if (r < 1 || sx + r < 0 || sx - r > W) continue;
      const n = clamp(Math.floor(r * 0.7), 10, 240);
      for (let i = 0; i < n; i++) {
        if (k > 0.5 && (i + fr) % 3 === 0) continue;
        if (k > 0.78 && (i + fr) % 2 === 0) continue;
        const a = (i / n) * 6.2832;
        ctx.fillStyle = i % 2 ? e.c1 : e.c2;
        ctx.fillRect(Math.round((sx + Math.cos(a) * r) / PX) * PX, Math.round((y + Math.sin(a) * r * e.squash) / PX) * PX, PX, PX);
      }
    } else if (e.type === "bolt") {
      drawBolt(ctx, g, e, sx, y);
    } else if (e.type === "ghost") {
      const set = R.ship;
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.drawImage(e.dir < 0 ? set.silL[0] : set.sil[0], sx - set.w / 2, y - set.h / 2);
      ctx.globalAlpha = 1;
    }
  }
}

function drawParticles(g, ctx) {
  const fr = Math.floor(g.time * 60);
  const arr = g.particles;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    const sx = wdelta(g.camX, p.x);
    if (sx < -12 || sx > W + 12) continue;
    let col;
    if (typeof p.c === "string") {
      if (p.life < 0.3 && (i + fr) & 1) continue; // arcade-style flicker-out
      col = p.c;
    } else col = p.c[Math.min(p.c.length - 1, Math.floor((1 - p.life / p.max) * p.c.length))];
    ctx.fillStyle = col;
    const x = Math.round(sx),
      y = Math.round(p.y);
    if (p.kind === K_STREAK) {
      const sp = Math.hypot(p.vx, p.vy);
      const len = Math.min(10, Math.round(sp * 0.02));
      if (len > 1) {
        const nx = p.vx / sp,
          ny = p.vy / sp;
        for (let j = 0; j < len; j++) ctx.fillRect(Math.round(sx - nx * j), Math.round(p.y - ny * j), p.s, p.s);
      } else ctx.fillRect(x, y, p.s, p.s);
    } else if (p.kind === K_SPARK) {
      if ((i + fr) % 3 !== 0) ctx.fillRect(x, y, p.s, p.s);
    } else ctx.fillRect(x, y, p.s, p.s);
  }
}

function drawScreenFlash(g, ctx, R) {
  const m = g.settings.shake ? 1 : 0.3;
  const top = HUD_H,
    h = H - HUD_H;
  if (g.flash > 0) {
    ctx.globalAlpha = clamp(g.flash, 0, 0.75) * m;
    ctx.fillStyle = g.flashColor;
    ctx.fillRect(0, top, W, h);
  }
  if (g.bombFX) {
    const t = g.bombFX.t;
    // strobe: white → cyan dither → magenta dither → fading white
    if (t < 0.05) {
      ctx.globalAlpha = 0.9 * m;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, top, W, h);
    } else if (t < 0.1) {
      ctx.globalAlpha = 0.8 * m;
      ctx.fillStyle = R.dither.cyan;
      ctx.fillRect(0, top, W, h);
    } else if (t < 0.15) {
      ctx.globalAlpha = 0.7 * m;
      ctx.fillStyle = R.dither.magenta;
      ctx.fillRect(0, top, W, h);
    } else if (t < 0.6) {
      ctx.globalAlpha = 0.25 * (1 - (t - 0.15) / 0.45) * m;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, top, W, h);
    }
  }
  if (g.mode === "dying" && g.deathStage === 0 && Math.floor(g.modeT * 12) % 2 === 0) {
    ctx.globalAlpha = 0.09 * m;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, top, W, h);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// HUD & scanner
// ---------------------------------------------------------------------------
const SCAN_COL = { lander: "#40ff50", mutant: "#ff3cff", bomber: "#7c90ff", pod: "#a048ff", swarmer: "#ff8c18", baiter: "#b8ff58" };

function drawHUD(g, ctx, R) {
  const s = g.ship;
  const fr = Math.floor(g.time * 60);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, HUD_H);
  const SW = Math.round(Math.min(330, W * 0.46) / 2) * 2;
  const SX = Math.round((W - SW) / 4) * 2;
  const SY = 4,
    SH = HUD_H - 3 - SY;
  // arcade frame: a blue rule under the HUD joined to the scanner box
  ctx.fillStyle = "#2840d0";
  ctx.fillRect(0, HUD_H - 3, W, 2);
  ctx.fillRect(SX - 2, SY - 2, SW + 4, 2);
  ctx.fillRect(SX - 2, SY - 2, 2, SH + 2);
  ctx.fillRect(SX + SW, SY - 2, 2, SH + 2);

  // left: score, ships, smart bombs
  drawText(ctx, String(g.score).padStart(7, "0"), 8, 6, 2, "#ffe838", "left", "#803010");
  for (let i = 0; i < Math.min(g.lives, 5); i++) ctx.drawImage(R.shipIcon, 8 + i * 28, 26);
  if (g.lives > 5) drawText(ctx, "+" + (g.lives - 5), 8 + 5 * 28, 27, 1, "#ffffff");
  for (let i = 0; i < Math.min(g.bombs, 9); i++) ctx.drawImage(R.bombIcon, 8 + i * 11, 41);
  if (g.bombs > 9) drawText(ctx, "+" + (g.bombs - 9), 8 + 9 * 11, 41, 1, "#ffffff");

  // right: hi-score, wave, humanoids
  const rx = W - 8;
  drawText(ctx, "HI " + String(g.hiScore).padStart(7, "0"), rx, 6, 1, "#ffffff", "right");
  drawText(ctx, "WAVE " + g.wave, rx, 19, 1, "#40ff50", "right");
  const alive = g.humans.filter((h) => !h.dead).length;
  drawText(ctx, String(alive), rx, 33, 1, "#38f0ff", "right");
  ctx.drawImage(R.humanIcon, rx - 16, 32);
  if (g.planetDestroyed) drawText(ctx, "PLANET LOST", rx, 46, 1, fr % 40 < 20 ? "#ff2a2a" : "#801010", "right");

  // scanner — centred on the player, whole planet visible
  ctx.fillStyle = "#00000e";
  ctx.fillRect(SX, SY, SW, SH);
  const playing = g.mode !== "title" && g.mode !== "gameover";
  const center = playing ? s.x : wrap(g.camX + W / 2);
  const mx = (x) => SX + SW / 2 + (wdelta(center, x) / WORLD_W) * SW;
  const my = (y) => SY + 2 + ((y - PLAY_TOP) / (GROUND_Y - PLAY_TOP)) * (SH - 5);
  if (!g.planetDestroyed) {
    ctx.fillStyle = "#b05416";
    let prev = null;
    for (let i = 0; i < SW; i++) {
      const wx = center - WORLD_W / 2 + (i / SW) * WORLD_W;
      const ty = Math.round(my(terrainAt(g.terrain, wx)));
      const a = prev === null ? ty : Math.min(prev, ty),
        b = prev === null ? ty : Math.max(prev, ty);
      ctx.fillRect(SX + i, a, 1, b - a + 1);
      prev = ty;
    }
  }
  const camL = Math.round(mx(g.camX)),
    camW = Math.round((W / WORLD_W) * SW);
  ctx.fillStyle = "#d0d0ff";
  ctx.fillRect(camL, SY, 4, 1);
  ctx.fillRect(camL, SY, 1, SH);
  ctx.fillRect(camL, SY + SH - 1, 4, 1);
  ctx.fillRect(camL + camW - 4, SY, 4, 1);
  ctx.fillRect(camL + camW - 1, SY, 1, SH);
  ctx.fillRect(camL + camW - 4, SY + SH - 1, 4, 1);
  for (const h of g.humans) {
    if (h.dead) continue;
    ctx.fillStyle = h.state === "falling" || h.state === "carried" ? (fr % 12 < 6 ? "#ffffff" : "#ff3cff") : "#c060ff";
    ctx.fillRect(Math.round(mx(h.x)), Math.round(my(h.y)), 1, 2);
  }
  for (const e of g.enemies) {
    if (e.dead || e.spawnT > 0.5) continue;
    ctx.fillStyle = e.type === "lander" && e.state === "abduct" && fr % 10 < 5 ? "#ff2a2a" : SCAN_COL[e.type];
    ctx.fillRect(Math.round(mx(e.x)) - 1, Math.round(my(e.y)) - 1, 2, 2);
  }
  ctx.fillStyle = "#4060ff";
  for (const m of g.mines) ctx.fillRect(Math.round(mx(m.x)), Math.round(my(m.y)), 1, 1);
  if (playing && s.visible) {
    ctx.fillStyle = fr % 16 < 8 ? "#ffffff" : "#ffe838";
    ctx.fillRect(Math.round(mx(s.x)) - 1, Math.round(my(s.y)) - 1, 3, 2);
  }
}

// ---------------------------------------------------------------------------
// Overlays: wave banners, tally, title, game over, toasts
// ---------------------------------------------------------------------------
const GRAD_GOLD = ["#fffbd0", "#fff060", "#ffd030", "#ffb020", "#ff8a10", "#ff6010", "#e03a10"];
const GRAD_RED = ["#ffd0d0", "#ff8080", "#ff4040", "#ff2020", "#d01010", "#a00808", "#700404"];

function shimmerText(ctx, text, x, y, size, grad, t, align = "center") {
  const pos = mod(t * 16, textW(text, 1) + 30) - 15;
  drawTextFn(ctx, text, x, y, size, (i, r, c) => (Math.abs(i * 6 + c - r * 0.7 - pos) < 1.6 ? "#ffffff" : grad[r]), align);
}

function drawOverlays(g, ctx, R) {
  const fr = Math.floor(g.time * 60);
  if (g.msg && !g.tally && !g.paused) {
    const shown = Math.floor((g.msg.max - g.msg.t) * 36);
    let used = 0;
    g.msg.lines.forEach((ln, li) => {
      const part = ln.slice(0, Math.max(0, shown - used));
      used += ln.length;
      const y = H / 2 - g.msg.lines.length * 16 + li * 30;
      if (!part.length) return;
      if (li === 0) {
        const x0 = W / 2 - textW(ln, 3) / 2;
        shimmerText(ctx, part, x0, y, 3, GRAD_GOLD, g.time, "left");
      } else drawText(ctx, part, W / 2 - textW(ln, 2) / 2, y + 4, 2, "#ffffff", "left", "#000000");
    });
  }
  if (g.tally) drawTally(g, ctx, R);
  if (g.paused && g.mode === "playing") {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, HUD_H, W, H - HUD_H);
    ctx.globalAlpha = 1;
    shimmerText(ctx, "PAUSED", W / 2, H / 2 - 14, 4, GRAD_GOLD, g.time);
    drawText(ctx, "PRESS P TO RESUME", W / 2, H / 2 + 26, 1, "#9cb8ff", "center");
  }
  if (g.mode === "title") drawTitle(g, ctx, R);
  if (g.mode === "gameover") drawGameOver(g, ctx);
  if (g.toast) {
    const tw = textW(g.toast.text, 1) + 16;
    const tx = Math.round(W / 2 - tw / 2),
      ty = H - 30;
    ctx.fillStyle = "#000000";
    ctx.fillRect(tx, ty, tw, 17);
    ctx.fillStyle = "#2840d0";
    ctx.fillRect(tx, ty, tw, 1);
    ctx.fillRect(tx, ty + 16, tw, 1);
    drawText(ctx, g.toast.text, W / 2, ty + 5, 1, fr % 20 < 10 ? "#ffffff" : "#38f0ff", "center");
  }
}

function drawTally(g, ctx, R) {
  const T = g.tally;
  const cy = 130;
  shimmerText(ctx, `ATTACK WAVE ${g.wave}`, W / 2, cy, 3, GRAD_GOLD, g.time);
  drawText(ctx, "COMPLETED", W / 2, cy + 30, 2, "#ffffff", "center", "#000000");
  drawText(ctx, `BONUS X ${T.per}`, W / 2, cy + 62, 1, "#9cb8ff", "center");
  const n = T.alive;
  const sp = 16;
  const x0 = W / 2 - ((n - 1) * sp) / 2;
  for (let i = 0; i < T.shown; i++) {
    const f = (Math.floor(g.time * 6) + i) % 2 ? 3 : 4;
    ctx.drawImage(R.human.frames[f], Math.round(x0 + i * sp - R.human.w / 2), cy + 80);
  }
  if (n === 0) drawText(ctx, "NO HUMANOIDS SURVIVED", W / 2, cy + 86, 1, "#ff2a2a", "center");
  drawText(ctx, String(T.shown * T.per), W / 2, cy + 110, 2, "#40ff50", "center", "#000000");
}

function drawTitle(g, ctx, R) {
  const t = g.attractT;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, HUD_H, W, H - HUD_H);
  ctx.globalAlpha = 1;
  const ly = 84;
  for (let d = 5; d >= 1; d--) drawText(ctx, "DEFENDER", W / 2 + d, ly + d, 7, d > 3 ? "#3a0606" : d > 1 ? "#7a1010" : "#c02010", "center");
  shimmerText(ctx, "DEFENDER", W / 2, ly, 7, GRAD_GOLD, t);
  drawText(ctx, "- PROTECT THE HUMANOIDS -", W / 2, ly + 60, 1, "#38f0ff", "center");

  const roster = [
    ["lander", "LANDER", 150],
    ["mutant", "MUTANT", 150],
    ["baiter", "BAITER", 200],
    ["bomber", "BOMBER", 250],
    ["pod", "POD", 1000],
    ["swarmer", "SWARMER", 150],
  ];
  roster.forEach(([k, name, pts], i) => {
    const col = i % 3,
      row = Math.floor(i / 3);
    const x = Math.round(W / 2 + (col - 1) * 176 - 46),
      y = 176 + row * 30;
    const set = R[k];
    const fi = mod(Math.floor(t * ANIM_FPS[k]), set.frames.length);
    ctx.drawImage(set.frames[fi], x - set.w / 2, y - set.h / 2);
    drawText(ctx, name, x + 18, y - 7, 1, "#ffffff");
    drawText(ctx, String(pts), x + 18, y + 2, 1, "#ffe838");
  });
  const lines = [
    ["ARROWS  THRUST / REVERSE / CLIMB / DIVE", "#9cb8ff"],
    ["SPACE LASER   B SMART BOMB   H HYPERSPACE", "#9cb8ff"],
    ["Z REVERSE   SHIFT THRUST   P PAUSE   O DISPLAY", "#9cb8ff"],
  ];
  lines.forEach(([s, c], i) => drawText(ctx, s, W / 2, 240 + i * 13, 1, c, "center"));
  drawText(ctx, "CATCH FALLING HUMANOIDS AND CARRY THEM HOME", W / 2, 290, 1, "#40ff50", "center");
  if (Math.floor(t * 2.5) % 2 === 0) drawText(ctx, "PRESS ENTER TO START", W / 2, 318, 2, "#ffffff", "center", "#2840d0");
  if (g.hiScore > 0) drawText(ctx, "HIGH SCORE " + g.hiScore, W / 2, 350, 1, "#ffe838", "center");
}

function drawGameOver(g, ctx) {
  const t = g.attractT;
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, HUD_H, W, H - HUD_H);
  ctx.globalAlpha = 1;
  for (let d = 4; d >= 1; d--) drawText(ctx, "GAME OVER", W / 2 + d, 140 + d, 5, d > 2 ? "#300404" : "#700808", "center");
  shimmerText(ctx, "GAME OVER", W / 2, 140, 5, GRAD_RED, t);
  drawText(ctx, "SCORE " + g.score, W / 2, 200, 2, "#ffe838", "center", "#803010");
  drawText(ctx, "REACHED WAVE " + g.wave, W / 2, 226, 1, "#ffffff", "center");
  if (g.score >= g.hiScore && g.score > 0) drawText(ctx, "NEW HIGH SCORE!", W / 2, 246, 1, Math.floor(t * 6) % 2 ? "#40ff50" : "#ffffff", "center");
  if (t > 1.2 && Math.floor(t * 2.5) % 2 === 0) drawText(ctx, "PRESS ENTER TO PLAY AGAIN", W / 2, 296, 2, "#ffffff", "center", "#2840d0");
}

// ---------------------------------------------------------------------------
// Presentation: nearest-neighbour upscale, optional CRT glow + scanlines
// ---------------------------------------------------------------------------
function computeView(cw, ch, integer) {
  let scale, w;
  if (integer && ch >= H / 2) {
    // sprite pixels are 2 logical px, so half-step scales (1.5x, 2.5x…) still give
    // every sprite pixel an exact whole number of device pixels
    scale = Math.max(0.5, Math.floor((ch / H) * 2) / 2);
    while (scale > 0.5 && W_MIN * scale > cw) scale -= 0.5;
    w = clamp(Math.floor(cw / scale / 2) * 2, W_MIN, W_MAX);
  } else {
    w = clamp(Math.round((H * cw) / ch / 2) * 2, W_MIN, W_MAX);
    scale = Math.min(cw / w, ch / H);
  }
  const gw = Math.round(w * scale),
    gh = Math.round(H * scale);
  return { w, scale, gw, gh, gx: Math.floor((cw - gw) / 2), gy: Math.floor((ch - gh) / 2), cw, ch };
}

function buildCrt(gw, gh, scale) {
  const c = makeCanvas(gw, gh);
  const x = c.getContext("2d");
  // one scanline per sprite pixel row, dark band on its lower part
  const pitch = scale * PX;
  const alpha = pitch >= 4 ? 0.45 : pitch >= 3 ? 0.35 : 0.22;
  x.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let row = 0; row < H / PX; row++) {
    const y0 = Math.round(row * pitch + pitch * 0.62),
      y1 = Math.round((row + 1) * pitch);
    if (y1 > y0) x.fillRect(0, y0, gw, y1 - y0);
  }
  // faint aperture grille on large displays
  if (scale >= 3) {
    const cols = ["rgba(255,0,0,0.035)", "rgba(0,255,0,0.035)", "rgba(0,0,255,0.035)"];
    for (let i = 0; i < gw; i++) {
      x.fillStyle = cols[i % 3];
      x.fillRect(i, 0, 1, gh);
    }
  }
  const gr = x.createRadialGradient(gw / 2, gh / 2, Math.min(gw, gh) * 0.38, gw / 2, gh / 2, Math.max(gw, gh) * 0.72);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.5)");
  x.fillStyle = gr;
  x.fillRect(0, 0, gw, gh);
  return c;
}

function present(g, dctx, buf, R, V) {
  dctx.globalCompositeOperation = "source-over";
  dctx.globalAlpha = 1;
  dctx.imageSmoothingEnabled = false;
  dctx.fillStyle = "#000";
  dctx.fillRect(0, 0, V.cw, V.ch);
  dctx.drawImage(buf, 0, 0, W, H, V.gx, V.gy, V.gw, V.gh);
  if (!g.settings.crt) return;
  // phosphor glow: blurred copies added on top — the sharp image stays intact underneath
  const a = R.bloomA.getContext("2d"),
    b = R.bloomB.getContext("2d");
  a.imageSmoothingEnabled = true;
  b.imageSmoothingEnabled = true;
  a.clearRect(0, 0, R.bloomA.width, R.bloomA.height);
  a.drawImage(buf, 0, 0, R.bloomA.width, R.bloomA.height);
  b.clearRect(0, 0, R.bloomB.width, R.bloomB.height);
  b.drawImage(R.bloomA, 0, 0, R.bloomB.width, R.bloomB.height);
  dctx.imageSmoothingEnabled = true;
  dctx.globalCompositeOperation = "lighter";
  dctx.globalAlpha = 0.55;
  dctx.drawImage(R.bloomB, V.gx, V.gy, V.gw, V.gh);
  dctx.globalAlpha = 0.3;
  dctx.drawImage(R.bloomA, V.gx, V.gy, V.gw, V.gh);
  dctx.globalAlpha = 1;
  dctx.globalCompositeOperation = "source-over";
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(R.crt, V.gx, V.gy);
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------
const KEY_MAP = { Space: "fire", KeyB: "bomb", ControlLeft: "bomb", ControlRight: "bomb", KeyH: "hyper", KeyZ: "reverse", Enter: "start", KeyP: "pause" };
const TOGGLE_KEYS = { KeyC: "crt", KeyV: "scenery", KeyL: "lighting", KeyT: "trails", KeyK: "shake", KeyQ: "fxHigh", KeyI: "integer", KeyM: "sound" };
const PREVENT = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Tab"]);
const TOGGLES = [
  ["crt", "CRT scanlines & glow", "C"],
  ["scenery", "Parallax scenery & terrain detail", "V"],
  ["lighting", "Dynamic lighting & laser glow", "L"],
  ["trails", "Motion trails", "T"],
  ["shake", "Screen shake & flashes", "K"],
  ["fxHigh", "High particle density", "Q"],
  ["integer", "Pixel-perfect scaling (uniform pixels)", "I"],
  ["sound", "Sound", "M"],
];
const SHORT = { crt: "CRT", scenery: "SCENERY", lighting: "LIGHTING", trails: "TRAILS", shake: "SHAKE + FLASH", fxHigh: "HIGH FX", integer: "INTEGER SCALE", sound: "SOUND" };

function buildResources() {
  const R = {
    ship: bakeSet(SPRITES.ship, "#3060ff"),
    lander: bakeSet(SPRITES.lander, "#108020"),
    mutant: bakeSet(SPRITES.mutant, "#a020a0"),
    bomber: bakeSet(SPRITES.bomber, "#2030a0"),
    pod: bakeSet(SPRITES.pod, "#6020a0"),
    swarmer: bakeSet(SPRITES.swarmer, "#a02010"),
    baiter: bakeSet(SPRITES.baiter, "#20a040"),
    mine: bakeSet(SPRITES.mine),
    human: bakeSet(SPRITES.human),
  };
  R.shipIcon = bakeRows(SPRITES.ship[0], false, null, 1);
  R.humanIcon = bakeRows(SPRITES.human[1], false, null, 1);
  R.bombIcon = bakeRows([".CC.", "CWWC", "CWWC", ".CC."], false, null, 2);
  const dither = (col) => {
    const c = makeCanvas(PX * 2, PX * 2);
    const x = c.getContext("2d");
    x.fillStyle = col;
    x.fillRect(0, 0, PX, PX);
    x.fillRect(PX, PX, PX, PX);
    return x.createPattern(c, "repeat");
  };
  R.dither = { cyan: dither("#38f0ff"), magenta: dither("#ff3cff") };
  return R;
}

function IconButton({ onClick, title, children }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      title={title}
      aria-label={title}
      className="flex items-center justify-center rounded"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 4, cursor: "pointer", background: "rgba(8,10,30,0.75)", border: "1px solid #2840d0", color: "#c8d4ff" }}
    >
      {children}
    </button>
  );
}

export default function DefenderGame() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const sfxRef = useRef(null);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const panelRef = useRef(false);
  const pausedByPanel = useRef(false);
  const viewDirty = useRef(true);
  const hideTimer = useRef(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [panel, setPanel] = useState(false);
  const [fs, setFs] = useState(false);
  const [idle, setIdle] = useState(false);
  const [inMenu, setInMenu] = useState(true);

  const toast = (text) => {
    if (gameRef.current) gameRef.current.toast = { text, t: 1.6 };
  };
  const setSetting = (key, value) => {
    const next = { ...settingsRef.current, [key]: value };
    settingsRef.current = next;
    setSettings(next);
    if (gameRef.current) applySettings(gameRef.current, next);
    if (key === "sound" && sfxRef.current) {
      sfxRef.current.init();
      sfxRef.current.setMuted(!value);
    }
    if (key === "integer") viewDirty.current = true;
    toast(`${SHORT[key]}: ${value ? "ON" : "OFF"}`);
  };
  const toggleSetting = (key) => setSetting(key, !settingsRef.current[key]);
  const toggleFullscreen = () => {
    const el = wrapRef.current;
    const d = document;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      } else {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) return toast("FULLSCREEN NOT SUPPORTED");
        const r = req.call(el);
        if (r && r.catch) r.catch(() => toast("FULLSCREEN BLOCKED BY BROWSER"));
      }
    } catch (err) {
      toast("FULLSCREEN BLOCKED BY BROWSER");
    }
  };
  const setPanelOpen = (open) => {
    panelRef.current = open;
    setPanel(open);
    const g = gameRef.current;
    if (!g) return;
    if (open && g.mode === "playing" && !g.paused) {
      g.paused = true;
      pausedByPanel.current = true;
    } else if (!open && pausedByPanel.current) {
      g.paused = false;
      pausedByPanel.current = false;
    }
  };
  const wake = () => {
    setIdle(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setIdle(true), 2500);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const dctx = canvas.getContext("2d");
    const sfx = new Sfx();
    sfxRef.current = sfx;
    sfx.muted = !settingsRef.current.sound;
    const g = createGame(sfx);
    gameRef.current = g;
    applySettings(g, settingsRef.current);
    const R = buildResources();
    const buf = makeCanvas(W, H);
    const bctx = buf.getContext("2d");
    let view = null;

    const resize = () => {
      const rect = wrapRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(1, Math.round(rect.width * dpr)),
        ch = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      view = computeView(cw, ch, settingsRef.current.integer);
      if (view.w !== W || buf.width !== view.w) {
        W = view.w;
        buf.width = W;
        buf.height = H;
      }
      R.bloomA = makeCanvas(W / 2, H / 2);
      R.bloomB = makeCanvas(W / 4, H / 4);
      R.crt = buildCrt(view.gw, view.gh, view.scale);
      viewDirty.current = false;
    };
    const ro = new ResizeObserver(() => {
      viewDirty.current = true;
    });
    ro.observe(wrapRef.current);
    resize();

    const onKeyDown = (e) => {
      const code = e.code;
      if (PREVENT.has(code)) e.preventDefault();
      sfx.init();
      sfx.resume();
      if (e.repeat) return;
      g.keys[code] = true;
      const act = KEY_MAP[code];
      if (act) g.pressed[act] = true;
      if (TOGGLE_KEYS[code]) toggleSetting(TOGGLE_KEYS[code]);
      if (code === "KeyF") toggleFullscreen();
      if (code === "KeyO" || (code === "Escape" && panelRef.current)) setPanelOpen(!panelRef.current);
    };
    const onKeyUp = (e) => {
      g.keys[e.code] = false;
    };
    const onBlur = () => {
      g.keys = {};
      sfx.thrust(false);
    };
    const onFs = () => {
      setFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
      viewDirty.current = true;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);

    let raf = 0;
    let last = performance.now();
    let lastMenu = true;
    const loop = (now) => {
      // rAF timestamps can precede the performance.now() we seeded with: clamp to [0, 50ms]
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      raf = requestAnimationFrame(loop);
      try {
        if (viewDirty.current) resize();
        // sub-step the simulation so fast objects never tunnel, at any refresh rate
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        for (let i = 0; i < steps; i++) update(g, dt / steps);
        render(g, bctx, R);
        present(g, dctx, buf, R, view);
      } catch (err) {
        console.error(err); // never let one bad frame kill the game loop
      }
      const menu = g.mode === "title" || g.mode === "gameover";
      if (menu !== lastMenu) {
        lastMenu = menu;
        setInMenu(menu);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      clearTimeout(hideTimer.current);
      sfx.thrust(false);
      if (sfx.ctx) sfx.ctx.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCanvasClick = () => {
    const g = gameRef.current,
      sfx = sfxRef.current;
    if (!g) return;
    sfx.init();
    sfx.resume();
    if (panelRef.current) return setPanelOpen(false);
    if (g.mode === "title" || g.mode === "gameover") g.pressed.start = true;
  };

  const showUi = inMenu || panel || !idle;
  const font = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between" };

  return (
    <div
      ref={wrapRef}
      className="select-none"
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", background: "#000", cursor: showUi ? "default" : "none" }}
      onMouseMove={wake}
    >
      <canvas ref={canvasRef} onClick={onCanvasClick} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }} />

      <div
        className="flex gap-2"
        style={{ position: "absolute", display: "flex", gap: 8, bottom: 10, right: 10, opacity: showUi ? 1 : 0, transition: "opacity 300ms", pointerEvents: showUi ? "auto" : "none" }}
      >
        <IconButton onClick={() => toggleSetting("sound")} title="Sound (M)">
          {settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </IconButton>
        <IconButton onClick={() => setPanelOpen(!panelRef.current)} title="Display settings (O)">
          <Settings size={18} />
        </IconButton>
        <IconButton onClick={toggleFullscreen} title="Fullscreen (F)">
          {fs ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </IconButton>
      </div>

      {panel && (
        <div
          className="rounded"
          style={{ ...font, position: "absolute", bottom: 56, right: 10, width: 300, maxHeight: "calc(100% - 70px)", overflowY: "auto", background: "rgba(4,6,20,0.94)", border: "1px solid #2840d0", color: "#c8d4ff", fontSize: 12, boxShadow: "0 0 24px rgba(40,64,208,0.45)" }}
        >
          <div style={{ ...row, padding: "10px 12px", borderBottom: "1px solid #1a2a80" }}>
            <span style={{ color: "#ffe838", letterSpacing: 2 }}>DISPLAY</span>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => setPanelOpen(false)} aria-label="Close" style={{ color: "#c8d4ff", background: "transparent", border: 0, cursor: "pointer", display: "flex" }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ padding: 6 }}>
            {TOGGLES.map(([key, label, k]) => (
              <button
                key={key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleSetting(key)}
                style={{ ...row, width: "100%", padding: "7px 8px", textAlign: "left", color: "#c8d4ff", background: "transparent", border: 0, cursor: "pointer", font: "inherit" }}
              >
                <span>
                  <span style={{ display: "inline-block", width: 18, color: "#6a7ad0" }}>{k}</span>
                  {label}
                </span>
                <span
                  style={{ minWidth: 38, textAlign: "center", padding: "1px 6px", borderRadius: 3, fontSize: 11, background: settings[key] ? "#1a7a2a" : "#3a1a1a", color: settings[key] ? "#b8ff58" : "#ff8080" }}
                >
                  {settings[key] ? "ON" : "OFF"}
                </span>
              </button>
            ))}
            <div style={{ ...row, padding: "7px 8px" }}>
              <span>
                <span style={{ display: "inline-block", width: 18, color: "#6a7ad0" }}>F</span>Fullscreen
              </span>
              <button onMouseDown={(e) => e.preventDefault()} onClick={toggleFullscreen} style={{ padding: "1px 8px", borderRadius: 3, fontSize: 11, background: "#1a2a80", color: "#fff", border: 0, cursor: "pointer", font: "inherit" }}>
                {fs ? "EXIT" : "ENTER"}
              </button>
            </div>
          </div>
          <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #1a2a80", color: "#8090c0", lineHeight: 1.7 }}>
            <div style={{ color: "#ffe838", letterSpacing: 2, marginBottom: 2 }}>CONTROLS</div>
            <div>← → thrust / reverse · ↑ ↓ climb / dive</div>
            <div>SPACE laser · B smart bomb · H hyperspace</div>
            <div>Z reverse only · SHIFT thrust · P pause</div>
            <div style={{ color: "#6a7ad0" }}>Gravity pulls you down — keep feathering ↑</div>
          </div>
        </div>
      )}
    </div>
  );
}