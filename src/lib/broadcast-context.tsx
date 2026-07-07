import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type BroadcastStage = "setup" | "live" | "summary";
export type SellMode = "auction" | "fixed";

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
  goSetup: () => void;
  goLive: () => void;
  goSummary: () => void;

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
  const [stage, setStage] = useState<BroadcastStage>("setup");
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

  const addProduct = useCallback((p: Omit<BProduct, "id">) => {
    setProducts((prev) => [
      ...prev,
      { ...p, id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    ]);
  }, []);
  const removeProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);
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
    setStage("setup");
    setTitle("");
    setCategory("Fashion");
    setCover(null);
    setCoverFile(null);
    setProducts([]);
    setSession(emptySession());
    setRoomName(null);
    setLiveId(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      stage,
      goSetup: () => setStage("setup"),
      goLive: () => setStage("live"),
      goSummary: () => setStage("summary"),
      title, setTitle,
      category, setCategory,
      cover, setCover,
      coverFile, setCoverFile,
      products, addProduct, removeProduct, setProductDbIds,
      session, setSession,
      roomName, setRoomName,
      liveId, setLiveId,
      hostIdentity, hostName, setHost,
      reset,
    }),
    [stage, title, category, cover, coverFile, products, session, roomName, liveId, hostIdentity, hostName, setHost, addProduct, removeProduct, setProductDbIds, reset],
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
