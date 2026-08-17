/**
 * The web nav links lost every one of their own styles, and nothing caught it.
 *
 * ---------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------
 * `TabTrigger asChild` renders a Radix `Slot`, and passes its own
 * `style={{ flexDirection: 'row', justifyContent: 'space-between' }}` through it.
 * Radix's `mergeProps` merges `style` only for props the child element declares
 * for itself, and `<NavLink>{label}</NavLink>` declares nothing but `children` —
 * so that style arrived at `NavLink` untouched, in `rest`.
 *
 * `NavLink` then spread `{...rest}` *after* its own `style`, so the trigger's
 * static style replaced the entire callback. Every link rendered with no
 * padding, no pill radius, and no hover, focused or pressed background.
 *
 * Both symptoms followed from that one line. The bar looked cramped because five
 * labels sat a couple of pixels apart with no padding between them, and the
 * links looked broken because the hit area shrank to the glyphs themselves and
 * nothing visibly changed on click — the navigation fired the whole time.
 *
 * `tsc` and eslint are both perfectly happy with either spread order, which is
 * why this file exists. It asserts on the resolved style rather than on the
 * ordering, so it stays true if the implementation is rewritten.
 */

import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { NavLink } from '@/components/app-tabs.web';
import { Themes } from '@/constants/theme';

/**
 * `NavLink` shares its module with `AppTabs`, which imports `AccountButton` —
 * and that reaches the session, then supabase-js, then AsyncStorage's native
 * module, none of which exist in Node. Stubbing the one import keeps this a test
 * of the link's styling rather than a test that needs a backend to boot.
 */
jest.mock('@/components/ui/account-button', () => ({ AccountButton: () => null }));

/**
 * Exactly what `TabTrigger` puts on the Slot — copied from
 * expo-router/build/ui/TabTrigger.js. If a future version stops sending a style
 * the test still passes; the point is that it survives when one *is* sent.
 */
const TRIGGER_STYLE = { flexDirection: 'row', justifyContent: 'space-between' } as const;

const t = Themes.light;

type PressableState = { pressed: boolean; hovered: boolean; focused: boolean };

const IDLE: PressableState = { pressed: false, hovered: false, focused: false };

/**
 * The link's Pressable.
 *
 * Deliberately not `findByType(Pressable)` — React Native wraps `Pressable` in
 * `React.memo`, so no test instance ever has that object as its type. And
 * deliberately not found by the shape of its style prop either: a regression
 * which *replaces* the style callback with a static object must still locate the
 * node and fail on the assertion below, rather than fail to find anything and
 * report a confusing undefined.
 *
 * So it matches on the role. `Pressable` forwards that down to the View and host
 * node beneath it, and `findAll` walks depth-first, so the first match is the
 * Pressable element itself.
 */
function findLink(root: ReturnType<typeof create>): ReactTestInstance {
  const matches = root.root.findAll(
    (node: ReactTestInstance) => node.props?.accessibilityRole === 'link',
  );

  if (matches.length === 0) {
    throw new Error('no node with accessibilityRole="link" was rendered');
  }

  return matches[0];
}

/**
 * Renders the link and resolves the Pressable's style for a given press state.
 *
 * `Pressable` takes its style as a callback, so the value under test does not
 * exist until that callback is invoked — reading `props.style` alone would
 * assert on a function and prove nothing. A static style is resolved too, since
 * that is exactly what the regression produces.
 */
function resolveStyle(
  props: { isFocused?: boolean; style?: StyleProp<ViewStyle> },
  state: PressableState = IDLE,
): ViewStyle {
  let root: ReturnType<typeof create> | undefined;

  act(() => {
    root = create(
      <NavLink isFocused={props.isFocused} style={props.style}>
        Trades
      </NavLink>,
    );
  });

  const declared = findLink(root!).props.style;
  const resolved = typeof declared === 'function' ? declared(state) : declared;
  const flattened = StyleSheet.flatten(resolved) as ViewStyle;

  act(() => {
    root!.unmount();
  });

  return flattened;
}

describe('NavLink', () => {
  it('keeps its own padding and pill radius when the trigger sends a style', () => {
    const style = resolveStyle({ style: TRIGGER_STYLE });

    // The regression itself: with the old spread order all three of these came
    // back undefined, because the trigger's style had replaced the callback.
    expect(style.paddingHorizontal).toBe(t.space.three);
    expect(style.paddingVertical).toBe(t.space.two);
    expect(style.borderRadius).toBe(t.radius.pill);
  });

  it('still honours the style the trigger sent rather than dropping it', () => {
    const style = resolveStyle({ style: TRIGGER_STYLE });

    // Kept, not discarded — the fix composes both instead of picking a winner.
    expect(style.justifyContent).toBe('space-between');
  });

  it('marks the focused link with the accent fill', () => {
    expect(resolveStyle({ isFocused: true, style: TRIGGER_STYLE }).backgroundColor).toBe(
      t.color.accentSoft,
    );
  });

  it('leaves an unfocused link transparent', () => {
    expect(resolveStyle({ isFocused: false, style: TRIGGER_STYLE }).backgroundColor).toBe(
      'transparent',
    );
  });

  it('shows a hover fill only on links that are not already focused', () => {
    const hovered = { ...IDLE, hovered: true };

    expect(resolveStyle({ isFocused: false, style: TRIGGER_STYLE }, hovered).backgroundColor).toBe(
      t.color.surfaceActive,
    );

    // A focused link must not flip to the hover colour under the cursor, or the
    // bar loses track of where you are while you point at it.
    expect(resolveStyle({ isFocused: true, style: TRIGGER_STYLE }, hovered).backgroundColor).toBe(
      t.color.accentSoft,
    );
  });

  it('dims while pressed, so a click is acknowledged', () => {
    const pressed = { ...IDLE, pressed: true };

    expect(resolveStyle({ style: TRIGGER_STYLE }, pressed).opacity).toBe(0.7);
    expect(resolveStyle({ style: TRIGGER_STYLE }).opacity).toBeUndefined();
  });

  it('forwards the press handler the trigger relies on for navigation', () => {
    const onPress = jest.fn();

    let root: ReturnType<typeof create> | undefined;

    act(() => {
      root = create(
        <NavLink style={TRIGGER_STYLE} onPress={onPress}>
          Trades
        </NavLink>,
      );
    });

    // `TabTrigger` navigates from this handler alone. Spreading `rest` first must
    // not drop it on the way to the Pressable.
    expect(findLink(root!).props.onPress).toBe(onPress);

    act(() => {
      root!.unmount();
    });
  });
});
