from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# ---- cloud.ts ----
p = Path('src/lib/cloud.ts')
s = p.read_text()
s = replace_once(
    s,
    "export type MealDay = { plannedDate: string; day: string; meal: string | null };",
    "export type MealDay = { plannedDate: string; day: string; meal: string | null; mealSaskia: string | null };",
    'MealDay type',
)
s = replace_once(
    s,
    "type MealRow = { planned_date: string; meal: string | null };",
    "type MealRow = { planned_date: string; meal: string | null; meal_saskia: string | null };",
    'MealRow type',
)
s = replace_once(s, ".select('planned_date,meal')", ".select('planned_date,meal,meal_saskia')", 'meal select')
s = replace_once(
    s,
    "return { plannedDate, day: rawDay.charAt(0).toUpperCase() + rawDay.slice(1), meal: row.meal == null ? null : String(row.meal) };",
    "return { plannedDate, day: rawDay.charAt(0).toUpperCase() + rawDay.slice(1), meal: row.meal == null ? null : String(row.meal), mealSaskia: row.meal_saskia == null ? null : String(row.meal_saskia) };",
    'meal mapping',
)
s = replace_once(
    s,
    """  if (!clean) {
    const { error } = await requireCloud().from('meal_plan_entries').delete().eq('household_id', householdId).eq('planned_date', plannedDate);
    if (error) throw error;
    return;
  }
""",
    """  if (!clean) {
    const { error } = await requireCloud().from('meal_plan_entries').update({ meal: null }).eq('household_id', householdId).eq('planned_date', plannedDate);
    if (error) throw error;
    return;
  }
""",
    'main meal independent delete',
)
anchor = "\nexport async function loadOwnRecipes(): Promise<OwnRecipe[]> {"
addition = """

export async function saveSaskiaMeal(plannedDate: string, meal: string | null) {
  const householdId = await getActiveHouseholdId();
  const user = await requireUser();
  const clean = meal?.trim() || null;
  if (!clean) {
    const { error } = await requireCloud().from('meal_plan_entries').update({ meal_saskia: null }).eq('household_id', householdId).eq('planned_date', plannedDate);
    if (error) throw error;
    return;
  }
  const { error } = await requireCloud()
    .from('meal_plan_entries')
    .upsert({ household_id: householdId, owner_id: user.id, planned_date: plannedDate, meal: null, meal_saskia: clean }, { onConflict: 'household_id,planned_date' });
  if (error) throw error;
}
"""
if anchor not in s:
    raise SystemExit('missing anchor: saveSaskiaMeal insertion')
s = s.replace(anchor, addition + anchor, 1)
p.write_text(s)

# ---- App.tsx ----
p = Path('App.tsx')
s = p.read_text()
s = replace_once(s, "  saveMeal,\n", "  saveMeal,\n  saveSaskiaMeal,\n", 'saveSaskiaMeal import')

