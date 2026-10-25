import type { Draft } from '@cangze/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client.ts';
import { draftApi, saveDraftOnExit, useDraft, useDrafts } from '../../api/drafts.tsx';
import { downscaleImage } from '../../lib/images.ts';

export interface DraftUpload {
  id: string;
  url: string;
  name: string;
}

export interface DraftConflict {
  /** null means the draft was cleared or sent on another device. */
  draft: Draft | null;
}

export type SendDraftRevision = number | null | undefined;

export interface ComposerDraftState {
  text: string;
  setText: (value: string) => void;
  draft: Draft | null;
  images: Draft['images'];
  uploading: DraftUpload[];
  saving: boolean;
  sending: boolean;
  error: boolean;
  conflict: DraftConflict | null;
  syncAvailable: boolean;
  ready: boolean;
  canSend: boolean;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeImage: (id: string) => Promise<void>;
  resolveRemote: () => void;
  resolveLocal: () => Promise<void>;
  send: (
    value: string,
    sendFn: (input: { text: string; draftRevision: SendDraftRevision }) => Promise<void>,
  ) => Promise<void>;
}

/**
 * Autosaves the composer, restores it from the shared draft feed and keeps cross-device edits
 * from silently overwriting each other. Text saves are serialized with attachment mutations.
 */
