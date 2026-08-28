const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Patch marker not found: ${label}`);
  return source.replace(before, after);
}
function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Block markers not found: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

let app = read('App.tsx');
app = replaceRequired(
  app,
  "import { InventoryScreen, refreshInventoryStyles } from './src/screens/InventoryScreen';\nimport { loadPantry, type PantryItem } from './src/lib/inventory';\nimport { getUrgentPantry, syncExpiryNotifications } from './src/lib/expiryNotifications';",
  "import { BudgetScreen, refreshBudgetStyles } from './src/screens/BudgetScreen';",
  'inventory imports',
);
app = replaceRequired(app, 'Haushalt · Einkauf · Woche · Vorrat', 'Haushalt · Einkauf · Woche · Budget', 'loading hint');
app = replaceRequired(app, "    { key: 'vorrat', label: 'Vorrat' },", "    { key: 'budget', label: 'Budget' },", 'settings start tab');

const homeScreen = `function HomeScreen({ household, meals, items, history, onNavigate, onSettings, onCooked }: { household: Household; meals: Record<string, string>; items: ShoppingItem[]; history: MealHistoryEntry[]; onNavigate: (tab: Tab) => void; onSettings: () => void; onCooked: (title: string) => Promise<void> }) {
  const tonight = meals[todayIso()] || '';
  const planned = getWeekDays(1).filter((entry) => Boolean(meals[entry.iso])).length;
  const openItems = items.filter((item) => !item.done).length;
  const cookedToday = tonight ? history.some((entry) => entry.cookedOn === todayIso() && normalizeTitle(entry.recipeTitle) === normalizeTitle(tonight)) : false;
  const dateLabel = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' });
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
    <ScreenHeader eyebrow={\`${'${dateLabel}'} · ${'${household.name}'}\`} title="Heute" subtitle={\`Gemeinsam mit ${'${household.members.length}'} ${'${household.members.length === 1 ? \'Person\' : \'Personen\'}'} planen.\`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
    <SurfaceCard style={styles.heroCard}><View style={styles.heroIcon}><MaterialCommunityIcons name="silverware-fork-knife" size={25} color={colors.accent} /></View><Text style={styles.heroLabel}>HEUTE ABEND</Text><Text style={styles.heroMeal}>{tonight || 'Noch nichts geplant'}</Text><Text style={styles.heroMeta}>{tonight ? cookedToday ? 'Als gekocht markiert – der Haushalt ist auf dem gleichen Stand.' : 'Dein Abendessen ist im gemeinsamen Wochenplan.' : 'Plane jetzt ein Abendessen für den Haushalt.'}</Text><View style={styles.heroActions}><ActionButton label={tonight ? 'Wochenplan öffnen' : 'Abendessen planen'} icon="calendar-week-outline" onPress={() => onNavigate('woche')} variant="secondary" style={styles.flexButton} />{tonight && !cookedToday ? <ActionButton label="Gekocht" icon="check-circle-outline" onPress={() => onCooked(tonight)} style={styles.flexButton} /> : null}</View></SurfaceCard>
    <View style={styles.metricsRow}><SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="calendar-check-outline" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{planned}/7</Text><Text style={styles.metricLabel}>nächste Woche geplant</Text></SurfaceCard><SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="cart-outline" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{openItems}</Text><Text style={styles.metricLabel}>offene Einkäufe</Text></SurfaceCard></View>
    <SectionTitle title="Schnellzugriff" /><View style={styles.quickGrid}><Pressable style={styles.quickAction} onPress={() => onNavigate('woche')}><View style={styles.quickIcon}><MaterialCommunityIcons name="calendar-plus" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Woche planen</Text><Text style={styles.quickText}>Abendessen gemeinsam festlegen.</Text></Pressable><Pressable style={styles.quickAction} onPress={() => onNavigate('einkauf')}><View style={styles.quickIcon}><MaterialCommunityIcons name="cart-plus" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Einkauf ergänzen</Text><Text style={styles.quickText}>Jeder im Haushalt sieht Änderungen sofort.</Text></Pressable><Pressable style={styles.quickAction} onPress={() => onNavigate('budget')}><View style={styles.quickIcon}><MaterialCommunityIcons name="wallet-outline" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Budget</Text><Text style={styles.quickText}>Einkauf schätzen und Monatsbudget prüfen.</Text></Pressable></View>
  </ScrollView>;
}`;
app = replaceBlock(app, 'function HomeScreen(', '\n\nfunction PlanScreen(', homeScreen, 'HomeScreen');

const tabBar = `function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; active: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { key: 'heute', label: 'Heute', icon: 'home-variant-outline', active: 'home-variant' },
    { key: 'woche', label: 'Woche', icon: 'calendar-week-outline', active: 'calendar-week' },
    { key: 'einkauf', label: 'Einkauf', icon: 'cart-outline', active: 'cart' },
    { key: 'budget', label: 'Budget', icon: 'wallet-outline', active: 'wallet' },
  ];
  return <View style={styles.tabBar}>{tabs.map((item) => { const active = tab === item.key; return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(item.key)} style={styles.tabItem}><MaterialCommunityIcons name={active ? item.active : item.icon} size={23} color={active ? colors.accent : colors.textTertiary} /><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text></Pressable>; })}</View>;
}`;
app = replaceBlock(app, 'function TabBar(', '\n\nfunction MainApp()', tabBar, 'TabBar');

app = replaceRequired(app, "  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);\n", '', 'pantry state');
app = replaceRequired(
  app,
  `    const [shoppingResult, planResult, pantryResult] = await Promise.allSettled([
      withTimeout(loadShopping(), 6500, 'Einkaufsliste'),
      withTimeout(loadMealPlan(), 6500, 'Wochenplan'),
      withTimeout(loadPantry(), 6500, 'Vorrat'),
    ]);`,
  `    const [shoppingResult, planResult] = await Promise.allSettled([
      withTimeout(loadShopping(), 6500, 'Einkaufsliste'),
      withTimeout(loadMealPlan(), 6500, 'Wochenplan'),
    ]);`,
  'startup core loaders',
);
app = replaceRequired(
  app,
  `    if (pantryResult.status === 'fulfilled') {
      setPantryItems(pantryResult.value);
      syncExpiryNotifications(pantryResult.value).catch(() => undefined);
    }

`,
  '',
  'pantry startup result',
);
app = replaceRequired(app, "      const failedCore = [shoppingResult, planResult, pantryResult].filter((result) => result.status === 'rejected').length;", "      const failedCore = [shoppingResult, planResult].filter((result) => result.status === 'rejected').length;", 'failed core count');
app = replaceRequired(
  app,
  "      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items', filter }, () => schedule('pantry', () => { withTimeout(loadPantry(), 6000, 'Vorrat').then((next) => { setPantryItems(next); syncExpiryNotifications(next).catch(() => undefined); }).catch(() => undefined); }))\n",
  '',
  'pantry realtime subscription',
);
app = replaceRequired(
  app,
  "        {tab === 'heute' ? <HomeScreen household={household} meals={meals} items={items} history={history} pantryItems={pantryItems} onNavigate={changeTab} onSettings={() => setSettingsOpen(true)} onCooked={markCooked} /> : null}",
  "        {tab === 'heute' ? <HomeScreen household={household} meals={meals} items={items} history={history} onNavigate={changeTab} onSettings={() => setSettingsOpen(true)} onCooked={markCooked} /> : null}",
  'home render',
);
app = replaceRequired(
  app,
  "        {tab === 'vorrat' ? <InventoryScreen onSettings={() => setSettingsOpen(true)} hapticsEnabled={preferences.hapticsEnabled} /> : null}",
  "        {tab === 'budget' ? <BudgetScreen household={household} items={items} onSettings={() => setSettingsOpen(true)} /> : null}",
  'budget render',
);
app = replaceRequired(app, '  refreshInventoryStyles();', '  refreshBudgetStyles();', 'theme refresh');

for (const forbidden of ['InventoryScreen', 'loadPantry', 'PantryItem', 'syncExpiryNotifications', 'getUrgentPantry', "tab === 'vorrat'", "onNavigate('vorrat')"]) {
  if (app.includes(forbidden)) throw new Error(`Old pantry reference remains in App.tsx: ${forbidden}`);
}
write('App.tsx', app);

let preferences = read('src/lib/preferences.ts');
preferences = replaceRequired(preferences, "export type StartTab = 'heute' | 'woche' | 'einkauf' | 'vorrat';", "export type StartTab = 'heute' | 'woche' | 'einkauf' | 'budget';", 'StartTab union');
preferences = replaceRequired(
  preferences,
  "    const migratedStartTab = storedStartTab === 'rezepte' || storedStartTab === 'kalorien' ? 'vorrat' : storedStartTab;",
  "    const migratedStartTab = storedStartTab === 'rezepte' || storedStartTab === 'kalorien' || storedStartTab === 'vorrat' ? 'budget' : storedStartTab;",
  'start tab migration',
);
preferences = replaceRequired(preferences, "      startTab: ['heute', 'woche', 'einkauf', 'vorrat'].includes(migratedStartTab) ? migratedStartTab as StartTab : 'heute',", "      startTab: ['heute', 'woche', 'einkauf', 'budget'].includes(migratedStartTab) ? migratedStartTab as StartTab : 'heute',", 'valid start tabs');
write('src/lib/preferences.ts', preferences);

const appJson = JSON.parse(read('app.json'));
appJson.expo.version = '2.2.9';
appJson.expo.ios.buildNumber = '22';
appJson.expo.android.versionCode = 22;
const cameraPlugin = appJson.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-camera');
if (cameraPlugin?.[1]?.cameraPermission) cameraPlugin[1].cameraPermission = 'MealFlow benötigt die Kamera für unterstützte Barcode-Funktionen.';
write('app.json', JSON.stringify(appJson, null, 2) + '\n');

const pkg = JSON.parse(read('package.json'));
pkg.version = '2.2.9';
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## 2.2.9')) {
  const entry = `## 2.2.9\n\n- Neuer eigener Bereich „Budget“ ersetzt den bisherigen Vorrat in der Hauptnavigation.\n- Die offene Einkaufsliste erhält eine geschätzte Gesamtsumme auf Basis gespeicherter Produktpreise.\n- Produktpreise können direkt im Budget-Bereich pro Einheit gepflegt und für zukünftige Einkäufe wiederverwendet werden.\n- Gramm- und Milliliter-Mengen werden für Preisberechnungen automatisch auf kg bzw. Liter umgerechnet.\n- Neue Budget-Ampel für das monatliche Lebensmittelbudget: grün, orange oder rot abhängig von den geschätzten Ausgaben inklusive aktuellem Einkauf.\n- Budget zeigt Monatsbudget, geschätzt ausgegeben, geplanten Einkauf und voraussichtlich verbleibenden Betrag.\n- Preis- und Budgetdaten werden nach der neuen Supabase-Migration haushaltsweit synchronisiert; bis dahin funktioniert der Bereich mit lokalem Fallback.\n- Vorrat, MHD-Karten und Vorrats-Realtime-Ladevorgänge wurden aus der aktiven App-Navigation entfernt.\n- Version 2.2.9, iOS Build 22, Android Version Code 22.\n\n`;
  changelog = changelog.replace('# MealFlow Changelog\n\n', '# MealFlow Changelog\n\n' + entry);
  write('CHANGELOG.md', changelog);
}

let readme = read('README.md');
readme = readme.replace('# MealFlow 2.1', '# MealFlow 2.2.9');
if (!readme.includes('## Neu in 2.2.9')) {
  const section = `## Neu in 2.2.9\n\n### Budget statt Vorrat\n- eigener Hauptbereich **Budget** anstelle des bisherigen Vorrats\n- Kostenschätzung für die aktuell offene Einkaufsliste\n- haushaltsweit speicherbare Produktpreise mit Einheiten\n- Monatsbudget mit grün/orange/roter Budget-Ampel\n- Anzeige von geschätzt ausgegeben, geplant und verbleibendem Budget\n- lokaler Fallback, falls die neue Budget-Migration noch nicht auf Supabase eingespielt wurde\n\n`;
  readme = readme.replace('## Neu in 2.1', section + '## Neu in 2.1');
}
readme = readme.replace('- **Vorrat** –', '- **Budget** – Kostenschätzung der Einkaufsliste, Produktpreise und Monatsbudget\n- **Vorrat (entfernt)** –');
write('README.md', readme);

console.log('MealFlow 2.2.9 source patch applied.');
