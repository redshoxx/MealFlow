from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing pattern: {label}')
    return text.replace(old, new, 1)


app_path = Path('App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "import { BudgetScreen, refreshBudgetStyles } from './src/screens/BudgetScreen';",
    "import { NotesScreen, refreshNotesStyles } from './src/screens/NotesScreen';",
    'notes screen import',
)

app = replace_once(
    app,
    "function normalizeTitle(value: string) {",
    "function getPlanningMonthDays() {\n  return [1, 2, 3, 4].flatMap((weekOffset) => getWeekDays(weekOffset));\n}\n\nfunction normalizeTitle(value: string) {",
    'planning month helper',
)

app = app.replace('Haushalt · Einkauf · Woche · Budget', 'Haushalt · Einkauf · 4-Wochen-Plan · Notizen')
app = app.replace('Wochenplan, Einkaufsliste und Rezepte für deinen Haushalt – synchron auf iPhone und Android.', 'Wochenplan, Einkaufsliste und persönliche Notizen – synchron auf iPhone und Android.')

app = replace_once(
    app,
    "    { key: 'budget', label: 'Budget' },",
    "    { key: 'notizen', label: 'Notizen' },",
    'settings notes start tab',
)

old_home_planned = "  const planned = getWeekDays(1).filter((entry) => Boolean(meals[entry.iso])).length;"
new_home_planned = "  const planned = getPlanningMonthDays().filter((entry) => Boolean(meals[entry.iso])).length;"
app = replace_once(app, old_home_planned, new_home_planned, 'home month planned count')

app = replace_once(
    app,
    '<Text style={styles.metricNumber}>{planned}/7</Text><Text style={styles.metricLabel}>nächste Woche geplant</Text>',
    '<Text style={styles.metricNumber}>{planned}/28</Text><Text style={styles.metricLabel}>nächste 4 Wochen geplant</Text>',
    'home month metric',
)

old_quick = '<Pressable style={styles.quickAction} onPress={() => onNavigate(\'budget\')}><View style={styles.quickIcon}><MaterialCommunityIcons name="wallet-outline" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Budget</Text><Text style={styles.quickText}>Einkauf schätzen und Monatsbudget prüfen.</Text></Pressable>'
new_quick = '<Pressable style={styles.quickAction} onPress={() => onNavigate(\'notizen\')}><View style={styles.quickIcon}><MaterialCommunityIcons name="note-text-outline" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Notizen</Text><Text style={styles.quickText}>Privat festhalten und einzelne Notizen gezielt teilen.</Text></Pressable>'
app = replace_once(app, old_quick, new_quick, 'home notes quick action')