export function useComposerDraft(scope: string, vision: boolean): ComposerDraftState {
  const { draft, images, loading, error: feedError } = useDraft(scope);
  const { snapshot, setDraft } = useDrafts();
  const syncAvailable = snapshot !== null;
  const ready = !loading || snapshot !== null;

  const [text, setTextState] = useState('');
  const [busy, setBusy] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [uploading, setUploading] = useState<DraftUpload[]>([]);

  const textRef = useRef('');
  const draftRef = useRef<Draft | null>(draft);
  const lastSavedText = useRef('');
  const revisionRef = useRef<number | null>(null);
  const hydrated = useRef(false);
  const lastRevision = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const sendingRef = useRef(false);
  const conflictRef = useRef<DraftConflict | null>(null);
  const uploadingRef = useRef(0);
  const syncRef = useRef(syncAvailable);
  const localRevisions = useRef(new Set<number>());
  const selfDeleted = useRef(false);
  const canSendRef = useRef(false);

  draftRef.current = draft;
  textRef.current = text;
  conflictRef.current = conflict;
  syncRef.current = syncAvailable;

  const setText = useCallback((value: string) => {
    textRef.current = value;
    setTextState(value);
  }, []);

  const enqueue = useCallback(<T>(fn: () => Promise<T>): Promise<T> => {
    setBusy((n) => n + 1);
    const run = queueRef.current.then(
      () => fn(),
      () => fn(),
    );
    queueRef.current = run
      .then(
        () => undefined,
        () => undefined,
      )
      .then(
        () => setBusy((n) => Math.max(0, n - 1)),
        () => setBusy((n) => Math.max(0, n - 1)),
      );
    return run;
  }, []);

  // Restore the draft once, then treat revision changes as remote edits unless we made them.
  useEffect(() => {
    if (loading) return;
    if (!hydrated.current) {
      hydrated.current = true;
      const initial = draft?.text ?? '';
      lastSavedText.current = initial;
      revisionRef.current = draft?.revision ?? null;
      lastRevision.current = draft?.revision ?? null;
      setText(initial);
      return;
    }
    const revision = draft?.revision ?? null;
    if (revision === lastRevision.current) return;
    if (revision !== null && localRevisions.current.delete(revision)) {
      lastRevision.current = revision;
      revisionRef.current = revision;
      return;
    }
    if (revision === null && selfDeleted.current) {
      selfDeleted.current = false;
      lastRevision.current = null;
      revisionRef.current = null;
      return;
    }
    selfDeleted.current = false;
    lastRevision.current = revision;
    revisionRef.current = revision;
    const remoteText = draft?.text ?? '';
    if (remoteText === textRef.current) {
      lastSavedText.current = remoteText;
      return;
    }
    if (textRef.current === lastSavedText.current) {
      lastSavedText.current = remoteText;
      setText(remoteText);
      setConflict(null);
      setError(null);
      return;
    }
    setConflict({ draft });
  }, [draft, loading, setText]);

  const saveText = useCallback(
    async (value: string): Promise<Draft | null> => {
      if (!syncRef.current) return null;
      return enqueue(async () => {
        // Read at execution time: a queued attachment upload may have advanced the revision.
        const baseRevision = revisionRef.current;
        setError(null);
        try {
          const res = await draftApi.put(scope, value, baseRevision);
          if (res.draft) {
            localRevisions.current.add(res.draft.revision);
            setDraft(scope, res.draft);
            revisionRef.current = res.draft.revision;
            setConflict((prev) => (prev && prev.draft?.revision === res.draft!.revision ? null : prev));
          } else {
            selfDeleted.current = true;
            setDraft(scope, null, { atRevision: baseRevision });
            revisionRef.current = null;
          }
          lastSavedText.current = value;
          return res.draft;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'draft_conflict') {
            const current = (e.details as { draft?: Draft | null } | undefined)?.draft ?? null;
            setDraft(scope, current, { force: true });
            revisionRef.current = current?.revision ?? null;
            lastRevision.current = current?.revision ?? null;
            setConflict({ draft: current });
            throw e;
          }
          setError(e instanceof Error ? e.message : String(e));
          throw e;
        }
      });
    },
    [enqueue, scope, setDraft],
  );

  useEffect(() => {
    if (!hydrated.current || !ready || !syncAvailable) return;
    if (conflict || sending || busy > 0) return;
    if (text === lastSavedText.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (sendingRef.current) return;
      void saveText(text).catch(() => undefined);
    }, 500);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, ready, syncAvailable, conflict, sending, busy, draft?.revision, saveText]);

  const flush = useCallback(
    async (value: string): Promise<SendDraftRevision> => {
      if (!syncRef.current) return undefined;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await queueRef.current;
      if (conflictRef.current) throw new ApiError(409, 'draft_conflict', 'Draft changed');
      if (value !== lastSavedText.current) {
        const saved = await saveText(value);
        return saved?.revision ?? null;
      }
      return revisionRef.current;
    },
    [saveText],
  );

  const markSent = useCallback(
    (value: string, revision: SendDraftRevision) => {
      if (typeof revision === 'number') {
        selfDeleted.current = true;
        setDraft(scope, null, { atRevision: revision });
        revisionRef.current = null;
      }
      if (textRef.current === value) setText('');
      lastSavedText.current = '';
      setConflict(null);
      setError(null);
    },
    [scope, setDraft, setText],
  );

  const send = useCallback(
    async (
      value: string,
      sendFn: (input: { text: string; draftRevision: SendDraftRevision }) => Promise<void>,
    ) => {
      if (!canSendRef.current) return;
      sendingRef.current = true;
      setSending(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        const revision = await flush(value);
        await sendFn({ text: value, draftRevision: revision });
        markSent(value, revision);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [flush, markSent],
  );

  const resolveRemote = useCallback(() => {
    const remote = conflictRef.current?.draft ?? null;
    const remoteText = remote?.text ?? '';
    lastSavedText.current = remoteText;
    revisionRef.current = remote?.revision ?? null;
    lastRevision.current = remote?.revision ?? null;
    setText(remoteText);
    setConflict(null);
    setError(null);
  }, [setText]);

  const resolveLocal = useCallback(async () => {
    try {
      const saved = await saveText(textRef.current);
      setConflict(null);
      revisionRef.current = saved?.revision ?? null;
    } catch {
      // saveText already set the conflict or error state
    }
  }, [saveText]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!vision || conflictRef.current) return;
      const list = [...files].filter((f) => f.type.startsWith('image/'));
      for (const file of list) {
        if ((draftRef.current?.images.length ?? 0) + uploadingRef.current >= 4) break;
        const tempId = crypto.randomUUID();
        const url = URL.createObjectURL(file);
        uploadingRef.current++;
        setUploading((prev) => [...prev, { id: tempId, url, name: file.name }]);
        try {
          const scaled = await downscaleImage(file);
          const res = await enqueue(() => draftApi.addImage(scope, scaled));
          localRevisions.current.add(res.draft.revision);
          setDraft(scope, res.draft);
          revisionRef.current = res.draft.revision;
          setConflict((prev) => (prev && prev.draft?.revision === res.draft.revision ? null : prev));
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          uploadingRef.current--;
          setUploading((prev) => prev.filter((u) => u.id !== tempId));
          URL.revokeObjectURL(url);
        }
      }
    },
    [enqueue, scope, setDraft, vision],
  );

  const removeImage = useCallback(
    async (imageId: string) => {
      if (conflictRef.current) return;
      const before = draftRef.current;
      try {
        const res = await enqueue(() => draftApi.deleteImage(scope, imageId));
        if (res.draft) {
          localRevisions.current.add(res.draft.revision);
          setDraft(scope, res.draft);
          revisionRef.current = res.draft.revision;
          setConflict((prev) => (prev && prev.draft?.revision === res.draft!.revision ? null : prev));
        } else {
          selfDeleted.current = true;
          setDraft(scope, null, { atRevision: before?.revision ?? null });
          revisionRef.current = null;
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [enqueue, scope, setDraft],
  );

  const totalImages = images.length + uploading.length;
  const canSend =
    ready &&
    !sending &&
    uploading.length === 0 &&
    !conflict &&
    (text.trim().length > 0 || totalImages > 0) &&
    (vision || totalImages === 0);
  canSendRef.current = canSend;

  const exitState = useRef({ text: '', scope, revision: null as number | null, saved: '', conflict: false });
  exitState.current = {
    text,
    scope,
    revision: revisionRef.current,
    saved: lastSavedText.current,
    conflict: Boolean(conflict),
  };
  useEffect(() => {
    const saveOnExit = () => {
      if (!syncRef.current) return;
      const current = exitState.current;
      if (current.conflict || current.text === current.saved) return;
      saveDraftOnExit(current.scope, current.text, current.revision);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveOnExit();
    };
    window.addEventListener('pagehide', saveOnExit);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', saveOnExit);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return {
    text,
    setText,
    draft,
    images,
    uploading,
    saving: busy > 0,
    sending,
    error: Boolean(error ?? feedError),
    conflict,
    syncAvailable,
    ready,
    canSend,
    addFiles,
    removeImage,
    resolveRemote,
    resolveLocal,
    send,
  };
}
