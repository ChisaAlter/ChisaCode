import { requireNativeModule } from "expo";
import {
  buildAndroidNotificationData,
  parseAndroidNotificationData,
  type AndroidNotificationData,
} from "@/utils/notification-routing";

const nativeModule = requireNativeModule("ChisaCodeAndroidRuntime");

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
  return parseAndroidNotificationData(typeof encoded === "string" ? encoded : null);
}
