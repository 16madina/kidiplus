import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EMAIL_CONFIG, buildOpenLink } from '@/lib/email/config'

interface WelcomeProps {
  displayName?: string
  appUrl?: string
}

const WelcomeEmail = ({ displayName, appUrl = EMAIL_CONFIG.WEB_URL }: WelcomeProps) => {
  const cleanName = displayName?.trim()
  const greetingName = cleanName || 'à toi'
  const openLink = (path: string) => buildOpenLink(path, appUrl)

  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>
        {cleanName ? `Bienvenue ${cleanName} sur KIDI+ 👋` : 'Bienvenue sur KIDI+ 👋'}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={EMAIL_CONFIG.LOGO_URL}
              alt={EMAIL_CONFIG.APP_NAME}
              width="140"
              height="140"
              style={logo}
            />
            <Text style={tagline}>L'app où tout le monde dit plus.</Text>
          </Section>

          <Section style={card}>
            <Heading style={h1}>
              {cleanName ? `Bienvenue ${cleanName} 👋` : 'Bienvenue sur KIDI+ 👋'}
            </Heading>
            <Text style={paragraph}>Bonjour {greetingName},</Text>
            <Text style={paragraph}>
              Merci d'avoir rejoint <strong>KIDI+</strong>, la plateforme où le live shopping
              rencontre les enchères en temps réel.
            </Text>
            <Text style={paragraph}>
              Que tu souhaites acheter, vendre ou simplement découvrir des produits uniques, tu
              es au bon endroit.
            </Text>

            <Heading as="h2" style={h2}>Avec KIDI+, tu peux :</Heading>
            <Text style={bullet}>🛍️ Découvrir des milliers de produits en direct.</Text>
            <Text style={bullet}>🔨 Participer à des enchères en temps réel.</Text>
            <Text style={bullet}>⚡ Acheter instantanément tes produits préférés.</Text>
            <Text style={bullet}>🎁 Interagir avec les vendeurs (commentaires, likes, cadeaux).</Text>
            <Text style={bullet}>💼 Créer ta boutique et vendre en quelques minutes.</Text>

            <Section style={ctaWrap}>
              <Button href={openLink('/sell/onboarding')} style={ctaButton}>
                🚀 Créer ma boutique
              </Button>
            </Section>

            <Heading as="h2" style={h2}>Prêt à commencer ?</Heading>
            <Text style={step}>1️⃣ Complète ton profil.</Text>
            <Text style={step}>2️⃣ Crée ta boutique.</Text>
            <Text style={step}>3️⃣ Ajoute tes premiers articles.</Text>
            <Text style={step}>4️⃣ Lance ton premier live.</Text>

            <Text style={paragraph}>
              Ta prochaine vente n'est peut-être qu'à un clic.
            </Text>

            <Section style={ctaWrap}>
              <Button href={openLink('/')} style={ctaButtonSecondary}>
                👉 Commencer maintenant
              </Button>
            </Section>

            <Hr style={hr} />

            <Text style={bonus}>
              💡 <strong>Nouveau sur KIDI+ ?</strong> Regarde notre démonstration directement
              depuis la page d'accueil de l'app et découvre en moins d'une minute comment lancer
              ton premier live et vendre tes articles.
            </Text>

            <Text style={paragraph}>
              Merci de faire partie de la communauté KIDI+. On a hâte de te voir acheter, vendre
              et vivre l'expérience du live shopping.
            </Text>

            <Text style={signature}>
              À très bientôt,<br />
              L'équipe KIDI+
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              <Link href={appUrl} style={footerLink}>kidiplus.com</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WelcomeEmail,
  subject: '🎉 Bienvenue sur KIDI+ ! Votre aventure commence maintenant.',
  displayName: 'Welcome Email',
  previewData: { displayName: 'Lazone', appUrl: EMAIL_CONFIG.WEB_URL },
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
}

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '24px 16px',
}

const header: React.CSSProperties = {
  textAlign: 'center',
  padding: '16px 0 24px',
}

const logo: React.CSSProperties = {
  display: 'block',
  margin: '0 auto 8px',
  maxWidth: '140px',
  height: 'auto',
}

const brand: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 800,
  color: '#10162B',
  margin: 0,
  letterSpacing: '-0.5px',
}

const tagline: React.CSSProperties = {
  fontSize: '13px',
  color: '#6B7280',
  margin: '6px 0 0',
  fontStyle: 'italic',
}

const card: React.CSSProperties = {
  backgroundColor: '#EEF4FF',
  border: '1px solid #DCE7FB',
  borderRadius: '16px',
  padding: '32px 24px',
}

const h1: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#10162B',
  margin: '0 0 16px',
}

const h2: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: '#10162B',
  margin: '24px 0 12px',
}

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#1F2937',
  margin: '0 0 12px',
}

const bullet: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#1F2937',
  margin: '6px 0',
}

const step: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#1F2937',
  margin: '4px 0',
}

const ctaWrap: React.CSSProperties = {
  textAlign: 'center',
  margin: '24px 0',
}

const ctaButton: React.CSSProperties = {
  backgroundColor: '#E11D48',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '999px',
  fontWeight: 700,
  fontSize: '15px',
  textDecoration: 'none',
  display: 'inline-block',
}

const ctaButtonSecondary: React.CSSProperties = {
  backgroundColor: '#10162B',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '999px',
  fontWeight: 700,
  fontSize: '15px',
  textDecoration: 'none',
  display: 'inline-block',
}

const hr: React.CSSProperties = {
  borderColor: '#E5E7EB',
  margin: '28px 0',
}

const bonus: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#374151',
  backgroundColor: '#FFF7ED',
  padding: '14px 16px',
  borderRadius: '12px',
  margin: '0 0 16px',
}

const signature: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#1F2937',
  margin: '20px 0 0',
}

const footer: React.CSSProperties = {
  textAlign: 'center',
  padding: '16px 0',
}

const footerText: React.CSSProperties = {
  fontSize: '12px',
  color: '#9CA3AF',
  margin: 0,
}

const footerLink: React.CSSProperties = {
  color: '#9CA3AF',
  textDecoration: 'underline',
}
