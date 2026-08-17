/**
 * Edgewise design tokens.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE LOOKS THE WAY IT DOES
 * ---------------------------------------------------------------------------
 * It used to hold two unrelated colour systems side by side:
 *
 *   - `Colors`, with light/dark variants, used by ThemedText/ThemedView and the
 *     tab bars.
 *   - `Trading`, light-only hex literals, used by every actual feature screen.
 *
 * Because the feature screens read light-only literals while sitting inside a
 * scheme-switching ThemedView, dark mode produced charcoal text on charcoal —
 * the app config says `userInterfaceStyle: "automatic"`, so anyone with their
 * phone in dark mode saw an unreadable app.
 *
 * There is now one source of truth. `Themes.light` and `Themes.dark` are built
 * from the same token names, and screens read tokens through `useThemedStyles`
 * (src/lib/styles.ts) so their stylesheets are rebuilt per scheme instead of
 * frozen at import. Both of the old exports are gone: nothing reads `Trading` or
 * `Colors` any more, so there is no longer a way to write a screen that only
 * works in one scheme.
 *
 * ---------------------------------------------------------------------------
 * SEMANTIC, NOT LITERAL
 * ---------------------------------------------------------------------------
 * Tokens are named for their job (`text`, `surface`, `gain`) and never their
 * appearance (`darkGreen`, `white`). That is what makes a second scheme possible
 * at all: `color.text` can be near-black in one and near-white in the other,
 * while a token called `ink` could only ever lie in one of them.
 *
 * The brand palette itself is fixed — white, green, charcoal, red — so the two
 * schemes are the same palette re-assigned, not two different looks.
 */

import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export type ColorScheme = 'light' | 'dark';

/**
 * Brand constants — the four colours the product is allowed to use, plus the
 * tints derived from them. Screens use the semantic tokens below instead, so a
 * value can be re-pointed in one place.
 *
 * Exported for the two places a token genuinely cannot be used: the splash
 * overlay, which has to match the fixed `splash.backgroundColor` in app.json in
 * both schemes, and anywhere a colour must survive outside a React tree.
 */
export const Brand = {
  white: '#FFFFFF',
  charcoal: '#14251C',
  green: '#1F7A4C',
  greenBright: '#4ECB8D',
  red: '#B23A3A',
  redBright: '#E8635C',
} as const;

/** Every colour token, in both schemes. */
export type ColorTokens = {
  /** Page background. */
  bg: string;
  /** The backdrop a scroll view sits on, one step back from `surface`. */
  bgSunken: string;
  /** Card and panel fill. */
  surface: string;
  /** Sheets, dropdowns, popovers — one step in front of `surface`. */
  surfaceRaised: string;
  /** Pressed/selected row fill. */
  surfaceActive: string;

  /** The dark banner at the top of each screen. */
  hero: string;
  /** Primary text on `hero`. */
  heroText: string;
  /** Secondary text on `hero`. */
  heroMuted: string;
  /** Full-screen dim behind a modal. */
  scrim: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Text and icons sitting on a solid `accent` / `gain` / `loss` fill. */
  textOnFill: string;

  /** Interactive brand colour: buttons, links, active states. */
  accent: string;
  /** Brand colour at text contrast against `bg`. */
  accentText: string;
  /** Low-emphasis brand fill for badges and highlighted rows. */
  accentSoft: string;

  gain: string;
  gainSoft: string;
  loss: string;
  lossSoft: string;
  /** Flat, zero, or "no data" — e.g. a break-even calendar day. */
  neutral: string;

  /** Hairlines: card edges, row separators. */
  border: string;
  /** Borders that need to be seen: inputs, section dividers. */
  borderStrong: string;
  /** Focus ring. */
  focus: string;

  chartGrid: string;
  chartAxis: string;
};

const lightColors: ColorTokens = {
  bg: Brand.white,
  bgSunken: '#F5F9F7',
  surface: Brand.white,
  surfaceRaised: Brand.white,
  surfaceActive: '#EFF6F2',

  hero: Brand.charcoal,
  heroText: '#E6EEE9',
  heroMuted: '#93A79B',
  scrim: 'rgba(20, 37, 28, 0.55)',

  text: Brand.charcoal,
  textSecondary: '#57685E',
  textTertiary: '#7F8B84',
  textOnFill: Brand.white,

  accent: Brand.green,
  accentText: '#1B6B43',
  accentSoft: '#E8F4EE',

  gain: Brand.green,
  gainSoft: '#E8F4EE',
  loss: Brand.red,
  lossSoft: '#FBEDEC',
  neutral: '#B9C7BF',

  border: '#E6EEE9',
  borderStrong: '#D7E4DD',
  focus: Brand.greenBright,

  chartGrid: '#EDF3F0',
  chartAxis: '#D7E4DD',
};

/**
 * Dark scheme. Deliberately charcoal-*green* rather than neutral grey: the
 * brand's charcoal already has green in it, and a neutral grey base next to the
 * green accent reads as a different product.
 *
 * Two swaps are not just "the light value, darker":
 *
 *   - `gain` and `accent` become the bright green. The deep green that carries a
 *     white page is nearly invisible on a dark one.
 *   - `textOnFill` becomes near-black, because white on bright green fails
 *     contrast while the dark ink passes comfortably.
 */
