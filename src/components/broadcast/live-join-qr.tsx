import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { liveShareUrl } from "@/lib/deep-links";

/** Compact QR pointing at the public KiDi+ live Universal Link. */
export function LiveJoinQr({
  liveId,
  size = 72,
  className,
}: {
  liveId: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = liveShareUrl(liveId);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#10162B", light: "#FFFFFF" },
    })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!dataUrl) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: "rgba(255,255,255,0.9)",
          borderRadius: 8,
        }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR KiDi+"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: "#fff",
      }}
    />
  );
}
