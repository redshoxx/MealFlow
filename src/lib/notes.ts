import { isCloudConfigured, supabase } from './supabase';

export type NoteShare = {
  userId: string;
  displayName: string;
};

export type PersonalNote = {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  sharedWith: NoteShare[];
};

type NoteRow = {
  id: string;
  owner_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type ShareRow = {
  note_id: string;
  recipient_user_id: string;
  shared_by: string;
};

function requireCloud() {
  if (!isCloudConfigured) throw new Error('Die Cloud-Synchronisierung ist noch nicht konfiguriert.');
  return supabase;
}

async function requireUser() {
  const { data, error } = await requireCloud().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Keine aktive Anmeldung gefunden.');
  return data.user;
}

async function loadProfileNames(userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map<string, string>();
  const { data, error } = await requireCloud().from('profiles').select('id,display_name').in('id', ids);
  if (error) return new Map<string, string>();
  return new Map((data ?? []).map((row: any) => [String(row.id), String(row.display_name || 'Mitglied')]));
}

function cleanTitle(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function cleanContent(value: string) {
  return value.slice(0, 12000);
}

export async function loadNotes(): Promise<PersonalNote[]> {
  const user = await requireUser();
  const { data, error } = await requireCloud()
    .from('user_notes')
    .select('id,owner_id,title,content,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  const rows = (data ?? []) as NoteRow[];
  const noteIds = rows.map((row) => row.id);
  let shares: ShareRow[] = [];
  if (noteIds.length) {
    const { data: shareData, error: shareError } = await requireCloud()
      .from('user_note_shares')
      .select('note_id,recipient_user_id,shared_by')
      .in('note_id', noteIds);
    if (!shareError) shares = (shareData ?? []) as ShareRow[];
  }

  const profileIds = [
    ...rows.map((row) => row.owner_id),
    ...shares.map((share) => share.recipient_user_id),
  ];
  const names = await loadProfileNames(profileIds);
  const sharesByNote = new Map<string, NoteShare[]>();
  for (const share of shares) {
    const list = sharesByNote.get(share.note_id) ?? [];
    list.push({ userId: share.recipient_user_id, displayName: names.get(share.recipient_user_id) ?? 'Mitglied' });
    sharesByNote.set(share.note_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerName: names.get(row.owner_id) ?? (row.owner_id === user.id ? 'Du' : 'Mitglied'),
    title: String(row.title),
    content: String(row.content ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    isOwner: row.owner_id === user.id,
    sharedWith: sharesByNote.get(row.id) ?? [],
  }));
}

export async function createNote(input: { title: string; content: string }): Promise<string> {
  const user = await requireUser();
  const title = cleanTitle(input.title);
  if (!title) throw new Error('Bitte gib der Notiz einen Titel.');
  const { data, error } = await requireCloud()
    .from('user_notes')
    .insert({ owner_id: user.id, title, content: cleanContent(input.content) })
    .select('id')
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function updateNote(noteId: string, input: { title: string; content: string }) {
  const title = cleanTitle(input.title);
  if (!title) throw new Error('Bitte gib der Notiz einen Titel.');
  const { error } = await requireCloud()
    .from('user_notes')
    .update({ title, content: cleanContent(input.content) })
    .eq('id', noteId);
  if (error) throw error;
}

export async function deleteNote(noteId: string) {
  const { error } = await requireCloud().from('user_notes').delete().eq('id', noteId);
  if (error) throw error;
}

export async function setNoteShared(noteId: string, recipientUserId: string, shared: boolean) {
  const user = await requireUser();
  if (recipientUserId === user.id) return;
  if (shared) {
    const { error } = await requireCloud()
      .from('user_note_shares')
      .upsert({ note_id: noteId, recipient_user_id: recipientUserId, shared_by: user.id }, { onConflict: 'note_id,recipient_user_id' });
    if (error) throw error;
    return;
  }
  const { error } = await requireCloud()
    .from('user_note_shares')
    .delete()
    .eq('note_id', noteId)
    .eq('recipient_user_id', recipientUserId);
  if (error) throw error;
}

export async function stopReceivingSharedNote(noteId: string) {
  const user = await requireUser();
  const { error } = await requireCloud()
    .from('user_note_shares')
    .delete()
    .eq('note_id', noteId)
    .eq('recipient_user_id', user.id);
  if (error) throw error;
}
