import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveMeal } from '../lib/cloud';
import { searchRecipePage, type Recipe } from '../lib/recipes';
import { colors, typography } from '../ui/theme';

const SUGGESTIONS = ['Pasta', 'Hähnchen', 'Vegetarisch', 'Kartoffeln', 'Suppe'];
const DISPLAY_LIMIT = 100;

function localIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function validImage(value?: string) {
  return value && /^https:\/\//i.test(value) ? value : undefined;
}
function validWebsite(value?: string) {
  return Boolean(value && /^https:\/\//i.test(value));
}
function Picture({ recipe, large = false }: { recipe: Recipe; large?: boolean }) {
  const original = validImage(recipe.image);
  const fallback = validImage(recipe.imageFallback);
  const [url, setUrl] = useState(original || fallback);
  const [triedFallback, setTriedFallback] = useState(false);
  useEffect(() => { setUrl(original || fallback); setTriedFallback(false); }, [original, fallback]);
  return <View style={[styles.photo, large && styles.photoLarge]}>
    {url ? <Image
      source={{ uri: url }}
      style={styles.photoFill}
      resizeMode="cover"
      accessibilityLabel={`Rezeptbild laut Quelle: ${recipe.title}`}
      onError={() => {
        if (!triedFallback && fallback && fallback !== url) { setTriedFallback(true); setUrl(fallback); }
        else setUrl(undefined);
      }}
    /> : <View style={styles.noPhoto}>
      <MaterialCommunityIcons name="image-off-outline" size={large ? 35 : 27} color={colors.textTertiary} />
      <Text style={styles.noPhotoText}>Kein Quellenbild</Text>
    </View>}
  </View>;
}

function RecipeCard({ recipe, desktop, onPress }: { recipe: Recipe; desktop: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, desktop && styles.cardDesktop, pressed && styles.pressed]}>
    <Picture recipe={recipe} />
    <View style={styles.cardBody}>
      <View style={styles.sourceRow}>
        <MaterialCommunityIcons name="web" size={13} color={colors.accent} />
        <Text style={styles.sourceLabel} numberOfLines={1}>{recipe.source || 'Originalquelle'}</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>
      {recipe.description ? <Text style={styles.cardDescription} numberOfLines={2}>{recipe.description}</Text> : null}
      <View style={styles.cardBottom}>
        <Text style={styles.cardHint}>{recipe.ingredients.length ? 'Zutaten vorhanden' : 'Rezept auf Quellseite'}</Text>
        <MaterialCommunityIcons name="arrow-top-right" size={18} color={colors.accent} />
      </View>
    </View>
  </Pressable>;
}

