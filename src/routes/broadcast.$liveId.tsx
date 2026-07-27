import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BroadcastComposition } from "@/components/broadcast/broadcast-composition";

type SessionOk = {
  token: string;
  url: string;
  identity: string;
  roomName: string;
  title: string | null;
  coverUrl: string | null;
  currency: string | null;
  hostName: string;
};

export const Route = createFileRoute("/broadcast/$liveId")({
  validateSearch: (search: Record<string, unknown>): { k?: string } => ({
    k: typeof search.k === "string" ? search.k : undefined,
  }),
  head: () => ({
    meta: [
      { title: "KiDi+ Broadcast" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BroadcastEgressPage,
});

function BroadcastEgressPage() {
  const { liveId } = Route.useParams();
  const { k: ticket } = Route.useSearch();
  const [session, setSession] = useState<SessionOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticket) {
      setError("missing_ticket");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/broadcast-egress-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket, liveId }),
        });
        const body = (await res.json().catch(() => ({}))) as SessionOk & {
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.token || !body.url) {
          setError(body.error || `http_${res.status}`);
          return;
        }
        setSession({
          token: body.token,
          url: body.url,
          identity: body.identity,
          roomName: body.roomName,
          title: body.title ?? null,
          coverUrl: body.coverUrl ?? null,
          currency: body.currency ?? null,
          hostName: body.hostName || "Host",
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "fetch_failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket, liveId]);

  if (error) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-black px-6 text-center text-white">
        <div>
          <p className="text-[15px] font-semibold">Broadcast unavailable</p>
          <p className="mt-1 text-[12px] text-white/60">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-black text-white/70">
        <p className="text-[13px] font-semibold">Loading KiDi+ broadcast…</p>
      </div>
    );
  }

  return (
    <BroadcastComposition
      liveId={liveId}
      roomName={session.roomName}
      livekitUrl={session.url}
      livekitToken={session.token}
      identity={session.identity}
      hostName={session.hostName}
      title={session.title}
      coverUrl={session.coverUrl}
      currency={session.currency}
    />
  );
}
