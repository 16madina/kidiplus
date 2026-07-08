import { useEffect, useRef, useState } from "react";
import { Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { PushScreen } from "@/components/push-screen";
import { AuthInput } from "@/components/auth/auth-shell";
import { useAuth, frenchAuthError, type Profile } from "@/lib/auth-context";
import { useWallet } from "@/lib/wallet-context";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl, invalidateAvatar, bustAvatarCache } from "@/lib/avatar-url";
import { haptic } from "@/lib/haptics";

const COUNTRIES = [
  "🇫🇷 France",
  "🇧🇪 Belgique",
  "🇨🇭 Suisse",
  "🇨🇦 Canada",
  "🇨🇮 Côte d'Ivoire",
  "🇸🇳 Sénégal",
  "🇲🇦 Maroc",
  "🇩🇿 Algérie",
  "🇹🇳 Tunisie",
  "🇨🇲 Cameroun",
  "🇨🇩 RD Congo",
  "🇬🇦 Gabon",
  "🇲🇱 Mali",
  "🇧🇫 Burkina Faso",
  "🌍 Autre",
];

export function EditProfileScreen({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, updateProfile, refreshProfile, user } = useAuth();
  const { refresh: refreshWallet } = useWallet();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !profile) return;
    setDisplayName(profile.display_name ?? "");
    setHandle(profile.handle ?? "");
    setBio(profile.bio ?? "");
    setCountry(profile.country ?? "");
    void resolveAvatarUrl(profile.avatar_url).then((url) => {
      setAvatarUrl(bustAvatarCache(url, profile.avatar_url));
    });
    setError(null);
  }, [open, profile]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    };
  }, []);

  const validate = (): string | null => {
    if (!displayName.trim() || displayName.trim().length < 2)
      return "Le nom doit contenir au moins 2 caractères.";
    if (!/^[a-z0-9_.]{2,30}$/.test(handle.trim()))
      return "Le handle doit contenir 2 à 30 caractères (lettres minuscules, chiffres, _ ou .).";
    return null;
  };

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Merci de choisir une image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop lourde (max 5 Mo).");
      return;
    }
    setUploading(true);
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    const localPreview = URL.createObjectURL(file);
    previewObjectUrl.current = localPreview;
    setAvatarUrl(localPreview);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      console.log("[avatar] uploading", { path, size: file.size, type: file.type });
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        console.error("[avatar] upload error", upErr);
        throw upErr;
      }
      // Persist path in profile so it survives refreshes.
      const oldPath = profile?.avatar_url;
      const updated = await updateProfile({ avatar_url: path });
      console.log("[avatar] profile updated", { avatar_url: updated.avatar_url });
      invalidateAvatar(oldPath);
      invalidateAvatar(path);
      const signed = await resolveAvatarUrl(path);
      setAvatarUrl(bustAvatarCache(signed, path));
      await refreshProfile();
      toast.success("Photo mise à jour");
      haptic.success();
    } catch (err) {
      console.error("[avatar] failed", err);
      haptic.error();
      const msg = err instanceof Error ? err.message : frenchAuthError(err);
      toast.error(msg || "Échec de l'envoi de la photo");
    } finally {
      setUploading(false);
    }
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    try {
      const { currencyForCountry } = await import("@/lib/money");
      const patch: Partial<Profile> = {
        display_name: displayName.trim(),
        handle: handle.trim(),
        bio: bio.trim() || null,
        country: country || null,
      };
      // If the country changed, suggest the matching currency (only when the
      // wallet balance is 0 — DB trigger will reject otherwise, silently ok).
      if (country && country !== (profile?.country ?? "")) {
        patch.currency = currencyForCountry(country);
      }
      await updateProfile(patch);
      await refreshProfile();
      // The DB trigger sync_currency_on_profile_change syncs wallet +
      // seller_balances when balance is 0; refresh so the UI (pill,
      // top-up presets) picks up the new currency immediately.
      await refreshWallet();
      haptic.success();
      toast.success("Profil mis à jour");
      onClose();
    } catch (err) {
      haptic.error();
      const msg = frenchAuthError(err);
      setError(
        msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")
          ? "Ce handle est déjà pris."
          : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <PushScreen open={open} onClose={onClose} title="Modifier le profil" zIndex={70}>
      <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-5">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onPickFile}
            className="relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-border"
            aria-label="Changer la photo"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center bg-muted text-[28px] font-bold text-muted-foreground">
                {(displayName || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <span
              className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-[11px] font-semibold text-white"
            >
              {uploading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Camera size={12} />
              )}
              {uploading ? "Envoi…" : "Modifier"}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        <AuthInput
          label="Nom affiché"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
        />
        <AuthInput
          label="Handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          maxLength={30}
          placeholder="ton_handle"
        />

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Bio
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            placeholder="Parle un peu de toi…"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-[15px] outline-none focus:border-foreground/40"
          />
          <span className="mt-1 block text-right text-[11px] text-muted-foreground">
            {bio.length}/160
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pays
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 text-[15px] outline-none focus:border-foreground/40"
            style={{ height: 48 }}
          >
            <option value="">Choisir…</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <div className="rounded-xl bg-[oklch(0.95_0.05_20)] px-3 py-2 text-[13px] font-medium text-[oklch(0.45_0.2_25)]">
            {error}
          </div>
        )}

        <Press
          type="submit"
          disabled={saving || uploading}
          className="!min-h-12 mt-2 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Enregistrement…
            </span>
          ) : (
            "Enregistrer"
          )}
        </Press>
      </form>
    </PushScreen>
  );
}
