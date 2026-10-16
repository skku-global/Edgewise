import ClassicCalendar from '../../classic/calendar-screen';
import CalendarScreen from '../../design/calendar-screen';
import { useDesignMode } from '../../design/mode';

// Dark design: the original screen (src/classic). White design: the new screen (src/design).
// WIRE: the white screen still needs its data props, see .redesign-backup/calendar.tsx.bak
export default function CalendarRoute() {
  const { mode } = useDesignMode();
  return mode === 'dark' ? <ClassicCalendar /> : <CalendarScreen />;
}
