import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { runRequest } from "../chat/background-chat";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const notificationDeviceKey = (userId: string) => `cooper:push-device:${userId}`;

export async function disableNotifications(getToken: () => Promise<string | null>, userId: string) {
  const token = await AsyncStorage.getItem(notificationDeviceKey(userId));
  if (token) await runRequest(getToken, "devices/disable", { token });
  await AsyncStorage.removeItem(notificationDeviceKey(userId));
}

export async function enableNotifications(getToken: () => Promise<string | null>, userId: string) {
  if (Platform.OS === "web" || Constants.executionEnvironment === "storeClient") throw new Error("Notifications are available in the installed app.");
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("Notifications aren’t available in this build yet.");
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "Cooper", importance: Notifications.AndroidImportance.DEFAULT });
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notifications are off. You can enable them in your phone’s settings.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await runRequest(getToken, "devices", { token, enabled: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Accra", quietStart: 22, quietEnd: 8 });
  await AsyncStorage.setItem(notificationDeviceKey(userId), token);
  return token;
}
