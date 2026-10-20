import React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { colors } from './theme';

/**
 * The one navbar layout, used by both designs: links on each side of a centred
 * logo, frosted glass behind it, tools pinned to the right. On a phone the menu
 * button sits left, the logo stays in the middle and the mode toggle is right.
 */
export function NavFrame({
  wide,
  linksLeft,
  linksRight,
  menu,
  tools,
  onLogo,
  top = 0,
}: {
  wide: boolean;
  linksLeft?: React.ReactNode;
  linksRight?: React.ReactNode;
  menu?: React.ReactNode;
  tools: React.ReactNode;
  onLogo: () => void;
  top?: number;
}) {
  const glass: object =
    Platform.OS === 'web'
      ? { backdropFilter: 'saturate(180%) blur(18px)', WebkitBackdropFilter: 'saturate(180%) blur(18px)' }
      : {};
  return (
    <View
      style={[
        {
          width: '100%',
          alignItems: 'center',
          paddingTop: top,
          backgroundColor: colors.bg + 'D9',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          zIndex: 100,
        },
        glass,
      ]}
    >
      <View style={{ width: '100%', maxWidth: 1200, height: 60, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
        {wide ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <View style={{ flexDirection: 'row', gap: 2 }}>{linksLeft}</View>
            <Logo onPress={onLogo} />
            <View style={{ flexDirection: 'row', gap: 2 }}>{linksRight}</View>
          </View>
        ) : (
          <Logo onPress={onLogo} />
        )}
        {!wide ? <View style={{ position: 'absolute', left: 16 }}>{menu}</View> : null}
        <View style={{ position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>{tools}</View>
      </View>
    </View>
  );
}

function Logo({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Edgewise home"
      onPress={onPress}
      style={{ marginHorizontal: 22 }}
    >
      <BrandMark size={38} />
    </Pressable>
  );
}
