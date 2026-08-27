from pathlib import Path
import json


def must_replace(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, count)

# ---- App.tsx -------------------------------------------------------------
p = Path('App.tsx')
s = p.read_text()

s = must_replace(s, "  createHouseholdInvitation,\n", "  createHouseholdInvitation,\n  createHouseholdJoinCode,\n", 'cloud join code import')
s = must_replace(s, "  setShoppingDone,\n", "  setShoppingDone,\n  setHouseholdInvitePermission,\n", 'invite permission import')
s = must_replace(s, "import { getUrgentPantry, syncExpiryNotifications } from './src/lib/expiryNotifications';\n", "import { getUrgentPantry, syncExpiryNotifications } from './src/lib/expiryNotifications';\nimport { checkAndPromptAndroidUpdate } from './src/lib/androidUpdater';\n", 'android updater import')

old_quantity = """function QuantitySheet({ visible, amount, unit, onClose, onDone }: { visible: boolean; amount: number; unit: string; onClose: () => void; onDone: (amount: number, unit: string) => void }) {
  const [draftAmount, setDraftAmount] = useState(amount);
"""
new_quantity = """function QuantitySheet({ visible, amount, unit, onClose, onDone }: { visible: boolean; amount: number; unit: string; onClose: () => void; onDone: (amount: number, unit: string) => void }) {
  const insets = useSafeAreaInsets();
  const [draftAmount, setDraftAmount] = useState(amount);
"""
s = must_replace(s, old_quantity, new_quantity, 'quantity insets')
s = must_replace(s, '<View style={styles.bottomSheet}>\n        <View style={styles.sheetHandle} />', '<View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>\n        <View style={styles.sheetHandle} />', 'quantity bottom safe area')

