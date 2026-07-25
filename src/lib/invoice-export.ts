// Capture the invoice ticket DOM as PNG / PDF and share it
// (WhatsApp, Messages, Files…) via the Web Share API when available.

import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

const CAPTURE_BG = "#F5F2EA";

export async function captureTicketPng(node: HTMLElement): Promise<Blob> {
  // Wait one frame so fonts / images settle before rasterising.
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
    // CORS-tainted remote images (product photo) — retry without them.
    dataUrl = await toPng(node, {
      ...opts,
      filter: (el) => !(el instanceof HTMLImageElement),
    });
  }

  const res = await fetch(dataUrl);
  return res.blob();
}

function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "image/png" });
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
    /* ignore */
  }
  // Older Safari: canShare missing but share({files}) often works.
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Share the ticket as a PNG image (ideal for WhatsApp).
 * Falls back to downloading the PNG when the OS cannot share files.
 */
export async function shareTicketImage(opts: {
  node: HTMLElement;
  filename: string;
  title: string;
  text?: string;
}): Promise<"shared" | "downloaded"> {
  const blob = await captureTicketPng(opts.node);
  const file = blobToFile(blob, opts.filename.endsWith(".png") ? opts.filename : `${opts.filename}.png`);

  if (await canShareFiles([file])) {
    try {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        files: [file],
      });
      return "shared";
    } catch (err) {
      // User cancelled the sheet — treat as success (no fallback toast).
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
      // Fall through to download.
    }
  }

  triggerDownload(blob, file.name);
  return "downloaded";
}

/**
 * Build a one-page PDF from the ticket PNG and share / download it.
 */
export async function shareTicketPdf(opts: {
  node: HTMLElement;
  filename: string;
  title: string;
  text?: string;
}): Promise<"shared" | "downloaded"> {
  const png = await captureTicketPng(opts.node);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(png);
  });

  // Measure natural pixel size from the data URL.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const pxW = img.naturalWidth || img.width;
  const pxH = img.naturalHeight || img.height;
  // Fit on A4 portrait with small margins (mm).
  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = pxW / pxH;
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

  const pdfBlob = pdf.output("blob");
  const filename = opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`;
  const file = blobToFile(pdfBlob, filename);

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
        return "shared";
      }
    }
  }

  triggerDownload(pdfBlob, filename);
  return "downloaded";
}
