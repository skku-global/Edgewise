import ClassicIndex from '../../classic/index-screen';
import HomeScreen from '../../design/home-screen';
import { useDesignMode } from '../../design/mode';

// Dark design: the original screen (src/classic). White design: the new screen (src/design).
// WIRE: the white screen still needs its data props, see .redesign-backup/index.tsx.bak
export default function IndexRoute() {
  const { mode } = useDesignMode();
  return mode === 'dark' ? <ClassicIndex /> : <HomeScreen />;
}
