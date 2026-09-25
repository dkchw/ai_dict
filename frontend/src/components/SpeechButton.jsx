import React, { useState, useEffect, useRef } from "react";
import { Volume2, VolumeX, ChevronDown, Mic, Sparkles } from "lucide-react";
import { resolveSpeechLanguage, speakText, stopSpeech } from "../utils/speech";
import PronunciationModal from "./PronunciationModal";

export default function SpeechButton({
  text,
  wordLang = "",
  profileLang = "",
  profileName = "",
  size = 16,
  className = ""
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [practiceModalOpen, setPracticeModalOpen] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState(null);
  const menuRef = useRef(null);

  const { code: langCode, label: langLabel } = resolveSpeechLanguage({
    wordLang,
    profileLang,
    profileName
  });

  // Reset audio URL when text changes
  useEffect(() => {
    if (userAudioUrl) {
      URL.revokeObjectURL(userAudioUrl);
      setUserAudioUrl(null);
    }
  }, [text]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
      if (userAudioUrl) {
        URL.revokeObjectURL(userAudioUrl);
      }
    };
  }, []);

  const handlePlay = (mode) => {
    if (!text || !text.trim()) return;

    if (isPlaying && activeMode === mode) {
      stopSpeech();
      setIsPlaying(false);
      setActiveMode(null);
      return;
    }

    setIsPlaying(true);
    setActiveMode(mode);
    setMenuOpen(false);

    speakText(text, {
      mode,
      lang: langCode,
      onStart: () => {
        setIsPlaying(true);
        setActiveMode(mode);
      },
      onEnd: () => {
        setIsPlaying(false);
        setActiveMode(null);
      },
      onError: () => {
        setIsPlaying(false);
        setActiveMode(null);
      }
    });
  };

  const handleStop = (e) => {
    e.stopPropagation();
    stopSpeech();
    setIsPlaying(false);
    setActiveMode(null);
    setMenuOpen(false);
  };

  return (
    <>
      <div
        className={`relative inline-flex items-center gap-0.5 bg-gray-100/80 dark:bg-gray-800/80 p-0.5 rounded-lg border border-gray-200/80 dark:border-gray-700/80 ${className}`}
        ref={menuRef}
      >
        {/* Pronounce Button */}
        <button
          type="button"
          onClick={() => handlePlay("pronounce")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
            isPlaying && activeMode === "pronounce"
              ? "bg-blue-600 text-white shadow-xs animate-pulse"
              : "text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700/80 hover:text-blue-600 dark:hover:text-blue-400"
          }`}
          title={`Pronounce in ${langLabel} (${langCode})`}
        >
          <Volume2 size={size} className={isPlaying && activeMode === "pronounce" ? "animate-bounce" : ""} />
          <span className="hidden sm:inline">Listen</span>
        </button>

        {/* Dropdown Options Toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="px-1 py-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white dark:hover:bg-gray-700/80 transition-colors cursor-pointer"
          title="Pronunciation options (Speed, Voice)"
        >
          <ChevronDown size={13} className={`transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Subtle Divider */}
        <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-0.5" />

        {/* Small Microphone Practice & Compare Button */}
        <button
          type="button"
          onClick={() => setPracticeModalOpen(true)}
          className={`relative flex items-center justify-center px-1.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
            userAudioUrl
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
              : "text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/80 hover:text-indigo-600 dark:hover:text-indigo-400"
          }`}
          title={`Record & compare pronunciation for "${text}"`}
        >
          <Mic size={size} className={userAudioUrl ? "text-indigo-600 dark:text-indigo-400" : ""} />
          {userAudioUrl && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 ring-2 ring-white dark:ring-gray-800"
              title="Has recorded attempt"
            />
          )}
        </button>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-white dark:bg-[#1f2335] rounded-xl shadow-xl border border-gray-200/90 dark:border-gray-700/90 p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Pronunciation • {langLabel}
            </div>

            <button
              type="button"
              onClick={() => handlePlay("pronounce")}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                activeMode === "pronounce"
                  ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <span className="flex items-center gap-2">
                <Volume2 size={14} className="text-blue-500" />
                <span>Pronounce ({langCode})</span>
              </span>
              <span className="text-[10px] text-gray-400">1.0x</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlay("slow")}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                activeMode === "slow"
                  ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <span className="flex items-center gap-2">
                <span>🐢</span>
                <span>Slow Pronounce</span>
              </span>
              <span className="text-[10px] text-gray-400">0.65x</span>
            </button>

            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPracticeModalOpen(true);
              }}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Mic size={14} className="text-indigo-500" />
                <span>Record & Compare</span>
              </span>
              <Sparkles size={12} className="text-indigo-400" />
            </button>

            {isPlaying && (
              <>
                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                >
                  <VolumeX size={14} />
                  <span>Stop Speech</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Pronunciation Practice & Comparison Modal */}
      <PronunciationModal
        isOpen={practiceModalOpen}
        onClose={() => setPracticeModalOpen(false)}
        text={text}
        langCode={langCode}
        langLabel={langLabel}
        userAudioUrl={userAudioUrl}
        onAudioChange={setUserAudioUrl}
      />
    </>
  );
}
