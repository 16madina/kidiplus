import { useEffect, useRef } from "react";
import {
  BAOBAB_FADE_S,
  BAOBAB_GROW_S,
  BAOBAB_PHASE,
  BAOBAB_SLEEP_S,
} from "@/lib/gift-baobab";
import {
  easeInCubic,
  easeOutCubic,
  lerp,
  range,
  smootherstep,
} from "@/lib/defi-plus";

type Leaf = {
  homeX: number;
  homeY: number;
  size: number;
  delay: number;
  fallDur: number;
  sway: number;
  spin: number;
  phase: number;
  stay: boolean;
  restX: number;
  gold: number;
};

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export function BaobabMotionCanvas({ clockStart }: { clockStart: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(clockStart);
  startRef.current = clockStart;
  const leavesRef = useRef<Leaf[] | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      leavesRef.current = null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      if (w < 8 || h < 8) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.max(0, (Date.now() - startRef.current) / 1000);
      if (!leavesRef.current) leavesRef.current = seedLeaves(w, h);
      ctx.clearRect(0, 0, w, h);
      drawScene(ctx, t, w, h, leavesRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-[2] h-full w-full" />;
}

type Layout = {
  cx: number;
  ground: number;
  trunkH: number;
  top: number;
  unit: number;
  belly: number;
};

/** Primary limbs — angles from vertical, like roots in the sky. */
const LIMBS = [
  { ang: -1.18, len: 0.3, thick: 0.095, kink: 0.42, fork: -0.7, forkLen: 0.5, puff: 0.12 },
  { ang: -0.58, len: 0.26, thick: 0.088, kink: -0.28, fork: 0.55, forkLen: 0.46, puff: 0.1 },
  { ang: 0.06, len: 0.22, thick: 0.08, kink: 0.2, fork: -0.45, forkLen: 0.44, puff: 0.09 },
  { ang: 0.62, len: 0.27, thick: 0.09, kink: 0.32, fork: 0.58, forkLen: 0.48, puff: 0.11 },
  { ang: 1.2, len: 0.31, thick: 0.098, kink: -0.38, fork: -0.62, forkLen: 0.52, puff: 0.125 },
];

function layout(w: number, h: number): Layout {
  const unit = Math.min(w, h);
  const ground = h * 0.8;
  const trunkH = h * 0.3;
  return {
    cx: w / 2,
    ground,
    trunkH,
    top: ground - trunkH,
    unit,
    belly: unit * 0.175,
  };
}

/** Classic bottle: wide feet, swollen belly, almost-flat crown. */
function trunkRadius(u: number, belly: number) {
  const t = Math.max(0, Math.min(1, u));
  const keys = [
    [0, 1.08],
    [0.12, 0.94],
    [0.4, 1.12],
    [0.78, 1.02],
    [1, 0.9],
  ] as const;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) {
      const s = smootherstep((t - a[0]) / (b[0] - a[0]));
      return belly * lerp(a[1], b[1], s);
    }
  }
  return belly * 0.78;
}

function limbTip(L: Layout, limb: (typeof LIMBS)[number], grow: number, fork = false) {
  const len = limb.len * L.unit * grow;
  const ang0 = limb.ang - Math.PI / 2;
  const mx = L.cx + Math.cos(ang0) * len * 0.55;
  const my = L.top + 6 + Math.sin(ang0) * len * 0.55;
  const ang1 = ang0 + limb.kink * 0.55;
  const tx = mx + Math.cos(ang1) * len * 0.45;
  const ty = my + Math.sin(ang1) * len * 0.45;
  if (!fork) return { x: tx, y: ty };
  const fa = ang1 + limb.fork;
  return {
    x: tx + Math.cos(fa) * len * limb.forkLen,
    y: ty + Math.sin(fa) * len * limb.forkLen,
  };
}

function clumpCenters(L: Layout): { x: number; y: number; r: number }[] {
  return LIMBS.flatMap((limb) => [
    { ...limbTip(L, limb, 1, false), r: limb.puff * L.unit },
    { ...limbTip(L, limb, 1, true), r: limb.puff * L.unit * 0.72 },
  ]);
}

