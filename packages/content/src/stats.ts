/**
 * The stats, as they become the Stats tab, and how Fichas v15 writes each one.
 *
 * Primary and secondary are the seven attributes the character sheet buys with XP, in
 * its two rows. The resources are the pools derived from them. Names and emojis are the
 * sheet's own. The English names are first drafts, listed in the report for review.
 */
export const STAT_TYPES = ['primary', 'secondary', 'resource'] as const;

export interface Stat {
  code: string;
  emoji: string;
  abbr_pt: string;
  abbr_en: string;
  name_pt: string;
  name_en: string;
  type: (typeof STAT_TYPES)[number];
}

export const STATS: Stat[] = [
  { code: 'FIS', emoji: '💪', abbr_pt: 'FÍS', abbr_en: 'PHY', name_pt: 'Físico', name_en: 'Physique', type: 'primary' },
  { code: 'SEN', emoji: '👁️', abbr_pt: 'SEN', abbr_en: 'SEN', name_pt: 'Sentidos', name_en: 'Senses', type: 'primary' },
  { code: 'INF', emoji: '💬', abbr_pt: 'INF', abbr_en: 'INF', name_pt: 'Influência', name_en: 'Influence', type: 'primary' },
  { code: 'ESP', emoji: '🔥', abbr_pt: 'ESP', abbr_en: 'SPI', name_pt: 'Espírito', name_en: 'Spirit', type: 'primary' },
  { code: 'TEC', emoji: '🔧', abbr_pt: 'TÉC', abbr_en: 'TEC', name_pt: 'Técnica', name_en: 'Technique', type: 'secondary' },
  { code: 'CON', emoji: '📖', abbr_pt: 'CON', abbr_en: 'KNO', name_pt: 'Conhecimento', name_en: 'Knowledge', type: 'secondary' },
  { code: 'INS', emoji: '🧘', abbr_pt: 'INS', abbr_en: 'INS', name_pt: 'Instinto', name_en: 'Instinct', type: 'secondary' },
  { code: 'ENE', emoji: '💚', abbr_pt: 'ENE', abbr_en: 'ENE', name_pt: 'Energia', name_en: 'Energy', type: 'resource' },
  { code: 'VID', emoji: '❤️', abbr_pt: 'VID', abbr_en: 'LIF', name_pt: 'Vida', name_en: 'Life', type: 'resource' },
  { code: 'ESPE', emoji: '💙', abbr_pt: 'ESPE', abbr_en: 'HOP', name_pt: 'Esperança', name_en: 'Hope', type: 'resource' },
  // The sheet writes Deslocamento without an emoji.
  { code: 'DES', emoji: '', abbr_pt: 'DES', abbr_en: 'MOV', name_pt: 'Deslocamento', name_en: 'Movement', type: 'resource' },
];

/** Without the emoji variation selector, so 👁 and 👁️ read the same. */
export const bareEmoji = (text: string) => text.replace(/️/g, '');

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();

/** A stat code from an emoji or an abbreviation as the sheet writes it (TÉC, FÍS). */
export function statCodeOf(token: string): string | null {
  const bare = bareEmoji(token.trim());
  const byEmoji = STATS.find((s) => bareEmoji(s.emoji) === bare);
  if (byEmoji) return byEmoji.code;
  const folded = fold(bare);
  return STATS.find((s) => s.code === folded || fold(s.abbr_pt) === folded)?.code ?? null;
}

/** Every emoji a stat can be written with, for the requirement parser. */
export const STAT_EMOJIS = STATS.filter((s) => s.emoji).map((s) => bareEmoji(s.emoji));
