/**
 * Web navigation — responsive top bar with desktop links and mobile hamburger curtain,
 * plus a persistent floating Coach AI button.
 *
 * `expo-router/ui` is the headless tab primitive: it owns the routing and the
 * focused state, and hands the rendering over entirely.
 *
 * On desktop (>= 768px), links sit horizontally in the top bar with the AccountButton.
 * On mobile (< 768px), the top bar contains only the brand logo and the hamburger button
 * (styled after skku-global's sleek menu-btn). The mobile menu expands into a fullscreen
 * curtain featuring numbered links (01 Dashboard, 02 Trades, etc.), the seam divider,
 * and account access.
 *
 * The Coach tab is also accessible on all pages via a floating action button (FAB) at
 * bottom-right, giving 1-tap AI access everywhere while staying hidden on the chat screen itself.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import {
  TabList,
  Tabs,
  TabSlot,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AccountButton } from '@/components/ui/account-button';
import { MaxContentWidth, WebTopNavInset, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemedStyles } from '@/lib/styles';

/** Route name to href. Kept together so a new screen is one entry, not four. */
const LINKS = [
  { name: 'index', href: '/', label: 'Dashboard' },
  { name: 'trades', href: '/trades', label: 'Trades' },
  { name: 'calendar', href: '/calendar', label: 'Calendar' },
  { name: 'reports', href: '/reports', label: 'Reports' },
  { name: 'chat', href: '/chat', label: 'Coach' },
] as const;

export const MobileBreakpoint = 768;