function seedLeaves(w: number, h: number): Leaf[] {
  const L = layout(w, h);
  const clumps = clumpCenters(L);
  const list: Leaf[] = [];
  for (let i = 0; i < 46; i++) {
    const c = clumps[i % clumps.length];
    const a = hash(i + 2.2) * Math.PI * 2;
    const d = hash(i + 5.1) * c.r * 0.85;
    list.push({
      homeX: c.x + Math.cos(a) * d,
      homeY: c.y + Math.sin(a) * d * 0.7,
      size: 8 + hash(i + 8) * 6,
      delay: hash(i + 11) * 1.4,
      fallDur: 1.7 + hash(i + 14) * 1.15,
      sway: 12 + hash(i + 17) * 20,
      spin: (hash(i + 19) - 0.5) * 2.2,
      phase: hash(i + 23) * Math.PI * 2,
      stay: hash(i + 27) < 0.32,
      restX: (hash(i + 30) - 0.5) * w * 0.4,
      gold: 0.35 + hash(i + 33) * 0.65,
    });
  }
  return list;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  t: number,
  w: number,
  h: number,
  leaves: Leaf[],
) {
  const L = layout(w, h);
  const sprout = smootherstep(range(t, 0.02, BAOBAB_PHASE.sproutEnd));
  const trunk = smootherstep(range(t, 0.08, BAOBAB_PHASE.trunkEnd));
  const branch = smootherstep(range(t, 1.05, BAOBAB_PHASE.branchEnd));
  const canopy = smootherstep(range(t, 1.9, BAOBAB_PHASE.growEnd));
  const sleep = smootherstep(range(t, BAOBAB_GROW_S, BAOBAB_GROW_S + 1.4));
  const fade =
    1 -
    smootherstep(
      range(t, BAOBAB_GROW_S + BAOBAB_SLEEP_S, BAOBAB_GROW_S + BAOBAB_SLEEP_S + BAOBAB_FADE_S),
    );

  ctx.save();
  ctx.globalAlpha = fade;
  drawDusk(ctx, w, h, sleep);
  drawMoon(ctx, L, t, sleep);
  drawGround(ctx, L, w, sprout, sleep);
  drawTrunk(ctx, L, trunk);
  if (branch > 0.02) drawLimbs(ctx, L, branch, sleep);
  if (canopy > 0.02) drawCanopy(ctx, L, canopy, sleep);
  drawLeaves(ctx, L, t, leaves, canopy, sleep);
  ctx.restore();
}

function drawDusk(ctx: CanvasRenderingContext2D, w: number, h: number, sleep: number) {
  if (sleep < 0.02) return;
  const g = ctx.createRadialGradient(w / 2, h * 0.32, 30, w / 2, h * 0.45, h * 0.72);
  g.addColorStop(0, `rgba(12, 22, 48, ${0.1 * sleep})`);
  g.addColorStop(1, `rgba(4, 8, 18, ${0.28 * sleep})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawMoon(ctx: CanvasRenderingContext2D, L: Layout, t: number, sleep: number) {
  if (sleep < 0.03) return;
  const rise = easeOutCubic(sleep);
  const x = L.cx + L.unit * 0.28;
  const y = lerp(L.top + 24, L.top - L.unit * 0.1, rise);
  const r = L.unit * 0.048;
  ctx.save();
  ctx.globalAlpha = sleep * 0.95;
  ctx.shadowColor = "rgba(255, 236, 190, 0.7)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#fff3c4";
  ctx.beginPath();
  ctx.arc(x, y, r, 0.55, Math.PI * 2 - 0.15);
  ctx.arc(x + r * 0.42, y - r * 0.08, r * 0.78, Math.PI * 2 - 0.2, 0.7, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < 8; i++) {
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.1 + i * 1.8));
    ctx.save();
    ctx.globalAlpha = sleep * tw * 0.65;
    ctx.fillStyle = "#ffe7a8";
    ctx.beginPath();
    ctx.arc(
      L.cx + (hash(i + 1.1) - 0.5) * L.unit * 0.72,
      L.top - 20 - hash(i + 2.2) * 70,
      0.7 + hash(i + 3.3) * 1.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, L: Layout, w: number, sprout: number, sleep: number) {
  const a = lerp(0.42, 0.14, sleep) * sprout;
  const g = ctx.createRadialGradient(L.cx, L.ground, 6, L.cx, L.ground, w * 0.38);
  g.addColorStop(0, `rgba(210, 140, 50, ${a})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, L.ground - 36, w, 80);
}

function buildTrunkPath(L: Layout, grow: number) {
  const steps = 48;
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * grow;
    const y = L.ground - L.trunkH * u;
    const r = trunkRadius(u, L.belly);
    left.push({ x: L.cx - r, y });
    right.push({ x: L.cx + r, y });
  }
  return { left, right };
}

