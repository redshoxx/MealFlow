from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing pattern: {label}')
    return text.replace(old, new, 1)


# ---------- App.tsx ----------
app_path = Path('App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "function getPlanningMonthDays() {\n  return [1, 2, 3, 4].flatMap((weekOffset) => getWeekDays(weekOffset));\n}",
    "function getPlanningMonthDays() {\n  // Current calendar week + the following three weeks. This deliberately includes\n  // the current Monday even when today is Monday (e.g. 31.08.2026).\n  return [0, 1, 2, 3].flatMap((weekOffset) => getWeekDays(weekOffset));\n}",
    'planning month includes current week',
)

app = replace_once(
    app,
    "  const planningWeeks = [1, 2, 3, 4].map((weekOffset) => getWeekDays(weekOffset).map((entry) => ({",
    "  const planningWeeks = [0, 1, 2, 3].map((weekOffset) => getWeekDays(weekOffset).map((entry) => ({",
    'plan screen current week',
)

app = app.replace('NÄCHSTE 4 WOCHEN', '4-WOCHEN-ZEITRAUM')
app = app.replace('Vier Wochen im Voraus planen – pro Tag ein gemeinsames Abendessen und ein Gericht für Saskia.', 'Aktuelle Woche plus drei weitere Wochen – pro Tag ein gemeinsames Abendessen und ein Gericht für Saskia.')
app = app.replace('nächste 4 Wochen geplant', 'aktuelle + 3 Wochen geplant')

app = replace_once(
    app,
    "  const [completedExpanded, setCompletedExpanded] = useState(false);",
    "  const [completedExpanded, setCompletedExpanded] = useState(false);\n  const [shoppingMode, setShoppingMode] = useState(false);",
    'shopping mode state',
)

old_toolbar = "      <View style={styles.shoppingToolbar}><View><Text style={styles.shoppingToolbarLabel}>GEMEINSAME LISTE</Text><Text style={styles.shoppingToolbarTitle}>{active.length ? `${active.length} noch zu besorgen` : 'Alles erledigt'}</Text></View></View>"
new_toolbar = """      <View style={styles.shoppingToolbar}>
        <View style={styles.flex1}><Text style={styles.shoppingToolbarLabel}>GEMEINSAME LISTE</Text><Text style={styles.shoppingToolbarTitle}>{active.length ? `${active.length} noch zu besorgen` : 'Alles erledigt'}</Text></View>
        <Pressable accessibilityRole=\"button\" accessibilityLabel=\"Einkaufsmodus öffnen\" disabled={!active.length} onPress={() => { setShoppingMode(true); feedback(); }} style={({ pressed }) => [styles.shoppingModeLaunch, !active.length && styles.shoppingModeLaunchDisabled, pressed && active.length ? styles.shoppingModeLaunchPressed : null]}>
          <MaterialCommunityIcons name=\"cart-check\" size={19} color={active.length ? colors.accent : colors.textTertiary} />
          <Text style={[styles.shoppingModeLaunchText, !active.length && styles.shoppingModeLaunchTextDisabled]}>Einkaufsmodus</Text>
        </Pressable>
      </View>"""
app = replace_once(app, old_toolbar, new_toolbar, 'shopping mode launch')

shopping_mode_modal = r'''
    <Modal visible={shoppingMode} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={() => setShoppingMode(false)}>
      <SafeAreaView style={styles.shoppingModeRoot} edges={['top', 'bottom']}>
        <View style={styles.shoppingModeHeader}>
          <View style={styles.shoppingModeHeaderText}>
            <Text style={styles.shoppingModeEyebrow}>IM GESCHÄFT</Text>
            <Text style={styles.shoppingModeTitle}>Einkaufsmodus</Text>
          </View>
          <IconButton icon="close" onPress={() => setShoppingMode(false)} accessibilityLabel="Einkaufsmodus schließen" />
        </View>
        <View style={styles.shoppingModeProgressCard}>
          <View style={styles.shoppingModeProgressIcon}><MaterialCommunityIcons name={active.length ? 'cart-outline' : 'check-all'} size={23} color={colors.accent} /></View>
          <View style={styles.flex1}><Text style={styles.shoppingModeProgressValue}>{active.length ? `${active.length} noch offen` : 'Einkauf erledigt'}</Text><Text style={styles.shoppingModeProgressHint}>{active.length ? 'Produkt antippen, sobald es im Einkaufswagen liegt.' : 'Alle Produkte dieser Liste wurden abgehakt.'}</Text></View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.shoppingModeContent}>
          {active.length ? activeGroups.map((group) => <View key={group.key} style={styles.shoppingModeCategory}>
            <View style={styles.shoppingModeCategoryHeader}><Text style={styles.shoppingModeCategoryTitle}>{group.label}</Text><Text style={styles.shoppingModeCategoryCount}>{group.items.length}</Text></View>
            <View style={styles.shoppingModeList}>{group.items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} als erledigt markieren`} onPress={() => void toggle(item)} style={({ pressed }) => [styles.shoppingModeRow, pressed && styles.shoppingModeRowPressed]}>
              <View style={styles.shoppingModeCheck}><MaterialCommunityIcons name="check" size={18} color={colors.onAccent} /></View>
              <View style={styles.flex1}><Text style={styles.shoppingModeName}>{item.name}</Text><Text style={styles.shoppingModeMeta}>{formatAmount(item.amount)} {item.unit}{item.addedByName ? ` · von ${item.addedByName}` : ''}</Text></View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
            </Pressable>)}</View>
          </View>) : <SurfaceCard><EmptyState icon="cart-check" title="Alles eingekauft" text="Du kannst den Einkaufsmodus jetzt schließen." /></SurfaceCard>}
        </ScrollView>
      </SafeAreaView>
    </Modal>

'''
app = replace_once(
    app,
    "    <Modal transparent visible={addOpen} animationType=\"fade\" presentationStyle=\"overFullScreen\" onRequestClose={closeProductEditor}>",
    shopping_mode_modal + "    <Modal transparent visible={addOpen} animationType=\"fade\" presentationStyle=\"overFullScreen\" onRequestClose={closeProductEditor}>",
    'shopping mode modal',
)

