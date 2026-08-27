import { Platform } from 'react-native';

export const colors = {
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
  overlay: 'rgba(15, 20, 16, 0.42)',
};

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

export const shadow = Platform.select({
  ios: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  android: {
    elevation: 2,
  },
  default: {},
});
