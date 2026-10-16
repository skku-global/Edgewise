import ClassicReports from '../../classic/reports-screen';
import ReportsScreen from '../../design/reports-screen';
import { useDesignMode } from '../../design/mode';

// Dark design: the original screen (src/classic). White design: the new screen (src/design).
// WIRE: the white screen still needs its data props, see .redesign-backup/reports.tsx.bak
export default function ReportsRoute() {
  const { mode } = useDesignMode();
  return mode === 'dark' ? <ClassicReports /> : <ReportsScreen />;
}
