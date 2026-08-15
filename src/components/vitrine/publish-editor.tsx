import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  Crop,
  Loader2,
  Music2,
  Scissors,
  Type,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  MAX_PUBLISH_VIDEO_SEC,
  MAX_STORY_VIDEO_SEC,
  type AspectPreset,
  type CropRect,
  type TextSticker,
  aspectRatioValue,
  canTrimVideoInBrowser,
  getVideoDuration,
  isVideoFile,
  renderEditedImage,
  trimVideoFile,
} from "@/lib/publish-media-edit";
import { MusicPickerSheet } from "@/components/vitrine/music-picker-sheet";
import type { VitrineMusic } from "@/lib/vitrine-music";

const GOLD = "#E8B93B";
const TEXT_COLORS = ["#FFFFFF", "#E8B93B", "#FF4D6A", "#4D9FFF", "#111111"];

function editorFrameStyle(preset: AspectPreset): CSSProperties {
  const ratio = aspectRatioValue(preset);
  if (ratio == null) {
    return { width: "100%", height: "100%" };
  }
  return {
    aspectRatio: `${ratio} / 1`,
    width: `min(100%, calc(100cqh * ${ratio}))`,
    height: `min(100%, calc(100cqw / ${ratio}))`,
    maxWidth: "100%",
    maxHeight: "100%",
  };
}

type Tool = "none" | "trim" | "crop" | "text" | "sound";

