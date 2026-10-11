import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addShoppingItem, saveMeal } from '../lib/cloud';
import { HEALTHY_NUTRITION_NOTE, HEALTHY_RECIPES, searchHealthyRecipes, type HealthyRecipe } from '../lib/healthyRecipes';
import { colors, radius, spacing, typography } from '../ui/theme';

type Filter = 'Alle' | 'High Protein' | 'Vegetarisch' | 'Schnell';
const FILTERS: Filter[] = ['Alle', 'High Protein', 'Vegetarisch', 'Schnell'];

function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function ingredientToShoppingItem(raw: string) {
  const cleaned = raw.trim();
  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(kg|ml|g|l|EL|TL)?\s+(.+)$/i);
  if (!match) return { name: cleaned, amount: 1, unit: 'Stk.' };
  const amount = Number((match[1] || '1').replace(',', '.'));
  const unit = match[2] || 'Stk.';
  const name = match[3] || cleaned;
  return { name: name.slice(0, 120), amount: Number.isFinite(amount) ? amount : 1, unit };
}

function MiniButton({ label, icon, onPress, secondary = false, disabled = false }: {
  label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [
    styles.button, secondary && styles.buttonSecondary, (pressed || disabled) && styles.pressed,
  ]}>
    <MaterialCommunityIcons name={icon} size={18} color={secondary ? colors.accent : colors.onAccent} />
    <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
  </Pressable>;
}

