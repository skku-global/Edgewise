import type { ColorScheme, Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Scheme-aware stylesheets.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------
 * `StyleSheet.create({ color: Trading.ink })` at module scope runs once, at
 * import, before anything knows which scheme is active. Every screen in this app
 * was written that way against light-only literals, which is why dark mode
 * rendered charcoal text on a charcoal background.
 *
 * The fix is to make the stylesheet a function of the theme. The factory calls
 * `StyleSheet.create` itself — that is what supplies the contextual type, so
 * `alignItems: 'center'` narrows to the enum instead of widening to `string` and
 * needing an `as const` on every line:
 *
 *   const sheet = (t: Theme) =>
 *     StyleSheet.create({ title: { color: t.color.text, textAlign: 'center' } });
 *
 *   function Screen() {
 *     const styles = useThemedStyles(sheet);
 *   }
 *
 * ---------------------------------------------------------------------------
 * WHY A MODULE-LEVEL CACHE AND NOT useMemo
 * ---------------------------------------------------------------------------
 * `useMemo` is per component instance, so ten trade rows build ten identical
 * stylesheets and rebuild them on every remount. Keying a module-level cache on
 * the factory function instead means each factory is evaluated at most twice for
 * the life of the app — once per scheme — no matter how many components use it
 * or how often they mount.
 *
 * Reading and writing this cache during render is safe: it is a pure memo, the
 * same factory and scheme always produce the identical object, and nothing
 * observable changes. That identity stability is also what lets React skip
 * re-rendering children that receive these styles as props.
 *
 * A WeakMap, so a factory belonging to a lazily-loaded screen can be collected
 * with it rather than pinning its stylesheets forever.
 */
export type StyleFactory<T> = (theme: Theme) => T;

const cache = new WeakMap<StyleFactory<never>, Partial<Record<ColorScheme, unknown>>>();

export function useThemedStyles<T>(factory: StyleFactory<T>): T {
  const theme = useTheme();

  // The cast narrows only the key type; the value is read back as T below.
  const key = factory as unknown as StyleFactory<never>;

  let bySchemes = cache.get(key);

  if (!bySchemes) {
    bySchemes = {};
    cache.set(key, bySchemes);
  }

  let sheet = bySchemes[theme.scheme] as T | undefined;

  if (sheet === undefined) {
    sheet = factory(theme);
    bySchemes[theme.scheme] = sheet;
  }

  return sheet;
}
