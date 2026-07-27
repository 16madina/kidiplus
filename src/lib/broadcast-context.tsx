import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProductCondition } from "@/lib/live-product-options";

export type BroadcastStage = "entry" | "setup" | "live" | "summary";
export type BroadcastMode = "now" | "schedule" | "edit";
/** How the host video is produced: phone camera vs Restream/OBS RTMP. */
export type StreamSource = "camera" | "rtmp";

export type SellMode = "auction" | "fixed";

export type RtmpCreds = {
  url: string;
  streamKey: string;
  ingressId: string;
  participantIdentity: string;
};

export type { ProductCondition };

export type BProduct = {
  id: string;
  name: string;
  image: string;
  /** Local File for images picked from disk (uploaded on live launch). */
  imageFile?: File;
  mode: SellMode;
  // auction
  startPrice: number;
  timerSec: number;
  // fixed
  price: number;
  stock: number;
  /** DB id (public.live_products.id) once the live has been created. */
  dbId?: string;
  /** Optional link back to the seller's shop_products row (traceability + stock sync). */
  shopProductId?: string;
  /** Optional short description (shown to viewers). */
  description?: string;
  /** Optional auction bid step override. */
  bidIncrement?: number | null;
  brand?: string;
  condition?: ProductCondition | null;
  colors?: string[];
  sizes?: string[];
  /** Extra image preview URLs (slots 1–2). Cover is `image`. */
  extraImages?: string[];
  /** Local files for extra slots (aligned with `extraImages`; null = URL-only). */
  extraImageFiles?: (File | null)[];
};


export type Sale = {
  id: string;
  productId: string;
  productName: string;
  buyer: string;
  price: number;
};

export type BroadcastSession = {
  title: string;
  category: string;
  cover: string | null;
  durationSec: number;
  peakViewers: number;
  sales: Sale[];
};

type Ctx = {
  stage: BroadcastStage;
  goEntry: () => void;
  goSetup: () => void;
  goLive: () => void;
  goSummary: () => void;

  mode: BroadcastMode;
  setMode: (m: BroadcastMode) => void;
  scheduledAt: string | null; // ISO
  setScheduledAt: (v: string | null) => void;
  editingLiveId: string | null;
  setEditingLiveId: (v: string | null) => void;

  // setup form
  title: string;
  setTitle: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  cover: string | null;
  setCover: (v: string | null) => void;
  coverFile: File | null;
  setCoverFile: (f: File | null) => void;
  products: BProduct[];
  addProduct: (p: Omit<BProduct, "id">) => void;
  removeProduct: (id: string) => void;
  clearProducts: () => void;
  setProductDbIds: (ids: string[]) => void;

  // session (readonly-ish accessors are fine)
  session: BroadcastSession;
  setSession: (s: BroadcastSession) => void;
  roomName: string | null;
  setRoomName: (v: string | null) => void;

  // DB id for the current live row (populated on launch).
  liveId: string | null;
  setLiveId: (v: string | null) => void;

  // Host identity for LiveKit (populated from the signed-in profile).
  hostIdentity: string | null;
  hostName: string;
  setHost: (identity: string, name: string) => void;

  /** Seller's currency (mirrors profile.currency). One live = one currency. */
  currency: "XOF" | "EUR" | "CAD" | "USD" | "GBP";
  setCurrency: (c: "XOF" | "EUR" | "CAD" | "USD" | "GBP") => void;

  /** Host camera facing — shared from setup → live so flip choice persists. */
  cameraFacing: "user" | "environment";
  setCameraFacing: (f: "user" | "environment") => void;

  /** Allow viewers to send virtual gifts during the live. */
  allowGifts: boolean;
  setAllowGifts: (v: boolean) => void;

  /** camera (default) or rtmp multi-platform via Restream/OBS. */
  streamSource: StreamSource;
  setStreamSource: (s: StreamSource) => void;
  rtmpCreds: RtmpCreds | null;
  setRtmpCreds: (c: RtmpCreds | null) => void;

  reset: () => void;
};





