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
import { Pressable, StyleSheet, View } from 'react-native';

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

function NavLink({ children, isFocused, ...rest }: TabTriggerSlotProps) {
  const sheet = useThemedStyles(navSheet);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed, hovered }) => [
        sheet.link,
        // Hover is web-only and react-native-web is the only renderer that
        // reports it, which is fine — this file only ever runs there.
        hovered && !isFocused && sheet.linkHovered,
        isFocused && sheet.linkFocused,
        pressed && sheet.linkPressed,
      ]}
      {...rest}
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

function Wordmark() {
  const sheet = useThemedStyles(navSheet);

  return (
    <View style={sheet.brand}>
      <View style={sheet.mark}>
        <ThemedText variant="label" tone="textOnFill">
          E
        </ThemedText>
      </View>
      <ThemedText variant="heading">Edgewise</ThemedText>
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
      gap: t.space.half,
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
