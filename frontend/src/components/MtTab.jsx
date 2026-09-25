import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, ArrowLeftRight, Copy, Check, Loader2, Sparkles, Zap, Trash2, X, RefreshCw, Eye, FolderPlus, Send, History, CheckCheck, Download, AlertCircle } from 'lucide-react';
import { COLORS } from "./SearchTab";
import SpeechButton from "./SpeechButton";
import StarRating from "./StarRating";

const FLORES_LANGUAGES = [
  { code: '🌐 Auto', name: 'Auto Detect', short: 'Auto' },
  { code: '🇺🇸 EN', name: 'English', short: 'English' },
  { code: '🇻🇳 VI', name: 'Vietnamese', short: 'Vietnamese' },
  { code: '🇩🇪 DE', name: 'German', short: 'German' },
  { code: '🇫🇷 FR', name: 'French', short: 'French' },
  { code: '🇪🇸 ES', name: 'Spanish', short: 'Spanish' },
  { code: '🇨🇳 ZH', name: 'Chinese (Simplified)', short: 'Chinese' },
  { code: '🇯🇵 JA', name: 'Japanese', short: 'Japanese' },
  { code: '🇰🇷 KO', name: 'Korean', short: 'Korean' },
  { code: '🇮🇹 IT', name: 'Italian', short: 'Italian' },
  { code: '🇵🇹 PT', name: 'Portuguese', short: 'Portuguese' },
  { code: '🇷🇺 RU', name: 'Russian', short: 'Russian' },
  { code: '🇸🇦 AR', name: 'Arabic', short: 'Arabic' },
  { code: '🇳🇱 NL', name: 'Dutch', short: 'Dutch' },
  { code: '🇵🇱 PL', name: 'Polish', short: 'Polish' },
  { code: '🇹🇷 TR', name: 'Turkish', short: 'Turkish' },
  { code: '🇺🇦 UK', name: 'Ukrainian', short: 'Ukrainian' },
  { code: '🇮🇩 ID', name: 'Indonesian', short: 'Indonesian' },
  { code: '🇮🇳 HI', name: 'Hindi', short: 'Hindi' },
  { code: '🇹🇭 TH', name: 'Thai', short: 'Thai' },
  { code: '🇸🇪 SV', name: 'Swedish', short: 'Swedish' },
  { code: '🇳🇴 NO', name: 'Norwegian', short: 'Norwegian' },
  { code: '🇩🇰 DA', name: 'Danish', short: 'Danish' },
  { code: '🇫🇮 FI', name: 'Finnish', short: 'Finnish' },
  { code: '🇨🇿 CS', name: 'Czech', short: 'Czech' },
  { code: '🇬🇷 EL', name: 'Greek', short: 'Greek' },
  { code: '🇭🇺 HU', name: 'Hungarian', short: 'Hungarian' },
  { code: '🇷🇴 RO', name: 'Romanian', short: 'Romanian' },
  { code: '🇮🇱 HE', name: 'Hebrew', short: 'Hebrew' }
];

const POPULAR_SOURCE_LANGS = ['🌐 Auto', '🇺🇸 EN', '🇻🇳 VI', '🇩🇪 DE', '🇫🇷 FR', '🇪🇸 ES', '🇨🇳 ZH', '🇯🇵 JA'];
const POPULAR_TARGET_LANGS = ['🇺🇸 EN', '🇻🇳 VI', '🇩🇪 DE', '🇫🇷 FR', '🇪🇸 ES', '🇨🇳 ZH', '🇯🇵 JA'];



