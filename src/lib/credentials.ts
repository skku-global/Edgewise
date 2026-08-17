/**
 * Credential checks for the sign-in form.
 *
 * Pure, and deliberately outside the screen: the interesting rules here are the
 * ones that are easy to get subtly wrong (an email regex that rejects valid
 * addresses, a strength meter that calls a long passphrase weak), and those are
 * worth asserting in tests rather than eyeballing in a browser.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MINIMUM IS 6 AND NOT 8
 * ---------------------------------------------------------------------------
 * Supabase enforces its own minimum, and the project default is 6. Requiring 8
 * in the client would reject passwords the backend is perfectly happy with —
 * the client would be inventing a policy the server does not have, and the two
 * would drift the moment the Supabase setting changed. So the gate matches the
 * server, and the strength meter carries the encouragement instead: advice, not
 * a refusal.
 */

/** Matches the Supabase project's password policy. Sign-up only. */
export const MinPasswordLength = 6;

/**
 * Is this plausibly an email address?
 *
 * Deliberately loose. The only authority on whether an address exists is the
 * confirmation email, so the job here is catching the typo that would otherwise
 * cost a round trip -- a missing `@`, a trailing space, `alex@gmail` with no
 * TLD. Anything stricter starts rejecting real addresses: valid ones contain
 * `+`, apostrophes and multiple dots, and the full RFC 5322 grammar is famously
 * not worth implementing for this.
 */
export function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export type PasswordScore = 0 | 1 | 2 | 3;

export type PasswordStrength = {
  /** 0 = nothing typed, 1 = weak, 2 = fair, 3 = strong. */
  score: PasswordScore;
  /** Empty string at score 0, so the caller can render nothing. */
  label: string;
};

const CharacterClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];

/**
 * Rough password strength, for the meter under the field.
 *
 * Length is weighted more heavily than character variety, because that is what
 * actually resists guessing: `Tr4d1ng!` has all four classes and eight
 * characters, and is far weaker than a twenty-character phrase in one class.
 * A meter that says otherwise teaches the wrong habit, which is worse than
 * having no meter at all.
 *
 * Not an entropy estimate and not presented as one -- there is no dictionary
 * here, so `passwordpassword` scores well. It is a nudge toward length.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { score: 0, label: '' };
  }

  // Below the server's minimum there is nothing to rate: it cannot be used at
  // all, and saying "weak" invites another character rather than four more.
  if (password.length < MinPasswordLength) {
    return { score: 1, label: 'Too short' };
  }

  const classes = CharacterClasses.filter((pattern) => pattern.test(password)).length;

  let points = classes;
  if (password.length >= 10) points += 1;
  if (password.length >= 14) points += 1;
  if (password.length >= 20) points += 2;

  if (points >= 5) {
    return { score: 3, label: 'Strong' };
  }
  if (points >= 3) {
    return { score: 2, label: 'Fair' };
  }

  return { score: 1, label: 'Weak' };
}
