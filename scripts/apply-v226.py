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
    "  renameHousehold,\n  saveMeal,",
    "  renameHousehold,\n  removeHouseholdMember,\n  saveMeal,",
    'cloud import removeHouseholdMember',
)

app = replace_once(
    app,
    "function HouseholdSheet({ visible, household, invitations, onClose, onChanged }: { visible: boolean; household: Household; invitations: HouseholdInvitation[]; onClose: () => void; onChanged: () => Promise<void> }) {\n  const [joinCode, setJoinCode] = useState('');",
    "function HouseholdSheet({ visible, household, invitations, onClose, onChanged }: { visible: boolean; household: Household; invitations: HouseholdInvitation[]; onClose: () => void; onChanged: () => Promise<void> }) {\n  const insets = useSafeAreaInsets();\n  const [joinCode, setJoinCode] = useState('');",
    'household insets',
)

app = replace_once(
    app,
    "  const changeInvitePermission = (member: Household['members'][number], allowed: boolean) => run(async () => {\n    await setHouseholdInvitePermission(household.id, member.userId, allowed);\n    await onChanged();\n  });\n\n  const accept =",
    "  const changeInvitePermission = (member: Household['members'][number], allowed: boolean) => run(async () => {\n    await setHouseholdInvitePermission(household.id, member.userId, allowed);\n    await onChanged();\n  });\n\n  const confirmRemoveMember = (member: Household['members'][number]) => {\n    Alert.alert(\n      'Mitglied entfernen',\n      `Soll ${member.displayName} wirklich aus „${household.name}“ entfernt werden?`,\n      [\n        { text: 'Abbrechen', style: 'cancel' },\n        {\n          text: 'Entfernen',\n          style: 'destructive',\n          onPress: () => {\n            void run(async () => {\n              await removeHouseholdMember(household.id, member.userId);\n              await onChanged();\n            });\n          },\n        },\n      ],\n    );\n  };\n\n  const accept =",
    'remove member action',
)

old_member_row = "            <View style={styles.memberRow}><View style={styles.avatar}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.flex1}><Text style={styles.memberName}>{member.displayName}{member.displayName === household.myDisplayName ? ' · Du' : ''}</Text><Text style={styles.memberMeta}>{member.role === 'owner' ? 'Ersteller · darf immer einladen' : member.role === 'admin' ? 'Admin' : 'Mitglied'}{member.role !== 'owner' && member.canInvite ? ' · darf einladen' : ''}</Text></View></View>"
new_member_row = "            <View style={styles.memberRow}><View style={styles.avatar}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.flex1}><Text style={styles.memberName}>{member.displayName}{member.displayName === household.myDisplayName ? ' · Du' : ''}</Text><Text style={styles.memberMeta}>{member.role === 'owner' ? 'Ersteller · darf immer einladen' : member.role === 'admin' ? 'Admin' : 'Mitglied'}{member.role !== 'owner' && member.canInvite ? ' · darf einladen' : ''}</Text></View>{isOwner && member.role !== 'owner' ? <IconButton icon=\"account-remove-outline\" tone=\"danger\" onPress={() => confirmRemoveMember(member)} accessibilityLabel={`${member.displayName} aus Haushalt entfernen`} /> : null}</View>"
app = replace_once(app, old_member_row, new_member_row, 'member row remove icon')

app = replace_once(
    app,
    "      <SafeAreaView style={styles.fullModal} edges={['top', 'bottom']} {...swipeBack.panHandlers}>",
    "      <SafeAreaView style={[styles.fullModal, { paddingTop: Math.max(insets.top + 6, Platform.OS === 'ios' ? 54 : 30) }]} edges={['bottom']} {...swipeBack.panHandlers}>",
    'household modal safe area',
)

app = replace_once(
    app,
    "    <ScrollView contentInsetAdjustmentBehavior=\"automatic\" contentContainerStyle={styles.screenContent}>\n      <ScreenHeader title=\"Einkauf\"",
    "    <ScrollView contentInsetAdjustmentBehavior=\"automatic\" contentContainerStyle={[styles.screenContent, styles.shoppingScreenContent]}>\n      <ScreenHeader title=\"Einkauf\"",
    'shopping scroll padding',
)

app = replace_once(
    app,
    "      <View style={styles.shoppingToolbar}><View><Text style={styles.shoppingToolbarLabel}>GEMEINSAME LISTE</Text><Text style={styles.shoppingToolbarTitle}>{active.length ? `${active.length} noch zu besorgen` : 'Alles erledigt'}</Text></View><Pressable onPress={openAdd} style={styles.shoppingAddButton}><MaterialCommunityIcons name=\"plus\" size={23} color=\"#FFFFFF\" /><Text style={styles.shoppingAddButtonText}>Produkt</Text></Pressable></View>",
    "      <View style={styles.shoppingToolbar}><View><Text style={styles.shoppingToolbarLabel}>GEMEINSAME LISTE</Text><Text style={styles.shoppingToolbarTitle}>{active.length ? `${active.length} noch zu besorgen` : 'Alles erledigt'}</Text></View></View>",
    'remove shopping toolbar add button',
)

