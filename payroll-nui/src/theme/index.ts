// Theme System - Main Export
// Centralized export for all theme-related functionality

export * from './types';
export { payrollDarkTheme } from './themes/payroll-dark';
export { payrollLightTheme } from './themes/payroll-light';

// Re-export theme for easy access
import { payrollDarkTheme } from './themes/payroll-dark';
import { payrollLightTheme } from './themes/payroll-light';

export const themes = {
  dark: payrollDarkTheme,
  light: payrollLightTheme,
} as const;

export type ThemeMode = keyof typeof themes;
