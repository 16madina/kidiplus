import { useEffect, useRef } from "react";
import {
  easeInOutCubic,
  easeOutCubic,
  heartbeat,
  lerp,
  range,
  DEFI_PLUS_HIT_S,
  PHASE,
} from "@/lib/defi-plus";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  side: 0 | 1;
};

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export function DefiPlusMotionCanvas({ elapsedMs }: { elapsedMs: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const elapsedRef = useRef(elapsedMs);
  elapsedRef.current = elapsedMs;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let burst = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      if (!particlesRef.current.length) seed(particlesRef.current, w, h);
      const t = elapsedRef.current / 1000;
      ctx.clearRect(0, 0, w, h);
      drawScene(ctx, t, w, h);
      burst = stepParticles(ctx, particlesRef.current, t, w, h, burst);
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

function seed(list: Particle[], w: number, h: number) {
  for (let i = 0; i < 70; i++) list.push(spawn(w, h, i < 35 ? 0 : 1));
}

function spawn(w: number, h: number, side: 0 | 1): Particle {
  const left = side === 0;
  return {
    x: left ? Math.random() * w * 0.42 : w * 0.58 + Math.random() * w * 0.42,
    y: h * 0.14 + Math.random() * h * 0.4,
    vx: left ? 1.1 + Math.random() * 2.2 : -(1.1 + Math.random() * 2.2),
    vy: (Math.random() - 0.5) * 1.4,
    life: Math.random() * 36,
    max: 42 + Math.random() * 40,
    size: 0.9 + Math.random() * 2.6,
    side,
  };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  t: number,
  w: number,
  h: number,
) {
  const cx = w / 2;
  const cy = h * 0.33;
  const grow = easeOutCubic(range(t, 0.05, PHASE.enterEnd - 0.15));
  const braid = easeInOutCubic(range(t, PHASE.enterEnd - 0.15, PHASE.braidEnd - 0.05));
  const coil = easeInOutCubic(range(t, PHASE.braidEnd - 0.15, PHASE.medalReady));
  const medal = easeOutCubic(range(t, PHASE.braidEnd + 0.15, PHASE.medalReady + 0.15));
  const titleFade = 1 - range(t, PHASE.medalReady - 0.5, PHASE.medalReady + 0.15);
  const impact = range(t, DEFI_PLUS_HIT_S - 0.05, DEFI_PLUS_HIT_S + 0.6);
  const shardsOn =
    lerp(0, 0.4, range(t, PHASE.medalReady - 0.2, PHASE.medalReady + 0.5)) *
    (1 - range(t, DEFI_PLUS_HIT_S - 0.1, DEFI_PLUS_HIT_S + 0.15) * 0.35);

  drawCenterBeam(ctx, t, w, h);
  drawEnergyThreads(ctx, t, w, h, cx, cy, grow, braid, coil, titleFade);
  if (medal > 0.35)
    drawOrbitThreads(ctx, t, cx, cy, w, medal * 0.55 * (1 - range(t, DEFI_PLUS_HIT_S + 0.05, DEFI_PLUS_HIT_S + 0.35)));
  if (braid > 0.08 && medal < 0.92) drawGoldRings(ctx, t, cx, cy, w, braid, coil, medal);
  if (shardsOn > 0.04) drawRadialShards(ctx, t, cx, cy, w, shardsOn);
  if (impact > 0) drawImpact(ctx, t, cx, cy, w, h);
  if (medal > 0.02) drawMedallion(ctx, t, cx, cy, medal, w);
  if (titleFade > 0.02) drawFlyingTitles(ctx, t, w, cx, cy, braid, coil, titleFade);
}

function drawCenterBeam(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const a = lerp(0, 1, range(t, 0, 0.32));
  if (a < 0.02) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(w / 2, 0);
  const beam = ctx.createLinearGradient(0, 0, 0, h);
  beam.addColorStop(0, "rgba(80,240,255,0)");
  beam.addColorStop(0.12, "rgba(80,240,255,0.55)");
  beam.addColorStop(0.33, "rgba(255,255,255,0.95)");
  beam.addColorStop(0.55, "rgba(255,255,255,0.9)");
  beam.addColorStop(0.82, "rgba(255,210,70,0.6)");
  beam.addColorStop(1, "rgba(255,210,70,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(-1.2, h * 0.02);
  ctx.lineTo(1.2, h * 0.02);
  ctx.lineTo(0.35, h * 0.98);
  ctx.lineTo(-0.35, h * 0.98);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function energyPoint(
  u: number,
  t: number,
  side: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  braid: number,
  coil: number,
  phase: number,
) {
  const enterX = side < 0 ? lerp(-w * 0.12, w * 0.24, u) : lerp(w * 1.12, w * 0.76, u);
  const enterY = cy + Math.sin(u * Math.PI * 1.2 + t * 10 + phase) * 18;

  const braidX =
    cx +
    side * lerp(w * 0.46, -w * 0.08, u) +
    Math.sin(u * Math.PI * 2.6 + t * 3.4 + phase) * 36 * side;
  const braidY = lerp(h * 0.15, h * 0.52, u) + Math.sin(u * Math.PI * 3.4 + t * 4.8 + phase) * 26;

  const turns = 2.2 + coil * 1.25;
  const ang = (u * Math.PI * turns + t * 2.6 + phase) * side;
  const r = lerp(w * 0.3, w * 0.175, coil) + Math.sin(u * 16 + t * 8 + phase) * 8;
  const coilX = cx + Math.cos(ang) * r;
  const coilY = cy + Math.sin(ang) * r * 0.88;

  return {
    x: lerp(lerp(enterX, braidX, braid), coilX, coil),
    y: lerp(lerp(enterY, braidY, braid), coilY, coil),
  };
}

function drawEnergyThreads(
  ctx: CanvasRenderingContext2D,
  t: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  grow: number,
  braid: number,
  coil: number,
  titleFade: number,
) {
  const fade = Math.max(titleFade * 0.85, (1 - range(t, PHASE.medalReady - 0.3, PHASE.medalReady + 0.35)) * 0.35);
  if (grow * fade < 0.03) return;

  const drawFilament = (
    side: number,
    phase: number,
    core: string,
    glow: string,
    width: number,
    alpha: number,
  ) => {
    const steps = 34;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * grow;
      const p = energyPoint(u, t, side, w, h, cx, cy, braid, coil, phase);
      const nse = Math.sin(u * 42 + t * 13 + phase * 4) * lerp(10, 2.2, coil);
      const nse2 = Math.cos(u * 27 + t * 9 + phase) * lerp(6, 1.4, coil);
      pts.push({ x: p.x + nse * side * 0.35, y: p.y + nse2 });
    }
    strokeTapered(ctx, pts, width, width * 0.18, glow, alpha * grow * fade * 0.45);
    strokeTapered(ctx, pts, width * 0.38, 0.6, core, alpha * grow * fade);
  };

  for (let k = 0; k < 8; k++) {
    drawFilament(-1, k * 0.31, "rgba(180,250,255,0.95)", "rgba(40,170,255,0.7)", 7.5 - k * 0.28, 0.55);
    drawFilament(1, Math.PI + k * 0.31, "rgba(255,245,190,0.95)", "rgba(255,170,40,0.7)", 7.5 - k * 0.28, 0.55);
  }

  if (titleFade > 0.12) {
    const defiX = lerp(-w * 0.05, w * 0.27, grow) + lerp(0, w * 0.1, braid);
    const plusX = lerp(w * 1.05, w * 0.73, grow) + lerp(0, -w * 0.1, braid);
    drawSplash(ctx, defiX, cy, -1, t, titleFade * grow);
    drawSplash(ctx, plusX, cy, 1, t, titleFade * grow);
  }
}

function strokeTapered(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  w0: number,
  w1: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  for (let i = 1; i < pts.length; i++) {
    const u = i / (pts.length - 1);
    ctx.lineWidth = lerp(w0, w1, u);
    ctx.globalAlpha = alpha * (0.75 + 0.25 * (1 - u));
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSplash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: number,
  t: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const color = side < 0 ? "rgba(70,230,255,0.9)" : "rgba(255,205,70,0.9)";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  for (let i = 0; i < 26; i++) {
    const a = side * (0.05 + (i / 25) * 0.95) + Math.sin(t * 16 + i) * 0.14;
    const len = 22 + hash(i + 4) * 54 + Math.sin(t * 12 + i * 2) * 10;
    ctx.globalAlpha = alpha * (0.18 + hash(i) * 0.35);
    ctx.lineWidth = 0.7 + hash(i + 9) * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y + Math.sin(i * 1.7 + t * 9) * 10);
    ctx.lineTo(x + Math.cos(a) * len * side, y + Math.sin(a) * len * 0.42);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGoldRings(
  ctx: CanvasRenderingContext2D,
  t: number,
  cx: number,
  cy: number,
  w: number,
  braid: number,
  coil: number,
  medal: number,
) {
  const on = braid * (1 - medal * 0.85);
  if (on < 0.04) return;
  const r = lerp(w * 0.13, w * 0.19, coil);
  drawTorus(ctx, cx, cy, r, r * 0.42, t * 1.15, on);
  drawTorus(ctx, cx, cy, r * 0.42, r, Math.PI / 2 + t * 0.95, on * 0.92);
}

function drawTorus(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  alpha: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#8a6410";
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#f0c14b";
  ctx.lineWidth = 8;
  ctx.shadowColor = "#ffe08a";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,230,0.9)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, -0.9, 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawOrbitThreads(
  ctx: CanvasRenderingContext2D,
  t: number,
  cx: number,
  cy: number,
  w: number,
  on: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const r = w * 0.22;
  for (let i = 0; i < 8; i++) {
    const left = i % 2 === 0;
    ctx.strokeStyle = left ? "rgba(80,230,255,0.55)" : "rgba(255,205,70,0.55)";
    ctx.lineWidth = 1.1 + (i % 3) * 0.5;
    ctx.globalAlpha = 0.55 * on;
    ctx.beginPath();
    const steps = 28;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const ang = u * Math.PI * 1.8 + t * (1.6 + i * 0.07) + i * 0.7;
      const rad = r + Math.sin(ang * 3 + i) * 10 + (i % 5) * 4;
      const x = cx + Math.cos(ang) * rad * (left ? 1.05 : 0.95);
      const y = cy + Math.sin(ang) * rad * 0.86;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawRadialShards(
  ctx: CanvasRenderingContext2D,
  t: number,
  cx: number,
  cy: number,
  w: number,
  intensity: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const n = 36;
  for (let i = 0; i < n; i++) {
    const jitter = Math.sin(t * 11 + i * 2.1) * 0.03;
    const ang = (i / n) * Math.PI * 2 + jitter;
    const left = Math.cos(ang) < 0;
    const inner = w * 0.23;
    const outer = inner + w * (0.08 + hash(i) * 0.28) * intensity;
    const flick = 0.45 + 0.55 * Math.abs(Math.sin(t * 16 + i));
    ctx.strokeStyle = left
      ? `rgba(90,235,255,${0.38 * intensity * flick})`
      : `rgba(255,210,70,${0.38 * intensity * flick})`;
    ctx.lineWidth = 0.55 + hash(i + 11) * 2.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
    ctx.stroke();
  }
  const flare = ctx.createLinearGradient(cx - w * 0.48, cy, cx + w * 0.48, cy);
  flare.addColorStop(0, "rgba(80,220,255,0)");
  flare.addColorStop(0.45, `rgba(180,250,255,${0.18 * intensity})`);
  flare.addColorStop(0.5, `rgba(255,255,255,${0.35 * intensity})`);
  flare.addColorStop(0.55, `rgba(255,220,120,${0.18 * intensity})`);
  flare.addColorStop(1, "rgba(255,200,60,0)");
  ctx.fillStyle = flare;
  ctx.fillRect(cx - w * 0.48, cy - 1.2, w * 0.96, 2.4);
  ctx.restore();
}

function drawFlyingTitles(
  ctx: CanvasRenderingContext2D,
  t: number,
  w: number,
  cx: number,
  cy: number,
  braid: number,
  coil: number,
  fade: number,
) {
  const defiEnter = easeOutCubic(range(t, 0.06, 1.55));
  const plusEnter = easeOutCubic(range(t, 0.22, 1.7));
  const defiX =
    lerp(cx - w * 0.62, cx - w * 0.22, defiEnter) + lerp(0, w * 0.14, braid) + lerp(0, w * 0.06, coil);
  const plusX =
    lerp(cx + w * 0.62, cx + w * 0.22, plusEnter) + lerp(0, -w * 0.14, braid) + lerp(0, -w * 0.06, coil);
  const defiRot = lerp(-0.32, -0.08, defiEnter) + lerp(0, 0.38, braid);
  const plusRot = lerp(0.32, 0.08, plusEnter) + lerp(0, -0.38, braid);
  metallicText(ctx, "DÉFI", defiX, cy, defiRot, Math.max(38, w * 0.14), fade, "#7dd8ff", "#163d9c", 0.18);
  metallicText(ctx, "+", plusX, cy, plusRot, Math.max(62, w * 0.22), fade, "#ffe08a", "#9a6b0c", 0.18);
}

function metallicText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rot: number,
  size: number,
  alpha: number,
  hi: string,
  lo: string,
  italic = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.transform(1, 0, italic, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = hi;
  ctx.shadowBlur = 26;
  for (let i = 11; i >= 1; i--) {
    ctx.fillStyle = i > 6 ? "#050814" : lo;
    ctx.fillText(text, -i * 0.85, i * 1.25);
  }
  const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.28, hi);
  g.addColorStop(0.72, lo);
  g.addColorStop(1, "#1a1204");
  ctx.fillStyle = g;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawMedallion(
  ctx: CanvasRenderingContext2D,
  t: number,
  cx: number,
  cy: number,
  on: number,
  w: number,
) {
  const split = easeOutCubic(range(t, DEFI_PLUS_HIT_S + 0.08, DEFI_PLUS_HIT_S + 0.95));
  const beat = t >= PHASE.beatStart && t < DEFI_PLUS_HIT_S ? heartbeat(t) : 0;
  const pulse = 1 + beat * 0.14;
  const fade = 1 - range(t, DEFI_PLUS_HIT_S + 1.15, DEFI_PLUS_HIT_S + 1.85);
  const dx = lerp(0, w * 0.48, split);
  const dy = lerp(0, w * 0.04, split);
  if (on * fade < 0.02) return;

  paintMedalHalf(ctx, cx - dx, cy + dy, on * pulse, fade, w, -1);
  paintMedalHalf(ctx, cx + dx, cy + dy, on * pulse, fade, w, 1);
}

function paintMedalHalf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
  w: number,
  side: -1 | 1,
) {
  const r = w * 0.205 * 0.92;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  if (side < 0) ctx.rect(-r * 2.2, -r * 2.2, r * 2.2, r * 4.4);
  else ctx.rect(0, -r * 2.2, r * 2.2, r * 4.4);
  ctx.clip();

  const aura = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.05);
  aura.addColorStop(0, "rgba(255,255,255,0.22)");
  aura.addColorStop(0.38, side < 0 ? "rgba(70,200,255,0.28)" : "rgba(255,196,64,0.24)");
  aura.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  const disc = ctx.createLinearGradient(-r, 0, r, 0);
  disc.addColorStop(0, "#1a4ea8");
  disc.addColorStop(0.48, "#071428");
  disc.addColorStop(0.52, "#071428");
  disc.addColorStop(1, "#b8860b");
  ctx.fillStyle = disc;
  ctx.fill();

  const gloss = ctx.createRadialGradient(-r * 0.28, -r * 0.34, 4, 0, 0, r);
  gloss.addColorStop(0, "rgba(255,255,255,0.28)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.strokeStyle = "#6b4c0c";
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#f0c14b";
  ctx.lineWidth = r * 0.11;
  ctx.shadowColor = "#ffe08a";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,230,0.85)";
  ctx.lineWidth = r * 0.03;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.02, -1.15, 0.35);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,230,150,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  metallicText(ctx, "DÉFI", 0, -r * 0.16, 0, r * 0.38, 1, "#ffe08a", "#c48912");
  metallicText(ctx, "+", 0, r * 0.28, 0, r * 0.5, 1, "#ffe08a", "#c48912");
  ctx.restore();
}

function drawImpact(
  ctx: CanvasRenderingContext2D,
  t: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
) {
  const flash = (1 - range(t, DEFI_PLUS_HIT_S, DEFI_PLUS_HIT_S + 0.16)) * 0.16;
  if (flash > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const hit = easeOutCubic(range(t, DEFI_PLUS_HIT_S, DEFI_PLUS_HIT_S + 0.28));
  const fade = 1 - range(t, DEFI_PLUS_HIT_S + 0.1, DEFI_PLUS_HIT_S + 0.5);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(255,240,180,${0.8 * fade})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, lerp(4, w * 0.12, hit), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function stepParticles(
  ctx: CanvasRenderingContext2D,
  list: Particle[],
  t: number,
  w: number,
  h: number,
  burst: boolean,
): boolean {
  const pull =
    easeInOutCubic(range(t, 0.3, PHASE.braidEnd)) * (1 - range(t, PHASE.medalReady - 0.2, PHASE.medalReady + 0.4));
  const explode = range(t, DEFI_PLUS_HIT_S, DEFI_PLUS_HIT_S + 0.25);
  if (explode > 0.08 && !burst) {
    burst = true;
    for (let i = 0; i < 28; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const spd = 2.2 + Math.random() * 4;
      list.push({
        x: w / 2,
        y: h * 0.33,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        max: 14 + Math.random() * 12,
        size: 1 + Math.random() * 1.6,
        side: Math.random() > 0.5 ? 0 : 1,
      });
    }
  }

  const clearR = w * 0.2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of list) {
    p.life += 1;
    p.vx += (w / 2 - p.x) * 0.0013 * pull;
    p.vy += (h * 0.33 - p.y) * 0.0013 * pull;
    p.x += p.vx;
    p.y += p.vy + Math.sin((p.life + t * 50) * 0.09) * 0.32;
    if (p.life > p.max) Object.assign(p, spawn(w, h, p.side));
    const dx = p.x - w / 2;
    const dy = p.y - h * 0.33;
    if (dx * dx + dy * dy < clearR * clearR) continue;
    const a = (1 - p.life / p.max) * (t < 0.12 ? t / 0.12 : 1) * 0.7;
    ctx.fillStyle =
      p.side === 0 ? `rgba(80,235,255,${0.4 * a})` : `rgba(255,210,70,${0.4 * a})`;
    const ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size * 1.8, p.size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  return burst;
}
