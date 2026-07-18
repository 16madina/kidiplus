/** Stable LiveKit participant identity for the RTMP Ingress publisher. */
export function rtmpHostIdentity(sellerId: string): string {
  // Must match token identity charset: [a-zA-Z0-9_-]
  const safe = sellerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  return `rtmp-host-${safe || "seller"}`;
}
