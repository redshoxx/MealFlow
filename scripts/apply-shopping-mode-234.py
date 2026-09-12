from pathlib import Path
import json

app = Path('App.tsx')
text = app.read_text(encoding='utf-8')

old = '''<View style={styles.shoppingModeOpenCheck}><View style={styles.shoppingModeOpenCheckInner} /></View>'''
new = '''<View style={styles.shoppingModeOpenCheck}>
                <MaterialCommunityIcons name="circle-outline" size={30} color={colors.textTertiary} />
              </View>'''
if old not in text:
    raise SystemExit('shopping mode open-check markup not found')
text = text.replace(old, new, 1)

old_style = "shoppingModeContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 20 },\n  shoppingModeCategory: { gap: 8 },\n  shoppingModeCategoryHeader: { paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },\n  shoppingModeCategoryTitle: { ...typography.bodyStrong, color: colors.textSecondary },\n  shoppingModeCategoryCount: { minWidth: 26, height: 26, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', paddingTop: Platform.OS === 'ios' ? 4 : 1, ...typography.caption, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, fontWeight: '800' },\n  shoppingModeList: { overflow: 'hidden', borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },\n  shoppingModeRow: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },\n  shoppingModeRowPressed: { backgroundColor: colors.surfaceMuted },\n  shoppingModeOpenCheck: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.textTertiary, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },\n  shoppingModeOpenCheckInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'transparent' },"
new_style = "shoppingModeContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 30, gap: 14 },\n  shoppingModeCategory: { gap: 6 },\n  shoppingModeCategoryHeader: { paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },\n  shoppingModeCategoryTitle: { ...typography.bodyStrong, color: colors.textSecondary, fontSize: 15 },\n  shoppingModeCategoryCount: { minWidth: 24, height: 24, borderRadius: 12, textAlign: 'center', textAlignVertical: 'center', paddingTop: Platform.OS === 'ios' ? 3 : 1, ...typography.caption, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, fontWeight: '800' },\n  shoppingModeList: { overflow: 'hidden', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },\n  shoppingModeRow: { minHeight: 62, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },\n  shoppingModeRowPressed: { backgroundColor: colors.surfaceMuted },\n  shoppingModeOpenCheck: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },\n  shoppingModeOpenCheckInner: { width: 0, height: 0, backgroundColor: 'transparent' },"
if old_style not in text:
    raise SystemExit('shopping mode style block not found')
text = text.replace(old_style, new_style, 1)

# Bump native/app versions.
app.write_text(text, encoding='utf-8')

pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version'] = '2.3.4'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = Path('package-lock.json')
lock = json.loads(lock_path.read_text(encoding='utf-8'))
lock['version'] = '2.3.4'
if isinstance(lock.get('packages'), dict) and '' in lock['packages']:
    lock['packages']['']['version'] = '2.3.4'
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

cfg_path = Path('app.json')
cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
expo = cfg['expo']
expo['version'] = '2.3.4'
expo['ios']['buildNumber'] = '28'
expo['android']['versionCode'] = 28
cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('MealFlow 2.3.4 shopping mode patch applied')
