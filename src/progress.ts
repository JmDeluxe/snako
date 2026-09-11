import { initDatabase, enqueue } from './database';
import type { Flashcard } from './flashcards';

export type LessonProgress = {
  lessonId: string;
  completed: number;
  xp: number;
};

export type Streak = {
  current: number;
  lastActiveDate: string | null;
};

let progressReady = false;

async function ensureProgressTables(): Promise<void> {
  if (progressReady) return;
  const db = await initDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lesson_progress (
      lesson_id TEXT PRIMARY KEY,
      completed_at INTEGER NOT NULL,
      xp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS streak (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT
    );
    CREATE TABLE IF NOT EXISTS lesson_cache (
      lesson_id TEXT PRIMARY KEY,
      exercises_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lesson_position (
      lesson_id TEXT PRIMARY KEY,
      pos INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS word_mastery (
      word_no TEXT PRIMARY KEY,
      word_en TEXT NOT NULL,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO streak (id, current, last_active_date) VALUES (1, 0, NULL);
  `);
  progressReady = true;
}

// All progress-table access goes through the shared DB queue in database.ts —
// a second queue here would let progress statements run concurrently with
// messages/settings statements, which crashes the Android native driver.
function enqueueProgress<T>(task: () => Promise<T>): Promise<T> {
  return enqueue(task);
}

export async function getCompletedLessons(): Promise<Set<string>> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    const rows = await db.getAllAsync<{ lesson_id: string }>('SELECT lesson_id FROM lesson_progress');
    return new Set(rows.map((r) => r.lesson_id));
  });
}

export async function getTotalXp(): Promise<number> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    const row = await db.getFirstAsync<{ total: number | null }>('SELECT SUM(xp) as total FROM lesson_progress');
    return row?.total ?? 0;
  });
}

export async function completeLesson(lessonId: string, xp: number): Promise<void> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    await db.runAsync(
      'INSERT OR IGNORE INTO lesson_progress (lesson_id, completed_at, xp) VALUES (?, ?, ?)',
      [lessonId, Date.now(), xp]
    );
    // Streak update inlined — calling the queued getStreak() from inside a
    // queued task would deadlock the queue.
    const row = await db.getFirstAsync<{ current: number; last_active_date: string | null }>(
      'SELECT current, last_active_date FROM streak WHERE id = 1'
    );
    const t = today();
    if (row?.last_active_date !== t) {
      const next = row?.last_active_date === yesterday() ? (row?.current ?? 0) + 1 : 1;
      await db.runAsync('UPDATE streak SET current = ?, last_active_date = ? WHERE id = 1', [next, t]);
    }
  });
}

export async function getStreak(): Promise<Streak> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    const row = await db.getFirstAsync<{ current: number; last_active_date: string | null }>(
      'SELECT current, last_active_date FROM streak WHERE id = 1'
    );
    return { current: row?.current ?? 0, lastActiveDate: row?.last_active_date ?? null };
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getLessonPosition(lessonId: string): Promise<number> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    const row = await db.getFirstAsync<{ pos: number }>(
      'SELECT pos FROM lesson_position WHERE lesson_id = ?',
      [lessonId]
    );
    return row?.pos ?? 0;
  });
}

export async function saveLessonPosition(lessonId: string, pos: number): Promise<void> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    if (pos <= 0) {
      await db.runAsync('DELETE FROM lesson_position WHERE lesson_id = ?', [lessonId]);
    } else {
      await db.runAsync(
        'INSERT OR REPLACE INTO lesson_position (lesson_id, pos) VALUES (?, ?)',
        [lessonId, pos]
      );
    }
  });
}

export async function saveLessonCache(lessonId: string, exercisesJson: string): Promise<void> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO lesson_cache (lesson_id, exercises_json, created_at) VALUES (?, ?, ?)',
      [lessonId, exercisesJson, Date.now()]
    );
  });
}

export async function getLessonCache(lessonId: string): Promise<string | null> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    const row = await db.getFirstAsync<{ exercises_json: string }>(
      'SELECT exercises_json FROM lesson_cache WHERE lesson_id = ?',
      [lessonId]
    );
    return row?.exercises_json ?? null;
  });
}

// A word is "strong" once it has survived 3 first-try correct answers.
// A wrong answer subtracts 1 (floor 0) so words fall out of the pool until re-earned.
export const STRONG_THRESHOLD = 3;

export async function recordWordResult(card: Flashcard, correct: boolean): Promise<void> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    await db.runAsync(
      `INSERT INTO word_mastery (word_no, word_en, correct_count, wrong_count, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(word_no) DO UPDATE SET
         correct_count = MAX(
           correct_count + ?,
           0
         ),
         wrong_count = wrong_count + ?,
         last_seen_at = ?`,
      [
        card.no,
        card.en,
        correct ? 1 : 0,
        correct ? 0 : 1,
        Date.now(),
        correct ? 1 : -1,
        correct ? 0 : 1,
        Date.now(),
      ]
    );
  });
}

// All strong words, weakest first — review should hit the shakiest material first
export async function getStrongWords(): Promise<Flashcard[]> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    const rows = await db.getAllAsync<{ word_no: string; word_en: string }>(
      `SELECT word_no, word_en FROM word_mastery
       WHERE correct_count >= ?
       ORDER BY correct_count ASC, last_seen_at ASC`,
      [STRONG_THRESHOLD]
    );
    return rows.map((r) => ({ no: r.word_no, en: r.word_en }));
  });
}

export async function getStrongWordsCount(): Promise<number> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM word_mastery WHERE correct_count >= ?',
      [STRONG_THRESHOLD]
    );
    return row?.total ?? 0;
  });
}

export type WordMasteryRow = {
  no: string;
  en: string;
  correct_count: number;
  wrong_count: number;
};

// Every tracked word, shakiest first — powers the Words screen lists
export async function getAllWordMastery(): Promise<WordMasteryRow[]> {
  return enqueueProgress(async () => {
    await ensureProgressTables();
    const db = await initDatabase();
    return db.getAllAsync<WordMasteryRow>(
      `SELECT word_no as no, word_en as en, correct_count, wrong_count
       FROM word_mastery
       ORDER BY correct_count ASC, wrong_count DESC, last_seen_at DESC`
    );
  });
}