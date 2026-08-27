import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addPantryItem,
  deletePantryItem,
  fetchInventoryProduct,
  loadPantry,
  loadPurchasedForPantry,
  updatePantryItem,
  type PantryItem,
  type PantrySource,
  type PurchasedForPantry,
  type ScannedProduct,
} from '../lib/inventory';
import { getExpiryInfo, getUrgentPantry, syncExpiryNotifications } from '../lib/expiryNotifications';
import { getActiveHouseholdId } from '../lib/cloud';
import { supabase } from '../lib/supabase';
import { ActionButton, EmptyState, IconButton, ScreenHeader, SectionTitle, SurfaceCard } from '../ui/components';
import { colors, radius, typography } from '../ui/theme';

const UNITS = ['Stk.', 'Pkg.', 'g', 'kg', 'ml', 'l', 'Dose', 'Flasche'];

type Draft = {
  shoppingItemId: string | null;
  barcode: string | null;
  productName: string;
  brand: string;
  imageUrl: string | null;
  quantity: string;
  unit: string;
  expiry: string;
  source: PantrySource;
};

const EMPTY_DRAFT: Draft = {
  shoppingItemId: null,
  barcode: null,
  productName: '',
  brand: '',
  imageUrl: null,
  quantity: '1',
  unit: 'Stk.',
  expiry: '',
  source: 'manual',
};

function formatAmount(value: number) {
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(value);
}

function parseExpiry(value: string): string | null {
  const clean = value.trim();
  if (!clean) return null;
  let match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year = 0; let month = 0; let day = 0;
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = clean.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) throw new Error('Bitte MHD als TT.MM.JJJJ eingeben oder leer lassen.');
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  }
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Das eingegebene MHD ist ungültig.');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatExpiry(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('duplicate') || lower.includes('unique')) return 'Dieser Einkauf wurde bereits in den Vorrat übernommen.';
  if (lower.includes('network') || lower.includes('fetch')) return 'Keine Verbindung. Bitte prüfe deine Internetverbindung.';
  return message || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
}

function useSwipeDown(onClose: () => void) {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 58 || gesture.vy > 0.72) onClose();
    },
  }), [onClose]);
}

