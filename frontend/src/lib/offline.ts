import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface SatPrepDB extends DBSchema {
  'exam-progress': {
    key: string;
    value: {
      examId: string;
      answers: Record<string, string | null>;
      timeSpentSeconds: number;
      lastSaved: string;
    };
  };
  'teacher-drafts': {
    key: string;
    value: {
      draftId: string;
      setId: string;
      questionForm: Record<string, unknown>;
      lastSaved: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<SatPrepDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SatPrepDB>('sat-prep-offline', 1, {
      upgrade(db) {
        db.createObjectStore('exam-progress', { keyPath: 'examId' });
        db.createObjectStore('teacher-drafts', { keyPath: 'draftId' });
      },
    });
  }
  return dbPromise;
}

export async function saveExamProgress(
  examId: string,
  answers: Record<string, string | null>,
  timeSpentSeconds: number
): Promise<void> {
  try {
    const db = await getDB();
    await db.put('exam-progress', {
      examId,
      answers,
      timeSpentSeconds,
      lastSaved: new Date().toISOString(),
    });
  } catch {
    // Silently fail — offline storage is best-effort
  }
}

export async function loadExamProgress(
  examId: string
): Promise<{ answers: Record<string, string | null>; timeSpentSeconds: number } | null> {
  try {
    const db = await getDB();
    const record = await db.get('exam-progress', examId);
    if (!record) return null;
    return { answers: record.answers, timeSpentSeconds: record.timeSpentSeconds };
  } catch {
    return null;
  }
}

export async function clearExamProgress(examId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('exam-progress', examId);
  } catch {
    // Silently fail
  }
}

export async function saveTeacherDraft(
  draftId: string,
  setId: string,
  questionForm: Record<string, unknown>
): Promise<void> {
  try {
    const db = await getDB();
    await db.put('teacher-drafts', {
      draftId,
      setId,
      questionForm,
      lastSaved: new Date().toISOString(),
    });
  } catch {
    // Silently fail
  }
}

export async function loadTeacherDraft(
  draftId: string
): Promise<{ setId: string; questionForm: Record<string, unknown> } | null> {
  try {
    const db = await getDB();
    const record = await db.get('teacher-drafts', draftId);
    if (!record) return null;
    return { setId: record.setId, questionForm: record.questionForm };
  } catch {
    return null;
  }
}

export async function clearTeacherDraft(draftId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('teacher-drafts', draftId);
  } catch {
    // Silently fail
  }
}
