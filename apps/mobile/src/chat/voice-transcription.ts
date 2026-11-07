/**
 * Voice typing on the web build, through the browser's Web Speech API with a live microphone
 * level. Phones use `useDictation` (recorded clip, transcribed by the API with Deepgram) instead.
 */

export interface VoiceTranscriptionOptions {
  onInterim?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onAudioLevel?: (level: number) => void; // 0 to 1
  onError?: (error: string) => void;
  onStatusChange?: (status: "idle" | "listening" | "transcribing") => void;
}

export interface VoiceTranscriptionSession {
  stop: () => Promise<string>;
  cancel: () => void;
}

export function startVoiceTranscription(options: VoiceTranscriptionOptions = {}): VoiceTranscriptionSession {
  const { onInterim, onFinal, onAudioLevel, onError, onStatusChange } = options;

  let isAborted = false;
  let isStopped = false;
  let accumulatedTranscript = "";
  let interimTranscript = "";

  let recognition: any = null;
  let audioContext: any = null;
  let micStream: any = null;
  let audioLevelInterval: ReturnType<typeof setInterval> | null = null;

  onStatusChange?.("listening");

  const SpeechRecognition =
    typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  if (!SpeechRecognition) {
    onError?.("Voice typing isn’t supported in this browser.");
  } else {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";

      recognition.onresult = (event: any) => {
        if (isAborted || isStopped) return;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript ?? "";
          if (item.isFinal) accumulatedTranscript += (accumulatedTranscript ? " " : "") + text.trim();
          else interim += text;
        }
        interimTranscript = interim;
        onInterim?.([accumulatedTranscript, interim].filter(Boolean).join(" ").trim());
      };
      recognition.onerror = (event: any) => {
        if (isAborted || isStopped) return;
        if (event.error !== "no-speech" && event.error !== "aborted") onError?.(event.error || "Speech recognition error");
      };
      // Browsers end recognition after a pause; keep listening until the user stops.
      recognition.onend = () => {
        if (!isAborted && !isStopped && recognition) {
          try {
            recognition.start();
          } catch {}
        }
      };
      recognition.start();
    } catch {
      recognition = null;
      onError?.("Couldn’t start voice typing.");
    }
  }

  // The waveform follows the real microphone level where the browser allows it.
  if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined") {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (isAborted || isStopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        micStream = stream;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioCtx();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.5;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        audioLevelInterval = setInterval(() => {
          if (isAborted || isStopped) return;
          analyser.getByteFrequencyData(data);
          const average = data.reduce((sum, value) => sum + value, 0) / data.length;
          onAudioLevel?.(Math.min(1, Math.max(0, average / 128)));
        }, 60);
      })
      .catch(() => undefined);
  }

  function cleanup() {
    if (audioLevelInterval) clearInterval(audioLevelInterval);
    audioLevelInterval = null;
    try {
      micStream?.getTracks().forEach((track: any) => track.stop());
    } catch {}
    micStream = null;
    try {
      audioContext?.close();
    } catch {}
    audioContext = null;
    if (recognition) {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch {}
      recognition = null;
    }
  }

  return {
    stop: async () => {
      if (isStopped || isAborted) return accumulatedTranscript;
      isStopped = true;
      onStatusChange?.("transcribing");
      cleanup();
      const finalResult = [accumulatedTranscript, interimTranscript].filter(Boolean).join(" ").trim();
      onFinal?.(finalResult);
      onStatusChange?.("idle");
      return finalResult;
    },
    cancel: () => {
      isAborted = true;
      isStopped = true;
      cleanup();
      onStatusChange?.("idle");
    },
  };
}