# Theme preference wiring.
app = replace_once(
    app,
    "  const applyAppearance = (mode: ThemeMode, cozy = preferences.cozyMode) => {\n    const nextDark = mode === 'dark' || (mode === 'system' && Appearance.getColorScheme() === 'dark');\n    setThemePalette(nextDark ? 'dark' : 'light', cozy);",
    "  const applyAppearance = (mode: ThemeMode, cozy = preferences.cozyMode, neutralDark = preferences.neutralDarkMode) => {\n    const nextDark = mode === 'dark' || (mode === 'system' && Appearance.getColorScheme() === 'dark');\n    setThemePalette(nextDark ? 'dark' : 'light', cozy, neutralDark);",
    'appearance neutral signature',
)
app = replace_once(
    app,
    "    applyAppearance(next.themeMode, next.cozyMode);",
    "    applyAppearance(next.themeMode, next.cozyMode, next.neutralDarkMode);",
    'appearance preference update',
)
app = replace_once(
    app,
    "    loadPreferences().then((loaded) => { setPreferences(loaded); setTab(loaded.startTab); applyAppearance(loaded.themeMode, loaded.cozyMode); }).catch(() => undefined);",
    "    loadPreferences().then((loaded) => { setPreferences(loaded); setTab(loaded.startTab); applyAppearance(loaded.themeMode, loaded.cozyMode, loaded.neutralDarkMode); }).catch(() => undefined);",
    'appearance initial load',
)
app = replace_once(
    app,
    "      setThemePalette(colorScheme === 'dark' ? 'dark' : 'light', preferences.cozyMode);",
    "      setThemePalette(colorScheme === 'dark' ? 'dark' : 'light', preferences.cozyMode, preferences.neutralDarkMode);",
    'appearance system listener',
)
app = replace_once(
    app,
    "  }, [preferences.themeMode, preferences.cozyMode]);",
    "  }, [preferences.themeMode, preferences.cozyMode, preferences.neutralDarkMode]);",
    'appearance listener dependencies',
)

cozy_row = "  <View style={styles.preferenceRow}><View style={styles.flex1}><View style={styles.cozyTitleRow}><MaterialCommunityIcons name=\"weather-sunset\" size={19} color={colors.accent} /><Text style={styles.fieldLabel}>Cozy Mode</Text></View><Text style={styles.fieldHint}>Wärmere Farben und eine ruhigere, wohnlichere MealFlow-Atmosphäre.</Text></View><Switch value={preferences.cozyMode} onValueChange={(value) => update({ cozyMode: value })} trackColor={{ true: colors.accentSoft }} thumbColor={preferences.cozyMode ? colors.accent : undefined} /></View>"
neutral_row = cozy_row + "\n  <View style={styles.preferenceDivider} />\n  <View style={styles.preferenceRow}><View style={styles.flex1}><View style={styles.cozyTitleRow}><MaterialCommunityIcons name=\"circle-opacity\" size={19} color={colors.accent} /><Text style={styles.fieldLabel}>Neutral Dark Mode</Text></View><Text style={styles.fieldHint}>Im Dark Mode werden Akzente weiß und grau statt grün dargestellt. Hat im dunklen Modus Vorrang vor Cozy.</Text></View><Switch value={preferences.neutralDarkMode} onValueChange={(value) => update({ neutralDarkMode: value })} trackColor={{ true: colors.accentSoft }} thumbColor={preferences.neutralDarkMode ? colors.accent : undefined} /></View>"
app = replace_once(app, cozy_row, neutral_row, 'neutral dark setting')

