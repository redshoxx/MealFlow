from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app_path = Path('App.tsx')
app = app_path.read_text()

# Lidl-oriented automatic categorisation. Categories are derived at render time,
# so existing items and renamed items are immediately classified without a DB migration.
category_block = r'''
type LidlCategoryKey =
  | 'produce'
  | 'bakery'
  | 'dairy'
  | 'meat-fish'
  | 'staples'
  | 'pantry'
  | 'breakfast'
  | 'snacks'
  | 'drinks'
  | 'frozen'
  | 'household'
  | 'other';

const LIDL_CATEGORY_ORDER: Array<{ key: LidlCategoryKey; label: string }> = [
  { key: 'produce', label: 'Obst & Gemüse' },
  { key: 'bakery', label: 'Backwaren' },
  { key: 'dairy', label: 'Kühlung & Milchprodukte' },
  { key: 'meat-fish', label: 'Fleisch, Wurst & Fisch' },
  { key: 'staples', label: 'Grundnahrungsmittel' },
  { key: 'pantry', label: 'Konserven & Saucen' },
  { key: 'breakfast', label: 'Frühstück' },
  { key: 'snacks', label: 'Snacks & Süßes' },
  { key: 'drinks', label: 'Getränke' },
  { key: 'frozen', label: 'Tiefkühlung' },
  { key: 'household', label: 'Haushalt & Drogerie' },
  { key: 'other', label: 'Sonstiges' },
];

const LIDL_CATEGORY_KEYWORDS: Record<LidlCategoryKey, string[]> = {
  produce: ['apfel', 'banane', 'tomate', 'gurke', 'paprika', 'kartoffel', 'erdapfel', 'zwiebel', 'knoblauch', 'salat', 'zucchini', 'karotte', 'mohre', 'brokkoli', 'blumenkohl', 'avocado', 'zitrone', 'orange', 'mandarine', 'traube', 'beere', 'erdbeer', 'himbeer', 'heidelbeer', 'pilz', 'champignon', 'lauch', 'sellerie', 'kohl', 'kraut', 'kurbis', 'spinat', 'mango', 'kiwi', 'birne', 'obst', 'gemuse'],
  bakery: ['brot', 'semmel', 'brotchen', 'toast', 'baguette', 'ciabatta', 'croissant', 'weckerl', 'geback', 'backware'],
  dairy: ['milch', 'butter', 'joghurt', 'yogurt', 'kase', 'quark', 'topfen', 'sahne', 'obers', 'creme fraiche', 'mozzarella', 'feta', 'pudding', 'kefir', 'mascarpone', 'ei', 'eier'],
  'meat-fish': ['fleisch', 'huhn', 'hendl', 'hahnchen', 'chicken', 'rind', 'schwein', 'hackfleisch', 'faschiert', 'wurst', 'schinken', 'speck', 'salami', 'fisch', 'lachs', 'forelle', 'garnelen'],
  staples: ['nudel', 'pasta', 'reis', 'mehl', 'zucker', 'salz', 'ol', 'essig', 'couscous', 'bulgur', 'linsen', 'kichererbse', 'gewurz', 'bruhe', 'gries', 'polenta'],
  pantry: ['passierte tomate', 'dosentomate', 'tomatenmark', 'konserve', 'ketchup', 'mayonnaise', 'mayo', 'senf', 'sauce', 'pesto', 'kokosmilch', 'dose', 'mais', 'bohnen'],
  breakfast: ['musli', 'haferflock', 'cornflakes', 'cerealien', 'marmelade', 'honig', 'nusscreme', 'nutella', 'kaffee', 'tee'],
  snacks: ['schokolade', 'chips', 'keks', 'gummibar', 'nusse', 'nuss', 'popcorn', 'riegel', 'bonbon', 'sussigkeit', 'cracker'],
  drinks: ['wasser', 'mineral', 'cola', 'limonade', 'limo', 'saft', 'eistee', 'energy', 'bier', 'wein', 'prosecco', 'sirup', 'getrank'],
  frozen: ['tiefkuhl', 'tiefgekuhlt', 'tk ', 'eiscreme', 'speiseeis', 'pommes', 'frozen'],
  household: ['toilettenpapier', 'kuchenrolle', 'waschmittel', 'spulmittel', 'reiniger', 'mullbeutel', 'alufolie', 'frischhaltefolie', 'schwamm', 'zahnpasta', 'zahnburste', 'shampoo', 'duschgel', 'seife', 'deodorant', 'deo', 'rasierer', 'windel', 'katzenstreu', 'hundefutter', 'katzenfutter'],
  other: [],
};
'''

if 'const LIDL_CATEGORY_ORDER' not in app:
    app = replace_once(app, 'type Tab = StartTab;', category_block + '\ntype Tab = StartTab;', 'Lidl category constants')

