import { StatusBar } from 'expo-status-bar';
import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendMessageToAI } from './src/ai';

type Language = 'norwegian' | 'cebuanano' | 'english';
type Screen = 'onboarding' | 'chat' | 'settings';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const LANGUAGES: { key: Language; label: string; flag: string; greeting: string }[] = [
  { key: 'norwegian', label: 'Norwegian', flag: '🇳🇴', greeting: 'Hei! Hva vil du lære i dag?' },
  { key: 'cebuanano', label: 'Cebuano', flag: '🇵🇭', greeting: 'Kumusta! Unsa may gusto nimong tun-an karon?' },
  { key: 'english', label: 'English', flag: '🇬🇧', greeting: 'Hi! What would you like to learn today?' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [language, setLanguage] = useState<Language>('norwegian');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const startChat = (lang: Language) => {
    setLanguage(lang);
    const greeting = LANGUAGES.find((l) => l.key === lang)?.greeting ?? 'Hei!';
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: greeting,
      },
    ]);
    setScreen('chat');
  };

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    const greeting = LANGUAGES.find((l) => l.key === lang)?.greeting ?? 'Hei!';
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: greeting,
      },
    ]);
    setScreen('chat');
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
      const aiResponse = await sendMessageToAI(userText, language);
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
        content: 'Sorry, something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageBubble,
        item.role === 'user' ? styles.userBubble : styles.assistantBubble,
      ]}
    >
      <Text
        style={item.role === 'user' ? styles.userText : styles.assistantText}
      >
        {item.content}
      </Text>
    </View>
  );

  // === ONBOARDING SCREEN ===
  if (screen === 'onboarding') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.onboarding}>
          <Text style={styles.onboardingLogo}>Snako</Text>
          <Text style={styles.onboardingQuestion}>
            What language do you want to learn?
          </Text>

          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.key}
              style={styles.langCard}
              onPress={() => startChat(lang.key)}
            >
              <Text style={styles.langCardFlag}>{lang.flag}</Text>
              <View style={styles.langCardText}>
                <Text style={styles.langCardLabel}>{lang.label}</Text>
                <Text style={styles.langCardGreeting}>{lang.greeting}</Text>
              </View>
              <Text style={styles.langCardArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // === SETTINGS SCREEN ===
  if (screen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setScreen('chat')}>
            <Text style={styles.backButton}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <ScrollView style={styles.settingsBody}>
          <Text style={styles.settingsSectionTitle}>Language</Text>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.key}
              style={[
                styles.settingsLangRow,
                language === lang.key && styles.settingsLangRowActive,
              ]}
              onPress={() => changeLanguage(lang.key)}
            >
              <Text style={styles.langCardFlag}>{lang.flag}</Text>
              <Text style={styles.settingsLangLabel}>{lang.label}</Text>
              {language === lang.key && <Text style={styles.checkMark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === CHAT SCREEN ===
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Snako</Text>
          <Text style={styles.headerSubtitle}>
            {LANGUAGES.find((l) => l.key === language)?.flag}{' '}
            {LANGUAGES.find((l) => l.key === language)?.label}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setScreen('settings')} style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Message List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={
          loading ? (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <Text style={styles.typingIndicator}>Snako is typing...</Text>
            </View>
          ) : null
        }
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  // Onboarding
  onboarding: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  onboardingLogo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 48,
  },
  onboardingQuestion: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 20,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  langCardFlag: {
    fontSize: 32,
    marginRight: 14,
  },
  langCardText: {
    flex: 1,
  },
  langCardLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  langCardGreeting: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  langCardArrow: {
    fontSize: 24,
    color: '#007AFF',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    fontSize: 28,
    color: '#007AFF',
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
  },
  settingsIcon: {
    fontSize: 26,
    color: '#007AFF',
  },
  // Settings
  settingsBody: {
    flex: 1,
    padding: 16,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },
  settingsLangRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  settingsLangRowActive: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  settingsLangLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  checkMark: {
    fontSize: 22,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  // Messages
  messageList: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#fff',
    fontSize: 16,
  },
  assistantText: {
    color: '#1a1a1a',
    fontSize: 16,
  },
  typingIndicator: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
  // Input
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    fontSize: 16,
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    alignSelf: 'flex-end',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});