# Make accent foregrounds theme-safe when the neutral dark accent is light.
app = app.replace('<MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />', '<MaterialCommunityIcons name="check" size={16} color={colors.onAccent} />')
app = app.replace('<MaterialCommunityIcons name="plus" size={31} color="#FFFFFF" />', '<MaterialCommunityIcons name="plus" size={31} color={colors.onAccent} />')
app = app.replace("color={recognizing ? '#FFFFFF' : colors.accent}", "color={recognizing ? colors.onAccent : colors.accent}")
app = app.replace("startTabChipTextActive: { color: '#FFFFFF' }", "startTabChipTextActive: { color: colors.onAccent }")
app = app.replace("shoppingAddButtonText: { ...typography.bodyStrong, color: '#FFFFFF' }", "shoppingAddButtonText: { ...typography.bodyStrong, color: colors.onAccent }")
app = app.replace("unitChipTextActive: { color: '#FFFFFF' }", "unitChipTextActive: { color: colors.onAccent }")
app = app.replace("filterBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '800' }", "filterBadgeText: { fontSize: 10, color: colors.onAccent, fontWeight: '800' }")
app = app.replace("dayDateDowToday: { color: '#DCEADF' }", "dayDateDowToday: { color: colors.onAccent }")
app = app.replace("dayDateNumberToday: { color: '#FFFFFF' }", "dayDateNumberToday: { color: colors.onAccent }")
app = app.replace("dayDateMonthToday: { color: '#DCEADF' }", "dayDateMonthToday: { color: colors.onAccent }")
app = app.replace("weekStripDayToday: { backgroundColor: colors.accentSoft, borderColor: '#AFC8B6' }", "weekStripDayToday: { backgroundColor: colors.accentSoft, borderColor: colors.accent }")
app = app.replace("dayCardToday: { borderColor: '#AFC8B6', backgroundColor: colors.surface }", "dayCardToday: { borderColor: colors.accent, backgroundColor: colors.surface }")

style_anchor = "  shoppingScreenContent: { paddingBottom: 112 },"
shopping_styles = """  shoppingModeRoot: { flex: 1, backgroundColor: colors.background },
  shoppingModeHeader: { minHeight: 68, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  shoppingModeHeaderText: { flex: 1 },
  shoppingModeEyebrow: { ...typography.label, color: colors.accent },
  shoppingModeTitle: { ...typography.h2, color: colors.text, marginTop: 2 },
  shoppingModeProgressCard: { marginHorizontal: 18, marginTop: 16, padding: 15, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  shoppingModeProgressIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  shoppingModeProgressValue: { ...typography.title, color: colors.text },
  shoppingModeProgressHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  shoppingModeContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 18 },
  shoppingModeCategory: { gap: 7 },
  shoppingModeCategoryHeader: { paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shoppingModeCategoryTitle: { ...typography.label, color: colors.textSecondary },
  shoppingModeCategoryCount: { ...typography.caption, color: colors.textTertiary },
  shoppingModeList: { overflow: 'hidden', borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  shoppingModeRow: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  shoppingModeRowPressed: { backgroundColor: colors.surfaceMuted },
  shoppingModeCheck: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  shoppingModeName: { ...typography.bodyStrong, color: colors.text },
  shoppingModeMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  shoppingModeLaunch: { minHeight: 42, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  shoppingModeLaunchPressed: { opacity: 0.72 },
  shoppingModeLaunchDisabled: { backgroundColor: colors.surfaceMuted },
  shoppingModeLaunchText: { ...typography.caption, color: colors.accent, fontWeight: '800' },
  shoppingModeLaunchTextDisabled: { color: colors.textTertiary },
""" + style_anchor
app = replace_once(app, style_anchor, shopping_styles, 'shopping mode styles')

app_path.write_text(app)


# ---------- Preferences ----------
prefs_path = Path('src/lib/preferences.ts')
prefs = prefs_path.read_text()
prefs = replace_once(prefs, "  cozyMode: boolean;", "  cozyMode: boolean;\n  neutralDarkMode: boolean;", 'preference type')
prefs = replace_once(prefs, "  cozyMode: false,", "  cozyMode: false,\n  neutralDarkMode: false,", 'preference default')
prefs = replace_once(prefs, "      cozyMode: Boolean(parsed.cozyMode),", "      cozyMode: Boolean(parsed.cozyMode),\n      neutralDarkMode: Boolean(parsed.neutralDarkMode),", 'preference loading')
prefs_path.write_text(prefs)


