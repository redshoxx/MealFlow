from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app_path = Path('App.tsx')
app = app_path.read_text()

# Shared timeout guard: no remote request may hold the app in a loading state forever.
if 'function withTimeout<T>' not in app:
    marker = "function formatAmount(value: number) {"
    helper = """function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} konnte nicht rechtzeitig geladen werden.`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

"""
    app = replace_once(app, marker, helper + marker, 'timeout helper')

app = replace_once(
    app,
    "  const [startupProgress, setStartupProgress] = useState(0);\n  const [settingsOpen, setSettingsOpen] = useState(false);",
    "  const [startupProgress, setStartupProgress] = useState(0);\n  const [startupError, setStartupError] = useState<string | null>(null);\n  const [settingsOpen, setSettingsOpen] = useState(false);",
    'startup error state',
)

# Replace the entire startup loader with a resilient staged loader.
start = app.index("  const reloadAll = async (startup = false) => {")
end = app.index("  useEffect(() => {\n    setStartupProgress(0);", start)
new_reload = """  const reloadAll = async (startup = false) => {
    const startedAt = Date.now();
    const generation = ++loadGeneration.current;
    if (startup) {
      setReady(false);
      setStartupError(null);
      setStartupProgress(0);
    }
    clearHouseholdCache();

    try {
      if (startup) setStartupProgress(10);
      const nextHousehold = await withTimeout(loadHousehold(), 8000, 'Haushalt');
      if (generation !== loadGeneration.current) return;
      setHousehold(nextHousehold);
      if (startup) setStartupProgress(30);

      const [shoppingResult, planResult, pantryResult] = await Promise.allSettled([
        withTimeout(loadShopping(), 6500, 'Einkaufsliste'),
        withTimeout(loadMealPlan(), 6500, 'Wochenplan'),
        withTimeout(loadPantry(), 6500, 'Vorrat'),
      ]);
      if (generation !== loadGeneration.current) return;

      if (shoppingResult.status === 'fulfilled') setItems(shoppingResult.value);
      if (planResult.status === 'fulfilled') {
        setMeals(Object.fromEntries(planResult.value.map((entry) => [entry.plannedDate, entry.meal ?? ''])));
        setSaskiaMeals(Object.fromEntries(planResult.value.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));
      }
      if (pantryResult.status === 'fulfilled') {
        setPantryItems(pantryResult.value);
        syncExpiryNotifications(pantryResult.value).catch(() => undefined);
      }
      if (startup) setStartupProgress(76);

      const loadSecondary = async () => {
        const [recipesResult, historyResult, invitationsResult, userResult] = await Promise.allSettled([
          withTimeout(loadOwnRecipes(), 5000, 'Rezepte'),
          withTimeout(loadMealHistory(), 5000, 'Verlauf'),
          withTimeout(loadPendingHouseholdInvitations(), 5000, 'Einladungen'),
          withTimeout(supabase.auth.getUser(), 5000, 'Profil'),
        ]);
        if (generation !== loadGeneration.current) return;
        if (recipesResult.status === 'fulfilled') setOwnRecipes(recipesResult.value);
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
        if (invitationsResult.status === 'fulfilled') setInvitations(invitationsResult.value);
        if (userResult.status === 'fulfilled') setEmail(userResult.value.data.user?.email ?? '');
      };

      if (startup) {
        setStartupProgress(88);
        const remaining = 700 - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
        if (generation !== loadGeneration.current) return;
        setStartupProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 110));
        if (generation !== loadGeneration.current) return;
        setReady(true);
        void loadSecondary();
      } else {
        await loadSecondary();
        if (generation !== loadGeneration.current) return;
        setReady(true);
      }
    } catch (error: any) {
      if (generation !== loadGeneration.current) return;
      if (startup) {
        setStartupProgress(100);
        setStartupError(germanError(error?.message));
        setReady(true);
        return;
      }
      throw error;
    }
  };

"""
app = app[:start] + new_reload + app[end:]

# Startup effect no longer has a second error path that can accidentally leave household null + loader visible.
old_start_effect = """  useEffect(() => {
    setStartupProgress(0);
    loadPreferences().then((loaded) => { setPreferences(loaded); setTab(loaded.startTab); applyAppearance(loaded.themeMode, loaded.cozyMode); }).catch(() => undefined);
    reloadAll(true).catch((error) => { setStartupProgress(100); setReady(true); Alert.alert('Daten konnten nicht geladen werden', germanError(error?.message)); });
  }, []);
"""
new_start_effect = """  useEffect(() => {
    setStartupProgress(0);
    loadPreferences().then((loaded) => { setPreferences(loaded); setTab(loaded.startTab); applyAppearance(loaded.themeMode, loaded.cozyMode); }).catch(() => undefined);
    void reloadAll(true);
  }, []);
"""
app = replace_once(app, old_start_effect, new_start_effect, 'startup effect')

