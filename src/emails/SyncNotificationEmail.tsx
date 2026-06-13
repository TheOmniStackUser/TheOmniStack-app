import {
  Body,
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

type SyncResult = {
  marketplace: string;
  success: boolean;
  count?: number;
  error?: string;
};

interface SyncNotificationEmailProps {
  companyName: string;
  results: SyncResult[];
  date: string;
}

export const SyncNotificationEmail = ({ 
  companyName = 'Deine Firma', 
  results = [],
  date = new Date().toLocaleString('de-DE')
}: SyncNotificationEmailProps) => {
  const allSuccess = results.every(r => r.success);
  const totalOrders = results.reduce((acc, curr) => acc + (curr.count || 0), 0);

  return (
    <Html>
      <Head />
      <Preview>Automatischer Bestellabruf Report - {allSuccess ? 'Erfolgreich' : 'Mit Fehlern'}</Preview>
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
                Automatischer Bestellabruf
              </Heading>
              
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                Hallo {companyName},
              </Text>
              
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                hier ist deine Zusammenfassung für den automatischen Bestellabruf vom {date}.
              </Text>

              <Section className="mt-[20px] mb-[20px] bg-gray-50 rounded-lg p-[16px] border border-gray-100">
                <Text className="text-[16px] font-bold text-gray-900 m-0 mb-[12px]">
                  Ergebnisse nach Marktplatz:
                </Text>

                {results.length === 0 ? (
                  <Text className="text-gray-500 text-[14px] m-0">
                    Keine aktiven Marktplätze konfiguriert.
                  </Text>
                ) : (
                  results.map((result, index) => (
                    <div key={index} className="mb-[12px]">
                      <Text className="m-0 text-[14px] font-semibold text-gray-800">
                        {result.marketplace}
                      </Text>
                      {result.success ? (
                        <Text className="m-0 text-[14px] text-green-600 font-medium">
                          ✅ Erfolgreich: {result.count} neue {result.count === 1 ? 'Bestellung' : 'Bestellungen'}
                        </Text>
                      ) : (
                        <Text className="m-0 text-[14px] text-red-600 font-medium">
                          ❌ Fehlgeschlagen: {result.error || 'Unbekannter Fehler'}
                        </Text>
                      )}
                    </div>
                  ))
                )}
              </Section>

              <Section className="mb-[32px]">
                <Text className="text-gray-700 text-[14px] font-medium leading-[24px] text-center">
                  Insgesamt wurden <span className="font-bold">{totalOrders}</span> neue {totalOrders === 1 ? 'Bestellung' : 'Bestellungen'} importiert.
                </Text>
              </Section>

              <Hr className="border border-solid border-gray-200 my-[26px] mx-0 w-full" />
              
              <Text className="text-gray-400 text-[12px] leading-[24px]">
                Diese Benachrichtigung hast du aktiviert in deinen "Verbindungen & Integrationen" Einstellungen unter "Automatischer Bestellabruf".
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

export default SyncNotificationEmail;
