// Draft legal content for KiDi+.
// ⚠️ TEMPLATE — À faire relire par un juriste avant publication finale.
// Update TERMS_VERSION whenever the content of Terms or Privacy changes,
// so the stored acceptance can be re-requested from users.

export const TERMS_VERSION = "2026-07-18";
export const LEGAL_UPDATED_AT = "2026-07-18";
export const LEGAL_CONTACT_EMAIL = "legal@kidiplus.com";
export const PRIVACY_CONTACT_EMAIL = "privacy@kidiplus.com";
export const SUPPORT_CONTACT_EMAIL = "support@kidiplus.com";
export const APP_NAME = "KiDi+";
export const OPERATOR_LEGAL_NAME = "DeeDigital";
export const OPERATOR_JURISDICTION = "Québec, Canada";

export type LegalDoc = { title: string; intro?: string; sections: Array<{ h: string; p: string[] }> };
type Bundle = { privacy: LegalDoc; terms: LegalDoc; community: LegalDoc };

// ------------------------------------------------------------------
// FRANÇAIS (version de référence)
// ------------------------------------------------------------------

export const LEGAL_FR: Bundle = {
  terms: {
    title: "Conditions générales d'utilisation",
    intro: `Les présentes Conditions générales d'utilisation (« CGU ») régissent l'accès et l'utilisation de la plateforme ${APP_NAME}, exploitée par ${OPERATOR_LEGAL_NAME}, société établie au ${OPERATOR_JURISDICTION}. En créant un compte, en utilisant l'application mobile ou le site web ${APP_NAME}, l'utilisateur reconnaît avoir lu, compris et accepté sans réserve les présentes CGU, la Politique de confidentialité et les Directives de la communauté, qui forment un tout contractuel indissociable.`,
    sections: [
      { h: "Sommaire", p: [
        `1. Définitions — 2. Acceptation et éligibilité — 3. Nature du service (rôle d'intermédiaire technique) — 4. Comptes utilisateurs — 5. Obligations du vendeur — 6. Obligations de l'acheteur — 7. Enchères — 8. Paiements, portefeuille et commissions — 9. Séquestre et gestion des litiges — 10. Livraison — 11. Contenu utilisateur et lives — 12. Modération et sanctions — 13. Programme de parrainage — 14. Disponibilité du service — 15. Propriété intellectuelle — 16. Limitation de responsabilité — 17. Indemnisation — 18. Résiliation — 19. Droit applicable et juridiction — 20. Modifications des CGU — 21. Divers — 22. Contact.`,
      ]},
      { h: "1. Définitions", p: [
        `« ${APP_NAME} » ou la « Plateforme » : l'application mobile et le site web exploités par ${OPERATOR_LEGAL_NAME}, permettant la mise en relation de vendeurs indépendants et d'acheteurs autour de sessions de vente en direct (« lives »).`,
        `« Utilisateur » : toute personne physique majeure disposant d'un compte sur la Plateforme.`,
        `« Vendeur » : Utilisateur qui propose des biens ou contenus à la vente via la Plateforme.`,
        `« Acheteur » : Utilisateur qui acquiert un bien proposé par un Vendeur.`,
        `« Contrat de vente » : contrat conclu directement entre un Acheteur et un Vendeur à l'issue d'une commande ou d'une enchère, auquel ${APP_NAME} n'est jamais partie.`,
        `« Portefeuille » : solde prépayé rattaché au compte de l'Utilisateur, utilisable exclusivement au sein de la Plateforme.`,
        `« Séquestre » : mécanisme de retenue des sommes payées par l'Acheteur jusqu'à confirmation de la livraison ou expiration du délai contractuel.`,
      ]},
      { h: "2. Acceptation et éligibilité", p: [
        `L'utilisation de ${APP_NAME} est strictement réservée aux personnes physiques âgées d'au moins dix-huit (18) ans et disposant de la pleine capacité juridique pour contracter selon la loi de leur pays de résidence.`,
        `En s'inscrivant, l'Utilisateur déclare et garantit : (i) satisfaire à ces conditions d'âge et de capacité, (ii) fournir des informations exactes, complètes et à jour, (iii) n'être visé par aucune sanction ou interdiction légale l'empêchant d'utiliser un service de commerce en ligne.`,
        `L'acceptation des présentes CGU, de la Politique de confidentialité et des Directives de la communauté est une condition impérative de l'accès au service. Le refus ou le retrait de cette acceptation entraîne la résiliation du compte.`,
      ]},
      { h: "3. Nature du service — rôle d'intermédiaire technique", p: [
        `${APP_NAME} est une plateforme d'intermédiation technique dont l'unique objet est de permettre la mise en relation entre Vendeurs indépendants et Acheteurs, ainsi que la diffusion en direct de sessions de vente.`,
        `${APP_NAME} N'EST PAS le vendeur des biens proposés sur la Plateforme. ${APP_NAME} n'est jamais partie au Contrat de vente conclu entre l'Acheteur et le Vendeur. ${APP_NAME} ne détient, ne stocke, ne manipule et n'expédie aucun bien.`,
        `${APP_NAME} NE GARANTIT PAS l'existence, la qualité, l'authenticité, la conformité, la légalité, la disponibilité, la sécurité ni la livraison des biens proposés par les Vendeurs. ${APP_NAME} ne procède à aucun contrôle a priori des annonces et n'endosse aucune responsabilité éditoriale sur le contenu publié par les Utilisateurs, sous réserve de ses obligations légales d'hébergeur et de ses mécanismes de modération a posteriori.`,
        `Chaque vente réalisée via ${APP_NAME} constitue un contrat direct entre l'Acheteur et le Vendeur, régi par les stipulations convenues entre eux et par la loi qui leur est applicable. Toute réclamation relative à un bien vendu doit être adressée en premier lieu au Vendeur concerné.`,
        `${APP_NAME} fournit néanmoins, à titre accessoire, des outils facilitant la transaction : diffusion vidéo, chat, système d'enchères, encaissement via un prestataire tiers, séquestre des fonds et procédure interne de gestion des litiges décrite à l'article 9.`,
      ]},
      { h: "4. Comptes utilisateurs", p: [
        `Chaque Utilisateur ne peut détenir qu'un seul compte. L'usurpation d'identité, la création de faux comptes et le contournement d'une sanction par la création d'un nouveau compte sont strictement interdits.`,
        `L'Utilisateur est seul responsable de la confidentialité de ses identifiants et de toute activité effectuée depuis son compte. Toute utilisation suspecte doit être signalée sans délai à ${SUPPORT_CONTACT_EMAIL}.`,
        `${APP_NAME} peut demander des vérifications d'identité complémentaires, notamment pour les Vendeurs, afin de prévenir la fraude et de respecter les obligations légales (lutte contre le blanchiment, connaissance client).`,
      ]},
      { h: "5. Obligations du vendeur", p: [
        `Le Vendeur s'engage à décrire ses articles de manière exacte, complète et non trompeuse (état, taille, marque, provenance, défauts éventuels) et à ne publier que des annonces conformes à la loi et aux Directives de la communauté.`,
        `La contrefaçon et la vente d'articles portant atteinte à des droits de propriété intellectuelle sont strictement interdites et exposent le Vendeur à un retrait immédiat, un bannissement et toute action judiciaire utile.`,
        `Le Vendeur garantit disposer de tous les droits, licences et autorisations nécessaires pour vendre les biens qu'il propose, y compris lorsque la vente d'un bien est soumise à une réglementation particulière (produits réglementés, importation, contrôle sanitaire, etc.).`,
        `Le Vendeur est seul responsable de l'expédition des biens dans les délais annoncés, du choix du transporteur, de l'emballage et du suivi. Il est également seul responsable du service après-vente à l'égard de l'Acheteur.`,
        `Le Vendeur assume seul et à titre exclusif l'ensemble des obligations fiscales, sociales, douanières et déclaratives afférentes aux ventes réalisées via ${APP_NAME}. Il lui appartient de déclarer ses revenus aux autorités compétentes et, le cas échéant, de collecter et reverser toute taxe (TPS/TVQ, TVA, droits de douane, etc.). ${APP_NAME} peut être tenue de transmettre certaines informations aux autorités fiscales conformément à la loi applicable.`,
        `Le Vendeur s'engage à indemniser ${APP_NAME} et ses affiliés de toute réclamation, action, dommage, coût ou frais (y compris frais d'avocats raisonnables) résultant, directement ou indirectement, de ses annonces, de ses ventes ou d'un manquement aux présentes CGU.`,
      ]},
      { h: "6. Obligations de l'acheteur", p: [
        `L'Acheteur s'engage à lire attentivement la description de chaque bien avant l'achat, à ne placer d'enchère qu'en toute connaissance de cause et à honorer les paiements dus.`,
        `L'Acheteur s'engage à confirmer la réception d'une commande de manière honnête et diligente et à ne pas déclencher de litige abusif. Les fausses déclarations peuvent entraîner sanctions, remboursement rétroactif au Vendeur et exclusion.`,
        `L'Acheteur reconnaît qu'il achète auprès du Vendeur et non de ${APP_NAME}. Toute demande de retour, échange ou garantie relève en premier lieu du Vendeur, sous réserve des droits impératifs applicables dans le pays de résidence de l'Acheteur.`,
      ]},
      { h: "7. Enchères", p: [
        `Toute enchère placée sur ${APP_NAME} constitue un engagement ferme, irrévocable et immédiatement exécutoire d'acheter le bien mis aux enchères au prix atteint si l'enchère est déclarée gagnante.`,
        `Le mécanisme d'enchères repose sur un chronomètre décompté à partir de chaque nouvelle mise, avec réarmement (« mort subite ») à chaque nouvelle enchère jusqu'à expiration du délai. À l'échéance, la dernière enchère la plus élevée est déclarée gagnante et le paiement est débité (ou capturé sur le solde du Portefeuille) sans qu'aucune confirmation supplémentaire ne soit requise.`,
        `Le défaut de paiement d'une enchère gagnante constitue un manquement grave pouvant entraîner : annulation de la vente, sanctions (avertissement, suspension, bannissement), suspension du Portefeuille et facturation de frais de gestion.`,
        `${APP_NAME} peut, à sa discrétion raisonnable, annuler ou invalider une enchère en cas d'erreur technique manifeste, de faille, de dysfonctionnement, de comportement frauduleux ou collusoire, sans que cela n'engage sa responsabilité au-delà du remboursement effectif des sommes indûment prélevées.`,
      ]},
      { h: "8. Paiements, portefeuille et commissions", p: [
        `Les paiements sont traités exclusivement par des prestataires de services de paiement tiers (notamment Stripe et, selon les régions, Wave ou Orange Money). ${APP_NAME} ne stocke jamais les numéros de carte bancaire ni les données d'authentification bancaire.`,
        `Le « Portefeuille ${APP_NAME} » est un solde prépayé rattaché au compte, utilisable uniquement pour effectuer des paiements ou percevoir des gains au sein de la Plateforme. Il NE constitue PAS un compte bancaire, ne produit AUCUN intérêt, n'est pas un moyen de paiement utilisable en dehors de ${APP_NAME} et n'est pas garanti par un fonds de garantie des dépôts.`,
        `${APP_NAME} prélève une commission de service par défaut égale à cinq pour cent (5 %) du prix payé par l'Acheteur, hors frais de livraison. Ce taux peut être modifié à tout moment, moyennant un préavis raisonnable notifié dans l'application ou par courriel. Le nouveau taux s'applique aux ventes conclues postérieurement à son entrée en vigueur.`,
        `Les gains du Vendeur sont crédités sur son Portefeuille après confirmation de la livraison ou expiration du délai de séquestre, déduction faite de la commission plateforme et, le cas échéant, des frais de traitement des prestataires de paiement.`,
        `Les retraits sont soumis à un seuil minimum, à des plafonds journaliers et hebdomadaires selon le niveau de vérification du compte (nouveau, badge certifié, KYC pièce d'identité), à des délais de traitement propres au moyen de retrait choisi, et à des contrôles anti-fraude et de conformité. ${APP_NAME} peut suspendre ou refuser un retrait suspecté frauduleux jusqu'à vérification complète.`,
        `Les cadeaux virtuels et biens numériques (autocollants, effets, contenus consommables) sont réputés livrés et consommés dès leur envoi ou activation ; ils NE sont NI remboursables NI convertibles en monnaie ayant cours légal, sauf disposition légale impérative contraire.`,
      ]},
      { h: "9. Séquestre et gestion des litiges", p: [
        `Les sommes payées par l'Acheteur sont placées sous séquestre technique jusqu'à (i) confirmation expresse de réception du bien par l'Acheteur ou (ii) expiration d'un délai de sept (7) jours à compter de la marque d'expédition confirmée par le Vendeur, sans réclamation de l'Acheteur — le premier événement prévaut.`,
        `À l'issue du séquestre, les fonds sont libérés au profit du Vendeur, sous réserve des sanctions, blocages ou retenues éventuels prévus aux présentes.`,
        `En cas de désaccord (bien non reçu, non conforme, endommagé, contrefait, description trompeuse, etc.), l'Utilisateur peut ouvrir un litige interne via l'application. La procédure de litige interne suit les étapes suivantes : (a) ouverture par la partie plaignante avec description et preuves, (b) réponse de la partie adverse dans un délai raisonnable, (c) collecte éventuelle d'éléments complémentaires par ${APP_NAME}, (d) décision motivée rendue par ${APP_NAME}.`,
        `La décision de ${APP_NAME} dans le cadre de la procédure interne est rendue de bonne foi, sur la base des éléments fournis par les parties et des données techniques de la Plateforme, à la discrétion raisonnable de ${APP_NAME}. Elle peut consister en : la libération des fonds au Vendeur, le remboursement total ou partiel de l'Acheteur, ou toute autre mesure conservatoire.`,
        `L'intervention de ${APP_NAME} dans un litige interne est une prestation d'assistance et n'a pas valeur d'arbitrage judiciaire. Elle ne prive aucune des parties de son droit d'agir en justice l'une contre l'autre. La responsabilité de ${APP_NAME} ne peut être engagée du fait de sa décision interne, sauf en cas de faute lourde ou intentionnelle démontrée.`,
      ]},
      { h: "10. Livraison", p: [
        `La livraison des biens vendus est organisée sous la seule responsabilité du Vendeur. ${APP_NAME} n'exerce aucune activité de transport, de manutention, d'entreposage ou de logistique et n'assume aucune responsabilité relative à la perte, au vol, au retard, à l'endommagement ou à la non-livraison des biens.`,
        `La Plateforme propose plusieurs modèles de facturation des frais de livraison (par zones géographiques, frais fixes ou paiement direct au livreur). Le Vendeur définit son mode de livraison et ses frais lors de la mise en vente ; ces informations sont affichées à l'Acheteur avant la validation de l'achat.`,
        `Les mentions de délais de livraison sont indicatives sauf engagement contraire du Vendeur.`,
      ]},
      { h: "11. Contenu utilisateur et lives", p: [
        `L'Utilisateur conserve la titularité des droits sur le contenu qu'il publie (annonces, photos, vidéos, lives, messages, avatars). Il concède à ${APP_NAME}, à titre gratuit, une licence mondiale, non exclusive, transférable et sous-licenciable, pour la durée de protection légale des droits, aux fins d'héberger, reproduire, adapter, diffuser, promouvoir et archiver le contenu dans le cadre du service, de ses évolutions et de sa communication.`,
        `L'Utilisateur garantit disposer de tous les droits nécessaires sur son contenu, notamment le droit à l'image des personnes filmées, et s'interdit de publier : contenus illicites, trompeurs, diffamatoires, haineux, discriminatoires, harcelants, sexuellement explicites, mettant en scène des mineurs de manière inappropriée, incitant à la violence ou portant atteinte à des droits de tiers.`,
        `Les lives peuvent être enregistrés à des fins de sécurité et de modération. Les enregistrements ne sont pas rendus publics par défaut.`,
      ]},
      { h: "12. Modération et sanctions", p: [
        `${APP_NAME} peut, à tout moment et à sa discrétion raisonnable, retirer un contenu, interrompre un live, restreindre certaines fonctionnalités, adresser un avertissement, suspendre temporairement ou bannir définitivement un compte en cas de manquement aux présentes CGU, aux Directives de la communauté ou à la loi.`,
        `Un compte banni ne peut plus accéder au service. Toute tentative de contournement (nouveau compte, changement d'identifiants) constitue une violation supplémentaire.`,
        `Tout Utilisateur peut signaler un contenu ou un compte via l'action « Signaler » disponible dans l'application. L'action « Bloquer » masque immédiatement le contenu du compte bloqué et transmet le signalement à l'équipe de modération.`,
      ]},
      { h: "12 bis. Lutte contre la fraude et le blanchiment (AML/CFT)", p: [
        `${APP_NAME} met en œuvre des mesures raisonnables de prévention de la fraude, du blanchiment de capitaux et du financement du terrorisme, en cohérence avec les standards applicables au ${OPERATOR_JURISDICTION}.`,
        `Des plafonds opérationnels sont appliqués à titre préventif : solde maximal du Portefeuille de 1 000 000 XOF, 2 000 EUR ou 3 000 CAD ; recharges, dépenses du Portefeuille (achats et cadeaux) et cadeaux reçus soumis à des plafonds journaliers, plus bas pour les comptes non certifiés et plus élevés pour les comptes certifiés. Ces plafonds peuvent être révisés à tout moment.`,
        `${APP_NAME} peut, à titre conservatoire et sans préavis, geler temporairement un compte (blocage des retraits, des paiements par Portefeuille et des cadeaux virtuels) en présence d'indices raisonnables de fraude — notamment : compte récent avec activité anormalement élevée, concentration inhabituelle sur un même acheteur, cycle recharge→achat→retrait très court, premier retrait d'un montant inhabituel, coordonnées partagées entre acheteur et vendeur, litiges ou rétrofacturations, ou toute autre anomalie détectée par nos systèmes de contrôle.`,
        `Le gel est une mesure de vérification, distincte de la suspension ou du bannissement. L'Utilisateur en est informé par message interne indiquant le motif et peut fournir tout justificatif utile au service support. Le compte est réactivé dès la fin de la vérification si aucune irrégularité n'est confirmée.`,
        `${APP_NAME} peut refuser une transaction, exiger des informations complémentaires (identité, justificatif de provenance des fonds, justificatif de propriété du bien vendu), déclarer une opération suspecte aux autorités compétentes lorsque la loi l'exige, et coopérer avec toute réquisition judiciaire.`,
        `Toute tentative de contournement de ces mesures (multi-comptes, transactions fractionnées, faux justificatifs) constitue un manquement grave et peut entraîner la fermeture définitive du ou des comptes concernés ainsi que la retenue des fonds jusqu'à résolution.`,
      ]},
      { h: "13. Programme de parrainage", p: [
        `${APP_NAME} peut mettre à disposition un programme de parrainage récompensant les Utilisateurs pour l'inscription et l'activité de nouveaux membres. Les conditions détaillées (montants, plafonds, conditions de déclenchement, exclusions) sont décrites dans l'écran dédié à ce programme.`,
        `${APP_NAME} peut modifier, suspendre ou clôturer le programme à tout moment, moyennant un préavis raisonnable. Tout comportement frauduleux, notamment la création de faux comptes, l'auto-parrainage ou la manipulation des activités récompensées, entraîne l'annulation immédiate des gains, la fermeture du ou des comptes concernés et l'exclusion du programme.`,
      ]},
      { h: "14. Disponibilité du service", p: [
        `${APP_NAME} est fournie « EN L'ÉTAT » et « SELON DISPONIBILITÉ ». Aucune garantie de disponibilité continue, d'absence d'erreur, de compatibilité avec un usage particulier ni de résultats commerciaux n'est donnée.`,
        `Des interruptions techniques peuvent survenir pour maintenance, incident réseau, dysfonctionnement d'un prestataire tiers ou cas de force majeure. ${APP_NAME} ne saurait être tenue pour responsable des pertes de gain, d'enchère interrompue, de live coupé, de message non délivré ou d'autre inconvénient résultant d'une telle interruption.`,
      ]},
      { h: "15. Propriété intellectuelle de la Plateforme", p: [
        `Les marques ${APP_NAME}, les logos, l'interface, les codes source, les bases de données, les designs et l'ensemble des éléments qui composent la Plateforme sont la propriété exclusive de ${OPERATOR_LEGAL_NAME} ou de ses concédants. Toute reproduction, extraction, réutilisation ou décompilation non autorisée est interdite.`,
      ]},
      { h: "16. Limitation de responsabilité", p: [
        `Dans toute la mesure permise par la loi applicable, ${APP_NAME} n'est pas responsable des dommages indirects, immatériels ou consécutifs, notamment pertes de gain, pertes de chance, pertes commerciales, atteinte à la réputation ou perte de données.`,
        `Dans toute la mesure permise par la loi applicable, la responsabilité cumulée de ${APP_NAME} envers un Utilisateur au titre d'une transaction donnée est plafonnée au montant de la commission effectivement perçue par ${APP_NAME} sur cette transaction. À défaut de commission perçue, elle est plafonnée à un montant forfaitaire raisonnable équivalent à 100 CAD.`,
        `Aucune stipulation des présentes ne limite la responsabilité de ${APP_NAME} en cas de faute lourde ou intentionnelle, de fraude ou de décès et dommages corporels résultant d'un manquement à ses obligations légales.`,
        `Les droits impératifs des consommateurs prévus par la loi applicable dans le pays de résidence de l'Utilisateur — notamment la Loi sur la protection du consommateur du Québec, le Code de la consommation français, le droit européen de la consommation, ou la réglementation ivoirienne applicable — restent pleinement applicables et prévalent sur toute stipulation contraire des présentes.`,
      ]},
      { h: "17. Indemnisation", p: [
        `L'Utilisateur s'engage à indemniser et à tenir à couvert ${APP_NAME}, ${OPERATOR_LEGAL_NAME}, leurs affiliés, dirigeants, salariés et sous-traitants, de toute réclamation, action, dommage, coût, perte ou dépense (y compris frais d'avocats raisonnables) résultant : (i) d'un manquement de sa part aux présentes CGU, à la Politique de confidentialité ou à la loi, (ii) de son contenu, (iii) d'une transaction à laquelle il est partie, (iv) d'une violation des droits d'un tiers.`,
      ]},
      { h: "18. Résiliation", p: [
        `L'Utilisateur peut à tout moment supprimer son compte depuis les réglages de l'application. Avant suppression, il lui appartient de retirer ou de dépenser le solde de son Portefeuille : tout solde non retiré à la date de suppression peut être définitivement perdu, sauf disposition légale contraire.`,
        `${APP_NAME} peut résilier le compte d'un Utilisateur, avec effet immédiat et sans indemnité, en cas de manquement grave ou répété aux présentes, sans préjudice de tout dommage subi.`,
        `Les stipulations dont la nature commande la survie (notamment articles 5, 8, 9, 15, 16, 17, 19 et 21) demeurent en vigueur après résiliation.`,
      ]},
      { h: "19. Droit applicable et juridiction compétente", p: [
        `Les présentes CGU sont régies par le droit en vigueur au ${OPERATOR_JURISDICTION}, à l'exclusion des règles de conflit de lois.`,
        `Tout litige relatif à la formation, à l'exécution ou à l'interprétation des présentes sera soumis à la compétence des tribunaux du district judiciaire de Montréal (Québec), sous réserve des règles impératives de protection des consommateurs applicables dans le pays de résidence de l'Utilisateur, qui peuvent lui ouvrir la faculté de saisir les juridictions de son domicile.`,
      ]},
      { h: "20. Modifications des CGU", p: [
        `${APP_NAME} peut modifier les présentes CGU à tout moment. Toute modification substantielle sera portée à la connaissance des Utilisateurs par notification dans l'application ou par courriel, avec un préavis raisonnable.`,
        `À défaut d'opposition écrite avant l'entrée en vigueur des nouvelles CGU, la poursuite de l'utilisation du service vaut acceptation. L'Utilisateur qui refuse les nouvelles CGU peut résilier son compte selon l'article 18.`,
      ]},
      { h: "21. Divers", p: [
        `Force majeure : aucune partie ne peut être tenue responsable d'un manquement causé par un événement de force majeure au sens de la loi applicable.`,
        `Autonomie : la nullité éventuelle d'une clause n'affecte pas la validité des autres clauses.`,
        `Non-renonciation : l'absence d'exercice d'un droit ne vaut pas renonciation à ce droit.`,
        `Cession : ${APP_NAME} peut céder les présentes à un tiers dans le cadre d'une réorganisation, d'une fusion ou d'une cession d'actifs. L'Utilisateur ne peut céder son compte sans accord écrit préalable.`,
        `Intégralité : les présentes CGU, la Politique de confidentialité et les Directives de la communauté constituent l'intégralité de l'accord entre les parties.`,
      ]},
      { h: "22. Contact", p: [
        `Questions juridiques : ${LEGAL_CONTACT_EMAIL}.`,
        `Support utilisateur : ${SUPPORT_CONTACT_EMAIL}.`,
        `Opérateur : ${OPERATOR_LEGAL_NAME}, ${OPERATOR_JURISDICTION}.`,
      ]},
    ],
  },

  privacy: {
    title: "Politique de confidentialité",
    intro: `La présente Politique de confidentialité décrit la manière dont ${OPERATOR_LEGAL_NAME}, exploitant de ${APP_NAME}, collecte, utilise, partage et protège les renseignements personnels des Utilisateurs. Elle est conforme à la Loi sur la protection des renseignements personnels dans le secteur privé du Québec (« Loi 25 »), à la Loi sur la protection des renseignements personnels et les documents électroniques (« LPRPDE »), au Règlement général sur la protection des données de l'Union européenne (« RGPD ») pour les Utilisateurs de l'UE, et aux règles applicables dans les autres pays où ${APP_NAME} est offerte.`,
    sections: [
      { h: "Sommaire", p: [
        `1. Responsable du traitement — 2. Données collectées — 3. Finalités et bases légales — 4. Partage avec des tiers — 5. Coordonnées de livraison et communication acheteur-vendeur — 6. Conservation des données — 7. Droits des Utilisateurs — 8. Sécurité — 9. Transferts internationaux — 10. Mineurs — 11. Cookies et technologies similaires — 12. Modifications — 13. Réclamations et autorités de contrôle — 14. Contact.`,
      ]},
      { h: "1. Responsable du traitement et responsable de la protection des renseignements personnels", p: [
        `Responsable du traitement : ${OPERATOR_LEGAL_NAME}, exploitant ${APP_NAME}, ${OPERATOR_JURISDICTION}.`,
        `Conformément à la Loi 25, ${OPERATOR_LEGAL_NAME} a désigné un responsable de la protection des renseignements personnels, joignable à l'adresse : ${PRIVACY_CONTACT_EMAIL}. Ce responsable est chargé de veiller au respect de la présente politique et de répondre aux demandes d'exercice de droits.`,
      ]},
      { h: "2. Données collectées", p: [
        `Données de compte : adresse courriel, nom d'affichage, identifiant public (@handle), pays, langue et devise préférées, date de création du compte.`,
        `Profil : photo d'avatar, biographie, statut vendeur, préférences.`,
        `Adresses et coordonnées de livraison : nom complet du destinataire, adresse postale détaillée (numéro, rue, ville, code postal, pays), numéro de téléphone associé à la livraison, zone de livraison choisie, instructions particulières.`,
        `Données de transaction et de portefeuille : historique des recharges, achats, ventes, retraits, mouvements du Portefeuille. Les numéros de carte bancaire et données d'authentification bancaire NE sont PAS stockés par ${APP_NAME} ; ils sont transmis directement à notre prestataire de paiement (Stripe, certifié PCI-DSS niveau 1).`,
        `Contenus publiés : titres et catégories de lives, images de couverture, produits mis en vente, enchères, messages de chat, contenus audio et vidéo diffusés lors des lives, signalements et blocages effectués.`,
        `Données d'usage et d'appareil : type d'appareil, système d'exploitation, langue, adresse IP, identifiant technique de session, actions effectuées dans l'application (métriques agrégées à des fins d'amélioration).`,
        `Localisation approximative : déduite de l'adresse IP ou du pays du compte, pour afficher les lives pertinents. Aucune localisation GPS précise n'est collectée sans consentement explicite.`,
        `Notifications push : jetons d'appareil transmis par Apple Push Notification Service (APNs) et Firebase Cloud Messaging (FCM) afin d'envoyer les notifications transactionnelles et facultatives.`,
      ]},
      { h: "3. Finalités et bases légales du traitement", p: [
        `Fournir le service (exécution du contrat) : création et gestion du compte, diffusion des lives, traitement des commandes, versement des gains, communications transactionnelles.`,
        `Traitement des paiements (exécution du contrat et obligation légale) : encaissements, séquestre, retraits, prévention du blanchiment.`,
        `Sécurité, prévention et détection de la fraude (intérêt légitime et obligation légale) : détection d'usages abusifs, protection des Utilisateurs, réponses aux réquisitions.`,
        `Modération et respect des CGU (intérêt légitime) : traitement des signalements et sanctions.`,
        `Support utilisateur (exécution du contrat).`,
        `Communications non essentielles et marketing (consentement) : envoyées uniquement après opt-in explicite ; l'Utilisateur peut retirer son consentement à tout moment.`,
        `Obligations légales et fiscales : conservation des pièces justificatives, réponse aux autorités compétentes.`,
      ]},
      { h: "4. Partage avec des tiers", p: [
        `Prestataires techniques agissant en qualité de sous-traitants, liés par des engagements contractuels de confidentialité et de sécurité :`,
        `— Stripe (paiements, retraits, conformité KYC) — voir stripe.com/privacy ;`,
        `— LiveKit (diffusion vidéo/audio en temps réel des lives) ;`,
        `— Supabase (hébergement de la base de données, authentification, stockage de fichiers) ;`,
        `— Apple Push Notification Service et Firebase Cloud Messaging (envoi des notifications push) ;`,
        `— fournisseurs de messagerie transactionnelle et outils d'analyse agrégée.`,
        `Vendeur destinataire d'une commande : lorsqu'un Acheteur passe commande, le Vendeur reçoit les coordonnées de livraison nécessaires à l'exécution (nom, adresse, téléphone, instructions). Le Vendeur agit alors en qualité de responsable de traitement autonome pour ces données et s'engage contractuellement à ne les utiliser que pour l'exécution de la commande, à ne pas les conserver au-delà des durées légales et à ne pas les céder à des tiers.`,
        `Autorités compétentes : uniquement lorsque la loi l'exige (réquisition, décision de justice) ou pour protéger les droits, la sécurité ou les biens des Utilisateurs et de ${APP_NAME}.`,
        `${APP_NAME} NE VEND JAMAIS de renseignements personnels à des tiers et ne les utilise pas à des fins de publicité comportementale externe.`,
      ]},
      { h: "5. Coordonnées de livraison et communication acheteur-vendeur", p: [
        `Les coordonnées de livraison d'un Acheteur sont partagées avec le Vendeur uniquement dans le cadre d'une commande le concernant. Elles ne sont pas rendues publiques.`,
        `Toute utilisation détournée par un Vendeur (prospection non sollicitée, revente de coordonnées, harcèlement) constitue un manquement grave aux CGU et à la loi applicable, exposant à sanctions plateforme et poursuites.`,
      ]},
      { h: "6. Conservation des données", p: [
        `Données de compte : conservées tant que le compte est actif.`,
        `Données de transaction et pièces justificatives : conservées jusqu'à sept (7) ans après la transaction, pour respecter les obligations comptables et fiscales.`,
        `Adresses de livraison : conservées tant qu'associées à un compte actif ou à une commande dont le délai de réclamation n'est pas expiré.`,
        `Messages de chat en direct : supprimés à la fin du live, sauf lorsqu'ils sont attachés à un signalement.`,
        `Enregistrements vidéo de lives : conservés à des fins de sécurité et de modération pour une durée limitée, puis supprimés ou anonymisés.`,
        `Après suppression du compte : les données identifiantes sont supprimées ou anonymisées, à l'exception des données que la loi impose de conserver (traçabilité comptable, lutte contre la fraude, obligations fiscales).`,
      ]},
      { h: "7. Droits des Utilisateurs", p: [
        `Sous réserve du droit applicable, chaque Utilisateur dispose des droits suivants sur ses renseignements personnels : accès, rectification, suppression, retrait du consentement (pour les traitements fondés sur le consentement), opposition, limitation, portabilité et, s'agissant de la Loi 25, désindexation dans les cas prévus par la loi.`,
        `Ces droits s'exercent : (i) directement depuis les Réglages de l'application (rectification du profil, suppression du compte) ou (ii) par courriel à ${PRIVACY_CONTACT_EMAIL}, en justifiant de son identité.`,
        `${APP_NAME} répond aux demandes dans un délai de trente (30) jours à compter de leur réception, prolongeable dans les cas complexes conformément à la loi.`,
      ]},
      { h: "8. Sécurité des données", p: [
        `${APP_NAME} met en œuvre des mesures techniques et organisationnelles raisonnables : chiffrement en transit (HTTPS/TLS), hachage des mots de passe, contrôle d'accès administratif journalisé, cloisonnement des environnements, sauvegardes régulières et procédures de gestion des incidents. En cas d'incident de confidentialité présentant un risque de préjudice sérieux, ${APP_NAME} notifie les autorités et les Utilisateurs concernés conformément à la Loi 25 et aux autres lois applicables.`,
      ]},
      { h: "9. Transferts internationaux", p: [
        `Les données peuvent être traitées et hébergées dans des pays situés en dehors du pays de résidence de l'Utilisateur, notamment au Canada, aux États-Unis ou dans l'Union européenne, selon la localisation des serveurs des sous-traitants. ${APP_NAME} encadre ces transferts par des mécanismes appropriés (clauses contractuelles types, évaluations d'impact, engagements équivalents à la Loi 25).`,
      ]},
      { h: "10. Mineurs", p: [
        `${APP_NAME} est réservée aux personnes majeures (18 ans et plus). Aucun traitement n'est délibérément effectué sur des données de mineurs. Si ${APP_NAME} apprend qu'un compte a été créé par un mineur, ce compte est supprimé et les données associées sont détruites.`,
      ]},
      { h: "11. Cookies et technologies similaires", p: [
        `${APP_NAME} utilise un stockage local minimal (préférences de langue, session d'authentification) et n'installe pas de cookies de suivi publicitaire tiers. Le site web peut utiliser des cookies strictement nécessaires au fonctionnement.`,
      ]},
      { h: "12. Modifications de la politique", p: [
        `${APP_NAME} peut mettre à jour la présente politique. Toute modification substantielle sera notifiée dans l'application ou par courriel. La date de dernière mise à jour figure en tête de document.`,
      ]},
      { h: "13. Réclamations et autorités de contrôle", p: [
        `Tout Utilisateur estimant que ses droits ne sont pas respectés peut adresser une réclamation à ${PRIVACY_CONTACT_EMAIL}. Il conserve également le droit de saisir l'autorité de contrôle compétente : la Commission d'accès à l'information du Québec (Loi 25), le Commissariat à la protection de la vie privée du Canada (LPRPDE), la CNIL pour la France, ou toute autre autorité équivalente de son pays de résidence.`,
      ]},
      { h: "14. Contact", p: [
        `Responsable de la protection des renseignements personnels : ${PRIVACY_CONTACT_EMAIL}.`,
        `Support : ${SUPPORT_CONTACT_EMAIL}.`,
        `Opérateur : ${OPERATOR_LEGAL_NAME}, ${OPERATOR_JURISDICTION}.`,
      ]},
    ],
  },

  community: {
    title: "Directives de la communauté",
    intro: `${APP_NAME} est un espace commercial en direct qui repose sur la confiance. Les présentes Directives précisent les comportements attendus, les produits et contenus interdits, ainsi que les conséquences en cas de manquement. Elles complètent les Conditions générales d'utilisation et s'appliquent à l'ensemble des lives, chats, profils, annonces et échanges.`,
    sections: [
      { h: "1. Produits strictement interdits", p: [
        `Contrefaçons et articles portant atteinte à des droits de propriété intellectuelle (marques, droit d'auteur, dessins et modèles).`,
        `Produits illégaux ou volés, biens obtenus par fraude.`,
        `Armes, munitions, explosifs, imitations d'armes, armes de collection réglementées.`,
        `Stupéfiants et substances psychoactives réglementées, précurseurs chimiques, produits dopants.`,
        `Médicaments soumis à prescription, dispositifs médicaux non conformes, compléments alimentaires interdits localement.`,
        `Alcool, tabac, cigarettes électroniques et produits associés lorsqu'un cadre réglementaire spécifique en interdit la vente à distance.`,
        `Animaux vivants, parties d'animaux, espèces protégées ou issues d'espèces menacées (CITES).`,
        `Contenus adultes ou sexuellement explicites, services à caractère sexuel.`,
        `Produits mettant en scène ou impliquant des mineurs de manière inappropriée.`,
        `Données personnelles de tiers, bases de données, comptes utilisateurs, identifiants ou moyens de paiement.`,
        `Devises, valeurs mobilières, actifs financiers réglementés, produits d'investissement, jeux d'argent.`,
        `Tout autre produit dont la vente est interdite par la loi applicable au Vendeur ou à l'Acheteur.`,
      ]},
      { h: "2. Comportements interdits", p: [
        `Arnaques, fausses ventes, systèmes pyramidaux, publicité mensongère, incitation au paiement en dehors de la Plateforme.`,
        `Harcèlement, discours haineux, discrimination fondée sur l'origine, l'ethnie, la religion, le sexe, l'orientation sexuelle, le handicap ou toute autre caractéristique protégée.`,
        `Menaces, incitation à la violence, doxxing (divulgation d'informations personnelles de tiers).`,
        `Usurpation d'identité, faux comptes, comptes multiples pour contourner une sanction.`,
        `Manipulation des enchères, collusion entre comptes, enchères fictives.`,
        `Spam, publicité non sollicitée, redirection vers des sites tiers concurrents ou frauduleux.`,
        `Contournement des mécanismes de séquestre ou de paiement.`,
      ]},
      { h: "3. Bonnes pratiques attendues", p: [
        `Décrire les articles honnêtement (état, taille, provenance, défauts éventuels) et illustrer avec des photos réelles.`,
        `Répondre aux questions en chat de manière respectueuse et professionnelle.`,
        `Expédier rapidement, emballer soigneusement et transmettre les informations de suivi.`,
        `Respecter les délais annoncés et communiquer proactivement en cas de retard.`,
        `Confirmer la réception d'une commande de manière honnête ; utiliser le litige uniquement en cas de problème avéré.`,
      ]},
      { h: "4. Conséquences graduées", p: [
        `Avertissement pour un premier manquement mineur.`,
        `Retrait du contenu, restriction temporaire de fonctionnalités (lives, chat, retraits) en cas de récidive ou de manquement modéré.`,
        `Suspension temporaire du compte, blocage du Portefeuille, retenue des gains en cas de faute grave ou de manquements répétés.`,
        `Bannissement définitif et suppression du contenu pour violations graves, comportements frauduleux, contrefaçon avérée ou infractions pénales.`,
        `Signalement aux autorités compétentes et coopération avec les enquêtes lorsque la loi l'exige.`,
      ]},
      { h: "5. Signaler un contenu ou un compte", p: [
        `Chaque Utilisateur peut signaler un live, un message, un profil ou une commande via l'action « Signaler » disponible dans l'application. L'action « Bloquer » masque immédiatement les contenus de l'utilisateur bloqué et transmet automatiquement un signalement à l'équipe de modération.`,
        `Les signalements sont examinés dans les meilleurs délais. Les signalements manifestement abusifs peuvent eux-mêmes faire l'objet de sanctions.`,
      ]},
    ],
  },
};

