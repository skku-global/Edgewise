import ClassicTrades from '../../classic/trades-screen';
import TradesScreen from '../../design/trades-screen';
import { useDesignMode } from '../../design/mode';

// Dark design: the original screen (src/classic). White design: the new screen (src/design).
// WIRE: the white screen still needs its data props, see .redesign-backup/trades.tsx.bak
export default function TradesRoute() {
  const { mode } = useDesignMode();
  return mode === 'dark' ? <ClassicTrades /> : <TradesScreen />;
}
