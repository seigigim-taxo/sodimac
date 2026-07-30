// Rango amplio de bloques Unicode de emoji + selectores de variación/ZWJ que los acompañan.
const EMOJI_REGEX = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

export function stripEmojis(value: string): string {
  return value.replace(EMOJI_REGEX, '');
}
