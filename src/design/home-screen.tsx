import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Button, H1, OptionCard, Page, SectionLabel } from './ui';
import { Rise } from './motion';
import { colors } from './theme';

export type HomeProps = {
  tradeCount?: number;
  userName?: string;
  onAuto?: () => void;
  onManual?: () => void;
  // Backward compatibility
  onPlan?: () => void;
  onConnect?: () => void;
  onScreenshot?: () => void;
  onMany?: () => void;
};

export default function HomeScreen({
  tradeCount = 0,
  userName = 'Trader',
  onAuto,
  onManual,
  onPlan,
  onConnect,
}: HomeProps) {
  const { width } = useWindowDimensions();
  const small = width < 600;

  const handleManual = onManual ?? onPlan;
  const handleAuto = onAuto ?? onConnect;

  return (
    <Page>
      <Rise>
        <H1>Hi {userName}</H1>
      </Rise>
      <Rise delay={150}>
        <Text style={{ marginTop: 8, fontSize: 19, color: colors.muted }}>
          Log your trades with discipline, psychology, and evidence.
        </Text>
      </Rise>

      <Rise delay={300} style={{ marginTop: 32 }}>
        <SectionLabel>Add or import trades</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
          <OptionCard
            icon="create-outline"
            tag="Full Flow"
            title="Manual Trade (Journal)"
            desc="One place: plan it before, track notes during, and review exit with screenshots."
            onPress={handleManual}
          />
          <OptionCard
            icon="hardware-chip-outline"
            tag="Auto"
            title="Auto (MetaTrader & Reports)"
            desc="Connect MetaTrader for live deal auto-sync or import your MT5 statement HTML."
            onPress={handleAuto}
          />
        </View>
      </Rise>

      <Rise delay={450} style={{ marginTop: 28 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            padding: small ? 20 : 28,
            borderRadius: 20,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: 560 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.green }}>
              Evidence-based journaling
            </Text>
            <Text style={{ marginTop: 6, fontSize: small ? 22 : 26, fontWeight: '700', letterSpacing: -0.5, color: colors.ink }}>
              Before • During • After
            </Text>
            <Text style={{ marginTop: 6, fontSize: 15, color: colors.muted }}>
              Manual trades require at least 2 screenshots (entry and exit) to close. Speak, type, or attach charts to keep your trade log accountable.
            </Text>
          </View>
          <Button variant="primary" icon="add" label="Start a trade" onPress={handleManual} />
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
              Add a manual plan or connect MetaTrader to see your trades and insights here.
            </Text>
          </View>
        </Rise>
      ) : null}
    </Page>
  );
}
