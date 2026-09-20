import { getSupabaseBrowserClient } from './client';
import { validateRequestImages } from './requestMedia';
import type { FulfillmentMethod, ItemCondition, MarketIntent, RequestKind, RequestLanguageCode } from './requests';

export type RequestDraftMode = 'need' | 'offer';

export type RequestDraftMedia = {
  id: string;
  draft_id: string;
  storage_path: string;
  mime_type: string;
  sort_order: number;
  signed_url?: string;
};

export type RequestDraft = {
  id: string;
  composer_mode: RequestDraftMode;
  campus_id: string | null;
  category: string;
  kind: RequestKind;
  title: string;
  details: string;
  language_code: RequestLanguageCode;
  amount_cents: number | null;
  market_intent: MarketIntent | null;
  item_condition: ItemCondition | null;
  price_negotiable: boolean;
  fulfillment_method: FulfillmentMethod | null;
  schedule_mode: 'flexible' | 'scheduled';
  start_local: string | null;
  end_local: string | null;
  timezone: string | null;
  meeting_label: string | null;
  origin: string | null;
  destination: string | null;
  seats: number | null;
  created_at: string;
  updated_at: string;
  media: RequestDraftMedia[];
};

export type RequestDraftInput = {
  id?: string | null;
  composerMode: RequestDraftMode;
  campusId?: string | null;
  category: string;
  kind: RequestKind;
  title?: string;
  details?: string;
  languageCode?: RequestLanguageCode;
  amountCents?: number | null;
  marketIntent?: MarketIntent | null;
  itemCondition?: ItemCondition | null;
  priceNegotiable?: boolean;
  fulfillmentMethod?: FulfillmentMethod | null;
  scheduleMode?: 'flexible' | 'scheduled';
  startLocal?: string | null;
  endLocal?: string | null;
  timezone?: string | null;
  meetingLabel?: string | null;
  origin?: string | null;
  destination?: string | null;
  seats?: number | null;
};

const draftSelect = 'id,composer_mode,campus_id,category,kind,title,details,language_code,amount_cents,market_intent,item_condition,price_negotiable,fulfillment_method,schedule_mode,start_local,end_local,timezone,meeting_label,origin,destination,seats,created_at,updated_at' as const;
const mediaSelect = 'id,draft_id,storage_path,mime_type,sort_order' as const;
const bucket = 'request-drafts';
const signedUrlSeconds = 60 * 60;

async function requireUser() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in again to manage drafts.');
  return { supabase, user: data.user };
}

function clean(value?: string | null, max = 10000) {
  return (value || '').trim().slice(0, max);
}

function extensionFor(file: File) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function extensionFromPath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg';
}

async function attachMedia(rows: Omit<RequestDraft, 'media'>[]) {
  if (!rows.length) return [] as RequestDraft[];
  const { supabase, user } = await requireUser();
  const ids = rows.map((row) => row.id);
  const { data, error } = await supabase
    .from('request_draft_media')
    .select(mediaSelect)
    .eq('user_id', user.id)
    .in('draft_id', ids)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const media = (data ?? []) as RequestDraftMedia[];
  const paths = media.map((item) => item.storage_path);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(paths, signedUrlSeconds);
    (signed ?? []).forEach((item, index) => {
      if (item?.signedUrl) urls.set(paths[index], item.signedUrl);
    });
  }

  const byDraft = new Map<string, RequestDraftMedia[]>();
  media.forEach((item) => {
    const list = byDraft.get(item.draft_id) ?? [];
    list.push({ ...item, signed_url: urls.get(item.storage_path) });
    byDraft.set(item.draft_id, list);
  });

  return rows.map((row) => ({ ...row, media: byDraft.get(row.id) ?? [] }));
}

export async function listRequestDrafts() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from('request_drafts')
    .select(draftSelect)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return attachMedia((data ?? []) as Omit<RequestDraft, 'media'>[]);
}

export async function getRequestDraft(draftId: string) {
  const drafts = await listRequestDrafts();
  return drafts.find((draft) => draft.id === draftId) ?? null;
}

