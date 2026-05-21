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

interface InvitationEmailProps {
  inviterName: string;
  companyName: string;
  inviteLink: string;
}

export const InvitationEmail = ({ 
  inviterName = 'Max Mustermann', 
  companyName = 'Musterfirma GmbH',
  inviteLink = 'https://theomnistack.de/invite?token=preview' 
}: InvitationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Du wurdest von {inviterName} in das Team "{companyName}" eingeladen</Preview>
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
                Team-Einladung 🤝
              </Heading>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                Hallo,
              </Text>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                <strong>{inviterName}</strong> hat dich eingeladen, dem Team <strong>"{companyName}"</strong> auf TheOmniStack beizutreten.
              </Text>
              <Text className="text-gray-700 text-[14px] leading-[24px]">
                Mit TheOmniStack verwalten Händler ihre Marktplätze, Bestellungen und Logistik an einem zentralen Ort.
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
                  href={inviteLink}
                >
                  Einladung annehmen
                </Button>
              </Section>

              <Text className="text-gray-500 text-[12px] leading-[24px]">
                Oder kopiere diesen Link in deinen Browser:{' '}
                <a href={inviteLink} className="text-blue-600 no-underline">
                  {inviteLink}
                </a>
              </Text>

              <Hr className="border border-solid border-gray-200 my-[26px] mx-0 w-full" />
              
              <Text className="text-gray-400 text-[12px] leading-[24px]">
                Wenn du diese Person nicht kennst oder keine Einladung erwartet hast, kannst du diese E-Mail einfach ignorieren.
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

export default InvitationEmail;