start = app.index('function PlanScreen(')
end = app.index('\nfunction ShoppingProductRow(', start)
new_plan = r'''function PlanScreen({ household, meals, saskiaMeals, setMeals, setSaskiaMeals, onSettings }: { household: Household; meals: Record<string, string>; saskiaMeals: Record<string, string>; setMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; setSaskiaMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<'main' | 'saskia'>('main');
  const [mealText, setMealText] = useState('');

  const planningWeeks = [1, 2, 3, 4].map((weekOffset) => getWeekDays(weekOffset).map((entry) => ({
    ...entry,
    meal: meals[entry.iso]?.trim() ?? '',
    saskiaMeal: saskiaMeals[entry.iso]?.trim() ?? '',
  })));
  const allDays = planningWeeks.flat();
  const totalSlots = allDays.length * 2;
  const plannedSlots = allDays.reduce((count, entry) => count + (entry.meal ? 1 : 0) + (entry.saskiaMeal ? 1 : 0), 0);
  const remainingSlots = totalSlots - plannedSlots;
  const startDate = allDays[0]!.date;
  const endDate = allDays[allDays.length - 1]!.date;
  const rangeLabel = `${startDate.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })} – ${endDate.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}`;
  const selectedWeekDays = planningWeeks[selectedWeek] ?? planningWeeks[0]!;
  const selectedStart = selectedWeekDays[0]!.date;
  const selectedEnd = selectedWeekDays[6]!.date;
  const selectedRangeLabel = `${selectedStart.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })} – ${selectedEnd.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}`;

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
      <ScreenHeader eyebrow={`${rangeLabel} · ${household.name}`} title="4-Wochen-Plan" subtitle="Vier Wochen im Voraus planen – pro Tag ein gemeinsames Abendessen und ein Gericht für Saskia." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
      <SurfaceCard style={styles.weekOverviewCard}>
        <View style={styles.weekOverviewTop}><View style={styles.flex1}><Text style={styles.weekOverviewLabel}>NÄCHSTE 4 WOCHEN</Text><Text style={styles.weekOverviewTitle}>{plannedSlots} von {totalSlots} Gerichten geplant</Text></View><View style={styles.weekOverviewBadge}><MaterialCommunityIcons name={remainingSlots === 0 ? 'check-all' : 'calendar-month-outline'} size={20} color={colors.accent} /><Text style={styles.weekOverviewBadgeText}>{remainingSlots === 0 ? 'Fertig' : `${remainingSlots} offen`}</Text></View></View>
        <View style={styles.weekProgressTrack}><View style={[styles.weekProgressFill, { width: `${Math.round((plannedSlots / totalSlots) * 100)}%` as `${number}%` }]} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthWeekSelector}>
          {planningWeeks.map((days, index) => {
            const weekPlanned = days.reduce((count, entry) => count + (entry.meal ? 1 : 0) + (entry.saskiaMeal ? 1 : 0), 0);
            const active = selectedWeek === index;
            const first = days[0]!.date;
            const last = days[6]!.date;
            return <Pressable key={index} onPress={() => setSelectedWeek(index)} style={[styles.monthWeekChip, active && styles.monthWeekChipActive]}>
              <View style={styles.monthWeekChipTop}><Text style={[styles.monthWeekChipLabel, active && styles.monthWeekChipLabelActive]}>WOCHE {index + 1}</Text><Text style={[styles.monthWeekChipCount, active && styles.monthWeekChipCountActive]}>{weekPlanned}/14</Text></View>
              <Text style={[styles.monthWeekChipRange, active && styles.monthWeekChipRangeActive]}>{first.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })} – {last.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}</Text>
            </Pressable>;
          })}
        </ScrollView>
        <View style={styles.weekStrip}>{selectedWeekDays.map((entry) => <View key={entry.iso} style={styles.weekStripDay}><Text style={styles.weekStripDow}>{entry.day.slice(0, 2).toUpperCase()}</Text><Text style={styles.weekStripDate}>{entry.dayNumber}</Text><View style={styles.weekStripDots}><View style={[styles.weekStripDot, entry.meal ? styles.weekStripDotPlanned : styles.weekStripDotOpen]} /><View style={[styles.weekStripDot, entry.saskiaMeal ? styles.weekStripDotSaskia : styles.weekStripDotOpen]} /></View></View>)}</View>
      </SurfaceCard>

      <View style={styles.weekSectionHeader}><View><Text style={styles.weekSectionTitle}>Woche {selectedWeek + 1} von 4</Text><Text style={styles.weekSectionHint}>{selectedRangeLabel} · zwei Gerichte pro Tag</Text></View><MaterialCommunityIcons name="calendar-week" size={22} color={colors.accent} /></View>

      <View style={styles.dayList}>{selectedWeekDays.map((entry) => {
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
app = app[:start] + new_plan + app[end:]

app = replace_once(
    app,
    "  const [undoItem, setUndoItem] = useState<ShoppingItem | null>(null);",
    "  const [undoItem, setUndoItem] = useState<ShoppingItem | null>(null);\n  const [completedExpanded, setCompletedExpanded] = useState(false);",
    'completed shopping collapse state',
)

old_completed = "      {preferences.showCompletedShopping && completed.length ? <><SectionTitle title={`Erledigt · ${completed.length}`} /><SurfaceCard style={styles.listCard}>{completedSorted.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onEdit={openEdit} onDelete={remove} />)}</SurfaceCard></> : null}"
new_completed = """      {preferences.showCompletedShopping && completed.length ? <View style={styles.completedSection}>
        <Pressable accessibilityRole=\"button\" accessibilityState={{ expanded: completedExpanded }} onPress={() => setCompletedExpanded((value) => !value)} style={({ pressed }) => [styles.completedToggle, pressed && { opacity: 0.72 }]}>
          <View style={styles.completedToggleLeft}><View style={styles.completedToggleIcon}><MaterialCommunityIcons name=\"check-all\" size={19} color={colors.accent} /></View><View><Text style={styles.completedToggleTitle}>Erledigt</Text><Text style={styles.completedToggleMeta}>{completed.length} {completed.length === 1 ? 'Produkt' : 'Produkte'}</Text></View></View>
          <MaterialCommunityIcons name={completedExpanded ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textTertiary} />
        </Pressable>
        {completedExpanded ? <SurfaceCard style={styles.listCard}>{completedSorted.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onEdit={openEdit} onDelete={remove} />)}</SurfaceCard> : null}
      </View> : null}"""
app = replace_once(app, old_completed, new_completed, 'completed shopping collapsible section')

app = replace_once(
    app,
    "    { key: 'budget', label: 'Budget', icon: 'wallet-outline', active: 'wallet' },",
    "    { key: 'notizen', label: 'Notizen', icon: 'note-text-outline', active: 'note-text' },",
    'tabbar notes tab',
)

app = replace_once(
    app,
    "        {tab === 'budget' ? <BudgetScreen household={household} items={items} onSettings={() => setSettingsOpen(true)} /> : null}",
    "        {tab === 'notizen' ? <NotesScreen household={household} onSettings={() => setSettingsOpen(true)} /> : null}",
    'main notes screen',
)

app = replace_once(
    app,
    "  refreshBudgetStyles();",
    "  refreshNotesStyles();",
    'refresh notes styles',
)

style_anchor = "  recipeWizardFooter: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },"
style_add = style_anchor + """
  monthWeekSelector: { gap: 8, paddingTop: 14, paddingBottom: 6, paddingRight: 4 },
  monthWeekChip: { width: 132, minHeight: 64, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 11, paddingVertical: 9, gap: 5 },
  monthWeekChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  monthWeekChipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  monthWeekChipLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '800' },
  monthWeekChipLabelActive: { color: colors.accent },
  monthWeekChipCount: { fontSize: 10, fontWeight: '800', color: colors.textTertiary },
  monthWeekChipCountActive: { color: colors.accent },
  monthWeekChipRange: { fontSize: 11, color: colors.textSecondary },
  monthWeekChipRangeActive: { color: colors.text },
  completedSection: { gap: 8, marginTop: 4 },
  completedToggle: { minHeight: 58, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completedToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  completedToggleIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  completedToggleTitle: { ...typography.bodyStrong, color: colors.text },
  completedToggleMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 1 },"""
app = replace_once(app, style_anchor, style_add, 'new month and completed styles')

app_path.write_text(app)

cloud_path = Path('src/lib/cloud.ts')
cloud = cloud_path.read_text()
old_range = '''  const from = new Date();
  from.setDate(from.getDate() - 8);
  const until = new Date();
  until.setDate(until.getDate() + 22);'''
new_range = '''  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const from = new Date(now);
  from.setDate(now.getDate() - 1);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + 7);
  const until = new Date(nextMonday);
  until.setDate(nextMonday.getDate() + 27);'''
cloud = replace_once(cloud, old_range, new_range, 'four week meal load range')
cloud_path.write_text(cloud)

# Version metadata.
def update_json(path: str, mutate):
    p = Path(path)
    data = json.loads(p.read_text())
    mutate(data)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

update_json('package.json', lambda data: data.__setitem__('version', '2.3.1'))

def mutate_app(data):
    expo = data['expo']
    expo['version'] = '2.3.1'
    expo['ios']['buildNumber'] = '25'
    expo['android']['versionCode'] = 25
update_json('app.json', mutate_app)

def mutate_lock(data):
    data['version'] = '2.3.1'
    if '' in data.get('packages', {}):
        data['packages']['']['version'] = '2.3.1'
update_json('package-lock.json', mutate_lock)

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
entry = '''## 2.3.1\n\n- Erledigte Produkte der Einkaufsliste lassen sich kompakt ein- und ausklappen.\n- Neues professionelles MealFlow-App-Icon mit klarer Teller-/Planungs-Symbolik.\n- Wochenplan wurde zum 4-Wochen-Plan erweitert und hält die nächsten 28 Tage gleichzeitig vor.\n- Budget in der Hauptnavigation wurde durch persönliche Notizen ersetzt.\n- Notizen sind standardmäßig nur für den jeweiligen Benutzer sichtbar.\n- Einzelne Notizen können gezielt mit anderen Mitgliedern desselben Haushalts geteilt werden; Bearbeiten und Löschen bleibt beim Besitzer.\n- Version 2.3.1, iOS Build 25, Android Version Code 25.\n\n'''
if '## 2.3.1' not in changelog:
    marker = '# MealFlow Changelog\n\n'
    changelog = replace_once(changelog, marker, marker + entry, 'changelog header')
    changelog_path.write_text(changelog)

print('MealFlow 2.3.1 application patch applied')
