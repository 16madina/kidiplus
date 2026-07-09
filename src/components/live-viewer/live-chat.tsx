import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ChatMsg } from "@/lib/live-viewer-mock";
import { Press } from "@/components/press";

// Windowing cap for the rendered chat — even if the parent buffers more,
// we only ever render the last N to keep the DOM/React reconciler cheap
// under 1k+ concurrent viewers with heavy chat throughput.
const VISIBLE_MSGS = 120;


export function LiveChat({ messages }: { messages: ChatMsg[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showJump, setShowJump] = useState(false);

  // Track if user scrolled away from bottom
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      const isPinned = distFromBottom < 24;
      setPinned(isPinned);
      setShowJump(!isPinned);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll when new message arrives and user is pinned
  useEffect(() => {
    if (!pinned) return;
    const el = scrollerRef.current;
    if (!el) return;
    // next tick so incoming item is measured
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [messages, pinned]);

  const jumpDown = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinned(true);
    setShowJump(false);
  };

  const maskStyle = useMemo(
    () => ({
      maskImage:
        "linear-gradient(to bottom, transparent 0%, black 40px, black 100%)",
      WebkitMaskImage:
        "linear-gradient(to bottom, transparent 0%, black 40px, black 100%)",
    }),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-start px-3">
      <div
        className="pointer-events-auto flex w-[85%] max-w-[420px] flex-col"
        style={{ height: "40dvh" }}
      >
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto pb-2"
          style={{
            ...maskStyle,
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div className="flex flex-col justify-end gap-1.5 pt-8">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.15,
                    ease: [0.32, 0.72, 0, 1],
                    layout: { duration: 0.2, ease: [0.32, 0.72, 0, 1] },
                  }}
                >
                  <ChatBubble msg={m} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {showJump && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto mb-1 self-start"
            >
              <Press
                onClick={jumpDown}
                className="!min-h-8 rounded-full px-3 text-xs font-semibold text-white"
                style={{
                  backgroundColor: "rgba(0,0,0,0.55)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                Nouveaux messages
                <ChevronDown size={14} className="ml-1" />
              </Press>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMsg }) {
  if (msg.system) {
    return (
      <div
        className="self-start rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
        style={{
          backgroundColor: "rgba(255,255,255,0.14)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}
      >
        {msg.text}
      </div>
    );
  }
  return (
    <div
      className="flex max-w-full items-start gap-1.5"
      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
    >
      <div
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: msg.color }}
      >
        {msg.user.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 text-[13px] leading-snug">
        <span className="font-semibold" style={{ color: msg.color }}>
          {msg.user}
        </span>{" "}
        <span className="text-white">{msg.text}</span>
      </div>
    </div>
  );
}
