export type Flashcard = {
  no: string;
  en: string;
};

export type QuizQuestion = {
  question: string;
  type: 'choice' | 'type';
  options: string[];
  answerIndex: number;
  acceptedAnswers?: string[];
  hint?: string;
};

export const FLASHCARDS: Record<string, Flashcard[]> = {
  'greetings-1': [
    { no: 'Hei!', en: 'Hi!' },
    { no: 'Ha det!', en: 'Goodbye!' },
    { no: 'God morgen!', en: 'Good morning!' },
    { no: 'God natt!', en: 'Good night!' },
    { no: 'God dag!', en: 'Good day!' },
    { no: 'Sees!', en: 'See you!' },
    { no: 'Velkommen!', en: 'Welcome!' },
  ],
  'greetings-2': [
    { no: 'Takk!', en: 'Thanks!' },
    { no: 'Tusen takk!', en: 'Thanks a lot!' },
    { no: 'Vær så snill', en: 'Please' },
    { no: 'Unnskyld', en: 'Excuse me / Sorry' },
    { no: 'Ingen ting', en: "You're welcome" },
    { no: 'Dessverre', en: 'Unfortunately' },
  ],
  'greetings-3': [
    { no: 'Jeg heter Anna', en: 'My name is Anna' },
    { no: 'Hva heter du?', en: 'What is your name?' },
    { no: 'Jeg kommer fra Norge', en: 'I come from Norway' },
    { no: 'Hyggelig å møte deg!', en: 'Nice to meet you!' },
    { no: 'Jeg bor i Oslo', en: 'I live in Oslo' },
  ],
  'numbers-1': [
    { no: 'en', en: 'one' },
    { no: 'to', en: 'two' },
    { no: 'tre', en: 'three' },
    { no: 'fire', en: 'four' },
    { no: 'fem', en: 'five' },
    { no: 'seks', en: 'six' },
    { no: 'sju', en: 'seven' },
    { no: 'åtte', en: 'eight' },
    { no: 'ni', en: 'nine' },
    { no: 'ti', en: 'ten' },
  ],
  'numbers-2': [
    { no: 'elleve', en: 'eleven' },
    { no: 'tolv', en: 'twelve' },
    { no: 'tretten', en: 'thirteen' },
    { no: 'tjue', en: 'twenty' },
    { no: 'tretti', en: 'thirty' },
    { no: 'førti', en: 'forty' },
    { no: 'hundre', en: 'one hundred' },
    { no: 'tusen', en: 'one thousand' },
  ],
  'numbers-3': [
    { no: 'Hvor mye koster det?', en: 'How much does it cost?' },
    { no: 'Det koster femti kroner', en: 'It costs fifty kroner' },
    { no: 'kroner', en: 'kroner (Norwegian money)' },
    { no: 'Jeg er tjuefem år gammel', en: 'I am twenty-five years old' },
    { no: 'billig', en: 'cheap' },
    { no: 'dyr', en: 'expensive' },
  ],
  'food-1': [
    { no: 'kaffe', en: 'coffee' },
    { no: 'te', en: 'tea' },
    { no: 'kake', en: 'cake' },
    { no: 'en kopp', en: 'a cup' },
    { no: 'Kan jeg få en kaffe?', en: 'Can I have a coffee?' },
    { no: 'Takk for kaffen!', en: 'Thanks for the coffee!' },
  ],
  'food-2': [
    { no: 'brød', en: 'bread' },
    { no: 'melk', en: 'milk' },
    { no: 'ost', en: 'cheese' },
    { no: 'eple', en: 'apple' },
    { no: 'fisk', en: 'fish' },
    { no: 'kjøtt', en: 'meat' },
    { no: 'egg', en: 'egg' },
  ],
  'food-3': [
    { no: 'menyen', en: 'the menu' },
    { no: 'Jeg vil bestille middag', en: 'I would like to order dinner' },
    { no: 'frokost', en: 'breakfast' },
    { no: 'lunsj', en: 'lunch' },
    { no: 'middag', en: 'dinner' },
    { no: 'Vann, takk', en: 'Water, please' },
  ],
  'family-1': [
    { no: 'mor', en: 'mother' },
    { no: 'far', en: 'father' },
    { no: 'søster', en: 'sister' },
    { no: 'bror', en: 'brother' },
    { no: 'barn', en: 'child / children' },
    { no: 'foreldre', en: 'parents' },
  ],
  'family-2': [
    { no: 'bestemor', en: 'grandmother' },
    { no: 'bestefar', en: 'grandfather' },
    { no: 'tante', en: 'aunt' },
    { no: 'onkel', en: 'uncle' },
    { no: 'fetter', en: 'cousin (male)' },
    { no: 'kusine', en: 'cousin (female)' },
  ],
  'family-3': [
    { no: 'Jeg har to søsken', en: 'I have two siblings' },
    { no: 'familien min', en: 'my family' },
    { no: 'min bror', en: 'my brother' },
    { no: 'Vi er sammen', en: 'We are together' },
    { no: 'Jeg elsker familien min', en: 'I love my family' },
  ],
  'travel-1': [
    { no: 'buss', en: 'bus' },
    { no: 'tog', en: 'train' },
    { no: 'bil', en: 'car' },
    { no: 'stasjon', en: 'station' },
    { no: 'billett', en: 'ticket' },
    { no: 'En billett til Oslo, takk', en: 'One ticket to Oslo, please' },
  ],
  'travel-2': [
    { no: 'Hvor er stasjonen?', en: 'Where is the station?' },
    { no: 'til høyre', en: 'to the right' },
    { no: 'til venstre', en: 'to the left' },
    { no: 'rett fram', en: 'straight ahead' },
    { no: 'Det er nær', en: 'It is near' },
    { no: 'Det er langt unna', en: 'It is far away' },
  ],
  'travel-3': [
    { no: 'hotell', en: 'hotel' },
    { no: 'et rom', en: 'a room' },
    { no: 'en natt', en: 'one night' },
    { no: 'nøkkelen', en: 'the key' },
    { no: 'Jeg har reservert et rom', en: 'I have reserved a room' },
    { no: 'Kan jeg få nøkkelen?', en: 'Can I get the key?' },
  ],
  'weather-1': [
    { no: 'Det regner', en: 'It is raining' },
    { no: 'Det snør', en: 'It is snowing' },
    { no: 'sol', en: 'sun' },
    { no: 'vind', en: 'wind' },
    { no: 'kaldt', en: 'cold' },
    { no: 'varmt', en: 'warm' },
  ],
  'weather-2': [
    { no: 'vår', en: 'spring' },
    { no: 'sommer', en: 'summer' },
    { no: 'høst', en: 'autumn' },
    { no: 'vinter', en: 'winter' },
  ],
  'weather-3': [
    { no: 'Hvor mange grader er det?', en: 'How many degrees is it?' },
    { no: 'Det er ni grader i dag', en: 'It is nine degrees today' },
    { no: 'i morgen', en: 'tomorrow' },
    { no: 'Det blir kaldt i morgen', en: 'It will be cold tomorrow' },
    { no: 'Det er fint vær', en: 'The weather is nice' },
  ],
  'work-1': [
    { no: 'en jobb', en: 'a job' },
    { no: 'lærer', en: 'teacher' },
    { no: 'lege', en: 'doctor' },
    { no: 'student', en: 'student' },
    { no: 'sykepleier', en: 'nurse' },
  ],
  'work-2': [
    { no: 'et møte', en: 'a meeting' },
    { no: 'e-post', en: 'email' },
    { no: 'kollega', en: 'colleague' },
    { no: 'sjef', en: 'boss' },
    { no: 'pause', en: 'break' },
  ],
  'work-3': [
    { no: 'Jeg jobber som lærer', en: 'I work as a teacher' },
    { no: 'Klokka er ni', en: "It is nine o'clock" },
    { no: 'ferdig', en: 'finished / done' },
    { no: 'Jeg er ferdig for i dag', en: 'I am done for today' },
  ],
  'smalltalk-1': [
    { no: 'en hobby', en: 'a hobby' },
    { no: 'fotball', en: 'football' },
    { no: 'å lese', en: 'to read' },
    { no: 'å reise', en: 'to travel' },
    { no: 'musikk', en: 'music' },
    { no: 'Jeg liker musikk', en: 'I like music' },
  ],
  'smalltalk-2': [
    { no: 'i helgen', en: 'on the weekend' },
    { no: 'Skal vi se en film?', en: 'Shall we watch a movie?' },
    { no: 'Gjerne!', en: 'Sure! / Gladly!' },
    { no: 'kanskje', en: 'maybe' },
  ],
  'smalltalk-3': [
    { no: 'Skal vi møtes?', en: 'Shall we meet?' },
    { no: 'Det er gøy!', en: 'That is fun!' },
    { no: 'Vi ses!', en: 'See you!' },
    { no: 'Hyggelig!', en: 'Nice! / Lovely!' },
  ],
};

