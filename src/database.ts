import * as SQLite from 'expo-sqlite';

export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  language: 'norwegian' | 'cebuanano' | 'english';
  timestamp: number;
};

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('snako.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);

  return db;
}

export async function saveMessage(
  role: 'user' | 'assistant',
  content: string,
  language: 'norwegian' | 'cebuanano' | 'english'
): Promise<number> {
  const database = await initDatabase();
  const result = await database.runAsync(
    'INSERT INTO messages (role, content, language, timestamp) VALUES (?, ?, ?, ?)',
    [role, content, language, Date.now()]
  );
  return result.lastInsertRowId as number;
}

export async function getMessages(limit: number = 50): Promise<ChatMessage[]> {
  const database = await initDatabase();
  return await database.getAllAsync<ChatMessage>(
    'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
}

export async function getMessagesByLanguage(
  language: 'norwegian' | 'cebuanano' | 'english',
  limit: number = 20
): Promise<ChatMessage[]> {
  const database = await initDatabase();
  return await database.getAllAsync<ChatMessage>(
    'SELECT * FROM messages WHERE language = ? ORDER BY timestamp DESC LIMIT ?',
    [language, limit]
  );
}

export async function clearMessages(): Promise<void> {
  const database = await initDatabase();
  await database.execAsync('DELETE FROM messages;');
}