app = replace_once(
    app,
    "    </ScrollView>\n\n    <Modal transparent visible={addOpen}",
    "    </ScrollView>\n\n    <Pressable accessibilityRole=\"button\" accessibilityLabel=\"Produkt hinzufügen\" onPress={openAdd} style={({ pressed }) => [styles.shoppingFab, pressed && styles.shoppingFabPressed]}>\n      <MaterialCommunityIcons name=\"plus\" size={31} color=\"#FFFFFF\" />\n    </Pressable>\n\n    <Modal transparent visible={addOpen}",
    'shopping floating add button',
)

app = replace_once(
    app,
    "  shoppingToolbar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },\n  shoppingToolbarLabel:",
    "  shoppingScreenContent: { paddingBottom: 112 },\n  shoppingToolbar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },\n  shoppingFab: { position: 'absolute', right: 18, bottom: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...getShadow() },\n  shoppingFabPressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },\n  shoppingToolbarLabel:",
    'shopping fab styles',
)

app_path.write_text(app)

cloud_path = Path('src/lib/cloud.ts')
cloud = cloud_path.read_text()
cloud = replace_once(
    cloud,
    "export async function loadPendingHouseholdInvitations(): Promise<HouseholdInvitation[]> {",
    "export async function removeHouseholdMember(householdId: string, userId: string) {\n  const { error } = await requireCloud().rpc('remove_household_member', {\n    target_household: householdId,\n    target_user: userId,\n  });\n  if (error) throw error;\n}\n\nexport async function loadPendingHouseholdInvitations(): Promise<HouseholdInvitation[]> {",
    'cloud remove member rpc',
)
cloud_path.write_text(cloud)

package_path = Path('package.json')
package = json.loads(package_path.read_text())
package['version'] = '2.2.6'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

app_json_path = Path('app.json')
config = json.loads(app_json_path.read_text())
config['expo']['version'] = '2.2.6'
config['expo']['ios']['buildNumber'] = '18'
config['expo']['android']['versionCode'] = 18
app_json_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text()
section = """## 2.2.6

- Einkaufsliste: Produkt-Hinzufügen ist jetzt ein einzelner schwebender Plus-Button unten rechts.
- Haushaltsersteller können andere Mitglieder mit Bestätigung aus dem Haushalt entfernen.
- Entfernen von Mitgliedern ist zusätzlich serverseitig über eine geschützte Supabase-RPC abgesichert.
- Haushaltsseite berücksichtigt Statusleiste, Notch und Dynamic Island auf iPhone sowie Android-Statusleisten explizit.
- Version 2.2.6, iOS Build 18, Android Version Code 18.

"""
if '## 2.2.6' not in changelog:
    changelog = changelog.replace('# MealFlow Changelog\n\n', '# MealFlow Changelog\n\n' + section, 1)
changelog_path.write_text(changelog)

migration = Path('supabase/migrations/202608272154_mealflow_2_2_6_remove_household_members.sql')
migration.write_text("""create or replace function public.remove_household_member(target_household uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  replacement_household uuid;
begin
  if caller is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if not exists (
    select 1 from public.households h
    where h.id = target_household and h.created_by = caller
  ) then
    raise exception 'Nur der Haushaltsersteller darf Mitglieder entfernen.';
  end if;

  if target_user = caller then
    raise exception 'Der Haushaltsersteller kann sich nicht selbst entfernen.';
  end if;

  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = target_user
  ) then
    raise exception 'Dieses Mitglied gehört nicht zum Haushalt.';
  end if;

  if exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = target_user and hm.role = 'owner'
  ) then
    raise exception 'Der Haushaltsersteller kann nicht entfernt werden.';
  end if;

  delete from public.household_members
  where household_id = target_household and user_id = target_user;

  if exists (
    select 1 from public.profiles p
    where p.id = target_user and p.active_household_id = target_household
  ) then
    select hm.household_id into replacement_household
    from public.household_members hm
    where hm.user_id = target_user
    order by hm.joined_at asc
    limit 1;

    update public.profiles
    set active_household_id = replacement_household,
        updated_at = now()
    where id = target_user;
  end if;
end;
$$;

revoke all on function public.remove_household_member(uuid, uuid) from public;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
""")

print('MealFlow 2.2.6 patch applied')
