from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app_path = Path('App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "  updateMyDisplayName,\n  type Household,",
    "  updateMyDisplayName,\n  updateShoppingItem,\n  type Household,",
    'update shopping import',
)

start = app.index('function ShoppingProductRow(')
end = app.index('\nfunction ShoppingScreen(', start)
new_row = r'''function ShoppingProductRow({ item, compact, onToggle, onEdit, onDelete }: { item: ShoppingItem; compact: boolean; onToggle: (item: ShoppingItem) => void; onEdit: (item: ShoppingItem) => void; onDelete: (item: ShoppingItem) => void }) {
  const meta = [`${formatAmount(item.amount)} ${item.unit}`, item.addedByName ? `von ${item.addedByName}` : null, item.done && item.completedByName ? `erledigt von ${item.completedByName}` : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.shoppingRowV214, compact && styles.shoppingRowCompact]}>
      <Pressable accessibilityLabel={item.done ? `${item.name} als offen markieren` : `${item.name} als erledigt markieren`} onPress={() => onToggle(item)} style={[styles.checkbox, item.done && styles.checkboxDone]}>
        {item.done ? <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" /> : null}
      </Pressable>
      <View style={styles.flex1}>
        <Text style={[styles.shoppingName, item.done && styles.shoppingNameDone]} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.shoppingMetaTiny} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={styles.shoppingRowActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name} bearbeiten`}
          hitSlop={7}
          onPress={() => onEdit(item)}
          style={({ pressed }) => [styles.shoppingMiniAction, pressed && styles.shoppingMiniActionPressed]}
        >
          <MaterialCommunityIcons name="pencil-outline" size={17} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name} löschen`}
          hitSlop={7}
          onPress={() => onDelete(item)}
          style={({ pressed }) => [styles.shoppingMiniAction, styles.shoppingMiniDelete, pressed && styles.shoppingMiniDeletePressed]}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}
'''
app = app[:start] + new_row + app[end:]

app = replace_once(
    app,
    "  const [addOpen, setAddOpen] = useState(false);\n  const [name, setName] = useState('');",
    "  const [addOpen, setAddOpen] = useState(false);\n  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);\n  const [name, setName] = useState('');",
    'editing item state',
)

old_open = '''  const openAdd = () => {
    setName('');
    setAmount(1);
    setUnit('Stk.');
    setAddOpen(true);
    feedback();
  };
'''
new_open = '''  const openAdd = () => {
    setEditingItem(null);
    setName('');
    setAmount(1);
    setUnit('Stk.');
    setAddOpen(true);
    feedback();
  };

  const openEdit = (item: ShoppingItem) => {
    setEditingItem(item);
    setName(item.name);
    setAmount(item.amount);
    setUnit(item.unit);
    setAddOpen(true);
    feedback();
  };

  const closeProductEditor = () => {
    setAddOpen(false);
    setEditingItem(null);
    setRecognizing(false);
  };
'''
app = replace_once(app, old_open, new_open, 'shopping editor open handlers')

old_add = '''  const add = async (overrideName?: string) => {
    const cleanName = (overrideName ?? name).trim();
    if (!cleanName) return;
    const temporary: ShoppingItem = {
      id: `local-${Date.now()}`,
      name: cleanName,
      amount,
      unit,
      done: false,
      addedByName: household.myDisplayName,
    };
    setItems((current) => [temporary, ...current]);
    setAddOpen(false);
    setName('');
    if (preferences.hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const remote = await addShoppingItem({ name: cleanName, amount, unit });
      setItems((current) => current.map((item) => item.id === temporary.id ? remote : item));
    } catch (error: any) {
      setItems((current) => current.filter((item) => item.id !== temporary.id));
      Alert.alert('Produkt konnte nicht gespeichert werden', germanError(error?.message));
    }
  };
'''
new_add = '''  const add = async (overrideName?: string) => {
    const cleanName = (overrideName ?? name).trim();
    if (!cleanName) return;

    if (editingItem) {
      const previous = editingItem;
      const optimistic: ShoppingItem = { ...previous, name: cleanName, amount, unit };
      setItems((current) => current.map((item) => item.id === previous.id ? optimistic : item));
      closeProductEditor();
      if (preferences.hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      try {
        const remote = await updateShoppingItem(previous.id, { name: cleanName, amount, unit });
        setItems((current) => current.map((item) => item.id === previous.id ? remote : item));
      } catch (error: any) {
        setItems((current) => current.map((item) => item.id === previous.id ? previous : item));
        Alert.alert('Änderung nicht gespeichert', germanError(error?.message));
      }
      return;
    }

    const temporary: ShoppingItem = {
      id: `local-${Date.now()}`,
      name: cleanName,
      amount,
      unit,
      done: false,
      addedByName: household.myDisplayName,
    };
    setItems((current) => [temporary, ...current]);
    closeProductEditor();
    setName('');
    if (preferences.hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const remote = await addShoppingItem({ name: cleanName, amount, unit });
      setItems((current) => current.map((item) => item.id === temporary.id ? remote : item));
    } catch (error: any) {
      setItems((current) => current.filter((item) => item.id !== temporary.id));
      Alert.alert('Produkt konnte nicht gespeichert werden', germanError(error?.message));
    }
  };
'''
app = replace_once(app, old_add, new_add, 'shopping add/edit save')

