// Renders one legal document (privacy / terms / community).
// Reused by the in-app PushScreen and by public web routes.

import { useTranslation } from "react-i18next";
import type { LegalDoc } from "@/lib/legal-content";
import { LEGAL_UPDATED_AT } from "@/lib/legal-content";

export function LegalDocView({ doc, kicker }: { doc: LegalDoc; kicker?: string }) {
  const { t, i18n } = useTranslation();
  const dateStr = new Date(LEGAL_UPDATED_AT).toLocaleDateString(i18n.language, {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <article className="mx-auto max-w-2xl px-5 py-5 text-foreground">
      {kicker && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</p>}
      <h1 className="text-[24px] font-bold leading-tight">{doc.title}</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">{t("legal.lastUpdated")}: {dateStr}</p>
      {doc.intro && <p className="mt-3 text-[14px] leading-relaxed text-foreground/90">{doc.intro}</p>}
      <div className="mt-5 space-y-5">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="mb-1.5 text-[16px] font-semibold">{s.h}</h2>
            <div className="space-y-1.5">
              {s.p.map((p, i) => (
                <p key={i} className="text-[13.5px] leading-relaxed text-foreground/90">{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
