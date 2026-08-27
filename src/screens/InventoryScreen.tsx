import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
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
import { getActiveHouseholdId } from '../lib/cloud';
import { supabase } from '../lib/supabase';
import { ActionButton, EmptyState, IconButton, ScreenHeader, SectionTitle, SurfaceCard } from '../ui/components';
import { colors, getShadow, radius, typography } from '../ui/theme';

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
  let year = 0;
  let month = 0;
  let day = 0;
  let match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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

function expiryState(iso: string | null) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const expiry = new Date(`${iso}T12:00:00`);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: 'MHD überschritten', tone: 'danger' as const };
  if (days === 0) return { label: 'MHD heute', tone: 'warning' as const };
  if (days <= 7) return { label: `MHD in ${days} Tagen`, tone: 'warning' as const };
  return { label: `MHD ${formatExpiry(iso)}`, tone: 'normal' as const };
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique')) return 'Dieser Einkauf wurde bereits in den Vorrat übernommen.';
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) return 'Keine Verbindung. Bitte prüfe deine Internetverbindung.';
  return message || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
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

  const feedback = () => {
    if (hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
  };

  const refresh = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [nextPantry, nextPurchases] = await Promise.all([loadPantry(), loadPurchasedForPantry()]);
      setPantry(nextPantry);
      setPurchases(nextPurchases);
    } catch (error) {
      Alert.alert('Vorrat konnte nicht geladen werden', errorText(error));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => { refresh(true); }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    getActiveHouseholdId().then((householdId) => {
      if (!active) return;
      const filter = `household_id=eq.${householdId}`;
      channel = supabase.channel(`mealflow-pantry-${householdId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items', filter }, () => refresh().catch(() => undefined))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, () => refresh().catch(() => undefined))
        .subscribe();
    }).catch(() => undefined);
    return () => { active = false; if (channel) supabase.removeChannel(channel); };
  }, []);

  const unscanned = useMemo(() => purchases.filter((item) => !item.scanned), [purchases]);
  const scanned = useMemo(() => purchases.filter((item) => item.scanned), [purchases]);
  const filteredPantry = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de-AT');
    if (!needle) return pantry;
    return pantry.filter((item) => `${item.productName} ${item.brand || ''}`.toLocaleLowerCase('de-AT').includes(needle));
  }, [pantry, query]);
  const expiringSoon = useMemo(() => pantry.filter((item) => {
    const status = expiryState(item.expiresOn);
    return status?.tone === 'warning' || status?.tone === 'danger';
  }).length, [pantry]);

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
    } catch (error) {
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
        source: 'manual',
      });
      setEditorOpen(true);
      Alert.alert('Produkt nicht gefunden', 'Der Barcode ist nicht bei Open Food Facts vorhanden. Du kannst das Produkt trotzdem manuell übernehmen.');
    }
  };

  const saveDraft = async () => {
    const quantity = Number(draft.quantity.replace(',', '.'));
    if (!draft.productName.trim()) {
      Alert.alert('Produktname fehlt', 'Bitte gib einen Namen für das Produkt ein.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert('Menge prüfen', 'Bitte gib eine gültige Menge größer als 0 ein.');
      return;
    }
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
          productName: draft.productName,
          brand: draft.brand,
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
        <ScreenHeader title="Vorrat" subtitle="Gekaufte Produkte übernehmen, Mengen verwalten und MHD im Blick behalten." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />

        <View style={styles.metricsRow}>
          <SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="archive-outline" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{pantry.length}</Text><Text style={styles.metricLabel}>im Vorrat</Text></SurfaceCard>
          <SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="barcode-scan" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{unscanned.length}</Text><Text style={styles.metricLabel}>noch zu scannen</Text></SurfaceCard>
          <SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="calendar-alert" size={22} color={expiringSoon ? colors.danger : colors.accent} /><Text style={styles.metricNumber}>{expiringSoon}</Text><Text style={styles.metricLabel}>MHD beachten</Text></SurfaceCard>
        </View>

        <SurfaceCard style={styles.afterShoppingCard}>
          <View style={styles.afterShoppingTop}><View style={styles.afterShoppingIcon}><MaterialCommunityIcons name="cart-check" size={25} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.eyebrow}>NACH DEM EINKAUF</Text><Text style={styles.afterShoppingTitle}>{unscanned.length ? `${unscanned.length} Produkte warten` : 'Alles übernommen'}</Text><Text style={styles.afterShoppingText}>Erledigte Einkäufe werden hier angezeigt, bis du sie gescannt oder manuell in den Vorrat übernommen hast.</Text></View></View>
          <View style={styles.actionRow}><ActionButton label="Barcode scannen" icon="barcode-scan" onPress={() => openScanner()} style={styles.flex1} /><ActionButton label="Manuell" icon="plus" variant="secondary" onPress={() => openManual()} style={styles.flex1} /></View>
        </SurfaceCard>

        <SectionTitle title={`Noch zu scannen · ${unscanned.length}`} />
        {unscanned.length ? <SurfaceCard style={styles.listCard}>{unscanned.map((item, index) => <View key={item.id} style={[styles.purchaseRow, index < unscanned.length - 1 && styles.rowBorder]}><View style={styles.purchaseIcon}><MaterialCommunityIcons name="cart-arrow-down" size={20} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowMeta}>{formatAmount(item.amount)} {item.unit} · gekauft</Text></View><View style={styles.purchaseActions}><Pressable onPress={() => openManual(item)} style={styles.smallIconButton}><MaterialCommunityIcons name="pencil-plus-outline" size={19} color={colors.textSecondary} /></Pressable><Pressable onPress={() => openScanner(item)} style={styles.scanButton}><MaterialCommunityIcons name="barcode-scan" size={19} color="#FFFFFF" /></Pressable></View></View>)}</SurfaceCard> : <SurfaceCard><EmptyState icon="check-circle-outline" title="Nichts mehr zu scannen" text="Alle aktuell erledigten Einkäufe wurden bereits in den Vorrat übernommen." /></SurfaceCard>}

        {scanned.length ? <><SectionTitle title="Bereits aus Einkauf übernommen" /><SurfaceCard style={styles.listCard}>{scanned.slice(0, 8).map((item, index) => <View key={item.id} style={[styles.scannedRow, index < Math.min(scanned.length, 8) - 1 && styles.rowBorder]}><MaterialCommunityIcons name="check-circle" size={20} color={colors.accent} /><View style={styles.flex1}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowMeta}>{formatAmount(item.amount)} {item.unit}</Text></View><Text style={styles.scannedBadge}>Erfasst</Text></View>)}</SurfaceCard></> : null}

        <View style={styles.inventoryHeader}><SectionTitle title="Mein Vorrat" /><Pressable onPress={() => openManual()} style={styles.addRound}><MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" /></Pressable></View>
        {pantry.length ? <View style={styles.searchShell}><MaterialCommunityIcons name="magnify" size={21} color={colors.textTertiary} /><TextInput value={query} onChangeText={setQuery} placeholder="Vorrat durchsuchen …" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />{query ? <Pressable onPress={() => setQuery('')}><MaterialCommunityIcons name="close-circle" size={19} color={colors.textTertiary} /></Pressable> : null}</View> : null}

        {filteredPantry.length ? <SurfaceCard style={styles.listCard}>{filteredPantry.map((item, index) => {
          const status = expiryState(item.expiresOn);
          return <Pressable key={item.id} onPress={() => openEdit(item)} style={({ pressed }) => [styles.pantryRow, index < filteredPantry.length - 1 && styles.rowBorder, { opacity: pressed ? 0.74 : 1 }]}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="contain" /> : <View style={styles.productPlaceholder}><MaterialCommunityIcons name="package-variant-closed" size={22} color={colors.accent} /></View>}
            <View style={styles.flex1}><Text style={styles.rowTitle} numberOfLines={1}>{item.productName}</Text><Text style={styles.rowMeta} numberOfLines={1}>{item.brand ? `${item.brand} · ` : ''}{formatAmount(item.quantity)} {item.unit}</Text>{status ? <Text style={[styles.expiryBadge, status.tone === 'danger' && styles.expiryDanger, status.tone === 'warning' && styles.expiryWarning]}>{status.label}</Text> : <Text style={styles.noExpiry}>Kein MHD hinterlegt</Text>}</View>
            <Pressable hitSlop={8} onPress={() => remove(item)} style={styles.deleteButton}><MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.textTertiary} /></Pressable>
          </Pressable>;
        })}</SurfaceCard> : pantry.length ? <SurfaceCard><EmptyState icon="magnify" title="Keine Treffer" text="Zu deiner Suche wurde kein Produkt im Vorrat gefunden." /></SurfaceCard> : <SurfaceCard><EmptyState icon="archive-plus-outline" title="Vorrat ist noch leer" text="Scanne gekaufte Produkte oder lege sie manuell mit Menge und optionalem MHD an." actionLabel="Produkt manuell anlegen" onAction={() => openManual()} /></SurfaceCard>}

        <Text style={styles.attribution}>Barcode-Produktdaten: Open Food Facts. Produkte können jederzeit auch ohne Barcode manuell angelegt werden.</Text>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerRoot} edges={['top', 'bottom']}>
          <View style={styles.scannerHeader}><IconButton icon="close" onPress={() => setScannerOpen(false)} accessibilityLabel="Scanner schließen" /><View style={styles.scannerHeaderText}><Text style={styles.scannerTitle}>Produkt scannen</Text><Text style={styles.scannerSubtitle}>{selectedPurchase ? `Für: ${selectedPurchase.name}` : 'Barcode mittig in den Rahmen halten'}</Text></View><Pressable onPress={() => setTorch((current) => !current)} style={[styles.torchButton, torch && styles.torchButtonActive]}><MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} size={21} color={torch ? '#FFFFFF' : colors.text} /></Pressable></View>
          <View style={styles.cameraWrap}>
            {permission?.granted ? <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onBarcodeScanned={scanLocked ? undefined : handleBarcode} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} /> : <View style={styles.permissionState}><MaterialCommunityIcons name="camera-off-outline" size={38} color={colors.textSecondary} /><Text style={styles.permissionTitle}>Kamera ist noch nicht freigegeben</Text><ActionButton label="Kamera erlauben" icon="camera-outline" onPress={() => requestPermission()} /></View>}
            {permission?.granted ? <View pointerEvents="none" style={styles.scanGuide}><View style={styles.scanFrame}><View style={styles.scanLine} /></View><Text style={styles.scanHint}>{scanLocked ? 'Produkt wird erkannt …' : 'EAN- oder UPC-Barcode vollständig anzeigen'}</Text></View> : null}
          </View>
          <View style={styles.scannerFooter}><MaterialCommunityIcons name="database-search-outline" size={19} color={colors.textSecondary} /><Text style={styles.scannerFooterText}>Produktname, Marke und Bild werden – sofern vorhanden – über Open Food Facts geladen.</Text></View>
        </SafeAreaView>
      </Modal>

      <Modal transparent visible={editorOpen} animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView style={styles.modalFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.overlay} onPress={() => setEditorOpen(false)} />
          <View style={styles.editorSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.editorHeader}><View><Text style={styles.eyebrow}>{editing ? 'VORRAT BEARBEITEN' : draft.shoppingItemId ? 'EINKAUF ÜBERNEHMEN' : 'PRODUKT ANLEGEN'}</Text><Text style={styles.editorTitle}>{editing ? 'Menge & MHD' : 'In den Vorrat'}</Text></View><IconButton icon="close" onPress={() => setEditorOpen(false)} accessibilityLabel="Schließen" /></View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
              {!editing && (draft.imageUrl || draft.barcode) ? <View style={styles.detectedProduct}>{draft.imageUrl ? <Image source={{ uri: draft.imageUrl }} style={styles.detectedImage} resizeMode="contain" /> : <View style={styles.detectedPlaceholder}><MaterialCommunityIcons name="barcode" size={27} color={colors.accent} /></View>}<View style={styles.flex1}><Text style={styles.detectedLabel}>{draft.source === 'open_food_facts' ? 'PER BARCODE ERKANNT' : 'BARCODE ERFASST'}</Text><Text style={styles.detectedBarcode}>{draft.barcode}</Text></View></View> : null}
              {!editing ? <><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Produktname</Text><TextInput value={draft.productName} onChangeText={(value) => setDraft((current) => ({ ...current, productName: value }))} placeholder="z. B. Naturjoghurt" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Marke <Text style={styles.optional}>optional</Text></Text><TextInput value={draft.brand} onChangeText={(value) => setDraft((current) => ({ ...current, brand: value }))} placeholder="z. B. Ja! Natürlich" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View></> : <View style={styles.editingProduct}><Text style={styles.rowTitle}>{editing.productName}</Text>{editing.brand ? <Text style={styles.rowMeta}>{editing.brand}</Text> : null}</View>}
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Menge</Text><View style={styles.amountRow}><TextInput value={draft.quantity} onChangeText={(value) => setDraft((current) => ({ ...current, quantity: value }))} keyboardType="decimal-pad" placeholder="1" placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.amountInput]} /><Text style={styles.amountUnit}>{draft.unit}</Text></View></View>
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Einheit</Text><View style={styles.unitGrid}>{UNITS.map((unit) => <Pressable key={unit} onPress={() => setDraft((current) => ({ ...current, unit }))} style={[styles.unitChip, draft.unit === unit && styles.unitChipActive]}><Text style={[styles.unitChipText, draft.unit === unit && styles.unitChipTextActive]}>{unit}</Text></Pressable>)}</View></View>
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Mindesthaltbarkeitsdatum <Text style={styles.optional}>optional</Text></Text><TextInput value={draft.expiry} onChangeText={(value) => setDraft((current) => ({ ...current, expiry: value }))} keyboardType="numbers-and-punctuation" placeholder="TT.MM.JJJJ" placeholderTextColor={colors.textTertiary} style={styles.formInput} /><Text style={styles.fieldHint}>Du kannst das Feld leer lassen, wenn das Produkt kein relevantes MHD hat.</Text></View>
              <ActionButton label={editing ? 'Änderungen speichern' : 'Zum Vorrat hinzufügen'} icon={editing ? 'content-save-outline' : 'archive-arrow-down-outline'} onPress={saveDraft} loading={saving} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32, gap: 17 },
    flex1: { flex: 1 },
    metricsRow: { flexDirection: 'row', gap: 8 },
    metricCard: { flex: 1, minHeight: 112, padding: 13, gap: 5 },
    metricNumber: { fontSize: 25, lineHeight: 29, fontWeight: '800', color: colors.text },
    metricLabel: { fontSize: 10, lineHeight: 13, color: colors.textSecondary },
    afterShoppingCard: { padding: 16, gap: 15 },
    afterShoppingTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    afterShoppingIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    eyebrow: { ...typography.label, color: colors.accent },
    afterShoppingTitle: { ...typography.title, color: colors.text, marginTop: 3 },
    afterShoppingText: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
    actionRow: { flexDirection: 'row', gap: 9 },
    listCard: { overflow: 'hidden' },
    purchaseRow: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
    scannedRow: { minHeight: 58, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    purchaseIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { ...typography.bodyStrong, color: colors.text },
    rowMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    purchaseActions: { flexDirection: 'row', gap: 6 },
    smallIconButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    scanButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    scannedBadge: { ...typography.caption, color: colors.accent, backgroundColor: colors.accentSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, overflow: 'hidden', fontWeight: '800' },
    inventoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addRound: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    searchShell: { minHeight: 50, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, ...getShadow() },
    searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 10 },
    pantryRow: { minHeight: 82, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
    productImage: { width: 54, height: 54, borderRadius: 14, backgroundColor: colors.surfaceMuted },
    productPlaceholder: { width: 54, height: 54, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    expiryBadge: { alignSelf: 'flex-start', fontSize: 10, lineHeight: 13, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden', marginTop: 5, fontWeight: '700' },
    expiryWarning: { color: '#8A5700', backgroundColor: '#FFF1C9' },
    expiryDanger: { color: colors.danger, backgroundColor: '#FCE8E6' },
    noExpiry: { fontSize: 10, color: colors.textTertiary, marginTop: 5 },
    deleteButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    attribution: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 14 },
    scannerRoot: { flex: 1, backgroundColor: '#080A09' },
    scannerHeader: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background },
    scannerHeaderText: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
    scannerTitle: { ...typography.title, color: colors.text },
    scannerSubtitle: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
    torchButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
    torchButtonActive: { backgroundColor: colors.accent },
    cameraWrap: { flex: 1, overflow: 'hidden', backgroundColor: '#050505' },
    scanGuide: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    scanFrame: { width: '78%', height: 172, borderRadius: 24, borderWidth: 2, borderColor: '#FFFFFF', justifyContent: 'center', overflow: 'hidden' },
    scanLine: { height: 2, backgroundColor: colors.accent, marginHorizontal: 14 },
    scanHint: { marginTop: 18, color: '#FFFFFF', fontSize: 14, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, overflow: 'hidden' },
    scannerFooter: { minHeight: 78, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.background },
    scannerFooterText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
    permissionState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: colors.background },
    permissionTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
    modalFlex: { flex: 1, justifyContent: 'flex-end' },
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
    editorSheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 24 },
    sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 9, marginBottom: 7 },
    editorHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    editorTitle: { ...typography.h2, color: colors.text, marginTop: 2 },
    editorContent: { paddingBottom: 8, gap: 16 },
    detectedProduct: { minHeight: 70, borderRadius: radius.md, backgroundColor: colors.accentSoft, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
    detectedImage: { width: 50, height: 50, borderRadius: 12, backgroundColor: colors.surface },
    detectedPlaceholder: { width: 50, height: 50, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    detectedLabel: { ...typography.label, color: colors.accent },
    detectedBarcode: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
    inputGroup: { gap: 7 },
    fieldLabel: { ...typography.bodyStrong, color: colors.text },
    fieldHint: { ...typography.caption, color: colors.textSecondary },
    optional: { fontWeight: '500', color: colors.textTertiary },
    formInput: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 13, ...typography.body, color: colors.text },
    editingProduct: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
    amountRow: { position: 'relative', justifyContent: 'center' },
    amountInput: { paddingRight: 70, fontSize: 20, fontWeight: '800' },
    amountUnit: { position: 'absolute', right: 14, ...typography.body, color: colors.textSecondary },
    unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    unitChip: { minHeight: 39, minWidth: 54, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    unitChipActive: { backgroundColor: colors.accent },
    unitChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
    unitChipTextActive: { color: '#FFFFFF' },
  });
}

let styles = createStyles();

export function refreshInventoryStyles() {
  styles = createStyles();
}