export const XP_PER_LESSON = 20;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function getDeck(lessonId: string): Flashcard[] {
  return FLASHCARDS[lessonId] ?? [];
}

export function buildQuiz(cards: Flashcard[], count: number = 5): QuizQuestion[] {
  const picks = shuffle(cards).slice(0, Math.min(count, cards.length));

  return picks.map((card) => {
    const toNorwegian = Math.random() < 0.5;
    const correct = toNorwegian ? card.no : card.en;

    const pool = shuffle(cards.filter((c) => c !== card));
    const distractors: string[] = [];
    for (const c of pool) {
      const value = toNorwegian ? c.no : c.en;
      if (value !== correct && !distractors.includes(value)) {
        distractors.push(value);
      }
      if (distractors.length === 3) break;
    }

    const options = shuffle([correct, ...distractors]);

    // Write-ins only in EN→NO direction: the hint skeleton of a Norwegian
    // answer would visually mirror the Norwegian prompt on NO→EN questions.
    const type: QuizQuestion['type'] = toNorwegian && Math.random() < 1 / 3 ? 'type' : 'choice';

    // Hint for write-ins: first letter + blanks, e.g. "G__ m______ (2 words)"
    const hint =
      type === 'type'
        ? makeHint(correct)
        : undefined;

    return {
      question: toNorwegian ? `How do you say “${card.en}”?` : `What does “${card.no}” mean?`,
      type,
      options,
      answerIndex: options.indexOf(correct),
      acceptedAnswers: [correct],
      hint,
    };
  });
}

