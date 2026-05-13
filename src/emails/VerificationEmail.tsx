import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

interface VerificationEmailProps {
  verifyLink: string;
}

export const VerificationEmail = ({ verifyLink = 'https://theomnistack.de/verify-email?token=preview' }: VerificationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Bestätige deine E-Mail-Adresse für TheOmniStack</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="bg-white border border-gray-200 rounded-xl my-[40px] mx-auto p-[20px] w-[465px] shadow-sm">
            <Section className="mt-[32px]">
              <Heading className="text-black text-[24px] font-bold text-center p-0 my-[30px] mx-0">
                Willkommen bei <span className="text-yellow-500">TheOmniStack</span>! 🚀
              </Heading>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                Hallo,
              </Text>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                vielen Dank für deine Registrierung. Bitte bestätige deine E-Mail-Adresse, um deinen Account zu aktivieren und mit der Einrichtung deiner Marktplätze und Versanddienstleister zu beginnen.
              </Text>
              
              <Section className="text-center mt-[32px] mb-[32px]">
                <Button
                  className="bg-yellow-400 rounded-lg text-black text-[14px] font-bold no-underline text-center px-6 py-3"
                  href={verifyLink}
                >
                  E-Mail-Adresse bestätigen
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
                Wenn du diesen Account nicht erstellt hast, kannst du diese E-Mail einfach ignorieren.
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

export default VerificationEmail;