# Replace household sheet as one coherent block.
household_start = s.index('function HouseholdSheet(')
household_end = s.index('function SettingsSheet(', household_start)
new_household = r'''function HouseholdSheet({ visible, household, invitations, onClose, onChanged }: { visible: boolean; household: Household; invitations: HouseholdInvitation[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [joinCode, setJoinCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [householdName, setHouseholdName] = useState(household.name);
  const [displayName, setDisplayName] = useState(household.myDisplayName);
  const [busy, setBusy] = useState(false);
  const canManage = household.role === 'owner' || household.role === 'admin';
  const isOwner = household.role === 'owner';
  const canInvite = household.canInvite;
  const swipeBack = useIosSwipeBack(onClose, visible);

  useEffect(() => {
    if (visible) {
      setHouseholdName(household.name);
      setDisplayName(household.myDisplayName);
      setJoinCode('');
      setInviteEmail('');
    }
  }, [visible, household.name, household.myDisplayName]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch (error: any) { Alert.alert('Haushalt', germanError(error?.message)); } finally { setBusy(false); }
  };

  const shareCode = () => run(async () => {
    const code = await createHouseholdJoinCode(household.id);
    await Share.share({ message: `Komm in meinen MealFlow-Haushalt „${household.name}“. Einladungscode: ${code}\n\nDer Code ist 14 Tage gültig und kann einmal verwendet werden.` });
  });

  const inviteByEmail = () => run(async () => {
    const email = inviteEmail.trim();
    if (!email.includes('@')) throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
    const code = await createHouseholdInvitation(household.id, email);
    const subject = encodeURIComponent(`Einladung zu ${household.name} in MealFlow`);
    const body = encodeURIComponent(`Du wurdest zu meinem MealFlow-Haushalt „${household.name}“ eingeladen.\n\nÖffne MealFlow und verwende den Einladungscode: ${code}`);
    const url = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else await Share.share({ message: `MealFlow-Einladung für ${email}: ${code}` });
    setInviteEmail('');
    Alert.alert('Einladung erstellt', 'Die Einladung ist 14 Tage gültig. Die E-Mail wurde vorbereitet.');
  });

  const join = () => run(async () => {
    if (!joinCode.trim()) throw new Error('Bitte gib einen Einladungscode ein.');
    await joinHouseholdByCode(joinCode);
    await onChanged();
    setJoinCode('');
    Alert.alert('Haushalt gewechselt', 'Du siehst jetzt die gemeinsamen Daten dieses Haushalts.');
  });

  const saveNames = () => run(async () => {
    if (canManage && householdName.trim() !== household.name) await renameHousehold(household.id, householdName);
    if (displayName.trim() !== household.myDisplayName) await updateMyDisplayName(displayName);
    await onChanged();
    Alert.alert('Gespeichert', 'Haushalt und Profil wurden aktualisiert.');
  });

  const changeInvitePermission = (member: Household['members'][number], allowed: boolean) => run(async () => {
    await setHouseholdInvitePermission(household.id, member.userId, allowed);
    await onChanged();
  });

  const accept = (invitation: HouseholdInvitation) => run(async () => {
    await acceptHouseholdInvitation(invitation.id);
    await onChanged();
    Alert.alert('Einladung angenommen', `Du bist jetzt Mitglied in „${invitation.householdName}“.`);
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.fullModal} edges={['top', 'bottom']} {...swipeBack.panHandlers}>
        <View style={styles.fullModalHeader}><IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" /><Text style={styles.fullModalTitle}>Haushalt</Text><View style={styles.headerSpacer} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
          <SurfaceCard style={styles.householdHero}>
            <View style={styles.householdIcon}><MaterialCommunityIcons name="home-heart" size={28} color={colors.accent} /></View>
            <View style={styles.flex1}><Text style={styles.householdHeroLabel}>AKTIVER HAUSHALT</Text><Text style={styles.householdHeroTitle}>{household.name}</Text><Text style={styles.householdHeroMeta}>{household.members.length} {household.members.length === 1 ? 'Mitglied' : 'Mitglieder'} · gemeinsame Daten in Echtzeit</Text></View>
          </SurfaceCard>

          {invitations.length ? <><SectionTitle title="Offene Einladungen" />{invitations.map((invite) => <SurfaceCard key={invite.id} style={styles.inviteCard}><View style={styles.flex1}><Text style={styles.memberName}>{invite.householdName}</Text><Text style={styles.memberMeta}>Einladung für {invite.email}</Text></View><ActionButton label="Annehmen" onPress={() => accept(invite)} style={styles.smallAction} /></SurfaceCard>)}</> : null}

          <SectionTitle title="Mitglieder" />
          <SurfaceCard style={styles.listCard}>{household.members.map((member) => <View key={member.userId} style={styles.memberPermissionBlock}>
            <View style={styles.memberRow}><View style={styles.avatar}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.flex1}><Text style={styles.memberName}>{member.displayName}{member.displayName === household.myDisplayName ? ' · Du' : ''}</Text><Text style={styles.memberMeta}>{member.role === 'owner' ? 'Ersteller · darf immer einladen' : member.role === 'admin' ? 'Admin' : 'Mitglied'}{member.role !== 'owner' && member.canInvite ? ' · darf einladen' : ''}</Text></View></View>
            {isOwner && member.role !== 'owner' ? <View style={styles.memberInvitePermissionRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Neue Personen einladen</Text><Text style={styles.fieldHint}>Dieses Recht kann nur der Haushaltsersteller vergeben.</Text></View><Switch value={member.canInvite} disabled={busy} onValueChange={(allowed) => changeInvitePermission(member, allowed)} trackColor={{ true: colors.accentSoft }} thumbColor={member.canInvite ? colors.accent : undefined} /></View> : null}
          </View>)}</SurfaceCard>

          <SectionTitle title="Einladen" />
          {canInvite ? <>
            <SurfaceCard style={styles.inviteCodeCard}>
              <Text style={styles.fieldLabel}>Einladungscode erstellen</Text><Text style={styles.fieldHint}>MealFlow erzeugt einen neuen, 14 Tage gültigen Einmal-Code. Der alte permanente Haushaltscode wird aus Sicherheitsgründen nicht mehr verwendet.</Text><ActionButton label="Einladungscode teilen" icon="share-variant-outline" variant="secondary" onPress={shareCode} loading={busy} />
            </SurfaceCard>
            <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Per E-Mail einladen</Text><TextInput value={inviteEmail} onChangeText={setInviteEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@beispiel.at" placeholderTextColor={colors.textTertiary} style={styles.formInput} /><ActionButton label="E-Mail-Einladung erstellen" icon="email-fast-outline" onPress={inviteByEmail} loading={busy} /></SurfaceCard>
          </> : <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Einladen ist eingeschränkt</Text><Text style={styles.fieldHint}>Standardmäßig kann nur der Haushaltsersteller neue Personen einladen. Er kann dir dieses Recht in der Mitgliederliste freigeben.</Text></SurfaceCard>}

          <SectionTitle title="Beitreten" />
          <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Einladungscode verwenden</Text><TextInput value={joinCode} onChangeText={(value) => setJoinCode(value.toUpperCase())} autoCapitalize="characters" placeholder="CODE EINGEBEN" placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.codeInput]} /><ActionButton label="Haushalt beitreten" icon="home-plus-outline" variant="secondary" onPress={join} loading={busy} /></SurfaceCard>

          <SectionTitle title="Profil & Haushalt" />
          <SurfaceCard style={styles.settingsBlock}>
            <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Dein Name im Haushalt</Text><TextInput value={displayName} onChangeText={setDisplayName} placeholder="Vorname" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View>
            {canManage ? <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Name des Haushalts</Text><TextInput value={householdName} onChangeText={setHouseholdName} placeholder="Unser Haushalt" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View> : null}
            <ActionButton label="Änderungen speichern" icon="content-save-outline" onPress={saveNames} loading={busy} />
          </SurfaceCard>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

'''
s = s[:household_start] + new_household + s[household_end:]

