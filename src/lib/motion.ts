// Shared motion constants for the app.
// iOS-feel spring easing and durations. Micro-interactions 150-200ms,
// screen transitions 300ms, nothing longer than 400ms.

export const EASE_IOS = [0.32, 0.72, 0, 1] as const;

export const DURATION = {
  micro: 0.15,
  small: 0.2,
  screen: 0.3,
} as const;

export const pressTap = {
  scale: 0.97,
  opacity: 0.85,
  transition: { duration: 0.1, ease: EASE_IOS },
};

// Stagger children for list items: 30ms delay, fade + translateY 8px
export const listContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.03 },
  },
};
export const listItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.small, ease: EASE_IOS },
  },
};

// Push-from-right screen transition
export const pushScreen = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: { duration: DURATION.screen, ease: EASE_IOS },
};

// Underneath screen slight parallax (-25%)
export const parallaxUnder = {
  initial: { x: 0 },
  animate: { x: "-25%" },
  exit: { x: 0 },
  transition: { duration: DURATION.screen, ease: EASE_IOS },
};