export function ProteinRecipesScreen({ onSettings, onPlanChanged }: {
  onSettings: () => void;
  onPlanChanged?: (date: string, title: string) => void;
  onGoShopping?: () => void;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 740;
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [webConfigured, setWebConfigured] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const latest = useRef(0);
  const pageRef = useRef(0);
  const loadMoreLock = useRef(false);
  const days = useMemo(() => Array.from({ length: 28 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return { iso: localIso(date), label: date.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: 'short' }) };
  }), []);

  const runSearch = useCallback(async (term: string) => {
    const generation = ++latest.current;
    pageRef.current = 0;
    loadMoreLock.current = false;
    setRecipes([]);
    setError('');
    setLoading(true);
    setHasMore(false);
    try {
      const found = await searchRecipePage(term.trim(), {}, 0);
      if (generation !== latest.current) return;
      setRecipes(found.recipes.slice(0, DISPLAY_LIMIT));
      setHasMore(found.hasMore && found.recipes.length < DISPLAY_LIMIT);
      setWebConfigured(found.webConfigured);
    } catch {
      if (generation === latest.current) setError('Rezepte konnten nicht geladen werden. Bitte versuche es erneut.');
    } finally {
      if (generation === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => { setSubmitted(query.trim()); void runSearch(query); }, query.trim() ? 420 : 80);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  const loadMore = async () => {
    if (loading || loadingMore || loadMoreLock.current || !hasMore || recipes.length >= DISPLAY_LIMIT) return;
    loadMoreLock.current = true;
    setLoadingMore(true);
    const generation = latest.current;
    const nextPage = pageRef.current + 1;
    try {
      const found = await searchRecipePage(submitted, {}, nextPage);
      if (generation !== latest.current) return;
      pageRef.current = nextPage;
      setRecipes((current) => {
        const known = new Set(current.map((item) => item.url || item.id));
        const more = found.recipes.filter((item) => !known.has(item.url || item.id));
        return [...current, ...more].slice(0, DISPLAY_LIMIT);
      });
      setHasMore(found.hasMore && found.recipes.length > 0 && recipes.length + found.recipes.length < DISPLAY_LIMIT);
    } catch {
      if (generation === latest.current) setError('Weitere Treffer konnten nicht geladen werden.');
    } finally {
      loadMoreLock.current = false;
      if (generation === latest.current) setLoadingMore(false);
    }
  };

  const closeDetail = () => { setSelected(null); setPlanning(false); setFeedback(''); };
  const saveToPlan = async (date: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await saveMeal(date, selected.title);
      onPlanChanged?.(date, selected.title);
      closeDetail();
    } catch {
      setFeedback('Das Gericht konnte nicht eingeplant werden. Bitte erneut versuchen.');
    } finally { setBusy(false); }
  };

  return <View style={styles.root}>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.page, desktop && styles.pageWide]}
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        if (contentSize.height - (layoutMeasurement.height + contentOffset.y) < 300) void loadMore();
      }}
      scrollEventThrottle={300}
    >
      <View style={styles.heading}>
        <View style={styles.flex1}>
          <Text style={styles.eyebrow}>REZEPTE · ONLINE ENTDECKEN</Text>
          <Text style={styles.title}>Rezepte entdecken</Text>
          <Text style={styles.subtitle}>Echte Rezeptquellen und deren Bilder – keine erfundenen Zutaten oder Nährwerte.</Text>
        </View>
        <Pressable onPress={onSettings} accessibilityLabel="Einstellungen" style={styles.settings}>
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rezept oder Zutat suchen"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          style={styles.searchText}
          accessibilityLabel="Rezepte im Internet suchen"
        />
        {query ? <Pressable accessibilityLabel="Suche leeren" onPress={() => setQuery('')}><MaterialCommunityIcons name="close-circle-outline" size={21} color={colors.textTertiary} /></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queries}>
        {SUGGESTIONS.map((tag) => <Pressable key={tag} onPress={() => setQuery(tag)} style={[styles.queryChip, query === tag && styles.queryChipActive]}>
          <Text style={[styles.queryText, query === tag && styles.queryTextActive]}>{tag}</Text>
        </Pressable>)}
      </ScrollView>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{query ? 'Suchergebnisse' : 'Aus dem Internet'}</Text>
        <Text style={styles.sectionMeta}>{loading ? 'Suche läuft' : `${recipes.length} Treffer geladen`}</Text>
      </View>
      {!webConfigured ? <View style={styles.notice}><MaterialCommunityIcons name="information-outline" size={20} color={colors.textSecondary} /><Text style={styles.noticeText}>Die Web-Rezeptsuche ist derzeit nicht verfügbar. Es werden nur Ergebnisse verbundener Rezeptanbieter angezeigt.</Text></View> : null}
      {error ? <View style={styles.notice}><Text style={styles.noticeText}>{error}</Text><Pressable onPress={() => void runSearch(submitted)}><Text style={styles.retry}>Erneut versuchen</Text></Pressable></View> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.noticeText}>Echte Rezeptdaten werden geladen …</Text></View> : null}
      <View style={styles.grid}>
        {recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} desktop={desktop} onPress={() => { setSelected(recipe); setFeedback(''); }} />)}
      </View>
      {!loading && recipes.length === 0 && !error ? <View style={styles.empty}>
        <MaterialCommunityIcons name="magnify-close" size={30} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>Keine Rezepttreffer gefunden</Text>
        <Text style={styles.noticeText}>Suche nach einem Gericht oder versuche einen anderen Begriff. Es werden keine Beispielrezepte eingeblendet.</Text>
      </View> : null}
      {hasMore && !loading ? <Pressable disabled={loadingMore} onPress={() => void loadMore()} style={styles.moreButton}>
        {loadingMore ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.moreText}>Weitere echte Rezepte laden</Text>}
      </Pressable> : null}
    </ScrollView>

    <Modal visible={Boolean(selected)} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} onRequestClose={closeDetail}>
      <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.detail, desktop && styles.detailWide]}>
          <View style={styles.detailTop}>
            <Pressable onPress={closeDetail} accessibilityLabel="Rezept schließen" style={styles.back}><MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} /></Pressable>
            <Text style={styles.eyebrow}>QUELLE: {selected?.source || 'Online'}</Text>
          </View>
          {selected ? <>
            <Picture recipe={selected} large />
            <Text style={styles.detailTitle}>{selected.title}</Text>
            {selected.description ? <Text style={styles.detailDescription}>{selected.description}</Text> : null}
            {selected.ingredients.length > 0 ? <>
              <Text style={styles.sectionTitle}>Zutaten laut Quelle</Text>
              <View style={styles.detailList}>{selected.ingredients.map((item, index) => <View key={index} style={styles.ingredient}>
                <MaterialCommunityIcons name="circle-small" size={23} color={colors.accent} />
                <Text style={styles.ingredientText}>{item.unit ? `${item.unit} ` : ''}{item.amount ? `${item.amount} ` : ''}{item.name}</Text>
              </View>)}</View>
            </> : null}
            {selected.instructions ? <>
              <Text style={styles.sectionTitle}>Zubereitung laut Quelle</Text>
              <Text style={styles.instructions}>{selected.instructions}</Text>
            </> : <Text style={styles.noticeText}>Zutaten und Anleitung findest du direkt auf der Original-Rezeptseite.</Text>}
            {validWebsite(selected.url) ? <Pressable onPress={() => void Linking.openURL(selected.url!)} style={styles.primaryAction}>
              <MaterialCommunityIcons name="open-in-new" size={20} color={colors.onAccent} />
              <Text style={styles.primaryActionText}>Originalrezept öffnen</Text>
            </Pressable> : <Text style={styles.noticeText}>Für dieses Rezept hat der Anbieter keinen externen Original-Link übermittelt.</Text>}
            {!planning ? <Pressable onPress={() => setPlanning(true)} style={styles.secondaryAction}>
              <MaterialCommunityIcons name="calendar-plus" size={20} color={colors.accent} />
              <Text style={styles.secondaryActionText}>Im Wochenplan eintragen</Text>
            </Pressable> : <>
              <Text style={styles.sectionTitle}>Datum auswählen</Text>
              <View style={styles.dayList}>{days.map((day) => <Pressable disabled={busy} key={day.iso} onPress={() => void saveToPlan(day.iso)} style={styles.dayRow}>
                <Text style={styles.dayText}>{day.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} />
              </Pressable>)}</View>
            </>}
            {busy ? <ActivityIndicator color={colors.accent} /> : null}
            {feedback ? <Text style={styles.errorText}>{feedback}</Text> : null}
          </> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}

