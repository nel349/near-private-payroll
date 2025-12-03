// Theme System Types for NEAR Private Payroll
// Comprehensive type definitions for theme configuration

export interface PayrollColors {
  // Primary colors - Zcash Orange/Yellow
  primary: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string; // Main primary color
    600: string;
    700: string;
    800: string;
    900: string;
    950: string;
  };

  // Secondary colors - NEAR Grays
  secondary: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string; // Main secondary color
    600: string;
    700: string;
    800: string;
    900: string;
    950: string;
  };

  // Semantic colors
  success: {
    50: string;
    500: string;
    700: string;
  };

  warning: {
    50: string;
    500: string;
    700: string;
  };

  error: {
    50: string;
    500: string;
    700: string;
  };

  info: {
    50: string;
    500: string;
    700: string;
  };

  // Background colors
  background: {
    default: string;
    paper: string;
    surface: string;
    elevated: string;
  };

  // Text colors
  text: {
    primary: string;
    secondary: string;
    disabled: string;
    inverse: string;
  };

  // Border and divider colors
  border: {
    default: string;
    light: string;
    strong: string;
  };

  // Action colors (hover, focus, etc.)
  action: {
    hover: string;
    selected: string;
    disabled: string;
    disabledBackground: string;
    focus: string;
  };
}

export interface PayrollTypography {
  fontFamily: {
    primary: string;
    mono: string;
  };

  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
    '5xl': string;
    '6xl': string;
    '7xl': string;
  };

  fontWeight: {
    light: number;
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
    extrabold: number;
  };

  lineHeight: {
    none: number;
    tight: number;
    snug: number;
    normal: number;
    relaxed: number;
    loose: number;
  };
}

export interface PayrollSpacing {
  px: string;
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  8: string;
  10: string;
  12: string;
  16: string;
  20: string;
  24: string;
  32: string;
  40: string;
  48: string;
  56: string;
  64: string;
}

export interface PayrollBorderRadius {
  none: string;
  sm: string;
  default: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  full: string;
}

export interface PayrollShadows {
  none: string;
  sm: string;
  default: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  inner: string;
}

export interface PayrollBreakpoints {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
}

export interface PayrollTheme {
  name: string;
  colors: PayrollColors;
  typography: PayrollTypography;
  spacing: PayrollSpacing;
  borderRadius: PayrollBorderRadius;
  shadows: PayrollShadows;
  breakpoints: PayrollBreakpoints;
}

// Component-specific theme overrides
export interface PayrollComponentTheme {
  button: {
    primary: {
      background: string;
      backgroundHover: string;
      backgroundActive: string;
      text: string;
      border: string;
    };
    secondary: {
      background: string;
      backgroundHover: string;
      backgroundActive: string;
      text: string;
      border: string;
    };
    outlined: {
      background: string;
      backgroundHover: string;
      backgroundActive: string;
      text: string;
      border: string;
    };
  };

  card: {
    background: string;
    border: string;
    shadow: string;
  };

  input: {
    background: string;
    border: string;
    borderFocus: string;
    text: string;
    placeholder: string;
  };
}

// Complete theme interface
export interface PayrollCompleteTheme extends PayrollTheme {
  components: PayrollComponentTheme;
}