# Settings: safe-area padding and Android updater UI.
s = must_replace(s, "  const update = (patch: Partial<AppPreferences>) => onPreferencesChange({ ...preferences, ...patch });\n", "  const insets = useSafeAreaInsets();\n  const [updateBusy, setUpdateBusy] = useState(false);\n  const update = (patch: Partial<AppPreferences>) => onPreferencesChange({ ...preferences, ...patch });\n  const checkAndroidUpdate = async () => {\n    setUpdateBusy(true);\n    try { await checkAndPromptAndroidUpdate(true); } finally { setUpdateBusy(false); }\n  };\n", 'settings hooks')
s = must_replace(s, '<View style={styles.settingsSheetV214} renderToHardwareTextureAndroid>', '<View style={[styles.settingsSheetV214, { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 18) }]} renderToHardwareTextureAndroid>', 'settings safe area')
s = must_replace(s, "<Text style={styles.settingsMeta}>{household.members.length} Mitglieder · Code {household.inviteCode}{pendingInvites ? ` · ${pendingInvites} offene Einladung` : ''}</Text>", "<Text style={styles.settingsMeta}>{household.members.length} Mitglieder{household.canInvite ? ' · Einladen erlaubt' : ''}{pendingInvites ? ` · ${pendingInvites} offene Einladung` : ''}</Text>", 'settings household metadata')
account_anchor = '<SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="account-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>Angemeldet als</Text>'
update_block = '''{Platform.OS === 'android' ? <><Text style={styles.settingsSectionTitle}>Updates</Text><SurfaceCard style={styles.settingsBlock}><View style={styles.preferenceRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Android Auto-Updater</Text><Text style={styles.fieldHint}>MealFlow prüft beim Start automatisch auf eine neue APK. Die Installation benötigt nur noch die Android-Sicherheitsbestätigung.</Text></View><MaterialCommunityIcons name="update" size={24} color={colors.accent} /></View><ActionButton label="Nach Updates suchen" icon="download-outline" variant="secondary" onPress={checkAndroidUpdate} loading={updateBusy} /></SurfaceCard></> : null}\n          ''' + account_anchor
s = must_replace(s, account_anchor, update_block, 'settings updater card')

# Plan and shopping forms: keep Android navigation/gesture bar out of sheets.
plan_sig = "function PlanScreen({ household, meals, setMeals, onSettings }: { household: Household; meals: Record<string, string>; setMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; onSettings: () => void }) {\n"
s = must_replace(s, plan_sig, plan_sig + "  const insets = useSafeAreaInsets();\n", 'plan safe area')
s = must_replace(s, '<View style={styles.editorSheet}><SheetDismissHandle onClose={closeEditor} />', '<View style={[styles.editorSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}><SheetDismissHandle onClose={closeEditor} />', 'plan editor safe bottom')
s = s.replace("behavior={Platform.OS === 'ios' ? 'padding' : undefined}", "behavior={Platform.OS === 'ios' ? 'padding' : 'height'}")