export function ProteinRecipesScreen({ onSettings, onPlanChanged, onGoShopping }: {
  onSettings: () => void;
  onPlanChanged?: (date: string, title: string) => void;
  onGoShopping?: () => void;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('Alle');
  const [selected, setSelected] = useState<HealthyRecipe | null>(null);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const visibleRecipes = useMemo(() => searchHealthyRecipes(query).filter((recipe) => {
    if (filter === 'High Protein') return recipe.proteinGrams >= 35;
    if (filter === 'Vegetarisch') return Boolean(recipe.vegetarian);
    if (filter === 'Schnell') return (recipe.minutes || 99) <= 20;
    return true;
  }), [filter, query]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return { iso: isoDate(date), label: date.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' }) };
  }), [planning]);

  const addIngredients = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setMessage('');
    const results = await Promise.allSettled(selected.ingredients.map((part) => addShoppingItem(ingredientToShoppingItem(part.name))));
    const failed = results.filter((result) => result.status === 'rejected').length;
    setBusy(false);
    if (failed) { setMessage(`${failed} Zutaten konnten nicht hinzugefügt werden. Bitte erneut versuchen.`); return; }
    setMessage('Zutaten sind in deiner Einkaufsliste.');
    setSelected(null);
    onGoShopping?.();
  };

  const planRecipe = async (date: string) => {
    if (!selected || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await saveMeal(date, selected.title);
      onPlanChanged?.(date, selected.title);
      setPlanning(false);
      setSelected(null);
      setMessage('Rezept im Wochenplan gespeichert.');
    } catch {
      setMessage('Wochenplan konnte nicht aktualisiert werden. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  const active = selected;
  return <View style={styles.root}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, desktop && styles.pageWide]}>
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text style={styles.eyebrow}>MEALFLOW · FIT & BALANCIERT</Text>
          <Text style={styles.title}>Gesund genießen</Text>
          <Text style={styles.subtitle}>Proteinreiche Gerichte, unkompliziert gekocht. Zutaten direkt einkaufen oder für einen Abend einplanen.</Text>
        </View>
        <Pressable onPress={onSettings} accessibilityLabel="Einstellungen" style={styles.settingsButton}>
          <MaterialCommunityIcons name="cog-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}><MaterialCommunityIcons name="food-apple-outline" size={29} color={colors.onAccent} /></View>
          <View style={styles.flex1}><Text style={styles.heroEyebrow}>DEINE GERICHTE</Text><Text style={styles.heroTitle}>Gut essen. Einfach planen.</Text></View>
        </View>
        <Text style={styles.heroCopy}>Entdecke ${HEALTHY_RECIPES.length} vollständige Rezepte mit Zutaten, Zubereitung und ungefähren Eiweißwerten – ohne Warten auf eine Rezept-API.</Text>
        <View style={styles.heroMeta}>
          <Text style={styles.heroTag}>Protein</Text><Text style={styles.heroTag}>Alltagstauglich</Text><Text style={styles.heroTag}>Ausgewogen</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
        <TextInput
          value={query} onChangeText={setQuery} placeholder="Gericht oder Zutat suchen"
          placeholderTextColor={colors.textTertiary} style={styles.searchInput}
          accessibilityLabel="Gesunde Rezepte durchsuchen"
        />
        {query ? <Pressable onPress={() => setQuery('')}><MaterialCommunityIcons name="close-circle" size={20} color={colors.textTertiary} /></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((choice) => <Pressable key={choice} onPress={() => setFilter(choice)} style={[styles.filter, filter === choice && styles.filterActive]}>
          <Text style={[styles.filterText, filter === choice && styles.filterTextActive]}>{choice}</Text>
        </Pressable>)}
      </ScrollView>

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Rezepte entdecken</Text><Text style={styles.sectionCount}>{visibleRecipes.length} Gerichte</Text></View>
      <View style={styles.grid}>
        {visibleRecipes.map((recipe) => <Pressable key={recipe.id} onPress={() => { setSelected(recipe); setMessage(''); }} style={({ pressed }) => [styles.card, desktop && styles.cardDesktop, pressed && styles.pressed]}>
          <View style={styles.cardTop}>
            <View style={styles.cardIcon}><MaterialCommunityIcons name={recipe.vegetarian ? 'leaf' : 'silverware-fork-knife'} size={28} color={colors.accent} /></View>
            <View style={styles.cardProtein}><Text style={styles.proteinLabel}>{recipe.proteinGrams} g Protein</Text></View>
          </View>
          <Text style={styles.cardCategory}>{recipe.healthyCategory.toUpperCase()}</Text>
          <Text style={styles.cardTitle}>{recipe.title}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>{recipe.description}</Text>
          <View style={styles.cardFooter}>
            <MaterialCommunityIcons name="clock-outline" size={16} color={colors.textSecondary} /><Text style={styles.cardMeta}>{recipe.minutes} Min</Text>
            <MaterialCommunityIcons name="fire" size={16} color={colors.textSecondary} /><Text style={styles.cardMeta}>ca. {recipe.calories} kcal</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} />
          </View>
        </Pressable>)}
      </View>
      {visibleRecipes.length === 0 ? <View style={styles.empty}><Text style={styles.subtitle}>Keine Treffer. Versuche einen anderen Suchbegriff.</Text></View> : null}
      {message ? <Text style={styles.feedback}>{message}</Text> : null}
      <Text style={styles.disclaimer}>{HEALTHY_NUTRITION_NOTE}</Text>
    </ScrollView>

    <Modal visible={Boolean(active)} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} onRequestClose={() => { setSelected(null); setPlanning(false); }}>
      <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
          <View style={styles.modalTop}>
            <Pressable accessibilityLabel="Rezept schließen" onPress={() => { setSelected(null); setPlanning(false); }} style={styles.closeButton}>
              <MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} />
            </Pressable>
            <Text style={styles.eyebrow}>GESUNDES REZEPT</Text>
          </View>
          {active ? <>
            <View style={styles.detailArtwork}><MaterialCommunityIcons name={active.vegetarian ? 'leaf' : 'food-variant'} size={62} color={colors.accent} /></View>
            <Text style={styles.title}>{active.title}</Text>
            <Text style={styles.subtitle}>{active.description}</Text>
            <View style={styles.detailNutrition}>
              <View style={styles.metric}><Text style={styles.metricValue}>{active.proteinGrams} g</Text><Text style={styles.metricLabel}>Protein</Text></View>
              <View style={styles.metric}><Text style={styles.metricValue}>ca. {active.calories}</Text><Text style={styles.metricLabel}>kcal</Text></View>
              <View style={styles.metric}><Text style={styles.metricValue}>{active.minutes} Min</Text><Text style={styles.metricLabel}>Zubereitung</Text></View>
            </View>
            <Text style={styles.sectionTitle}>Zutaten · 1 Portion</Text>
            <View style={styles.ingredients}>{active.ingredients.map((part, i) => <View key={i} style={styles.ingredientRow}><MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.accent} /><Text style={styles.ingredientText}>{part.name}</Text></View>)}</View>
            <Text style={styles.sectionTitle}>Zubereitung</Text>
            <Text style={styles.instructions}>{active.instructions}</Text>
            <Text style={styles.disclaimer}>{HEALTHY_NUTRITION_NOTE}</Text>
            {message ? <Text style={styles.feedback}>{message}</Text> : null}
            {!planning ? <View style={styles.actions}>
              <MiniButton label="Für einen Abend einplanen" icon="calendar-plus" disabled={busy} onPress={() => setPlanning(true)} />
              <MiniButton label={busy ? 'Wird hinzugefügt …' : 'Zutaten zur Einkaufsliste'} icon="cart-plus" secondary disabled={busy} onPress={() => void addIngredients()} />
            </View> : <>
              <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Tag auswählen</Text><Pressable onPress={() => setPlanning(false)}><Text style={styles.feedback}>Zurück</Text></Pressable></View>
              <View style={styles.dayGrid}>{days.map((day) => <Pressable disabled={busy} onPress={() => void planRecipe(day.iso)} key={day.iso} style={styles.dayChoice}>
                <Text style={styles.dayText}>{day.label}</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.accent} />
              </Pressable>)}</View>
            </>}
            {busy ? <ActivityIndicator color={colors.accent} /> : null}
          </> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}

