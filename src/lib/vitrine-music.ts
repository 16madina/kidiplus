// Musique pour la Vitrine : bibliothèque KiDi+ (libre de droits) + import
// depuis le téléphone. La musique n'est pas ré-encodée dans le média : on
// stocke l'URL + les volumes et on la joue en lecture (modèle TikTok).

import afroSunset from "@/assets/music/afro-sunset.mp3.asset.json";
import goldNights from "@/assets/music/gold-nights.mp3.asset.json";
import softGlow from "@/assets/music/soft-glow.mp3.asset.json";
import marketDay from "@/assets/music/market-day.mp3.asset.json";
import slowMotion from "@/assets/music/slow-motion.mp3.asset.json";
import runway from "@/assets/music/runway.mp3.asset.json";

export type VitrineMusic = {
  url: string;
  title: string | null;
  artist: string | null;
  /** Départ de la musique dans la piste (secondes). */
  startSec: number;
  /** 0 → 1 */
  volume: number;
  /** Volume du son d'origine de la vidéo, 0 → 1. */
  originalVolume: number;
};

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  url: string;
  mood: string;
};

export const MUSIC_LIBRARY: MusicTrack[] = [
  {
    id: "afro-sunset",
    title: "Afro Sunset",
    artist: "KiDi+ Studio",
    url: afroSunset.url,
    mood: "afro",
  },
  {
    id: "gold-nights",
    title: "Gold Nights",
    artist: "KiDi+ Studio",
    url: goldNights.url,
    mood: "house",
  },
  {
    id: "soft-glow",
    title: "Soft Glow",
    artist: "KiDi+ Studio",
    url: softGlow.url,
    mood: "chill",
  },
  {
    id: "market-day",
    title: "Market Day",
    artist: "KiDi+ Studio",
    url: marketDay.url,
    mood: "pop",
  },
  {
    id: "slow-motion",
    title: "Slow Motion",
    artist: "KiDi+ Studio",
    url: slowMotion.url,
    mood: "cinematic",
  },
  {
    id: "runway",
    title: "Runway",
    artist: "KiDi+ Studio",
    url: runway.url,
    mood: "fashion",
  },
];

export const MAX_MUSIC_BYTES = 15 * 1024 * 1024;

export function isAudioFile(f: File) {
  return f.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(f.name);
}

export function defaultMusicFor(track: { url: string; title?: string; artist?: string }): VitrineMusic {
  return {
    url: track.url,
    title: track.title ?? null,
    artist: track.artist ?? null,
    startSec: 0,
    volume: 0.8,
    originalVolume: 0.2,
  };
}

/** Importe un fichier audio du téléphone dans le stockage Vitrine. */
export async function uploadMusicFile(
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isAudioFile(file)) return { ok: false, error: "bad_mime" };
  if (file.size > MAX_MUSIC_BYTES) return { ok: false, error: "file_too_large" };
  const { uploadVitrineMediaDetailed } = await import("@/lib/vitrine-db");
  return uploadVitrineMediaDetailed(file);
}

/** Lit les colonnes musique d'une ligne Supabase (posts / stories). */
export function musicFromRow(r: {
  music_url?: string | null;
  music_title?: string | null;
  music_artist?: string | null;
  music_start_sec?: number | string | null;
  music_volume?: number | string | null;
  original_volume?: number | string | null;
}): VitrineMusic | null {
  const hasOriginal = r?.original_volume != null && Number(r.original_volume) < 1;
  if (!r?.music_url && !hasOriginal) return null;
  return {
    url: r.music_url ?? "",
    title: r.music_title ?? null,
    artist: r.music_artist ?? null,
    startSec: Number(r.music_start_sec ?? 0) || 0,
    volume: clamp01(Number(r.music_volume ?? 0.8)),
    originalVolume: clamp01(Number(r.original_volume ?? 1)),
  };
}

/** Colonnes musique pour un insert Supabase. */
export function musicToRow(music?: VitrineMusic | null) {
  if (!music) return {};
  if (!music.url) return { original_volume: clamp01(music.originalVolume) };
  return {
    music_url: music.url,
    music_title: music.title,
    music_artist: music.artist,
    music_start_sec: Math.max(0, music.startSec || 0),
    music_volume: clamp01(music.volume),
    original_volume: clamp01(music.originalVolume),
  };
}

export const MUSIC_COLUMNS =
  "music_url, music_title, music_artist, music_start_sec, music_volume, original_volume";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