# ---------- Theme ----------
theme_path = Path('src/ui/theme.ts')
theme = theme_path.read_text()
# Add foreground color used on accent-filled controls.
theme = theme.replace("  accentStrong: '#214F33',", "  accentStrong: '#214F33',\n  onAccent: '#FFFFFF',", 1)
theme = theme.replace("  accentStrong: '#9AD8AB',", "  accentStrong: '#9AD8AB',\n  onAccent: '#FFFFFF',", 1)
theme = theme.replace("  accentStrong: '#74472F',", "  accentStrong: '#74472F',\n  onAccent: '#FFFFFF',", 1)
theme = theme.replace("  accentStrong: '#E7B48E',", "  accentStrong: '#E7B48E',\n  onAccent: '#FFFFFF',", 1)

neutral_palette = """
export const neutralDarkColors = {
  background: '#0D0D0F',
  surface: '#171719',
  surfaceMuted: '#232326',
  text: '#F7F7F8',
  textSecondary: '#C4C5C9',
  textTertiary: '#92949A',
  border: '#303136',
  accent: '#F0F0F2',
  accentSoft: '#2B2C30',
  accentStrong: '#FFFFFF',
  onAccent: '#111216',
  danger: '#F18484',
  dangerSoft: '#3A2020',
  warning: '#E1B86E',
  shadow: '#000000',
  overlay: 'rgba(0, 0, 0, 0.20)',
};

"""
theme = replace_once(theme, "export const colors = { ...lightColors };", neutral_palette + "export const colors = { ...lightColors };", 'neutral dark palette')
theme = replace_once(
    theme,
    "export function setThemePalette(palette: ThemePaletteName, cozy = false) {\n  if (cozy) {\n    Object.assign(colors, palette === 'dark' ? cozyDarkColors : cozyLightColors);\n    return;\n  }\n  Object.assign(colors, palette === 'dark' ? darkColors : lightColors);\n}",
    "export function setThemePalette(palette: ThemePaletteName, cozy = false, neutralDark = false) {\n  if (palette === 'dark' && neutralDark) {\n    Object.assign(colors, neutralDarkColors);\n    return;\n  }\n  if (cozy) {\n    Object.assign(colors, palette === 'dark' ? cozyDarkColors : cozyLightColors);\n    return;\n  }\n  Object.assign(colors, palette === 'dark' ? darkColors : lightColors);\n}",
    'theme palette function',
)
theme_path.write_text(theme)


# ---------- Shared UI ----------
components_path = Path('src/ui/components.tsx')
components = components_path.read_text()
components = replace_once(
    components,
    "  const foreground = variant === 'primary'\n    ? '#FFFFFF'",
    "  const foreground = variant === 'primary'\n    ? colors.onAccent",
    'primary button foreground',
)
components_path.write_text(components)


# ---------- Version metadata ----------
package_path = Path('package.json')
package = json.loads(package_path.read_text())
package['version'] = '2.3.3'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

lock_path = Path('package-lock.json')
lock = json.loads(lock_path.read_text())
lock['version'] = '2.3.3'
if isinstance(lock.get('packages'), dict) and '' in lock['packages']:
    lock['packages']['']['version'] = '2.3.3'
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n')

app_json_path = Path('app.json')
app_json = json.loads(app_json_path.read_text())
app_json['expo']['version'] = '2.3.3'
app_json['expo']['ios']['buildNumber'] = '27'
app_json['expo']['android']['versionCode'] = 27
app_json_path.write_text(json.dumps(app_json, ensure_ascii=False, indent=2) + '\n')

changelog_path = Path('CHANGELOG.md')
if changelog_path.exists():
    changelog = changelog_path.read_text()
else:
    changelog = '# Changelog\n\n'
entry = """## 2.3.3

- 4-Wochen-Plan beginnt mit der aktuellen Kalenderwoche; 31.08.–06.09.2026 wird korrekt angezeigt.
- Neuer fokussierter Einkaufsmodus für die Einkaufsliste mit Lidl-Kategorien und großen Abhak-Zeilen.
- Neuer Neutral Dark Mode: im dunklen Erscheinungsbild weiße/graue statt grüne Akzente.
- Theme-Kontraste für helle Akzentfarben verbessert.

"""
if '## 2.3.3' not in changelog:
    if changelog.startswith('# Changelog'):
        pos = changelog.find('\n') + 1
        changelog = changelog[:pos] + '\n' + entry + changelog[pos:].lstrip('\n')
    else:
        changelog = entry + changelog
    changelog_path.write_text(changelog)

print('MealFlow 2.3.3 patch applied')
