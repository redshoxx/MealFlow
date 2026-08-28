import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Household, type ShoppingItem } from '../lib/cloud';
import {
  estimateWithPrice,
  loadHouseholdBudget,
  loadProductPrices,
  normalizeBudgetProductName,
  saveHouseholdBudget,
  saveProductPrice,
  suggestedPriceUnit,
  type ProductPrice,
} from '../lib/budget';
import { ActionButton, IconButton, ScreenHeader, SectionTitle, SurfaceCard } from '../ui/components';
import { colors, getShadow, radius, typography } from '../ui/theme';

function money(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function parseMoney(value: string) {
  return Number(value.trim().replace(',', '.').replace(/[^0-9.]/g, ''));
}

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function currentMonthLabel() {
  const raw = new Date().toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function uniqueProducts(items: ShoppingItem[]) {
  const result = new Map<string, ShoppingItem>();
  items.forEach((item) => {
    const key = normalizeBudgetProductName(item.name);
    if (key && !result.has(key)) result.set(key, item);
  });
  return Array.from(result.values()).sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));
}

export function BudgetScreen({
  household,
  items,
  onSettings,
}: {
  household: Household;
  items: ShoppingItem[];
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [monthlyBudget, setMonthlyBudget] = useState(400);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [budgetEditorOpen, setBudgetEditorOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('400');
  const [priceEditorItem, setPriceEditorItem] = useState<ShoppingItem | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [priceUnit, setPriceUnit] = useState('Stk.');
  const [saving, setSaving] = useState(false);

  const priceMap = useMemo(() => new Map(prices.map((entry) => [entry.productKey, entry])), [prices]);

  const reload = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [budget, nextPrices] = await Promise.all([loadHouseholdBudget(), loadProductPrices()]);
      setMonthlyBudget(budget.monthlyBudget);
      setBudgetDraft(String(budget.monthlyBudget).replace('.', ','));
      setPrices(nextPrices);
    } catch (error: any) {
      Alert.alert('Budget konnte nicht geladen werden', error?.message || 'Bitte versuche es erneut.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [household.id]);

  useEffect(() => { void reload(); }, [reload]);

  const estimate = useCallback((item: ShoppingItem) => {
    const price = priceMap.get(normalizeBudgetProductName(item.name));
    return estimateWithPrice(item.amount, item.unit, price);
  }, [priceMap]);

  const openItems = useMemo(() => items.filter((item) => !item.done), [items]);
  const { start, end } = useMemo(monthBounds, []);
  const completedThisMonth = useMemo(() => items.filter((item) => {
    if (!item.done || !item.completedAt) return false;
    const completed = new Date(item.completedAt);
    return completed >= start && completed < end;
  }), [items, start, end]);

  const openEstimates = useMemo(() => openItems.map((item) => ({ item, value: estimate(item) })), [openItems, estimate]);
  const completedEstimates = useMemo(() => completedThisMonth.map((item) => ({ item, value: estimate(item) })), [completedThisMonth, estimate]);
  const planned = openEstimates.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  const spent = completedEstimates.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  const projected = spent + planned;
  const missingOpen = openEstimates.filter((entry) => entry.value == null).length;
  const missingSpent = completedEstimates.filter((entry) => entry.value == null).length;
  const remaining = monthlyBudget - spent;
  const projectedRemaining = monthlyBudget - projected;
  const ratio = monthlyBudget > 0 ? projected / monthlyBudget : 0;
  const status: 'good' | 'warning' | 'danger' = ratio > 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'good';
  const statusLabel = status === 'danger' ? 'Budget überschritten' : status === 'warning' ? 'Budget wird knapp' : 'Budget im grünen Bereich';
  const statusIcon = status === 'danger' ? 'alert-circle' : status === 'warning' ? 'alert-outline' : 'check-circle-outline';

  const products = useMemo(() => uniqueProducts(items), [items]);

  const openBudgetEditor = () => {
    setBudgetDraft(String(monthlyBudget).replace('.', ','));
    setBudgetEditorOpen(true);
  };

  const persistBudget = async () => {
    const value = parseMoney(budgetDraft);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Budget prüfen', 'Bitte gib ein gültiges Monatsbudget ein.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveHouseholdBudget(value);
      setMonthlyBudget(saved.monthlyBudget);
      setBudgetEditorOpen(false);
    } catch (error: any) {
      Alert.alert('Budget nicht gespeichert', error?.message || 'Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const openPriceEditor = (item: ShoppingItem) => {
    const existing = priceMap.get(normalizeBudgetProductName(item.name));
    const unit = existing?.priceUnit ?? suggestedPriceUnit(item.unit);
    setPriceEditorItem(item);
    setPriceUnit(unit);
    setPriceDraft(existing ? String(existing.unitPrice).replace('.', ',') : '');
  };

  const persistPrice = async () => {
    if (!priceEditorItem) return;
    const value = parseMoney(priceDraft);
    if (!Number.isFinite(value) || value < 0) {
      Alert.alert('Preis prüfen', 'Bitte gib einen gültigen Preis ein.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveProductPrice(priceEditorItem.name, value, priceUnit);
      setPrices((current) => [saved, ...current.filter((entry) => entry.productKey !== saved.productKey)]);
      setPriceEditorItem(null);
    } catch (error: any) {
      Alert.alert('Preis nicht gespeichert', error?.message || 'Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Budget wird geladen …</Text></View>;
  }

  return <>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ScreenHeader
        eyebrow={`${currentMonthLabel()} · ${household.name}`}
        title="Budget"
        subtitle="Einkaufskosten schätzen und das Lebensmittelbudget im Blick behalten."
        action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />}
      />

      <SurfaceCard style={{ ...styles.budgetHero, ...(status === 'warning' ? styles.budgetHeroWarning : {}), ...(status === 'danger' ? styles.budgetHeroDanger : {}) }}>
        <View style={styles.heroTop}>
          <View style={[styles.statusIcon, status === 'warning' && styles.statusIconWarning, status === 'danger' && styles.statusIconDanger]}>
            <MaterialCommunityIcons name={statusIcon} size={24} color={status === 'danger' ? colors.danger : status === 'warning' ? '#A76500' : colors.accent} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.eyebrow}>MONATSBUDGET</Text>
            <Text style={styles.statusTitle}>{statusLabel}</Text>
          </View>
          <Pressable onPress={openBudgetEditor} style={styles.editButton}><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.accent} /></Pressable>
        </View>
        <View style={styles.budgetNumbers}>
          <View><Text style={styles.metricLabel}>Budget</Text><Text style={styles.metricValue}>{money(monthlyBudget)}</Text></View>
          <View><Text style={styles.metricLabel}>Geschätzt ausgegeben</Text><Text style={styles.metricValue}>{money(spent)}</Text></View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, ratio * 100))}%` }, status === 'warning' && styles.progressWarning, status === 'danger' && styles.progressDanger]} /></View>
        <Text style={styles.budgetHint}>{remaining >= 0 ? `Noch ${money(remaining)} vom Monatsbudget verfügbar.` : `${money(Math.abs(remaining))} über dem Monatsbudget.`}</Text>
        {missingSpent ? <Text style={styles.coverageHint}>{missingSpent} erledigte {missingSpent === 1 ? 'Position hat' : 'Positionen haben'} noch keinen gespeicherten Preis. Die Ausgaben sind daher eine Mindestschätzung.</Text> : null}
      </SurfaceCard>

      <SectionTitle title="Aktueller Einkauf" />
      <SurfaceCard style={styles.estimateCard}>
        <View style={styles.estimateTop}>
          <View style={styles.estimateIcon}><MaterialCommunityIcons name="cart-outline" size={23} color={colors.accent} /></View>
          <View style={styles.flex1}><Text style={styles.estimateLabel}>GESCHÄTZTER PREIS</Text><Text style={styles.estimateValue}>{money(planned)}</Text><Text style={styles.estimateMeta}>{openItems.length} offene {openItems.length === 1 ? 'Position' : 'Positionen'} · {missingOpen ? `${missingOpen} ohne Preis` : 'alle Preise vorhanden'}</Text></View>
        </View>
        <View style={styles.divider} />
        <View style={styles.projectedRow}><View><Text style={styles.metricLabel}>Nach diesem Einkauf</Text><Text style={styles.projectedValue}>{money(projected)} / {money(monthlyBudget)}</Text></View><View style={[styles.projectedBadge, projectedRemaining < 0 && styles.projectedBadgeDanger]}><Text style={[styles.projectedBadgeText, projectedRemaining < 0 && styles.projectedBadgeTextDanger]}>{projectedRemaining >= 0 ? `${money(projectedRemaining)} übrig` : `${money(Math.abs(projectedRemaining))} drüber`}</Text></View></View>
      </SurfaceCard>

      <SectionTitle title="Preise für die Kostenschätzung" />
      <SurfaceCard style={styles.priceList}>
        {products.length ? products.map((item, index) => {
          const price = priceMap.get(normalizeBudgetProductName(item.name));
          const itemEstimate = estimate(item);
          return <Pressable key={normalizeBudgetProductName(item.name)} onPress={() => openPriceEditor(item)} style={[styles.priceRow, index === products.length - 1 && styles.priceRowLast]}>
            <View style={styles.priceProductIcon}><MaterialCommunityIcons name={price ? 'tag-check-outline' : 'tag-plus-outline'} size={19} color={price ? colors.accent : colors.textTertiary} /></View>
            <View style={styles.flex1}><Text style={styles.priceName}>{item.name}</Text><Text style={styles.priceMeta}>{price ? `${money(price.unitPrice)} pro ${price.priceUnit}` : `Preis pro ${suggestedPriceUnit(item.unit)} hinterlegen`}</Text></View>
            <View style={styles.priceRight}>{itemEstimate != null ? <Text style={styles.priceEstimate}>{money(itemEstimate)}</Text> : null}<MaterialCommunityIcons name="chevron-right" size={21} color={colors.textTertiary} /></View>
          </Pressable>;
        }) : <View style={styles.emptyState}><MaterialCommunityIcons name="cart-outline" size={30} color={colors.textTertiary} /><Text style={styles.emptyTitle}>Noch keine Produkte</Text><Text style={styles.emptyText}>Sobald Produkte auf der Einkaufsliste stehen, kannst du hier Preise hinterlegen.</Text></View>}
      </SurfaceCard>

      <ActionButton label="Budgetdaten aktualisieren" icon="refresh" variant="secondary" loading={refreshing} onPress={() => void reload(true)} />
      <Text style={styles.disclaimer}>Die Werte sind Schätzungen auf Basis der im Haushalt gespeicherten Produktpreise. Tatsächliche Kassenpreise können abweichen.</Text>
    </ScrollView>

    <Modal transparent visible={budgetEditorOpen} animationType="fade" onRequestClose={() => setBudgetEditorOpen(false)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.overlay} onPress={() => setBudgetEditorOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>LEBENSMITTEL</Text><Text style={styles.sheetTitle}>Monatsbudget ändern</Text></View><IconButton icon="close" onPress={() => setBudgetEditorOpen(false)} accessibilityLabel="Schließen" /></View>
          <Text style={styles.fieldLabel}>Budget pro Monat</Text>
          <View style={styles.moneyInput}><Text style={styles.currency}>€</Text><TextInput autoFocus value={budgetDraft} onChangeText={setBudgetDraft} keyboardType="decimal-pad" placeholder="400,00" placeholderTextColor={colors.textTertiary} style={styles.input} /></View>
          <ActionButton label="Budget speichern" icon="content-save-outline" loading={saving} onPress={persistBudget} />
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal transparent visible={Boolean(priceEditorItem)} animationType="fade" onRequestClose={() => setPriceEditorItem(null)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.overlay} onPress={() => setPriceEditorItem(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><View style={styles.flex1}><Text style={styles.sheetEyebrow}>PREIS SPEICHERN</Text><Text style={styles.sheetTitle} numberOfLines={1}>{priceEditorItem?.name ?? ''}</Text></View><IconButton icon="close" onPress={() => setPriceEditorItem(null)} accessibilityLabel="Schließen" /></View>
          <Text style={styles.fieldLabel}>Preis pro {priceUnit}</Text>
          <View style={styles.moneyInput}><Text style={styles.currency}>€</Text><TextInput autoFocus value={priceDraft} onChangeText={setPriceDraft} keyboardType="decimal-pad" placeholder="1,49" placeholderTextColor={colors.textTertiary} style={styles.input} /></View>
          <Text style={styles.fieldHint}>Für {priceEditorItem?.unit === 'g' ? 'Gramm-Produkte wird automatisch auf kg umgerechnet.' : priceEditorItem?.unit === 'ml' ? 'Milliliter-Produkte wird automatisch auf Liter umgerechnet.' : `die Einheit ${priceUnit} wird der Preis direkt mit der Menge verrechnet.`}</Text>
          <ActionButton label="Preis speichern" icon="tag-outline" loading={saving} onPress={persistPrice} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

function createStyles() {
  return StyleSheet.create({
    flex1: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 36, gap: 18 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.background },
    loadingText: { ...typography.body, color: colors.textSecondary },
    budgetHero: { padding: 18, gap: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
    budgetHeroWarning: { borderColor: '#D59A35' },
    budgetHeroDanger: { borderColor: colors.danger },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    statusIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
    statusIconWarning: { backgroundColor: '#FFF3D8' },
    statusIconDanger: { backgroundColor: colors.dangerSoft },
    eyebrow: { ...typography.label, color: colors.textTertiary },
    statusTitle: { ...typography.title, color: colors.text, marginTop: 2 },
    editButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    budgetNumbers: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
    metricLabel: { ...typography.caption, color: colors.textSecondary },
    metricValue: { fontSize: 24, lineHeight: 29, fontWeight: '800', color: colors.text, marginTop: 2 },
    progressTrack: { height: 9, borderRadius: 5, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent },
    progressWarning: { backgroundColor: '#C98719' },
    progressDanger: { backgroundColor: colors.danger },
    budgetHint: { ...typography.bodyStrong, color: colors.text },
    coverageHint: { ...typography.caption, color: colors.textTertiary },
    estimateCard: { padding: 18, gap: 14 },
    estimateTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    estimateIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    estimateLabel: { ...typography.label, color: colors.accent },
    estimateValue: { fontSize: 31, lineHeight: 36, fontWeight: '900', color: colors.text, marginTop: 2 },
    estimateMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    projectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    projectedValue: { ...typography.bodyStrong, color: colors.text, marginTop: 2 },
    projectedBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
    projectedBadgeDanger: { backgroundColor: colors.dangerSoft },
    projectedBadgeText: { ...typography.caption, color: colors.accent, fontWeight: '800' },
    projectedBadgeTextDanger: { color: colors.danger },
    priceList: { overflow: 'hidden' },
    priceRow: { minHeight: 66, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    priceRowLast: { borderBottomWidth: 0 },
    priceProductIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    priceName: { ...typography.bodyStrong, color: colors.text },
    priceMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    priceRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    priceEstimate: { ...typography.caption, color: colors.accent, fontWeight: '800' },
    emptyState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 22 },
    emptyTitle: { ...typography.title, color: colors.text },
    emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
    disclaimer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 10 },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingTop: 8, gap: 14, ...getShadow() },
    sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginVertical: 5 },
    sheetHeader: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    sheetEyebrow: { ...typography.label, color: colors.accent },
    sheetTitle: { ...typography.title, color: colors.text, marginTop: 2 },
    fieldLabel: { ...typography.bodyStrong, color: colors.text },
    fieldHint: { ...typography.caption, color: colors.textSecondary },
    moneyInput: { minHeight: 58, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
    currency: { fontSize: 21, fontWeight: '800', color: colors.accent, marginRight: 9 },
    input: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, paddingVertical: 12 },
  });
}

let styles = createStyles();

export function refreshBudgetStyles() {
  styles = createStyles();
}
