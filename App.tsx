import { StatusBar } from 'expo-status-bar';
import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendMessageToAI } from './src/ai';
import { initDatabase, getMessages, getSetting, saveSetting } from './src/database';
import { CURRICULUM, getLesson, type Lesson, type Unit } from './src/curriculum';
import { getCompletedLessons, getTotalXp, getStreak, completeLesson, getLessonPosition, saveLessonPosition } from './src/progress';
import { getDeck, buildQuiz, buildQuizWithReview, matchesAnswer, XP_PER_LESSON, type Flashcard, type QuizQuestion } from './src/flashcards';
import { useKeyboard } from './src/hooks/useKeyboard';
import { useTheme, type ThemeMode } from './src/hooks/useTheme';
import { spacing, radius, type } from './src/theme';
import { scheduleCheckIns, cancelCheckIns, requestNotificationPermission } from './src/notifications';

type Screen = 'welcome' | 'path' | 'lesson' | 'practice' | 'settings';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type LessonNode = {
  unit: Unit;
  lesson: Lesson;
  index: number;
  state: 'completed' | 'current' | 'locked';
};

export default function App() {
  const { mode, setMode, colors, scheme, initialized } = useTheme();
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isStartupLoading, setIsStartupLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkInsEnabled, setCheckInsEnabled] = useState(false);
  const [defaultStudyCount, setDefaultStudyCount] = useState(5);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [isPracticeRun, setIsPracticeRun] = useState(false);

  // Path state
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [totalXp, setTotalXp] = useState(0);
  const [streak, setStreak] = useState(0);

  // Lesson runner state
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [studyStart, setStudyStart] = useState(0);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [lessonPhase, setLessonPhase] = useState<'learn' | 'quiz' | 'done'>('learn');
  const [studyCount, setStudyCount] = useState(5);
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState<null | { correct: boolean }>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [hintVisible, setHintVisible] = useState(false);
  const [retryIds, setRetryIds] = useState<Set<number>>(new Set());
  const progressAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });
  const [lessonResult, setLessonResult] = useState<null | { xp: number; score: number; total: number; lessonComplete: boolean }>(null);

  const keyboardHeight = useKeyboard();
  const flatListRef = useRef<FlatList>(null);

  // Load chat history from SQLite on app open
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();

        const hasOnboarded = await getSetting('has_onboarded');
        const savedMessages = await getMessages(50);
        const savedCheckIns = await getSetting('checkins_enabled');
        const savedStudyCount = await getSetting('study_count');
        const savedRepeat = await getSetting('repeat_completed');

        if (savedCheckIns === 'true') {
          setCheckInsEnabled(true);
          scheduleCheckIns();
        }

        if (savedStudyCount) {
          setDefaultStudyCount(parseInt(savedStudyCount, 10) || 5);
        }

        if (savedRepeat === 'true') {
          setRepeatEnabled(true);
        }

        if (savedMessages && savedMessages.length > 0) {
          const uiMessages: Message[] = savedMessages
            .slice()
            .reverse()
            .map((msg) => ({
              id: msg.id.toString(),
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content,
            }));
          setMessages(uiMessages);
        }

        await refreshProgress();

        setScreen(hasOnboarded === 'true' ? 'path' : 'welcome');
      } catch (error) {
        console.warn('Failed to load app state:', error);
        setScreen('welcome');
      } finally {
        setIsStartupLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // Smooth progress bar: animate whenever quiz position changes
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: quizIndex,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [quizIndex, progressAnim]);

  // Slide/fade in each question card — also replays on quiz list change (retry append)
  useEffect(() => {
    cardAnim.setValue(0);
    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [quizIndex, quiz.length, cardAnim]);

  async function refreshProgress(): Promise<void> {
    const [completed, xp, streakInfo] = await Promise.all([
      getCompletedLessons(),
      getTotalXp(),
      getStreak(),
    ]);
    setCompletedLessons(completed);
    setTotalXp(xp);
    setStreak(streakInfo.current);
  }

  function buildPath(): LessonNode[] {
    const nodes: LessonNode[] = [];
    let currentAssigned = false;
    for (const unit of CURRICULUM) {
      for (const lesson of unit.lessons) {
        const state: LessonNode['state'] = completedLessons.has(lesson.id)
          ? 'completed'
          : !currentAssigned
            ? ((currentAssigned = true), 'current')
            : 'locked';
        nodes.push({ unit, lesson, index: nodes.length, state });
      }
    }
    return nodes;
  }

  async function openLesson(lessonId: string): Promise<void> {
    setActiveLessonId(lessonId);
    setScreen('lesson');
    const deck = getDeck(lessonId);
    setCards(deck);
    setIsPracticeRun(false);
    const savedPos = Math.min(await getLessonPosition(lessonId), deck.length);
    setStudyStart(savedPos);
    setQuiz([]);
    setLessonPhase('learn');
    setStudyCount(Math.min(defaultStudyCount, Math.max(deck.length - savedPos, 1)));
    setRevealedCards(new Set());
    setQuizIndex(0);
    setAnswered(null);
    setLessonResult(null);
    setSelectedOption(null);
    setTypedAnswer('');
    setRetryIds(new Set());
    setQuizScore({ correct: 0, total: 0 });
  }

  function toggleReveal(index: number): void {
    setRevealedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function submitAnswer(): void {
    const question = quiz[quizIndex];
    if (!question || answered) return;

    if (question.type === 'type') {
      const correct = matchesAnswer(typedAnswer, question.acceptedAnswers, question.options[question.answerIndex]);
      setAnswered({ correct });
      setQuizScore((prev) => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
      return;
    }

    const correct = selectedOption === question.answerIndex;
    setAnswered({ correct });
    setQuizScore((prev) => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
  }

  // Re-ask wrong answers at the end of the quiz (once per question)
  function nextQuizQuestion(): void {
    const question = quiz[quizIndex];
    if (question && answered && !answered.correct && !retryIds.has(quizIndex)) {
      setRetryIds((prev) => new Set(prev).add(quizIndex));
      setQuiz((prev) => [...prev, question]);
    }
    if (quizIndex + 1 >= quiz.length) {
      finishLesson();
      return;
    }
    setQuizIndex((i) => i + 1);
    setAnswered(null);
    setSelectedOption(null);
    setTypedAnswer('');
    setHintVisible(false);
  }

  async function finishLesson(): Promise<void> {
    if (!activeLessonId) return;

    // "Practice all words" run — score only, never touches progress
    if (isPracticeRun) {
      setIsPracticeRun(false);
      setLessonResult({ xp: 0, score: quizScore.correct, total: quizScore.total, lessonComplete: false });
      setLessonPhase('done');
      return;
    }

    const nextStart = studyStart + quiz.length;
    const allWordsDone = nextStart >= cards.length;

    if (allWordsDone) {
      const firstTime = !completedLessons.has(activeLessonId);
      const xp = firstTime ? XP_PER_LESSON : Math.round(XP_PER_LESSON / 2);
      await completeLesson(activeLessonId, xp);
      await saveLessonPosition(activeLessonId, 0);
      await refreshProgress();
      setLessonResult({ xp, score: quizScore.correct, total: quizScore.total, lessonComplete: true });
    } else {
      // Words remain — save position so it survives app restarts
      await saveLessonPosition(activeLessonId, nextStart);
      setStudyStart(nextStart);
      setLessonResult({
        xp: 0,
        score: quizScore.correct,
        total: quizScore.total,
        lessonComplete: false,
      });
    }
    setLessonPhase('done');
  }
  const startPractice = () => {
    if (messages.length === 0) {
      setMessages([
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Hei! Hyggelig å møte deg! (Hi! Nice to meet you!) Hva vil du øve på i dag?',
        },
      ]);
    }
    setScreen('practice');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const aiResponse = await sendMessageToAI(userText);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Beklager, noe gikk galt. Prøv igjen! (Sorry, something went wrong. Try again!)',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const toggleCheckIns = async () => {
    if (checkInsEnabled) {
      await cancelCheckIns();
      await saveSetting('checkins_enabled', 'false');
      setCheckInsEnabled(false);
    } else {
      const granted = await requestNotificationPermission();
      if (!granted) return;
      await scheduleCheckIns();
      await saveSetting('checkins_enabled', 'true');
      setCheckInsEnabled(true);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageBubble,
        item.role === 'user'
          ? { backgroundColor: colors.bubbleUser, alignSelf: 'flex-end', borderBottomRightRadius: radius.sm }
          : { backgroundColor: colors.bubbleAssistant, alignSelf: 'flex-start', borderBottomLeftRadius: radius.sm },
      ]}
    >
      <Text
        style={{
          color: item.role === 'user' ? colors.bubbleUserText : colors.bubbleAssistantText,
          fontSize: type.base,
        }}
      >
        {item.content}
      </Text>
    </View>
  );

  // === LOADING STATE ===
  if (!initialized || isStartupLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // === WELCOME SCREEN ===
  if (screen === 'welcome') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <View style={styles.onboarding}>
          <Text style={[styles.onboardingLogo, { color: colors.text }]}>Snako</Text>
          <Text style={[styles.welcomeFlag]}>Snako</Text>
          <Text style={[styles.onboardingQuestion, { color: colors.text, textAlign: 'center' }]}>
            Learn Norwegian with an AI friend
          </Text>
          <Text style={[styles.welcomeSub, { color: colors.textSecondary }]}>
            Short AI-generated lessons, real conversations, daily streaks. Bokmål, made simple.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={async () => {
              await saveSetting('has_onboarded', 'true');
              setScreen('path');
            }}
          >
            <Text style={[styles.primaryButtonText, { color: colors.bg }]}>Kom i gang — Get started</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // === PATH SCREEN ===
  if (screen === 'path') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

        <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Snako</Text>
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.textSecondary }]}>▲ {streak}</Text>
            <Text style={[styles.statText, { color: colors.textSecondary }]}>{totalXp} XP</Text>
            <TouchableOpacity onPress={() => setScreen('settings')} style={styles.settingsButton}>
              <Text style={[styles.settingsIcon, { color: colors.accent }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.pathBody}>
          {CURRICULUM.map((unit) => {
            const unitLessons = buildPath().filter((n) => n.unit.id === unit.id);
            return (
              <View key={unit.id} style={styles.unitSection}>
                <View style={styles.unitHeader}>
                  <Text style={[styles.unitTitle, { color: colors.text }]}>
                    {unit.icon} {unit.title}
                  </Text>
                </View>
                {unitLessons.map((node) => (
                  <TouchableOpacity
                    key={node.lesson.id}
                    style={[
                      styles.lessonRow,
                      { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                      node.state === 'current' && { borderColor: colors.accent, borderWidth: 2 },
                      node.state === 'locked' && { opacity: 0.45 },
                    ]}
                    disabled={node.state === 'locked'}
                    onPress={() => openLesson(node.lesson.id)}
                  >
                    <View
                      style={[
                        styles.lessonBadge,
                        node.state === 'completed' && { backgroundColor: colors.accent },
                        node.state === 'locked' && { backgroundColor: colors.surfaceAlt },
                        node.state === 'current' && { backgroundColor: colors.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.lessonBadgeText,
                          (node.state === 'completed' || node.state === 'current') && { color: colors.bg },
                          node.state === 'locked' && { color: colors.textMuted },
                        ]}
                      >
                        {node.state === 'completed' ? '✓' : node.state === 'locked' ? '·' : 'Go'}
                      </Text>
                    </View>
                    <Text style={[styles.lessonRowTitle, { color: colors.text }]}>{node.lesson.title}</Text>
                    <Text style={[styles.lessonRowArrow, { color: colors.textMuted }]}>→</Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.practiceCta, { borderColor: colors.accent, borderWidth: 2 }]}
            onPress={startPractice}
          >
            <Text style={[styles.practiceCtaText, { color: colors.text }]}>
              Free practice with Snako
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === LESSON SCREEN ===
  if (screen === 'lesson') {
    const found = activeLessonId ? getLesson(activeLessonId) : undefined;
    const question = quiz[quizIndex];
    const learningCards = cards.slice(studyStart, studyStart + studyCount);
    const totalSteps = learningCards.length + quiz.length;
    const currentStep = learningCards.length + quizIndex;
    const lessonCompleted = activeLessonId ? completedLessons.has(activeLessonId) : false;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

        <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[styles.backButtonCircle, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setScreen('path')}>
            <Text style={[styles.backButton, { color: colors.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: 18 }]} numberOfLines={1}>
            {found ? found.lesson.title : 'Lesson'}
          </Text>
          <Text style={[styles.lessonCounter, { color: colors.textMuted }]}>
            {lessonPhase === 'quiz' ? `${currentStep + 1}/${totalSteps}` : ''}
          </Text>
        </View>

        {lessonPhase === 'learn' && (
          <ScrollView contentContainerStyle={styles.lessonBody}>
            {lessonCompleted && studyStart === 0 && (
              <>
                <Text style={[styles.selectSub, { color: colors.textMuted }]}>
                  Already completed · all {cards.length} words learned
                </Text>
                {cards.map((card, i) => {
                  const shown = revealedCards.has(i);
                  return (
                    <TouchableOpacity
                      key={`all-done-${i}`}
                      style={[
                        styles.wordRow,
                        styles.wordRowFixed,
                        {
                          borderColor: shown ? colors.accent : colors.border,
                          borderWidth: 1,
                          backgroundColor: colors.surface,
                        },
                      ]}
                      onPress={() => toggleReveal(i)}
                    >
                      <Text style={[styles.wordEn, { color: colors.text }]} numberOfLines={1}>{card.en}</Text>
                      <Text style={[styles.wordNo, shown ? { color: colors.text } : { color: colors.textMuted, opacity: 0.5 }]} numberOfLines={1}>
                        {shown ? card.no : 'tap to show'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.backToSelect, { marginTop: 8 }]}
                  onPress={() => {
                    // Hide resets everything; show reveals every card in one go
                    if (revealedCards.size >= cards.length) {
                      setRevealedCards(new Set());
                    } else {
                      setRevealedCards(new Set(cards.map((_, i) => i)));
                    }
                  }}
                >
                  <Text style={[styles.backToSelectText, { color: colors.textMuted }]}>
                    {revealedCards.size >= cards.length ? 'Hide all translations' : 'Show all translations'}
                  </Text>
                </TouchableOpacity>
                {(() => {
                  const partial = revealedCards.size >= 2 && revealedCards.size < cards.length;
                  const label = partial
                    ? `Practice ${revealedCards.size} selected words`
                    : 'Practice all words';
                  return (
                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                      onPress={() => {
                        // Partial selection quizzes only revealed words; otherwise the whole deck
                        const picked = partial
                          ? cards.filter((_, i) => revealedCards.has(i))
                          : cards;
                        setIsPracticeRun(true);
                        setQuiz(buildQuiz(picked, picked.length));
                        setQuizIndex(0);
                        setAnswered(null);
                        setSelectedOption(null);
                        setTypedAnswer('');
                        setRetryIds(new Set());
                        setQuizScore({ correct: 0, total: 0 });
                        setLessonPhase('quiz');
                      }}
                    >
                      <View style={styles.buttonRow}>
                        <Text style={[styles.primaryButtonText, { color: colors.bg }]}>{label}</Text>
                        <Text style={[styles.buttonArrow, { color: colors.bg }]}>›</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })()}
                <TouchableOpacity
                  style={[styles.backToSelect, { marginTop: 12 }]}
                  onPress={() => setScreen('path')}
                >
                  <Text style={[styles.backToSelectText, { color: colors.textMuted }]}>‹ Back to units</Text>
                </TouchableOpacity>
              </>
            )}
            {!lessonCompleted && (
              <>
                <Text style={[styles.selectSub, { color: colors.textMuted }]}>
                  Words {studyStart + 1}–{studyStart + learningCards.length} of {cards.length} · tap a word to reveal
                </Text>
                {studyStart > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.upcomingLabel, { color: colors.textMuted }]}>
                      Completed
                    </Text>
                    {cards.slice(0, studyStart).map((card, i) => (
                      <View
                        key={`done-${i}`}
                        style={[styles.wordRow, styles.wordRowLocked, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                      >
                        <Text style={[styles.wordEn, { color: colors.textMuted, opacity: 0.7, textDecorationLine: 'line-through' }]}>
                          {card.en}
                        </Text>
                        <Text style={[styles.wordNo, { color: colors.textMuted, opacity: 0.7 }]}>
                          {card.no}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={[styles.upcomingLabel, { color: colors.textMuted }]}>
                  Your words now
                </Text>
                {learningCards.map((card, i) => (
                  <TouchableOpacity
                    key={`active-${i}`}
                    style={[styles.wordRow, { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface }]}
                    onPress={() => toggleReveal(i)}
                  >
                    <Text style={[styles.wordEn, { color: colors.text }]}>{card.en}</Text>
                    <Text style={[styles.wordNo, revealedCards.has(i) ? { color: colors.text } : { color: colors.textMuted, opacity: 0.5 }]}>
                      {revealedCards.has(i) ? card.no : 'tap to show'}
                    </Text>
                  </TouchableOpacity>
                ))}

                {cards.length > studyStart + learningCards.length && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.upcomingLabel, { color: colors.textMuted }]}>
                      Up next in this lesson
                    </Text>
                    {cards.slice(studyStart + learningCards.length).map((card, i) => (
                      <View
                        key={`locked-${i}`}
                        style={[styles.wordRow, styles.wordRowLocked, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                      >
                        <Text style={[styles.wordEn, { color: colors.textMuted, opacity: 0.6 }]}>{card.en}</Text>
                        <Text style={[styles.wordNo, { color: colors.textMuted, opacity: 0.4 }]}>Locked</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ height: 24 }} />
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: revealedCards.size === 0 ? colors.disabled : colors.accent }]}
                  disabled={revealedCards.size === 0}
                  onPress={() => {
                    const completedCards = repeatEnabled ? cards.slice(0, studyStart) : [];
                    setQuiz(repeatEnabled ? buildQuizWithReview(learningCards, completedCards) : buildQuiz(learningCards));
                    setQuizIndex(0);
                    setAnswered(null);
                    setSelectedOption(null);
                    setTypedAnswer('');
                    setRetryIds(new Set());
                    setLessonPhase('quiz');
                  }}
                >
                  <Text style={[styles.primaryButtonText, { color: colors.bg }]}>
                    I'm ready — start quiz
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.backToSelect, { marginTop: 12 }]}
                  onPress={() => setScreen('path')}
                >
                  <Text style={[styles.backToSelectText, { color: colors.textMuted }]}>‹ Back to units</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        {lessonPhase === 'quiz' && question && (
          <ScrollView contentContainerStyle={styles.lessonBody}>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: progressAnim.interpolate({
                      inputRange: [0, quiz.length],
                      outputRange: ['0%', '100%'],
                      extrapolate: 'clamp',
                    }),
                  },
                ]}
              />
            </View>
            <Animated.View
              style={{
                opacity: cardAnim,
                transform: [
                  {
                    translateX: cardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              }}
            >
              <Text style={[styles.exerciseType, { color: colors.textMuted }]}>
                {question.type === 'type' ? 'WRITE' : 'QUIZ'}
              </Text>
              <Text style={[styles.exerciseQuestion, { color: colors.text }]}>{question.question}</Text>

            {question.type === 'type' ? (
              <>
                <TextInput
                  style={[styles.typeAnswerInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
                  value={typedAnswer}
                  onChangeText={setTypedAnswer}
                  placeholder="Type your answer…"
                  placeholderTextColor={colors.textMuted}
                  editable={!answered}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={() => {
                    if (!answered && typedAnswer.trim()) submitAnswer();
                  }}
                />
                {!answered && question.hint && (
                  <TouchableOpacity
                    style={[styles.hintRow, { borderColor: colors.border }]}
                    onPress={() => setHintVisible((v) => !v)}
                  >
                    <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                      {hintVisible ? `Hint: ${question.hint}` : 'Need a hint?'}
                    </Text>
                  </TouchableOpacity>
                )}
                {answered && !answered.correct && (
                  <Text style={[styles.feedbackAnswer, { color: colors.textSecondary, marginTop: 12 }]}>
                    Not quite — try to remember it on the next round.
                  </Text>
                )}
              </>
            ) : (
              <View style={styles.optionsWrap}>
                {question.options.map((opt, i) => {
                  const isSelected = selectedOption === i;
                  const isAnswer = i === question.answerIndex;
                  const showState = answered && (isSelected || isAnswer);
                  return (
                    <TouchableOpacity
                      key={i}
                      disabled={!!answered}
                      style={[
                        styles.optionRow,
                        { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
                        isSelected && !answered && { borderColor: colors.accent, borderWidth: 2 },
                        showState && isAnswer && { backgroundColor: colors.accent, borderColor: colors.accent },
                        showState && isSelected && !isAnswer && { borderColor: colors.textMuted, borderWidth: 2 },
                      ]}
                      onPress={() => setSelectedOption(i)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          { color: colors.text },
                          showState && isAnswer && { color: colors.bg },
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {answered && !answered.correct && (
                  <Text style={[styles.feedbackAnswer, { color: colors.textSecondary, marginTop: 12 }]}>
                    Not quite — you'll get another shot at the end.
                  </Text>
                )}
              </View>
            )}

            <View style={{ height: 24 }} />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    question.type === 'type'
                      ? answered
                        ? colors.accent
                        : typedAnswer.trim()
                          ? colors.accent
                          : colors.disabled
                      : answered
                        ? colors.accent
                        : selectedOption !== null
                          ? colors.accent
                          : colors.disabled,
                },
              ]}
              disabled={
                question.type === 'type'
                  ? answered === null && !typedAnswer.trim()
                  : answered === null && selectedOption === null
              }
              onPress={() => (answered ? nextQuizQuestion() : submitAnswer())}
            >
              <Text style={[styles.primaryButtonText, { color: colors.bg }]}>
                {answered ? 'Next' : 'Check'}
              </Text>
            </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        )}

        {lessonPhase === 'done' && lessonResult && (
          <View style={styles.lessonCenter}>
            <Text style={[styles.resultTitle, { color: colors.text }]}>
              {lessonResult.lessonComplete ? 'Leksjon fullført!' : 'Bra jobbet!'}
            </Text>
            <Text style={[styles.resultXp, { color: colors.textSecondary }]}>
              {lessonResult.score}/{lessonResult.total} on the quiz
              {lessonResult.xp > 0 ? ` · +${lessonResult.xp} XP` : ''}
            </Text>
            {!lessonResult.lessonComplete && (
              <Text style={[styles.selectSub, { color: colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
                {cards.length - studyStart} words left in this lesson
              </Text>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.accent, marginTop: 24, minWidth: 260 }]}
              onPress={() => {
                if (lessonResult.lessonComplete) {
                  setLessonResult(null);
                  setScreen('path');
                } else {
                  // Continue with the next batch of words
                  setQuiz([]);
                  setRevealedCards(new Set());
                  setQuizIndex(0);
                  setAnswered(null);
                  setSelectedOption(null);
                  setTypedAnswer('');
                  setRetryIds(new Set());
                  setQuizScore({ correct: 0, total: 0 });
                  setStudyCount(Math.min(defaultStudyCount, cards.length - studyStart));
                  setLessonResult(null);
                  setLessonPhase('learn');
                }
              }}
            >
              <View style={styles.buttonRow}>
                <Text style={[styles.primaryButtonText, { color: colors.bg }]}>
                  {lessonResult.lessonComplete ? 'Continue' : 'Continue with next words'}
                </Text>
                <Text style={[styles.buttonArrow, { color: colors.bg }]}>›</Text>
              </View>
            </TouchableOpacity>
            {lessonResult.lessonComplete && (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, marginTop: 12, minWidth: 260 }]}
                onPress={() => {
                  // Practice the whole deck — no XP, saved position untouched
                  setIsPracticeRun(true);
                  setQuiz(buildQuiz(cards, cards.length));
                  setQuizIndex(0);
                  setAnswered(null);
                  setSelectedOption(null);
                  setTypedAnswer('');
                  setRetryIds(new Set());
                  setQuizScore({ correct: 0, total: 0 });
                  setLessonResult(null);
                  setLessonPhase('quiz');
                }}
              >
                <View style={styles.buttonRow}>
                  <Text style={[styles.primaryButtonText, { color: colors.text }]}>
                    Practice all words
                  </Text>
                  <Text style={[styles.buttonArrow, { color: colors.text }]}>›</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.backToSelect, { marginTop: 12 }]}
              onPress={() => {
                setLessonResult(null);
                setScreen('path');
              }}
            >
              <Text style={[styles.backToSelectText, { color: colors.textMuted }]}>‹ Back to units</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // === SETTINGS SCREEN ===
  if (screen === 'settings') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[styles.backButtonCircle, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setScreen('path')}>
            <Text style={[styles.backButton, { color: colors.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>

        <ScrollView style={styles.settingsBody}>
          <Text style={[styles.settingsSectionTitle, { color: colors.textMuted }]}>Appearance</Text>
          <View style={[styles.themeToggleContainer, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.themeToggleOption,
                  mode === m && { backgroundColor: colors.accent },
                ]}
                onPress={() => setMode(m)}
              >
                <Text style={[
                  styles.themeToggleText,
                  { color: mode === m ? colors.bg : colors.text }
                ]}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 32 }} />
          <Text style={[styles.settingsSectionTitle, { color: colors.textMuted }]}>Check-ins</Text>
          <TouchableOpacity
            style={[
              styles.settingsLangRow,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
            onPress={toggleCheckIns}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsLangLabel, { color: colors.text }]}>Daily check-ins</Text>
              <Text style={[styles.langCardGreeting, { color: colors.textSecondary }]}>
                Snako pings you at random times, like a friend
              </Text>
            </View>
            <View
              style={[
                styles.toggleTrack,
                checkInsEnabled
                  ? { backgroundColor: colors.accent }
                  : { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.toggleThumb,
                  { backgroundColor: checkInsEnabled ? colors.bg : colors.textMuted },
                  checkInsEnabled && { alignSelf: 'flex-end' },
                ]}
              />
            </View>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
          <Text style={[styles.settingsSectionTitle, { color: colors.textMuted }]}>Learning</Text>
          <View
            style={[
              styles.settingsLangRow,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsLangLabel, { color: colors.text }]}>Words per lesson</Text>
              <Text style={[styles.langCardGreeting, { color: colors.textSecondary }]}>
                How many words each lesson studies
              </Text>
            </View>
            <View style={styles.countPickerRow}>
              {[3, 5, 7, 10].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.countPickerOption,
                    defaultStudyCount === n
                      ? { backgroundColor: colors.accent }
                      : { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
                  ]}
                  onPress={async () => {
                    setDefaultStudyCount(n);
                    await saveSetting('study_count', String(n));
                  }}
                >
                  <Text
                    style={[
                      styles.countPickerText,
                      { color: defaultStudyCount === n ? colors.bg : colors.text },
                    ]}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.settingsLangRow,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, marginTop: 10 },
            ]}
            onPress={async () => {
              const next = !repeatEnabled;
              setRepeatEnabled(next);
              await saveSetting('repeat_completed', next ? 'true' : 'false');
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsLangLabel, { color: colors.text }]}>Repeat completed words</Text>
              <Text style={[styles.langCardGreeting, { color: colors.textSecondary }]}>
                Mix old words into every quiz so they stick
              </Text>
            </View>
            <View
              style={[
                styles.toggleTrack,
                repeatEnabled
                  ? { backgroundColor: colors.accent }
                  : { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.toggleThumb,
                  { backgroundColor: repeatEnabled ? colors.bg : colors.textMuted },
                  repeatEnabled && { alignSelf: 'flex-end' },
                ]}
              />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === PRACTICE (CHAT) SCREEN ===
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.backButtonCircle, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setScreen('path')}>
          <Text style={[styles.backButton, { color: colors.text }]}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: 18 }]}>Practice</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Free conversation with Snako
          </Text>
        </View>
        <TouchableOpacity onPress={() => setScreen('settings')} style={styles.settingsButton}>
          <Text style={[styles.settingsIcon, { color: colors.accent }]}>Settings</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={
          loading ? (
            <View
              style={[
                styles.messageBubble,
                { backgroundColor: colors.bubbleAssistant, alignSelf: 'flex-start', borderBottomLeftRadius: radius.sm },
              ]}
            >
              <Text style={[styles.typingIndicator, { color: colors.textMuted }]}>Snako skriver…</Text>
            </View>
          ) : null
        }
      />

      <View style={[styles.inputContainer, { paddingBottom: keyboardHeight + 12, backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
          value={input}
          onChangeText={setInput}
          placeholder="Skriv en melding… (Type a message)"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: (!input.trim() || loading) ? colors.disabled : colors.accent },
            (!input.trim() || loading) && { borderWidth: 1, borderColor: colors.border }
          ]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        >
          <Text style={[styles.sendButtonText, { color: (!input.trim() || loading) ? colors.textMuted : colors.bg }]}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Welcome
  onboarding: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  onboardingLogo: {
    fontSize: type.xxl,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  welcomeFlag: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 16,
  },
  onboardingQuestion: {
    fontSize: type.lg,
    fontWeight: '600',
    marginBottom: 12,
  },
  welcomeSub: {
    fontSize: type.base,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  primaryButton: {
    borderRadius: radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonArrow: {
    fontSize: type.lg,
    fontWeight: '600',
    marginTop: 1,
  },
  primaryButtonText: {
    fontSize: type.base,
    fontWeight: '600',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 26,
    textAlign: 'center',
  },
  backButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: type.xs,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statText: {
    fontSize: type.sm,
    fontWeight: '600',
  },
  settingsButton: {
    padding: 8,
  },
  settingsIcon: {
    fontSize: 22,
  },
  // Path
  pathBody: {
    padding: spacing.base,
    paddingBottom: 40,
  },
  unitSection: {
    marginBottom: 24,
  },
  unitHeader: {
    marginBottom: 10,
    marginLeft: 4,
  },
  unitTitle: {
    fontSize: type.md,
    fontWeight: 'bold',
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  lessonBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  lessonBadgeText: {
    fontSize: type.sm,
  },
  lessonRowTitle: {
    flex: 1,
    fontSize: type.base,
    fontWeight: '500',
  },
  lessonRowArrow: {
    fontSize: type.base,
  },
  practiceCta: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: radius.xl,
    alignItems: 'center',
  },
  practiceCtaText: {
    fontSize: type.base,
    fontWeight: '600',
  },
  // Lesson
  lessonCounter: {
    fontSize: type.sm,
  },
  progressBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  lessonCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  lessonBody: {
    padding: spacing.base,
    paddingBottom: 40,
  },
  selectSub: {
    fontSize: type.sm,
    marginBottom: 20,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 10,
  },
  // Fixed height so revealing text or the ✓ glyph never shifts layout
  wordRowFixed: {
    height: 56,
  },
  wordRowLocked: {
    opacity: 0.55,
    marginBottom: 8,
  },
  upcomingLabel: {
    fontSize: type.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  wordEn: {
    fontSize: type.base,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
  },
  wordNo: {
    fontSize: type.base,
    textAlign: 'right',
    flexShrink: 1,
  },
  backToSelect: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backToSelectText: {
    fontSize: type.sm,
    fontWeight: '600',
  },
  countPickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  countPickerOption: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countPickerText: {
    fontSize: type.sm,
    fontWeight: '600',
  },
  exerciseType: {
    fontSize: type.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressFill: {
    height: 6,
    borderRadius: radius.full,
  },
  exerciseQuestion: {
    fontSize: type.xl,
    fontWeight: 'bold',
    marginBottom: 24,
    lineHeight: 34,
  },
  optionsWrap: {
    gap: 10,
  },
  typeAnswerInput: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: type.base,
  },
  hintRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 10,
    alignItems: 'center',
  },
  hintText: {
    fontSize: type.sm,
  },
  optionRow: {
    borderRadius: radius.md,
    padding: 16,
  },
  optionText: {
    fontSize: type.base,
  },
  feedbackAnswer: {
    fontSize: type.sm,
  },
  resultTitle: {
    fontSize: type.xl,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resultXp: {
    fontSize: type.base,
  },
  // Settings
  settingsBody: {
    flex: 1,
    padding: spacing.base,
  },
  settingsSectionTitle: {
    fontSize: type.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },
  settingsLangRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: 10,
  },
  settingsLangLabel: {
    flex: 1,
    fontSize: type.md,
    fontWeight: '500',
  },
  langCardGreeting: {
    fontSize: type.xs,
    marginTop: 2,
  },
  themeToggleContainer: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
  },
  themeToggleOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  themeToggleText: {
    fontSize: type.sm,
    fontWeight: '600',
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: radius.full,
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
  },
  // Messages
  messageList: {
    padding: spacing.base,
    paddingBottom: 24,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: radius.lg,
    marginVertical: 4,
  },
  typingIndicator: {
    fontSize: type.sm,
    fontStyle: 'italic',
  },
  // Input
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.xl,
    fontSize: type.base,
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.xl,
    alignSelf: 'flex-end',
  },
  sendButtonText: {
    fontSize: type.base,
    fontWeight: '600',
  },
});