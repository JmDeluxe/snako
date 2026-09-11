export type Lesson = {
  id: string;
  title: string;
  focus: string;
};

export type Unit = {
  id: string;
  title: string;
  icon: string;
  lessons: Lesson[];
};

export const CURRICULUM: Unit[] = [
  {
    id: 'greetings',
    title: 'Greetings',
    icon: '👋',
    lessons: [
      { id: 'greetings-1', title: 'Hello & Goodbye', focus: 'hei, ha det, god morgen, god natt' },
      { id: 'greetings-2', title: 'Please & Thank You', focus: 'takk, vær så snill, unnskyld, dessverre' },
      { id: 'greetings-3', title: 'Introduce Yourself', focus: 'jeg heter, jeg kommer fra, hyggelig å møte deg' },
    ],
  },
  {
    id: 'numbers',
    title: 'Numbers',
    icon: '🔢',
    lessons: [
      { id: 'numbers-1', title: 'One to Ten', focus: 'en, to, tre, fire, fem, seks, sju, åtte, ni, ti' },
      { id: 'numbers-2', title: 'Counting Higher', focus: 'elleve, tjue, tretti, hundre, tusen' },
      { id: 'numbers-3', title: 'Prices & Ages', focus: 'hvor mye koster, jeg er år gammel' },
    ],
  },
  {
    id: 'food',
    title: 'Food & Drink',
    icon: '🍞',
    lessons: [
      { id: 'food-1', title: 'At the Café', focus: 'kaffe, te, kake, en kopp, kan jeg få' },
      { id: 'food-2', title: 'Groceries', focus: 'brød, melk, ost, eple, fisk, kjøtt' },
      { id: 'food-3', title: 'Ordering a Meal', focus: 'meny, bestille, middag, frokost, lunsj' },
    ],
  },
  {
    id: 'family',
    title: 'Family',
    icon: '👨‍👩‍👧',
    lessons: [
      { id: 'family-1', title: 'Close Family', focus: 'mor, far, søster, bror, barn' },
      { id: 'family-2', title: 'Extended Family', focus: 'bestemor, bestefar, tante, onkel, fetter, kusine' },
      { id: 'family-3', title: 'Talking About Family', focus: 'jeg har, min, min familie, sammen' },
    ],
  },
  {
    id: 'travel',
    title: 'Travel',
    icon: '✈️',
    lessons: [
      { id: 'travel-1', title: 'Getting Around', focus: 'buss, tog, bil, stasjon, billett' },
      { id: 'travel-2', title: 'Directions', focus: 'hvor er, til høyre, til venstre, rett fram' },
      { id: 'travel-3', title: 'Hotel & Staying', focus: 'hotell, rom, natt, reservere, nøkkel' },
    ],
  },
  {
    id: 'weather',
    title: 'Weather',
    icon: '🌦️',
    lessons: [
      { id: 'weather-1', title: 'Today’s Weather', focus: 'det regner, det snør, sol, vind, kaldt, varmt' },
      { id: 'weather-2', title: 'Seasons', focus: 'vår, sommer, høst, vinter' },
      { id: 'weather-3', title: 'Small Weather Talk', focus: 'hvor kaldt er det, i dag, i morgen, grad' },
    ],
  },
  {
    id: 'work',
    title: 'Work & Office',
    icon: '💼',
    lessons: [
      { id: 'work-1', title: 'Jobs', focus: 'jobb, lærer, lege, student, sykepleier' },
      { id: 'work-2', title: 'At the Office', focus: 'møte, e-post, kollega, sjef, pause' },
      { id: 'work-3', title: 'Small Work Talk', focus: 'jeg jobber som, klokka er, ferdig, i dag' },
    ],
  },
  {
    id: 'smalltalk',
    title: 'Small Talk',
    icon: '💬',
    lessons: [
      { id: 'smalltalk-1', title: 'Hobbies', focus: 'hobby, fotball, lese, reise, musikk' },
      { id: 'smalltalk-2', title: 'Plans & Weekend', focus: 'i helgen, skal vi, gjerne, kanskje' },
      { id: 'smalltalk-3', title: 'Making Friends', focus: 'skal vi møtes, gøy, kanskje vi kan' },
    ],
  },
];

export function getUnit(unitId: string): Unit | undefined {
  return CURRICULUM.find((u) => u.id === unitId);
}

export function getLesson(lessonId: string): { unit: Unit; lesson: Lesson } | undefined {
  for (const unit of CURRICULUM) {
    const lesson = unit.lessons.find((l) => l.id === lessonId);
    if (lesson) return { unit, lesson };
  }
  return undefined;
}

export const ALL_LESSON_IDS: string[] = CURRICULUM.flatMap((u) => u.lessons.map((l) => l.id));