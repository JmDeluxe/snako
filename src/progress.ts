import { initDatabase, enqueue } from './database';

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