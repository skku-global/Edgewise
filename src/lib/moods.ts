/**
 * The mood picker's option list.
 *
 * Derived from the two groups `analyzeMoodPatterns` compares rather than typed
 * out again: the Add Trade form and the tagging queue both offer these, and the
 * insight engine classifies stored values against the same two arrays. Deriving
 * the list means a mood can never be offered that the insight silently drops
 * into neither group.
 */

import { COMPOSED_MOODS, STRESSED_MOODS } from './trade-insights';

export type MoodValue =
  | (typeof COMPOSED_MOODS)[number]
  | (typeof STRESSED_MOODS)[number];

/** Composed moods first, so the row reads as a scale rather than a jumble. */
export const MOOD_VALUES: readonly MoodValue[] = [
  ...COMPOSED_MOODS,
  ...STRESSED_MOODS,
];

export const MOOD_OPTIONS: { value: MoodValue; label: string }[] =
  MOOD_VALUES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));
