/**
 * Tests for the sign-in form's credential checks.
 *
 * The email cases are mostly about what must NOT be rejected: a form that
 * refuses a valid address is unrecoverable for the person holding it, and
 * `alex+journal@gmail.com` is the address a trader signing up for a tool like
 * this is most likely to use.
 *
 * The strength cases pin down the one judgement call in the file — that length
 * beats character variety — because it is the assertion someone "tidying up"
 * the scoring would otherwise quietly reverse.
 */

import { MinPasswordLength, isEmailish, passwordStrength } from '../credentials';

describe('isEmailish', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmailish('alex@example.com')).toBe(true);
    expect(isEmailish('a@b.co')).toBe(true);
  });

  it('accepts the shapes a strict regex tends to break on', () => {
    expect(isEmailish('alex+journal@gmail.com')).toBe(true);
    expect(isEmailish("o'brien@example.com")).toBe(true);
    expect(isEmailish('alex.morgan@mail.example.co.uk')).toBe(true);
    expect(isEmailish('alex_1@example-host.com')).toBe(true);
  });

  it('ignores surrounding whitespace, which autofill and paste both add', () => {
    expect(isEmailish('  alex@example.com  ')).toBe(true);
  });

  it('rejects the common typos', () => {
    expect(isEmailish('')).toBe(false);
    expect(isEmailish('alex')).toBe(false);
    expect(isEmailish('alex@')).toBe(false);
    expect(isEmailish('alex@gmail')).toBe(false);
    expect(isEmailish('@example.com')).toBe(false);
    expect(isEmailish('alex@@example.com')).toBe(false);
    expect(isEmailish('alex example@mail.com')).toBe(false);
    expect(isEmailish('alex@example.c')).toBe(false);
  });
});

describe('passwordStrength', () => {
  it('rates nothing at all as nothing, with no label to render', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' });
  });

  it('says "too short" below the server minimum rather than "weak"', () => {
    // "Weak" invites one more character. "Too short" says what is wrong.
    expect(passwordStrength('abc')).toEqual({ score: 1, label: 'Too short' });
    expect(passwordStrength('a'.repeat(MinPasswordLength - 1)).label).toBe('Too short');
  });

  it('rates a single-class password at the minimum length as weak', () => {
    expect(passwordStrength('abcdef').score).toBe(1);
    expect(passwordStrength('password').score).toBe(1);
  });

  it('rates a mixed short password as fair, not strong', () => {
    expect(passwordStrength('Passwd1').score).toBe(2);
    expect(passwordStrength('Tr4d1ng!').score).toBe(2);
  });

  it('rates a long passphrase in one class as strong', () => {
    // The assertion that matters: 25 lowercase characters beats eight
    // characters with every class in them. Reversing the weighting would flip
    // both this test and the one above.
    expect(passwordStrength('correcthorsebatterystaple').score).toBe(3);
    expect(passwordStrength('Tr4d1ng!').score).toBeLessThan(
      passwordStrength('correcthorsebatterystaple').score,
    );
  });

  it('rates a long mixed password as strong', () => {
    expect(passwordStrength('Password1!').score).toBe(3);
  });

  it('does not let extra length rate lower than less length', () => {
    // Monotonicity. A scoring function that dips as the password grows is the
    // kind of bug a meter hides well, so walk one up and assert it never falls.
    let previous = 0;
    for (let length = MinPasswordLength; length <= 30; length += 1) {
      const { score } = passwordStrength('a'.repeat(length));
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });
});
