import * as React from "react";
import {
  Body,
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
} from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { EMAIL_CONFIG } from "@/lib/email/config";

interface EmailConfirmProps {
  displayName?: string;
  code?: string;
  appUrl?: string;
}

const EmailConfirmEmail = ({
  displayName,
  code = "000000",
  appUrl = EMAIL_CONFIG.WEB_URL,
}: EmailConfirmProps) => {
  const cleanName = displayName?.trim();
  const greetingName = cleanName || "à toi";

  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>Ton code KiDi+ : {code}</Preview>
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
            <Text style={tagline}>L&apos;app où tout le monde dit plus.</Text>
          </Section>

          <Section style={card}>
            <Heading style={h1}>Confirme ton email ✉️</Heading>
            <Text style={paragraph}>Bonjour {greetingName},</Text>
            <Text style={paragraph}>
              Pour sécuriser ton compte <strong>KIDI+</strong>, entre ce code dans
              l&apos;app. Personne d&apos;autre ne doit le voir.
            </Text>

            <Section style={codeWrap}>
              <Text style={codeText}>{code}</Text>
            </Section>

            <Text style={paragraph}>
              Le code est valable <strong>15 minutes</strong>. Si tu n&apos;as pas
              demandé cette confirmation, ignore simplement cet email.
            </Text>

            <Hr style={hr} />

            <Text style={signature}>
              À très bientôt,
              <br />
              L&apos;équipe KIDI+
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              <Link href={appUrl} style={footerLink}>
                kidiplus.com
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: EmailConfirmEmail,
  subject: "🔐 Ton code de confirmation KIDI+",
  displayName: "Email confirmation OTP",
  previewData: {
    displayName: "Madina",
    code: "482193",
    appUrl: EMAIL_CONFIG.WEB_URL,
  },
} satisfies TemplateEntry;

const main: React.CSSProperties = {
  backgroundColor: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  padding: "24px 16px",
};

const header: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 0 24px",
};

const logo: React.CSSProperties = {
  display: "block",
  margin: "0 auto 8px",
  maxWidth: "140px",
  height: "auto",
};

const tagline: React.CSSProperties = {
  fontSize: "13px",
  color: "#6B7280",
  margin: "6px 0 0",
  fontStyle: "italic",
};

const card: React.CSSProperties = {
  backgroundColor: "#EEF4FF",
  border: "1px solid #DCE7FB",
  borderRadius: "16px",
  padding: "32px 24px",
};

const h1: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#10162B",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#1F2937",
  margin: "0 0 12px",
};

const codeWrap: React.CSSProperties = {
  textAlign: "center",
  margin: "28px 0",
  padding: "20px",
  backgroundColor: "#10162B",
  borderRadius: "16px",
};

const codeText: React.CSSProperties = {
  fontSize: "36px",
  fontWeight: 800,
  letterSpacing: "10px",
  color: "#ffffff",
  margin: 0,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

const hr: React.CSSProperties = {
  borderColor: "#E5E7EB",
  margin: "28px 0",
};

const signature: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "22px",
  color: "#1F2937",
  margin: "20px 0 0",
};

const footer: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 0",
};

const footerText: React.CSSProperties = {
  fontSize: "12px",
  color: "#9CA3AF",
  margin: 0,
};

const footerLink: React.CSSProperties = {
  color: "#9CA3AF",
  textDecoration: "underline",
};
