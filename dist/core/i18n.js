// Display language (Korean or English).
// Engines and data stay Korean: some Korean strings are data keys (units,
// faction names), and the tests compare Korean results. English is applied only
// where text is shown:
//   L('한국어', 'English')  picks between two inline strings in code;
//   T(text)                 looks a data string up in the English dictionary by
//                           its exact Korean text (dom.js does this for every
//                           piece of shown text, so views rarely call it).
// index.html picks the language before any module runs and sets <html lang>.
export let lang = globalThis.document?.documentElement?.lang === 'en' ? 'en' : 'ko';
export const isEnglish = () => lang === 'en';

const dictionary = new Map();
/** Adds Korean → English pairs: the dictionary files and official names from the data. */
export function addEnglish(pairs) {
  for (const [ko, en] of pairs) if (ko && en && !dictionary.has(ko)) dictionary.set(ko, en);
}

export const L = (ko, en) => (lang === 'en' ? en : ko);
export const T = value => (lang === 'en' && typeof value === 'string' ? dictionary.get(value) ?? value : value);
export const locale = () => (lang === 'en' ? 'en-US' : 'ko-KR');

/** English plural for a counted noun: plural(1, 'shot') → 'shot', plural(3, 'shot') → 'shots'. */
export const plural = (count, one, many = `${one}s`) => (count === 1 ? one : many);

/** For tests only: switch the language in a running process. */
export function setLang(next) { lang = next === 'en' ? 'en' : 'ko'; }
