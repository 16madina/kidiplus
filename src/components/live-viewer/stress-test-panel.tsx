// Local UI stress test — simulates high-volume chat + heart traffic against
// the live viewer WITHOUT touching Supabase Realtime. Purely local injection
// via room.injectLocalChat / room.injectLocalHearts so we can measure DOM,
// framerate, and heap behaviour before a real 1–2k viewer launch.
//
// Activation: append `?stress=1` to the app URL, open any live. A small
// floating panel appears bottom-left. Dev/preview only — hidden in prod
// unless the flag is set.
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveRoomState } from "@/lib/live-room";

const USERS = [
  "julie_p","kevin.94","marion","sofiane","lea_style","amine_ttv","clemence",
  "thomas.b","elodie","yanis75","camille_r","nadir","aurelie","mehdi.k",
  "manon","hugo_j","sarah.m","farah","romain","chloe_x","ines.mrl","adam_lyon",
  "victoire","noa93","louise","raphael","sabrina","younes","margaux","bilel",
];
const MSGS = [
  "je prends !","taille 40 ?","trop belle 😍","prix ?","MDR","🔥🔥🔥",
  "gooo","je surenchéris","authentique ?","c'est neuf ?","💖","top qualité",
  "hâte de voir","envoi sur Paris ?","🥶","pareil en noir ?","je viens d'arriver 👋",
  "wesh","propre","montre encore stp","matériau ?","livré en combien de jours ?",
];
const COLORS = [
  "oklch(0.75 0.16 30)","oklch(0.78 0.14 200)","oklch(0.8 0.16 140)",
  "oklch(0.78 0.16 60)","oklch(0.75 0.18 320)","oklch(0.8 0.14 260)",
];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
let seq = 0;

export function useStressTestEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      const p = new URLSearchParams(window.location.search);
      setOn(p.get("stress") === "1" || localStorage.getItem("kidi_stress") === "1");
    };
    check();
    window.addEventListener("popstate", check);
    return () => window.removeEventListener("popstate", check);
  }, []);
  return on;
}

export function StressTestPanel({ room }: { room: LiveRoomState }) {
  const { injectLocalChat, injectLocalHearts } = room;
  const [msgsPerSec, setMsgsPerSec] = useState(50);
  const [heartsPerSec, setHeartsPerSec] = useState(80);
  const [running, setRunning] = useState(false);
  const [sentMsgs, setSentMsgs] = useState(0);
  const [sentHearts, setSentHearts] = useState(0);
  const [heapMB, setHeapMB] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);

  const startTsRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTsRef = useRef(0);

  // FPS + heap sampler while running.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let alive = true;
    const loop = (ts: number) => {
      if (!alive) return;
      frameCountRef.current += 1;
      if (!lastFpsTsRef.current) lastFpsTsRef.current = ts;
      if (ts - lastFpsTsRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (ts - lastFpsTsRef.current)));
        frameCountRef.current = 0;
        lastFpsTsRef.current = ts;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perf = performance as any;
        if (perf?.memory?.usedJSHeapSize) {
          setHeapMB(Math.round(perf.memory.usedJSHeapSize / 1048576));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [running]);

  // Driver loop — batches injection every 100ms.
  useEffect(() => {
    if (!running) return;
    startTsRef.current = performance.now();
    const tickMs = 100;
    const timer = setInterval(() => {
      const chatBatch = Math.max(0, Math.round((msgsPerSec * tickMs) / 1000));
      const heartBatch = Math.max(0, Math.round((heartsPerSec * tickMs) / 1000));
      if (chatBatch > 0) {
        const msgs = Array.from({ length: chatBatch }, () => {
          const u = pick(USERS);
          return {
            id: `stress-${++seq}-${Date.now()}`,
            user: u,
            color: pick(COLORS),
            text: pick(MSGS),
          };
        });
        injectLocalChat(msgs);
        setSentMsgs((n) => n + chatBatch);
      }
      if (heartBatch > 0) {
        injectLocalHearts(heartBatch);
        setSentHearts((n) => n + heartBatch);
      }
    }, tickMs);
    return () => clearInterval(timer);
  }, [running, msgsPerSec, heartsPerSec, injectLocalChat, injectLocalHearts]);

  const elapsed = running ? ((performance.now() - startTsRef.current) / 1000).toFixed(1) : "0.0";

  const runBurst = (chatN: number, heartN: number) => {
    // Blast a fixed batch in one shot to measure worst-case reconciliation.
    const msgs = Array.from({ length: chatN }, () => ({
      id: `burst-${++seq}-${Date.now()}`,
      user: pick(USERS),
      color: pick(COLORS),
      text: pick(MSGS),
    }));
    injectLocalChat(msgs);
    injectLocalHearts(heartN);
    setSentMsgs((n) => n + chatN);
    setSentHearts((n) => n + heartN);
  };

  const stats = useMemo(
    () => ({ sentMsgs, sentHearts, heapMB, fps, elapsed }),
    [sentMsgs, sentHearts, heapMB, fps, elapsed],
  );

  return (
    <div className="pointer-events-auto absolute bottom-24 left-3 z-50 w-[220px] rounded-2xl border border-white/20 bg-black/80 p-3 text-[11px] text-white shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold tracking-wide">TEST LOCAL</span>
        <button
          className="rounded-md bg-white/10 px-2 py-0.5 text-[10px]"
          onClick={() => {
            localStorage.removeItem("kidi_stress");
            const url = new URL(window.location.href);
            url.searchParams.delete("stress");
            window.history.replaceState(null, "", url.toString());
            window.location.reload();
          }}
        >×</button>
      </div>

      <label className="mb-1 block">
        Messages/s: <span className="font-mono">{msgsPerSec}</span>
        <input type="range" min={0} max={500} value={msgsPerSec}
          onChange={(e) => setMsgsPerSec(Number(e.target.value))} className="w-full" />
      </label>
      <label className="mb-2 block">
        Cœurs/s: <span className="font-mono">{heartsPerSec}</span>
        <input type="range" min={0} max={500} value={heartsPerSec}
          onChange={(e) => setHeartsPerSec(Number(e.target.value))} className="w-full" />
      </label>

      <div className="mb-2 flex gap-1">
        <button
          className={`flex-1 rounded-md px-2 py-1 font-semibold ${running ? "bg-red-500" : "bg-emerald-500"}`}
          onClick={() => setRunning((r) => !r)}
        >{running ? "Stop" : "Démarrer"}</button>
        <button className="rounded-md bg-white/10 px-2 py-1"
          onClick={() => { setSentMsgs(0); setSentHearts(0); setFps(null); }}>
          Reset
        </button>
      </div>

      <div className="mb-2 flex gap-1">
        <button className="flex-1 rounded-md bg-white/10 px-2 py-1"
          onClick={() => runBurst(1000, 500)}>Burst 1k</button>
        <button className="flex-1 rounded-md bg-white/10 px-2 py-1"
          onClick={() => runBurst(2000, 1000)}>Burst 2k</button>
      </div>

      <div className="font-mono leading-relaxed">
        <div>msgs: {stats.sentMsgs}</div>
        <div>cœurs: {stats.sentHearts}</div>
        <div>fps: {stats.fps ?? "—"}</div>
        <div>heap: {stats.heapMB != null ? `${stats.heapMB} MB` : "n/a"}</div>
        <div>t: {stats.elapsed}s</div>
      </div>
    </div>
  );
}
