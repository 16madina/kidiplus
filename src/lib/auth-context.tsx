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
import { sendWelcomeEmailOnce } from "@/lib/email/send-welcome";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  is_seller: boolean;
  is_admin: boolean;
  country: string | null;
  currency: "XOF" | "EUR" | "CAD";
  language: "fr" | "en";
  moderation_status?: "active" | "suspended" | "banned";
  followers_count?: number;
  following_count?: number;
  rating_avg?: number;
  rating_count?: number;
  is_verified?: boolean;
  welcome_email_sent?: boolean;
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
    const next = (data as Profile | null) ?? null;
    setProfile(next);
    if (next?.email && !next.welcome_email_sent) {
      void sendWelcomeEmailOnce({
        userId: next.id,
        email: next.email,
        displayName: next.display_name,
        alreadySent: false,
      });
    }
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

// i18n-aware Supabase auth error translator. `frenchAuthError` is kept as
// a name for backwards compatibility but pulls its strings from i18n so it
// respects the currently selected language.
import i18nInstance from "@/i18n";

export function frenchAuthError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : i18nInstance.t("auth.errors.generic");
  const m = raw.toLowerCase();
  const T = (k: string) => i18nInstance.t(k);
  if (m.includes("invalid login")) return T("auth.errors.invalidCredentials");
  if (m.includes("email not confirmed")) return T("auth.errors.emailNotConfirmed");
  if (m.includes("already registered") || m.includes("already been registered"))
    return T("auth.errors.alreadyRegistered");
  if (m.includes("user already registered")) return T("auth.errors.alreadyRegistered");
  if (m.includes("password should be at least"))
    return T("auth.errors.passwordShort");
  if (m.includes("password") && m.includes("pwned"))
    return T("auth.errors.passwordPwned");
  if (m.includes("weak password")) return T("auth.errors.passwordWeak");
  if (m.includes("rate limit")) return T("auth.errors.rateLimit");
  if (m.includes("unable to validate email")) return T("auth.errors.invalidEmail");
  if (m.includes("network")) return T("auth.errors.network");
  return raw;
}
