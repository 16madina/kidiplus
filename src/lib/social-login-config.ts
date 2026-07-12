// Social login feature flags.
//
// Flip SHOW_APPLE_LOGIN to `true` once the Apple provider is fully
// configured in Lovable Cloud (Users → Authentication Settings → Sign In
// Methods → Apple) and you have submitted a client secret JWT. Until
// then, keep it false to avoid presenting an Apple button that fails
// with "Unsupported provider" — Apple review reject risk.
export const SHOW_APPLE_LOGIN = false;

// Custom URL scheme registered by the native app (Info.plist
// CFBundleURLTypes on iOS, AndroidManifest intent-filter on Android).
// Used as the OAuth `redirectTo` when running inside Capacitor so the
// system browser can hand the tokens back to the app.
export const NATIVE_OAUTH_SCHEME = "kidiplus";
export const NATIVE_OAUTH_REDIRECT = `${NATIVE_OAUTH_SCHEME}://auth-callback`;