start = s.index('function PlanScreen(')
end = s.index('function ShoppingProductRow(', start)
new_plan = r'''function PlanScreen({ household, meals, saskiaMeals, setMeals, setSaskiaMeals, onSettings }: { household: Household; meals: Record<string, string>; saskiaMeals: Record<string, string>; setMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; setSaskiaMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<'main' | 'saskia'>('main');
  const [mealText, setMealText] = useState('');
  const weekDays = getWeekDays(1).map((entry) => ({
    ...entry,
    meal: meals[entry.iso]?.trim() ?? '',
    saskiaMeal: saskiaMeals[entry.iso]?.trim() ?? '',
  }));
  const plannedSlots = weekDays.reduce((count, entry) => count + (entry.meal ? 1 : 0) + (entry.saskiaMeal ? 1 : 0), 0);
  const remainingSlots = 14 - plannedSlots;
  const startDate = weekDays[0]!.date;
  const endDate = weekDays[6]!.date;
  const rangeLabel = `${startDate.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })} – ${endDate.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}`;

  const closeEditor = () => {
    setEditingDay(null);
    setEditingDate(null);
    setEditingSlot('main');
    setMealText('');
  };

  const openEditor = (day: string, plannedDate: string, slot: 'main' | 'saskia') => {
    setEditingDay(day);
    setEditingDate(plannedDate);
    setEditingSlot(slot);
    setMealText(slot === 'saskia' ? (saskiaMeals[plannedDate] ?? '') : (meals[plannedDate] ?? ''));
    Haptics.selectionAsync().catch(() => undefined);
  };

  const persist = async () => {
    if (!editingDate) return;
    const value = mealText.trim();
    const plannedDate = editingDate;
    const slot = editingSlot;
    if (slot === 'saskia') setSaskiaMeals((current) => ({ ...current, [plannedDate]: value }));
    else setMeals((current) => ({ ...current, [plannedDate]: value }));
    closeEditor();
    try {
      if (slot === 'saskia') await saveSaskiaMeal(plannedDate, value || null);
      else await saveMeal(plannedDate, value || null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Speichern nicht möglich', germanError(error?.message));
    }
  };

  const removePlan = async () => {
    if (!editingDate) return;
    const plannedDate = editingDate;
    const slot = editingSlot;
    if (slot === 'saskia') setSaskiaMeals((current) => ({ ...current, [plannedDate]: '' }));
    else setMeals((current) => ({ ...current, [plannedDate]: '' }));
    closeEditor();
    try {
      if (slot === 'saskia') await saveSaskiaMeal(plannedDate, null);
      else await saveMeal(plannedDate, null);
      Haptics.selectionAsync().catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Planung konnte nicht entfernt werden', germanError(error?.message));
    }
  };

  return <>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
      <ScreenHeader eyebrow={`${rangeLabel} · ${household.name}`} title="Wochenplan" subtitle="Pro Tag zwei Gerichte planen – ein gemeinsames Abendessen und eines für Saskia." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
      <SurfaceCard style={styles.weekOverviewCard}>
        <View style={styles.weekOverviewTop}><View><Text style={styles.weekOverviewLabel}>NÄCHSTE WOCHE</Text><Text style={styles.weekOverviewTitle}>{plannedSlots} von 14 Gerichten geplant</Text></View><View style={styles.weekOverviewBadge}><MaterialCommunityIcons name={remainingSlots === 0 ? 'check-all' : 'calendar-edit'} size={20} color={colors.accent} /><Text style={styles.weekOverviewBadgeText}>{remainingSlots === 0 ? 'Fertig' : `${remainingSlots} offen`}</Text></View></View>
        <View style={styles.weekProgressTrack}><View style={[styles.weekProgressFill, { width: `${Math.round((plannedSlots / 14) * 100)}%` as `${number}%` }]} /></View>
        <View style={styles.weekStrip}>{weekDays.map((entry) => <View key={entry.iso} style={styles.weekStripDay}><Text style={styles.weekStripDow}>{entry.day.slice(0, 2).toUpperCase()}</Text><Text style={styles.weekStripDate}>{entry.dayNumber}</Text><View style={styles.weekStripDots}><View style={[styles.weekStripDot, entry.meal ? styles.weekStripDotPlanned : styles.weekStripDotOpen]} /><View style={[styles.weekStripDot, entry.saskiaMeal ? styles.weekStripDotSaskia : styles.weekStripDotOpen]} /></View></View>)}</View>
      </SurfaceCard>

      <View style={styles.weekSectionHeader}><View><Text style={styles.weekSectionTitle}>Abendessen</Text><Text style={styles.weekSectionHint}>Zwei getrennte Gerichte pro Tag</Text></View><MaterialCommunityIcons name="silverware-fork-knife" size={22} color={colors.accent} /></View>

      <View style={styles.dayList}>{weekDays.map((entry) => {
        const dayPlanned = (entry.meal ? 1 : 0) + (entry.saskiaMeal ? 1 : 0);
        return <View key={entry.iso} style={styles.dayCard}>
          <View style={styles.dayDateBlock}><Text style={styles.dayDateDow}>{entry.day.slice(0, 2).toUpperCase()}</Text><Text style={styles.dayDateNumber}>{entry.dayNumber}</Text><Text style={styles.dayDateMonth}>{entry.monthShort}</Text></View>
          <View style={styles.dayCardContent}>
            <View style={styles.dayTitleRow}><Text style={styles.dayName}>{entry.day}</Text><Text style={[styles.dayStatusPill, dayPlanned === 2 ? styles.dayStatusPlanned : styles.dayStatusOpen]}>{dayPlanned}/2 geplant</Text></View>
            <View style={styles.dayMealSlots}>
              <Pressable onPress={() => openEditor(entry.day, entry.iso, 'main')} style={({ pressed }) => [styles.dayMealSlot, { opacity: pressed ? 0.72 : 1 }]}>
                <View style={styles.dayMealSlotHeader}><Text style={styles.dayMealSlotLabel}>ABENDESSEN</Text><MaterialCommunityIcons name={entry.meal ? 'pencil-outline' : 'plus'} size={16} color={colors.textSecondary} /></View>
                <Text style={[styles.dayMealSlotValue, !entry.meal && styles.dayMealSlotEmpty]} numberOfLines={2}>{entry.meal || 'Noch kein Gericht geplant'}</Text>
              </Pressable>
              <Pressable onPress={() => openEditor(entry.day, entry.iso, 'saskia')} style={({ pressed }) => [styles.dayMealSlot, styles.dayMealSlotSaskia, { opacity: pressed ? 0.72 : 1 }]}>
                <View style={styles.dayMealSlotHeader}><View style={styles.saskiaLabelRow}><MaterialCommunityIcons name="account-heart-outline" size={14} color={colors.accent} /><Text style={styles.dayMealSlotLabelSaskia}>FÜR SASKIA</Text></View><MaterialCommunityIcons name={entry.saskiaMeal ? 'pencil-outline' : 'plus'} size={16} color={colors.accent} /></View>
                <Text style={[styles.dayMealSlotValue, !entry.saskiaMeal && styles.dayMealSlotEmpty]} numberOfLines={2}>{entry.saskiaMeal || 'Noch kein Gericht für Saskia'}</Text>
              </Pressable>
            </View>
          </View>
        </View>;
      })}</View>
    </ScrollView>

    <Modal transparent visible={Boolean(editingDay)} animationType="fade" presentationStyle="overFullScreen" onRequestClose={closeEditor}>
      <KeyboardAvoidingView style={styles.modalFlex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.modalOverlay} onPress={closeEditor} />
        <View style={[styles.editorSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <SheetDismissHandle onClose={closeEditor} />
          <Text style={styles.editorEyebrow}>{editingSlot === 'saskia' ? 'FÜR SASKIA' : 'ABENDESSEN'}</Text>
          <Text style={styles.editorTitle}>{editingDay}</Text>
          <Text style={styles.fieldHint}>{editingDate ? new Date(`${editingDate}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' }) : ''}</Text>
          <Text style={styles.fieldLabel}>{editingSlot === 'saskia' ? 'Gericht für Saskia' : 'Gericht'}</Text>
          <TextInput autoFocus value={mealText} onChangeText={setMealText} placeholder={editingSlot === 'saskia' ? 'z. B. Pasta für Saskia' : 'z. B. Ofengemüse mit Feta'} placeholderTextColor={colors.textTertiary} style={styles.largeInput} returnKeyType="done" onSubmitEditing={persist} />
          <ActionButton label="Gericht speichern" icon="check" onPress={persist} />
          {editingDate && (editingSlot === 'saskia' ? saskiaMeals[editingDate] : meals[editingDate]) ? <ActionButton label={editingSlot === 'saskia' ? 'Gericht für Saskia entfernen' : 'Abendessen entfernen'} icon="calendar-remove-outline" variant="ghost" onPress={removePlan} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

'''
s = s[:start] + new_plan + s[end:]

