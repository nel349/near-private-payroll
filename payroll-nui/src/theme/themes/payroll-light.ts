// NEAR Private Payroll Light Theme
// Zcash Orange/Yellow accents + NEAR black/white/grey scheme

import type { PayrollCompleteTheme } from '../types';

export const payrollLightTheme: PayrollCompleteTheme = {
  name: 'NEAR Payroll Light',

  colors: {
    // Primary colors - Zcash Orange/Yellow (slightly darker for light mode contrast)
    primary: {
      50: '#fff5e6',   // Very light orange
      100: '#ffe6b3',  // Light orange tint
      200: '#ffcc80',  // Lighter orange
      300: '#ffb84d',  // Light orange
      400: '#ffa31a',  // Medium light orange
      500: '#ff8a00',  // Main Zcash orange
      600: '#e67e00',  // Darker orange (main for light mode)
      700: '#cc6600',  // Deep orange
      800: '#b35900',  // Very dark orange
      900: '#994d00',  // Darkest orange
      950: '#663300',  // Almost black orange
    },

    // Secondary colors - NEAR Grays
    secondary: {
      50: '#f9fafb',   // Very light gray
      100: '#f3f4f6',  // Light gray
      200: '#e5e7eb',  // Lighter gray
      300: '#d1d5db',  // Light gray
      400: '#9ca3af',  // Medium gray
      500: '#6b7280',  // Gray
      600: '#4b5563',  // Dark gray
      700: '#374151',  // Darker gray
      800: '#1f2937',  // Dark slate
      900: '#1a1d29',  // Dark navy (NEAR)
      950: '#111111',  // Darkest (almost black)
    },

    // Semantic colors - Light theme variants
    success: {
      50: '#ecfdf5',   // Light green background
      500: '#10b981',  // Success green
      700: '#047857',  // Dark success green
    },

    warning: {
      50: '#fffbeb',   // Light yellow background
      500: '#f59e0b',  // Warning amber
      700: '#b45309',  // Dark warning amber
    },

    error: {
      50: '#fef2f2',   // Light red background
      500: '#ef4444',  // Error red
      700: '#b91c1c',  // Dark error red
    },

    info: {
      50: '#eff6ff',   // Light blue background
      500: '#3b82f6',  // Info blue
      700: '#1d4ed8',  // Dark info blue
    },

    // Background colors - Light whites/grays
    background: {
      default: '#ffffff',    // Pure white background
      paper: '#ffffff',      // White card/paper background
      surface: '#f9fafb',    // Very light gray for surfaces
      elevated: '#ffffff',   // White elevated components
    },

    // Text colors - Dark text on light backgrounds
    text: {
      primary: '#1a1d29',     // Dark navy for primary text
      secondary: '#6b7280',   // Medium gray for secondary text
      disabled: '#9ca3af',    // Light gray for disabled text
      inverse: '#ffffff',     // White (for use on dark backgrounds)
    },

    // Border and divider colors - Subtle on light backgrounds
    border: {
      default: '#e5e7eb',     // Light gray border
      light: '#f3f4f6',       // Very subtle border
      strong: '#d1d5db',      // Stronger gray border
    },

    // Action colors (hover, focus, etc.)
    action: {
      hover: 'rgba(0, 0, 0, 0.04)',             // Subtle dark hover
      selected: 'rgba(255, 138, 0, 0.1)',       // Orange selected state
      disabled: 'rgba(0, 0, 0, 0.38)',          // Disabled state
      disabledBackground: 'rgba(0, 0, 0, 0.12)', // Disabled background
      focus: 'rgba(255, 138, 0, 0.3)',          // Orange focus ring
    },
  },

  typography: {
    fontFamily: {
      primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
    },

    fontSize: {
      xs: '0.75rem',     // 12px
      sm: '0.875rem',    // 14px
      base: '1rem',      // 16px
      lg: '1.125rem',    // 18px
      xl: '1.25rem',     // 20px
      '2xl': '1.5rem',   // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem',  // 36px
      '5xl': '3rem',     // 48px
      '6xl': '3.75rem',  // 60px
      '7xl': '4.5rem',   // 72px
    },

    fontWeight: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },

    lineHeight: {
      none: 1,
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
    },
  },

  spacing: {
    px: '1px',
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
    24: '6rem',     // 96px
    32: '8rem',     // 128px
    40: '10rem',    // 160px
    48: '12rem',    // 192px
    56: '14rem',    // 224px
    64: '16rem',    // 256px
  },

  borderRadius: {
    none: '0',
    sm: '0.125rem',     // 2px
    default: '0.25rem', // 4px
    md: '0.375rem',     // 6px
    lg: '0.5rem',       // 8px
    xl: '0.75rem',      // 12px
    '2xl': '1rem',      // 16px
    full: '9999px',     // Fully rounded
  },

  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    default: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  },

  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // Component-specific theme overrides
  components: {
    button: {
      primary: {
        background: 'linear-gradient(135deg, #ffa31a 0%, #e67e00 100%)', // Orange gradient
        backgroundHover: 'linear-gradient(135deg, #ffb84d 0%, #ff8a00 100%)', // Lighter orange on hover
        backgroundActive: 'linear-gradient(135deg, #e67e00 0%, #cc6600 100%)', // Darker orange on active
        text: '#ffffff',              // White text
        border: '#e67e00',            // Darker orange border
      },
      secondary: {
        background: '#f9fafb',        // Light gray surface
        backgroundHover: '#f3f4f6',   // Slightly darker on hover
        backgroundActive: '#e5e7eb',  // Even darker on active
        text: '#1a1d29',              // Dark navy text
        border: '#e5e7eb',            // Light border
      },
      outlined: {
        background: 'transparent',    // Transparent background
        backgroundHover: 'rgba(255, 138, 0, 0.04)', // Orange hover tint
        backgroundActive: 'rgba(255, 138, 0, 0.1)', // Orange active tint
        text: '#e67e00',              // Darker orange text for contrast
        border: '#e67e00',            // Darker orange border
      },
    },

    card: {
      background: '#ffffff',          // White card background
      border: '#e5e7eb',              // Light border
      shadow: '0 8px 32px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(255, 138, 0, 0.05)', // Multi-layer shadow with orange accent
    },

    input: {
      background: '#ffffff',          // White for inputs
      border: '#e5e7eb',              // Light border
      borderFocus: '#e67e00',         // Orange focus border
      text: '#1a1d29',                // Dark navy text
      placeholder: '#9ca3af',         // Gray placeholder
    },
  },
};
