import type { Language } from "./translations";

const REGION_NAMES_HE: Record<string, string> = {
  "united-states": "ארצות הברית",
  "canada": "קנדה",
  "united-kingdom": "בריטניה",
  "europe": "אירופה",
  "australia": "אוסטרליה",
  "israel": "ישראל",
};

const US_STATE_NAMES_EN: Record<string, string> = {
  CA: "California",
  NY: "New York",
  NJ: "New Jersey",
  FL: "Florida",
  IL: "Illinois",
  MD: "Maryland",
  MI: "Michigan",
  OH: "Ohio",
  PA: "Pennsylvania",
};

const US_STATE_NAMES_HE: Record<string, string> = {
  CA: "קליפורניה",
  NY: "ניו יורק",
  NJ: "ניו ג'רזי",
  FL: "פלורידה",
  IL: "אילינוי",
  MD: "מרילנד",
  MI: "מישיגן",
  OH: "אוהיו",
  PA: "פנסילבניה",
};

const CA_PROVINCE_NAMES_EN: Record<string, string> = {
  ON: "Ontario",
  QC: "Quebec",
};

const CA_PROVINCE_NAMES_HE: Record<string, string> = {
  ON: "אונטריו",
  QC: "קוויבק",
};

const IL_REGION_NAMES_EN: Record<string, string> = {
  JER: "Jerusalem",
  TEL: "Tel Aviv Area",
  CEN: "Central",
  SHA: "Shomron",
};

const IL_REGION_NAMES_HE: Record<string, string> = {
  JER: "ירושלים",
  TEL: "אזור תל אביב",
  CEN: "המרכז",
  SHA: "שומרון",
};

const UK_REGION_NAMES_EN: Record<string, string> = {
  LON: "London",
  MAN: "Manchester",
};

const UK_REGION_NAMES_HE: Record<string, string> = {
  LON: "לונדון",
  MAN: "מנצ'סטר",
};

const AU_STATE_NAMES_EN: Record<string, string> = {
  VIC: "Victoria",
  NSW: "New South Wales",
};

const AU_STATE_NAMES_HE: Record<string, string> = {
  VIC: "ויקטוריה",
  NSW: "ניו סאות' ויילס",
};

const CITY_NAMES_HE: Record<string, string> = {
  "los-angeles": "לוס אנג'לס",
  "brooklyn": "ברוקלין",
  "monsey": "מונסי",
  "new-square": "ניו סקוור",
  "queens": "קווינס",
  "five-towns-far-rockaway": "חמש העיירות / פאר רוקאוויי",
  "staten-island": "סטטן איילנד",
  "west-hempstead": "ווסט המפסטד",
  "highland-park-edison": "היילנד פארק / אדיסון",
  "jackson": "ג'קסון",
  "lakewood": "לייקווד",
  "passaic": "פסאיק",
  "toms-river": "טומס ריבר",
  "teaneck": "טינק",
  "miami": "מיאמי",
  "chicago": "שיקגו",
  "baltimore": "בולטימור",
  "detroit": "דטרויט",
  "cleveland": "קליבלנד",
  "philadelphia": "פילדלפיה",
  "toronto": "טורונטו",
  "montreal": "מונטריאול",
  "london": "לונדון",
  "manchester": "מנצ'סטר",
  "antwerp": "אנטוורפן",
  "paris": "פריז",
  "amsterdam": "אמסטרדם",
  "melbourne": "מלבורן",
  "sydney": "סידני",
  "jerusalem": "ירושלים",
  "bnei-brak": "בני ברק",
  "beit-shemesh": "בית שמש",
  "modiin-illit": "מודיעין עילית",
  "beitar-illit": "ביתר עילית",
  "lod": "לוד",
  "afula": "עפולה",
  "elad": "אלעד",
  "givat-zeev": "גבעת זאב",
  "haifa": "חיפה",
  "kiryat-tivon": "קריית טבעון",
  "kochav-hashachar": "כוכב השחר",
  "maaleh-adumim": "מעלה אדומים",
  "neriya": "נריה",
  "telzstone-kiryat-yearim": "טלזסטון / קריית יערים",
  "rechovot": "רחובות",
  "ashdod": "אשדוד",
  "bnei-reem": "בני ראם",
  "kfar-chabad": "כפר חב\"ד",
  "tel-aviv": "תל אביב",
  "petach-tikvah": "פתח תקווה",
  "moshav-yesodot": "מושב יסודות",
  "shomron": "שומרון",
};

export function localizeRegionName(language: Language, slug: string, fallback: string): string {
  if (language === "he") return REGION_NAMES_HE[slug] || fallback;
  return fallback;
}

export function localizeCityName(language: Language, slug: string, fallback: string): string {
  if (language === "he") return CITY_NAMES_HE[slug] || fallback;
  return fallback;
}

export function localizeUSState(language: Language, code: string): string {
  const map = language === "he" ? US_STATE_NAMES_HE : US_STATE_NAMES_EN;
  return map[code] || code;
}

export function localizeCAProvince(language: Language, code: string): string {
  const map = language === "he" ? CA_PROVINCE_NAMES_HE : CA_PROVINCE_NAMES_EN;
  return map[code] || code;
}

export function localizeILRegion(language: Language, code: string): string {
  const map = language === "he" ? IL_REGION_NAMES_HE : IL_REGION_NAMES_EN;
  return map[code] || code;
}

export function localizeUKRegion(language: Language, code: string): string {
  const map = language === "he" ? UK_REGION_NAMES_HE : UK_REGION_NAMES_EN;
  return map[code] || code;
}

export function localizeAUState(language: Language, code: string): string {
  const map = language === "he" ? AU_STATE_NAMES_HE : AU_STATE_NAMES_EN;
  return map[code] || code;
}
