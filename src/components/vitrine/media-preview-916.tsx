/**
 * Aperçu média au cadrage identique à la Vitrine : conteneur 9:16,
 * média en object-contain, fond flou plein cadre pour les images.
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
      <div className="absolute inset-0 grid place-items-center">
        {isVideo ? (
          <video
            key={src}
            src={src}
            className="h-full w-full object-contain"
            playsInline
            controls={controls}
            autoPlay
            muted
            preload="auto"
          />
        ) : (
          <img src={src} alt="" className="h-full w-full object-contain" />
        )}
      </div>
    </div>
  );
}