export function PublishEditor({
  file,
  previewUrl,
  isStory,
  caption,
  onCaptionChange,
  onBack,
  onConfirm,
  busy,
}: {
  file: File;
  previewUrl: string;
  isStory: boolean;
  caption: string;
  onCaptionChange: (v: string) => void;
  onBack: () => void;
  onConfirm: (file: File, music: VitrineMusic | null) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const asVideo = isVideoFile(file);
  const maxSec = isStory ? MAX_STORY_VIDEO_SEC : MAX_PUBLISH_VIDEO_SEC;

  const [tool, setTool] = useState<Tool>(asVideo ? "trim" : "crop");
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [aspect, setAspect] = useState<AspectPreset>("9:16");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [texts, setTexts] = useState<TextSticker[]>([]);
  const [activeText, setActiveText] = useState(0);
  const [applying, setApplying] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [music, setMusic] = useState<VitrineMusic | null>(null);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const originalVolume = music ? music.originalVolume : 1;

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<{
    mode: "pan" | "text" | "trim" | "pinch";
    x0: number;
    y0: number;
    pan0: { x: number; y: number };
    text0?: { x: number; y: number; scale: number };
    trim0?: number;
    pinch0?: number;
    dist0?: number;
  } | null>(null);

  const needsTrim = asVideo && duration > maxSec + 0.25;
  const windowSec = Math.min(maxSec, duration || maxSec);
  const maxTrimStart = Math.max(0, (duration || 0) - windowSec);
  const trimEnd = Math.min(duration || windowSec, trimStart + windowSec);

  useEffect(() => {
    if (!asVideo) return;
    let alive = true;
    void getVideoDuration(file)
      .then((d) => {
        if (!alive) return;
        setDuration(d);
        setTrimStart(0);
        setTool("trim");
      })
      .catch(() => alive && setDuration(0));
    return () => {
      alive = false;
    };
  }, [file, asVideo]);

  useEffect(() => {
    if (asVideo) return;
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = previewUrl;
  }, [previewUrl, asVideo]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !asVideo || applying) return;
    el.volume = originalVolume;
    el.muted = originalVolume <= 0.001;
    el.playsInline = true;
    const loopWindow = () => {
      if (el.currentTime >= trimEnd - 0.08) {
        try {
          el.currentTime = trimStart;
        } catch {
          /* ignore */
        }
      }
    };
    const playMuted = () => {
      void el.play().catch(() => undefined);
    };
    el.addEventListener("timeupdate", loopWindow);
    try {
      if (Math.abs(el.currentTime - trimStart) > 0.3) el.currentTime = trimStart;
      else playMuted();
    } catch {
      playMuted();
    }
    el.addEventListener("seeked", playMuted);
    el.addEventListener("loadeddata", playMuted);
    return () => {
      el.removeEventListener("timeupdate", loopWindow);
      el.removeEventListener("seeked", playMuted);
      el.removeEventListener("loadeddata", playMuted);
    };
  }, [trimStart, trimEnd, asVideo, applying, previewUrl, originalVolume]);

  // Aperçu de la musique pendant l'édition.
  useEffect(() => {
    const el = musicAudioRef.current;
    if (!el) return;
    if (!music || applying) {
      el.pause();
      return;
    }
    el.volume = Math.min(1, Math.max(0, music.volume));
    if (Math.abs(el.currentTime - music.startSec) > 1.5) {
      try {
        el.currentTime = music.startSec;
      } catch {
        /* ignore */
      }
    }
    void el.play().catch(() => undefined);
  }, [music, applying]);

  const [stageSize, setStageSize] = useState({ w: 390, h: 693 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => setStageSize({ w: el.clientWidth || 390, h: el.clientHeight || 693 });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, asVideo]);

  const cropRect: CropRect = useMemo(() => {
    // Map zoom/pan into a source crop covering the visible frame aspect.
    const targetRatio = aspectRatioValue(aspect) ?? stageSize.w / Math.max(1, stageSize.h);
    const imgRatio = natural.w / natural.h;

    // Base cover scale (image fills stage), then user zoom.
    let baseW: number;
    let baseH: number;
    if (imgRatio > targetRatio) {
      baseH = natural.h / zoom;
      baseW = baseH * targetRatio;
    } else {
      baseW = natural.w / zoom;
      baseH = baseW / targetRatio;
    }
    baseW = Math.min(natural.w, Math.max(1, baseW));
    baseH = Math.min(natural.h, Math.max(1, baseH));

    const maxPanX = (natural.w - baseW) / 2;
    const maxPanY = (natural.h - baseH) / 2;
    const ox = clamp(pan.x * maxPanX, -maxPanX, maxPanX);
    const oy = clamp(pan.y * maxPanY, -maxPanY, maxPanY);
    const sx = (natural.w - baseW) / 2 + ox;
    const sy = (natural.h - baseH) / 2 + oy;
    return {
      x: sx / natural.w,
      y: sy / natural.h,
      w: baseW / natural.w,
      h: baseH / natural.h,
    };
  }, [aspect, zoom, pan, natural, stageSize]);

  const applyAndConfirm = async () => {
    if (applying || busy) return;
    setApplying(true);
    haptic.medium();
    try {
      if (asVideo) {
        if (needsTrim) {
          if (!canTrimVideoInBrowser()) {
            toast.error(
              t("publish.edit.trimUnsupported", {
                defaultValue:
                  "Impossible de couper ici. Choisis une vidéo de 1 min max dans ta galerie.",
              }),
            );
            return;
          }
          try {
            setTrimProgress(0.01);
            const trimmed = await trimVideoFile(file, trimStart, maxSec, setTrimProgress, {
              videoEl: videoRef.current,
            });
            onConfirm(trimmed, music);
            return;
          } catch (e) {
            const code = e instanceof Error ? e.message : "";
            if (
              code === "capture_unsupported" ||
              code === "recorder_unsupported" ||
              code === "empty_trim"
            ) {
              toast.error(
                t("publish.edit.trimUnsupported", {
                  defaultValue:
                    "Impossible de couper ici. Choisis une vidéo de 1 min max dans ta galerie.",
                }),
              );
              return;
            }
            toast.error(
              t("publish.edit.trimFail", {
                defaultValue: "Échec du découpage. Réessaie avec une vidéo plus courte.",
              }),
            );
            return;
          }
        }
        onConfirm(file, music);
        return;
      }

      const edited = await renderEditedImage(file, {
        crop: cropRect,
        texts: texts.filter((x) => x.text.trim()),
      });
      onConfirm(edited, music);
    } finally {
      setApplying(false);
      setTrimProgress(0);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (asVideo) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-text-sticker]")) {
      const idx = Number(target.getAttribute("data-text-sticker"));
      setActiveText(idx);
      setTool("text");
      const st = texts[idx];
      if (!st) return;
      dragRef.current = {
        mode: "text",
        x0: e.clientX,
        y0: e.clientY,
        pan0: pan,
        text0: { x: st.x, y: st.y, scale: st.scale },
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool !== "crop" && tool !== "none") return;
    if (e.pointerType === "touch" && (e as unknown as TouchEvent).touches?.length === 2) return;
    dragRef.current = {
      mode: "pan",
      x0: e.clientX,
      y0: e.clientY,
      pan0: { ...pan },
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || asVideo) return;
    const stage = stageRef.current;
    if (!stage) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (d.mode === "pan") {
      setPan({
        x: clamp(d.pan0.x + dx / (stage.clientWidth * 0.45), -1, 1),
        y: clamp(d.pan0.y + dy / (stage.clientHeight * 0.45), -1, 1),
      });
    } else if (d.mode === "text" && d.text0 != null) {
      const idx = activeText;
      setTexts((prev) =>
        prev.map((st, i) =>
          i === idx
            ? {
                ...st,
                x: clamp(d.text0!.x + dx / stage.clientWidth, 0.05, 0.95),
                y: clamp(d.text0!.y + dy / stage.clientHeight, 0.05, 0.95),
              }
            : st,
        ),
      );
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (asVideo || e.touches.length !== 2) return;
    const a = e.touches[0]!;
    const b = e.touches[1]!;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    dragRef.current = {
      mode: "pinch",
      x0: 0,
      y0: 0,
      pan0: pan,
      pinch0: zoom,
      dist0: dist,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const d = dragRef.current;
    if (!d || d.mode !== "pinch" || e.touches.length !== 2) return;
    e.preventDefault();
    const a = e.touches[0]!;
    const b = e.touches[1]!;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = clamp((d.pinch0 || 1) * (dist / Math.max(1, d.dist0 || 1)), 1, 4);
    setZoom(next);
  };

  const addText = () => {
    haptic.selection();
    setTexts((prev) => [
      ...prev,
      {
        text: t("publish.edit.textDefault", { defaultValue: "Texte" }),
        x: 0.5,
        y: 0.5,
        scale: 1,
        color: "#FFFFFF",
      },
    ]);
    setActiveText(texts.length);
    setTool("text");
  };

  const working = applying || !!busy;
  const trimPctStart = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimPctWidth = duration > 0 ? (windowSec / duration) * 100 : 100;

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Press onClick={onBack} disabled={working} className="h-11 w-11 rounded-full bg-white/10">
          <X size={22} />
        </Press>
        <p className="text-[15px] font-bold">
          {t("publish.edit.title", { defaultValue: "Modifier" })}
        </p>
        <Press
          onClick={() => void applyAndConfirm()}
          disabled={working}
          className="h-11 min-w-11 rounded-full px-3 text-[13px] font-bold text-[#10162B] disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {working ? <Loader2 size={18} className="animate-spin" /> : <Check size={20} />}
        </Press>
      </div>

      {/* Stage — cadre 9:16. Vidéo : hauteur limitée pour laisser la coupe visible. */}
      <div
        className={`relative mx-3 mt-2 overflow-hidden [container-type:size] ${
          asVideo ? "flex h-[min(38vh,280px)] shrink-0 items-center justify-center" : "min-h-0 flex-1"
        }`}
      >
        <div className={asVideo ? "relative h-full" : "absolute inset-0 flex items-center justify-center"}>
      <div
        ref={stageRef}
        className="relative h-full max-h-full touch-none overflow-hidden rounded-2xl bg-neutral-950"
        style={asVideo ? { aspectRatio: "9 / 16", width: "auto" } : editorFrameStyle(aspect)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onPointerUp}
      >
        {asVideo ? (
          <video
            ref={videoRef}
            src={previewUrl}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
            preload="auto"
            controls={false}
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              if (el.paused) void el.play().catch(() => undefined);
              else el.pause();
            }}
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${previewUrl})`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: `${50 + pan.x * 40}% ${50 + pan.y * 40}%`,
                backgroundSize: `${100 * zoom}%`,
              }}
            />
            {/* Rule-of-thirds grid */}
            {(tool === "crop" || tool === "none") && (
              <div className="pointer-events-none absolute inset-0 z-10">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
                <div className="absolute inset-2 rounded-xl border border-white/50" />
              </div>
            )}
            {texts.map((st, idx) => (
              <div
                key={idx}
                data-text-sticker={idx}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab px-2 py-1 active:cursor-grabbing"
                style={{
                  left: `${st.x * 100}%`,
                  top: `${st.y * 100}%`,
                  color: st.color,
                  fontSize: `${Math.round(22 * st.scale)}px`,
                  fontWeight: 800,
                  textShadow: "0 2px 10px rgba(0,0,0,0.75)",
                  outline: activeText === idx && tool === "text" ? `2px solid ${GOLD}` : "none",
                  borderRadius: 8,
                  maxWidth: "90%",
                  textAlign: "center",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {st.text}
              </div>
            ))}
          </>
        )}

        {applying && asVideo && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/60">
            <div className="text-center">
              <Loader2 className="mx-auto mb-2 animate-spin" size={22} />
              <p className="text-[13px] font-semibold">
                {t("publish.edit.trimming", { defaultValue: "Découpage…" })}{" "}
                {Math.round(trimProgress * 100)}%
              </p>
            </div>
          </div>
        )}
      </div>
        </div>
      </div>

      {/* Tools */}
      <div className="mt-3 flex justify-center gap-2 px-4">
        {asVideo ? (
          <ToolBtn
            active={tool === "trim"}
            icon={<Scissors size={18} />}
            label={t("publish.edit.trim", { defaultValue: "Couper" })}
            onClick={() => {
              haptic.selection();
              setTool("trim");
            }}
          />
        ) : null}
        <ToolBtn
          active={tool === "sound"}
          icon={music ? <Volume2 size={18} /> : <Music2 size={18} />}
          label={t("publish.edit.sound", { defaultValue: "Son" })}
          onClick={() => {
            haptic.selection();
            setTool("sound");
          }}
        />
        {!asVideo && (
          <>
            <ToolBtn
              active={tool === "crop"}
              icon={<Crop size={18} />}
              label={t("publish.edit.crop", { defaultValue: "Recadrer" })}
              onClick={() => {
                haptic.selection();
                setTool("crop");
              }}
            />
            <ToolBtn
              active={tool === "text"}
              icon={<Type size={18} />}
              label={t("publish.edit.text", { defaultValue: "Texte" })}
              onClick={() => {
                if (!texts.length) addText();
                else {
                  haptic.selection();
                  setTool("text");
                }
              }}
            />
          </>
        )}
      </div>

      <div className="shrink-0 px-4 pt-2">
        {tool === "sound" && (
          <div className="space-y-3">
            <Press
              onClick={() => {
                haptic.selection();
                setMusicPickerOpen(true);
              }}
              className="!min-h-11 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-bold text-[#10162B]"
              style={{ background: GOLD }}
            >
              <Music2 size={16} />
              {music
                ? music.title ||
                  t("publish.music.selected", { defaultValue: "Musique ajoutée" })
                : t("publish.music.add", { defaultValue: "Ajouter une musique" })}
            </Press>

            {music && (
              <>
                <div>
                  <p className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                    <span>{t("publish.music.volume", { defaultValue: "Volume musique" })}</span>
                    <span>{Math.round(music.volume * 100)}%</span>
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={music.volume}
                    onChange={(e) =>
                      setMusic((m) => (m ? { ...m, volume: Number(e.target.value) } : m))
                    }
                    className="w-full accent-[#E8B93B]"
                  />
                </div>
                <div>
                  <p className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                    <span>
                      {t("publish.music.startAt", { defaultValue: "Départ de la musique" })}
                    </span>
                    <span>{formatTime(music.startSec)}</span>
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={music.startSec}
                    onChange={(e) =>
                      setMusic((m) => (m ? { ...m, startSec: Number(e.target.value) } : m))
                    }
                    className="w-full accent-[#E8B93B]"
                  />
                </div>
              </>
            )}

            {asVideo && (
              <div>
                <p className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                  <span>{t("publish.music.original", { defaultValue: "Son d'origine" })}</span>
                  <span>{Math.round(originalVolume * 100)}%</span>
                </p>
                <div className="flex items-center gap-2">
                  <Press
                    onClick={() => {
                      haptic.selection();
                      setMusic((m) =>
                        m
                          ? { ...m, originalVolume: m.originalVolume > 0 ? 0 : 1 }
                          : {
                              url: "",
                              title: null,
                              artist: null,
                              startSec: 0,
                              volume: 0,
                              originalVolume: 0,
                            },
                      );
                    }}
                    className="!min-h-9 h-9 w-9 shrink-0 rounded-full bg-white/10"
                  >
                    {originalVolume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </Press>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={originalVolume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMusic((m) =>
                        m
                          ? { ...m, originalVolume: v }
                          : {
                              url: "",
                              title: null,
                              artist: null,
                              startSec: 0,
                              volume: 0,
                              originalVolume: v,
                            },
                      );
                    }}
                    className="w-full accent-[#E8B93B]"
                  />
                </div>
              </div>
            )}

            <p className="text-center text-[11px] text-white/45">
              {t("publish.music.hint", {
                defaultValue:
                  "La musique est jouée avec ta publication dans la Vitrine.",
              })}
            </p>
          </div>
        )}
        {asVideo && tool === "trim" && (
          <div>
            <p className="mb-1 text-center text-[12px] text-white/70">
              {needsTrim
                ? t("publish.edit.trimHint", {
                    defaultValue:
                      "Glisse la fenêtre dorée pour choisir {{sec}} s (vidéo {{dur}} s).",
                    sec: maxSec,
                    dur: Math.round(duration),
                  })
                : t("publish.edit.trimOk", {
                    defaultValue: "Vidéo déjà ≤ {{sec}} s — tu peux publier.",
                    sec: maxSec,
                  })}
            </p>
            {needsTrim && !canTrimVideoInBrowser() && (
              <p className="mb-2 text-center text-[12px] font-semibold text-red-300">
                {t("publish.edit.trimUnsupported", {
                  defaultValue:
                    "Impossible de couper ici. Choisis une vidéo de 1 min max dans ta galerie.",
                })}
              </p>
            )}
            <p className="mb-2 text-center text-[13px] font-bold" style={{ color: GOLD }}>
              {formatTime(trimStart)} – {formatTime(trimEnd)}
              {needsTrim ? ` · ${maxSec}s` : ""}
            </p>
            <div
              className="relative h-16 overflow-hidden rounded-xl"
              style={{
                background:
                  "repeating-linear-gradient(90deg, #2a3148 0 10px, #1c2238 10px 20px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
              onPointerDown={(e) => {
                if (maxTrimStart <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const rel = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                const next = clamp(rel * duration - windowSec / 2, 0, maxTrimStart);
                setTrimStart(next);
                dragRef.current = {
                  mode: "trim",
                  x0: e.clientX,
                  y0: 0,
                  pan0: pan,
                  trim0: next,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d || d.mode !== "trim" || maxTrimStart <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const delta = ((e.clientX - d.x0) / rect.width) * duration;
                setTrimStart(clamp((d.trim0 || 0) + delta, 0, maxTrimStart));
              }}
              onPointerUp={onPointerUp}
            >
              <div
                className="absolute inset-y-0 bg-black/55"
                style={{ left: 0, width: `${trimPctStart}%` }}
              />
              <div
                className="absolute inset-y-0 bg-black/55"
                style={{ left: `${trimPctStart + trimPctWidth}%`, right: 0 }}
              />
              <div
                className="absolute inset-y-1 rounded-lg"
                style={{
                  left: `${trimPctStart}%`,
                  width: `${Math.max(trimPctWidth, 8)}%`,
                  border: `2px solid ${GOLD}`,
                  background: "rgba(232,185,59,0.16)",
                }}
              >
                <span className="absolute inset-y-0 left-0 w-2 rounded-l" style={{ background: GOLD }} />
                <span className="absolute inset-y-0 right-0 w-2 rounded-r" style={{ background: GOLD }} />
              </div>
            </div>
          </div>
        )}

        {!asVideo && tool === "crop" && (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-center gap-2">
              {(
                [
                  ["9:16", "9:16"],
                  ["1:1", "1:1"],
                  ["4:5", "4:5"],
                  ["free", t("publish.edit.aspectFree", { defaultValue: "Libre" })],
                ] as const
              ).map(([key, label]) => (
                <Press
                  key={key}
                  onClick={() => {
                    haptic.selection();
                    setAspect(key);
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="!min-h-9 h-9 rounded-full px-3 text-[12px] font-bold"
                  style={{
                    background: aspect === key ? GOLD : "rgba(255,255,255,0.12)",
                    color: aspect === key ? "#10162B" : "#fff",
                  }}
                >
                  {label}
                </Press>
              ))}
            </div>
            <div>
              <p className="mb-1 text-center text-[11px] text-white/55">
                {t("publish.edit.pinchHint", {
                  defaultValue: "Pince pour zoomer · Glisse pour déplacer",
                })}
              </p>
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-[#E8B93B]"
              />
            </div>
          </div>
        )}

        {!asVideo && tool === "text" && (
          <div className="space-y-2">
            <input
              value={texts[activeText]?.text ?? ""}
              onChange={(e) => {
                const v = e.target.value.slice(0, 80);
                setTexts((prev) =>
                  prev.map((st, i) => (i === activeText ? { ...st, text: v } : st)),
                );
              }}
              placeholder={t("publish.edit.textPlaceholder", {
                defaultValue: "Ajouter un texte…",
              })}
              className="w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-[14px] outline-none placeholder:text-white/40"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setTexts((prev) =>
                        prev.map((st, i) =>
                          i === activeText ? { ...st, color: c } : st,
                        ),
                      );
                    }}
                    className="h-8 w-8 rounded-full border-2"
                    style={{
                      background: c,
                      borderColor:
                        texts[activeText]?.color === c ? GOLD : "rgba(255,255,255,0.25)",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white/55">A</span>
                <input
                  type="range"
                  min={0.6}
                  max={2.4}
                  step={0.05}
                  value={texts[activeText]?.scale ?? 1}
                  onChange={(e) => {
                    const scale = Number(e.target.value);
                    setTexts((prev) =>
                      prev.map((st, i) =>
                        i === activeText ? { ...st, scale } : st,
                      ),
                    );
                  }}
                  className="w-24 accent-[#E8B93B]"
                />
                <span className="text-[16px] font-bold text-white/55">A</span>
              </div>
            </div>
            <Press
              onClick={addText}
              className="!min-h-9 h-9 w-full rounded-full bg-white/10 text-[12px] font-semibold"
            >
              + {t("publish.edit.addText", { defaultValue: "Ajouter un texte" })}
            </Press>
          </div>
        )}
      </div>

      {!isStory && (
        <textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value.slice(0, 500))}
          rows={2}
          placeholder={t("vitrine.captionPlaceholder", { defaultValue: "Légende…" })}
          className="mx-4 mt-1 resize-none rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-[14px] outline-none placeholder:text-white/40"
        />
      )}

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Press
          onClick={() => void applyAndConfirm()}
          disabled={working || (needsTrim && !canTrimVideoInBrowser())}
          className="!min-h-12 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold text-[#10162B] disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {working ? <Loader2 size={18} className="animate-spin" /> : null}
          {t("vitrine.publish", { defaultValue: "Publier" })}
        </Press>
      </div>

      {music?.url && <audio ref={musicAudioRef} src={music.url} loop preload="auto" />}

      <MusicPickerSheet
        open={musicPickerOpen}
        current={music}
        onClose={() => setMusicPickerOpen(false)}
        onPick={(m) => setMusic(m)}
      />
    </div>

  );
}

function ToolBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Press
      onClick={onClick}
      className="!min-h-0 flex flex-col items-center gap-1 rounded-xl px-3 py-2"
      style={{
        background: active ? "rgba(232,185,59,0.2)" : "rgba(255,255,255,0.08)",
        color: active ? GOLD : "rgba(255,255,255,0.85)",
      }}
    >
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </Press>
  );
}

function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
