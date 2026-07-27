/** Build a single RTMP(S) URL from TikTok LIVE Studio server + stream key. */

export function buildTiktokRtmpUrl(opts: {
  serverUrl?: string | null;
  streamKey?: string | null;
  /** Full URL already including the key (optional alternative). */
  fullUrl?: string | null;
}): { ok: true; rtmpUrl: string } | { ok: false; error: string } {
  const full = (opts.fullUrl ?? "").trim();
  if (full) {
    if (!/^rtmps?:\/\//i.test(full)) {
      return {
        ok: false,
        error: "L’URL doit commencer par rtmp:// ou rtmps://",
      };
    }
    return { ok: true, rtmpUrl: full };
  }

  const server = (opts.serverUrl ?? "").trim().replace(/\/+$/, "");
  const key = (opts.streamKey ?? "").trim().replace(/^\/+/, "");
  if (!server || !key) {
    return {
      ok: false,
      error: "Indique le serveur RTMP et la clé de stream TikTok.",
    };
  }
  if (!/^rtmps?:\/\//i.test(server)) {
    return {
      ok: false,
      error: "Le serveur doit commencer par rtmp:// ou rtmps://",
    };
  }
  // Avoid double-appending if the host already pasted server/key together.
  if (server.endsWith(key) || server.includes(`/${key}`)) {
    return { ok: true, rtmpUrl: server };
  }
  return { ok: true, rtmpUrl: `${server}/${key}` };
}