helper_block = r'''
function getLidlCategory(name: string): LidlCategoryKey {
  const normalized = normalizeTitle(name);

  // More specific packaged-food terms must win over generic words such as "Tomate".
  const priority: LidlCategoryKey[] = ['frozen', 'household', 'pantry', 'meat-fish', 'dairy', 'bakery', 'breakfast', 'snacks', 'drinks', 'staples', 'produce'];
  for (const key of priority) {
    if (LIDL_CATEGORY_KEYWORDS[key].some((keyword) => normalized.includes(keyword))) return key;
  }
  return 'other';
}

function groupShoppingForLidl(items: ShoppingItem[]) {
  const grouped = new Map<LidlCategoryKey, ShoppingItem[]>();
  for (const item of items) {
    const key = getLidlCategory(item.name);
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }

  return LIDL_CATEGORY_ORDER
    .map((category) => ({
      ...category,
      items: (grouped.get(category.key) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'de-AT')),
    }))
    .filter((category) => category.items.length > 0);
}

function sortShoppingForLidl(items: ShoppingItem[]) {
  const categoryIndex = new Map(LIDL_CATEGORY_ORDER.map((category, index) => [category.key, index]));
  return items.slice().sort((a, b) => {
    const categoryDelta = (categoryIndex.get(getLidlCategory(a.name)) ?? 999) - (categoryIndex.get(getLidlCategory(b.name)) ?? 999);
    return categoryDelta || a.name.localeCompare(b.name, 'de-AT');
  });
}
'''

if 'function getLidlCategory(' not in app:
    marker = "function lastCookedLabel(entry?: MealHistoryEntry) {"
    app = replace_once(app, marker, helper_block + '\n' + marker, 'Lidl category helpers')

# Shopping screen: calculate groups once and keep completed products consistently sorted.
if 'const activeGroups = useMemo(() => groupShoppingForLidl(active)' not in app:
    app = replace_once(
        app,
        "  const active = useMemo(() => items.filter((item) => !item.done), [items]);\n  const completed = useMemo(() => items.filter((item) => item.done), [items]);",
        "  const active = useMemo(() => items.filter((item) => !item.done), [items]);\n  const completed = useMemo(() => items.filter((item) => item.done), [items]);\n  const activeGroups = useMemo(() => groupShoppingForLidl(active), [active]);\n  const completedSorted = useMemo(() => sortShoppingForLidl(completed), [completed]);",
        'shopping Lidl groups',
    )

old_open = '''      <SectionTitle title="Offen" />
      {active.length ? <SurfaceCard style={styles.listCard}>{active.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onEdit={openEdit} onDelete={remove} />)}</SurfaceCard> : <SurfaceCard><EmptyState icon="cart-check" title="Alles erledigt" text="Eure gemeinsame Einkaufsliste ist aktuell leer." actionLabel="Produkt hinzufügen" onAction={openAdd} /></SurfaceCard>}

      {preferences.showCompletedShopping && completed.length ? <><SectionTitle title={`Erledigt · ${completed.length}`} /><SurfaceCard style={styles.listCard}>{completed.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onEdit={openEdit} onDelete={remove} />)}</SurfaceCard></> : null}
'''
new_open = '''      <SectionTitle title="Offen" />
      {active.length ? <View style={styles.shoppingCategoryList}>{activeGroups.map((group) => <View key={group.key} style={styles.shoppingCategorySection}>
        <View style={styles.shoppingCategoryHeader}><Text style={styles.shoppingCategoryTitle}>{group.label}</Text><Text style={styles.shoppingCategoryCount}>{group.items.length}</Text></View>
        <SurfaceCard style={styles.listCard}>{group.items.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onEdit={openEdit} onDelete={remove} />)}</SurfaceCard>
      </View>)}</View> : <SurfaceCard><EmptyState icon="cart-check" title="Alles erledigt" text="Eure gemeinsame Einkaufsliste ist aktuell leer." actionLabel="Produkt hinzufügen" onAction={openAdd} /></SurfaceCard>}

      {preferences.showCompletedShopping && completed.length ? <><SectionTitle title={`Erledigt · ${completed.length}`} /><SurfaceCard style={styles.listCard}>{completedSorted.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onEdit={openEdit} onDelete={remove} />)}</SurfaceCard></> : null}
'''
if old_open in app:
    app = app.replace(old_open, new_open, 1)
elif 'activeGroups.map((group)' not in app:
    raise SystemExit('missing pattern: shopping grouped render')

# Make the Lidl sorting visible but unobtrusive.
if 'shoppingCategoryList:' not in app:
    app = replace_once(
        app,
        "  shoppingMetaTiny: { fontSize: 11, lineHeight: 15, color: colors.textTertiary, marginTop: 1 },\n  shoppingRowActions:",
        "  shoppingMetaTiny: { fontSize: 11, lineHeight: 15, color: colors.textTertiary, marginTop: 1 },\n  shoppingCategoryList: { gap: 14 },\n  shoppingCategorySection: { gap: 7 },\n  shoppingCategoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },\n  shoppingCategoryTitle: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.textSecondary },\n  shoppingCategoryCount: { minWidth: 24, height: 24, borderRadius: 12, textAlign: 'center', textAlignVertical: 'center', paddingTop: Platform.OS === 'ios' ? 3 : 1, fontSize: 11, fontWeight: '700', color: colors.textTertiary, backgroundColor: colors.surfaceMuted },\n  shoppingRowActions:",
        'shopping Lidl styles',
    )