shopping_anchor = "}) {\n  const [addOpen, setAddOpen] = useState(false);\n"
shopping_repl = "}) {\n  const insets = useSafeAreaInsets();\n  const [addOpen, setAddOpen] = useState(false);\n"
# Only replace the occurrence that is followed by ShoppingScreen state.
idx = s.index('function ShoppingScreen(')
part = s[idx:]
if shopping_anchor not in part:
    raise SystemExit('missing anchor: shopping safe area')
part = part.replace(shopping_anchor, shopping_repl, 1)
s = s[:idx] + part
s = must_replace(s, '<View style={styles.shoppingAddSheet} renderToHardwareTextureAndroid>', '<View style={[styles.shoppingAddSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} renderToHardwareTextureAndroid>', 'shopping safe bottom')

# Automatic Android update check once the real startup load is done.
theme_effect = """  useEffect(() => {
    if (preferences.themeMode !== 'system') return;
"""
auto_update_effect = """  useEffect(() => {
    if (!ready || Platform.OS !== 'android') return;
    const timer = setTimeout(() => { checkAndPromptAndroidUpdate(false).catch(() => undefined); }, 1400);
    return () => clearTimeout(timer);
  }, [ready]);

""" + theme_effect
s = must_replace(s, theme_effect, auto_update_effect, 'auto update effect')

# Member invite permission styles.
style_anchor = "memberMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, inviteCodeCard:"
style_repl = "memberMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, memberPermissionBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, memberInvitePermissionRow: { minHeight: 68, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceMuted }, inviteCodeCard:"
s = must_replace(s, style_anchor, style_repl, 'member permission styles')

p.write_text(s)

# ---- cloud.ts ------------------------------------------------------------
p = Path('src/lib/cloud.ts')
s = p.read_text()
s = must_replace(s, "  joinedAt: string;\n};", "  joinedAt: string;\n  canInvite: boolean;\n};", 'member canInvite type')
s = must_replace(s, "  myDisplayName: string;\n  members: HouseholdMember[];", "  myDisplayName: string;\n  canInvite: boolean;\n  members: HouseholdMember[];", 'household canInvite type')
s = must_replace(s, ".select('user_id,role,joined_at')", ".select('user_id,role,joined_at,can_invite')", 'member select can_invite')
s = must_replace(s, "    joinedAt: String(row.joined_at),\n  }));", "    joinedAt: String(row.joined_at),\n    canInvite: row.role === 'owner' || Boolean(row.can_invite),\n  }));", 'member map can_invite')
s = must_replace(s, "    myDisplayName: String(myProfile.display_name || own?.displayName || 'Mitglied'),\n    members,", "    myDisplayName: String(myProfile.display_name || own?.displayName || 'Mitglied'),\n    canInvite: own?.role === 'owner' || Boolean(own?.canInvite),\n    members,", 'household return canInvite')
invite_func_anchor = """export async function createHouseholdInvitation(householdId: string, email: string): Promise<string> {
  const { data, error } = await requireCloud().rpc('create_household_invitation', {
    target_household: householdId,
    target_email: email.trim(),
  });
  if (error) throw error;
  return String(data);
}
"""
invite_funcs = invite_func_anchor + """
export async function createHouseholdJoinCode(householdId: string): Promise<string> {
  const { data, error } = await requireCloud().rpc('create_household_join_code', { target_household: householdId });
  if (error) throw error;
  return String(data);
}

export async function setHouseholdInvitePermission(householdId: string, userId: string, allowed: boolean) {
  const { error } = await requireCloud().rpc('set_household_invite_permission', {
    target_household: householdId,
    target_user: userId,
    allowed,
  });
  if (error) throw error;
}
"""
s = must_replace(s, invite_func_anchor, invite_funcs, 'household permission functions')
p.write_text(s)

