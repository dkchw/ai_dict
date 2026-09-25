import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Mic,
  MicOff,
  Square,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Trash2,
  HelpCircle
} from "lucide-react";
import { speakText, stopSpeech } from "../utils/speech";

// Calculate text similarity score (0-100) using Levenshtein distance
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  // Normalize unicode, remove punctuation & extra spaces
  const s1 = str1.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const s2 = str2.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return Math.round((minLen / maxLen) * 100);
  }

  const matrix = [];
  for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const dist = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}

// Format seconds into MM:SS with strict numeric guards
function formatTime(sec) {
  if (!sec || !Number.isFinite(sec) || isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function PronunciationModal({
  isOpen,
  onClose,
  text = "",
  langCode = "en-US",
  langLabel = "English",
  userAudioUrl = null,
  onAudioChange = null
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState([20, 20, 20, 20, 20, 20, 20, 20]);
  const [micError, setMicError] = useState(null);

  // Machine reference state
  const [machinePlaying, setMachinePlaying] = useState(false);
  const [machineSpeed, setMachineSpeed] = useState("pronounce"); // "pronounce" (1.0x) or "slow" (0.65x)

  // User playback state
  const [isPlayingUser, setIsPlayingUser] = useState(false);
  const [userCurrentTime, setUserCurrentTime] = useState(0);
  const [userDuration, setUserDuration] = useState(0);

  // Comparison state: null | "machine" | "pause" | "user"
  const [comparePhase, setComparePhase] = useState(null);
  const [compareSpeed, setCompareSpeed] = useState("pronounce");

  // Speech Recognition state
  const [transcript, setTranscript] = useState("");
  const [similarity, setSimilarity] = useState(null);

  // Refs
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const recognitionRef = useRef(null);
  const userAudioRef = useRef(null);
  const compareTimeoutRef = useRef(null);
  const modalCardRef = useRef(null);
  const recordedDurationRef = useRef(0);
  const recordingStartTimeRef = useRef(0);

  // Cleanup on unmount or close
  const cleanupAll = () => {
    stopRecordingInternal();
    stopSpeech();
    if (userAudioRef.current) {
      userAudioRef.current.pause();
    }
    if (compareTimeoutRef.current) {
      clearTimeout(compareTimeoutRef.current);
      compareTimeoutRef.current = null;
    }
    setMachinePlaying(false);
    setIsPlayingUser(false);
    setComparePhase(null);
  };

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);

  // Handle ESC key and keyboard interactions
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        cleanupAll();
        onClose();
      } else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else if (!userAudioUrl) {
          startRecording();
        } else {
          togglePlayUser();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isRecording, userAudioUrl]);

  // Sync audio duration once metadata loads
  const handleLoadedMetadata = () => {
    if (userAudioRef.current) {
      const dur = userAudioRef.current.duration;
      if (Number.isFinite(dur) && dur > 0) {
        setUserDuration(dur);
      } else if (recordedDurationRef.current > 0) {
        setUserDuration(recordedDurationRef.current);
      }
    }
  };

  // User audio time update
  const handleTimeUpdate = () => {
    if (userAudioRef.current) {
      const cur = userAudioRef.current.currentTime;
      if (Number.isFinite(cur)) {
        setUserCurrentTime(cur);
      }
    }
  };

  // Start MediaRecorder + Web Audio Visualizer + Speech Recognition
  const startRecording = async () => {
    setMicError(null);
    stopSpeech();
    if (userAudioRef.current) {
      userAudioRef.current.pause();
      setIsPlayingUser(false);
    }
    if (compareTimeoutRef.current) {
      clearTimeout(compareTimeoutRef.current);
      setComparePhase(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError("Audio recording is not supported in this browser environment or requires HTTPS/localhost.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Select supported audio mime type
      let mimeType = "";
      if (window.MediaRecorder) {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mimeType = "audio/ogg;codecs=opus";
        }
      }

      const recorderOptions = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        
        // Compute recorded duration from elapsed time
        const elapsedSec = (Date.now() - recordingStartTimeRef.current) / 1000;
        const dur = Math.max(1, Math.round(elapsedSec * 10) / 10);
        recordedDurationRef.current = dur;
        setUserDuration(dur);
        setUserCurrentTime(0);

        if (onAudioChange) {
          onAudioChange(url);
        }
      };

      // Set up real-time audio visualizer
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === "suspended") {
            ctx.resume();
          }
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 32;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);

          audioContextRef.current = ctx;
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            const bars = [];
            const step = Math.max(1, Math.floor(dataArray.length / 8));
            for (let i = 0; i < 8; i++) {
              const val = dataArray[i * step] || 0;
              // Map 0-255 to percentage 15% - 100%
              bars.push(Math.max(15, Math.min(100, Math.round((val / 255) * 100))));
            }
            setAudioLevels(bars);
            animFrameRef.current = requestAnimationFrame(updateMeter);
          };
          animFrameRef.current = requestAnimationFrame(updateMeter);
        }
      } catch (err) {
        console.warn("Visualizer initialization error:", err);
      }

      // Set up SpeechRecognition (optional bonus accuracy)
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = langCode;
          rec.interimResults = true;
          rec.maxAlternatives = 1;
          rec.continuous = false;

          rec.onresult = (event) => {
            let resText = "";
            for (let i = 0; i < event.results.length; i++) {
              resText += event.results[i][0].transcript;
            }
            if (resText.trim()) {
              setTranscript(resText.trim());
              const score = calculateSimilarity(resText, text);
              setSimilarity(score);
            }
          };

          rec.onerror = (e) => {
            // Non-fatal, just speech recognition notice
            console.log("Speech recognition notice:", e.error);
          };

          rec.start();
          recognitionRef.current = rec;
        } catch (e) {
          console.warn("SpeechRecognition failed to start:", e);
        }
      }

      recordingStartTimeRef.current = Date.now();
      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      setTranscript("");
      setSimilarity(null);

      // Recording timer (auto-stops at 30 seconds)
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Microphone error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicError("Microphone permission was denied. Please allow microphone access in your browser address bar.");
      } else {
        setMicError(`Could not access microphone: ${err.message || err.name}`);
      }
      setIsRecording(false);
    }
  };

  const stopRecordingInternal = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    setAudioLevels([20, 20, 20, 20, 20, 20, 20, 20]);
  };

  const stopRecording = () => {
    stopRecordingInternal();
  };

  // Play/Pause User Audio
  const togglePlayUser = () => {
    if (!userAudioRef.current || !userAudioUrl) return;

    if (isPlayingUser) {
      userAudioRef.current.pause();
      setIsPlayingUser(false);
      if (comparePhase === "user") {
        setComparePhase(null);
      }
    } else {
      stopSpeech();
      setMachinePlaying(false);
      userAudioRef.current.currentTime = 0;
      userAudioRef.current
        .play()
        .then(() => setIsPlayingUser(true))
        .catch((e) => {
          console.warn("Playback error:", e);
          setIsPlayingUser(false);
        });
    }
  };

  // Play Machine Reference
  const handlePlayMachine = (mode) => {
    if (!text || !text.trim()) return;

    if (machinePlaying && machineSpeed === mode) {
      stopSpeech();
      setMachinePlaying(false);
      return;
    }

    // Stop user audio if playing
    if (userAudioRef.current) {
      userAudioRef.current.pause();
      setIsPlayingUser(false);
    }
    if (compareTimeoutRef.current) {
      clearTimeout(compareTimeoutRef.current);
      setComparePhase(null);
    }

    setMachinePlaying(true);
    setMachineSpeed(mode);

    speakText(text, {
      mode,
      lang: langCode,
      onStart: () => {
        setMachinePlaying(true);
        setMachineSpeed(mode);
      },
      onEnd: () => {
        setMachinePlaying(false);
      },
      onError: () => {
        setMachinePlaying(false);
      }
    });
  };

  // Compare Both (Machine -> pause 380ms -> User)
  const handleCompareBoth = () => {
    if (comparePhase) {
      // Stop comparison
      stopSpeech();
      if (userAudioRef.current) {
        userAudioRef.current.pause();
        setIsPlayingUser(false);
      }
      if (compareTimeoutRef.current) {
        clearTimeout(compareTimeoutRef.current);
        compareTimeoutRef.current = null;
      }
      setComparePhase(null);
      setMachinePlaying(false);
      return;
    }

    if (!userAudioUrl) return;

    // Reset everything
    stopSpeech();
    if (userAudioRef.current) {
      userAudioRef.current.pause();
      setIsPlayingUser(false);
    }

    // Phase 1: Machine speaks
    setComparePhase("machine");
    setMachinePlaying(true);
    setMachineSpeed(compareSpeed);

    speakText(text, {
      mode: compareSpeed,
      lang: langCode,
      onStart: () => {
        setComparePhase("machine");
        setMachinePlaying(true);
      },
      onEnd: () => {
        setMachinePlaying(false);
        setComparePhase("pause");

        // Phase 2: Pause 380ms then play user recording
        compareTimeoutRef.current = setTimeout(() => {
          setComparePhase("user");
          if (userAudioRef.current) {
            userAudioRef.current.currentTime = 0;
            userAudioRef.current
              .play()
              .then(() => setIsPlayingUser(true))
              .catch(() => {
                setComparePhase(null);
                setIsPlayingUser(false);
              });
          } else {
            setComparePhase(null);
          }
        }, 380);
      },
      onError: () => {
        setMachinePlaying(false);
        setComparePhase(null);
      }
    });
  };

  // Re-record (discard existing and start fresh)
  const handleRerecord = () => {
    cleanupAll();
    if (userAudioUrl) {
      URL.revokeObjectURL(userAudioUrl);
    }
    if (onAudioChange) {
      onAudioChange(null);
    }
    setTranscript("");
    setSimilarity(null);
    setUserCurrentTime(0);
    setUserDuration(0);
    recordedDurationRef.current = 0;
    setTimeout(() => {
      startRecording();
    }, 100);
  };

  // Clear recording
  const handleDeleteRecording = () => {
    cleanupAll();
    if (userAudioUrl) {
      URL.revokeObjectURL(userAudioUrl);
    }
    if (onAudioChange) {
      onAudioChange(null);
    }
    setTranscript("");
    setSimilarity(null);
    setUserCurrentTime(0);
    setUserDuration(0);
    recordedDurationRef.current = 0;
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          cleanupAll();
          onClose();
        }
      }}
    >
      {/* Hidden Audio Element for User Recording */}
      {userAudioUrl && (
        <audio
          ref={userAudioRef}
          src={userAudioUrl}
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            setIsPlayingUser(false);
            if (comparePhase === "user") {
              setComparePhase(null);
            }
          }}
        />
      )}

      <div
        ref={modalCardRef}
        className="relative w-full max-w-lg bg-white dark:bg-[#1a1b26] text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pronunciation-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/60 dark:bg-gray-800/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Mic size={20} />
            </div>
            <div className="min-w-0">
              <h3 id="pronunciation-modal-title" className="text-base sm:text-lg font-bold truncate">
                Pronunciation Studio
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                  &ldquo;{text}&rdquo;
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                  {langLabel} ({langCode})
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              cleanupAll();
              onClose();
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer shrink-0"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Microphone Permission / Device Error Notice */}
          {micError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1 leading-relaxed">{micError}</div>
              <button
                type="button"
                onClick={startRecording}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium text-[11px] cursor-pointer shrink-0 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Compare Both (A/B) Banner - When user has a recording */}
          {userAudioUrl && !isRecording && (
            <div
              className={`p-3.5 rounded-xl border transition-all duration-200 ${
                comparePhase
                  ? "bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 shadow-md ring-2 ring-indigo-400/20"
                  : "bg-gradient-to-r from-blue-50/60 via-indigo-50/60 to-purple-50/60 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30 border-indigo-100 dark:border-indigo-900/50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
                    <Sparkles size={14} className="text-indigo-500" />
                    <span>A/B Comparison Mode</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                    Hear the native machine reference first, then immediately hear your voice.
                  </p>
                </div>

                {/* Speed toggle for comparison */}
                <div className="inline-flex items-center self-start sm:self-auto bg-white dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setCompareSpeed("pronounce")}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      compareSpeed === "pronounce"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-gray-600 dark:text-gray-300 hover:text-indigo-600"
                    }`}
                  >
                    1.0x
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareSpeed("slow")}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      compareSpeed === "slow"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-gray-600 dark:text-gray-300 hover:text-indigo-600"
                    }`}
                  >
                    🐢 0.65x
                  </button>
                </div>
              </div>

              {/* Compare Action Button & Status */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCompareBoth}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-sm ${
                    comparePhase
                      ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                      : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white hover:shadow-indigo-500/25"
                  }`}
                >
                  {comparePhase ? (
                    <>
                      <Square size={15} />
                      <span>Stop Comparison</span>
                    </>
                  ) : (
                    <>
                      <Play size={15} className="fill-current" />
                      <span>Compare Both (Machine → You)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Comparison Phase Step Indicator */}
              {comparePhase && (
                <div className="mt-2.5 p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 animate-in fade-in">
                  {comparePhase === "machine" && (
                    <>
                      <Volume2 size={15} className="animate-bounce text-blue-500" />
                      <span>Step 1/2: Listening to Machine Reference...</span>
                    </>
                  )}
                  {comparePhase === "pause" && (
                    <>
                      <ArrowRight size={15} className="text-gray-400 animate-pulse" />
                      <span>Switching to your voice...</span>
                    </>
                  )}
                  {comparePhase === "user" && (
                    <>
                      <Mic size={15} className="animate-bounce text-indigo-500" />
                      <span>Step 2/2: Listening to Your Voice...</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Two Section Cards: 1. Machine Reference | 2. Your Recording */}
          <div className="grid grid-cols-1 gap-3.5">
            {/* Card 1: Machine Pronunciation (Native Reference) */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-150 ${
                comparePhase === "machine" || (machinePlaying && !comparePhase)
                  ? "border-blue-400 dark:border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-400/20"
                  : "border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40"
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Volume2 size={14} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                    Machine Reference
                  </span>
                </div>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  Native speech engine
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePlayMachine("pronounce")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    machinePlaying && machineSpeed === "pronounce"
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:border-blue-300"
                  }`}
                >
                  <Volume2 size={14} className={machinePlaying && machineSpeed === "pronounce" ? "animate-bounce" : ""} />
                  <span>Listen (1.0x)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePlayMachine("slow")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    machinePlaying && machineSpeed === "slow"
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:border-blue-300"
                  }`}
                >
                  <span>🐢</span>
                  <span>Slow (0.65x)</span>
                </button>

                {machinePlaying && (
                  <button
                    type="button"
                    onClick={() => {
                      stopSpeech();
                      setMachinePlaying(false);
                    }}
                    className="p-2 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors cursor-pointer"
                    title="Stop machine playback"
                  >
                    <VolumeX size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Card 2: Your Recording */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-150 ${
                comparePhase === "user" || isPlayingUser
                  ? "border-indigo-400 dark:border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-400/20"
                  : isRecording
                  ? "border-red-400 dark:border-red-600 bg-red-50/40 dark:bg-red-950/30"
                  : "border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40"
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                      isRecording
                        ? "bg-red-500 text-white"
                        : userAudioUrl
                        ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <Mic size={14} className={isRecording ? "animate-bounce" : ""} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                    Your Recording
                  </span>
                </div>

                <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                  {isRecording ? (
                    <span className="text-red-600 dark:text-red-400 font-bold animate-pulse">
                      ● Recording {formatTime(recordingSeconds)} / 00:30
                    </span>
                  ) : userAudioUrl ? (
                    <span>Duration: {formatTime(userDuration)}</span>
                  ) : (
                    <span>Ready to record</span>
                  )}
                </div>
              </div>

              {/* State A: Recording in progress */}
              {isRecording && (
                <div className="py-3 flex flex-col items-center justify-center gap-3">
                  {/* Real-time Dynamic Waveform Bars */}
                  <div className="flex items-center justify-center gap-1.5 h-12 w-full">
                    {audioLevels.map((lvl, idx) => (
                      <div
                        key={idx}
                        className="w-2.5 rounded-full bg-gradient-to-t from-red-500 to-rose-400 transition-all duration-75"
                        style={{ height: `${lvl}%` }}
                      />
                    ))}
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                    Speak clearly: <strong className="text-red-600 dark:text-red-400">&ldquo;{text}&rdquo;</strong>
                  </p>

                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex items-center gap-2 py-2 px-5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                  >
                    <Square size={14} className="fill-current" />
                    <span>Done Speaking (Stop)</span>
                  </button>
                </div>
              )}

              {/* State B: Has recording -> Playback, Re-record, Scrubber */}
              {!isRecording && userAudioUrl && (
                <div className="space-y-3">
                  {/* Scrubber & Player Row */}
                  <div className="flex items-center gap-3 bg-white dark:bg-gray-800/80 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={togglePlayUser}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-transform active:scale-90 cursor-pointer ${
                        isPlayingUser
                          ? "bg-indigo-600 text-white"
                          : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100"
                      }`}
                      title={isPlayingUser ? "Pause" : "Play your voice"}
                    >
                      {isPlayingUser ? (
                        <Pause size={16} className="fill-current" />
                      ) : (
                        <Play size={16} className="fill-current ml-0.5" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 mb-1">
                        <span>{formatTime(userCurrentTime)}</span>
                        <span>{formatTime(userDuration)}</span>
                      </div>
                      <div
                        className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer relative"
                        onClick={(e) => {
                          if (userAudioRef.current && userDuration > 0 && Number.isFinite(userDuration)) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            const targetTime = pos * userDuration;
                            userAudioRef.current.currentTime = targetTime;
                            setUserCurrentTime(targetTime);
                          }
                        }}
                      >
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{
                            width: `${userDuration > 0 && Number.isFinite(userDuration) ? Math.min(100, (userCurrentTime / userDuration) * 100) : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleRerecord}
                        className="p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        title="Re-record another take"
                      >
                        <RotateCcw size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteRecording}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        title="Delete recording"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Speech Recognition Match Feedback (if captured) */}
                  {transcript && (
                    <div
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                        similarity >= 85
                          ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                          : similarity >= 60
                          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                          : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {similarity >= 85 ? (
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        ) : (
                          <Sparkles size={16} className="text-amber-500 shrink-0" />
                        )}
                        <span className="truncate">
                          Heard: <strong className="font-semibold">&ldquo;{transcript}&rdquo;</strong>
                        </span>
                      </div>

                      {similarity !== null && (
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0 ${
                            similarity >= 85
                              ? "bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100"
                              : similarity >= 60
                              ? "bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100"
                              : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                          }`}
                        >
                          {similarity}% Match
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* State C: Empty / No recording yet -> Invite to record */}
              {!isRecording && !userAudioUrl && (
                <div className="py-4 flex flex-col items-center justify-center text-center gap-2.5">
                  <button
                    type="button"
                    onClick={startRecording}
                    className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shadow-xs transition-transform active:scale-95 cursor-pointer group"
                    title="Click to start recording"
                  >
                    <Mic size={24} className="group-hover:scale-110 transition-transform" />
                  </button>

                  <div>
                    <button
                      type="button"
                      onClick={startRecording}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Start Recording Your Voice
                    </button>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Say &ldquo;{text}&rdquo; into your microphone
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer / Guidance */}
        <div className="p-3 sm:px-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <HelpCircle size={13} />
            <span>Listen to reference, record your attempt, and click Compare Both.</span>
          </div>

          <button
            type="button"
            onClick={() => {
              cleanupAll();
              onClose();
            }}
            className="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}
