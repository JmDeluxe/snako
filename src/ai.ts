import { getAllWordMastery, getMostRecentCompletedLesson } from './progress';
import { CURRICULUM } from './curriculum';
import { getDeck } from './flashcards';
import { GEMINI_API_KEY, OLLAMA_API_KEY, AI_PROVIDER } from '@env';

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const OLLAMA_MODEL = 'glm-5.3-flash:cloud';
const OLLAMA_API_URL = 'https://ollama.com/api/chat';

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

type OllamaMessage = { role: 'user' | 'assistant'; content: string };

async function callOllama(prompt: string, temperature: number): Promise<string> {
  const messages: OllamaMessage[] = [{ role: 'user', content: prompt }];

  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        format: 'json',
        options: { temperature },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.warn('[snako-ai] Ollama HTTP error', response.status, error.slice(0, 500));
      throw new Error(`Ollama API error: ${error}`);
    }

    const data = await response.json();
    return data.message?.content ?? '';
  } catch (e) {
    if (e instanceof Error && e.message.includes('Ollama API error')) throw e;
    console.warn('[snako-ai] Ollama fetch failed:', String(e).slice(0, 500));
    throw e;
  }
}

async function callAI(prompt: string, temperature: number): Promise<string> {
  if (AI_PROVIDER === 'ollama') {
    return callOllama(prompt, temperature);
  }
  return callGemini(prompt, temperature);
}

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

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Vocabulary pools for the prompt: strong words (secure) and weak words
// (below threshold, most-missed first) so the AI mixes review with challenge.
// newestLesson biases drills toward the most recently completed lesson's deck.
// recentWords/neverUsedLists steer variety: recent ones are banned, fresh
// lesson words that have never appeared in a drill get pushed.

const DRILL_SENTENCE_PROMPT = (
  strongList: string,
  weakList: string,
  focusList: string,
  avoidList: string,
  freshList: string,
  direction: DrillDirection
) =>
  `You create ONE short Norwegian (Bokmål) practice sentence for a learner.

The learner just finished a lesson on: ${focusList || '(none yet)'}
The learner knows these words well: ${strongList || '(none yet)'}
The learner is still learning: ${weakList || '(none yet)'}
Words used in recent drills (DO NOT use again now): ${avoidList || '(none)'}
Fresh words never practiced yet (prefer these if any): ${freshList || '(none)'}

Rules:
- Build ONE natural sentence of 3-8 words. The sentence MUST use at least 1 word from the "still learning" (weak) list, or if the fresh list is non-empty, at least 1 fresh word. Strong words: at most 1 per sentence. NEVER use words from the "do not use" list.
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

// Session-level variety memory: words drilled recently are avoided for the
// next few rounds; lesson words never seen in a drill get pushed first.
const recentDrillWords: string[] = [];
const RECENT_WORD_LIMIT = 5;

export async function generateDrillSentence(): Promise<DrillSentence> {
  const rows = await getAllWordMastery();
  const strong = rows.filter((r) => r.correct_count >= 3);
  const weak = rows.filter((r) => r.correct_count < 3);

  // Shuffle before slicing so different strong words rotate across drills
  // instead of the same weakest-first batch every time
  const shuffledStrong = shuffle(strong);
  const shuffledWeak = shuffle(weak);
  let strongList = shuffledStrong.slice(0, 8).map((r) => `${r.no} (${r.en})`).join(', ');
  let weakList = shuffledWeak.slice(0, 10).map((r) => `${r.no} (${r.en})`).join(', ');

  // No tracked words yet — seed with the most recent (or first) lesson's deck
  // so day-one users still get drills
  if (strong.length === 0 && weak.length === 0) {
    const recentLessonId = await getMostRecentCompletedLesson();
    const seedId = recentLessonId ?? CURRICULUM[0]?.lessons[0]?.id;
    const deck = seedId ? getDeck(seedId) : [];
    weakList = deck.slice(0, 10).map((c) => `${c.no} (${c.en})`).join(', ');
  }

  // Lesson-first practice: bias drills toward the most recently completed
  // lesson's deck so new material shows up right after it's learned
  const recentLessonId = await getMostRecentCompletedLesson();
  const recentDeck = recentLessonId ? getDeck(recentLessonId) : [];
  const focusList = recentDeck.slice(0, 12).map((c) => `${c.no} (${c.en})`).join(', ');

  // Words drilled recently get banned; untouched lesson words get promoted
  const trackedSet = new Set(rows.map((r) => r.no.toLowerCase()));
  const neverDrilled = recentDeck.filter((c) => !trackedSet.has(c.no.toLowerCase()));
  const freshList = shuffle(neverDrilled).slice(0, 5).map((c) => `${c.no} (${c.en})`).join(', ');
  const avoidList = recentDrillWords.join(', ');

  const direction: DrillDirection = Math.random() < 0.5 ? 'no-to-en' : 'en-to-no';
  const text = await callAI(
    DRILL_SENTENCE_PROMPT(strongList, weakList, focusList, avoidList, freshList, direction),
    0.9
  );
  const json = extractJson(text);

  const sentence = typeof json?.sentence === 'string' ? json.sentence.trim() : '';
  const english = typeof json?.english === 'string' ? json.english.trim() : '';
  if (!sentence || !english) {
    throw new Error('Drill generation failed');
  }

  // Map the AI's claimed words back to tracked vocabulary for mastery recording.
  // Include the lesson deck so first-time lesson words start tracking too.
  // Match with punctuation stripped — cards store "God dag!" but the AI
  // reports "god dag", and strict matching left those words untracked.
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[.,!?…:;"]/g, '').trim();
  const known = [...strong, ...weak, ...recentDeck];
  const claimed: string[] = Array.isArray(json?.wordsUsed)
    ? (json.wordsUsed as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const claimedSet = new Set(claimed.flatMap((c) => {
    const n = normalize(c);
    // "god dag" -> claim either the full phrase or its last word ("dag")
    return [n, ...n.split(' ')];
  }));
  const wordsUsed = known
    .filter((row) => {
      const n = normalize(row.no);
      if (claimedSet.has(n)) return true;
      // Multi-word cards also match if the claim contains the phrase
      return claimed.some((c) => normalize(c).includes(n));
    })
    .map((r) => ({ no: r.no, en: r.en }));

  // Roll the used words into the recent-memory window
  for (const w of wordsUsed) {
    if (!recentDrillWords.includes(w.no)) recentDrillWords.push(w.no);
  }
  while (recentDrillWords.length > RECENT_WORD_LIMIT) recentDrillWords.shift();

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
  const text = await callAI(
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

export type AIQuizSentence = {
  sentence: string;
  english: string;
  wordsUsed: string[];
};

// Generates a batch of practice sentences from one lesson's deck —
// used by the AI sentence quiz on the lesson completion screen.
const AI_QUIZ_PROMPT = (wordList: string, count: number) =>
  `You create ${count} SHORT Norwegian (Bokmål) practice sentences for a learner.