# ---- InventoryScreen.tsx -------------------------------------------------
p = Path('src/screens/InventoryScreen.tsx')
s = p.read_text()
s = must_replace(s, "import * as Haptics from 'expo-haptics';\nimport { SafeAreaView } from 'react-native-safe-area-context';", "import * as Haptics from 'expo-haptics';\nimport DateTimePicker from '@react-native-community/datetimepicker';\nimport { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';", 'date picker imports')

format_anchor = """function formatExpiry(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
"""
format_extra = format_anchor + """
function expiryPickerDate(value: string) {
  try {
    const iso = parseExpiry(value);
    if (iso) return new Date(`${iso}T12:00:00`);
  } catch {}
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

function expiryDraftFromDate(date: Date) {
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
"""
s = must_replace(s, format_anchor, format_extra, 'date helpers')

screen_anchor = "export function InventoryScreen({ onSettings, hapticsEnabled }: { onSettings: () => void; hapticsEnabled: boolean }) {\n"
s = must_replace(s, screen_anchor, screen_anchor + "  const insets = useSafeAreaInsets();\n", 'inventory safe area hook')
s = must_replace(s, "  const [editing, setEditing] = useState<PantryItem | null>(null);\n", "  const [editing, setEditing] = useState<PantryItem | null>(null);\n  const [showExpiryPicker, setShowExpiryPicker] = useState(false);\n", 'expiry picker state')
s = must_replace(s, "    setEditing(null);\n    setDraft({\n      ...EMPTY_DRAFT,", "    setEditing(null);\n    setShowExpiryPicker(false);\n    setDraft({\n      ...EMPTY_DRAFT,", 'manual picker reset')
s = must_replace(s, "  const openEdit = (item: PantryItem) => {\n    feedback();\n    setEditing(item);", "  const openEdit = (item: PantryItem) => {\n    feedback();\n    setEditing(item);\n    setShowExpiryPicker(false);", 'edit picker reset')
s = must_replace(s, "    setEditing(null);\n    setEditorOpen(true);\n  };\n\n  const handleBarcode", "    setEditing(null);\n    setShowExpiryPicker(false);\n    setEditorOpen(true);\n  };\n\n  const handleBarcode", 'scanned picker reset')

old_mhd = '''              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>MHD <Text style={styles.optional}>optional</Text></Text><TextInput value={draft.expiry} onChangeText={(value) => setDraft((current) => ({ ...current, expiry: value }))} keyboardType="numbers-and-punctuation" placeholder="TT.MM.JJJJ" placeholderTextColor={colors.textTertiary} style={styles.formInput} /><Text style={styles.fieldHint}>Bei einem MHD plant MealFlow automatisch Erinnerungen.</Text></View>'''
new_mhd = '''              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>MHD <Text style={styles.optional}>optional</Text></Text><View style={styles.dateFieldRow}><Pressable onPress={() => setShowExpiryPicker(true)} style={styles.dateField}><MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.accent} /><Text style={[styles.dateFieldText, !draft.expiry && styles.dateFieldPlaceholder]}>{draft.expiry || 'Datum auswählen'}</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} /></Pressable>{draft.expiry ? <Pressable accessibilityLabel="MHD entfernen" onPress={() => { setDraft((current) => ({ ...current, expiry: '' })); setShowExpiryPicker(false); }} style={styles.dateClearButton}><MaterialCommunityIcons name="close" size={19} color={colors.textSecondary} /></Pressable> : null}</View>{showExpiryPicker ? <DateTimePicker value={expiryPickerDate(draft.expiry)} mode="date" display={Platform.OS === 'ios' ? 'compact' : 'default'} onChange={(_event, date) => { if (Platform.OS === 'android') setShowExpiryPicker(false); if (date) { setDraft((current) => ({ ...current, expiry: expiryDraftFromDate(date) })); if (Platform.OS === 'ios') setShowExpiryPicker(false); } }} /> : null}<Text style={styles.fieldHint}>Bei einem MHD plant MealFlow automatisch Erinnerungen.</Text></View>'''
s = must_replace(s, old_mhd, new_mhd, 'native MHD picker')

