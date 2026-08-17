import { Accelerometer } from "expo-sensors";
import { Platform } from "react-native";

/** Sample window, in ms, used to classify movement while logging a mood. */
const MOTION_SAMPLE_MS = 2000;

/**
 * Movement threshold in g. Each sample's magnitude has gravity (1g) removed,
 * so a phone resting on a desk reads ~0. Hand tremor lands well under 0.15;
 * fidgeting or walking sits above it.
 */
const MOTION_RESTLESS_THRESHOLD = 0.15;

/**
 * Samples the accelerometer briefly and classifies the result.
 *
 * Returns null when no reading is possible — browsers expose no accelerometer,
 * so this is the normal path on web and the insert simply stores null.
 */
export async function readMotionFlag(): Promise<"steady" | "restless" | null> {
  if (Platform.OS === "web") {
    return null;
  }

  try {
    if (!(await Accelerometer.isAvailableAsync())) {
      return null;
    }
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const deviations: number[] = [];
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      subscription.remove();

      if (deviations.length === 0) {
        resolve(null);
        return;
      }

      const mean =
        deviations.reduce((total, value) => total + value, 0) /
        deviations.length;
      resolve(mean > MOTION_RESTLESS_THRESHOLD ? "restless" : "steady");
    };

    Accelerometer.setUpdateInterval(100);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      // Subtract the constant 1g pull so a stationary device reads ~0
      // regardless of which way up it is sitting.
      deviations.push(Math.abs(Math.sqrt(x * x + y * y + z * z) - 1));
    });

    const timer = setTimeout(finish, MOTION_SAMPLE_MS);
  });
}
