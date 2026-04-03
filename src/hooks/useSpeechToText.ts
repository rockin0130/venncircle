import { useState, useCallback, useRef } from "react";

interface UseSpeechToTextOptions {
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
  lang?: string;
}

export function useSpeechToText({ onResult, onEnd, lang = "en-US" }: UseSpeechToTextOptions = {}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const isSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!isSupported) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult?.(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      onEnd?.();
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [isSupported, lang, onResult, onEnd]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, start, stop, isSupported };
}
