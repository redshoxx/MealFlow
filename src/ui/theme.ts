import { Platform } from 'react-native';

export type ThemePaletteName = 'light' | 'dark';

export const lightColors = {
  background: '#F6F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EFF1EC',
  text: '#171A16',
  textSecondary: '#667065',
  textTertiary: '#8E978D',
  border: '#E1E5DE',
  accent: '#2F6B45',
  accentSoft: '#E6F1E9',
  accentStrong: '#214F33',
  danger: '#B34A4A',
  dangerSoft: '#F8EAEA',
  warning: '#9B6B20',
  shadow: '#111111',
  overlay: 'rgba(15, 20, 16, 0.28)',
};

export const darkColors = {
  background: '#0F1210',
  surface: '#171B18',
  surfaceMuted: '#202621',
  text: '#F3F6F2',
  textSecondary: '#B5BDB4',
  textTertiary: '#858F86',
  border: '#2B332C',
  accent: '#79C891',
  accentSoft: '#1D3324',
  accentStrong: '#9AD8AB',
  danger: '#F18484',
  dangerSoft: '#3A2020',
  warning: '#E1B86E',
  shadow: '#000000',
  overlay: 'rgba(0, 0, 0, 0.46)',
};

export const colors = { ...lightColors };

export function setThemePalette(palette: ThemePaletteName) {
  Object.assign(colors, palette === 'dark' ? darkColors : lightColors);
}

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 36,
};

export const typography = {
  hero: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  h1: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.25,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700' as const,
    letterSpacing: 0.45,
  },
};

export function getShadow() {
  return Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: {
      elevation: 1,
    },
    default: {},
  }) ?? {};
}

export const shadow = getShadow();
