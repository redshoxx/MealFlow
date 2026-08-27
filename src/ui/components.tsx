import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, getShadow, radius, spacing, typography } from './theme';

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.heading}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'neutral',
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'neutral' | 'accent' | 'danger';
}) {
  const background = tone === 'accent' ? colors.accentSoft : tone === 'danger' ? colors.dangerSoft : colors.surfaceMuted;
  const color = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: background, opacity: pressed ? 0.68 : 1 }]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={color} />
    </Pressable>
  );
}

export function ActionButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const background = variant === 'primary'
    ? colors.accent
    : variant === 'danger'
      ? colors.dangerSoft
      : variant === 'secondary'
        ? colors.surfaceMuted
        : 'transparent';
  const foreground = variant === 'primary'
    ? '#FFFFFF'
    : variant === 'danger'
      ? colors.danger
      : variant === 'ghost'
        ? colors.accent
        : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.74 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={19} color={foreground} /> : null}
          <Text style={[styles.actionButtonText, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SurfaceCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon} size={25} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {actionLabel && onAction ? <ActionButton label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    headerText: {
      flex: 1,
      gap: 4,
    },
    eyebrow: {
      ...typography.label,
      color: colors.accent,
      textTransform: 'uppercase',
    },
    heading: {
      ...typography.h1,
      color: colors.text,
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      maxWidth: 360,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButton: {
      minHeight: 50,
      paddingHorizontal: 18,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    actionButtonText: {
      ...typography.bodyStrong,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...getShadow(),
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      ...typography.title,
      color: colors.text,
    },
    sectionAction: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 30,
      paddingHorizontal: 22,
      gap: 8,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    emptyTitle: {
      ...typography.title,
      color: colors.text,
      textAlign: 'center',
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 310,
    },
  });
}

let styles = createStyles();

export function refreshUiComponentStyles() {
  styles = createStyles();
}
