import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

interface CompanyEmailVerificationEmailProps {
  companyName: string;
  verifyLink: string;
}

export const CompanyEmailVerificationEmail = ({
  companyName = 'Musterfirma',
  verifyLink = 'https://theomnistack.de/settings/verify-email?token=preview'
}: CompanyEmailVerificationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Bestätige die neue Firmen-E-Mail-Adresse für {companyName}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white border border-gray-200 rounded-xl my-[40px] mx-auto p-[20px] w-[465px] shadow-sm">
            <Section className="mt-[32px] text-center">
              <Img
                src="https://app.theomnistack.de/apple-icon.png"
                width="64"
                height="64"
                alt="TheOmniStack Logo"
                className="mx-auto rounded-xl"
                style={{
                  margin: '0 auto',
                  borderRadius: '12px',
                  display: 'block',
                }}
              />
            </Section>
            <Section className="mt-[20px]">
              <Heading className="text-black text-[24px] font-bold text-center p-0 my-[20px] mx-0">
                Firmen-E-Mail-Adresse bestätigen 📧
              </Heading>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                Hallo,
              </Text>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                du hast eine neue E-Mail-Adresse für dein Unternehmen <strong>{companyName}</strong> hinterlegt.
                Bevor diese Adresse auf Dokumenten (Rechnungen, Angeboten etc.) gedruckt oder als Absenderadresse verwendet werden kann, muss sie verifiziert werden.
              </Text>
              
              <Section className="text-center mt-[32px] mb-[32px]">
                <Button
                  className="bg-blue-600 rounded-lg text-white text-[14px] font-bold no-underline text-center px-6 py-3"
                  style={{
                    backgroundColor: '#2563eb',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textDecoration: 'none',
                    textAlign: 'center',
                    display: 'inline-block',
                    padding: '12px 24px',
                  }}
                  href={verifyLink}
                >
                  E-Mail-Adresse verifizieren
                </Button>
              </Section>

              <Text className="text-gray-500 text-[12px] leading-[24px]">
                Oder kopiere diesen Link in deinen Browser:{' '}
                <a href={verifyLink} className="text-blue-600 no-underline">
                  {verifyLink}
                </a>
              </Text>

              <Hr className="border border-solid border-gray-200 my-[26px] mx-0 w-full" />
              
              <Text className="text-gray-400 text-[12px] leading-[24px]">
                Wenn du diese Änderung nicht veranlasst hast, kannst du diese E-Mail einfach ignorieren. Es wird weiterhin die alte verifizierte E-Mail-Adresse verwendet.
                <br />
                TheOmniStack Team
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default CompanyEmailVerificationEmail;