export async function saveRequestDraft(input: RequestDraftInput) {
  const { supabase, user } = await requireUser();
  const payload = {
    user_id: user.id,
    composer_mode: input.composerMode,
    campus_id: input.campusId || null,
    category: clean(input.category, 80) || 'Other',
    kind: input.kind,
    title: clean(input.title, 180),
    details: clean(input.details, 10000),
    language_code: input.languageCode || 'any',
    amount_cents: input.amountCents == null ? null : Math.max(0, Math.round(input.amountCents)),
    market_intent: input.marketIntent || null,
    item_condition: input.itemCondition || null,
    price_negotiable: Boolean(input.priceNegotiable),
    fulfillment_method: input.fulfillmentMethod || null,
    schedule_mode: input.scheduleMode || 'flexible',
    start_local: input.scheduleMode === 'scheduled' ? clean(input.startLocal, 40) || null : null,
    end_local: input.scheduleMode === 'scheduled' ? clean(input.endLocal, 40) || null : null,
    timezone: input.scheduleMode === 'scheduled' ? clean(input.timezone, 100) || null : null,
    meeting_label: clean(input.meetingLabel, 240) || null,
    origin: clean(input.origin, 240) || null,
    destination: clean(input.destination, 240) || null,
    seats: input.seats == null ? null : Math.max(1, Math.min(8, Math.round(input.seats))),
    updated_at: new Date().toISOString()
  };

  let row: Omit<RequestDraft, 'media'>;
  if (input.id) {
    const { data, error } = await supabase
      .from('request_drafts')
      .update(payload)
      .eq('id', input.id)
      .eq('user_id', user.id)
      .select(draftSelect)
      .single();
    if (error) throw error;
    row = data as Omit<RequestDraft, 'media'>;
  } else {
    const { data, error } = await supabase
      .from('request_drafts')
      .insert(payload)
      .select(draftSelect)
      .single();
    if (error) throw error;
    row = data as Omit<RequestDraft, 'media'>;
  }
  const [withMedia] = await attachMedia([row]);
  return withMedia;
}

export async function replaceRequestDraftMedia(draftId: string, files: File[]) {
  validateRequestImages(files);
  const { supabase, user } = await requireUser();
  const nextFiles = files.slice(0, 5);

  const { data: oldRows, error: oldError } = await supabase
    .from('request_draft_media')
    .select(mediaSelect)
    .eq('draft_id', draftId)
    .eq('user_id', user.id);
  if (oldError) throw oldError;
  const oldPaths = (oldRows ?? []).map((row) => String(row.storage_path));

  const uploaded: { path: string; mime: string; sort: number }[] = [];
  try {
    for (let index = 0; index < nextFiles.length; index += 1) {
      const file = nextFiles[index];
      const path = `${user.id}/${draftId}/${crypto.randomUUID()}.${extensionFor(file)}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });
      if (error) throw error;
      uploaded.push({ path, mime: file.type, sort: index });
    }

    const { error: deleteError } = await supabase
      .from('request_draft_media')
      .delete()
      .eq('draft_id', draftId)
      .eq('user_id', user.id);
    if (deleteError) throw deleteError;

    if (uploaded.length) {
      const { error: insertError } = await supabase.from('request_draft_media').insert(
        uploaded.map((item) => ({
          draft_id: draftId,
          user_id: user.id,
          storage_path: item.path,
          mime_type: item.mime,
          sort_order: item.sort
        }))
      );
      if (insertError) throw insertError;
    }

    if (oldPaths.length) await supabase.storage.from(bucket).remove(oldPaths).catch(() => undefined);
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(bucket).remove(uploaded.map((item) => item.path)).catch(() => undefined);
    throw error;
  }

  return getRequestDraft(draftId);
}

export async function restoreRequestDraftFiles(draft: RequestDraft) {
  const { supabase, user } = await requireUser();
  const files: File[] = [];
  for (const media of draft.media.slice(0, 5)) {
    if (!media.storage_path.startsWith(`${user.id}/${draft.id}/`)) throw new Error('Draft media ownership check failed.');
    const { data, error } = await supabase.storage.from(bucket).download(media.storage_path);
    if (error || !data) throw error || new Error('Could not restore a draft photo.');
    files.push(new File([data], `draft-${media.sort_order}.${extensionFromPath(media.storage_path)}`, {
      type: media.mime_type || data.type || 'image/jpeg'
    }));
  }
  return files;
}

export async function deleteRequestDraft(draftId: string) {
  const { supabase, user } = await requireUser();
  const { data: rows } = await supabase
    .from('request_draft_media')
    .select('storage_path')
    .eq('draft_id', draftId)
    .eq('user_id', user.id);
  const paths = (rows ?? []).map((row) => String(row.storage_path));

  const { error } = await supabase
    .from('request_drafts')
    .delete()
    .eq('id', draftId)
    .eq('user_id', user.id);
  if (error) throw error;
  if (paths.length) await supabase.storage.from(bucket).remove(paths).catch(() => undefined);
}
