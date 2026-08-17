/**
 * Web navigation — a fixed top bar, not a bottom tab bar.
 *
 * `expo-router/ui` is the headless tab primitive: it owns the routing and the
 * focused state, and hands the rendering over entirely. That is why this file
 * exists as a `.web.tsx` sibling of `app-tabs.tsx` rather than a branch inside
 * it — on native the platform tab bar is the right control, and on a desktop
 * browser a bottom bar is not.
 *
 * Two fixes over the previous version: the Reports screen is now reachable (557
 * lines of it were built and then never linked), and the bar carries the account
 * button, which is the only sign-out path on web.
 */

import {
  TabList,
  Tabs,
  TabSlot,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AccountButton } from '@/components/ui/account-button';
import { MaxContentWidth, WebTopNavInset, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/styles';

/** Route name to href. Kept together so a new screen is one entry, not four. */
const LINKS = [
  { name: 'index', href: '/', label: 'Dashboard' },
  { name: 'trades', href: '/trades', label: 'Trades' },
  { name: 'calendar', href: '/calendar', label: 'Calendar' },
  { name: 'reports', href: '/reports', label: 'Reports' },
  { name: 'chat', href: '/chat', label: 'Coach' },
] as const;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <NavBar>
          {LINKS.map((link) => (
            <TabTrigger key={link.name} name={link.name} href={link.href} asChild>
              <NavLink>{link.label}</NavLink>
            </TabTrigger>
          ))}
        </NavBar>
      </TabList>
    </Tabs>
  );
}

/**
 * Exported only so `__tests__/nav-link-test.tsx` can hand it the props the Slot
 * really delivers. The spread-order bug it guards against typechecks and lints
 * clean, so a test is the only thing that can catch it coming back.
 */
export function NavLink({ children, isFocused, style, ...rest }: TabTriggerSlotProps) {
  const sheet = useThemedStyles(navSheet);

  return (
    // `{...rest}` first, and `style` pulled out of it by name — the same trap as
    // in `NavBar` below, sprung from the other side.
    //
    // `TabTrigger asChild` renders a Radix `Slot`, whose `mergeProps` only merges
    // props the child element declares for itself. `<NavLink>{label}</NavLink>`
    // declares nothing but `children`, so the trigger's own
    // `{ flexDirection: 'row', justifyContent: 'space-between' }` arrived
    // untouched in `rest` — and spreading `rest` last replaced this callback
    // wholesale. Every link silently lost its padding, its pill radius and its
    // hover/focused/pressed backgrounds, which is both why the bar looked
    // cramped and why clicking appeared to do nothing: the navigation fired, but
    // with no focused pill and no hit area beyond the glyphs themselves, nothing
    // in the bar acknowledged it.
    <Pressable
      {...rest}
      accessibilityRole="link"
      accessibilityState={{ selected: isFocused }}
      style={(state) => [
        // Kept rather than discarded, but first, so these tokens win.
        typeof style === 'function' ? style(state) : style,
        sheet.link,
        // Hover is web-only and react-native-web is the only renderer that
        // reports it, which is fine — this file only ever runs there.
        state.hovered && !isFocused && sheet.linkHovered,
        isFocused && sheet.linkFocused,
        state.pressed && sheet.linkPressed,
      ]}
    >
      <ThemedText variant="label" tone={isFocused ? 'accentText' : 'textSecondary'}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function NavBar(props: TabListProps) {
  const sheet = useThemedStyles(navSheet);

  return (
    // `{...props}` must come before `style`: TabList passes its own style down,
    // so spreading last silently dropped `bar`'s fixed positioning and left the
    // nav laid out inline below the fold.
    <View {...props} style={[props.style, sheet.bar]}>
      <View style={sheet.inner}>
        <Wordmark />

        <View style={sheet.links}>{props.children}</View>

        <AccountButton />
      </View>
    </View>
  );
}

/**
 * Below this width the bar cannot hold the wordmark, five links and the account
 * button at once — the five pills alone are around 430px, plus the mark, the
 * account button and the bar's own padding. Nothing shrinks in React Native by
 * default (`flexShrink` is 0, not 1 as on the web), so an overflowing bar does
 * not compress: it pushes the rightmost links past the edge, where they are
 * invisible and unclickable. The word is the one part that can go without
 * costing navigation.
 */
const WordmarkBreakpoint = 720;

function Wordmark() {
  const sheet = useThemedStyles(navSheet);
  const { width } = useWindowDimensions();

  return (
    <View style={sheet.brand}>
      <View style={sheet.mark}>
        <ThemedText variant="label" tone="textOnFill">
          E
        </ThemedText>
      </View>
      {width >= WordmarkBreakpoint ? <ThemedText variant="heading">Edgewise</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: '100%',
  },
});

const navSheet = (t: Theme) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      // Exactly `WebTopNavInset`, so the padding every screen adds to clear this
      // bar is the height this bar actually has. Derived from the constant rather
      // than written twice, because the two drifting apart is either a gap or a
      // clipped heading.
      height: WebTopNavInset,
      paddingHorizontal: t.space.three,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.color.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.border,
      // Above every scrolling screen, so content passes behind the bar rather
      // than through the gaps either side of the inner column.
      zIndex: 100,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.three,
      width: '100%',
      // Lines the nav up with the screen content below it, which is capped at
      // the same width.
      maxWidth: MaxContentWidth,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.two,
      marginRight: 'auto',
    },
    mark: {
      width: 28,
      height: 28,
      borderRadius: t.radius.sm,
      backgroundColor: t.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    links: {
      flexDirection: 'row',
      alignItems: 'center',
      // The pills' own 16px of horizontal padding does most of the separating —
      // this is only the gap between two adjacent backgrounds, so it stays small.
      gap: t.space.one,
    },
    link: {
      paddingVertical: t.space.two,
      paddingHorizontal: t.space.three,
      borderRadius: t.radius.pill,
      backgroundColor: 'transparent',
    },
    linkHovered: {
      backgroundColor: t.color.surfaceActive,
    },
    linkFocused: {
      backgroundColor: t.color.accentSoft,
    },
    linkPressed: {
      opacity: 0.7,
    },
  });