// "G__ m______!" style reveal — first letter of each word only, rest blanked
function makeHint(answer: string): string {
  const blanks = answer
    .split(' ')
    .map((word) =>
      word
        .split('')
        .map((ch, idx) => {
          if (idx === 0) return ch.toUpperCase();
          // keep punctuation/space-like chars, hide every letter incl. æøå
          return /[a-zA-ZæøåÆØÅ]/.test(ch) ? '_' : ch;
        })
        .join('')
    );
  const words = answer.trim().split(/\s+/).length;
  return `${blanks.join(' ')} · ${words} ${words === 1 ? 'word' : 'words'}`;
}

// Case/punctuation-insensitive match for written answers
export function matchesAnswer(input: string, accepted: string[] | undefined, fallback: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[.!?]/g, '').replace(/\s+/g, ' ').trim();
  const list = accepted && accepted.length > 0 ? accepted : [fallback];
  return list.some((a) => norm(a) === norm(input));
}

// Mixes in a couple of previously-completed words so old material keeps coming back
export function buildQuizWithReview(
  newCards: Flashcard[],
  completedCards: Flashcard[],
  count: number = 5
): QuizQuestion[] {
  const base = buildQuiz(newCards, count);

  if (completedCards.length === 0) return base;

  const reviewPicks = shuffle(completedCards).slice(0, Math.min(2, completedCards.length));
  const reviewQuestions = buildQuiz(reviewPicks, reviewPicks.length);

  return shuffle([...base, ...reviewQuestions]);
}