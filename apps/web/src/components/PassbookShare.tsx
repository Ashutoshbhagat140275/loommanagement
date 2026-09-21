import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toSvg } from "html-to-image";

import { PassbookView, type Perspective } from "@/components/PassbookView.js";
import { Button } from "@/components/ui/button.js";
import type { Passbook } from "@/lib/passbook.js";
import { useSession } from "@/lib/session.js";

/** How many recent actions a shared statement shows; the rest is in the app. */
const STATEMENT_HISTORY = 12;

/** Give up rather than leave the button spinning forever. */
const CAPTURE_TIMEOUT_MS = 20_000;

/**
 * The element as a PNG, twice its size so it stays sharp on a phone screen.
 *
 * html-to-image draws the element as an SVG; turning that into a PNG is done
 * here rather than with its own toPng/toBlob, which never finished whenever
 * the page was not being painted. A plain image load and canvas do not have
 * that problem.
 */
async function renderPng(node: HTMLElement): Promise<Blob> {
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  const svg = await toSvg(node, { width, height, backgroundColor: "#f8fafc" });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not draw the passbook"));
    img.src = svg;
  });

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the passbook");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the passbook"))),
      "image/png",
    ),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Took too long")), ms),
    ),
  ]);
}

/**
 * A passbook to hand to someone: shared as a picture straight into WhatsApp,
 * or printed / saved as a PDF.
 *
 * The statement is drawn off screen and turned into an image by the browser's
 * own renderer, so Hindi and Marathi come out exactly as on screen. A PDF
 * library would need its own Devanagari font to do the same.
 */
export function PassbookShare({
  passbook,
  perspective,
}: {
  passbook: Passbook;
  perspective: Perspective;
}) {
  const { t, i18n } = useTranslation();
  const { data: user } = useSession();
  const statement = useRef<HTMLDivElement>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const title =
    perspective === "owner"
      ? t("passbook.title", { name: passbook.worker.name })
      : t("passbook.mine");
  const fileName = `passbook-${passbook.worker.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.png`;

  const shareImage = async () => {
    if (!statement.current) return;
    setWorking(true);
    setFailed(false);
    try {
      const blob = await withTimeout(renderPng(statement.current), CAPTURE_TIMEOUT_MS);
      const file = new File([blob], fileName, { type: "image/png" });

      // Phones: the system share sheet, so it goes straight to WhatsApp.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title });
        } catch (error) {
          // Closing the share sheet is not an error worth reporting.
          if ((error as { name?: string }).name !== "AbortError") throw error;
        }
        return;
      }

      // Computers: save the picture instead.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => void shareImage()} disabled={working}>
          {working ? t("common.loading") : t("passbook.shareImage")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          {t("passbook.savePdf")}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-red-600 print:hidden">
          {t("passbook.shareFailed")}
        </p>
      ) : null}

      {/*
        Off screen, but still laid out and painted, which the image capture
        needs. When printing it drops back into the page and is the only thing
        printed.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 -left-[10000px] print:pointer-events-auto print:static print:left-auto"
      >
        <div ref={statement} className="w-[440px] space-y-4 bg-slate-50 p-5 print:w-full">
          <header className="space-y-0.5">
            <p className="text-sm text-slate-500">{user?.factory?.name}</p>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-xs text-slate-400">
              {new Date().toLocaleDateString(i18n.resolvedLanguage, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </header>
          <PassbookView
            passbook={passbook}
            perspective={perspective}
            historyLimit={STATEMENT_HISTORY}
          />
        </div>
      </div>
    </>
  );
}