const darkColors: ColorTokens = {
  bg: '#0D1512',
  bgSunken: '#080E0C',
  surface: '#141F1A',
  surfaceRaised: '#1A2721',
  surfaceActive: '#1E2E27',

  // In light mode the hero works by inverting the page. Inverting a dark page
  // would mean a white band, which is worse than the problem, so here it lifts
  // instead: a raised, green-tinted panel.
  hero: '#16241D',
  heroText: '#E9F2ED',
  heroMuted: '#8DA398',
  scrim: 'rgba(0, 0, 0, 0.66)',

  text: '#E9F2ED',
  textSecondary: '#A0B3A8',
  textTertiary: '#72857A',
  textOnFill: '#08110D',

  accent: Brand.greenBright,
  accentText: '#5FD69A',
  accentSoft: '#12291E',

  gain: Brand.greenBright,
  gainSoft: '#12291E',
  loss: Brand.redBright,
  lossSoft: '#2C1917',
  neutral: '#3A4A42',

  border: '#1F2E27',
  borderStrong: '#2E4038',
  focus: Brand.greenBright,

  chartGrid: '#1A2721',
  chartAxis: '#2E4038',
};

/**
 * Shadows, per scheme — and they have to be per scheme, because a shadow is
 * light being blocked. On a dark surface there is none to block, so the same
 * shadow that lifts a white card off a white page is invisible on `#0D1512`.
 * Dark mode leans on `surface` being lighter than `bg` and only deepens the
 * shadow enough to separate genuinely floating things like sheets.
 *
 * The classic RN shadow props are used rather than `boxShadow` so one object
 * covers iOS, Android (`elevation`) and web (react-native-web translates them).
 */
type Elevation = Record<1 | 2 | 3, ViewStyle>;

const lightElevation: Elevation = {
  1: {
    shadowColor: Brand.charcoal,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  2: {
    shadowColor: Brand.charcoal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  3: {
    shadowColor: Brand.charcoal,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
  },
};

const darkElevation: Elevation = {
  1: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 1,
  },
  2: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 4,
  },
  3: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 12,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
})!;

/**
 * Identity helper: gives `Type` literal keys while still type-checking each
 * entry against TextStyle. Without the contextual type, `fontWeight: '700'`
 * widens to `string` and stops being assignable where a style is expected.
 */
const textStyles = <T extends Record<string, TextStyle>>(styles: T) => styles;

/**
 * Type scale. Sizes step deliberately (34 / 22 / 17 / 15 / 13 / 11) rather than
 * drifting by a point or two — a scale with near-duplicate steps is what makes
 * an interface look assembled instead of designed.
 *
 * Negative letter-spacing on the large sizes only. System faces are spaced for
 * body text, so headings set at display sizes look loose without it; applying
 * the same tightening to 12px text would hurt legibility instead.
 */
export const Type = textStyles({
  /** The one big number on a screen. */
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 },
  /** Screen titles. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  /** Card and section headings. */
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  subheading: { fontSize: 15, lineHeight: 21, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  /** Field labels, button text. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Small all-caps section markers. Wide tracking is the point. */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9 },

  /**
   * Numeric styles. `tabular-nums` is what stops a live P/L figure or a column
   * of prices from jittering as digits change width — the single cheapest thing
   * that makes a trading interface feel engineered.
   */
  mono: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.mono,
    fontVariant: ['tabular-nums'],
  },
  monoLg: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    fontFamily: Fonts.mono,
    fontVariant: ['tabular-nums'],
  },
  monoXl: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    fontFamily: Fonts.mono,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
  },
});

export type TypeToken = keyof typeof Type;

/** 4pt grid. Original names kept so existing screens keep compiling. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/**
 * Animation timings. Anything above ~320ms reads as the app being slow rather
 * than the motion being smooth.
 */
export const Duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

export type Theme = {
  scheme: ColorScheme;
  color: ColorTokens;
  elevation: Elevation;
  /** Convenience re-exports so a stylesheet factory needs one argument. */
  type: typeof Type;
  space: typeof Spacing;
  radius: typeof Radius;
  duration: typeof Duration;
};

const shared = {
  type: Type,
  space: Spacing,
  radius: Radius,
  duration: Duration,
} as const;

/**
 * Module-level constants, so a theme's object identity is stable for the life of
 * the app. `useThemedStyles` caches stylesheets against it, which only works if
 * the same scheme always yields the very same object.
 */
export const Themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', color: lightColors, elevation: lightElevation, ...shared },
  dark: { scheme: 'dark', color: darkColors, elevation: darkElevation, ...shared },
};

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Height of the fixed web nav bar in `app-tabs.web.tsx`, which scrolling screens
 * add as top padding to clear it. The bar reads this same constant for its own
 * height rather than being styled to match, so the two cannot drift into either
 * a gap or a clipped heading.
 */
export const WebTopNavInset = Platform.select({ web: 72, default: 0 }) ?? 0;
