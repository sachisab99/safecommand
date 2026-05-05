'use client';

/**
 * ThemeProvider — Ops Console (always SafeCommand brand).
 *
 * EC-14: Operations Console is on a separate auth domain from venues. SC
 * Ops users sign in with platform credentials and configure venues + brand
 * configs FOR enterprise customers — but they themselves never see the
 * enterprise brand. The Ops Console is fixed to SafeCommand identity to
 * prevent any cross-brand confusion (e.g., an SC Ops admin configuring
 * Apollo's brand config should clearly see 'SafeCommand Ops Console' as
 * the surrounding chrome, not 'Apollo SafeCommand').
 *
 * Therefore this provider does NOT accept a `brand` prop. The hooks always
 * return SAFECOMMAND_DEFAULT. The shape mirrors the dashboard ThemeProvider
 * for consumer-API parity.
 *
 * EC-17 / Rule 19: every colour and label still passes through the provider
 * — it's just that there's no enterprise resolution to perform.
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import { type BrandConfig, SAFECOMMAND_DEFAULT } from './types';

const ThemeContext = createContext<BrandConfig>(SAFECOMMAND_DEFAULT);

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  return <ThemeContext.Provider value={SAFECOMMAND_DEFAULT}>{children}</ThemeContext.Provider>;
}

/** Always returns SafeCommand defaults — no enterprise override on Ops Console. */
export function useBrand(): BrandConfig {
  return useContext(ThemeContext);
}

/**
 * Pass-through label resolver — returns the input key unchanged.
 * Provided for code-shape consistency with the dashboard ThemeProvider so
 * components migrating from a venue context to Ops Console don't break.
 */
export function useLabel(key: string): string {
  return key;
}
