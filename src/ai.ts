import { getMessages, saveMessage } from './database';
import { GEMINI_API_KEY } from '@env';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

type Language = 'norwegian' | 'cebuanano' | 'english';

const SYSTEM_PROMPTS: Record<Language, string> = {
  norwegian:
    'You are Snako, a friendly language learning companion. The user is learning Norwegian. Respond in Norwegian with English translations in parentheses when introducing new words. Be conversational, encouraging, and keep responses short (2-3 sentences). Help them practice Norwegian naturally.',
  cebuanano:
    'You are Snako, a friendly language learning companion. The user is learning Cebuano. Respond in Cebuano with English translations in parentheses when introducing new words. Be conversational, encouraging, and keep responses short (2-3 sentences). Help them practice Cebuano naturally.',
  english:
    'You are Snako, a friendly language learning companion. The user is practicing English. Be conversational, encouraging, and keep responses short (2-3 sentences). Help them practice English naturally.',
};

type GeminiPart = { text: string };
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export async function sendMessageToAI(
  userMessage: string,
  language: Language
): Promise<string> {
  const systemPrompt = SYSTEM_PROMPTS[language];

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
    { role: 'model', parts: [{ text: 'I understand! I will be Snako, your language companion.' }] },
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
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Sorry, I did not understand that.';

  // Save both messages to SQLite
  await saveMessage('user', userMessage, language);
  await saveMessage('assistant', aiResponse, language);

  return aiResponse;
}