# Debounce realtime bursts to avoid several identical full reloads at once.
rt_start = app.index("  useEffect(() => {\n    if (!household?.id) return;", app.index("function MainApp()"))
rt_end = app.index("\n  const changeTab =", rt_start)
new_realtime = """  useEffect(() => {
    if (!household?.id) return;
    const filter = `household_id=eq.${household.id}`;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const schedule = (key: string, work: () => void) => {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timers.delete(key);
        work();
      }, 180);
      timers.set(key, timer);
    };
    const channel = supabase.channel(`mealflow-household-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, () => schedule('shopping', () => { withTimeout(loadShopping(), 6000, 'Einkaufsliste').then(setItems).catch(() => undefined); }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items', filter }, () => schedule('pantry', () => { withTimeout(loadPantry(), 6000, 'Vorrat').then((next) => { setPantryItems(next); syncExpiryNotifications(next).catch(() => undefined); }).catch(() => undefined); }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries', filter }, () => schedule('plan', () => { withTimeout(loadMealPlan(), 6000, 'Wochenplan').then((plan) => { setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? '']))); setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? '']))); }).catch(() => undefined); }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_recipes', filter }, () => schedule('recipes', () => { withTimeout(loadOwnRecipes(), 5000, 'Rezepte').then(setOwnRecipes).catch(() => undefined); }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_history', filter }, () => schedule('history', () => { withTimeout(loadMealHistory(), 5000, 'Verlauf').then(setHistory).catch(() => undefined); }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter }, () => schedule('household', () => { withTimeout(loadHousehold(), 6000, 'Haushalt').then(setHousehold).catch(() => undefined); }))
      .subscribe();
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      supabase.removeChannel(channel);
    };
  }, [household?.id]);
"""
app = app[:rt_start] + new_realtime + app[rt_end:]

# Replace the endless-loader condition with an explicit recoverable error state.
old_render = "  if (!ready || !household) return <LoadingScreen message=\"Deine Daten werden sicher geladen …\" progress={startupProgress} />;"
new_render = """  if (!ready && !startupError) return <LoadingScreen message="Deine Daten werden sicher geladen …" progress={startupProgress} />;
  if (!household) return <View style={styles.loadingScreen}><StatusBar style={darkMode ? 'light' : 'dark'} /><MaterialCommunityIcons name="cloud-alert-outline" size={38} color={colors.accent} /><Text style={styles.configurationTitle}>MealFlow konnte nicht vollständig starten</Text><Text style={styles.configurationText}>{startupError || 'Der Haushalt konnte nicht geladen werden. Bitte versuche es erneut.'}</Text><ActionButton label="Erneut versuchen" icon="refresh" onPress={() => { setStartupError(null); void reloadAll(true); }} /></View>;"""
app = replace_once(app, old_render, new_render, 'startup render guard')

# Guard the auth bootstrap as well so the app can never remain indefinitely at 5%.
old_root = "  useEffect(() => { if (!isCloudConfigured) { setChecking(false); return; } supabase.auth.getSession().then(({ data }) => { setAuthenticated(Boolean(data.session)); setChecking(false); }); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) clearHouseholdCache(); setAuthenticated(Boolean(session)); }); return () => listener.subscription.unsubscribe(); }, []);"
new_root = """  useEffect(() => {
    if (!isCloudConfigured) { setChecking(false); return; }
    let mounted = true;
    const guard = setTimeout(() => { if (mounted) setChecking(false); }, 6000);
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthenticated(Boolean(data.session));
      setChecking(false);
      clearTimeout(guard);
    }).catch(() => { if (mounted) setChecking(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) clearHouseholdCache();
      setAuthenticated(Boolean(session));
      if (mounted) setChecking(false);
    });
    return () => { mounted = false; clearTimeout(guard); listener.subscription.unsubscribe(); };
  }, []);"""
app = replace_once(app, old_root, new_root, 'auth bootstrap guard')

app_path.write_text(app)

# Version bump.
package_path = Path('package.json')
package = json.loads(package_path.read_text())
package['version'] = '2.2.7'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

app_json_path = Path('app.json')
config = json.loads(app_json_path.read_text())
config['expo']['version'] = '2.2.7'
config['expo']['ios']['buildNumber'] = '19'
config['expo']['android']['versionCode'] = 19
app_json_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
section = """## 2.2.7

- Kritischen Start-Deadlock behoben: MealFlow bleibt nach einem fehlgeschlagenen Datenabruf nicht mehr dauerhaft im Ladebildschirm.
- Alle wichtigen Cloud-Ladevorgänge haben feste Timeouts und können die App nicht mehr unbegrenzt blockieren.
- Einkauf, Wochenplan und Vorrat werden fehlertolerant und unabhängig voneinander geladen.
- Sekundäre Daten wie Verlauf, Einladungen und Rezepte werden nach dem Kernstart im Hintergrund ergänzt.
- Bei einem echten Startfehler erscheint eine klare Fehlermeldung mit „Erneut versuchen“ statt eines endlosen Ladebildschirms.
- Auch die Sitzungsprüfung hat jetzt einen Sicherheits-Timeout.
- Realtime-Ereignisse werden kurz gebündelt, um doppelte Supabase-Abfragen und Ruckler bei mehreren gleichzeitigen Änderungen zu reduzieren.
- Version 2.2.7, iOS Build 19, Android Version Code 19.

"""
if '## 2.2.7' not in changelog:
    changelog = changelog.replace('# MealFlow Changelog\n\n', '# MealFlow Changelog\n\n' + section, 1)
changelog_path.write_text(changelog)

print('MealFlow 2.2.7 stability patch applied')