# Faster startup: only household is critical. Shopping + week get a short fast-path window,
# then continue in the background instead of blocking the first usable screen for seconds.
reload_start = app.index('  const reloadAll = async (startup = false) => {')
chunk_start = app.index('    const [shoppingResult, planResult] = await Promise.allSettled([', reload_start)
chunk_end_marker = "    await loadSecondaryData(generation);\n    if (generation !== loadGeneration.current) return;\n    setReady(true);\n"
chunk_end = app.index(chunk_end_marker, chunk_start) + len(chunk_end_marker)
new_chunk = '''    const loadPrimaryData = async () => {
      const [shoppingResult, planResult] = await Promise.allSettled([
        withTimeout(loadShopping(), 5000, 'Einkaufsliste'),
        withTimeout(loadMealPlan(), 5000, 'Wochenplan'),
      ]);
      if (generation !== loadGeneration.current) return;

      if (shoppingResult.status === 'fulfilled') {
        shoppingLoadGeneration.current += 1;
        setItems(shoppingResult.value);
      } else {
        const retryRequest = ++shoppingLoadGeneration.current;
        setTimeout(() => {
          withTimeout(loadShopping(), 5000, 'Einkaufsliste').then((next) => {
            if (retryRequest === shoppingLoadGeneration.current) setItems(next);
          }).catch(() => undefined);
        }, 500);
      }

      if (planResult.status === 'fulfilled') {
        const plan = planResult.value;
        setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));
        setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));
      }
    };

    if (startup) {
      setStartupProgress(68);
      const primaryPromise = loadPrimaryData();
      await Promise.race([
        primaryPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 320)),
      ]);
      if (generation !== loadGeneration.current) return;
      setStartupProgress(100);
      setReady(true);
      void primaryPromise;
      void loadSecondaryData(generation);
      return;
    }

    await loadPrimaryData();
    if (generation !== loadGeneration.current) return;
    await loadSecondaryData(generation);
    if (generation !== loadGeneration.current) return;
    setReady(true);
'''
app = app[:chunk_start] + new_chunk + app[chunk_end:]

# Remove the now-unused artificial minimum-loader timing and tighten the critical timeout.
app = app.replace('    const startedAt = Date.now();\n', '', 1)
app = app.replace("withTimeout(loadHousehold(), 8000, 'Haushalt')", "withTimeout(loadHousehold(), 6000, 'Haushalt')", 1)
app = app.replace("    if (startup) setStartupProgress(32);", "    if (startup) setStartupProgress(58);", 1)

# Secondary data is background-only; do not let stale long waits accumulate.
app = app.replace("withTimeout(loadOwnRecipes(), 8000, 'Rezepte')", "withTimeout(loadOwnRecipes(), 5000, 'Rezepte')", 1)
app = app.replace("withTimeout(loadMealHistory(), 8000, 'Verlauf')", "withTimeout(loadMealHistory(), 5000, 'Verlauf')", 1)
app = app.replace("withTimeout(loadPendingHouseholdInvitations(), 8000, 'Einladungen')", "withTimeout(loadPendingHouseholdInvitations(), 5000, 'Einladungen')", 1)
app = app.replace("withTimeout(supabase.auth.getUser(), 8000, 'Benutzerprofil')", "withTimeout(supabase.auth.getUser(), 5000, 'Benutzerprofil')", 1)

app_path.write_text(app)

# Keep semantic version 2.2.9 because the requested update uses that version, but increment
# native build numbers so Android and SideStore can distinguish this revision from Build 22.
app_json_path = Path('app.json')
config = json.loads(app_json_path.read_text())
expo = config['expo']
expo['version'] = '2.2.9'
expo['ios']['buildNumber'] = '23'
expo['android']['versionCode'] = 23
app_json_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
if 'Lidl-orientierten Bereichen' not in changelog:
    changelog = changelog.replace(
        '## 2.2.9\n\n',
        '## 2.2.9\n\n- Einkaufsliste wird automatisch in Lidl-orientierten Bereichen gruppiert und innerhalb der Bereiche alphabetisch sortiert.\n- Bestehende und neu angelegte Produkte werden ohne manuelle Kategorie anhand ihres Namens einsortiert.\n- Startpfad beschleunigt: Nach dem Haushalt blockieren Einkauf und Wochenplan den ersten nutzbaren Bildschirm höchstens noch kurz und laden andernfalls im Hintergrund weiter.\n- Hintergrundabfragen und Retry-Zeiten wurden verkürzt, ohne den Start bei langsamer Verbindung wieder zu blockieren.\n',
        1,
    )
    changelog = changelog.replace(
        '- Version 2.2.9, iOS Build 22, Android Version Code 22.',
        '- Version 2.2.9, iOS Build 23, Android Version Code 23.',
        1,
    )
changelog_path.write_text(changelog)

print('MealFlow 2.2.9 Lidl/performance patch applied')
