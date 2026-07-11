import { requireNativeModule, type EventSubscription } from "expo-modules-core";
import {
  buildAndroidNotificationData,
  normalizeAndroidNotificationData,
  type AndroidNotificationData,
} from "@/utils/notification-routing";

interface NotificationResponseEvent {
  data?: unknown;
}

interface ChisaCodeAndroidRuntimeModule {
  startForegroundService(text: string): Promise<void>;
  updateForegroundServiceText(text: string): Promise<void>;
  stopForegroundService(): Promise<void>;
  sendLocalNotification(title: string, body: string, data: string | null): Promise<void>;
  consumeInitialNotificationData(): Promise<unknown>;
  addListener(
    eventName: "onNotificationResponse",
    listener: (event: NotificationResponseEvent) => void,
  ): EventSubscription;
}

const nativeModule = requireNativeModule<ChisaCodeAndroidRuntimeModule>("ChisaCodeAndroidRuntime");

/**
 * Android foreground service + local notification wrapper.
 *
 * - startForegroundService: shows an ongoing notification and keeps WebSocket alive
 * - updateForegroundServiceText: updates the ongoing notification text (e.g. agent name)
 * - stopForegroundService: stops the foreground service
 * - sendLocalNotification: posts a dismissible notification with a navigation intent
 */
export async function startForegroundService(text: string): Promise<void> {
  await nativeModule.startForegroundService(text);
}

export async function updateForegroundServiceText(text: string): Promise<void> {
  await nativeModule.updateForegroundServiceText(text);
}

export async function stopForegroundService(): Promise<void> {
  await nativeModule.stopForegroundService();
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await nativeModule.sendLocalNotification(title, body, buildAndroidNotificationData(data));
}

/**
 * Consumes notification navigation data from the current Android launch intent.
 * @returns Validated notification data, or null when absent or already consumed
 */
export async function consumeInitialNotificationData(): Promise<AndroidNotificationData | null> {
  const encoded: unknown = await nativeModule.consumeInitialNotificationData();
  return normalizeAndroidNotificationData(encoded);
}

/**
 * Subscribes to validated notification data from warm Android launch intents.
 * @param handler Called once for each valid consumed notification intent
 * @returns A function that removes the native event listener
 */
export function subscribeNotificationResponses(
  handler: (data: AndroidNotificationData) => void,
): () => void {
  const subscription = nativeModule.addListener("onNotificationResponse", (event) => {
    const data = normalizeAndroidNotificationData(event.data);
    if (data) {
      handler(data);
    }
  });
  return () => subscription.remove();
}
