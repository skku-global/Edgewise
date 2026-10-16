// Adds the "Open this day" card to the DARK design's calendar (src/classic/calendar-screen.tsx).
// Run once: node scripts/patch-calendar.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'src/classic/calendar-screen.tsx';
if (!existsSync(file)) {
  console.log(`FAIL  ${file} not found. Run this from the project folder.`);
  process.exit(1);
}

const raw = readFileSync(file, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let text = raw.replace(/\r\n/g, '\n');

if (text.includes('open-day')) {
  console.log('DONE  already patched');
  process.exit(0);
}

const card = `
          <Card style={styles.dayCard}>
            <View style={styles.dayCardText}>
              <ThemedText variant="caption" tone="textTertiary">
                {activeDay.date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
              </ThemedText>
              <ThemedText variant="title">
                {activeDay.trades === 0
                  ? 'No trades'
                  : \`\${activeDay.trades} \${activeDay.trades === 1 ? 'trade' : 'trades'}\`}
              </ThemedText>
            </View>
            <Button
              label="Open this day"
              onPress={() => (dayTrades.length > 0 ? setSelectedTrade(dayTrades[0]) : setAddVisible(true))}
              testID="open-day"
            />
          </Card>
`;

const changes = [
  [
    /import \{ TradeDetailSheet \} from '@\/components\/trade-detail-sheet';/,
    "import { AddTradeSheet } from '@/components/add-trade-sheet';\nimport { TradeDetailSheet } from '@/components/trade-detail-sheet';",
  ],
  [
    /const \[selectedTrade, setSelectedTrade\] = useState<TradeRow \| null>\(null\);/,
    "const [selectedTrade, setSelectedTrade] = useState<TradeRow | null>(null);\n  const [addVisible, setAddVisible] = useState(false);",
  ],
  [/\n(\s*)\{dayTrades\.length === 0 \? \(/, (match) => card + match],
  [
    /<TradeDetailSheet trade=\{selectedTrade\} onClose=\{\(\) => setSelectedTrade\(null\)\} \/>/,
    "<AddTradeSheet visible={addVisible} onClose={() => setAddVisible(false)} onSaved={refresh} />\n      <TradeDetailSheet trade={selectedTrade} onClose={() => setSelectedTrade(null)} />",
  ],
  [
    /statRow: \{\s*flexDirection: 'row',\s*gap: t\.space\.three,\s*\},/,
    "statRow: {\n      flexDirection: 'row',\n      gap: t.space.three,\n    },\n    dayCard: {\n      flexDirection: 'row',\n      alignItems: 'center',\n      justifyContent: 'space-between',\n      flexWrap: 'wrap',\n      gap: t.space.three,\n      marginBottom: t.space.two,\n    },\n    dayCardText: {\n      gap: t.space.half,\n    },",
  ],
];

for (const [re, replacement] of changes) {
  const found = text.match(new RegExp(re.source, 'g'));
  if (!found || found.length !== 1) {
    console.log(`FAIL  expected 1 match for ${re}, found ${found ? found.length : 0}. Nothing was changed.`);
    process.exit(1);
  }
  text = text.replace(re, (match) => (typeof replacement === 'function' ? replacement(match) : replacement));
}

writeFileSync(file, text.replace(/\n/g, eol));
console.log('OK    "Open this day" added to the dark calendar.');