function createStyles() {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    page: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 40, gap: 17 },
    pageWide: { paddingHorizontal: 34, paddingTop: 32, maxWidth: 1300, width: '100%', alignSelf: 'center' },
    flex1: { flex: 1 },
    header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    eyebrow: { ...typography.label, color: colors.accent, marginBottom: 4 },
    title: { ...typography.h1, color: colors.text },
    subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 6 },
    settingsButton: { width: 46, height: 46, backgroundColor: colors.surface, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    hero: { padding: 23, borderRadius: radius.xl, backgroundColor: colors.accent, gap: 12 },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    heroEyebrow: { ...typography.label, color: colors.onAccent, opacity: 0.78 },
    heroTitle: { ...typography.h2, color: colors.onAccent, marginTop: 3 },
    heroCopy: { ...typography.body, color: colors.onAccent, opacity: 0.93 },
    heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    heroTag: { ...typography.caption, color: colors.onAccent, backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, overflow: 'hidden' },
    searchRow: { minHeight: 53, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 14 },
    searchInput: { ...typography.body, color: colors.text, flex: 1, paddingVertical: 10 },
    filters: { gap: 8 },
    filter: { borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 15, paddingVertical: 10 },
    filterActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    filterText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
    filterTextActive: { color: colors.accent },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    sectionTitle: { ...typography.title, color: colors.text },
    sectionCount: { ...typography.caption, color: colors.textSecondary },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    card: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 17, gap: 8 },
    cardDesktop: { width: '48.8%' },
    pressed: { opacity: 0.72 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    cardProtein: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
    proteinLabel: { ...typography.caption, fontWeight: '800', color: colors.accent },
    cardCategory: { ...typography.label, color: colors.accent },
    cardTitle: { ...typography.h2, color: colors.text },
    cardDesc: { ...typography.body, color: colors.textSecondary },
    cardFooter: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 8 },
    cardMeta: { ...typography.caption, color: colors.textSecondary, marginRight: 6 },
    empty: { backgroundColor: colors.surface, padding: 30, borderRadius: radius.lg },
    feedback: { ...typography.caption, color: colors.accent, fontWeight: '700' },
    disclaimer: { ...typography.caption, color: colors.textTertiary, marginTop: 3 },
    modalRoot: { flex: 1, backgroundColor: colors.background },
    modalContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 45, gap: 18, maxWidth: 800, width: '100%', alignSelf: 'center' },
    modalTop: { flexDirection: 'row', alignItems: 'center', gap: 18 },
    closeButton: { width: 42, height: 42, backgroundColor: colors.surface, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    detailArtwork: { height: 148, borderRadius: radius.xl, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    detailNutrition: { flexDirection: 'row', gap: 8 },
    metric: { flex: 1, padding: 12, backgroundColor: colors.surface, borderRadius: radius.md, alignItems: 'center', gap: 4 },
    metricValue: { ...typography.bodyStrong, color: colors.text },
    metricLabel: { ...typography.caption, color: colors.textTertiary },
    ingredients: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 14 },
    ingredientRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    ingredientText: { ...typography.body, color: colors.text, flex: 1 },
    instructions: { ...typography.body, color: colors.textSecondary, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, lineHeight: 26, overflow: 'hidden' },
    actions: { gap: 10 },
    button: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.accent, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
    buttonSecondary: { backgroundColor: colors.accentSoft },
    buttonText: { ...typography.bodyStrong, color: colors.onAccent },
    buttonTextSecondary: { color: colors.accent },
    dayGrid: { gap: 8 },
    dayChoice: { minHeight: 50, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dayText: { ...typography.body, color: colors.text },
  });
}

let styles = createStyles();
export function refreshProteinRecipeStyles() { styles = createStyles(); }
