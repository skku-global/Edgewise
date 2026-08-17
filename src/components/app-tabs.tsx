/**
 * Native bottom tab bar (iOS / Android).
 *
 * `expo-router/unstable-native-tabs` renders the real platform tab bar —
 * UITabBarController on iOS, BottomNavigationView on Android — so it inherits
 * the system blur, the iOS 26 minimize-on-scroll behaviour and the correct
 * safe-area handling for free. The web build uses `app-tabs.web.tsx` instead,
 * which is a top nav bar; nothing here is shared with it.
 *
 * Icons are vector, not bitmaps: `sf` names an SF Symbol on iOS and
 * `androidSrc` hands Android a rasterised @expo/vector-icons glyph. The
 * previous version pointed all five tabs at the two tab PNGs the Expo template
 * ships (a house and a compass, alternating) because those were the only image
 * files in the project — so Calendar showed a house and Coach showed a compass.
 * Those files are gone now.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';

import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const theme = useTheme();

  return (
    <NativeTabs
      // `null` would let the platform pick its own translucent material, which
      // reads grey-blue against this palette. An explicit surface keeps the bar
      // in the same family as the cards above it.
      backgroundColor={theme.color.surface}
      tintColor={theme.color.accent}
      iconColor={{ default: theme.color.textTertiary, selected: theme.color.accent }}
      indicatorColor={theme.color.accentSoft}
      rippleColor={theme.color.accentSoft}
      badgeBackgroundColor={theme.color.loss}
      labelStyle={{
        default: { fontSize: Type.caption.fontSize, color: theme.color.textTertiary },
        selected: { fontSize: Type.caption.fontSize, color: theme.color.accentText },
      }}
      // iOS 26 only, ignored elsewhere: the bar shrinks out of the way while
      // reading a long trade list and comes back on the way up.
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="index">
        <Label>Dashboard</Label>
        <Icon
          sf="chart.line.uptrend.xyaxis"
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="chart-line" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="trades">
        <Label>Trades</Label>
        <Icon
          sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="format-list-bulleted" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="calendar">
        <Label>Calendar</Label>
        <Icon
          sf="calendar"
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="calendar-month" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reports">
        <Label>Reports</Label>
        <Icon
          sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="chart-bar" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <Label>Coach</Label>
        <Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="message-text" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
