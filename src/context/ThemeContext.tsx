import React, { createContext, useContext } from 'react';
import { G, ThemeTokens } from '../theme';

const ThemeContext = createContext<ThemeTokens>(G);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={G}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeTokens {
  return useContext(ThemeContext);
}
