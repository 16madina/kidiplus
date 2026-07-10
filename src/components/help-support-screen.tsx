// HelpSupportScreen — simple FAQ + contact channels.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Mail, MessageCircle, FileText, ShieldAlert } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";

const SUPPORT_EMAIL = "support@kidiplus.com";

type FaqItem = { q: string; a: string };

const FAQ_FR: FaqItem[] = [
  { q: "Comment devenir vendeur ?", a: "Rends-toi dans ton profil, puis touche « Devenir vendeur ». Tu pourras ensuite créer ta boutique et lancer des lives." },
  { q: "Comment recharger mon portefeuille ?", a: "Ouvre l'onglet Portefeuille depuis ton profil et choisis un montant. Les paiements sont sécurisés par Stripe." },
  { q: "Quand suis-je payé pour mes ventes ?", a: "Les fonds sont libérés après confirmation de réception par l'acheteur (ou automatiquement au bout du délai). Tu peux les retirer depuis Gains." },
  { q: "Comment configurer la livraison ?", a: "Depuis ton profil vendeur, ouvre « Livraison » et choisis un mode : forfait, zones, ou paiement à la livraison." },
  { q: "Un problème avec une commande ?", a: "Ouvre la commande dans Activité, puis « Signaler un problème ». Notre équipe intervient sous 48 h." },
];

const FAQ_EN: FaqItem[] = [
  { q: "How do I become a seller?", a: "Open your profile and tap “Become a seller”. You can then set up your shop and start going live." },
  { q: "How do I top up my wallet?", a: "Open the Wallet tab from your profile and choose an amount. Payments are secured by Stripe." },
  { q: "When am I paid for my sales?", a: "Funds are released once the buyer confirms delivery (or automatically after the delay). Withdraw from Earnings." },
  { q: "How do I set up delivery?", a: "From your seller profile, open “Delivery” and pick a mode: flat fee, zones, or cash on delivery." },
  { q: "Issue with an order?", a: "Open the order in Activity, then “Report an issue”. Our team replies within 48 h." },
];

export function HelpSupportScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const faq = fr ? FAQ_FR : FAQ_EN;
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(fr ? "Aide KiDi+" : "KiDi+ Support")}`;

  return (
    <PushScreen open={open} onClose={onClose} title={fr ? "Aide & support" : "Help & support"} zIndex={65}>
      <div className="px-4 py-4 space-y-4">
        <div
          className="rounded-3xl p-5 text-white"
          style={{ background: "linear-gradient(135deg, oklch(0.4 0.06 265), oklch(0.28 0.05 265))" }}
        >
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide opacity-90">
            <MessageCircle size={14} /> {fr ? "On est là pour t'aider" : "We're here to help"}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed opacity-90">
            {fr
              ? "Consulte les questions fréquentes ou contacte-nous directement — réponse sous 48 h."
              : "Check the FAQ or reach out directly — reply within 48 h."}
          </p>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {fr ? "Nous contacter" : "Contact us"}
          </h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <a
              href={mailto}
              onClick={() => haptic.light()}
              className="flex items-center gap-3 px-3 py-3"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                style={{ backgroundColor: "oklch(0.6 0.2 250)" }}
              >
                <Mail size={16} />
              </span>
              <div className="flex-1">
                <div className="text-[15px] font-medium">Email</div>
                <div className="text-[12px] text-muted-foreground">{SUPPORT_EMAIL}</div>
              </div>
            </a>
          </div>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            FAQ
          </h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {faq.map((item, i) => {
              const isOpen = openIdx === i;
              return (
                <div key={i}>
                  <Press
                    onClick={() => { haptic.selection(); setOpenIdx(isOpen ? null : i); }}
                    className="!block w-full !min-h-11 p-0 text-left"
                  >
                    <div className="flex items-center gap-2 px-3 py-3">
                      <span className="flex-1 text-[14px] font-medium">{item.q}</span>
                      <ChevronDown
                        size={16}
                        className="shrink-0 text-muted-foreground transition-transform"
                        style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                      />
                    </div>
                  </Press>
                  {isOpen && (
                    <p className="px-3 pb-3 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {fr ? "Ressources" : "Resources"}
          </h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <a
              href="https://kidiplus.com/terms"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-3"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                style={{ backgroundColor: "oklch(0.5 0.06 265)" }}
              >
                <FileText size={16} />
              </span>
              <span className="flex-1 text-[15px] font-medium">
                {fr ? "Conditions d'utilisation" : "Terms of use"}
              </span>
            </a>
            <div className="ml-14 h-px bg-border" aria-hidden />
            <a
              href="https://kidiplus.com/safety"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-3"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                style={{ backgroundColor: "oklch(0.55 0.16 155)" }}
              >
                <ShieldAlert size={16} />
              </span>
              <span className="flex-1 text-[15px] font-medium">
                {fr ? "Sécurité & communauté" : "Safety & community"}
              </span>
            </a>
          </div>
        </div>
      </div>
    </PushScreen>
  );
}