function traceSmooth(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2;
    const yc = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawTrunk(ctx: CanvasRenderingContext2D, L: Layout, grow: number) {
  if (grow < 0.02) return;
  const { left, right } = buildTrunkPath(L, grow);
  const outline = [...left, ...right.slice().reverse()];

  ctx.save();
  ctx.beginPath();
  traceSmooth(ctx, outline);
  ctx.closePath();

  const body = ctx.createLinearGradient(L.cx - L.belly, 0, L.cx + L.belly, 0);
  body.addColorStop(0, "#c48a40");
  body.addColorStop(0.22, "#9a5c28");
  body.addColorStop(0.55, "#6e3e18");
  body.addColorStop(1, "#3d220e");
  ctx.fillStyle = body;
  ctx.shadowColor = "rgba(210, 150, 50, 0.28)";
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();

  ctx.strokeStyle = "rgba(32, 16, 6, 0.16)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  for (let k = 0; k < 4; k++) {
    const ox = L.cx + (k - 1.5) * L.belly * 0.32;
    ctx.beginPath();
    ctx.moveTo(ox, L.ground - 4);
    for (let i = 1; i <= 24; i++) {
      const u = (i / 24) * grow;
      ctx.lineTo(ox + Math.sin(u * 5.2 + k * 1.7) * 2.4, L.ground - L.trunkH * u);
    }
    ctx.stroke();
  }

  if (grow > 0.92) {
    ctx.fillStyle = "#7a4a20";
    ctx.beginPath();
    ctx.ellipse(L.cx, L.top + 6, L.belly * 0.8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function fillTaper(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
  ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x0, y0, w0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x1, y1, w1, 0, Math.PI * 2);
  ctx.fill();
}

function drawLimbs(ctx: CanvasRenderingContext2D, L: Layout, grow: number, sleep: number) {
  ctx.fillStyle = "#7a4a20";
  for (let i = 0; i < LIMBS.length; i++) {
    const limb = LIMBS[i];
    const g = smootherstep(range(grow, i * 0.05, 0.62 + i * 0.05));
    if (g < 0.03) continue;
    const droop = sleep * 0.1 * Math.sign(limb.ang || 1);
    const len = limb.len * L.unit * g;
    const ang0 = limb.ang - Math.PI / 2 + droop;
    const x0 = L.cx;
    const y0 = L.top + 8;
    const mx = x0 + Math.cos(ang0) * len * 0.55;
    const my = y0 + Math.sin(ang0) * len * 0.55 + sleep * 8;
    const ang1 = ang0 + limb.kink * 0.55;
    const x1 = mx + Math.cos(ang1) * len * 0.45;
    const y1 = my + Math.sin(ang1) * len * 0.45;
    const t0 = limb.thick * L.unit * 0.92;
    const t1 = t0 * 0.5;
    ctx.fillStyle = "#6e421c";
    fillTaper(ctx, x0, y0, mx, my, t0, t1 * 1.15);
    fillTaper(ctx, mx, my, x1, y1, t1 * 1.15, t1 * 0.7);

    const fg = smootherstep(range(g, 0.45, 1));
    if (fg > 0.05) {
      const fa = ang1 + limb.fork;
      const fx = x1 + Math.cos(fa) * len * limb.forkLen * fg;
      const fy = y1 + Math.sin(fa) * len * limb.forkLen * fg + sleep * 6;
      fillTaper(ctx, x1, y1, fx, fy, t1 * 0.7, t1 * 0.32);
    }

    ctx.fillStyle = "rgba(232, 186, 96, 0.28)";
    fillTaper(ctx, x0 - 2, y0 - 1, mx - 2, my - 1, t0 * 0.22, t1 * 0.18);
  }
}

function drawClump(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  grow: number,
  sleep: number,
  seed: number,
) {
  if (grow < 0.04) return;
  const squash = lerp(1, 0.78, sleep);
  ctx.save();
  ctx.translate(x, y + sleep * 12);
  ctx.scale(grow, grow * squash);
  ctx.globalAlpha = lerp(1, 0.7, sleep);
  drawBlob(ctx, 0, 0, r, seed, sleep > 0.4 ? "#2f4a14" : "#2c5214");
  drawBlob(ctx, r * 0.22, -r * 0.16, r * 0.7, seed + 4, sleep > 0.4 ? "#4a6820" : "#456c1c");
  drawBlob(ctx, -r * 0.18, r * 0.1, r * 0.62, seed + 8, sleep > 0.4 ? "#3a5818" : "#3d6418");
  drawBlob(ctx, r * 0.04, -r * 0.3, r * 0.46, seed + 12, sleep > 0.4 ? "#8a9438" : "#c2b24a");
  ctx.restore();
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  seed: number,
  color: string,
) {
  const n = 14;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const mag = r * (0.52 + 0.48 * hash(seed * 17 + i * 3.1));
    pts.push({
      x: x + Math.cos(a) * mag,
      y: y + Math.sin(a) * mag * 0.7,
    });
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  const p0 = pts[0];
  const pLast = pts[n - 1];
  ctx.moveTo((pLast.x + p0.x) / 2, (pLast.y + p0.y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawUmbrella(ctx: CanvasRenderingContext2D, L: Layout, grow: number, sleep: number) {
  if (grow < 0.04) return;
  const squash = lerp(1, 0.78, sleep);
  const cx = L.cx;
  const cy = L.top - L.unit * 0.04 + sleep * 10;
  const rw = L.unit * 0.4 * grow;
  const rh = L.unit * 0.155 * grow * squash;
  ctx.save();
  ctx.globalAlpha = lerp(1, 0.72, sleep);
  drawWideCanopy(ctx, cx, cy, rw, rh, 3, sleep > 0.4 ? "#243c10" : "#1f4010");
  drawWideCanopy(ctx, cx + rw * 0.06, cy - rh * 0.18, rw * 0.82, rh * 0.78, 7, sleep > 0.4 ? "#3d5c18" : "#3a6416");
  drawWideCanopy(ctx, cx - rw * 0.08, cy - rh * 0.08, rw * 0.7, rh * 0.7, 11, sleep > 0.4 ? "#4a6a20" : "#4a7220");
  drawWideCanopy(ctx, cx + rw * 0.02, cy - rh * 0.42, rw * 0.48, rh * 0.42, 15, sleep > 0.4 ? "#8a9436" : "#d4b445");
  ctx.restore();
}

function drawWideCanopy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rw: number,
  rh: number,
  seed: number,
  color: string,
) {
  const n = 20;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const mag = 0.72 + 0.28 * hash(seed * 9 + i * 2.4);
    pts.push({
      x: x + Math.cos(a) * rw * mag,
      y: y + Math.sin(a) * rh * mag,
    });
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawCanopy(ctx: CanvasRenderingContext2D, L: Layout, grow: number, sleep: number) {
  drawUmbrella(ctx, L, grow, sleep);
  LIMBS.forEach((limb, i) => {
    const g = smootherstep(range(grow, 0.35 + i * 0.05, 1));
    const fork = limbTip(L, limb, 1, true);
    drawClump(ctx, fork.x, fork.y - 6, limb.puff * L.unit * 0.85, g, sleep, i + 8);
  });
}

function drawPalmate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  alpha: number,
  gold: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  const fill = gold > 0.55 ? "#e0b84a" : "#7a9a32";
  ctx.fillStyle = fill;
  ctx.shadowColor = "rgba(224, 180, 70, 0.35)";
  ctx.shadowBlur = 3;
  for (let k = 0; k < 5; k++) {
    const a = -0.95 + k * 0.475;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.52, size * 0.16, size * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawLeaves(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  t: number,
  leaves: Leaf[],
  canopy: number,
  sleep: number,
) {
  if (sleep < 0.02) return;
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    if (leaf.stay) continue;
    if (t < BAOBAB_GROW_S + leaf.delay) continue;

    const u = easeInCubic(
      range(t, BAOBAB_GROW_S + leaf.delay, BAOBAB_GROW_S + leaf.delay + leaf.fallDur),
    );
    if (u < 0.02) continue;
    const x = lerp(leaf.homeX, L.cx + leaf.restX, u) + Math.sin(t * 2.2 + leaf.phase) * leaf.sway * u;
    const y = lerp(leaf.homeY, L.ground - 4 - hash(i + 40) * 12, u);
    let rot = leaf.phase * 0.2 + u * leaf.spin;
    let alpha = canopy * lerp(0.95, 0.16, range(u, 0.88, 1));
    let size = leaf.size * 1.15;
    if (u > 0.9) {
      rot = lerp(rot, 1.15, range(u, 0.9, 1));
      size *= lerp(1, 0.72, range(u, 0.9, 1));
    }
    drawPalmate(ctx, x, y, size, rot, alpha, leaf.gold);
  }
}
