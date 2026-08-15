import type { ReactNode } from "react";

/**
 * Cadre média 9:16 qui tient DANS le parent (jamais plus large que l'écran).
 * Sur un téléphone plus haut que 9:16, des bandes noires (et un fond flou) comblent le reste.
 */
export function Fit916({
  children,
  backdrop,
  className,
}: {
  children: ReactNode;
  backdrop?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-black [container-type:size] ${className ?? ""}`}
    >
      {backdrop}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div
          className="relative aspect-[9/16] h-auto max-h-full w-full max-w-full overflow-hidden"
          style={{
            width: "min(100%, calc(100cqh * 9 / 16))",
            height: "min(100%, calc(100cqw * 16 / 9))",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function MediaPreview916({
  src,
  isVideo,
  controls = true,
  className,
}: {
  src: string;
  isVideo: boolean;
  controls?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative mx-auto overflow-hidden rounded-2xl border border-border bg-black ${className ?? ""}`}
      style={{
        aspectRatio: "9 / 16",
        width: "min(100%, calc(70dvh * 9 / 16))",
        maxHeight: "min(70dvh, 100%)",
      }}
    >
      {!isVideo && (
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}
      {isVideo ? (
        <video
          key={src}
          src={src}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          controls={controls}
          autoPlay
          muted
          loop
          preload="auto"
        />
      ) : (
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}