export function InventoryScreen({ onSettings, hapticsEnabled }: { onSettings: () => void; hapticsEnabled: boolean }) {
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [purchases, setPurchases] = useState<PurchasedForPantry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchasedForPantry | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const refreshRunning = useRef(false);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorSwipe = useSwipeDown(() => setEditorOpen(false));

  const feedback = () => {
    if (hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
  };

  const refresh = async (showLoading = false) => {
    if (refreshRunning.current) return;
    refreshRunning.current = true;
    if (showLoading) setLoading(true);
    try {
      const [nextPantry, nextPurchases] = await Promise.all([loadPantry(), loadPurchasedForPantry()]);
      setPantry(nextPantry);
      setPurchases(nextPurchases);
      syncExpiryNotifications(nextPantry).catch(() => undefined);
    } catch (error) {
      Alert.alert('Vorrat konnte nicht geladen werden', errorText(error));
    } finally {
      refreshRunning.current = false;
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => { refresh(true); }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    const queueRefresh = () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      realtimeTimer.current = setTimeout(() => refresh().catch(() => undefined), 220);
    };
    getActiveHouseholdId().then((householdId) => {
      if (!active) return;
      const filter = `household_id=eq.${householdId}`;
      channel = supabase.channel(`mealflow-pantry-${householdId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items', filter }, queueRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, queueRefresh)
        .subscribe();
    }).catch(() => undefined);
    return () => {
      active = false;
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const unscanned = useMemo(() => purchases.filter((item) => !item.scanned), [purchases]);
  const urgent = useMemo(() => getUrgentPantry(pantry, 3), [pantry]);
  const filteredPantry = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de-AT');
    if (!needle) return pantry;
    return pantry.filter((item) => `${item.productName} ${item.brand || ''}`.toLocaleLowerCase('de-AT').includes(needle));
  }, [pantry, query]);

  const openManual = (purchase?: PurchasedForPantry | null) => {
    feedback();
    setEditing(null);
    setDraft({
      ...EMPTY_DRAFT,
      shoppingItemId: purchase?.id ?? null,
      productName: purchase?.name ?? '',
      quantity: purchase ? String(purchase.amount).replace('.', ',') : '1',
      unit: purchase?.unit ?? 'Stk.',
    });
    setEditorOpen(true);
  };

  const openEdit = (item: PantryItem) => {
    feedback();
    setEditing(item);
    setDraft({
      shoppingItemId: item.shoppingItemId,
      barcode: item.barcode,
      productName: item.productName,
      brand: item.brand ?? '',
      imageUrl: item.imageUrl,
      quantity: String(item.quantity).replace('.', ','),
      unit: item.unit,
      expiry: item.expiresOn ? formatExpiry(item.expiresOn) : '',
      source: item.source,
    });
    setEditorOpen(true);
  };

  const openScanner = async (purchase?: PurchasedForPantry | null) => {
    feedback();
    setSelectedPurchase(purchase ?? null);
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted) {
      Alert.alert('Kamerazugriff benötigt', 'Erlaube MealFlow den Kamerazugriff, damit Produkte nach dem Einkauf gescannt werden können.');
      return;
    }
    setScanLocked(false);
    setTorch(false);
    setScannerOpen(true);
  };

  const useScannedProduct = (product: ScannedProduct) => {
    const purchase = selectedPurchase;
    setDraft({
      shoppingItemId: purchase?.id ?? null,
      barcode: product.barcode,
      productName: product.name || purchase?.name || '',
      brand: product.brand ?? '',
      imageUrl: product.imageUrl ?? null,
      quantity: purchase ? String(purchase.amount).replace('.', ',') : '1',
      unit: purchase?.unit ?? 'Stk.',
      expiry: '',
      source: 'open_food_facts',
    });
    setEditing(null);
    setEditorOpen(true);
  };

  const handleBarcode = async (result: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const product = await fetchInventoryProduct(result.data);
      setScannerOpen(false);
      useScannedProduct(product);
    } catch {
      const barcode = result.data.replace(/\D/g, '');
      const purchase = selectedPurchase;
      setScannerOpen(false);
      setEditing(null);
      setDraft({
        ...EMPTY_DRAFT,
        shoppingItemId: purchase?.id ?? null,
        barcode: barcode || null,
        productName: purchase?.name ?? '',
        quantity: purchase ? String(purchase.amount).replace('.', ',') : '1',
        unit: purchase?.unit ?? 'Stk.',
      });
      setEditorOpen(true);
      Alert.alert('Produkt nicht gefunden', 'Der Barcode ist nicht bei Open Food Facts vorhanden. Du kannst das Produkt trotzdem manuell übernehmen.');
    }
  };

  const saveDraft = async () => {
    const quantity = Number(draft.quantity.replace(',', '.'));
    if (!draft.productName.trim()) return Alert.alert('Produktname fehlt', 'Bitte gib einen Namen für das Produkt ein.');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) return Alert.alert('Menge prüfen', 'Bitte gib eine gültige Menge ein.');
    let expiresOn: string | null = null;
    try { expiresOn = parseExpiry(draft.expiry); }
    catch (error) { Alert.alert('MHD prüfen', errorText(error)); return; }

    setSaving(true);
    try {
      if (editing) {
        const updated = await updatePantryItem(editing.id, { quantity, unit: draft.unit, expiresOn });
        setPantry((current) => current.map((item) => item.id === editing.id ? updated : item));
      } else {
        const added = await addPantryItem({
          shoppingItemId: draft.shoppingItemId,
          barcode: draft.barcode,
          productName: draft.productName.slice(0, 160),
          brand: draft.brand.slice(0, 120),
          imageUrl: draft.imageUrl,
          quantity,
          unit: draft.unit,
          expiresOn,
          source: draft.source,
        });
        setPantry((current) => [added, ...current]);
      }
      setEditorOpen(false);
      setEditing(null);
      setSelectedPurchase(null);
      await refresh();
      if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Alert.alert('Speichern nicht möglich', errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = (item: PantryItem) => {
    Alert.alert('Aus Vorrat entfernen?', `„${item.productName}“ wird aus dem Vorrat entfernt.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Entfernen', style: 'destructive', onPress: async () => {
        const previous = pantry;
        setPantry((current) => current.filter((entry) => entry.id !== item.id));
        try {
          await deletePantryItem(item.id);
          syncExpiryNotifications(previous.filter((entry) => entry.id !== item.id)).catch(() => undefined);
          if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        } catch (error) {
          setPantry(previous);
          Alert.alert('Entfernen nicht möglich', errorText(error));
        }
      } },
    ]);
  };

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ScreenHeader title="Vorrat" subtitle={`${pantry.length} Produkte · ${unscanned.length} nach dem Einkauf offen`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />

        <View style={styles.actionRow}>
          <Pressable onPress={() => openScanner()} style={styles.primaryAction}><MaterialCommunityIcons name="barcode-scan" size={22} color="#FFFFFF" /><Text style={styles.primaryActionText}>Scannen</Text></Pressable>
          <Pressable onPress={() => openManual()} style={styles.secondaryAction}><MaterialCommunityIcons name="plus" size={22} color={colors.accent} /><Text style={styles.secondaryActionText}>Manuell</Text></Pressable>
        </View>

        {urgent.length ? <SurfaceCard style={styles.alertCard}>
          <View style={styles.alertHeader}><MaterialCommunityIcons name="calendar-alert" size={21} color={urgent.some((entry) => entry.info.tone === 'today' || entry.info.tone === 'expired') ? colors.danger : colors.accent} /><Text style={styles.alertTitle}>MHD beachten</Text><Text style={styles.alertCount}>{urgent.length}</Text></View>
          {urgent.slice(0, 3).map(({ item, info }) => <Pressable key={item.id} onPress={() => openEdit(item)} style={styles.alertRow}><Text style={styles.alertProduct} numberOfLines={1}>{item.productName}</Text><Text style={[styles.alertStatus, (info.tone === 'today' || info.tone === 'expired') && styles.alertStatusDanger]}>{info.label}</Text></Pressable>)}
        </SurfaceCard> : null}

        {unscanned.length ? <SurfaceCard style={styles.purchaseCard}>
          <View style={styles.compactHeader}><View><Text style={styles.eyebrow}>NACH DEM EINKAUF</Text><Text style={styles.sectionTitle}>{unscanned.length} noch zu übernehmen</Text></View><MaterialCommunityIcons name="cart-check" size={22} color={colors.accent} /></View>
          {unscanned.slice(0, 4).map((item) => <View key={item.id} style={styles.purchaseRow}><View style={styles.flex1}><Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text><Text style={styles.rowMeta}>{formatAmount(item.amount)} {item.unit}</Text></View><Pressable onPress={() => openManual(item)} style={styles.iconButton}><MaterialCommunityIcons name="pencil-plus-outline" size={18} color={colors.textSecondary} /></Pressable><Pressable onPress={() => openScanner(item)} style={styles.scanIconButton}><MaterialCommunityIcons name="barcode-scan" size={18} color="#FFFFFF" /></Pressable></View>)}
          {unscanned.length > 4 ? <Text style={styles.moreText}>+ {unscanned.length - 4} weitere gekaufte Produkte</Text> : null}
        </SurfaceCard> : null}

        <View style={styles.inventoryHeader}><SectionTitle title="Im Vorrat" /><Text style={styles.inventoryCount}>{pantry.length}</Text></View>
        {pantry.length ? <View style={styles.searchShell}><MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} /><TextInput value={query} onChangeText={setQuery} placeholder="Produkt suchen …" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />{query ? <Pressable onPress={() => setQuery('')}><MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} /></Pressable> : null}</View> : null}

        {loading ? <SurfaceCard style={styles.loadingCard}><Text style={styles.rowMeta}>Vorrat wird geladen …</Text></SurfaceCard> : null}
        {!loading && filteredPantry.length ? <SurfaceCard style={styles.listCard}>{filteredPantry.map((item) => {
          const status = getExpiryInfo(item.expiresOn);
          return <Pressable key={item.id} onPress={() => openEdit(item)} style={({ pressed }) => [styles.pantryRow, { opacity: pressed ? 0.72 : 1 }]}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="contain" /> : <View style={styles.productPlaceholder}><MaterialCommunityIcons name="package-variant-closed" size={20} color={colors.accent} /></View>}
            <View style={styles.flex1}><Text style={styles.rowTitle} numberOfLines={1}>{item.productName}</Text><Text style={styles.rowMeta} numberOfLines={1}>{item.brand ? `${item.brand} · ` : ''}{formatAmount(item.quantity)} {item.unit}</Text>{status ? <Text style={[styles.expiryText, status.tone === 'soon' && styles.expirySoon, (status.tone === 'today' || status.tone === 'expired') && styles.expiryDanger]}>{status.label}</Text> : null}</View>
            <Pressable hitSlop={8} onPress={() => remove(item)} style={styles.iconButton}><MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.textTertiary} /></Pressable>
          </Pressable>;
        })}</SurfaceCard> : !loading && pantry.length ? <SurfaceCard><EmptyState icon="magnify" title="Keine Treffer" text="Kein Produkt passt zu deiner Suche." /></SurfaceCard> : !loading ? <SurfaceCard><EmptyState icon="archive-plus-outline" title="Vorrat ist leer" text="Scanne nach dem Einkauf oder lege ein Produkt manuell an." actionLabel="Produkt anlegen" onAction={() => openManual()} /></SurfaceCard> : null}
      </ScrollView>

      <Modal visible={scannerOpen} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerRoot} edges={['top', 'bottom']}>
          <View style={styles.scannerHeader}><IconButton icon="close" onPress={() => setScannerOpen(false)} accessibilityLabel="Scanner schließen" /><View style={styles.scannerHeaderText}><Text style={styles.scannerTitle}>Produkt scannen</Text><Text style={styles.scannerSubtitle}>{selectedPurchase ? selectedPurchase.name : 'EAN/UPC in den Rahmen halten'}</Text></View><Pressable onPress={() => setTorch((current) => !current)} style={[styles.torchButton, torch && styles.torchButtonActive]}><MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} size={20} color={torch ? '#FFFFFF' : colors.text} /></Pressable></View>
          <View style={styles.cameraWrap}>{permission?.granted ? <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onBarcodeScanned={scanLocked ? undefined : handleBarcode} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} /> : <View style={styles.permissionState}><Text style={styles.sectionTitle}>Kamera freigeben</Text><ActionButton label="Kamera erlauben" icon="camera-outline" onPress={() => requestPermission()} /></View>}{permission?.granted ? <View pointerEvents="none" style={styles.scanGuide}><View style={styles.scanFrame} /><Text style={styles.scanHint}>{scanLocked ? 'Produkt wird geladen …' : 'Barcode vollständig im Rahmen anzeigen'}</Text></View> : null}</View>
        </SafeAreaView>
      </Modal>

      <Modal transparent visible={editorOpen} animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView style={styles.modalFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.overlay} onPress={() => setEditorOpen(false)} />
          <View style={styles.editorSheet}>
            <View {...editorSwipe.panHandlers} style={styles.dismissZone}><View style={styles.sheetHandle} /></View>
            <View style={styles.editorHeader}><View><Text style={styles.eyebrow}>{editing ? 'BEARBEITEN' : draft.shoppingItemId ? 'EINKAUF ÜBERNEHMEN' : 'NEUES PRODUKT'}</Text><Text style={styles.editorTitle}>{editing ? draft.productName : 'Zum Vorrat hinzufügen'}</Text></View><IconButton icon="close" onPress={() => setEditorOpen(false)} accessibilityLabel="Schließen" /></View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
              {!editing && draft.imageUrl ? <Image source={{ uri: draft.imageUrl }} style={styles.detectedImage} resizeMode="contain" /> : null}
              {!editing ? <><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Produkt</Text><TextInput value={draft.productName} maxLength={160} onChangeText={(value) => setDraft((current) => ({ ...current, productName: value }))} placeholder="z. B. Milch" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Marke <Text style={styles.optional}>optional</Text></Text><TextInput value={draft.brand} maxLength={120} onChangeText={(value) => setDraft((current) => ({ ...current, brand: value }))} placeholder="Marke" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View></> : null}
              <View style={styles.amountUnitRow}><View style={styles.amountColumn}><Text style={styles.fieldLabel}>Menge</Text><TextInput value={draft.quantity} onChangeText={(value) => setDraft((current) => ({ ...current, quantity: value }))} keyboardType="decimal-pad" placeholder="1" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View><View style={styles.unitColumn}><Text style={styles.fieldLabel}>Einheit</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitRow}>{UNITS.map((unit) => <Pressable key={unit} onPress={() => setDraft((current) => ({ ...current, unit }))} style={[styles.unitChip, draft.unit === unit && styles.unitChipActive]}><Text style={[styles.unitChipText, draft.unit === unit && styles.unitChipTextActive]}>{unit}</Text></Pressable>)}</ScrollView></View></View>
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>MHD <Text style={styles.optional}>optional</Text></Text><TextInput value={draft.expiry} onChangeText={(value) => setDraft((current) => ({ ...current, expiry: value }))} keyboardType="numbers-and-punctuation" placeholder="TT.MM.JJJJ" placeholderTextColor={colors.textTertiary} style={styles.formInput} /><Text style={styles.fieldHint}>Bei einem MHD plant MealFlow automatisch Erinnerungen.</Text></View>
              <ActionButton label={editing ? 'Speichern' : 'Zum Vorrat hinzufügen'} icon={editing ? 'content-save-outline' : 'archive-arrow-down-outline'} onPress={saveDraft} loading={saving} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32, gap: 14 },
    flex1: { flex: 1 },
    actionRow: { flexDirection: 'row', gap: 10 },
    primaryAction: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    primaryActionText: { ...typography.bodyStrong, color: '#FFFFFF' },
    secondaryAction: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    secondaryActionText: { ...typography.bodyStrong, color: colors.accent },
    alertCard: { padding: 14, gap: 7 },
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    alertTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
    alertCount: { ...typography.caption, color: colors.textSecondary },
    alertRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
    alertProduct: { ...typography.caption, color: colors.text, fontWeight: '700', flex: 1 },
    alertStatus: { fontSize: 11, lineHeight: 14, color: colors.accent, fontWeight: '800' },
    alertStatusDanger: { color: colors.danger },
    purchaseCard: { padding: 14, gap: 4 },
    compactHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    eyebrow: { ...typography.label, color: colors.accent },
    sectionTitle: { ...typography.title, color: colors.text, marginTop: 2 },
    purchaseRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowTitle: { ...typography.bodyStrong, color: colors.text },
    rowMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
    iconButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    scanIconButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    moreText: { ...typography.caption, color: colors.textTertiary, paddingTop: 7 },
    inventoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    inventoryCount: { ...typography.caption, color: colors.textSecondary, fontWeight: '800' },
    searchShell: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 10 },
    loadingCard: { padding: 18, alignItems: 'center' },
    listCard: { overflow: 'hidden' },
    pantryRow: { minHeight: 68, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    productImage: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.surfaceMuted },
    productPlaceholder: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    expiryText: { fontSize: 11, lineHeight: 14, color: colors.textTertiary, marginTop: 2, fontWeight: '700' },
    expirySoon: { color: colors.accent },
    expiryDanger: { color: colors.danger, fontWeight: '900' },
    scannerRoot: { flex: 1, backgroundColor: colors.background },
    scannerHeader: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    scannerHeaderText: { flex: 1, alignItems: 'center' },
    scannerTitle: { ...typography.title, color: colors.text },
    scannerSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    torchButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    torchButtonActive: { backgroundColor: colors.accent },
    cameraWrap: { flex: 1, overflow: 'hidden', backgroundColor: '#050806' },
    permissionState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
    scanGuide: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 18 },
    scanFrame: { width: '78%', height: 190, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 24 },
    scanHint: { ...typography.caption, color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, overflow: 'hidden' },
    modalFlex: { flex: 1, justifyContent: 'flex-end' },
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
    editorSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '78%', paddingHorizontal: 18, paddingBottom: 22 },
    dismissZone: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
    sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border },
    editorHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    editorTitle: { ...typography.title, color: colors.text, marginTop: 2, maxWidth: 280 },
    editorContent: { gap: 15, paddingBottom: 6 },
    detectedImage: { width: 76, height: 76, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignSelf: 'center' },
    inputGroup: { gap: 7 },
    fieldLabel: { ...typography.bodyStrong, color: colors.text },
    fieldHint: { ...typography.caption, color: colors.textSecondary },
    optional: { color: colors.textTertiary, fontWeight: '500' },
    formInput: { minHeight: 50, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 13, ...typography.body, color: colors.text },
    amountUnitRow: { gap: 12 },
    amountColumn: { gap: 7 },
    unitColumn: { gap: 7 },
    unitRow: { gap: 7, paddingRight: 4 },
    unitChip: { minHeight: 38, minWidth: 50, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    unitChipActive: { backgroundColor: colors.accent },
    unitChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
    unitChipTextActive: { color: '#FFFFFF' },
  });
}

let styles = createStyles();
export function refreshInventoryStyles() { styles = createStyles(); }
