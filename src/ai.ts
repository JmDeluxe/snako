import { getAllWordMastery } from './progress';
import { CURRICULUM } from './curriculum';
import { getDeck } from './flashcards';
import { GEMINI_API_KEY } from '@env';

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export type DrillDirection = 'no-to-en' | 'en-to-no';

export type DrillSentence = {
  // The prompt shown to the user (Bokmål for no-to-en, English for en-to-no)
  prompt: string;
  // The expected translation (English for no-to-en, Bokmål for en-to-no)
  expected: string;
  direction: DrillDirection;
  // Bokmål words used in the sentence — results are recorded against these
  wordsUsed: { no: string; en: string }[];
};

export type DrillFeedback = {
  correct: boolean;
  correctTranslation: string;
  feedback: string;
};

type GeminiPart = { text: string };
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

async function callGemini(prompt: string, temperature: number): Promise<string> {
  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function extractJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Vocabulary pools for the prompt: strong words (secure) and weak words
// (below threshold, most-missed first) so the AI mixes review with challenge.

const DRILL_SENTENCE_PROMPT = (strongList: string, weakList: string, direction: DrillDirection) =>
  `You create ONE short Norwegian (Bokmål) practice sentence for a learner.

The learner knows these words well: ${strongList || '(none yet)'}
The learner is still learning: ${weakList || '(none yet)'}

Rules:
- Build ONE natural sentence of 3-8 words using AT LEAST 2 words from the lists above (prefer 1 strong + 1-2 weak).
- Only use vocabulary from the lists plus the most basic glue words (og, men, jeg, du, det, er, i, på, ikke, hva, hvor, når).
- Keep it simple Bokmål, everyday spoken style.
- ${
    direction === 'no-to-en'
      ? 'The learner will see the Bokmål sentence and translate it to English.'
      : 'The learner will see the English sentence and translate it to Bokmål.'
  }

Return ONLY JSON: {"sentence": "<Bokmål sentence>", "english": "<English translation>", "wordsUsed": ["<Bokmål word1>", "<Bokmål word2>"]}`;

const DRILL_CHECK_PROMPT = (prompt: string, expected: string, answer: string) =>
  `You grade a Norwegian (Bokmål) learner's translation.

The exercise was: "${prompt}"
Correct translation: "${expected}"
Learner's answer: "${answer}"

Grade generously: ignore punctuation, capitalization and minor word-order differences. Accept natural synonyms that keep the meaning. Small spelling slips are OK for Bokmål answers. Only fail if the meaning is wrong or words are missing/changed.

Return ONLY JSON: {"correct": <true|false>, "feedback": "<one short encouraging sentence, max 12 words, in English with the key Bokmål word in parentheses if relevant>"}`;

export async function generateDrillSentence(): Promise<DrillSentence> {
  const rows = await getAllWordMastery();
  const strong = rows.filter((r) => r.correct_count >= 3);
  const weak = rows.filter((r) => r.correct_count < 3);

  let strongList = strong.slice(0, 12).map((r) => `${r.no} (${r.en})`).join(', ');
  let weakList = weak.slice(0, 12).map((r) => `${r.no} (${r.en})`).join(', ');

  // No tracked words yet — seed with the first lesson's deck so day-one users still get drills
  if (strong.length === 0 && weak.length === 0) {
    const firstLesson = CURRICULUM[0]?.lessons[0];
    const deck = firstLesson ? getDeck(firstLesson.id) : [];
    weakList = deck.slice(0, 10).map((c) => `${c.no} (${c.en})`).join(', ');
  }

  const direction: DrillDirection = Math.random() < 0.5 ? 'no-to-en' : 'en-to-no';
  const text = await callGemini(DRILL_SENTENCE_PROMPT(strongList, weakList, direction), 0.9);
  const json = extractJson(text);

  const sentence = typeof json?.sentence === 'string' ? json.sentence.trim() : '';
  const english = typeof json?.english === 'string' ? json.english.trim() : '';
  if (!sentence || !english) {
    throw new Error('Drill generation failed');
  }

  // Map the AI's claimed words back to tracked vocabulary for mastery recording
  const known = [...strong, ...weak];
  const claimed: string[] = Array.isArray(json?.wordsUsed)
    ? (json.wordsUsed as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const wordsUsed = known
    .filter((row) =>
      claimed.some((c) => c.toLowerCase().includes(row.no.toLowerCase()))
    )
    .map((r) => ({ no: r.no, en: r.en }));

  return {
    prompt: direction === 'no-to-en' ? sentence : english,
    expected: direction === 'no-to-en' ? english : sentence,
    direction,
    wordsUsed,
  };
}

export async function checkDrillTranslation(
  drill: DrillSentence,
  userAnswer: string
): Promise<DrillFeedback> {
  const text = await callGemini(
    DRILL_CHECK_PROMPT(drill.prompt, drill.expected, userAnswer),
    0.3
  );
  const json = extractJson(text);

  const correct = json?.correct === true;
  const rawFeedback = typeof json?.feedback === 'string' ? json.feedback.trim() : '';

  return {
    correct,
    correctTranslation: drill.expected,
    feedback:
      rawFeedback ||
      (correct
        ? 'Riktig! Correct!'
        : `Ikke helt. The expected answer: “${drill.expected}”`),
  };
}