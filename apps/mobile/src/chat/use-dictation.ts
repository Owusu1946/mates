import { useAuth } from "@clerk/expo";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";
import { useCallback, useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import { resolveApiUrl } from "./chat-model";

/**
 * Voice typing for the composer: record a clip, then send it to the API, which transcribes it
 * with Deepgram. The same flow as ChatGPT's dictation: a live waveform while you talk, text when
 * you stop. Works in Expo Go; the Deepgram key never leaves the server.
 */

/** Speech, not music: mono, 16 kHz, ~32 kbps AAC. About 240 KB a minute, quick on mobile data. */
const SPEECH: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".m4a",
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  isMeteringEnabled: true,
};
/** Keeps a clip under the API's 1 MB request limit with room to spare. */
const MAX_MS = 3 * 60_000;
const MIN_MS = 500;

/** Microphone level in dB (-160 silent … 0 loud) as the 0–1 the waveform expects. */
export const levelOf = (db: number) => Math.max(0, Math.min(1, (db + 55) / 55));

export function useDictation({ onLevel, onAutoStop }: { onLevel: (level: number) => void; onAutoStop?: () => void }) {
  const { getToken } = useAuth();
  const recorder = useAudioRecorder(SPEECH);
  const state = useAudioRecorderState(recorder, 80);
  const active = useRef(false);

  // The waveform follows the real microphone level.
  useEffect(() => {
    if (active.current && typeof state.metering === "number") onLevel(levelOf(state.metering));
  }, [state.metering, onLevel]);

  // A long recording stops itself before it outgrows the upload limit.
  useEffect(() => {
    if (active.current && state.durationMillis >= MAX_MS) onAutoStop?.();
  }, [state.durationMillis, onAutoStop]);

  const finishRecording = useCallback(async () => {
    active.current = false;
    const duration = state.durationMillis;
    try {
      await recorder.stop();
    } catch {}
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    return { uri: recorder.uri, duration };
  }, [recorder, state.durationMillis]);

  const discard = (uri: string | null) => {
    if (!uri) return;
    try {
      new File(uri).delete();
    } catch {}
  };

  /** Starts recording. False if the microphone isn't available. */
  const start = useCallback(async () => {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone is off", "Allow microphone access in Settings to talk to your mates.", [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ]);
      return false;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      active.current = true;
      return true;
    } catch {
      Alert.alert("Couldn’t start the microphone", "Close other apps using it, then try again.");
      return false;
    }
  }, [recorder]);

  /** Stops and returns the transcript ("" for silence, a too-short clip, or a failure). */
  const stop = useCallback(async () => {
    const { uri, duration } = await finishRecording();
    if (!uri || duration < MIN_MS) {
      discard(uri);
      return "";
    }
    const base = resolveApiUrl();
    const token = await getToken();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 40_000);
    try {
      if (!base || !token) throw new Error("not signed in");
      // The clip's bytes as the body. Expo's fetch rejects React Native's { uri, name, type }
      // FormData parts, so no multipart here.
      const audio = await new File(uri).arrayBuffer();
      const response = await fetch(`${base}/v1/transcribe`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "audio/mp4" },
        body: audio,
        signal: timeout.signal,
      });
      const data = (await response.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
      return data?.text?.trim() ?? "";
    } catch (error) {
      console.warn("dictation_failed", error instanceof Error ? error.message : String(error));
      Alert.alert("Couldn’t catch that", "Check your connection and try again.");
      return "";
    } finally {
      clearTimeout(timer);
      discard(uri);
    }
  }, [finishRecording, getToken]);

  /** Stops and throws the recording away. */
  const cancel = useCallback(async () => {
    const { uri } = await finishRecording();
    discard(uri);
  }, [finishRecording]);

  return { start, stop, cancel };
}