export default function MtTab({
  mtRecords = [],
  tabId,
  fetchMtRecords,
  settings,
  defaultSettings,
  showRecentEmpty,
  onUpdateTab,
  initialMt,
  mtSourceLang = '🌐 Auto',
  setMtSourceLang,
  mtTargetLang = '🇺🇸 EN',
  setMtTargetLang,
  profileId = 1,
  profileName = '',
  onOpenHistory,
  onMoveItem,
  onMoveMode,
  onAssignSession,
  onAddNewTab,
  onBackToCorrection,
  onSendToCorrection
}) {
  const [inputText, setInputText] = useState(initialMt?.text || '');
  const [translatedText, setTranslatedText] = useState(initialMt?.translated_text || '');
  const [detectedSource, setDetectedSource] = useState(initialMt?.detected_source || null);
  const [currentRecord, setCurrentRecord] = useState(initialMt || null);
  const [level, setLevel] = useState(() => localStorage.getItem('mt_model_level') || 'standard');
  const [modelStatus, setModelStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(() => localStorage.getItem('mt_auto_translate') !== 'false');

  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const targetDebounceTimerRef = useRef(null);
  const lastTranslatedTextRef = useRef('');

  // Fetch model status on mount
  const checkModelStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/mt/status?profile_id=${profileId}`);
      if (res.ok) {
        const data = await res.json();
        setModelStatus(data);
        if (data.models?.[level]?.downloading) {
          setDownloading(true);
        } else {
          setDownloading(false);
        }
      }
    } catch (e) {
      console.error("Failed to check MT status", e);
    }
  }, [profileId, level]);

  useEffect(() => {
    checkModelStatus();
    const interval = setInterval(() => {
      if (downloading) {
        checkModelStatus();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [checkModelStatus, downloading]);

  // Focus input on load
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Sync initialMt prop
  useEffect(() => {
    if (initialMt?.text) {
      setInputText(initialMt.text);
      if (initialMt.translated_text) {
        setTranslatedText(initialMt.translated_text);
        setCurrentRecord(initialMt);
        lastTranslatedTextRef.current = initialMt.text;
      } else if (initialMt.isTemp) {
        performTranslate(initialMt.text, mtSourceLang, mtTargetLang, level);
      }
    }
  }, [initialMt]);

  // Perform translation
  const performTranslate = async (textToTranslate, srcLang, tgtLang, modelLevel) => {
    const text = (textToTranslate !== undefined ? textToTranslate : inputText).trim();
    if (!text) {
      setTranslatedText('');
      setCurrentRecord(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/mt/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          source_lang: srcLang || mtSourceLang,
          target_lang: tgtLang || mtTargetLang,
          level: modelLevel || level,
          profile_id: profileId,
          session_id: localStorage.getItem('active_session_id') || undefined,
          save_history: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Translation failed');
      }

      const data = await res.json();
      setTranslatedText(data.translated_text || '');
      setDetectedSource(data.detected_source || null);
      if (data.record) {
        setCurrentRecord(data.record);
      }
      lastTranslatedTextRef.current = text;
      if (fetchMtRecords) fetchMtRecords();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Translation error');
    } finally {
      setLoading(false);
    }
  };

  // Debounced auto-translation on text typing
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (!val.trim()) {
      setTranslatedText('');
      setCurrentRecord(null);
      lastTranslatedTextRef.current = '';
      return;
    }

    if (autoTranslate) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (val.trim() && val.trim() !== lastTranslatedTextRef.current) {
          performTranslate(val, mtSourceLang, mtTargetLang, level);
        }
      }, 600);
    }
  };

  // Edit translation with debounced auto-save to backend
  const handleTranslationChange = (e) => {
    const val = e.target.value;
    setTranslatedText(val);

    if (currentRecord?.id) {
      if (targetDebounceTimerRef.current) clearTimeout(targetDebounceTimerRef.current);
      targetDebounceTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/mt/records/${currentRecord.id}/translation`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ translated_text: val })
          });
          if (res.ok) {
            const updated = await res.json();
            setCurrentRecord(updated);
            if (fetchMtRecords) fetchMtRecords();
          }
        } catch (err) {
          console.error("Failed to update MT translation", err);
        }
      }, 500);
    }
  };

  // Keyboard shortcut Ctrl+Enter to translate
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      performTranslate(inputText, mtSourceLang, mtTargetLang, level);
    }
  };

  // Swap source and target languages
  const handleSwapLanguages = () => {
    if (mtSourceLang === '🌐 Auto') return;
    const tempSrc = mtSourceLang;
    const tempTgt = mtTargetLang;
    setMtSourceLang?.(tempTgt);
    setMtTargetLang?.(tempSrc);

    // Swap text if both exist
    if (translatedText && inputText) {
      const tempText = inputText;
      setInputText(translatedText);
      setTranslatedText(tempText);
      performTranslate(translatedText, tempTgt, tempSrc, level);
    }
  };

  // Change model level
  const handleLevelChange = (newLevel) => {
    setLevel(newLevel);
    localStorage.setItem('mt_model_level', newLevel);
    if (inputText.trim()) {
      performTranslate(inputText, mtSourceLang, mtTargetLang, newLevel);
    }
  };

  // Download model manually
  const handleDownloadModel = async (lvl) => {
    setDownloading(true);
    try {
      const res = await fetch('/api/mt/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: lvl || level })
      });
      const data = await res.json();
      if (data.status === 'ready') {
        alert(data.message || 'Model is ready!');
      }
      checkModelStatus();
    } catch (e) {
      alert("Failed to initiate download: " + e.message);
    }
  };

  // Copy translated text
  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Clear all
  const handleClear = () => {
    setInputText('');
    setTranslatedText('');
    setDetectedSource(null);
    setCurrentRecord(null);
    lastTranslatedTextRef.current = '';
    if (inputRef.current) inputRef.current.focus();
  };

  // Star rating update
  const handleUpdateStars = async (newStars) => {
    if (!currentRecord?.id) return;
    try {
      const res = await fetch(`/api/mt/records/${currentRecord.id}/stars`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars: newStars })
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentRecord(updated);
        if (fetchMtRecords) fetchMtRecords();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Color tag update
  const handleUpdateColor = async (colorId) => {
    if (!currentRecord?.id) return;
    try {
      const newColor = currentRecord.color === colorId ? null : colorId;
      const res = await fetch(`/api/mt/records/${currentRecord.id}/color`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: newColor })
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentRecord(updated);
        if (fetchMtRecords) fetchMtRecords();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to extract clean lang code for speech
  const cleanLang = (raw) => {
    if (!raw) return 'en';
    const parts = raw.trim().split(/\s+/);
    const code = parts[parts.length - 1] || raw;
    return code.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'en';
  };

  const isModelReady = modelStatus?.models?.[level]?.ready;
  const isModelDownloading = modelStatus?.models?.[level]?.downloading || downloading;

  return (
    <div className="h-full flex flex-col bg-gray-50/50 dark:bg-gray-950 overflow-y-auto">
      {/* Top Header Bar */}
      <div className="border-b border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs sticky top-0 z-20 px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Back to Correction & Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            {onBackToCorrection && (
              <button
                type="button"
                onClick={onBackToCorrection}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-pointer border border-gray-200/60 dark:border-gray-700/60"
                title="Return to Correction Mode"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Back to Correction</span>
                <span className="sm:hidden">Back</span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <Zap size={16} className="fill-blue-500/20" />
              </div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <span>Machine Translation</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60">
                  Offline NLLB
                </span>
              </h1>
            </div>
          </div>

          {/* Right: Model Level Switcher & Actions */}
          <div className="flex items-center gap-2">
            {/* Standard Model Indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-300 select-none" title="Standard Facebook NLLB-200 600M int8 offline translation model">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span>Standard (600M)</span>
            </div>

            {/* Model Status Indicator */}
            {isModelDownloading ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 animate-pulse">
                <Loader2 size={12} className="animate-spin" />
                <span className="hidden sm:inline">Downloading...</span>
              </span>
            ) : isModelReady ? (
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60" title="Offline CTranslate2 NLLB model ready in local cache">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="hidden sm:inline">Ready (Offline)</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleDownloadModel('standard')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                title="Download this model for offline translation"
              >
                <Download size={12} />
                <span>Download</span>
              </button>
            )}

            {/* Clear / New button */}
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
              title="Clear & New Translation"
            >
              <RefreshCw size={15} />
            </button>

            {/* History Button */}
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-pointer border border-gray-200/60 dark:border-gray-700/60"
                title="View Machine Translation History"
              >
                <History size={14} />
                <span className="hidden sm:inline">History</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="max-w-6xl w-full mx-auto p-4 md:p-6 space-y-4 flex-1 flex flex-col justify-start">
        {/* Language Selector Bar (Google Translate style) */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-800 p-2 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 select-none">
          {/* Source Language Bar */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 shrink-0 hidden lg:inline">
              From:
            </span>
            {POPULAR_SOURCE_LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  setMtSourceLang?.(lang);
                  if (inputText.trim()) performTranslate(inputText, lang, mtTargetLang, level);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  mtSourceLang === lang
                    ? 'bg-blue-600 text-white shadow-2xs font-bold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {lang}
              </button>
            ))}

            {/* Source Dropdown for extra languages */}
            <select
              value={mtSourceLang}
              onChange={(e) => {
                setMtSourceLang?.(e.target.value);
                if (inputText.trim()) performTranslate(inputText, e.target.value, mtTargetLang, level);
              }}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 cursor-pointer outline-none shrink-0"
              title="Select Source Language"
            >
              <option value="" disabled>More...</option>
              {FLORES_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="flex items-center justify-center shrink-0 px-1">
            <button
              type="button"
              onClick={handleSwapLanguages}
              disabled={mtSourceLang === '🌐 Auto'}
              className="p-2 rounded-xl text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
              title={mtSourceLang === '🌐 Auto' ? "Cannot swap when Auto Detect is active" : "Swap Languages"}
            >
              <ArrowLeftRight size={17} />
            </button>
          </div>

          {/* Target Language Bar */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto py-0.5 justify-start md:justify-end scrollbar-none">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 shrink-0 hidden lg:inline">
              To:
            </span>
            {POPULAR_TARGET_LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  setMtTargetLang?.(lang);
                  if (inputText.trim()) performTranslate(inputText, mtSourceLang, lang, level);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  mtTargetLang === lang
                    ? 'bg-blue-600 text-white shadow-2xs font-bold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {lang}
              </button>
            ))}

            {/* Target Dropdown for extra languages */}
            <select
              value={mtTargetLang}
              onChange={(e) => {
                setMtTargetLang?.(e.target.value);
                if (inputText.trim()) performTranslate(inputText, mtSourceLang, e.target.value, level);
              }}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 cursor-pointer outline-none shrink-0"
              title="Select Target Language"
            >
              <option value="" disabled>More...</option>
              {FLORES_LANGUAGES.filter(l => l.code !== '🌐 Auto').map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Translation Boxes (Google Translate Dual-Box Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          {/* Left Card: Input Box */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/90 dark:border-gray-800 p-4 shadow-sm flex flex-col justify-between transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/60 min-h-[300px]">
            <div className="relative flex-1 flex flex-col">
              {/* Top detected tag */}
              {detectedSource && mtSourceLang === '🌐 Auto' && (
                <div className="mb-2">
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-200/80 dark:border-blue-800/80">
                    Detected: {detectedSource}
                  </span>
                </div>
              )}

              <textarea
                ref={inputRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type or paste text to translate offline..."
                className="w-full flex-1 resize-none bg-transparent outline-none text-base md:text-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 leading-relaxed font-sans min-h-[200px]"
                maxLength={5000}
              />

              {/* Clear button in top-right */}
              {inputText && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-0 top-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  title="Clear text"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Input Toolbar */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800/80 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                {inputText && (
                  <SpeechButton
                    text={inputText}
                    wordLang={cleanLang(detectedSource || mtSourceLang)}
                    profileLang={settings?.default_language}
                    size={16}
                  />
                )}
                <span className="text-[11px] text-gray-400 font-mono">
                  {inputText.length} / 5,000
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Auto translate toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-500 dark:text-gray-400 select-none mr-1" title="Automatically translate while typing">
                  <input
                    type="checkbox"
                    checked={autoTranslate}
                    onChange={(e) => {
                      setAutoTranslate(e.target.checked);
                      localStorage.setItem('mt_auto_translate', e.target.checked);
                    }}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Instant</span>
                </label>

                {/* Translate action button */}
                <button
                  type="button"
                  onClick={() => performTranslate(inputText, mtSourceLang, mtTargetLang, level)}
                  disabled={loading || !inputText.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
                  title="Translate text (Ctrl+Enter)"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} className="fill-white" />}
                  <span>Translate</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Card: Output Box */}
          <div className="bg-gray-50/80 dark:bg-gray-900/90 rounded-2xl border border-gray-200/90 dark:border-gray-800 p-4 shadow-sm flex flex-col justify-between min-h-[300px] relative">
            <div className="flex-1 flex flex-col">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-400 space-y-3">
                  <Loader2 size={28} className="animate-spin text-blue-500" />
                  <span className="text-sm font-medium">Translating offline with NLLB...</span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col relative">
                  <textarea
                    value={translatedText}
                    onChange={handleTranslationChange}
                    placeholder="Translation will appear here (editable)..."
                    className="w-full flex-1 resize-none bg-transparent outline-none text-base md:text-lg font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 leading-relaxed font-sans min-h-[200px]"
                    spellCheck="false"
                  />
                </div>
              )}
            </div>

            {/* Output Toolbar */}
            {(translatedText || inputText) && (
              <div className="flex items-center justify-between pt-3 border-t border-gray-200/60 dark:border-gray-800 text-xs">
                {/* Left: Regenerate, Speech, Copy, Star rating */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => performTranslate(inputText, mtSourceLang, mtTargetLang, level)}
                    disabled={loading || !inputText.trim()}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors cursor-pointer border border-blue-200/60 dark:border-blue-800/60 disabled:opacity-40"
                    title="Regenerate translation from source text"
                  >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    <span>Regenerate</span>
                  </button>

                  {translatedText && (
                    <>
                      <SpeechButton
                        text={translatedText}
                        wordLang={cleanLang(mtTargetLang)}
                        profileLang={settings?.default_language}
                        size={16}
                      />

                      <button
                        type="button"
                        onClick={handleCopy}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer relative"
                        title="Copy translation"
                      >
                        {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                      </button>

                      <StarRating
                        value={currentRecord?.stars || 0}
                        onChange={handleUpdateStars}
                        size="sm"
                      />

                      {/* Color markers */}
                      <div className="flex items-center gap-1">
                        {COLORS.map((col) => (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => handleUpdateColor(col.id)}
                            className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                              currentRecord?.color === col.id ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'opacity-60 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: col.hex }}
                            title={`Tag color: ${col.label}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Right: Session, Send to Correction, Model badge */}
                <div className="flex items-center gap-2">
                  {/* Move to Session button */}
                  {currentRecord?.id && onAssignSession && (
                    <button
                      type="button"
                      onClick={() => onAssignSession({ id: currentRecord.id, mode: 'mt', title: currentRecord.text, session_id: currentRecord.session_id })}
                      className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors cursor-pointer"
                      title={currentRecord.session_id ? `In session: "${currentRecord.session_id}" (Click to change)` : "Move to Session"}
                    >
                      <FolderPlus size={15} />
                    </button>
                  )}

                  {/* Send to Correction Mode button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onSendToCorrection) {
                        onSendToCorrection(inputText || translatedText);
                      } else if (onBackToCorrection) {
                        onBackToCorrection(inputText || translatedText);
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 transition-colors cursor-pointer"
                    title="Send text to Correction Mode for AI grammar & phrasing polish"
                  >
                    <CheckCheck size={13} className="text-purple-600 dark:text-purple-400" />
                    <span className="hidden sm:inline">Send to Correction</span>
                    <span className="sm:hidden">Correct</span>
                  </button>

                  {/* Model Tag */}
                  <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500 bg-gray-200/60 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                    {currentRecord?.model_name || 'NLLB'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Recent Translations Strip */}
        {mtRecords && mtRecords.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Recent Translations
              </span>
              {onOpenHistory && (
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  View All ({mtRecords.length}) &rarr;
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {mtRecords.slice(0, 6).map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => {
                    setInputText(rec.text);
                    setTranslatedText(rec.translated_text);
                    setDetectedSource(rec.detected_source);
                    setCurrentRecord(rec);
                    setMtSourceLang?.(rec.source_lang || '🌐 Auto');
                    setMtTargetLang?.(rec.target_lang || '🇺🇸 EN');
                    lastTranslatedTextRef.current = rec.text;
                  }}
                  className="text-left p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-2xs hover:shadow-xs group cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 truncate">
                      {rec.source_lang || 'Auto'} &rarr; {rec.target_lang || 'EN'}
                    </span>
                    {rec.stars > 0 && (
                      <span className="text-[10px] font-bold text-amber-500">
                        {'★'.repeat(rec.stars)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {rec.text}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {rec.translated_text}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
