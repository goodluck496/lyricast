export interface LanguageOption {
  code: string;
  nameRu: string;
  nameEn: string;
  nameNative?: string;
  countryCode: string;
  flagUrl: string;
  aliases: string[];
}

export const LANGUAGES_OPTIONS: LanguageOption[] = [
  {
    code: 'ru',
    nameRu: 'Русский',
    nameEn: 'Russian',
    nameNative: 'Русский',
    countryCode: 'ru',
    flagUrl: 'assets/flags/ru.svg',
    aliases: ['rus', 'russian', 'рус', 'русский', 'ru-ru'],
  },
  {
    code: 'kk',
    nameRu: 'Казахский',
    nameEn: 'Kazakh',
    nameNative: 'Қазақша',
    countryCode: 'kz',
    flagUrl: 'assets/flags/kz.svg',
    aliases: ['kaz', 'kazakh', 'каз', 'казахский', 'қазақша', 'қазақ', 'kz'],
  },
  {
    code: 'ky',
    nameRu: 'Кыргызский',
    nameEn: 'Kyrgyz',
    nameNative: 'Кыргызча',
    countryCode: 'kg',
    flagUrl: 'assets/flags/kg.svg',
    aliases: ['kir', 'kyrgyz', 'кыр', 'кыргызский', 'кыргызча', 'кыргыз', 'kg', 'kyz'],
  },
  {
    code: 'en',
    nameRu: 'Английский',
    nameEn: 'English',
    nameNative: 'English',
    countryCode: 'us',
    flagUrl: 'assets/flags/us.svg',
    aliases: ['eng', 'english', 'англ', 'английский', 'us', 'gb', 'uk'],
  },
  {
    code: 'uk',
    nameRu: 'Украинский',
    nameEn: 'Ukrainian',
    nameNative: 'Українська',
    countryCode: 'ua',
    flagUrl: 'assets/flags/ua.svg',
    aliases: ['ukr', 'ukrainian', 'укр', 'украинский', 'ua'],
  },
  {
    code: 'be',
    nameRu: 'Белорусский',
    nameEn: 'Belarusian',
    nameNative: 'Беларуская',
    countryCode: 'by',
    flagUrl: 'assets/flags/by.svg',
    aliases: ['bel', 'belarusian', 'бел', 'белорусский', 'by'],
  },
  {
    code: 'uz',
    nameRu: 'Узбекский',
    nameEn: 'Uzbek',
    nameNative: "Oʻzbekcha",
    countryCode: 'uz',
    flagUrl: 'assets/flags/uz.svg',
    aliases: ['uzb', 'uzbek', 'узб', 'узбекский', 'uz'],
  },
  {
    code: 'tg',
    nameRu: 'Таджикский',
    nameEn: 'Tajik',
    nameNative: 'Тоҷикӣ',
    countryCode: 'tj',
    flagUrl: 'assets/flags/tj.svg',
    aliases: ['taj', 'tajik', 'тадж', 'таджикский', 'tj'],
  },
  {
    code: 'he',
    nameRu: 'Иврит',
    nameEn: 'Hebrew',
    nameNative: 'עברית',
    countryCode: 'il',
    flagUrl: 'assets/flags/il.svg',
    aliases: ['heb', 'hebrew', 'hbo', 'иврит', 'il'],
  },
  {
    code: 'el',
    nameRu: 'Греческий',
    nameEn: 'Greek',
    nameNative: 'Ελληνικά',
    countryCode: 'gr',
    flagUrl: 'assets/flags/gr.svg',
    aliases: ['grc', 'ell', 'gre', 'greek', 'греческий', 'gr'],
  },
  {
    code: 'de',
    nameRu: 'Немецкий',
    nameEn: 'German',
    nameNative: 'Deutsch',
    countryCode: 'de',
    flagUrl: 'assets/flags/de.svg',
    aliases: ['ger', 'deu', 'german', 'немецкий', 'de'],
  },
  {
    code: 'fr',
    nameRu: 'Французский',
    nameEn: 'French',
    nameNative: 'Français',
    countryCode: 'fr',
    flagUrl: 'assets/flags/fr.svg',
    aliases: ['fra', 'fre', 'french', 'французский', 'fr'],
  },
  {
    code: 'es',
    nameRu: 'Испанский',
    nameEn: 'Spanish',
    nameNative: 'Español',
    countryCode: 'es',
    flagUrl: 'assets/flags/es.svg',
    aliases: ['spa', 'spanish', 'испанский', 'es'],
  },
  {
    code: 'it',
    nameRu: 'Итальянский',
    nameEn: 'Italian',
    nameNative: 'Italiano',
    countryCode: 'it',
    flagUrl: 'assets/flags/it.svg',
    aliases: ['ita', 'italian', 'итальянский', 'it'],
  },
  {
    code: 'pt',
    nameRu: 'Португальский',
    nameEn: 'Portuguese',
    nameNative: 'Português',
    countryCode: 'pt',
    flagUrl: 'assets/flags/pt.svg',
    aliases: ['por', 'portuguese', 'португальский', 'pt'],
  },
  {
    code: 'tr',
    nameRu: 'Турецкий',
    nameEn: 'Turkish',
    nameNative: 'Türkçe',
    countryCode: 'tr',
    flagUrl: 'assets/flags/tr.svg',
    aliases: ['tur', 'turkish', 'турецкий', 'tr'],
  },
  {
    code: 'hy',
    nameRu: 'Армянский',
    nameEn: 'Armenian',
    nameNative: 'Հայերեն',
    countryCode: 'am',
    flagUrl: 'assets/flags/am.svg',
    aliases: ['arm', 'hye', 'armenian', 'армянский', 'am'],
  },
  {
    code: 'ka',
    nameRu: 'Грузинский',
    nameEn: 'Georgian',
    nameNative: 'ქართული',
    countryCode: 'ge',
    flagUrl: 'assets/flags/ge.svg',
    aliases: ['geo', 'kat', 'georgian', 'грузинский', 'ge'],
  },
  {
    code: 'az',
    nameRu: 'Азербайджанский',
    nameEn: 'Azerbaijani',
    nameNative: 'Azərbaycanca',
    countryCode: 'az',
    flagUrl: 'assets/flags/az.svg',
    aliases: ['aze', 'azerbaijani', 'азербайджанский', 'az'],
  },
  {
    code: 'pl',
    nameRu: 'Польский',
    nameEn: 'Polish',
    nameNative: 'Polski',
    countryCode: 'pl',
    flagUrl: 'assets/flags/pl.svg',
    aliases: ['pol', 'polish', 'польский', 'pl'],
  },
  {
    code: 'ro',
    nameRu: 'Румынский',
    nameEn: 'Romanian',
    nameNative: 'Română',
    countryCode: 'ro',
    flagUrl: 'assets/flags/ro.svg',
    aliases: ['ron', 'rum', 'romanian', 'румынский', 'ro'],
  },
  {
    code: 'zh',
    nameRu: 'Китайский',
    nameEn: 'Chinese',
    nameNative: '中文',
    countryCode: 'cn',
    flagUrl: 'assets/flags/cn.svg',
    aliases: ['zho', 'chi', 'chinese', 'китайский', 'cn'],
  },
  {
    code: 'ko',
    nameRu: 'Корейский',
    nameEn: 'Korean',
    nameNative: '한국어',
    countryCode: 'kr',
    flagUrl: 'assets/flags/kr.svg',
    aliases: ['kor', 'korean', 'корейский', 'kr'],
  },
  {
    code: 'cu',
    nameRu: 'Церковнославянский',
    nameEn: 'Church Slavonic',
    nameNative: 'Славе́нскїй',
    countryCode: 'ru',
    flagUrl: 'assets/flags/ru.svg',
    aliases: ['chu', 'slavonic', 'церковнославянский'],
  },
];

export function findLanguage(lang: string | null | undefined): LanguageOption | undefined {
  if (!lang) return undefined;
  const clean = lang.toLowerCase().trim();
  return LANGUAGES_OPTIONS.find(
    (l) =>
      l.code.toLowerCase() === clean ||
      l.aliases.some((a) => a.toLowerCase() === clean) ||
      l.nameRu.toLowerCase() === clean ||
      l.nameEn.toLowerCase() === clean
  );
}

export function getLanguageFlagUrl(lang: string | null | undefined): string | undefined {
  return findLanguage(lang)?.flagUrl;
}