const BroadcastContext = createContext<Ctx | null>(null);

const emptySession = (): BroadcastSession => ({
  title: "",
  category: "Fashion",
  cover: null,
  durationSec: 0,
  peakViewers: 0,
  sales: [],
});

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<BroadcastStage>("entry");
  const [mode, setMode] = useState<BroadcastMode>("now");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [editingLiveId, setEditingLiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Fashion");
  const [cover, setCover] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [products, setProducts] = useState<BProduct[]>([]);
  const [session, setSession] = useState<BroadcastSession>(emptySession());
  const [roomName, setRoomName] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [hostIdentity, setHostIdentity] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string>("Host");
  const [currency, setCurrency] = useState<"XOF" | "EUR" | "CAD" | "USD" | "GBP">("EUR");
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [allowGifts, setAllowGifts] = useState<boolean>(true);
  const [streamSource, setStreamSource] = useState<StreamSource>("camera");
  const [rtmpCreds, setRtmpCreds] = useState<RtmpCreds | null>(null);


  const addProduct = useCallback((p: Omit<BProduct, "id">) => {
    setProducts((prev) => [
      ...prev,
      { ...p, id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    ]);
  }, []);
  const removeProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const clearProducts = useCallback(() => setProducts([]), []);
  const setProductDbIds = useCallback((ids: string[]) => {
    setProducts((prev) =>
      prev.map((p, i) => (ids[i] ? { ...p, dbId: ids[i] } : p)),
    );
  }, []);

  const setHost = useCallback((identity: string, name: string) => {
    setHostIdentity(identity);
    setHostName(name || "Host");
  }, []);

  const reset = useCallback(() => {
    setStage("entry");
    setMode("now");
    setScheduledAt(null);
    setEditingLiveId(null);
    setTitle("");
    setCategory("Fashion");
    setCover(null);
    setCoverFile(null);
    setProducts([]);
    setSession(emptySession());
    setRoomName(null);
    setLiveId(null);
    setCameraFacing("user");
    setAllowGifts(true);
    setStreamSource("camera");
    setRtmpCreds(null);
  }, []);


  const value = useMemo<Ctx>(
    () => ({
      stage,
      goEntry: () => setStage("entry"),
      goSetup: () => setStage("setup"),
      goLive: () => setStage("live"),
      goSummary: () => setStage("summary"),
      mode, setMode,
      scheduledAt, setScheduledAt,
      editingLiveId, setEditingLiveId,
      title, setTitle,
      category, setCategory,
      cover, setCover,
      coverFile, setCoverFile,
      products, addProduct, removeProduct, clearProducts, setProductDbIds,
      session, setSession,
      roomName, setRoomName,
      liveId, setLiveId,
      hostIdentity, hostName, setHost,
      currency, setCurrency,
      cameraFacing, setCameraFacing,
      allowGifts, setAllowGifts,
      streamSource, setStreamSource,
      rtmpCreds, setRtmpCreds,
      reset,
    }),
    [stage, mode, scheduledAt, editingLiveId, title, category, cover, coverFile, products, session, roomName, liveId, hostIdentity, hostName, setHost, currency, cameraFacing, allowGifts, streamSource, rtmpCreds, addProduct, removeProduct, clearProducts, setProductDbIds, reset],

  );




  return (
    <BroadcastContext.Provider value={value}>
      {children}
    </BroadcastContext.Provider>
  );
}

export function useBroadcast() {
  const ctx = useContext(BroadcastContext);
  if (!ctx) throw new Error("useBroadcast must be used within BroadcastProvider");
  return ctx;
}

/** Safe outside BroadcastProvider (e.g. moderator dock on the viewer screen). */
export function useOptionalBroadcast() {
  return useContext(BroadcastContext);
}