export default function AppTabs() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width < MobileBreakpoint;

  let pathname = '/';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    pathname = usePathname();
  } catch {
    // Fallback when rendered outside router context
  }

  // Close curtain when navigating
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close curtain automatically if window is resized to desktop
  useEffect(() => {
    if (!isMobile && menuOpen) {
      setMenuOpen(false);
    }
  }, [isMobile, menuOpen]);

  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <NavBar
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((o) => !o)}
          isMobile={isMobile}
        >
          {LINKS.map((link) => (
            <TabTrigger key={link.name} name={link.name} href={link.href} asChild>
              <NavLink>{link.label}</NavLink>
            </TabTrigger>
          ))}
        </NavBar>
      </TabList>

      {/* Small Device Fullscreen Curtain Dropdown (skku-global style) */}
      {isMobile && menuOpen ? (
        <CurtainMenu
          onClose={() => setMenuOpen(false)}
          activePath={pathname}
        />
      ) : null}

      {/* Floating Coach Message Button across all pages */}
      <CoachFloatingButton pathname={pathname} />
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
    <Pressable
      {...rest}
      accessibilityRole="link"
      accessibilityState={{ selected: isFocused }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        sheet.link,
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

type NavBarProps = TabListProps & {
  menuOpen?: boolean;
  onToggleMenu?: () => void;
  isMobile?: boolean;
};

function NavBar({ menuOpen = false, onToggleMenu, isMobile = false, ...props }: NavBarProps) {
  const sheet = useThemedStyles(navSheet);

  return (
    <View {...props} style={[props.style, sheet.bar]}>
      <View style={sheet.inner}>
        <Wordmark />

        {/* Desktop nav pills — kept mounted in TabList so Tabs registers routes, but hidden on mobile */}
        <View style={isMobile ? sheet.linksHidden : sheet.links}>
          {props.children}
        </View>

        {/* On mobile: just the logo and hamburger button. On desktop: AccountButton */}
        {isMobile ? (
          <MenuButton open={menuOpen} onPress={onToggleMenu} />
        ) : (
          <AccountButton />
        )}
      </View>
    </View>
  );
}

function Wordmark() {
  const sheet = useThemedStyles(navSheet);
  const { width } = useWindowDimensions();
  // Show brand name as long as screen has at least 340px width
  const showName = width >= 340;

  return (
    <View style={sheet.brand}>
      <View style={sheet.mark}>
        <ThemedText variant="label" tone="textOnFill">
          E
        </ThemedText>
      </View>
      {showName ? <ThemedText variant="heading">Edgewise</ThemedText> : null}
    </View>
  );
}

/**
 * Hamburger toggle button — styled after skku-global's pill button.
 */
function MenuButton({ open, onPress }: { open: boolean; onPress?: () => void }) {
  const sheet = useThemedStyles(navSheet);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? 'Close navigation menu' : 'Open navigation menu'}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={({ pressed }) => [
        sheet.menuBtn,
        open && sheet.menuBtnOpen,
        pressed && sheet.menuBtnPressed,
      ]}
    >
      <Ionicons
        name={open ? 'close' : 'menu'}
        size={18}
        color={open ? theme.color.accentText : theme.color.text}
      />
      <ThemedText
        variant="label"
        tone={open ? 'accentText' : 'text'}
        style={sheet.menuBtnText}
      >
        {open ? 'Close' : 'Menu'}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Fullscreen mobile curtain menu — inspired by skku-global's Menu.jsx.
 * Numbered items (01 Dashboard, 02 Trades...), seam divider, and account actions.
 */
function CurtainMenu({
  onClose,
  activePath,
}: {
  onClose: () => void;
  activePath: string;
}) {
  const sheet = useThemedStyles(navSheet);
  const router = useRouter();

  // Escape key closes menu on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSelect = (href: string) => {
    onClose();
    router.navigate(href as any);
  };

  return (
    <View style={sheet.curtain}>
      <ScrollView
        contentContainerStyle={sheet.curtainScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={sheet.curtainNav}>
          {LINKS.map((link, i) => {
            const isActive =
              link.href === '/'
                ? activePath === '/' || activePath === ''
                : activePath === link.href || activePath.startsWith(link.href);

            return (
              <Pressable
                key={link.name}
                accessibilityRole="link"
                accessibilityLabel={link.label}
                accessibilityState={{ selected: isActive }}
                onPress={() => handleSelect(link.href)}
                style={({ pressed }) => [
                  sheet.bigLink,
                  pressed && sheet.bigLinkPressed,
                ]}
              >
                <ThemedText style={[sheet.linkNum, isActive && sheet.linkNumActive]}>
                  {`0${i + 1}`}
                </ThemedText>
                <ThemedText style={[sheet.linkText, isActive && sheet.linkTextActive]}>
                  {link.label}
                </ThemedText>
                {isActive ? <View style={sheet.activeDot} /> : null}
              </Pressable>
            );
          })}
        </View>

        {/* The Seam — from skku-global */}
        <View style={sheet.seam} />

        {/* Account & Sign out row */}
        <View style={sheet.curtainAccount}>
          <AccountButton />
          <View style={sheet.curtainAccountInfo}>
            <ThemedText variant="body" tone="text">
              Account & Profile
            </ThemedText>
            <ThemedText variant="caption" tone="textTertiary">
              Tap avatar to sign out
            </ThemedText>
          </View>
        </View>

        {/* Curtain footer — from skku-global */}
        <ThemedText variant="caption" tone="textTertiary" style={sheet.curtainFoot}>
          Edgewise • Trade journal & AI Coach
        </ThemedText>
      </ScrollView>
    </View>
  );
}

/**
 * Floating Coach Button (FAB) — appears across all pages, hidden on /chat.
 */
function CoachFloatingButton({ pathname }: { pathname: string }) {
  const sheet = useThemedStyles(navSheet);
  const theme = useTheme();
  const router = useRouter();

  // Hide on the coach screen so it doesn't overlap the chat composer
  const isChat = pathname === '/chat' || pathname?.endsWith('/chat');
  if (isChat) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask AI Trading Coach"
      onPress={() => router.navigate('/chat')}
      style={({ pressed }) => [
        sheet.fab,
        pressed && sheet.fabPressed,
      ]}
    >
      <Ionicons name="chatbubble-ellipses" size={26} color={theme.color.textOnFill} />
    </Pressable>
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
      height: WebTopNavInset,
      paddingHorizontal: t.space.three,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.color.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.border,
      zIndex: 100,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.three,
      width: '100%',
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
      gap: t.space.one,
    },
    linksHidden: {
      display: 'none',
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
    menuBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.one,
      paddingVertical: t.space.one,
      paddingHorizontal: t.space.three,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: 'transparent',
    },
    menuBtnOpen: {
      borderColor: t.color.accent,
      backgroundColor: t.color.accentSoft,
    },
    menuBtnPressed: {
      opacity: 0.7,
    },
    menuBtnText: {
      fontSize: 14,
      fontWeight: '500',
    },
    curtain: {
      position: 'fixed' as any,
      top: WebTopNavInset,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.color.bg,
      zIndex: 99,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.color.border,
    },
    curtainScroll: {
      paddingHorizontal: t.space.four,
      paddingVertical: t.space.four,
      minHeight: '100%',
      justifyContent: 'flex-start',
    },
    curtainNav: {
      gap: t.space.three,
      paddingVertical: t.space.two,
    },
    bigLink: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.space.two,
      gap: t.space.three,
    },
    bigLinkPressed: {
      opacity: 0.7,
    },
    linkNum: {
      fontSize: 14,
      fontWeight: '600',
      color: t.color.textTertiary,
      width: 28,
    },
    linkNumActive: {
      color: t.color.accentText,
    },
    linkText: {
      fontSize: 26,
      fontWeight: '700',
      color: t.color.text,
      letterSpacing: -0.5,
    },
    linkTextActive: {
      color: t.color.accentText,
    },
    activeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.color.accent,
      marginLeft: 'auto',
    },
    seam: {
      height: 2,
      backgroundColor: t.color.accent,
      width: '100%',
      marginVertical: t.space.four,
      borderRadius: 1,
    },
    curtainAccount: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.three,
      paddingVertical: t.space.two,
    },
    curtainAccountInfo: {
      flexShrink: 1,
      gap: 2,
    },
    curtainFoot: {
      marginTop: t.space.six,
      textAlign: 'center',
      paddingBottom: t.space.four,
    },
    fab: {
      position: 'fixed' as any,
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 90,
      ...t.elevation[3],
    },
    fabPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.95 }],
    },
  });