app = app.replace(
    'item={item} compact={preferences.compactShopping} onToggle={toggle} onDelete={remove}',
    'item={item} compact={preferences.compactShopping} onToggle={toggle} onEdit={openEdit} onDelete={remove}'
)

app = replace_once(
    app,
    '<Modal transparent visible={addOpen} animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setAddOpen(false)}>',
    '<Modal transparent visible={addOpen} animationType="fade" presentationStyle="overFullScreen" onRequestClose={closeProductEditor}>',
    'shopping modal close',
)
app = replace_once(
    app,
    '<Pressable style={styles.modalOverlay} onPress={() => setAddOpen(false)} />\n        <View style={[styles.shoppingAddSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} renderToHardwareTextureAndroid>\n          <SheetDismissHandle onClose={() => setAddOpen(false)} />',
    '<Pressable style={styles.modalOverlay} onPress={closeProductEditor} />\n        <View style={[styles.shoppingAddSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} renderToHardwareTextureAndroid>\n          <SheetDismissHandle onClose={closeProductEditor} />',
    'shopping sheet dismiss',
)
app = replace_once(
    app,
    '<View style={styles.shoppingSheetHeader}><View><Text style={styles.editorEyebrow}>EINKAUF</Text><Text style={styles.editorTitle}>Produkt hinzufügen</Text></View><IconButton icon="close" onPress={() => setAddOpen(false)} accessibilityLabel="Schließen" /></View>',
    '<View style={styles.shoppingSheetHeader}><View><Text style={styles.editorEyebrow}>{editingItem ? \'PRODUKT BEARBEITEN\' : \'EINKAUF\'}</Text><Text style={styles.editorTitle}>{editingItem ? \'Produkt ändern\' : \'Produkt hinzufügen\'}</Text></View><IconButton icon="close" onPress={closeProductEditor} accessibilityLabel="Schließen" /></View>',
    'shopping sheet header',
)
app = replace_once(
    app,
    '<ActionButton label="Zur Einkaufsliste hinzufügen" icon="plus" onPress={() => add()} disabled={!name.trim()} />',
    '<ActionButton label={editingItem ? "Änderungen speichern" : "Zur Einkaufsliste hinzufügen"} icon={editingItem ? "check" : "plus"} onPress={() => add()} disabled={!name.trim()} />',
    'shopping sheet action',
)

app = replace_once(
    app,
    "  shoppingMetaTiny: { fontSize: 11, lineHeight: 15, color: colors.textTertiary, marginTop: 1 },",
    "  shoppingMetaTiny: { fontSize: 11, lineHeight: 15, color: colors.textTertiary, marginTop: 1 },\n  shoppingRowActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },\n  shoppingMiniAction: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },\n  shoppingMiniActionPressed: { opacity: 0.68 },\n  shoppingMiniDelete: { backgroundColor: colors.surfaceMuted },\n  shoppingMiniDeletePressed: { backgroundColor: colors.dangerSoft, opacity: 0.72 },",
    'shopping edit styles',
)

# Prevent stale shopping realtime responses from overwriting newer list state.
app = replace_once(
    app,
    "  const loadGeneration = useRef(0);",
    "  const loadGeneration = useRef(0);\n  const shoppingLoadGeneration = useRef(0);",
    'shopping load generation ref',
)

old_realtime = ".on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, () => schedule('shopping', () => { withTimeout(loadShopping(), 6000, 'Einkaufsliste').then(setItems).catch(() => undefined); }))"
new_realtime = ".on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, () => schedule('shopping', () => { const request = ++shoppingLoadGeneration.current; withTimeout(loadShopping(), 6000, 'Einkaufsliste').then((next) => { if (request === shoppingLoadGeneration.current) setItems(next); }).catch(() => undefined); }))"
app = replace_once(app, old_realtime, new_realtime, 'shopping realtime stale guard')