s = must_replace(s, '<View style={styles.editorSheet}>\n            <View {...editorSwipe.panHandlers}', '<View style={[styles.editorSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>\n            <View {...editorSwipe.panHandlers}', 'inventory editor safe bottom')
s = s.replace("behavior={Platform.OS === 'ios' ? 'padding' : undefined}", "behavior={Platform.OS === 'ios' ? 'padding' : 'height'}")
style_anchor = "    formInput: { minHeight: 50, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 13, ...typography.body, color: colors.text },\n"
style_repl = style_anchor + "    dateFieldRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },\n    dateField: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },\n    dateFieldText: { ...typography.body, color: colors.text, flex: 1 },\n    dateFieldPlaceholder: { color: colors.textTertiary },\n    dateClearButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },\n"
s = must_replace(s, style_anchor, style_repl, 'date picker styles')
p.write_text(s)

# ---- app.json ------------------------------------------------------------
p = Path('app.json')
config = json.loads(p.read_text())
expo = config['expo']
expo['version'] = '2.2.3'
expo['ios']['buildNumber'] = '15'
expo['android']['versionCode'] = 15
permissions = expo['android'].setdefault('permissions', [])
if 'REQUEST_INSTALL_PACKAGES' not in permissions:
    permissions.append('REQUEST_INSTALL_PACKAGES')
expo['androidStatusBar'] = {'translucent': False}
p.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

# package version is pinned here; Expo-compatible dependency versions are added by workflow.
p = Path('package.json')
pkg = json.loads(p.read_text())
pkg['version'] = '2.2.3'
p.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

# ---- Android workflow ----------------------------------------------------
p = Path('.github/workflows/build-android-apk.yml')
p.write_text(r'''name: Build Android APK

on:
  push:
    branches: [main]
    paths-ignore:
      - source.json
      - android-update.json
      - README.md
      - supabase/migrations/**
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: mealflow-android-apk
  cancel-in-progress: true

jobs:
  build-apk:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup Java
        uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '17'

      - name: Install dependencies
        run: npm install --ignore-scripts

      - name: Typecheck
        run: npm run typecheck

      - name: Prepare Android release metadata
        id: meta
        run: |
          VERSION=$(node -p "require('./app.json').expo.version")
          VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode")
          RELEASE_TAG="android-v${VERSION}-b${GITHUB_RUN_NUMBER}"
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "version_code=$VERSION_CODE" >> "$GITHUB_OUTPUT"
          echo "tag=$RELEASE_TAG" >> "$GITHUB_OUTPUT"

      - name: Generate app icon
        run: npm run generate:icon

      - name: Generate Android project
        run: npx expo prebuild --platform android --clean --no-install

      - name: Configure standalone sideload signing
        run: |
          python3 - <<'PY'
          from pathlib import Path
          import re
          path = Path('android/app/build.gradle')
          source = path.read_text()
          pattern = r'(release\s*\{\s*\n)'
          replacement = r'\1            signingConfig signingConfigs.debug\n'
          updated, count = re.subn(pattern, replacement, source, count=1)
          if count != 1:
              raise SystemExit('Could not configure release signing')
          path.write_text(updated)
          PY

      - name: Build signed release APK
        working-directory: android
        run: ./gradlew assembleRelease

      - name: Collect APK
        run: |
          mkdir -p release
          cp android/app/build/outputs/apk/release/app-release.apk release/MealFlow-Android.apk

      - name: Verify APK signature
        run: |
          APKSIGNER="$(find "$ANDROID_HOME/build-tools" -type f -name apksigner | sort -V | tail -n 1)"
          test -x "$APKSIGNER"
          "$APKSIGNER" verify --verbose --print-certs release/MealFlow-Android.apk
          "$APKSIGNER" verify --verbose release/MealFlow-Android.apk | grep -Eq 'Verified using v2 scheme.*true|Verified using v3 scheme.*true|Verified using v4 scheme.*true'

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: MealFlow-Android-APK
          path: release/MealFlow-Android.apk
          if-no-files-found: error

      - name: Publish Android release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "${{ steps.meta.outputs.tag }}" \
            release/MealFlow-Android.apk \
            --target "$GITHUB_SHA" \
            --title "MealFlow Android ${{ steps.meta.outputs.version }} (Build ${{ github.run_number }})" \
            --notes "Automatischer signierter Android-Sideload-Build aus main." \
            --latest=false

      - name: Generate Android updater manifest
        run: |
          RELEASE_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
          APK_SIZE=$(stat -c%s release/MealFlow-Android.apk)
          APK_SHA256=$(sha256sum release/MealFlow-Android.apk | awk '{print $1}')
          DOWNLOAD_URL="https://github.com/redshoxx/MealFlow/releases/download/${{ steps.meta.outputs.tag }}/MealFlow-Android.apk"
          cat > android-update.json <<EOF
          {
            "version": "${{ steps.meta.outputs.version }}",
            "versionCode": ${{ steps.meta.outputs.version_code }},
            "releasedAt": "$RELEASE_DATE",
            "downloadUrl": "$DOWNLOAD_URL",
            "size": $APK_SIZE,
            "sha256": "$APK_SHA256"
          }
          EOF
          python3 -m json.tool android-update.json >/dev/null

      - name: Publish Android updater manifest
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          CONTENT=$(base64 -w 0 android-update.json)
          API_PATH="repos/${GITHUB_REPOSITORY}/contents/android-update.json"
          for ATTEMPT in 1 2 3 4 5; do
            CURRENT_SHA=$(gh api "$API_PATH?ref=main" --jq '.sha' 2>/dev/null || true)
            if [ -n "$CURRENT_SHA" ]; then
              if gh api --method PUT "$API_PATH" -f message="chore: update Android updater manifest [skip ci]" -f content="$CONTENT" -f branch="main" -f sha="$CURRENT_SHA" >/dev/null; then exit 0; fi
            else
              if gh api --method PUT "$API_PATH" -f message="chore: create Android updater manifest [skip ci]" -f content="$CONTENT" -f branch="main" >/dev/null; then exit 0; fi
            fi
            sleep $((ATTEMPT * 2))
          done
          echo "Could not publish android-update.json after retries" >&2
          exit 1
''')

