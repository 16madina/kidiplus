// Draft legal content for KiDi+.
// ⚠️ TEMPLATE — À faire relire par un juriste avant publication finale.
// Update TERMS_VERSION whenever the content of Terms or Privacy changes,
// so the stored acceptance can be re-requested from users.

export const TERMS_VERSION = "2026-07-01";
export const LEGAL_UPDATED_AT = "2026-07-01";
export const LEGAL_CONTACT_EMAIL = "legal@kidiplus.com";
export const APP_NAME = "KiDi+";
export const OPERATOR_JURISDICTION = "Québec, Canada";

export type LegalDoc = { title: string; intro?: string; sections: Array<{ h: string; p: string[] }> };
type Bundle = { privacy: LegalDoc; terms: LegalDoc; community: LegalDoc };

export const LEGAL_FR: Bundle = {
  privacy: {
    title: "Politique de confidentialité",
    intro: `Cette politique explique quelles données ${APP_NAME} collecte, pourquoi, avec qui elles sont partagées et comment tu peux les contrôler. Elle s'applique à l'application mobile et au site web.`,
    sections: [
      { h: "1. Données que nous collectons", p: [
        `Informations de compte : adresse e-mail, nom d'affichage, @identifiant, pays, langue préférée, devise préférée.`,
        `Profil : photo de profil (avatar), bio, statut vendeur, préférences de compte.`,
        `Portefeuille et paiements : historique des recharges, achats et retraits. Les données de carte bancaire ne sont jamais stockées par ${APP_NAME}. Elles sont transmises directement à Stripe, notre prestataire de paiement (PCI-DSS).`,
        `Contenu diffusé : titres, catégories, images de couverture, produits mis en vente, enchères, messages de chat en direct. Les vidéos live sont transmises en temps réel par LiveKit et ne sont pas conservées après la fin du live sauf si le vendeur l'active explicitement.`,
        `Données d'utilisation et d'appareil : type d'appareil, système d'exploitation, adresse IP, identifiant technique, actions effectuées dans l'application (métriques agrégées).`,
        `Localisation approximative : dérivée de l'adresse IP ou du pays du compte pour afficher les "lives près de chez toi". Aucune localisation GPS précise n'est collectée.`,
      ]},
      { h: "2. Finalités du traitement", p: [
        `Fournir le service : créer et gérer ton compte, afficher les lives, traiter tes achats et paiements, verser les gains aux vendeurs.`,
        `Sécurité et prévention de la fraude : détecter les abus, appliquer les Conditions d'utilisation et les Directives de la communauté.`,
        `Amélioration : comprendre l'utilisation agrégée pour améliorer l'expérience.`,
        `Communications essentielles : confirmations d'achat, notifications de compte. Les communications marketing nécessitent ton consentement explicite.`,
      ]},
      { h: "3. Partage avec des tiers", p: [
        `Stripe (paiements) — traitement des cartes bancaires, retraits vendeurs. Voir stripe.com/privacy.`,
        `LiveKit (streaming vidéo/audio en direct) — transmission temps réel des lives.`,
        `Supabase (hébergement) — stockage sécurisé des données de compte et du contenu.`,
        `Autorités : uniquement si la loi l'exige (réquisition judiciaire, décision de justice).`,
        `Nous ne vendons jamais tes données personnelles à des tiers.`,
      ]},
      { h: "4. Conservation des données", p: [
        `Données de compte : conservées tant que ton compte est actif.`,
        `Historique de transactions : conservé jusqu'à 7 ans pour respecter les obligations comptables et fiscales.`,
        `Contenu live : les enregistrements ne sont pas conservés par défaut ; les messages de chat sont supprimés à la fin du live.`,
        `Après suppression de compte, les données identifiantes sont anonymisées et les enregistrements liés aux transactions sont conservés pour audit.`,
      ]},
      { h: "5. Tes droits", p: [
        `Accès : demander une copie de tes données.`,
        `Rectification : corriger tes informations depuis "Modifier le profil".`,
        `Suppression : supprimer ton compte depuis Réglages → Supprimer mon compte. Cette action est définitive.`,
        `Opposition et portabilité : nous contacter à ${LEGAL_CONTACT_EMAIL}.`,
        `Résidents du Canada (LPRPDE / Loi 25 au Québec), de l'UE (RGPD) et du Royaume-Uni : tes droits statutaires s'appliquent en plus.`,
      ]},
      { h: "6. Portefeuille, remboursements et retraits", p: [
        `Le solde du portefeuille reste ta propriété. Avant de supprimer ton compte, retire ton solde ou dépense-le. Un solde non retiré au moment de la suppression peut être perdu.`,
        `Les remboursements sont traités au cas par cas via l'assistance ; les retraits vendeurs sont soumis aux délais du moyen choisi (Wave, Orange Money, virement bancaire).`,
      ]},
      { h: "7. Enfants", p: [
        `${APP_NAME} n'est pas destinée aux personnes de moins de 18 ans. Tu dois avoir 18 ans ou plus pour créer un compte. Si nous apprenons qu'un compte a été créé par un mineur, il sera supprimé.`,
      ]},
      { h: "8. Sécurité", p: [
        `Chiffrement en transit (HTTPS/TLS) sur toutes les communications. Les mots de passe sont hachés. L'accès administratif est journalisé.`,
      ]},
      { h: "9. Transferts internationaux", p: [
        `Les données peuvent être traitées dans des pays différents de ta résidence, avec des garanties contractuelles appropriées.`,
      ]},
      { h: "10. Modifications", p: [
        `Nous pouvons mettre à jour cette politique. Les changements importants seront notifiés dans l'application.`,
      ]},
      { h: "11. Contact", p: [
        `Pour toute question : ${LEGAL_CONTACT_EMAIL}. Opérateur : ${APP_NAME}, ${OPERATOR_JURISDICTION}.`,
      ]},
    ],
  },
  terms: {
    title: "Conditions d'utilisation",
    intro: `En utilisant ${APP_NAME}, tu acceptes ces conditions. Lis-les attentivement.`,
    sections: [
      { h: "1. Éligibilité", p: [`Tu dois avoir au moins 18 ans et la capacité juridique pour utiliser ${APP_NAME}.`] },
      { h: "2. Compte", p: [
        `Tu es responsable de la confidentialité de tes identifiants et de toute activité sur ton compte.`,
        `Un seul compte par personne. Les faux comptes et l'usurpation d'identité sont interdits.`,
      ]},
      { h: "3. Ventes et achats", p: [
        `Les vendeurs sont responsables de la légalité, de la conformité et de la livraison des articles proposés.`,
        `Les acheteurs s'engagent à payer les articles achetés et à respecter les modalités convenues.`,
        `${APP_NAME} agit comme plateforme intermédiaire et perçoit une commission de service sur chaque transaction.`,
      ]},
      { h: "4. Interdictions", p: [
        `Sont interdits : produits illégaux, contrefaçons, armes, drogues, contenus adultes, produits animaux protégés, données personnelles de tiers.`,
        `Voir aussi les Directives de la communauté.`,
      ]},
      { h: "5. Paiements et retraits", p: [
        `Les paiements sont traités par Stripe et les moyens locaux (Wave, Orange Money). Les retraits vendeurs sont soumis à un seuil minimum et à vérification.`,
        `La commission plateforme est prélevée automatiquement à chaque vente.`,
      ]},
      { h: "6. Contenu utilisateur", p: [
        `Tu conserves les droits sur le contenu que tu publies mais accordes à ${APP_NAME} une licence mondiale, non-exclusive, gratuite pour l'héberger, l'afficher et le distribuer dans le cadre du service.`,
        `Tu garantis disposer des droits nécessaires sur ce contenu.`,
      ]},
      { h: "7. Modération", p: [
        `Nous pouvons retirer du contenu, avertir, suspendre ou fermer un compte qui viole ces conditions ou les Directives de la communauté, sans préavis en cas de violation grave.`,
      ]},
      { h: "8. Résiliation", p: [
        `Tu peux supprimer ton compte à tout moment depuis Réglages. Nous pouvons résilier ton compte en cas de violation.`,
      ]},
      { h: "9. Absence de garantie / limitation de responsabilité", p: [
        `Le service est fourni "en l'état". Dans les limites autorisées par la loi, ${APP_NAME} n'est pas responsable des dommages indirects.`,
      ]},
      { h: "10. Droit applicable", p: [
        `Les présentes sont régies par le droit du ${OPERATOR_JURISDICTION}, sans préjudice des dispositions impératives protégeant le consommateur dans ton pays de résidence.`,
      ]},
      { h: "11. Contact", p: [`${LEGAL_CONTACT_EMAIL}`] },
    ],
  },
  community: {
    title: "Directives de la communauté",
    intro: `${APP_NAME} est un espace bienveillant pour acheter, vendre et échanger en direct. Ces règles s'appliquent à tous les lives, messages et profils.`,
    sections: [
      { h: "Interdits stricts", p: [
        `Produits illégaux ou volés, contrefaçons, armes, drogues, produits pharmaceutiques réglementés, espèces protégées.`,
        `Contenu adulte, sexuellement explicite, ou représentation de mineurs dans un contexte inapproprié.`,
        `Arnaques, fausses ventes, systèmes pyramidaux, incitation au paiement hors plateforme.`,
        `Harcèlement, discours haineux, discrimination, menaces, doxxing.`,
        `Usurpation d'identité, faux comptes, spam.`,
      ]},
      { h: "Bonnes pratiques", p: [
        `Décris tes articles honnêtement (état, taille, provenance).`,
        `Réponds respectueusement aux questions en chat.`,
        `Livre rapidement et communique les numéros de suivi.`,
      ]},
      { h: "Conséquences", p: [
        `Avertissement pour un premier manquement mineur.`,
        `Suspension temporaire du compte pour récidive ou faute grave.`,
        `Bannissement définitif et retrait du contenu pour violations graves ou répétées.`,
      ]},
      { h: "Signaler", p: [
        `Tu peux signaler un live, un message ou un profil via l'action "Signaler". Notre équipe examine chaque signalement.`,
      ]},
    ],
  },
};

