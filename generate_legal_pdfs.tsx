import React from 'react';
import { renderToFile, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';
import fs from 'fs';

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
    color: '#333'
  },
  title: {
    fontSize: 16,
    marginBottom: 20,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  sectionTitle: {
    fontSize: 12,
    marginTop: 15,
    marginBottom: 5,
    fontWeight: 'bold'
  },
  text: {
    marginBottom: 10,
    textAlign: 'justify'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: 'grey',
    fontSize: 8,
  }
});

const AGBDocument = () => (
  <Document>
    <Page style={styles.page}>
      <Text style={styles.title}>Allgemeine Geschäftsbedingungen (AGB)</Text>
      
      <Text style={styles.sectionTitle}>1. Geltungsbereich</Text>
      <Text style={styles.text}>
        Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge über die Nutzung der Software "TheOmniStack.de", die zwischen der F & L Fashion GmbH, [Adresse eintragen], (im Folgenden "Anbieter") und ihren Kunden (im Folgenden "Kunde") geschlossen werden.
      </Text>

      <Text style={styles.sectionTitle}>2. Vertragsgegenstand</Text>
      <Text style={styles.text}>
        Vertragsgegenstand ist die Bereitstellung der Software TheOmniStack als webbasierte SaaS-Lösung zur Nutzung über das Internet sowie die Einräumung der hierfür erforderlichen Nutzungsrechte.
      </Text>

      <Text style={styles.sectionTitle}>3. Leistungen des Anbieters</Text>
      <Text style={styles.text}>
        Der Anbieter stellt dem Kunden TheOmniStack in der jeweils aktuellen Version am Router-Ausgang des Rechenzentrums, in dem der Server mit der Software steht, zur Nutzung bereit. Der Anbieter sorgt für eine Verfügbarkeit von 99% im Jahresmittel.
      </Text>

      <Text style={styles.sectionTitle}>4. Pflichten des Kunden</Text>
      <Text style={styles.text}>
        Der Kunde ist verpflichtet, die Zugangsdaten geheim zu halten und vor dem Zugriff durch unbefugte Dritte zu schützen. Er stellt sicher, dass die Nutzung der Software nur im Rahmen der vertraglichen und gesetzlichen Bestimmungen erfolgt.
      </Text>

      <Text style={styles.sectionTitle}>5. Vergütung und Zahlungsbedingungen</Text>
      <Text style={styles.text}>
        Die Vergütung richtet sich nach dem jeweils gewählten Tarif. Die Abrechnung erfolgt, sofern nicht anders vereinbart, monatlich im Voraus. Alle Preise verstehen sich zuzüglich der gesetzlichen Umsatzsteuer.
      </Text>

      <Text style={styles.sectionTitle}>6. Laufzeit und Kündigung</Text>
      <Text style={styles.text}>
        Der Vertrag wird auf unbestimmte Zeit geschlossen. Er kann von beiden Seiten mit einer Frist von [z.B. einem Monat] zum Ende eines Abrechnungsmonats gekündigt werden. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.
      </Text>

      <Text style={styles.sectionTitle}>7. Haftung</Text>
      <Text style={styles.text}>
        Der Anbieter haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit. Für leichte Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten). Die Haftung ist in diesem Fall auf den vertragstypischen, vorhersehbaren Schaden begrenzt.
      </Text>

      <Text style={styles.sectionTitle}>8. Schlussbestimmungen</Text>
      <Text style={styles.text}>
        Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand für alle Streitigkeiten aus diesem Vertrag ist der Sitz des Anbieters, sofern der Kunde Kaufmann, eine juristische Person des öffentlichen Rechts oder ein öffentlich-rechtliches Sondervermögen ist.
      </Text>

      <Text style={styles.footer}>
        F & L Fashion GmbH • TheOmniStack.de • Stand: Juli 2026
      </Text>
    </Page>
  </Document>
);

const WiderrufDocument = () => (
  <Document>
    <Page style={styles.page}>
      <Text style={styles.title}>Widerrufsbelehrung</Text>

      <Text style={styles.sectionTitle}>Widerrufsrecht</Text>
      <Text style={styles.text}>
        Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
      </Text>
      <Text style={styles.text}>
        Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (F & L Fashion GmbH, [Adresse eintragen], E-Mail: support@theomnistack.de) mittels einer eindeutigen Erklärung (z.B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren.
      </Text>
      <Text style={styles.text}>
        Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
      </Text>

      <Text style={styles.sectionTitle}>Folgen des Widerrufs</Text>
      <Text style={styles.text}>
        Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart.
      </Text>

      <Text style={styles.text}>
        Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.
      </Text>

      <Text style={styles.footer}>
        F & L Fashion GmbH • TheOmniStack.de • Stand: Juli 2026
      </Text>
    </Page>
  </Document>
);

async function generate() {
  const publicDir = path.join(__dirname, 'public', 'legal');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const agbPath = path.join(publicDir, 'AGB.pdf');
  const widerrufPath = path.join(publicDir, 'Widerrufsbelehrung.pdf');

  await renderToFile(<AGBDocument />, agbPath);
  console.log(`Generated AGB at ${agbPath}`);

  await renderToFile(<WiderrufDocument />, widerrufPath);
  console.log(`Generated Widerrufsbelehrung at ${widerrufPath}`);
}

generate().catch(console.error);
