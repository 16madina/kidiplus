// Capture the invoice ticket DOM as PNG / PDF.
// - Share image → OS native share sheet (WhatsApp, Messages…)
// - Download PDF → save picker when available, else download / "Save to Files"

import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

const CAPTURE_BG = "#F5F2EA";

export async function captureTicketPng(node: HTMLElement): Promise<Blob> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const opts = {
    cacheBust: true,
    pixelRatio: Math.min(window.devicePixelRatio || 2, 3),
    backgroundColor: CAPTURE_BG,
  };

  let dataUrl: string;
  try {
    dataUrl = await toPng(node, opts);
  } catch {
    dataUrl = await toPng(node, {
      ...opts,
      filter: (el) => !(el instanceof HTMLImageElement),
    });
  }

  const res = await fetch(dataUrl);
  return res.blob();
}

function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function canShareFiles(files: File[]): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  try {
    if (typeof navigator.canShare === "function") {
      return navigator.canShare({ files });
    }
  } catch {
    return false;
  }
  return true;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

async function buildPdfBlob(node: HTMLElement): Promise<Blob> {
  const png = await captureTicketPng(node);
  const dataUrl = await blobToDataUrl(png);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const pxW = img.naturalWidth || img.width;
  const pxH = img.naturalHeight || img.height;
  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = pxW / Math.max(pxH, 1);
  let drawW = maxW;
  let drawH = drawW / ratio;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = drawH * ratio;
  }
  const x = (pageW - drawW) / 2;
  const y = margin;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setFillColor(245, 242, 234);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.addImage(dataUrl, "PNG", x, y, drawW, drawH, undefined, "FAST");
  return pdf.output("blob");
}

/**
 * Open the native share sheet with the ticket as a PNG (WhatsApp, etc.).
 */
export async function shareTicketImage(opts: {
  node: HTMLElement;
  filename: string;
  title: string;
  text?: string;
}): Promise<"shared" | "cancelled"> {
  const blob = await captureTicketPng(opts.node);
  const filename = opts.filename.endsWith(".png") ? opts.filename : `${opts.filename}.png`;
  const file = blobToFile(new Blob([blob], { type: "image/png" }), filename);

  // 1) Web Share API with file — best path on iOS/Android (incl. many Cap WebViews).
  if (await canShareFiles([file])) {
    try {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        files: [file],
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      // fall through
    }
  }

  // 2) Capacitor Share (text + title). File URIs need Filesystem; still opens
  //    the native sheet so the user can pick WhatsApp with the caption.
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: opts.title,
        text: opts.text ?? opts.title,
        dialogTitle: opts.title,
      });
      // Also offer the image via a temporary download so it lands in Photos/Files.
      triggerDownload(blob, filename);
      return "shared";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return "cancelled";
    }
  }

  // 3) Last resort: Web Share text-only, then download the PNG.
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: opts.title, text: opts.text });
      triggerDownload(blob, filename);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  triggerDownload(blob, filename);
  return "shared";
}

/**
 * Save the ticket as a PDF — asks where to save when the OS supports it
 * (Chrome/Edge file picker; iOS share sheet → "Save to Files").
 */
export async function downloadTicketPdf(opts: {
  node: HTMLElement;
  filename: string;
  title: string;
}): Promise<"saved" | "cancelled"> {
  const pdfBlob = await buildPdfBlob(opts.node);
  const filename = opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`;
  const file = blobToFile(new Blob([pdfBlob], { type: "application/pdf" }), filename);

  // Chromium: real "Save as…" dialog.
  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "PDF",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      return "saved";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      // fall through
    }
  }

  // iOS / Android: share sheet → user picks "Save to Files" / Drive / etc.
  if (await canShareFiles([file])) {
    try {
      await navigator.share({
        title: opts.title,
        files: [file],
      });
      return "saved";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  // Desktop Safari / fallback: browser download to default folder.
  triggerDownload(pdfBlob, filename);
  return "saved";
}
