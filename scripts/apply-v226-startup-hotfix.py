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
    "  return message;\n}\n\nfunction formatAmount(value: number) {",
    "  return message;\n}\n\nfunction withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {\n  return new Promise<T>((resolve, reject) => {\n    const timeout = setTimeout(() => reject(new Error(`${label} dauert zu lange. Bitte prüfe deine Verbindung.`)), timeoutMs);\n    promise.then(\n      (value) => { clearTimeout(timeout); resolve(value); },\n      (error) => { clearTimeout(timeout); reject(error); },\n    );\n  });\n}\n\nfunction formatAmount(value: number) {",
    'timeout helper',
)

app = replace_once(
    app,
    "function RecipeArtwork({ recipe, variant }: { recipe: Recipe; variant: 'card' | 'detail' }) {",
    "function StartupErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {\n  return <View style={styles.loadingScreen}><View style={styles.loadingLogo}><MaterialCommunityIcons name=\"cloud-alert-outline\" size={30} color=\"#FFFFFF\" /></View><Text style={styles.loadingBrand}>MealFlow</Text><Text style={styles.configurationTitle}>Start konnte nicht abgeschlossen werden</Text><Text style={styles.configurationText}>{message}</Text><ActionButton label=\"Erneut laden\" icon=\"refresh\" onPress={onRetry} style={{ minWidth: 190 }} /><Text style={styles.loadingHint}>Die App bleibt nicht mehr im Ladebildschirm hängen.</Text></View>;\n}\n\nfunction RecipeArtwork({ recipe, variant }: { recipe: Recipe; variant: 'card' | 'detail' }) {",
    'startup error screen',
)

app = replace_once(
    app,
    "  const [startupProgress, setStartupProgress] = useState(0);\n  const [settingsOpen, setSettingsOpen] = useState(false);",
    "  const [startupProgress, setStartupProgress] = useState(0);\n  const [startupError, setStartupError] = useState<string | null>(null);\n  const [settingsOpen, setSettingsOpen] = useState(false);",
    'startup error state',
)

old_reload = '''  const reloadAll = async (startup = false) => {
    const startedAt = Date.now();
    const generation = ++loadGeneration.current;
    if (startup) setStartupProgress(0);
    clearHouseholdCache();
    if (startup) setStartupProgress(12);
    const nextHousehold = await loadHousehold();
    if (generation !== loadGeneration.current) return;
    setHousehold(nextHousehold);
    if (startup) setStartupProgress(30);
    const [shopping, plan, pantry] = await Promise.all([loadShopping(), loadMealPlan(), loadPantry()]);
    if (generation !== loadGeneration.current) return;
    setItems(shopping);
    setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));
    setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));
    setPantryItems(pantry);
    syncExpiryNotifications(pantry).catch(() => undefined);
    if (startup) setStartupProgress(68);
    const [customRecipes, cookedHistory, pending, userResult] = await Promise.all([loadOwnRecipes(), loadMealHistory(), loadPendingHouseholdInvitations(), supabase.auth.getUser()]);
    if (generation !== loadGeneration.current) return;
    setOwnRecipes(customRecipes); setHistory(cookedHistory); setInvitations(pending); setEmail(userResult.data.user?.email ?? '');
    if (startup) {
      setStartupProgress(92);
      const remaining = 1350 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (generation !== loadGeneration.current) return;
      setStartupProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
    setReady(true);
  };

  useEffect(() => {
    setStartupProgress(0);
    loadPreferences().then((loaded) => { setPreferences(loaded); setTab(loaded.startTab); applyAppearance(loaded.themeMode, loaded.cozyMode); }).catch(() => undefined);
    reloadAll(true).catch((error) => { setStartupProgress(100); setReady(true); Alert.alert('Daten konnten nicht geladen werden', germanError(error?.message)); });
  }, []);'''

new_reload = '''  const loadSecondaryData = async (generation: number) => {
    const [recipesResult, historyResult, invitesResult, userResult] = await Promise.allSettled([
      withTimeout(loadOwnRecipes(), 8000, 'Rezepte'),
      withTimeout(loadMealHistory(), 8000, 'Verlauf'),
      withTimeout(loadPendingHouseholdInvitations(), 8000, 'Einladungen'),
      withTimeout(supabase.auth.getUser(), 8000, 'Benutzerprofil'),
    ]);
    if (generation !== loadGeneration.current) return;
    if (recipesResult.status === 'fulfilled') setOwnRecipes(recipesResult.value);
    if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
    if (invitesResult.status === 'fulfilled') setInvitations(invitesResult.value);
    if (userResult.status === 'fulfilled') setEmail(userResult.value.data.user?.email ?? '');
  };

  const reloadAll = async (startup = false) => {
    const startedAt = Date.now();
    const generation = ++loadGeneration.current;
    if (startup) {
      setStartupError(null);
      setReady(false);
      setStartupProgress(0);
    }
    clearHouseholdCache();
    if (startup) setStartupProgress(10);

    const nextHousehold = await withTimeout(loadHousehold(), 10000, 'Haushalt');
    if (generation !== loadGeneration.current) return;
    setHousehold(nextHousehold);
    if (startup) setStartupProgress(32);

    const [shoppingResult, planResult, pantryResult] = await Promise.allSettled([
      withTimeout(loadShopping(), 9000, 'Einkaufsliste'),
      withTimeout(loadMealPlan(), 9000, 'Wochenplan'),
      withTimeout(loadPantry(), 9000, 'Vorrat'),
    ]);
    if (generation !== loadGeneration.current) return;

    if (shoppingResult.status === 'fulfilled') setItems(shoppingResult.value);
    if (planResult.status === 'fulfilled') {
      const plan = planResult.value;
      setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));
      setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));
    }
    if (pantryResult.status === 'fulfilled') {
      setPantryItems(pantryResult.value);
      syncExpiryNotifications(pantryResult.value).catch(() => undefined);
    }

    if (startup) {
      setStartupProgress(78);
      const minimumVisible = 650 - (Date.now() - startedAt);
      if (minimumVisible > 0) await new Promise((resolve) => setTimeout(resolve, minimumVisible));
      if (generation !== loadGeneration.current) return;
      setStartupProgress(100);
      setReady(true);
      void loadSecondaryData(generation);

      const failedCore = [shoppingResult, planResult, pantryResult].filter((result) => result.status === 'rejected').length;
      if (failedCore > 0) {
        setTimeout(() => Alert.alert('Teilweise geladen', 'MealFlow ist gestartet. Einige Daten konnten noch nicht geladen werden und werden beim nächsten Aktualisieren erneut versucht.'), 250);
      }
      return;
    }

    await loadSecondaryData(generation);
    if (generation !== loadGeneration.current) return;
    setReady(true);
  };

  const startApplication = () => {
    setStartupError(null);
    setStartupProgress(0);
    void reloadAll(true).catch((error: any) => {
      if (loadGeneration.current < 1) return;
      setStartupProgress(100);
      setReady(false);
      setStartupError(germanError(error?.message));
    });
  };

  useEffect(() => {
    loadPreferences().then((loaded) => { setPreferences(loaded); setTab(loaded.startTab); applyAppearance(loaded.themeMode, loaded.cozyMode); }).catch(() => undefined);
    startApplication();
  }, []);'''

