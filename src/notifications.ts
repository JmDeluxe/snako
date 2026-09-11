import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const CHECKIN_PROMPTS = [
  'Hei! Har du gjort leksen din i dag? 😊',
  'Psst! En liten norskleksjon kanskje?',
  'Streaken din venter! Lær et nytt ord i dag?',
  'Hvordan går det med norsken din?',
];

export const CHANNEL_ID = 'checkins';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Check-ins',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 100, 100, 100],
    lightColor: '#000000',
  });
}

function pickRandomMinute(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function scheduleCheckIns(): Promise<void> {
  await cancelCheckIns();

  if (!(await requestNotificationPermission())) return;

  await ensureAndroidChannel();

  // 3 daily check-ins at random-ish friend times: morning-ish, afternoon, evening
  const slots = [
    { hour: 10, minute: pickRandomMinute(0, 59) },
    { hour: pickRandomMinute(14, 16), minute: pickRandomMinute(0, 59) },
    { hour: 20, minute: pickRandomMinute(0, 45) },
  ];

  for (let i = 0; i < slots.length; i++) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Snako',
        body: CHECKIN_PROMPTS[i % CHECKIN_PROMPTS.length],
        sound: undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        repeats: true,
        hour: slots[i].hour,
        minute: slots[i].minute,
      },
    });
  }
}

export async function cancelCheckIns(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}