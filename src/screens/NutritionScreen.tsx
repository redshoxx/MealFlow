import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  PanResponder,
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
  addNutritionEntry,
  calculateProductNutrition,
  deleteNutritionEntry,
  fetchOpenFoodFactsProduct,
  loadNutritionEntries,
  loadNutritionProfile,
  saveNutritionProfile,
  type FoodProduct,
  type MealType,
  type NutritionEntry,
  type NutritionProfile,
} from '../lib/nutrition';
import { ActionButton, IconButton, ScreenHeader, SurfaceCard } from '../ui/components';
import { colors, getShadow, radius, typography } from '../ui/theme';

const MEALS: { key: MealType; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { key: 'breakfast', label: 'Frühstück', icon: 'weather-sunset-up' },
  { key: 'lunch', label: 'Mittagessen', icon: 'white-balance-sunny' },
  { key: 'dinner', label: 'Abendessen', icon: 'weather-sunset-down' },
  { key: 'snack', label: 'Snacks', icon: 'food-apple-outline' },
];

const DEFAULT_PROFILE: NutritionProfile = {
  dailyCalorieTarget: 2000,
  proteinTargetG: 120,
  carbsTargetG: 220,
  fatTargetG: 65,
};

function dateIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function shiftDate(iso: string, amount: number) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + amount);
  return dateIso(date);
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: digits }).format(value);
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.toLowerCase().includes('not found') || message.toLowerCase().includes('nicht gefunden')) return 'Dieses Produkt wurde bei Open Food Facts nicht gefunden.';
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) return 'Keine Verbindung zu Open Food Facts. Bitte prüfe deine Internetverbindung.';
  return message || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
}

function initialMeal(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function useSwipeDown(onClose: () => void) {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.3,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 58 || gesture.vy > 0.75) onClose();
    },
  }), [onClose]);
}

function SheetHandle({ onClose }: { onClose: () => void }) {
  const pan = useSwipeDown(onClose);
  return <View {...pan.panHandlers} style={styles.sheetDismissZone}><View style={styles.sheetHandle} /></View>;
}

function MacroProgress({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const progress = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={styles.macroItem}>
      <View style={styles.macroHeader}><Text style={styles.macroLabel}>{label}</Text><Text style={styles.macroValue}>{formatNumber(value, 1)} / {formatNumber(target)} {unit}</Text></View>
      <View style={styles.macroTrack}><View style={[styles.macroFill, { width: `${Math.round(progress * 100)}%` as `${number}%` }]} /></View>
    </View>
  );
}