# iOS should not rebuild just because Android publishes its updater manifest.
p = Path('.github/workflows/build-ios-sidestore.yml')
s = p.read_text()
s = must_replace(s, "      - source.json\n      - README.md", "      - source.json\n      - android-update.json\n      - README.md", 'ios ignore android manifest')
p.write_text(s)

# Changelog
p = Path('CHANGELOG.md')
s = p.read_text()
entry = '''# MealFlow Changelog\n\n## 2.2.3\n\n- Android Auto-Updater: prüft beim Start automatisch das offizielle MealFlow-Update-Manifest, lädt neue APKs direkt von GitHub Releases und öffnet anschließend den Android-Installer.\n- Android-Einstellungen enthalten zusätzlich eine manuelle Aktion „Nach Updates suchen“.\n- Android-System-/Gestenleiste kollidiert nicht mehr mit den wichtigsten unteren Formularen und Sheets; Safe-Area-Abstände gelten jetzt auch dort.\n- Einstellungen und Haushaltsverwaltung respektieren auf iPhone und Android die obere und untere Safe Area.\n- MHD kann auf Android und iPhone über eine native Datumsauswahl gesetzt und wieder entfernt werden.\n- Haushaltsrechte verschärft: Standardmäßig darf nur der Haushaltsersteller neue Personen einladen.\n- Der Haushaltsersteller kann einzelnen Mitgliedern das Recht „Neue Personen einladen“ geben oder wieder entziehen.\n- Permanente Haushaltscodes werden nicht mehr zum Beitritt akzeptiert; neue geteilte Codes sind 14 Tage gültige Einmal-Einladungen.\n- Android-Builds werden zusätzlich als GitHub Release veröffentlicht und erzeugen automatisch `android-update.json` für den In-App-Updater.\n- Version 2.2.3, iOS Build 15, Android Version Code 15.\n\n'''
if s.startswith('# MealFlow Changelog\n\n'):
    s = entry + s[len('# MealFlow Changelog\n\n'):]
else:
    raise SystemExit('changelog header missing')
p.write_text(s)
