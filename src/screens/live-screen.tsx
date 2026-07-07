import { AnimatePresence } from "framer-motion";
import { BroadcastProvider, useBroadcast } from "@/lib/broadcast-context";
import { BroadcastSetup } from "@/components/broadcast/broadcast-setup";
import { BroadcastLive } from "@/components/broadcast/broadcast-live";
import { BroadcastSummary } from "@/components/broadcast/broadcast-summary";

export function LiveScreen() {
  return (
    <BroadcastProvider>
      <BroadcastFlow />
    </BroadcastProvider>
  );
}

function BroadcastFlow() {
  const { stage, goSetup, goSummary, reset } = useBroadcast();
  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence mode="wait">
        {stage === "setup" && (
          <BroadcastSetup key="setup" onExit={() => reset()} />
        )}
        {stage === "live" && (
          <BroadcastLive key="live" onEnd={() => goSummary()} />
        )}
        {stage === "summary" && (
          <BroadcastSummary key="summary" onDone={() => goSetup()} />
        )}
      </AnimatePresence>
    </div>
  );
}
