import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Button, H1, OptionCard, Page, SectionLabel, Wave } from './ui';
import { Rise } from './motion';
import { colors } from './theme';

// WIRE: replace with the signed-in user's name
const USER_NAME = 'chill';

export type HomeProps = {
  tradeCount?: number;
  onPlan?: () => void;
  onConnect?: () => void;
  onScreenshot?: () => void;
  onMany?: () => void;
  onManual?: () => void;
};

export default function HomeScreen({ tradeCount = 0, onPlan, onConnect, onScreenshot, onMany, onManual }: HomeProps) {
  const { width } = useWindowDimensions();
  const small = width < 600;
  return (
    <Page>
      <Rise>
        <H1>Hi {USER_NAME}</H1>
      </Rise>
      <Rise delay={150}>
        <Text style={{ marginTop: 8, fontSize: 19, color: colors.muted }}>
          Log your first trade to start building your edge.
        </Text>
      </Rise>

      <Rise delay={300} style={{ marginTop: 32 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            padding: small ? 24 : 32,
            borderRadius: 24,
            backgroundColor: colors.mint,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: 520 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onMint }}>
              Step 1 of your journal: plan it before
            </Text>
            <Text style={{ marginTop: 8, fontSize: small ? 32 : 40, fontWeight: '700', letterSpacing: -1, color: colors.onMint }}>
              Plan a trade
            </Text>
            <Text style={{ marginTop: 10, marginBottom: 18, fontSize: 18, color: colors.onMint }}>
              Say it or type it. Get it written down before you click.
            </Text>
            <Button variant="dark" icon="mic-outline" label="Start planning" onPress={onPlan} style={{ alignSelf: 'flex-start' }} />
          </View>
          <Wave />
        </View>
      </Rise>

      <Rise delay={450} style={{ marginTop: 44 }}>
        <SectionLabel>Add your trades</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
          <OptionCard icon="hardware-chip-outline" tag="Fastest" title="Connect MetaTrader" desc="Auto-sync. Closed trades arrive on their own." onPress={onConnect} />
          <OptionCard icon="image-outline" title="From a screenshot" desc="Drop one trade screenshot." onPress={onScreenshot} />
          <OptionCard icon="images-outline" title="Many from history" desc="Add several history screenshots at once." onPress={onMany} />
          <OptionCard icon="create-outline" title="By hand" desc="Type a trade in yourself." onPress={onManual} />
        </View>
      </Rise>

      {tradeCount === 0 ? (
        <Rise delay={600} style={{ marginTop: 32 }}>
          <View style={{ padding: 32, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 56 }}>
              {[22, 40, 30, 52, 34].map((h, i) => (
                <View key={i} style={{ width: 14, height: h, borderRadius: 3, backgroundColor: colors.skeleton }} />
              ))}
            </View>
            <Text style={{ marginTop: 14, fontSize: 20, fontWeight: '600', color: colors.ink }}>No trades yet</Text>
            <Text style={{ marginTop: 4, color: colors.muted, textAlign: 'center' }}>
              Connect MetaTrader and your closed trades will show up here.
            </Text>
          </View>
        </Rise>
      ) : null}
    </Page>
  );
}