s = replace_once(s, "  const [meals, setMeals] = useState<Record<string, string>>({});\n", "  const [meals, setMeals] = useState<Record<string, string>>({});\n  const [saskiaMeals, setSaskiaMeals] = useState<Record<string, string>>({});\n", 'saskia state')
s = replace_once(
    s,
    "    setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));\n",
    "    setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));\n    setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));\n",
    'startup saskia mapping',
)
s = replace_once(
    s,
    ".on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries', filter }, () => loadMealPlan().then((plan) => setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])))).catch(() => undefined))",
    ".on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries', filter }, () => loadMealPlan().then((plan) => { setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? '']))); setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? '']))); }).catch(() => undefined))",
    'realtime saskia mapping',
)
s = replace_once(
    s,
    "{tab === 'woche' ? <PlanScreen household={household} meals={meals} setMeals={setMeals} onSettings={() => setSettingsOpen(true)} /> : null}",
    "{tab === 'woche' ? <PlanScreen household={household} meals={meals} saskiaMeals={saskiaMeals} setMeals={setMeals} setSaskiaMeals={setSaskiaMeals} onSettings={() => setSettingsOpen(true)} /> : null}",
    'PlanScreen props',
)

s = replace_once(s, "weekStripDotOpen: { backgroundColor: colors.border },", "weekStripDotOpen: { backgroundColor: colors.border }, weekStripDots: { flexDirection: 'row', gap: 3 }, weekStripDotSaskia: { backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.surface },", 'week dots styles')
s = replace_once(s, "dayCard: { minHeight: 112,", "dayCard: { minHeight: 174,", 'day card height')
s = replace_once(
    s,
    "dayActionPlanned: { backgroundColor: colors.accentSoft },",
    "dayActionPlanned: { backgroundColor: colors.accentSoft }, dayMealSlots: { gap: 7 }, dayMealSlot: { minHeight: 58, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.surfaceMuted, gap: 3 }, dayMealSlotSaskia: { backgroundColor: colors.accentSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, dayMealSlotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, dayMealSlotLabel: { fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7, color: colors.textTertiary }, dayMealSlotLabelSaskia: { fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7, color: colors.accent }, saskiaLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, dayMealSlotValue: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: colors.text }, dayMealSlotEmpty: { color: colors.textTertiary, fontWeight: '700' },",
    'meal slot styles',
)
p.write_text(s)

