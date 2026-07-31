import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Crop,
  Loader2,
  Scissors,
  Type,
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
  getVideoDuration,
  isVideoFile,
  renderEditedImage,
  trimVideoFile,
} from "@/lib/publish-media-edit";

const GOLD = "#E8B93B";

type Tool = "none" | "trim" | "crop" | "text";

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
  /** Called with the (possibly edited) file ready to upload. */
  onConfirm: (file: File) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const asVideo = isVideoFile(file);
  const maxSec = isStory ? MAX_STORY_VIDEO_SEC : MAX_PUBLISH_VIDEO_SEC;

  const [tool, setTool] = useState<Tool>("none");
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [aspect, setAspect] = useState<AspectPreset>("original");
  const [overlayText, setOverlayText] = useState("");
  const [applying, setApplying] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);

  const needsTrim = asVideo && duration > maxSec + 0.25;
  const trimEnd = Math.min(duration, trimStart + maxSec);

  useEffect(() => {
    if (!asVideo) return;
    let alive = true;
    void getVideoDuration(file)
      .then((d) => {
        if (!alive) return;
        setDuration(d);
        setTrimStart(0);
        if (d > maxSec + 0.25) setTool("trim");
      })
      .catch(() => {
        if (alive) setDuration(0);
      });
    return () => {
      alive = false;
    };
  }, [file, asVideo, maxSec]);

  useEffect(() => {
    const el = videoPreviewRef.current;
    if (!el || !asVideo) return;
    el.currentTime = trimStart;
  }, [trimStart, asVideo]);

  const trimLabel = useMemo(() => {
    const a = formatTime(trimStart);
    const b = formatTime(trimEnd);
    return `${a} – ${b} · ${Math.round(Math.min(maxSec, trimEnd - trimStart))}s`;
  }, [trimStart, trimEnd, maxSec]);

  const applyAndConfirm = async () => {
    if (applying || busy) return;
    setApplying(true);
    haptic.medium();
    try {
      if (asVideo) {
        if (needsTrim || tool === "trim") {
          if (duration <= 0) {
            toast.error(
              t("publish.edit.durationFail", {
                defaultValue: "Impossible de lire la durée de la vidéo.",
              }),
            );
            return;
          }
          if (duration > maxSec + 0.25) {
            try {
              setTrimProgress(0);
              const trimmed = await trimVideoFile(
                file,
                trimStart,
                maxSec,
                setTrimProgress,
              );
              onConfirm(trimmed);
              return;
            } catch (e) {
              const code = e instanceof Error ? e.message : "";
              if (code === "capture_unsupported" || code === "recorder_unsupported") {
                toast.error(
                  t("publish.edit.trimUnsupported", {
                    defaultValue:
                      "Coupe la vidéo à 1 min max dans ta galerie, puis réessaie.",
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
        }
        onConfirm(file);
        return;
      }

      // Photo: crop + text
      if (aspect !== "original" || overlayText.trim()) {
        const edited = await renderEditedImage(file, {
          aspect,
          text: overlayText,
        });
        onConfirm(edited);
        return;
      }
      onConfirm(file);
    } finally {
      setApplying(false);
      setTrimProgress(0);
    }
  };

  const working = applying || !!busy;

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Press
          onClick={onBack}
          disabled={working}
          className="h-11 w-11 rounded-full bg-white/10 text-white"
        >
          <X size={22} />
        </Press>
        <p className="text-[15px] font-bold">
          {t("publish.edit.title", { defaultValue: "Modifier" })}
        </p>
        <Press
          onClick={() => void applyAndConfirm()}
          disabled={working || (needsTrim && duration <= 0)}
          className="h-11 min-w-11 rounded-full px-3 text-[13px] font-bold text-[#10162B] disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {working ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Check size={20} />
          )}
        </Press>
      </div>

      <div className="relative mx-4 mt-2 min-h-0 flex-1 overflow-hidden rounded-2xl bg-neutral-900">
        {asVideo ? (
          <video
            ref={videoPreviewRef}
            src={previewUrl}
            className="h-full w-full object-contain"
            controls
            playsInline
            style={
              aspect === "original"
                ? undefined
                : { objectFit: "cover", aspectRatio: aspect.replace(":", " / ") }
            }
          />
        ) : (
          <div
            className="relative mx-auto h-full max-w-full overflow-hidden"
            style={
              aspect === "original"
                ? { height: "100%" }
                : {
                    aspectRatio: aspect.replace(":", " / "),
                    height: "100%",
                    maxHeight: "100%",
                  }
            }
          >
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
            {overlayText.trim() && (
              <p
                className="pointer-events-none absolute inset-x-4 bottom-[18%] text-center text-[22px] font-bold leading-snug text-white"
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.75)" }}
              >
                {overlayText.trim()}
              </p>
            )}
          </div>
        )}

        {applying && asVideo && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/55 px-6 text-center">
            <div>
              <Loader2 className="mx-auto mb-2 animate-spin" size={22} />
              <p className="text-[13px] font-semibold">
                {t("publish.edit.trimming", { defaultValue: "Découpage…" })}{" "}
                {Math.round(trimProgress * 100)}%
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="mt-3 flex justify-center gap-2 px-4">
        {asVideo && (
          <ToolBtn
            active={tool === "trim"}
            icon={<Scissors size={18} />}
            label={t("publish.edit.trim", { defaultValue: "Couper" })}
            onClick={() => {
              haptic.selection();
              setTool("trim");
            }}
          />
        )}
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
                haptic.selection();
                setTool("text");
              }}
            />
          </>
        )}
      </div>

      <div className="min-h-[7.5rem] px-4 pt-3">
        {tool === "trim" && asVideo && (
          <div>
            {needsTrim ? (
              <p className="mb-2 text-center text-[12px] text-white/70">
                {t("publish.edit.trimHint", {
                  defaultValue:
                    "Choisis un extrait de {{sec}} s max (la vidéo fait {{dur}} s).",
                  sec: maxSec,
                  dur: Math.round(duration),
                })}
              </p>
            ) : (
              <p className="mb-2 text-center text-[12px] text-white/70">
                {t("publish.edit.trimOk", {
                  defaultValue: "Vidéo déjà ≤ {{sec}} s — tu peux publier.",
                  sec: maxSec,
                })}
              </p>
            )}
            <p className="mb-2 text-center text-[12px] font-semibold text-[color:var(--accent,#E8B93B)]" style={{ color: GOLD }}>
              {trimLabel}
            </p>
            <input
              type="range"
              min={0}
              max={Math.max(0, duration - Math.min(maxSec, duration))}
              step={0.1}
              value={trimStart}
              disabled={duration <= maxSec}
              onChange={(e) => setTrimStart(Number(e.target.value))}
              className="w-full accent-[#E8B93B]"
            />
          </div>
        )}

        {tool === "crop" && !asVideo && (
          <div className="flex flex-wrap justify-center gap-2">
            {(
              [
                ["original", t("publish.edit.aspectOriginal", { defaultValue: "Original" })],
                ["9:16", "9:16"],
                ["1:1", "1:1"],
                ["4:5", "4:5"],
              ] as const
            ).map(([key, label]) => (
              <Press
                key={key}
                onClick={() => {
                  haptic.selection();
                  setAspect(key);
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
        )}

        {tool === "text" && !asVideo && (
          <input
            value={overlayText}
            onChange={(e) => setOverlayText(e.target.value.slice(0, 80))}
            placeholder={t("publish.edit.textPlaceholder", {
              defaultValue: "Ajouter un texte…",
            })}
            className="w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/40"
          />
        )}

        {tool === "none" && !asVideo && (
          <p className="text-center text-[12px] text-white/50">
            {t("publish.edit.hint", {
              defaultValue: "Recadre, ajoute du texte, puis valide.",
            })}
          </p>
        )}
      </div>

      {!isStory && (
        <textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value.slice(0, 500))}
          rows={2}
          placeholder={t("vitrine.captionPlaceholder", { defaultValue: "Légende…" })}
          className="mx-4 mt-1 resize-none rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/40"
        />
      )}

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Press
          onClick={() => void applyAndConfirm()}
          disabled={working}
          className="!min-h-12 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold text-[#10162B] disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {working ? <Loader2 size={18} className="animate-spin" /> : null}
          {t("vitrine.publish", { defaultValue: "Publier" })}
        </Press>
      </div>
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
