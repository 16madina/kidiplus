// Client helpers for Facebook OAuth + Page select + restream.

import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/native";

export type FacebookStatus = {
  connected: boolean;
  needsPageSelection: boolean;
  pageName?: string | null;
  pageId?: string | null;
};

export type FacebookPageOption = { id: string; name: string };

export type FacebookRestreamStart = {
  egressId: string;
  liveVideoId: string;
  watchUrl: string;
  pageName?: string | null;
};

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchFacebookStatus(): Promise<FacebookStatus> {
  const res = await fetch("/api/facebook/status", {
    method: "GET",
    headers: await authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    connected?: boolean;
    needsPageSelection?: boolean;
    pageName?: string | null;
    pageId?: string | null;
  };
  if (!res.ok) {
    throw new Error(body.error || `Facebook status failed (${res.status})`);
  }
  return {
    connected: !!body.connected,
    needsPageSelection: !!body.needsPageSelection,
    pageName: body.pageName,
    pageId: body.pageId,
  };
}

export async function connectFacebook(returnPath = "/"): Promise<void> {
  const res = await fetch("/api/facebook/oauth/start", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      native: isNative(),
      returnPath,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    url?: string;
  };
  if (!res.ok || !body.url) {
    throw new Error(body.message || body.error || `OAuth start failed (${res.status})`);
  }

  if (isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({
      url: body.url,
      windowName: "_self",
      presentationStyle: "popover",
    });
    return;
  }

  window.location.assign(body.url);
}

export async function disconnectFacebook(): Promise<void> {
  const res = await fetch("/api/facebook/disconnect", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Disconnect failed (${res.status})`);
  }
}

export async function fetchFacebookPages(): Promise<{
  pages: FacebookPageOption[];
  selectedPageId: string | null;
}> {
  const res = await fetch("/api/facebook/pages", {
    method: "GET",
    headers: await authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    pages?: FacebookPageOption[];
    selectedPageId?: string | null;
  };
  if (!res.ok) {
    throw new Error(body.error || `Pages failed (${res.status})`);
  }
  return {
    pages: body.pages ?? [],
    selectedPageId: body.selectedPageId ?? null,
  };
}

export async function selectFacebookPage(pageId: string): Promise<{
  pageId: string;
  pageName: string;
}> {
  const res = await fetch("/api/facebook/pages", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ pageId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    pageId?: string;
    pageName?: string;
  };
  if (!res.ok || !body.pageId || !body.pageName) {
    throw new Error(body.error || `Select page failed (${res.status})`);
  }
  return { pageId: body.pageId, pageName: body.pageName };
}

export async function startFacebookRestream(
  liveId: string,
): Promise<FacebookRestreamStart> {
  const res = await fetch("/api/facebook/restream", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "start", liveId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    egressId?: string;
    liveVideoId?: string;
    watchUrl?: string;
    pageName?: string | null;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Restream start failed (${res.status})`);
  }
  if (!body.egressId || !body.liveVideoId || !body.watchUrl) {
    throw new Error("Restream response incomplete");
  }
  return {
    egressId: body.egressId,
    liveVideoId: body.liveVideoId,
    watchUrl: body.watchUrl,
    pageName: body.pageName,
  };
}

export async function stopFacebookRestream(liveId: string): Promise<void> {
  const res = await fetch("/api/facebook/restream", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "stop", liveId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(body.message || body.error || `Restream stop failed (${res.status})`);
  }
}
