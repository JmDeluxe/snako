import { getMessages, saveMessage } from './database';
import { CURRICULUM, getLesson } from './curriculum';
import { getCompletedLessons } from './progress';
import { GEMINI_API_KEY } from '@env';

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const BASE_SYSTEM_PROMPT =
  'You are Snako, a friendly Norwegian (Bokmål) learning companion. Respond in simple Bokmål with English translations in parentheses when introducing new words. Be conversational, encouraging, and keep responses short (2-3 sentences). Help the learner practice Bokmål naturally.';

async function buildSystemPrompt(): Promise<string> {
  try {
    const completed = await getCompletedLessons();
    const nextLesson = CURRICULUM.flatMap((u) => u.lessons).find((l) => !completed.has(l.id));
    const found = nextLesson ? getLesson(nextLesson.id) : undefined;

    if (found) {
      return `${BASE_SYSTEM_PROMPT} The learner has not finished the lesson "${found.lesson.title}" (unit: ${found.unit.title}). Focus words: ${found.lesson.focus}. Gently steer conversation toward these words when natural.`;
    }
    return `${BASE_SYSTEM_PROMPT} The learner has completed the whole curriculum. Have free-flowing conversations to keep their Bokmål sharp.`;
  } catch {
    return BASE_SYSTEM_PROMPT;
  }
}

type GeminiPart = { text: string };
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export async function sendMessageToAI(userMessage: string): Promise<string> {
  const systemPrompt = await buildSystemPrompt();

  // Load recent conversation history from SQLite
  const recentMessages = await getMessages(20);
  const history: GeminiContent[] = recentMessages
    .slice()
    .reverse()
    .map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

  // Add system instruction + current message
  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Jeg forstår! Jeg er Snako, din norsklærer.' }] },
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const aiResponse =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Beklager, jeg forsto ikke det.';

  // Save both messages to SQLite
  await saveMessage('user', userMessage, 'norwegian');
  await saveMessage('assistant', aiResponse, 'norwegian');

  return aiResponse;
}