export function NutritionScreen({ onSettings, hapticsEnabled }: { onSettings: () => void; hapticsEnabled: boolean }) {
  const today = dateIso(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [profile, setProfile] = useState<NutritionProfile>(DEFAULT_PROFILE);
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [mealType, setMealType] = useState<MealType>(initialMeal());
  const [amountText, setAmountText] = useState('100');
  const [savingProduct, setSavingProduct] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalCalories, setGoalCalories] = useState('2000');
  const [goalProtein, setGoalProtein] = useState('120');
  const [goalCarbs, setGoalCarbs] = useState('220');
  const [goalFat, setGoalFat] = useState('65');
  const [savingGoals, setSavingGoals] = useState(false);

  const loadDay = async (date = selectedDate) => {
    setLoading(true);
    try {
      const [nextProfile, nextEntries] = await Promise.all([loadNutritionProfile(), loadNutritionEntries(date)]);
      setProfile(nextProfile);
      setEntries(nextEntries);
    } catch (error) {
      Alert.alert('Kalorien konnten nicht geladen werden', errorText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDay(selectedDate); }, [selectedDate]);

  const totals = useMemo(() => entries.reduce((sum, entry) => ({
    calories: sum.calories + entry.calories,
    proteinG: sum.proteinG + entry.proteinG,
    carbsG: sum.carbsG + entry.carbsG,
    fatG: sum.fatG + entry.fatG,
  }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }), [entries]);

  const remaining = profile.dailyCalorieTarget - totals.calories;
  const calorieProgress = profile.dailyCalorieTarget > 0 ? Math.min(1, totals.calories / profile.dailyCalorieTarget) : 0;
  const selectedDateLabel = selectedDate === today
    ? 'Heute'
    : parseDate(selectedDate).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: 'short' });

  const feedback = () => {
    if (hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
  };

  const openScanner = async (meal?: MealType) => {
    if (meal) setMealType(meal);
    feedback();
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted) {
      Alert.alert('Kamerazugriff benötigt', 'Erlaube MealFlow den Kamerazugriff, damit Barcodes gescannt werden können.');
      return;
    }
    setScanLocked(false);
    setTorch(false);
    setScannerOpen(true);
  };

  const handleBarcode = async (result: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const found = await fetchOpenFoodFactsProduct(result.data);
      setProduct(found);
      setAmountText(String(found.servingQuantity || 100).replace('.', ','));
      setScannerOpen(false);
      setProductOpen(true);
    } catch (error) {
      Alert.alert('Produkt nicht gefunden', errorText(error), [{ text: 'Weiter scannen', onPress: () => setScanLocked(false) }]);
    }
  };

  const amount = Math.max(0, Number(amountText.replace(',', '.')) || 0);
  const productTotals = product ? calculateProductNutrition(product, amount) : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

  const addProduct = async () => {
    if (!product || amount <= 0) return;
    setSavingProduct(true);
    try {
      const entry = await addNutritionEntry({
        eatenOn: selectedDate,
        mealType,
        barcode: product.barcode,
        productName: product.name,
        brand: product.brand,
        imageUrl: product.imageUrl,
        amountG: amount,
        calories: productTotals.calories,
        proteinG: productTotals.proteinG,
        carbsG: productTotals.carbsG,
        fatG: productTotals.fatG,
        source: 'open_food_facts',
      });
      setEntries((current) => [...current, entry]);
      setProductOpen(false);
      setProduct(null);
      if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Alert.alert('Produkt konnte nicht hinzugefügt werden', errorText(error));
    } finally {
      setSavingProduct(false);
    }
  };

  const removeEntry = async (entry: NutritionEntry) => {
    const previous = entries;
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    try {
      await deleteNutritionEntry(entry.id);
      feedback();
    } catch (error) {
      setEntries(previous);
      Alert.alert('Eintrag konnte nicht gelöscht werden', errorText(error));
    }
  };

  const openGoals = () => {
    setGoalCalories(String(profile.dailyCalorieTarget));
    setGoalProtein(String(profile.proteinTargetG));
    setGoalCarbs(String(profile.carbsTargetG));
    setGoalFat(String(profile.fatTargetG));
    setGoalsOpen(true);
  };

  const saveGoals = async () => {
    const next: NutritionProfile = {
      dailyCalorieTarget: Math.max(1, Number(goalCalories.replace(',', '.')) || profile.dailyCalorieTarget),
      proteinTargetG: Math.max(0, Number(goalProtein.replace(',', '.')) || 0),
      carbsTargetG: Math.max(0, Number(goalCarbs.replace(',', '.')) || 0),
      fatTargetG: Math.max(0, Number(goalFat.replace(',', '.')) || 0),
    };
    setSavingGoals(true);
    try {
      await saveNutritionProfile(next);
      setProfile(next);
      setGoalsOpen(false);
      if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Alert.alert('Ziele konnten nicht gespeichert werden', errorText(error));
    } finally {
      setSavingGoals(false);
    }
  };

  return (
    <>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ScreenHeader title="Kalorien" subtitle="Dein persönlicher Tagesüberblick – getrennt von allen anderen Haushaltsmitgliedern." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />

        <View style={styles.dateNavigator}>
          <Pressable onPress={() => setSelectedDate((current) => shiftDate(current, -1))} style={styles.dateButton}><MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} /></Pressable>
          <View style={styles.dateCenter}><Text style={styles.dateTitle}>{selectedDateLabel}</Text><Text style={styles.dateSubtitle}>{parseDate(selectedDate).toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' })}</Text></View>
          <Pressable disabled={selectedDate >= today} onPress={() => setSelectedDate((current) => shiftDate(current, 1))} style={[styles.dateButton, selectedDate >= today && styles.dateButtonDisabled]}><MaterialCommunityIcons name="chevron-right" size={24} color={selectedDate >= today ? colors.textTertiary : colors.text} /></Pressable>
        </View>

        <SurfaceCard style={styles.energyCard}>
          <View style={styles.energyHeader}><View><Text style={styles.energyEyebrow}>TAGESBILANZ</Text><Text style={styles.energyRemaining}>{formatNumber(Math.abs(remaining))} kcal</Text><Text style={styles.energyRemainingLabel}>{remaining >= 0 ? 'noch verfügbar' : 'über deinem Tagesziel'}</Text></View><Pressable onPress={openGoals} style={styles.goalButton}><MaterialCommunityIcons name="target" size={18} color={colors.accent} /><Text style={styles.goalButtonText}>Ziel</Text></Pressable></View>
          <View style={styles.energyNumbers}><View><Text style={styles.energyNumber}>{formatNumber(totals.calories)}</Text><Text style={styles.energyNumberLabel}>gegessen</Text></View><View style={styles.energyDivider} /><View><Text style={styles.energyNumber}>{formatNumber(profile.dailyCalorieTarget)}</Text><Text style={styles.energyNumberLabel}>Tagesziel</Text></View></View>
          <View style={styles.calorieTrack}><View style={[styles.calorieFill, { width: `${Math.round(calorieProgress * 100)}%` as `${number}%` }]} /></View>
        </SurfaceCard>

        <SurfaceCard style={styles.macroCard}>
          <MacroProgress label="Eiweiß" value={totals.proteinG} target={profile.proteinTargetG} unit="g" />
          <MacroProgress label="Kohlenhydrate" value={totals.carbsG} target={profile.carbsTargetG} unit="g" />
          <MacroProgress label="Fett" value={totals.fatG} target={profile.fatTargetG} unit="g" />
        </SurfaceCard>

        <Pressable onPress={() => openScanner()} style={({ pressed }) => [styles.scanHero, { opacity: pressed ? 0.82 : 1 }]}>
          <View style={styles.scanHeroIcon}><MaterialCommunityIcons name="barcode-scan" size={26} color="#FFFFFF" /></View>
          <View style={styles.flex1}><Text style={styles.scanHeroTitle}>Barcode scannen</Text><Text style={styles.scanHeroText}>Produkt erkennen und Nährwerte aus Open Food Facts übernehmen.</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#FFFFFF" />
        </Pressable>

        {loading ? <View style={styles.loadingBlock}><View style={styles.loadingPulse} /><Text style={styles.loadingText}>Tagesdaten werden geladen …</Text></View> : null}

        {!loading && MEALS.map((meal) => {
          const mealEntries = entries.filter((entry) => entry.mealType === meal.key);
          const mealCalories = mealEntries.reduce((sum, entry) => sum + entry.calories, 0);
          return (
            <View key={meal.key} style={styles.mealSection}>
              <View style={styles.mealHeader}>
                <View style={styles.mealHeading}><View style={styles.mealIcon}><MaterialCommunityIcons name={meal.icon} size={20} color={colors.accent} /></View><View><Text style={styles.mealTitle}>{meal.label}</Text><Text style={styles.mealCalories}>{formatNumber(mealCalories)} kcal</Text></View></View>
                <Pressable onPress={() => openScanner(meal.key)} style={styles.mealAddButton}><MaterialCommunityIcons name="plus" size={21} color={colors.accent} /></Pressable>
              </View>
              <SurfaceCard style={styles.mealCard}>
                {mealEntries.length === 0 ? <Pressable onPress={() => openScanner(meal.key)} style={styles.emptyMeal}><Text style={styles.emptyMealText}>Noch nichts eingetragen</Text><Text style={styles.emptyMealAction}>Produkt hinzufügen</Text></Pressable> : mealEntries.map((entry, index) => (
                  <View key={entry.id} style={[styles.foodRow, index < mealEntries.length - 1 && styles.foodRowBorder]}>
                    {entry.imageUrl ? <Image source={{ uri: entry.imageUrl }} style={styles.foodImage} resizeMode="contain" /> : <View style={styles.foodImagePlaceholder}><MaterialCommunityIcons name="food-variant" size={21} color={colors.accent} /></View>}
                    <View style={styles.flex1}><Text style={styles.foodName} numberOfLines={1}>{entry.productName}</Text><Text style={styles.foodMeta} numberOfLines={1}>{entry.brand ? `${entry.brand} · ` : ''}{formatNumber(entry.amountG, 1)} g · E {formatNumber(entry.proteinG, 1)} g</Text></View>
                    <View style={styles.foodRight}><Text style={styles.foodCalories}>{formatNumber(entry.calories)}</Text><Text style={styles.foodKcalLabel}>kcal</Text></View>
                    <Pressable hitSlop={8} onPress={() => removeEntry(entry)} style={styles.foodDelete}><MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} /></Pressable>
                  </View>
                ))}
              </SurfaceCard>
            </View>
          );
        })}

        <Text style={styles.offAttribution}>Produktdaten: Open Food Facts · Community-Daten können unvollständig oder fehlerhaft sein.</Text>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerRoot} edges={['top', 'bottom']}>
          <View style={styles.scannerHeader}><IconButton icon="close" onPress={() => setScannerOpen(false)} accessibilityLabel="Scanner schließen" /><View style={styles.scannerHeaderText}><Text style={styles.scannerTitle}>Barcode scannen</Text><Text style={styles.scannerSubtitle}>EAN-Code mittig in den Rahmen halten</Text></View><Pressable onPress={() => setTorch((current) => !current)} style={[styles.torchButton, torch && styles.torchButtonActive]}><MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} size={21} color={torch ? '#FFFFFF' : colors.text} /></Pressable></View>
          <View style={styles.cameraWrap}>
            {permission?.granted ? <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onBarcodeScanned={scanLocked ? undefined : handleBarcode} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} /> : <View style={styles.permissionState}><MaterialCommunityIcons name="camera-off-outline" size={38} color={colors.textSecondary} /><Text style={styles.permissionTitle}>Kamera ist noch nicht freigegeben</Text><ActionButton label="Kamera erlauben" icon="camera-outline" onPress={() => requestPermission()} /></View>}
            {permission?.granted ? <View pointerEvents="none" style={styles.scanGuide}><View style={styles.scanFrame}><View style={styles.scanLine} /></View><Text style={styles.scanHint}>{scanLocked ? 'Produkt wird gesucht …' : 'Barcode vollständig im Rahmen anzeigen'}</Text></View> : null}
          </View>
          <View style={styles.scannerFooter}><MaterialCommunityIcons name="database-search-outline" size={19} color={colors.textSecondary} /><Text style={styles.scannerFooterText}>Die Produktdaten werden nach dem Scan direkt bei Open Food Facts abgefragt.</Text></View>
        </SafeAreaView>
      </Modal>

      <Modal transparent visible={productOpen} animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setProductOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setProductOpen(false)} />
        <View style={styles.productSheet}>
          <SheetHandle onClose={() => setProductOpen(false)} />
          <View style={styles.productSheetHeader}><Text style={styles.sheetTitle}>Produkt eintragen</Text><IconButton icon="close" onPress={() => setProductOpen(false)} accessibilityLabel="Schließen" /></View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.productSheetContent}>
            {product ? <>
              <View style={styles.productHero}>{product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="contain" /> : <View style={styles.productImagePlaceholder}><MaterialCommunityIcons name="food-variant" size={34} color={colors.accent} /></View>}<View style={styles.flex1}><Text style={styles.productName}>{product.name}</Text>{product.brand ? <Text style={styles.productBrand}>{product.brand}</Text> : null}<Text style={styles.productBarcode}>{product.barcode}</Text></View></View>
              <View style={styles.productFacts}><View style={styles.fact}><Text style={styles.factValue}>{formatNumber(product.kcal100g)}</Text><Text style={styles.factLabel}>kcal / 100 g</Text></View><View style={styles.fact}><Text style={styles.factValue}>{formatNumber(product.protein100g, 1)} g</Text><Text style={styles.factLabel}>Eiweiß</Text></View><View style={styles.fact}><Text style={styles.factValue}>{formatNumber(product.carbs100g, 1)} g</Text><Text style={styles.factLabel}>Kohlenhydrate</Text></View><View style={styles.fact}><Text style={styles.factValue}>{formatNumber(product.fat100g, 1)} g</Text><Text style={styles.factLabel}>Fett</Text></View></View>
              <View style={styles.formGroup}><Text style={styles.formLabel}>Menge</Text><View style={styles.amountShell}><TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" selectTextOnFocus style={styles.amountInput} /><Text style={styles.amountUnit}>g / ml</Text></View>{product.servingSize ? <Text style={styles.formHint}>Open Food Facts Portion: {product.servingSize}</Text> : null}</View>
              <View style={styles.formGroup}><Text style={styles.formLabel}>Mahlzeit</Text><View style={styles.mealChips}>{MEALS.map((meal) => <Pressable key={meal.key} onPress={() => setMealType(meal.key)} style={[styles.mealChip, mealType === meal.key && styles.mealChipActive]}><Text style={[styles.mealChipText, mealType === meal.key && styles.mealChipTextActive]}>{meal.label}</Text></Pressable>)}</View></View>
              <SurfaceCard style={styles.liveSummary}><View><Text style={styles.liveSummaryLabel}>DIESE MENGE</Text><Text style={styles.liveCalories}>{formatNumber(productTotals.calories)} kcal</Text></View><View style={styles.liveMacros}><Text style={styles.liveMacro}>E {formatNumber(productTotals.proteinG, 1)} g</Text><Text style={styles.liveMacro}>KH {formatNumber(productTotals.carbsG, 1)} g</Text><Text style={styles.liveMacro}>F {formatNumber(productTotals.fatG, 1)} g</Text></View></SurfaceCard>
              <ActionButton label="Zum Tag hinzufügen" icon="check" onPress={addProduct} loading={savingProduct} disabled={amount <= 0} />
            </> : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal transparent visible={goalsOpen} animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setGoalsOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setGoalsOpen(false)} />
        <View style={styles.goalSheet}>
          <SheetHandle onClose={() => setGoalsOpen(false)} />
          <View style={styles.productSheetHeader}><View><Text style={styles.sheetEyebrow}>PERSÖNLICH</Text><Text style={styles.sheetTitle}>Tagesziele</Text></View><IconButton icon="close" onPress={() => setGoalsOpen(false)} accessibilityLabel="Schließen" /></View>
          <Text style={styles.formHint}>Diese Ziele gelten nur für dein Konto und werden nicht mit anderen Haushaltsmitgliedern geteilt.</Text>
          <View style={styles.goalGrid}>
            <View style={styles.goalField}><Text style={styles.formLabel}>Kalorien</Text><TextInput value={goalCalories} onChangeText={setGoalCalories} keyboardType="number-pad" style={styles.goalInput} /><Text style={styles.goalUnit}>kcal</Text></View>
            <View style={styles.goalField}><Text style={styles.formLabel}>Eiweiß</Text><TextInput value={goalProtein} onChangeText={setGoalProtein} keyboardType="decimal-pad" style={styles.goalInput} /><Text style={styles.goalUnit}>g</Text></View>
            <View style={styles.goalField}><Text style={styles.formLabel}>Kohlenhydrate</Text><TextInput value={goalCarbs} onChangeText={setGoalCarbs} keyboardType="decimal-pad" style={styles.goalInput} /><Text style={styles.goalUnit}>g</Text></View>
            <View style={styles.goalField}><Text style={styles.formLabel}>Fett</Text><TextInput value={goalFat} onChangeText={setGoalFat} keyboardType="decimal-pad" style={styles.goalInput} /><Text style={styles.goalUnit}>g</Text></View>
          </View>
          <ActionButton label="Ziele speichern" icon="content-save-outline" onPress={saveGoals} loading={savingGoals} />
        </View>
      </Modal>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    flex1: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 16 },
    dateNavigator: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 8 },
    dateButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surfaceMuted },
    dateButtonDisabled: { opacity: 0.45 },
    dateCenter: { alignItems: 'center' }, dateTitle: { ...typography.bodyStrong, color: colors.text }, dateSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
    energyCard: { padding: 20, gap: 17, overflow: 'hidden' },
    energyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
    energyEyebrow: { ...typography.label, color: colors.accent },
    energyRemaining: { fontSize: 36, lineHeight: 42, fontWeight: '800', color: colors.text, letterSpacing: -0.8, marginTop: 3 },
    energyRemainingLabel: { ...typography.caption, color: colors.textSecondary },
    goalButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 6 },
    goalButtonText: { ...typography.caption, color: colors.accent, fontWeight: '800' },
    energyNumbers: { flexDirection: 'row', alignItems: 'center', gap: 18 }, energyNumber: { ...typography.h2, color: colors.text }, energyNumberLabel: { ...typography.caption, color: colors.textSecondary }, energyDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: colors.border },
    calorieTrack: { height: 10, borderRadius: 6, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, calorieFill: { height: '100%', borderRadius: 6, backgroundColor: colors.accent },
    macroCard: { padding: 17, gap: 15 }, macroItem: { gap: 7 }, macroHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, macroLabel: { ...typography.caption, color: colors.text, fontWeight: '700' }, macroValue: { ...typography.caption, color: colors.textSecondary }, macroTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceMuted }, macroFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
    scanHero: { minHeight: 82, padding: 16, borderRadius: radius.lg, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 13, ...getShadow() }, scanHeroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }, scanHeroTitle: { ...typography.bodyStrong, color: '#FFFFFF' }, scanHeroText: { ...typography.caption, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
    loadingBlock: { alignItems: 'center', paddingVertical: 18, gap: 9 }, loadingPulse: { width: 28, height: 6, borderRadius: 3, backgroundColor: colors.accent }, loadingText: { ...typography.caption, color: colors.textSecondary },
    mealSection: { gap: 9 }, mealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, mealHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, mealIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, mealTitle: { ...typography.title, color: colors.text }, mealCalories: { ...typography.caption, color: colors.textSecondary }, mealAddButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    mealCard: { overflow: 'hidden' }, emptyMeal: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, emptyMealText: { ...typography.body, color: colors.textTertiary }, emptyMealAction: { ...typography.caption, color: colors.accent, fontWeight: '800' },
    foodRow: { minHeight: 68, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, foodRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, foodImage: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.surfaceMuted }, foodImagePlaceholder: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, foodName: { ...typography.bodyStrong, color: colors.text }, foodMeta: { fontSize: 11, lineHeight: 15, color: colors.textSecondary, marginTop: 2 }, foodRight: { alignItems: 'flex-end', minWidth: 48 }, foodCalories: { ...typography.bodyStrong, color: colors.text }, foodKcalLabel: { fontSize: 10, color: colors.textTertiary }, foodDelete: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    offAttribution: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 18, marginTop: 4 },
    scannerRoot: { flex: 1, backgroundColor: '#0B0D0C' }, scannerHeader: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background }, scannerHeaderText: { flex: 1, alignItems: 'center', paddingHorizontal: 8 }, scannerTitle: { ...typography.title, color: colors.text }, scannerSubtitle: { ...typography.caption, color: colors.textSecondary }, torchButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }, torchButtonActive: { backgroundColor: colors.accent }, cameraWrap: { flex: 1, overflow: 'hidden', backgroundColor: '#050505' }, scanGuide: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }, scanFrame: { width: '78%', height: 170, borderRadius: 24, borderWidth: 2, borderColor: '#FFFFFF', justifyContent: 'center', overflow: 'hidden' }, scanLine: { height: 2, backgroundColor: colors.accent, marginHorizontal: 14 }, scanHint: { marginTop: 18, color: '#FFFFFF', fontSize: 14, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, overflow: 'hidden' }, scannerFooter: { minHeight: 78, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.background }, scannerFooterText: { ...typography.caption, color: colors.textSecondary, flex: 1 }, permissionState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: colors.background }, permissionTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay }, sheetDismissZone: { minHeight: 28, alignItems: 'center', justifyContent: 'center' }, sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border },
    productSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%', backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 24 }, productSheetHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, productSheetContent: { paddingBottom: 6, gap: 17 }, sheetTitle: { ...typography.h2, color: colors.text }, sheetEyebrow: { ...typography.label, color: colors.accent },
    productHero: { flexDirection: 'row', alignItems: 'center', gap: 14 }, productImage: { width: 78, height: 78, borderRadius: 18, backgroundColor: colors.surfaceMuted }, productImagePlaceholder: { width: 78, height: 78, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, productName: { ...typography.title, color: colors.text }, productBrand: { ...typography.caption, color: colors.textSecondary, marginTop: 3 }, productBarcode: { fontSize: 11, color: colors.textTertiary, marginTop: 3 },
    productFacts: { flexDirection: 'row', gap: 7 }, fact: { flex: 1, minHeight: 68, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, factValue: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: colors.text, textAlign: 'center' }, factLabel: { fontSize: 9, lineHeight: 12, color: colors.textTertiary, textAlign: 'center', marginTop: 2 },
    formGroup: { gap: 8 }, formLabel: { ...typography.caption, color: colors.text, fontWeight: '800' }, formHint: { ...typography.caption, color: colors.textSecondary }, amountShell: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 14 }, amountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, paddingVertical: 12 }, amountUnit: { ...typography.body, color: colors.textSecondary },
    mealChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, mealChip: { minHeight: 39, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, mealChipActive: { backgroundColor: colors.accent }, mealChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, mealChipTextActive: { color: '#FFFFFF' },
    liveSummary: { padding: 15, gap: 10 }, liveSummaryLabel: { ...typography.label, color: colors.accent }, liveCalories: { ...typography.h2, color: colors.text, marginTop: 2 }, liveMacros: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, liveMacro: { ...typography.caption, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, overflow: 'hidden' },
    goalSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 26, gap: 14 }, goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, goalField: { width: '48%', minHeight: 98, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, goalInput: { fontSize: 24, fontWeight: '800', color: colors.text, paddingVertical: 6 }, goalUnit: { ...typography.caption, color: colors.textSecondary },
  });
}

let styles = createStyles();

export function refreshNutritionStyles() {
  styles = createStyles();
}