app = replace_once(app, old_reload, new_reload, 'startup reload flow')

app = replace_once(
    app,
    "  if (!ready || !household) return <LoadingScreen message=\"Deine Daten werden sicher geladen …\" progress={startupProgress} />;",
    "  if (startupError && !household) return <StartupErrorScreen message={startupError} onRetry={startApplication} />;\n  if (!ready || !household) return <LoadingScreen message=\"Deine Daten werden sicher geladen …\" progress={startupProgress} />;",
    'startup render recovery',
)

old_root = '''function Root() {
  const [authenticated, setAuthenticated] = useState(false); const [checking, setChecking] = useState(true);
  useEffect(() => { if (!isCloudConfigured) { setChecking(false); return; } supabase.auth.getSession().then(({ data }) => { setAuthenticated(Boolean(data.session)); setChecking(false); }); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) clearHouseholdCache(); setAuthenticated(Boolean(session)); }); return () => listener.subscription.unsubscribe(); }, []);
  if (checking) return <LoadingScreen message="Anmeldung wird geprüft …" progress={5} />;
  if (!isCloudConfigured) return <View style={styles.loadingScreen}><Text style={styles.configurationTitle}>Cloud-Verbindung fehlt</Text><Text style={styles.configurationText}>MealFlow benötigt die Supabase-Konfiguration, damit dein Haushalt sicher synchronisiert werden kann.</Text></View>;
  return authenticated ? <MainApp /> : <AuthScreen />;
}'''

new_root = '''function Root() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    if (!isCloudConfigured) { setChecking(false); return; }
    withTimeout(supabase.auth.getSession(), 7000, 'Anmeldung').then(({ data }) => {
      if (!active) return;
      setAuthenticated(Boolean(data.session));
      setChecking(false);
    }).catch(() => {
      if (!active) return;
      setAuthenticated(false);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) clearHouseholdCache();
      setAuthenticated(Boolean(session));
      setChecking(false);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (checking) return <LoadingScreen message="Anmeldung wird geprüft …" progress={8} />;
  if (!isCloudConfigured) return <View style={styles.loadingScreen}><Text style={styles.configurationTitle}>Cloud-Verbindung fehlt</Text><Text style={styles.configurationText}>MealFlow benötigt die Supabase-Konfiguration, damit dein Haushalt sicher synchronisiert werden kann.</Text></View>;
  return authenticated ? <MainApp /> : <AuthScreen />;
}'''

app = replace_once(app, old_root, new_root, 'root auth timeout')
app_path.write_text(app)

app_json_path = Path('app.json')
config = json.loads(app_json_path.read_text())
config['expo']['version'] = '2.2.6'
config['expo']['ios']['buildNumber'] = '19'
config['expo']['android']['versionCode'] = 19
app_json_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
section = '''## 2.2.6 Hotfix Build 19

- Endlos-Ladefehler behoben: ein fehlgeschlagener Haushalts-Start kann die App nicht mehr dauerhaft im Loader festhalten.
- Startabfragen besitzen jetzt Zeitlimits und eine Fehleransicht mit „Erneut laden“.
- Haushalt, Einkauf, Wochenplan und Vorrat bilden den schnellen Kernstart; Rezepte, Verlauf und Einladungen laden danach im Hintergrund.
- Einzelne langsame Nebendaten blockieren den App-Start nicht mehr.
- Anmeldung besitzt ebenfalls ein Zeitlimit statt eines möglichen unendlichen Prüfstatus.
- Performance des Startvorgangs verbessert und unnötige feste Wartezeit reduziert.
- Sichtbare Version bleibt 2.2.6; iOS Build 19, Android Version Code 19.

'''
if '## 2.2.6 Hotfix Build 19' not in changelog:
    changelog = changelog.replace('# MealFlow Changelog\n\n', '# MealFlow Changelog\n\n' + section, 1)
changelog_path.write_text(changelog)

print('MealFlow 2.2.6 startup hotfix applied')