function createStyles() {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 92, gap: 15 },
    pageWide: { maxWidth: 1100, width: '100%', alignSelf: 'center', paddingHorizontal: 24 },
    flex1: { flex: 1, minWidth: 0 },
    heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    eyebrow: { ...typography.label, color: colors.accent, marginBottom: 5 },
    title: { fontSize: 27, lineHeight: 34, fontWeight: '800', color: colors.text },
    subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 5, lineHeight: 21 },
    settings: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    search: { minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 10 },
    searchText: { flex: 1, minWidth: 0, fontSize: 16, color: colors.text, paddingVertical: 11 },
    queries: { gap: 8, paddingRight: 5 },
    queryChip: { paddingHorizontal: 14, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    queryChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    queryText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
    queryTextActive: { color: colors.accent },
    section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.text },
    sectionMeta: { ...typography.caption, color: colors.textTertiary },
    notice: { padding: 13, backgroundColor: colors.surfaceMuted, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
    noticeText: { ...typography.body, color: colors.textSecondary, flexShrink: 1 },
    retry: { ...typography.bodyStrong, color: colors.accent },
    loading: { minHeight: 130, justifyContent: 'center', alignItems: 'center', gap: 9 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    card: { width: '100%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
    cardDesktop: { width: '48.7%' },
    pressed: { opacity: 0.75 },
    photo: { height: 182, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
    photoLarge: { height: 240, borderRadius: 10 },
    photoFill: { width: '100%', height: '100%' },
    noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    noPhotoText: { ...typography.caption, color: colors.textTertiary },
    cardBody: { padding: 14, gap: 7 },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sourceLabel: { ...typography.caption, color: colors.accent, flexShrink: 1 },
    cardTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.text },
    cardDescription: { ...typography.body, color: colors.textSecondary },
    cardBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginTop: 5, paddingTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardHint: { ...typography.caption, color: colors.textTertiary },
    moreButton: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.accent, padding: 9 },
    moreText: { ...typography.bodyStrong, color: colors.accent },
    empty: { padding: 28, borderRadius: 10, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', gap: 10 },
    emptyTitle: { ...typography.bodyStrong, color: colors.text },
    modal: { flex: 1, backgroundColor: colors.background },
    detail: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 70, gap: 15 },
    detailWide: { maxWidth: 820, width: '100%', alignSelf: 'center' },
    detailTop: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
    back: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    detailTitle: { fontSize: 25, lineHeight: 31, fontWeight: '800', color: colors.text },
    detailDescription: { ...typography.body, color: colors.textSecondary },
    detailList: { gap: 9, padding: 14, backgroundColor: colors.surface, borderRadius: 10 },
    ingredient: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    ingredientText: { ...typography.body, color: colors.text, flex: 1 },
    instructions: { ...typography.body, color: colors.textSecondary, lineHeight: 25, padding: 14, borderRadius: 10, backgroundColor: colors.surface },
    primaryAction: { minHeight: 50, backgroundColor: colors.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    primaryActionText: { ...typography.bodyStrong, color: colors.onAccent },
    secondaryAction: { minHeight: 50, backgroundColor: colors.accentSoft, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    secondaryActionText: { ...typography.bodyStrong, color: colors.accent },
    dayList: { gap: 6 },
    dayRow: { minHeight: 48, borderRadius: 8, paddingHorizontal: 14, backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dayText: { ...typography.body, color: colors.text },
    errorText: { ...typography.body, color: colors.danger },
  });
}
let styles = createStyles();
export function refreshProteinRecipeStyles() { styles = createStyles(); }
