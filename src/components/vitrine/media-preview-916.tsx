/**
 * Cadre média standard 9:16 : le média remplit le cadre (cover) et un fond
 * flou comble les éventuelles bandes — rendu identique iOS / Android.
 */
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
      className={`relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-black ${className ?? ""}`}
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