// ------------------------------------------------------------------
// ENGLISH (translation for information purposes; French version prevails)
// ------------------------------------------------------------------

export const LEGAL_EN: Bundle = {
  terms: {
    title: "Terms of Use",
    intro: `These Terms of Use ("Terms") govern access to and use of the ${APP_NAME} platform, operated by ${OPERATOR_LEGAL_NAME}, a company established in ${OPERATOR_JURISDICTION}. By creating an account or using ${APP_NAME}, the user acknowledges having read, understood and accepted these Terms, the Privacy Policy and the Community Guidelines, which together form an indivisible contractual whole. In case of discrepancy, the French version prevails.`,
    sections: [
      { h: "Table of contents", p: [
        `1. Definitions — 2. Acceptance and eligibility — 3. Nature of the service (technical intermediary) — 4. User accounts — 5. Seller obligations — 6. Buyer obligations — 7. Auctions — 8. Payments, wallet and fees — 9. Escrow and dispute handling — 10. Delivery — 11. User content and lives — 12. Moderation and sanctions — 13. Referral program — 14. Service availability — 15. Platform intellectual property — 16. Limitation of liability — 17. Indemnification — 18. Termination — 19. Governing law and jurisdiction — 20. Changes — 21. Miscellaneous — 22. Contact.`,
      ]},
      { h: "1. Definitions", p: [
        `"${APP_NAME}" or the "Platform": the mobile app and website operated by ${OPERATOR_LEGAL_NAME}, connecting independent sellers with buyers around live sales sessions.`,
        `"User": any natural person of legal age holding an account on the Platform.`,
        `"Seller": a User offering goods or content for sale on the Platform.`,
        `"Buyer": a User who purchases a good offered by a Seller.`,
        `"Sale Contract": the contract entered into directly between a Buyer and a Seller upon order or auction win; ${APP_NAME} is never a party thereto.`,
        `"Wallet": a prepaid balance linked to the User's account, usable exclusively within the Platform.`,
        `"Escrow": the mechanism whereby funds paid by the Buyer are held until delivery confirmation or expiry of the contractual period.`,
      ]},
      { h: "2. Acceptance and eligibility", p: [
        `Use of ${APP_NAME} is strictly reserved to natural persons aged at least eighteen (18) with full legal capacity to contract under the law of their country of residence.`,
        `By signing up, the User represents and warrants that (i) they meet these age and capacity requirements, (ii) the information provided is accurate, complete and up to date, and (iii) they are not subject to any sanction or legal prohibition preventing their use of an online marketplace.`,
        `Acceptance of these Terms, the Privacy Policy and the Community Guidelines is a prerequisite to access the service. Refusal or withdrawal of such acceptance results in account termination.`,
      ]},
      { h: "3. Nature of the service — technical intermediary role", p: [
        `${APP_NAME} is a technical intermediation platform whose sole purpose is to connect independent Sellers with Buyers and to enable the live broadcasting of sales sessions.`,
        `${APP_NAME} IS NOT the seller of goods offered on the Platform. ${APP_NAME} is never a party to the Sale Contract between Buyer and Seller. ${APP_NAME} does not own, store, handle or ship any goods.`,
        `${APP_NAME} DOES NOT WARRANT the existence, quality, authenticity, conformity, legality, availability, safety or delivery of goods offered by Sellers. ${APP_NAME} does not screen listings a priori and assumes no editorial responsibility for User content, subject to its statutory hosting obligations and its ex-post moderation mechanisms.`,
        `Every sale made through ${APP_NAME} is a direct contract between Buyer and Seller, governed by the terms agreed between them and by the law applicable to them. Any claim relating to a purchased good must be addressed first to the relevant Seller.`,
        `${APP_NAME} nonetheless provides ancillary tools facilitating the transaction: live video, chat, auction system, third-party payment collection, escrow, and an internal dispute-handling procedure as described in section 9.`,
      ]},
      { h: "4. User accounts", p: [
        `Each User may hold only one account. Impersonation, fake accounts and circumventing a sanction by creating a new account are strictly prohibited.`,
        `The User is solely responsible for the confidentiality of their credentials and for all activity on their account. Any suspicious use must be reported to ${SUPPORT_CONTACT_EMAIL}.`,
        `${APP_NAME} may request additional identity verification, particularly for Sellers, to prevent fraud and comply with applicable law (AML, KYC).`,
      ]},
      { h: "5. Seller obligations", p: [
        `The Seller shall describe items accurately and completely (condition, size, brand, origin, defects) and only post listings that comply with the law and the Community Guidelines.`,
        `Counterfeiting and sale of items infringing intellectual property rights are strictly prohibited and expose the Seller to removal, ban and any relevant legal action.`,
        `The Seller warrants that it holds all rights, licences and authorisations required to sell the offered goods, including where subject to specific regulations.`,
        `The Seller is solely responsible for shipping within announced timeframes, for the choice of carrier, for packaging and tracking, and for after-sales service to the Buyer.`,
        `The Seller alone bears all tax, social, customs and reporting obligations relating to sales made through ${APP_NAME}. It is the Seller's responsibility to declare income to competent authorities and, where applicable, collect and remit any tax (GST/QST, VAT, customs duties, etc.). ${APP_NAME} may be required to transmit certain information to tax authorities in accordance with applicable law.`,
        `The Seller shall indemnify ${APP_NAME} and its affiliates from any claim, action, damage, cost or expense (including reasonable attorneys' fees) arising, directly or indirectly, from its listings, sales or breach of these Terms.`,
      ]},
      { h: "6. Buyer obligations", p: [
        `The Buyer shall carefully read each item's description, place bids only in full knowledge and honour payments due.`,
        `The Buyer shall confirm receipt of orders honestly and shall not raise abusive disputes. False statements may result in sanctions, retroactive payout to the Seller and account exclusion.`,
        `The Buyer acknowledges that they purchase from the Seller, not from ${APP_NAME}. Return, exchange and warranty requests fall primarily on the Seller, subject to mandatory consumer rights.`,
      ]},
      { h: "7. Auctions", p: [
        `Any bid placed on ${APP_NAME} is a firm, irrevocable and immediately enforceable commitment to buy the auctioned item at the reached price if declared the winning bid.`,
        `The auction mechanism relies on a countdown reset with each new bid ("sudden death") until expiry. On expiry, the highest last bid wins and payment is debited (or captured from the Wallet) without further confirmation.`,
        `Failure to pay a winning bid is a serious breach and may lead to sale cancellation, sanctions (warning, suspension, ban), Wallet suspension and processing fees.`,
        `${APP_NAME} may, in its reasonable discretion, cancel or invalidate a bid in case of manifest technical error, exploit, malfunction, fraud or collusion, without liability beyond refund of any wrongfully collected amounts.`,
      ]},
      { h: "8. Payments, wallet and fees", p: [
        `Payments are processed exclusively by third-party payment service providers (notably Stripe and, in some regions, Wave or Orange Money). ${APP_NAME} never stores card numbers or banking authentication data.`,
        `The "${APP_NAME} Wallet" is a prepaid balance linked to the account, usable only for payments or receipt of earnings within the Platform. It is NOT a bank account, bears NO interest, is not a payment instrument outside ${APP_NAME}, and is not covered by any deposit guarantee scheme.`,
        `${APP_NAME} charges a default service fee equal to five percent (5%) of the price paid by the Buyer, excluding shipping fees. This rate may be modified at any time on reasonable notice given in-app or by email. The new rate applies to sales concluded after its effective date.`,
        `Seller earnings are credited to the Wallet after delivery confirmation or expiry of the escrow period, net of the platform fee and, where applicable, payment providers' processing fees.`,
        `Payouts are subject to a minimum threshold, to daily and weekly caps based on the account verification level (new, certified badge, ID KYC), to timeframes specific to the chosen method, and to anti-fraud and compliance checks. ${APP_NAME} may suspend or refuse a payout suspected of fraud pending full verification.`,
        `Virtual gifts and digital goods are deemed delivered and consumed upon send/activation; they are NEITHER refundable NOR convertible into legal tender, unless mandatory law provides otherwise.`,
      ]},
      { h: "9. Escrow and dispute handling", p: [
        `Amounts paid by the Buyer are held in technical escrow until (i) express confirmation of receipt by the Buyer, or (ii) expiry of a seven (7) day period from confirmed shipment marker by the Seller, without complaint by the Buyer — whichever occurs first.`,
        `On escrow release, funds are made available to the Seller, subject to any sanctions, holds or deductions provided herein.`,
        `In case of disagreement (item not received, non-conforming, damaged, counterfeit, misleading description), a User may open an internal dispute via the app. The internal dispute procedure comprises: (a) opening by the complainant with description and evidence, (b) response by the other party within a reasonable time, (c) optional collection of further evidence by ${APP_NAME}, (d) reasoned decision by ${APP_NAME}.`,
        `${APP_NAME}'s decision in the internal procedure is rendered in good faith, based on the evidence provided and the Platform's technical data, in ${APP_NAME}'s reasonable discretion. It may consist of: release of funds to the Seller, full or partial refund to the Buyer, or any other precautionary measure.`,
        `${APP_NAME}'s intervention in an internal dispute is an assistance service and does not constitute judicial arbitration. It does not deprive parties of their right to sue each other. ${APP_NAME}'s liability cannot be engaged for its internal decision, save proven gross negligence or wilful misconduct.`,
      ]},
      { h: "10. Delivery", p: [
        `Delivery is organised under the sole responsibility of the Seller. ${APP_NAME} performs no transport, handling, storage or logistics activity and assumes no responsibility for loss, theft, delay, damage or non-delivery.`,
        `The Platform offers several shipping fee models (by zones, flat fees, or pay-on-delivery). The Seller sets its shipping model and fees at listing time; this information is displayed to the Buyer before checkout.`,
        `Delivery timeframes are indicative unless the Seller commits otherwise.`,
      ]},
      { h: "11. User content and lives", p: [
        `The User retains ownership of the content they post (listings, photos, videos, lives, messages, avatars). They grant ${APP_NAME}, free of charge, a worldwide, non-exclusive, transferable and sublicensable licence, for the statutory protection term, to host, reproduce, adapt, distribute, promote and archive the content in connection with the service.`,
        `The User warrants that they hold all necessary rights, including image rights of filmed persons, and shall not post: illegal, misleading, defamatory, hateful, discriminatory, harassing, sexually explicit content; content depicting minors inappropriately; content inciting violence or infringing third-party rights.`,
        `Lives may be recorded for safety and moderation. Recordings are not made public by default.`,
      ]},
      { h: "12. Moderation and sanctions", p: [
        `${APP_NAME} may, at any time and in its reasonable discretion, remove content, end a live, restrict features, warn, temporarily suspend or permanently ban an account for breach of these Terms, the Community Guidelines or the law.`,
        `A banned account can no longer access the service. Any attempt to circumvent (new account, changed credentials) is an additional breach.`,
        `Any User may report content or an account via the "Report" action. The "Block" action instantly hides content from the blocked account and forwards a report to the moderation team.`,
      ]},
      { h: "12A. Anti-fraud, AML/CFT", p: [
        `${APP_NAME} implements reasonable measures to prevent fraud, money laundering and terrorist financing, consistent with standards applicable in ${OPERATOR_JURISDICTION}.`,
        `Operational caps apply as a preventive measure: maximum Wallet balance of 1,000,000 XOF, 2,000 EUR or 3,000 CAD; top-ups, Wallet spend (purchases and gifts) and gifts received are subject to daily caps, lower for unverified accounts and higher for verified accounts. Caps may be revised at any time.`,
        `${APP_NAME} may, as a precautionary measure and without prior notice, temporarily freeze an account (blocking withdrawals, wallet purchases and virtual gifts) upon reasonable indicators of fraud — including: recent account with abnormally high activity, unusual buyer concentration, very short recharge→purchase→withdrawal cycle, first withdrawal for an unusual amount, contact information shared between buyer and seller, disputes or chargebacks, or any other anomaly flagged by our control systems.`,
        `A freeze is a verification measure, distinct from suspension or ban. The User is notified via in-app message stating the reason and may submit any relevant supporting document to support. The account is reactivated once verification is complete if no irregularity is confirmed.`,
        `${APP_NAME} may refuse a transaction, require additional information (identity, source-of-funds evidence, proof of ownership of the sold item), file a suspicious-transaction report with competent authorities when required by law, and cooperate with any judicial request.`,
        `Any attempt to circumvent these measures (multiple accounts, structuring, forged documents) is a material breach and may lead to permanent closure of the accounts involved and retention of funds until resolution.`,
      ]},
      { h: "13. Referral program", p: [
        `${APP_NAME} may offer a referral program. Detailed terms (amounts, caps, triggers, exclusions) are described in the dedicated screen.`,
        `${APP_NAME} may modify, suspend or close the program at any time on reasonable notice. Fraudulent behaviour (fake accounts, self-referral, activity manipulation) results in immediate cancellation of earnings, closure of the accounts involved and exclusion.`,
      ]},
      { h: "14. Service availability", p: [
        `${APP_NAME} is provided "AS IS" and "AS AVAILABLE". No warranty of continuous availability, error-free operation, fitness for a particular purpose or commercial results is given.`,
        `Technical interruptions may occur for maintenance, network incidents, third-party outages or force majeure. ${APP_NAME} shall not be liable for loss of earnings, interrupted auctions, dropped lives, undelivered messages or other inconvenience resulting from such interruptions.`,
      ]},
      { h: "15. Platform intellectual property", p: [
        `${APP_NAME} trademarks, logos, interface, source code, databases and designs are the exclusive property of ${OPERATOR_LEGAL_NAME} or its licensors. Any unauthorised reproduction, extraction, reuse or decompilation is prohibited.`,
      ]},
      { h: "16. Limitation of liability", p: [
        `To the fullest extent permitted by applicable law, ${APP_NAME} shall not be liable for indirect, immaterial or consequential damages, including lost profits, lost opportunities, business losses, reputational harm or loss of data.`,
        `To the fullest extent permitted by applicable law, ${APP_NAME}'s aggregate liability to a User in respect of a given transaction is capped at the commission actually collected by ${APP_NAME} on that transaction. Absent commission, a reasonable flat cap of CAD 100 applies.`,
        `Nothing herein limits ${APP_NAME}'s liability for gross negligence, wilful misconduct, fraud or death and personal injury resulting from breach of statutory obligations.`,
        `Mandatory consumer rights under the law of the User's country of residence — including Quebec's Consumer Protection Act, French/EU consumer law, or Ivorian regulations — remain fully applicable and prevail over any contrary stipulation.`,
      ]},
      { h: "17. Indemnification", p: [
        `The User shall indemnify and hold harmless ${APP_NAME}, ${OPERATOR_LEGAL_NAME}, their affiliates, officers, employees and contractors from any claim, action, damage, cost, loss or expense (including reasonable attorneys' fees) arising from (i) breach of these Terms, the Privacy Policy or the law, (ii) their content, (iii) a transaction to which they are a party, (iv) infringement of third-party rights.`,
      ]},
      { h: "18. Termination", p: [
        `The User may delete their account at any time from app settings. Before deletion, the User must withdraw or spend the Wallet balance: any balance not withdrawn upon deletion may be permanently lost, save mandatory law.`,
        `${APP_NAME} may terminate an account, with immediate effect and without compensation, for serious or repeated breach, without prejudice to damages suffered.`,
        `Provisions whose nature warrants survival (notably sections 5, 8, 9, 15, 16, 17, 19 and 21) survive termination.`,
      ]},
      { h: "19. Governing law and jurisdiction", p: [
        `These Terms are governed by the laws in force in ${OPERATOR_JURISDICTION}, excluding conflict-of-laws rules.`,
        `Any dispute concerning the formation, performance or interpretation hereof shall be submitted to the courts of the judicial district of Montreal (Quebec), subject to mandatory consumer-protection rules applicable in the User's country of residence which may allow them to bring proceedings in their home courts.`,
      ]},
      { h: "20. Changes to the Terms", p: [
        `${APP_NAME} may amend these Terms at any time. Material changes will be notified in-app or by email with reasonable notice.`,
        `Absent written objection prior to effectiveness, continued use of the service constitutes acceptance. A User who refuses the new Terms may terminate their account per section 18.`,
      ]},
      { h: "21. Miscellaneous", p: [
        `Force majeure: neither party is liable for breach caused by a force majeure event under applicable law.`,
        `Severability: invalidity of any clause does not affect the other clauses.`,
        `No waiver: failure to exercise a right does not waive it.`,
        `Assignment: ${APP_NAME} may assign these Terms in the context of a reorganisation, merger or asset sale. The User may not assign their account without prior written consent.`,
        `Entire agreement: these Terms, the Privacy Policy and the Community Guidelines constitute the entire agreement between the parties.`,
      ]},
      { h: "22. Contact", p: [
        `Legal: ${LEGAL_CONTACT_EMAIL}.`,
        `Support: ${SUPPORT_CONTACT_EMAIL}.`,
        `Operator: ${OPERATOR_LEGAL_NAME}, ${OPERATOR_JURISDICTION}.`,
      ]},
    ],
  },

  privacy: {
    title: "Privacy Policy",
    intro: `This Privacy Policy describes how ${OPERATOR_LEGAL_NAME}, operator of ${APP_NAME}, collects, uses, shares and protects Users' personal information. It complies with Quebec's Act respecting the protection of personal information in the private sector ("Law 25"), Canada's PIPEDA, the EU General Data Protection Regulation ("GDPR") for EU Users, and other applicable rules in jurisdictions where ${APP_NAME} operates. In case of discrepancy, the French version prevails.`,
    sections: [
      { h: "Table of contents", p: [
        `1. Controller — 2. Data collected — 3. Purposes and legal bases — 4. Sharing with third parties — 5. Delivery details and buyer-seller communication — 6. Retention — 7. User rights — 8. Security — 9. International transfers — 10. Minors — 11. Cookies — 12. Changes — 13. Complaints and supervisory authorities — 14. Contact.`,
      ]},
      { h: "1. Controller and privacy officer", p: [
        `Controller: ${OPERATOR_LEGAL_NAME}, operator of ${APP_NAME}, ${OPERATOR_JURISDICTION}.`,
        `Under Law 25, ${OPERATOR_LEGAL_NAME} has appointed a Privacy Officer, reachable at: ${PRIVACY_CONTACT_EMAIL}, in charge of ensuring compliance and handling rights requests.`,
      ]},
      { h: "2. Data collected", p: [
        `Account: email, display name, public handle, country, preferred language and currency, account creation date.`,
        `Profile: avatar, bio, seller status, preferences.`,
        `Delivery details: recipient full name, detailed postal address, delivery phone number, chosen delivery zone, special instructions.`,
        `Transaction and wallet data: history of top-ups, purchases, sales, payouts, wallet movements. Card numbers and banking authentication data are NOT stored by ${APP_NAME}; they are sent directly to our payment processor (Stripe, PCI-DSS Level 1).`,
        `Content posted: live titles/categories, cover images, listed products, bids, chat messages, audio/video broadcast during lives, reports and blocks issued.`,
        `Usage & device: device type, OS, language, IP address, technical session identifier, in-app actions (aggregated metrics).`,
        `Approximate location: derived from IP or account country, to surface relevant lives. No precise GPS location is collected without explicit consent.`,
        `Push notifications: device tokens transmitted to APNs and Firebase Cloud Messaging.`,
      ]},
      { h: "3. Purposes and legal bases", p: [
        `Provide the service (contract performance): account, lives, orders, payouts, transactional communications.`,
        `Payment processing (contract and legal obligation): collections, escrow, payouts, AML.`,
        `Security and fraud prevention (legitimate interest and legal obligation).`,
        `Moderation and Terms enforcement (legitimate interest).`,
        `User support (contract performance).`,
        `Non-essential marketing (consent): only after explicit opt-in; withdrawable at any time.`,
        `Legal and tax obligations: retention of records, response to authorities.`,
      ]},
      { h: "4. Sharing with third parties", p: [
        `Technical sub-processors, bound by contractual confidentiality and security commitments: Stripe (payments, payouts, KYC — stripe.com/privacy); LiveKit (real-time live streaming); Supabase (database hosting, auth, file storage); APNs and Firebase Cloud Messaging (push); transactional email providers and aggregated analytics.`,
        `Seller of an order: when a Buyer places an order, the Seller receives the delivery details needed to fulfil (name, address, phone, instructions). The Seller acts as an independent controller for those data and contractually undertakes to use them solely to fulfil the order, not to retain them beyond legal periods, and not to transfer them to third parties.`,
        `Authorities: only where required by law or to protect the rights, safety or property of Users and ${APP_NAME}.`,
        `${APP_NAME} NEVER SELLS personal information to third parties and does not use it for external behavioural advertising.`,
      ]},
      { h: "5. Delivery details and buyer-seller communication", p: [
        `A Buyer's delivery details are shared with the Seller only for the order concerned; they are not made public.`,
        `Any misuse by a Seller (unsolicited marketing, resale, harassment) constitutes a serious breach and legal violation, exposing to platform sanctions and legal action.`,
      ]},
      { h: "6. Retention", p: [
        `Account data: retained while the account is active.`,
        `Transaction data and records: retained up to seven (7) years post-transaction, for accounting and tax obligations.`,
        `Delivery addresses: retained while associated with an active account or an order whose complaint period has not expired.`,
        `Live chat messages: deleted at the end of the live, unless attached to a report.`,
        `Live video recordings: retained for a limited period for safety and moderation, then deleted or anonymised.`,
        `Upon account deletion: identifying data are deleted or anonymised, except data required to be kept by law.`,
      ]},
      { h: "7. User rights", p: [
        `Subject to applicable law, each User has rights of access, rectification, deletion, withdrawal of consent (where consent is the basis), objection, restriction, portability and, under Law 25, de-indexation in cases provided for by law.`,
        `Rights may be exercised (i) directly in-app (profile rectification, account deletion) or (ii) by email to ${PRIVACY_CONTACT_EMAIL}, evidencing identity.`,
        `${APP_NAME} answers requests within thirty (30) days of receipt, extendable in complex cases as permitted by law.`,
      ]},
      { h: "8. Security", p: [
        `${APP_NAME} implements reasonable technical and organisational measures: TLS in transit, password hashing, logged admin access, environment segregation, regular backups and incident procedures. Confidentiality incidents entailing serious harm risk are notified to authorities and Users as required by Law 25 and other applicable laws.`,
      ]},
      { h: "9. International transfers", p: [
        `Data may be processed and hosted outside the User's country of residence, notably in Canada, the United States or the European Union, depending on sub-processors' server locations. Transfers are safeguarded by appropriate mechanisms (standard contractual clauses, impact assessments, Law 25-equivalent commitments).`,
      ]},
      { h: "10. Minors", p: [
        `${APP_NAME} is reserved to persons aged 18+. No processing of minors' data is deliberately performed. Accounts identified as belonging to minors are deleted and their data destroyed.`,
      ]},
      { h: "11. Cookies and similar technologies", p: [
        `${APP_NAME} uses minimal local storage (language preferences, auth session) and does not install third-party advertising cookies. The website may use strictly necessary cookies.`,
      ]},
      { h: "12. Changes", p: [
        `${APP_NAME} may update this policy. Material changes will be notified in-app or by email. The last-updated date is shown at the top of the document.`,
      ]},
      { h: "13. Complaints and supervisory authorities", p: [
        `Users may complain to ${PRIVACY_CONTACT_EMAIL} and, additionally, seise the competent supervisory authority: Commission d'accès à l'information du Québec (Law 25), Office of the Privacy Commissioner of Canada (PIPEDA), CNIL for France, or any equivalent authority.`,
      ]},
      { h: "14. Contact", p: [
        `Privacy Officer: ${PRIVACY_CONTACT_EMAIL}.`,
        `Support: ${SUPPORT_CONTACT_EMAIL}.`,
        `Operator: ${OPERATOR_LEGAL_NAME}, ${OPERATOR_JURISDICTION}.`,
      ]},
    ],
  },

  community: {
    title: "Community Guidelines",
    intro: `${APP_NAME} is a live commerce space built on trust. These Guidelines set out expected behaviour, prohibited goods and content, and consequences for breach. They supplement the Terms and apply to all lives, chats, profiles, listings and exchanges.`,
    sections: [
      { h: "1. Strictly prohibited goods", p: [
        `Counterfeits and items infringing IP rights (trademarks, copyright, design rights).`,
        `Illegal or stolen goods, items obtained by fraud.`,
        `Weapons, ammunition, explosives, replica weapons, regulated collectible weapons.`,
        `Narcotics, regulated psychoactive substances, precursors, doping products.`,
        `Prescription drugs, non-compliant medical devices, locally prohibited supplements.`,
        `Alcohol, tobacco, e-cigarettes where remote sale is regulated.`,
        `Live animals, animal parts, protected or endangered species (CITES).`,
        `Adult or sexually explicit content, sexual services.`,
        `Content depicting minors inappropriately.`,
        `Third-party personal data, databases, user accounts, credentials or payment instruments.`,
        `Currencies, securities, regulated financial products, gambling.`,
        `Any other good whose sale is prohibited by the law applicable to Seller or Buyer.`,
      ]},
      { h: "2. Prohibited behaviour", p: [
        `Scams, fake sales, pyramid schemes, misleading advertising, off-platform payment solicitation.`,
        `Harassment, hate speech, discrimination on any protected characteristic.`,
        `Threats, incitement to violence, doxxing.`,
        `Impersonation, fake accounts, multiple accounts to bypass sanctions.`,
        `Bid manipulation, collusion between accounts, sham bids.`,
        `Spam, unsolicited advertising, redirection to competing or fraudulent sites.`,
        `Circumvention of escrow or payment mechanisms.`,
      ]},
      { h: "3. Expected good practices", p: [
        `Describe items honestly (condition, size, origin, defects) with genuine photos.`,
        `Answer chat questions respectfully and professionally.`,
        `Ship promptly, pack carefully, share tracking information.`,
        `Meet announced timelines and communicate proactively when delayed.`,
        `Confirm order receipt honestly; only open disputes for genuine issues.`,
      ]},
      { h: "4. Graduated consequences", p: [
        `Warning for a first minor breach.`,
        `Content removal, temporary feature restriction (lives, chat, payouts) for repeat or moderate breach.`,
        `Temporary suspension, Wallet freeze, earnings hold for serious or repeated breach.`,
        `Permanent ban and content removal for serious breaches, fraud, proven counterfeiting or criminal offences.`,
        `Reporting to authorities and cooperation with investigations as required.`,
      ]},
      { h: "5. Reporting", p: [
        `Any User may report a live, message, profile or order via the "Report" action. The "Block" action instantly hides the blocked user's content and automatically transmits a report to the moderation team.`,
        `Reports are reviewed as soon as possible. Manifestly abusive reports may themselves be sanctioned.`,
      ]},
    ],
  },
};

export function pickLegal(lang: string | undefined | null): Bundle {
  return lang === "en" ? LEGAL_EN : LEGAL_FR;
}
