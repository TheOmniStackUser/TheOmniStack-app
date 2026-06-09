import { get2LetterCountryCode } from './src/lib/countries'
console.log("Empty:", get2LetterCountryCode(""))
console.log("Null:", get2LetterCountryCode(null))
console.log("Deutschland:", get2LetterCountryCode("Deutschland"))
console.log("DE:", get2LetterCountryCode("DE"))
console.log("DEU:", get2LetterCountryCode("DEU"))
console.log("Australia:", get2LetterCountryCode("Australien"))
console.log("XYZ:", get2LetterCountryCode("XYZ"))
