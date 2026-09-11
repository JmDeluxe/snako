import * as SQLite from 'expo-sqlite';

export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  language: 'norwegian' | 'cebuanano' | 'english';
  timestamp: number;
};

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Serializes every DB call — expo-sqlite's Android driver crashes
// (NullPointerException in prepareAsync) when statements are prepared concurrently.
// All modules (messages, settings, progress) must share this ONE queue.
let queue: Promise<unknown> = Promise.resolve();

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

// Singleton init: concurrent callers share ONE open + schema exec. Without this,
// app startup (direct call) and hooks (via queued tasks) both call initDatabase
// at once and the two schema execs race → NPE on Android.
export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return Promise.resolve(db);
  if (!initPromise) {
    initPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('snako.db');
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          language TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      db = database;
      return database;
    })();
    // Allow retry on failure
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

export async function saveMessage(
  role: 'user' | 'assistant',
  content: string,
  language: 'norwegian' | 'cebuanano' | 'english'
): Promise<number> {
  return enqueue(async () => {
    const database = await initDatabase();
    const result = await database.runAsync(
      'INSERT INTO messages (role, content, language, timestamp) VALUES (?, ?, ?, ?)',
      [role, content, language, Date.now()]
    );
    return result.lastInsertRowId as number;
  });
}

export async function getMessages(limit: number = 50): Promise<ChatMessage[]> {
  return enqueue(async () => {
    const database = await initDatabase();
    return await database.getAllAsync<ChatMessage>(
      'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ' + limit
    );
  });
}

export async function getMessagesByLanguage(
  language: 'norwegian' | 'cebuanano' | 'english',
  limit: number = 20
): Promise<ChatMessage[]> {
  return enqueue(async () => {
    const database = await initDatabase();
    return await database.getAllAsync<ChatMessage>(
      `SELECT * FROM messages WHERE language = '${language}' ORDER BY timestamp DESC LIMIT ${limit}`
    );
  });
}

export async function clearMessages(): Promise<void> {
  return enqueue(async () => {
    const database = await initDatabase();
    await database.execAsync('DELETE FROM messages;');
  });
}

export async function getSetting(key: string): Promise<string | null> {
  return enqueue(async () => {
    const database = await initDatabase();
    const result = await database.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
    return result ? (result as any).value : null;
  });
}

export async function saveSetting(key: string, value: string): Promise<void> {
  return enqueue(async () => {
    const database = await initDatabase();
    await database.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  });
}