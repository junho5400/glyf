export type ThemeName =
  | 'plain'
  | 'poolside'
  | 'vintage'
  | 'slate'
  | 'hokusai';

export const THEME_ORDER: ThemeName[] = [
  'plain',
  'poolside',
  'vintage',
  'slate',
  'hokusai',
];

/* Tonal palettes: the paper itself is tinted, the grey role carries a hue,
   the pen is muted — every token wears the mood, not just the accent. */
export const THEMES: Record<ThemeName, Record<string, string>> = {
  /* plain — just white and black; the pen stays red so drawing reads as drawing */
  plain: {
    '--paper': '#f1f1f1',
    '--sheet': '#fafafa',
    '--ink': '#111111',
    '--grey': '#525252',
    '--faint': '#999999',
    '--construction': '#c2c2c2',
    '--pen': '#c2271e',
    '--glyph': '#111111',
    '--shadow-dark': 'color-mix(in srgb, var(--ink) 18%, transparent)',
    '--shadow-light': 'color-mix(in srgb, #ffffff 45%, var(--paper))',
    '--swatch': '#e6e6e4',
  },
  /* laid-back luxury — pale sage paper, dusty-blue voice, sea-green pen */
  poolside: {
    '--paper': '#e0e0ce',
    '--sheet': '#f6f6ee',
    '--ink': '#262626',
    '--grey': '#527d8c',
    '--faint': '#a3a793',
    '--construction': '#aab0a0',
    '--pen': '#4e8a78',
    '--glyph': '#262626',
    '--shadow-dark': 'color-mix(in srgb, var(--ink) 18%, transparent)',
    '--shadow-light': 'color-mix(in srgb, #ffffff 45%, var(--paper))',
    '--swatch': '#b9ba94',
  },
  /* effortlessly vintage — greige paper, mauve voice, terracotta pen */
  vintage: {
    '--paper': '#dcd5c9',
    '--sheet': '#f4efe7',
    '--ink': '#1d1d1d',
    '--grey': '#684d52',
    '--faint': '#9f9483',
    '--construction': '#a79c8b',
    '--pen': '#884c42',
    '--glyph': '#1d1d1d',
    '--shadow-dark': 'color-mix(in srgb, var(--ink) 18%, transparent)',
    '--shadow-light': 'color-mix(in srgb, #ffffff 45%, var(--paper))',
    '--swatch': '#b1a38c',
  },
  /* winter slate — pale blue-grey paper, espresso ink, mocha pen */
  slate: {
    '--paper': '#dde5e8',
    '--sheet': '#f3f7f8',
    '--ink': '#43302a',
    '--grey': '#697c82',
    '--faint': '#94a2a7',
    '--construction': '#9dabb0',
    '--pen': '#8f7568',
    '--glyph': '#43302a',
    '--shadow-dark': 'color-mix(in srgb, var(--ink) 18%, transparent)',
    '--shadow-light': 'color-mix(in srgb, #ffffff 45%, var(--paper))',
    '--swatch': '#a4bac2',
  },
  /* ukiyo-e — aged cream, Prussian-blue ink, vermilion seal pen */
  hokusai: {
    '--paper': '#efe7d5',
    '--sheet': '#f8f2e2',
    '--ink': '#14324f',
    '--grey': '#425a70',
    '--faint': '#9e977f',
    '--construction': '#a6a088',
    '--pen': '#c33d2e',
    '--glyph': '#14324f',
    '--shadow-dark': 'color-mix(in srgb, var(--ink) 18%, transparent)',
    '--shadow-light': 'color-mix(in srgb, #ffffff 45%, var(--paper))',
    '--swatch': '#8da2b0',
  },
};

for (const t of Object.values(THEMES)) {
  t['--hairline'] = t['--construction'];
}
