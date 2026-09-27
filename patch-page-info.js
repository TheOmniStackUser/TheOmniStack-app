const fs = require('fs')
const file = 'src/app/(dashboard)/products/page.tsx'
let content = fs.readFileSync(file, 'utf8')

const oldInfo = `<em>Hinweis zu Verkäufen:</em> Eingehende Bestellungen aus den Marktplätzen reduzieren den Bestand hier in TheOmniStack natürlich vollautomatisch. Nur <strong>manuelle Änderungen</strong>, die direkt in Fremdportalen vorgenommen werden, überträgt das System nicht zurück.`

const newInfo = oldInfo + `
              <br/><br/>
              <em>Hinweis zu Aktionspreisen:</em> Wird ein Aktionspreis gesetzt, ohne ein explizites Datum auszuwählen, übermittelt das System automatisch einen Aktionszeitraum von "ab sofort bis in 10 Jahren". So wird sichergestellt, dass Marktplätze wie Otto oder Amazon den reduzierten Preis garantiert akzeptieren.`

content = content.replace(oldInfo, newInfo)
fs.writeFileSync(file, content)
