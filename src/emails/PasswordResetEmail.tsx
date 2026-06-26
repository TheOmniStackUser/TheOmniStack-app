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

interface PasswordResetEmailProps {
  resetLink: string;
}

export const PasswordResetEmail = ({ resetLink = 'https://theomnistack.de/reset-password?token=preview' }: PasswordResetEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Setze dein Passwort für TheOmniStack zurück</Preview>
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
                Passwort zurücksetzen
              </Heading>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                Hallo,
              </Text>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                jemand hat eine Anfrage gestellt, um dein Passwort für TheOmniStack zurückzusetzen. Wenn du das warst, kannst du über den folgenden Button ein neues Passwort festlegen.
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
                  href={resetLink}
                >
                  Neues Passwort vergeben
                </Button>
              </Section>

              <Text className="text-gray-500 text-[12px] leading-[24px]">
                Oder kopiere diesen Link in deinen Browser:{' '}
                <a href={resetLink} className="text-blue-600 no-underline">
                  {resetLink}
                </a>
              </Text>

              <Hr className="border border-solid border-gray-200 my-[26px] mx-0 w-full" />
              
              <Text className="text-gray-400 text-[12px] leading-[24px]">
                Wenn du kein neues Passwort angefordert hast, kannst du diese E-Mail einfach ignorieren. Dein bestehendes Passwort bleibt weiterhin gültig.
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

export default PasswordResetEmail;
