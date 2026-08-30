import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { type Household } from '../lib/cloud';
import {
  createNote,
  deleteNote,
  loadNotes,
  setNoteShared,
  stopReceivingSharedNote,
  updateNote,
  type PersonalNote,
} from '../lib/notes';
import { supabase } from '../lib/supabase';
import { ActionButton, EmptyState, IconButton, ScreenHeader, SurfaceCard } from '../ui/components';
import { colors, radius, spacing, typography } from '../ui/theme';

type NotesFilter = 'all' | 'mine' | 'shared';

function updatedLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return `Heute · ${date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function previewText(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean || 'Noch kein Inhalt';
}

export function NotesScreen({ household, onSettings }: { household: Household; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NotesFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PersonalNote | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareNote, setShareNote] = useState<PersonalNote | null>(null);
  const [shareBusyUserId, setShareBusyUserId] = useState<string | null>(null);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setNotes(await loadNotes());
    } catch (error: any) {
      if (!quiet) Alert.alert('Notizen konnten nicht geladen werden', error?.message || 'Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timerMap = new Map<string, ReturnType<typeof setTimeout>>();
    const schedule = (key: string) => {
      const current = timerMap.get(key);
      if (current) clearTimeout(current);
      timerMap.set(key, setTimeout(() => {
        timerMap.delete(key);
        void reload(true);
      }, 180));
    };
    const channel = supabase.channel('mealflow-personal-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notes' }, () => schedule('notes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_note_shares' }, () => schedule('shares'))
      .subscribe();
    return () => {
      timerMap.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const filteredNotes = useMemo(() => notes.filter((note) => {
    if (filter === 'mine') return note.isOwner;
    if (filter === 'shared') return !note.isOwner;
    return true;
  }), [notes, filter]);

  const openNew = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setEditorOpen(true);
    Haptics.selectionAsync().catch(() => undefined);
  };

  const openNote = (note: PersonalNote) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditingNote(null);
    setTitle('');
    setContent('');
  };

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Titel fehlt', 'Gib der Notiz einen kurzen Titel.');
      return;
    }
    setSaving(true);
    try {
      if (editingNote) await updateNote(editingNote.id, { title: cleanTitle, content });
      else await createNote({ title: cleanTitle, content });
      await reload(true);
      setEditorOpen(false);
      setEditingNote(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Notiz nicht gespeichert', error?.message || 'Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (note: PersonalNote) => {
    Alert.alert('Notiz löschen', `„${note.title}“ wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteNote(note.id);
              setEditorOpen(false);
              setEditingNote(null);
              setNotes((current) => current.filter((entry) => entry.id !== note.id));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
            } catch (error: any) {
              Alert.alert('Löschen nicht möglich', error?.message || 'Bitte versuche es erneut.');
            }
          })();
        },
      },
    ]);
  };

  const shareCandidates = useMemo(() => {
    if (!shareNote?.isOwner) return [];
    return household.members.filter((member) => member.userId !== shareNote.ownerId);
  }, [household.members, shareNote]);

  const toggleShare = async (userId: string, shared: boolean) => {
    if (!shareNote) return;
    setShareBusyUserId(userId);
    try {
      await setNoteShared(shareNote.id, userId, shared);
      await reload(true);
      const fresh = (await loadNotes()).find((note) => note.id === shareNote.id);
      if (fresh) setShareNote(fresh);
      Haptics.selectionAsync().catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Freigabe nicht geändert', error?.message || 'Bitte versuche es erneut.');
    } finally {
      setShareBusyUserId(null);
    }
  };

  const hideSharedNote = (note: PersonalNote) => {
    Alert.alert('Freigabe entfernen', `„${note.title}“ nicht mehr in deinen Notizen anzeigen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Entfernen', style: 'destructive', onPress: () => void (async () => {
        try {
          await stopReceivingSharedNote(note.id);
          setEditorOpen(false);
          setNotes((current) => current.filter((entry) => entry.id !== note.id));
        } catch (error: any) {
          Alert.alert('Nicht möglich', error?.message || 'Bitte versuche es erneut.');
        }
      })() },
    ]);
  };

  return <View style={styles.root}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
      <ScreenHeader
        eyebrow="PERSÖNLICH & PRIVAT"
        title="Notizen"
        subtitle="Deine Gedanken bleiben privat. Einzelne Notizen kannst du gezielt mit Haushaltsmitgliedern teilen."
        action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />}
      />

      <View style={styles.filterRow}>
        {([
          ['all', 'Alle'],
          ['mine', 'Meine'],
          ['shared', 'Mit mir geteilt'],
        ] as Array<[NotesFilter, string]>).map(([key, label]) => {
          const active = filter === key;
          const count = key === 'all' ? notes.length : key === 'mine' ? notes.filter((note) => note.isOwner).length : notes.filter((note) => !note.isOwner).length;
          return <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filterChip, active && styles.filterChipActive]}>
            <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
            <View style={[styles.filterCount, active && styles.filterCountActive]}><Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text></View>
          </Pressable>;
        })}
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Notizen werden geladen …</Text></View> : null}

      {!loading && filteredNotes.length === 0 ? <SurfaceCard><EmptyState icon="note-text-outline" title={filter === 'shared' ? 'Noch nichts geteilt' : 'Noch keine Notizen'} text={filter === 'shared' ? 'Wenn dir jemand eine Notiz freigibt, erscheint sie hier.' : 'Erstelle deine erste persönliche Notiz.'} actionLabel={filter === 'shared' ? undefined : 'Notiz erstellen'} onAction={filter === 'shared' ? undefined : openNew} /></SurfaceCard> : null}

      <View style={styles.noteList}>{filteredNotes.map((note) => {
        const shareText = note.isOwner
          ? note.sharedWith.length ? `Geteilt mit ${note.sharedWith.map((entry) => entry.displayName).join(', ')}` : 'Nur für dich'
          : `Geteilt von ${note.ownerName}`;
        return <Pressable key={note.id} onPress={() => openNote(note)} style={({ pressed }) => [styles.noteCard, pressed && styles.noteCardPressed]}>
          <View style={[styles.noteIcon, !note.isOwner && styles.noteIconShared]}><MaterialCommunityIcons name={note.isOwner ? 'note-text-outline' : 'account-arrow-left-outline'} size={22} color={colors.accent} /></View>
          <View style={styles.flex1}>
            <View style={styles.noteTitleRow}><Text style={styles.noteTitle} numberOfLines={1}>{note.title}</Text><Text style={styles.noteDate}>{updatedLabel(note.updatedAt)}</Text></View>
            <Text style={styles.notePreview} numberOfLines={2}>{previewText(note.content)}</Text>
            <View style={styles.noteMetaRow}><MaterialCommunityIcons name={note.isOwner && note.sharedWith.length ? 'account-multiple-outline' : note.isOwner ? 'lock-outline' : 'share-variant-outline'} size={14} color={colors.textTertiary} /><Text style={styles.noteMeta} numberOfLines={1}>{shareText}</Text></View>
          </View>
          {note.isOwner ? <Pressable hitSlop={8} onPress={(event) => { event.stopPropagation(); setShareNote(note); }} style={styles.shareQuickButton}><MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.accent} /></Pressable> : <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />}
        </Pressable>;
      })}</View>
    </ScrollView>

    <Pressable accessibilityRole="button" accessibilityLabel="Neue Notiz" onPress={openNew} style={({ pressed }) => [styles.fab, { bottom: 18 + insets.bottom }, pressed && styles.fabPressed]}>
      <MaterialCommunityIcons name="plus" size={31} color="#FFFFFF" />
    </Pressable>

    <Modal visible={editorOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeEditor}>
      <SafeAreaView style={styles.editorRoot} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editorHeader}>
            <IconButton icon="close" onPress={closeEditor} accessibilityLabel="Notiz schließen" />
            <View style={styles.editorHeaderText}><Text style={styles.editorEyebrow}>{editingNote?.isOwner === false ? 'GETEILTE NOTIZ' : editingNote ? 'NOTIZ BEARBEITEN' : 'NEUE NOTIZ'}</Text><Text style={styles.editorHeaderTitle}>{editingNote?.isOwner === false ? `Von ${editingNote.ownerName}` : 'Notiz'}</Text></View>
            {editingNote?.isOwner ? <IconButton icon="share-variant-outline" onPress={() => setShareNote(editingNote)} accessibilityLabel="Notiz teilen" /> : <View style={styles.headerSpacer} />}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editorContent}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={!editingNote || editingNote.isOwner}
              maxLength={120}
              placeholder="Titel"
              placeholderTextColor={colors.textTertiary}
              style={[styles.titleInput, editingNote?.isOwner === false && styles.readOnlyInput]}
            />
            <TextInput
              value={content}
              onChangeText={setContent}
              editable={!editingNote || editingNote.isOwner}
              maxLength={12000}
              multiline
              textAlignVertical="top"
              placeholder="Schreib etwas auf …"
              placeholderTextColor={colors.textTertiary}
              style={[styles.contentInput, editingNote?.isOwner === false && styles.readOnlyInput]}
            />
            {editingNote?.isOwner === false ? <SurfaceCard style={styles.sharedInfo}><MaterialCommunityIcons name="shield-lock-outline" size={21} color={colors.accent} /><View style={styles.flex1}><Text style={styles.sharedInfoTitle}>Nur lesen</Text><Text style={styles.sharedInfoText}>Die Notiz gehört {editingNote.ownerName}. Nur der Besitzer kann den Inhalt ändern.</Text></View></SurfaceCard> : null}
          </ScrollView>
          <View style={[styles.editorFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            {editingNote?.isOwner ? <Pressable onPress={() => confirmDelete(editingNote)} style={styles.deleteButton}><MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} /></Pressable> : editingNote ? <Pressable onPress={() => hideSharedNote(editingNote)} style={styles.deleteButton}><MaterialCommunityIcons name="share-off-outline" size={20} color={colors.danger} /></Pressable> : null}
            {editingNote?.isOwner === false ? <ActionButton label="Schließen" icon="check" onPress={closeEditor} style={styles.flex1} /> : <ActionButton label={editingNote ? 'Änderungen speichern' : 'Notiz speichern'} icon="content-save-outline" onPress={save} loading={saving} disabled={!title.trim()} style={styles.flex1} />}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

    <Modal transparent visible={Boolean(shareNote)} animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setShareNote(null)}>
      <Pressable style={styles.overlay} onPress={() => setShareNote(null)} />
      <View style={[styles.shareSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.handle} />
        <View style={styles.shareHeader}><View style={styles.flex1}><Text style={styles.editorEyebrow}>NOTIZ TEILEN</Text><Text style={styles.shareTitle} numberOfLines={1}>{shareNote?.title}</Text></View><IconButton icon="close" onPress={() => setShareNote(null)} accessibilityLabel="Teilen schließen" /></View>
        <Text style={styles.shareHint}>Nur ausgewählte Personen können diese Notiz lesen. Bearbeiten kann weiterhin nur der Besitzer.</Text>
        <View style={styles.shareList}>{shareCandidates.map((member) => {
          const shared = Boolean(shareNote?.sharedWith.some((entry) => entry.userId === member.userId));
          const busy = shareBusyUserId === member.userId;
          return <Pressable key={member.userId} disabled={busy} onPress={() => void toggleShare(member.userId, !shared)} style={styles.shareRow}>
            <View style={[styles.avatar, shared && styles.avatarShared]}><Text style={styles.avatarText}>{member.displayName.trim().charAt(0).toUpperCase() || '?'}</Text></View>
            <View style={styles.flex1}><Text style={styles.shareName}>{member.displayName}</Text><Text style={styles.shareStatus}>{shared ? 'Kann diese Notiz lesen' : 'Nicht freigegeben'}</Text></View>
            {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <MaterialCommunityIcons name={shared ? 'check-circle' : 'circle-outline'} size={24} color={shared ? colors.accent : colors.textTertiary} />}
          </Pressable>;
        })}</View>
        {shareCandidates.length === 0 ? <Text style={styles.noMembers}>Keine weiteren Haushaltsmitglieder verfügbar.</Text> : null}
      </View>
    </Modal>
  </View>;
}

function createStyles() {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 16 },
    flex1: { flex: 1 },
    filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    filterChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 7 },
    filterChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
    filterText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
    filterTextActive: { color: colors.accent },
    filterCount: { minWidth: 21, height: 21, borderRadius: 11, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    filterCountActive: { backgroundColor: colors.surface },
    filterCountText: { fontSize: 10, fontWeight: '800', color: colors.textTertiary },
    filterCountTextActive: { color: colors.accent },
    loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { ...typography.caption, color: colors.textTertiary },
    noteList: { gap: 10 },
    noteCard: { minHeight: 112, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    noteCardPressed: { opacity: 0.72 },
    noteIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    noteIconShared: { backgroundColor: colors.surfaceMuted },
    noteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    noteTitle: { flex: 1, ...typography.title, color: colors.text },
    noteDate: { fontSize: 10, color: colors.textTertiary },
    notePreview: { ...typography.body, color: colors.textSecondary, marginTop: 5, lineHeight: 20 },
    noteMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
    noteMeta: { flex: 1, ...typography.caption, color: colors.textTertiary },
    shareQuickButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
    fab: { position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.17, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
    fabPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
    editorRoot: { flex: 1, backgroundColor: colors.background },
    editorHeader: { minHeight: 64, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
    editorHeaderText: { flex: 1, alignItems: 'center' },
    editorEyebrow: { ...typography.label, color: colors.accent },
    editorHeaderTitle: { ...typography.title, color: colors.text, marginTop: 2 },
    headerSpacer: { width: 44 },
    editorContent: { padding: 18, gap: 12, flexGrow: 1 },
    titleInput: { minHeight: 58, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 16, ...typography.h2, color: colors.text },
    contentInput: { minHeight: 280, flexGrow: 1, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16, ...typography.body, color: colors.text, lineHeight: 23 },
    readOnlyInput: { backgroundColor: colors.surfaceMuted },
    sharedInfo: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
    sharedInfoTitle: { ...typography.label, color: colors.text },
    sharedInfoText: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
    editorFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', gap: 10, alignItems: 'center' },
    deleteButton: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
    overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.22)' },
    shareSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '72%', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 8 },
    handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 8 },
    shareHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
    shareTitle: { ...typography.h2, color: colors.text, marginTop: 2 },
    shareHint: { ...typography.body, color: colors.textSecondary, marginTop: 4, marginBottom: 10 },
    shareList: { gap: 2 },
    shareRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    avatarShared: { backgroundColor: colors.accentSoft },
    avatarText: { ...typography.label, color: colors.accent, fontWeight: '800' },
    shareName: { ...typography.body, color: colors.text, fontWeight: '700' },
    shareStatus: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
    noMembers: { ...typography.body, color: colors.textTertiary, textAlign: 'center', paddingVertical: 24 },
  });
}

let styles = createStyles();
export function refreshNotesStyles() { styles = createStyles(); }