The learner just learned these words: ${wordList}

Rules:
- Each sentence is 3-8 words, simple Bokmål, everyday spoken style.
- Each sentence must use at least 1 word from the list plus only basic glue words (og, men, jeg, du, det, er, i, på, ikke, hva, hvor, når, en, vi, kan).
- Make the sentences different from each other (different contexts).
- The learner will see the Bokmål sentence and must pick or write the English translation.

Return ONLY JSON: {"sentences": [{"sentence": "<Bokmål>", "english": "<English>", "wordsUsed": ["<Bokmål word>"]}]}`;

export async function generateAiLessonQuiz(
  lessonId: string,
  count?: number
): Promise<AIQuizSentence[]> {
  const deck = getDeck(lessonId);
  if (deck.length < 4) throw new Error('Deck too small for AI quiz');

  // Default: one sentence per word in the deck
  const requested = count ?? deck.length;
  const wordList = deck.slice(0, 12).map((c) => `${c.no} (${c.en})`).join(', ');
  const text = await callAI(AI_QUIZ_PROMPT(wordList, requested), 0.9);
  const json = extractJson(text);

  const raw = Array.isArray(json?.sentences) ? json.sentences : [];
  const items: AIQuizSentence[] = raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      sentence: typeof s.sentence === 'string' ? s.sentence.trim() : '',
      english: typeof s.english === 'string' ? s.english.trim() : '',
      wordsUsed: Array.isArray(s.wordsUsed)
        ? (s.wordsUsed as unknown[]).filter((c): c is string => typeof c === 'string')
        : [],
    }))
    .filter((s) => s.sentence && s.english);

  // Distractors need 3 distinct alternatives per question
  if (items.length < 4) throw new Error('AI quiz generation failed');
  return items.slice(0, Math.max(requested, 4));
}