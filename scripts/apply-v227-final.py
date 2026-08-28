from pathlib import Path
import json

app_path = Path('App.tsx')
app = app_path.read_text()

# Always surface a startup error instead of falling back into the loading guard.
old_guard = "  if (startupError && !household) return <StartupErrorScreen message={startupError} onRetry={startApplication} />;\n  if (!ready || !household) return <LoadingScreen message=\"Deine Daten werden sicher geladen …\" progress={startupProgress} />;"
new_guard = "  if (startupError) return <StartupErrorScreen message={startupError} onRetry={startApplication} />;\n  if (!ready || !household) return <LoadingScreen message=\"Deine Daten werden sicher geladen …\" progress={startupProgress} />;"
if old_guard not in app:
    raise SystemExit('missing startup guard')
app = app.replace(old_guard, new_guard, 1)

# Debounce realtime bursts and guard every background reload with a timeout.
start = app.index("  useEffect(() => {\n    if (!household?.id) return;", app.index('function MainApp()'))
end = app.index("\n  const changeTab =", start)
new_realtime = """  useEffect(() => {
    if (!household?.id) return;
    const filter = `household_id=eq.${household.id}`;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const schedule = (key: string, work: () => void) => {
      const current = timers.get(key);
      if (current) clearTimeout(current);
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
app = app[:start] + new_realtime + app[end:]

# Slightly tighter core timeouts: fail visibly instead of appearing frozen for too long.
app = app.replace("withTimeout(loadHousehold(), 10000, 'Haushalt')", "withTimeout(loadHousehold(), 8000, 'Haushalt')", 1)
app = app.replace("withTimeout(loadShopping(), 9000, 'Einkaufsliste')", "withTimeout(loadShopping(), 6500, 'Einkaufsliste')", 1)
app = app.replace("withTimeout(loadMealPlan(), 9000, 'Wochenplan')", "withTimeout(loadMealPlan(), 6500, 'Wochenplan')", 1)
app = app.replace("withTimeout(loadPantry(), 9000, 'Vorrat')", "withTimeout(loadPantry(), 6500, 'Vorrat')", 1)

app_path.write_text(app)

package_path = Path('package.json')
package = json.loads(package_path.read_text())
package['version'] = '2.2.7'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

app_json_path = Path('app.json')
config = json.loads(app_json_path.read_text())
config['expo']['version'] = '2.2.7'
config['expo']['ios']['buildNumber'] = '20'
config['expo']['android']['versionCode'] = 20
app_json_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
section = """## 2.2.7

- Start-Deadlock endgültig behoben: Ein Fehler kann MealFlow nicht mehr in einen endlosen Ladebildschirm zurückführen.
- Kritische Startabfragen haben feste Timeouts und brechen kontrolliert mit einer Wiederholen-Seite ab.
- Einkauf, Wochenplan und Vorrat laden unabhängig voneinander; einzelne Fehler blockieren die App nicht mehr vollständig.
- Sekundäre Daten werden nach dem Kernstart im Hintergrund ergänzt.
- Sitzungsprüfung ist gegen Hängen abgesichert.
- Realtime-Ereignisse werden 180 ms gebündelt, wodurch doppelte Supabase-Abfragen bei schnellen Änderungen reduziert werden.
- Hintergrund-Reloads besitzen ebenfalls Timeouts und können sich nicht unbegrenzt aufstauen.
- Version 2.2.7, iOS Build 20, Android Version Code 20.

"""
if '## 2.2.7' not in changelog:
    changelog = changelog.replace('# MealFlow Changelog\n\n', '# MealFlow Changelog\n\n' + section, 1)
changelog_path.write_text(changelog)

print('MealFlow 2.2.7 final stability patch applied')
