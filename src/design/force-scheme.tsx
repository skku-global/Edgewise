import { createContext, type ReactNode } from 'react';

/** When set, everything inside uses that colour scheme, whatever design mode is on. */
export type ForcedScheme = 'dark' | 'light' | null;

export const ForcedSchemeContext = createContext<ForcedScheme>(null);

export function ForceScheme({ scheme, children }: { scheme: 'dark' | 'light'; children: ReactNode }) {
  return <ForcedSchemeContext.Provider value={scheme}>{children}</ForcedSchemeContext.Provider>;
}
