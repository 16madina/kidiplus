import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_seller: boolean;
  country: string | null;
  language: "fr" | "en";
  created_at: string;
};

type AuthCtx = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  signUp: (args: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<Profile>;
  becomeSeller: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFetchToken = useRef(0);

  const fetchProfile = useCallback(async (userId: string) => {
    const token = ++profileFetchToken.current;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (token !== profileFetchToken.current) return;
    if (error) {
      console.error("[auth] fetchProfile", error);
      setProfile(null);
      return;
    }
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    // 1) Register listener first so no event is missed.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer to avoid deadlocks per Supabase guidance.
        setTimeout(() => void fetchProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });
    // 2) Hydrate current session.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void fetchProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [fetchProfile]);

  const signUp = useCallback<AuthCtx["signUp"]>(
    async ({ email, password, displayName }) => {
      const redirectTo =
        typeof window !== "undefined" ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { display_name: displayName },
        },
      });
      if (error) throw error;
      const needsEmailConfirmation = !data.session;
      return { needsEmailConfirmation };
    },
    [],
  );

  const signIn = useCallback<AuthCtx["signIn"]>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback<AuthCtx["signOut"]>(async () => {
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback<AuthCtx["sendPasswordReset"]>(
    async (email) => {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
    },
    [],
  );

  const updatePassword = useCallback<AuthCtx["updatePassword"]>(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const updateProfile = useCallback<AuthCtx["updateProfile"]>(
    async (patch) => {
      if (!session?.user) throw new Error("Non connecté");
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", session.user.id)
        .select("*")
        .single();
      if (error) throw error;
      const next = data as Profile;
      setProfile(next);
      return next;
    },
    [session],
  );

  const becomeSeller = useCallback<AuthCtx["becomeSeller"]>(async () => {
    await updateProfile({ is_seller: true });
  }, [updateProfile]);

  const value = useMemo<AuthCtx>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshProfile,
      updateProfile,
      becomeSeller,
    }),
    [
      loading,
      session,
      profile,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshProfile,
      updateProfile,
      becomeSeller,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// French translation of common Supabase auth error messages.
export function frenchAuthError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Une erreur est survenue.";
  const m = raw.toLowerCase();
  if (m.includes("invalid login")) return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed"))
    return "Ton email n'est pas encore confirmé.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Cet email est déjà utilisé.";
  if (m.includes("user already registered")) return "Cet email est déjà utilisé.";
  if (m.includes("password should be at least"))
    return "Le mot de passe doit contenir au moins 6 caractères.";
  if (m.includes("password") && m.includes("pwned"))
    return "Ce mot de passe a été compromis. Choisis-en un autre.";
  if (m.includes("weak password"))
    return "Mot de passe trop faible. Utilise au moins 8 caractères mêlant lettres, chiffres et symboles.";
  if (m.includes("rate limit")) return "Trop de tentatives. Réessaie dans un instant.";
  if (m.includes("unable to validate email"))
    return "Adresse email invalide.";
  if (m.includes("network")) return "Connexion internet instable. Réessaie.";
  return raw;
}