export const LEGAL_EN: Bundle = {
  privacy: {
    title: "Privacy Policy",
    intro: `This policy explains what data ${APP_NAME} collects, why, who it is shared with, and how you can control it. It applies to the mobile app and the website.`,
    sections: [
      { h: "1. Data we collect", p: [
        `Account information: email, display name, @handle, country, preferred language, preferred currency.`,
        `Profile: avatar, bio, seller status, account preferences.`,
        `Wallet & payments: top-up, purchase and payout history. ${APP_NAME} never stores card data — payment details go directly to Stripe (PCI-DSS).`,
        `Broadcast content: titles, categories, cover images, listed products, bids, live chat messages. Live video is streamed in real time by LiveKit and is not retained after the live ends unless the seller opts in.`,
        `Usage & device: device type, OS, IP address, technical identifier, actions in the app (aggregated metrics).`,
        `Approximate location: derived from your IP address or account country, used to surface "lives near you". No precise GPS location is collected.`,
      ]},
      { h: "2. How we use it", p: [
        `Provide the service: create and manage your account, display lives, process purchases and payments, pay out sellers.`,
        `Security & fraud prevention: detect abuse, enforce the Terms and Community Guidelines.`,
        `Improvement: understand aggregate usage to improve the experience.`,
        `Essential communications: purchase confirmations, account notifications. Marketing requires your explicit consent.`,
      ]},
      { h: "3. Sharing with third parties", p: [
        `Stripe (payments) — card processing and payouts. See stripe.com/privacy.`,
        `LiveKit (live video/audio) — real-time streaming.`,
        `Supabase (hosting) — secure storage of account and content data.`,
        `Authorities: only where required by law.`,
        `We never sell your personal data.`,
      ]},
      { h: "4. Retention", p: [
        `Account data: kept while your account is active.`,
        `Transaction history: up to 7 years for accounting and tax obligations.`,
        `Live content: recordings are not kept by default; chat messages are removed at the end of the live.`,
        `After account deletion, identifying data is anonymised; records tied to transactions may be kept for audit.`,
      ]},
      { h: "5. Your rights", p: [
        `Access: request a copy of your data.`,
        `Rectification: fix your info from "Edit profile".`,
        `Deletion: remove your account from Settings → Delete my account. This is permanent.`,
        `Objection & portability: contact ${LEGAL_CONTACT_EMAIL}.`,
        `Residents of Canada (PIPEDA / Quebec Law 25), the EU (GDPR) and the UK: your statutory rights apply.`,
      ]},
      { h: "6. Wallet, refunds and payouts", p: [
        `Your wallet balance remains your property. Before deleting your account, withdraw or spend it. A balance not withdrawn at deletion time may be lost.`,
        `Refunds are handled case-by-case via support; seller payouts are subject to the chosen method's timelines (Wave, Orange Money, bank transfer).`,
      ]},
      { h: "7. Children", p: [
        `${APP_NAME} is not directed to anyone under 18. You must be 18+ to create an account. If we learn an account was created by a minor, it will be deleted.`,
      ]},
      { h: "8. Security", p: [
        `Encryption in transit (HTTPS/TLS). Passwords are hashed. Administrative access is logged.`,
      ]},
      { h: "9. International transfers", p: [
        `Data may be processed in countries other than your country of residence, with appropriate contractual safeguards.`,
      ]},
      { h: "10. Changes", p: [`We may update this policy. Material changes will be notified in-app.`] },
      { h: "11. Contact", p: [
        `Questions: ${LEGAL_CONTACT_EMAIL}. Operator: ${APP_NAME}, ${OPERATOR_JURISDICTION}.`,
      ]},
    ],
  },
  terms: {
    title: "Terms of Use",
    intro: `By using ${APP_NAME}, you agree to these terms. Please read carefully.`,
    sections: [
      { h: "1. Eligibility", p: [`You must be at least 18 and legally able to contract to use ${APP_NAME}.`] },
      { h: "2. Account", p: [
        `You are responsible for keeping your credentials confidential and for all activity on your account.`,
        `One account per person. Fake accounts and impersonation are prohibited.`,
      ]},
      { h: "3. Selling & buying", p: [
        `Sellers are responsible for the legality, conformity and delivery of the items they list.`,
        `Buyers agree to pay for items purchased and to respect the agreed terms.`,
        `${APP_NAME} acts as an intermediary platform and charges a service fee on each transaction.`,
      ]},
      { h: "4. Prohibitions", p: [
        `Illegal goods, counterfeits, weapons, drugs, adult content, protected animal products, third-party personal data are prohibited.`,
        `See also the Community Guidelines.`,
      ]},
      { h: "5. Payments & payouts", p: [
        `Payments are processed by Stripe and local methods (Wave, Orange Money). Payouts are subject to a minimum threshold and verification.`,
        `The platform fee is deducted automatically on each sale.`,
      ]},
      { h: "6. User content", p: [
        `You keep the rights to what you post but grant ${APP_NAME} a worldwide, non-exclusive, royalty-free licence to host, display and distribute it as part of the service.`,
        `You warrant you hold the necessary rights.`,
      ]},
      { h: "7. Moderation", p: [
        `We may remove content, warn, suspend or terminate an account that breaches these terms or the Community Guidelines, without notice for serious breaches.`,
      ]},
      { h: "8. Termination", p: [
        `You may delete your account at any time from Settings. We may terminate for breach.`,
      ]},
      { h: "9. No warranty / limitation of liability", p: [
        `The service is provided "as is". To the extent permitted by law, ${APP_NAME} is not liable for indirect damages.`,
      ]},
      { h: "10. Governing law", p: [
        `Governed by the laws of ${OPERATOR_JURISDICTION}, without prejudice to mandatory consumer-protection rules of your country of residence.`,
      ]},
      { h: "11. Contact", p: [`${LEGAL_CONTACT_EMAIL}`] },
    ],
  },
  community: {
    title: "Community Guidelines",
    intro: `${APP_NAME} is a kind space to buy, sell and connect live. These rules apply to all lives, messages and profiles.`,
    sections: [
      { h: "Strictly prohibited", p: [
        `Illegal or stolen goods, counterfeits, weapons, drugs, regulated pharma, protected species.`,
        `Adult, sexually explicit content, or minors depicted inappropriately.`,
        `Scams, fake sales, pyramid schemes, off-platform payment solicitation.`,
        `Harassment, hate speech, discrimination, threats, doxxing.`,
        `Impersonation, fake accounts, spam.`,
      ]},
      { h: "Good practices", p: [
        `Describe items honestly (condition, size, origin).`,
        `Answer chat questions respectfully.`,
        `Ship fast and share tracking numbers.`,
      ]},
      { h: "Consequences", p: [
        `Warning for a first minor breach.`,
        `Temporary suspension for repeat offences or serious breaches.`,
        `Permanent ban and content removal for serious or repeated violations.`,
      ]},
      { h: "Reporting", p: [
        `You can report a live, message or profile via the "Report" action. Our team reviews every report.`,
      ]},
    ],
  },
};

export function pickLegal(lang: string | undefined | null): Bundle {
  return lang === "en" ? LEGAL_EN : LEGAL_FR;
}