# ---- version metadata ----
p = Path('app.json')
config = json.loads(p.read_text())
config['expo']['version'] = '2.2.5'
config['expo']['ios']['buildNumber'] = '17'
config['expo']['android']['versionCode'] = 17
p.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

p = Path('package.json')
package = json.loads(p.read_text())
package['version'] = '2.2.5'
p.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

# ---- changelog ----
p = Path('CHANGELOG.md')
ch = p.read_text()
entry = """# MealFlow Changelog

## 2.2.5

- Wochenplan unterstützt jetzt zwei getrennte Gerichte pro Tag.
- Das erste Feld bleibt das normale gemeinsame Abendessen.
- Das zweite Feld ist dauerhaft mit „Für Saskia“ gekennzeichnet.
- Beide Gerichte können unabhängig voneinander gespeichert, geändert und entfernt werden.
- Wochenübersicht zeigt den Fortschritt jetzt für 14 mögliche Gerichte statt 7 Tage.
- Realtime-Synchronisierung wurde auf beide Gerichte pro Datum erweitert.
- Version 2.2.5, iOS Build 17, Android Version Code 17.

"""
if ch.startswith('# MealFlow Changelog\n'):
    ch = entry + ch[len('# MealFlow Changelog\n\n'):]
else:
    ch = entry + ch
p.write_text(ch)
