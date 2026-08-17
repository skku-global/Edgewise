/**
 * A countdown that disables a button after it has been pressed.
 *
 * Every email the app can send is rate-limited on the server — Supabase's
 * built-in mailer allows a couple of messages an hour, and its own answer to a
 * too-soon retry is "For security purposes, you can only request this after N
 * seconds". Letting someone press "resend" four times to discover that spends
 * their whole quota on nothing and reads as a broken button.
 *
 * So the countdown is shown before the fact. It is not a security measure — the
 * server is that, and it cannot be bypassed from here — it is the difference
 * between a control that looks dead and one that says how long.
 */

import { useEffect, useRef, useState } from 'react';

export type Cooldown = {
  /** Seconds left, 0 when clear. */
  remaining: number;
  active: boolean;
  /** Restarts the countdown from the full duration. */
  start: () => void;
};

export function useCooldown(seconds: number): Cooldown {
  const [remaining, setRemaining] = useState(0);
  // Held in a ref so the interval, which is created once, always reads the
  // current value without being torn down and rebuilt on every tick.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (remaining <= 0) {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      return;
    }

    if (timer.current) {
      return;
    }

    timer.current = setInterval(() => {
      setRemaining((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
  }, [remaining]);

  // Unmounting mid-countdown — which is what leaving the screen does — must not
  // leave the interval running against a dead setState.
  useEffect(
    () => () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    },
    [],
  );

  return {
    remaining,
    active: remaining > 0,
    start: () => setRemaining(seconds),
  };
}