# If startup shopping fetch fails transiently, retry once in background instead of leaving the list empty.
old_startup_set = "    if (shoppingResult.status === 'fulfilled') setItems(shoppingResult.value);\n    if (planResult.status === 'fulfilled') {"
new_startup_set = "    if (shoppingResult.status === 'fulfilled') {\n      shoppingLoadGeneration.current += 1;\n      setItems(shoppingResult.value);\n    } else {\n      const retryRequest = ++shoppingLoadGeneration.current;\n      setTimeout(() => {\n        withTimeout(loadShopping(), 6500, 'Einkaufsliste').then((next) => {\n          if (retryRequest === shoppingLoadGeneration.current) setItems(next);\n        }).catch(() => undefined);\n      }, 700);\n    }\n    if (planResult.status === 'fulfilled') {"
app = replace_once(app, old_startup_set, new_startup_set, 'shopping startup retry')

app_path.write_text(app)

cloud_path = Path('src/lib/cloud.ts')
cloud = cloud_path.read_text()

old_load = '''export async function loadShopping(): Promise<ShoppingItem[]> {
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from('shopping_items')
    .select('id,owner_id,name,amount,unit,done,completed_by,completed_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as ShoppingRow[];
  const names = await loadProfileNames(rows.flatMap((row) => [row.completed_by ?? '', row.owner_id ?? '']).filter(Boolean));
  return rows.map((row) => toShoppingItem(row, names));
}
'''
new_load = '''export async function loadShopping(): Promise<ShoppingItem[]> {
  const householdId = await getActiveHouseholdId();
  const pageSize = 500;
  const rows: ShoppingRow[] = [];

  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('id,owner_id,name,amount,unit,done,completed_by,completed_at')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as ShoppingRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  // Displaying shopping products must never depend on optional profile-name metadata.
  const names = await loadProfileNames(rows.flatMap((row) => [row.completed_by ?? '', row.owner_id ?? '']).filter(Boolean)).catch(() => new Map<string, string>());
  return rows.map((row) => toShoppingItem(row, names));
}
'''
cloud = replace_once(cloud, old_load, new_load, 'robust loadShopping')

insert_before = '''export async function setShoppingDone(id: string, done: boolean) {'''
update_fn = '''export async function updateShoppingItem(id: string, input: { name: string; amount: number; unit: string }): Promise<ShoppingItem> {
  const householdId = await getActiveHouseholdId();
  const cleanName = input.name.trim().slice(0, 120);
  const cleanUnit = input.unit.trim().slice(0, 24);
  const cleanAmount = Number(input.amount);
  if (!cleanName) throw new Error('Bitte gib einen Produktnamen ein.');
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0 || cleanAmount > 9999) throw new Error('Bitte gib eine gültige Menge ein.');
  if (!cleanUnit) throw new Error('Bitte wähle eine Einheit aus.');

  const { data, error } = await requireCloud()
    .from('shopping_items')
    .update({ name: cleanName, amount: cleanAmount, unit: cleanUnit })
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id,owner_id,name,amount,unit,done,completed_by,completed_at')
    .single();
  if (error) throw error;
  const row = data as ShoppingRow;
  const names = await loadProfileNames([row.owner_id ?? '', row.completed_by ?? ''].filter(Boolean)).catch(() => new Map<string, string>());
  return toShoppingItem(row, names);
}

'''
cloud = replace_once(cloud, insert_before, update_fn + insert_before, 'updateShoppingItem function')
cloud_path.write_text(cloud)

package_path = Path('package.json')
package = json.loads(package_path.read_text())
package['version'] = '2.2.8'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

app_json_path = Path('app.json')
config = json.loads(app_json_path.read_text())
config['expo']['version'] = '2.2.8'
config['expo']['ios']['buildNumber'] = '21'
config['expo']['android']['versionCode'] = 21
app_json_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
section = '''## 2.2.8

- Produkte in der Einkaufsliste können direkt über das kleine Stift-Symbol bearbeitet werden.
- Name, Menge und Einheit lassen sich im bestehenden iPhone-artigen Bottom-Sheet ändern.
- Änderungen werden optimistisch angezeigt und bei einem Serverfehler sauber zurückgesetzt.
- Einkaufsliste wird stabil paginiert geladen, sodass auch größere Listen vollständig ankommen.
- Fehler beim optionalen Laden von Mitgliedsnamen können die Produktliste nicht mehr ausblenden.
- Veraltete Realtime-Antworten werden ignoriert, damit neuere Listenzustände nicht überschrieben werden.
- Fehlgeschlagene Startabfragen der Einkaufsliste erhalten automatisch einen Hintergrund-Retry.
- Version 2.2.8, iOS Build 21, Android Version Code 21.

'''
if '## 2.2.8' not in changelog:
    changelog = changelog.replace('# MealFlow Changelog\n\n', '# MealFlow Changelog\n\n' + section, 1)
changelog_path.write_text(changelog)

print('MealFlow 2.2.8 patch applied')
