import React, { useState, useEffect, useRef } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { History, ArrowRightLeft, Copy, Loader2, RefreshCw, Pencil, Check, X, Trash2, Settings, ChevronDown, ChevronUp, Sparkles, Eye, Send, Shuffle, CheckCheck, FileText, ToggleLeft, ToggleRight, Folder, FolderPlus, Zap } from 'lucide-react';
import { COLORS } from "./SearchTab";
import SpeechButton from "./SpeechButton";
import ChatMessageActions from "./ChatMessageActions";
import StarRating from "./StarRating";

export default function CorrectionTab({
  corrections,
  tabId,
  fetchCorrections,
  settings,
  defaultSettings,
  showRecentEmpty,
  models,
  onUpdateTab,
  initialCorrection,
  correctionSourceLang,
  setCorrectionSourceLang,
  correctionTargetLang,
  setCorrectionTargetLang,
  correctionModeType,
  setCorrectionModeType,
  correctionLangs,
  setCorrectionLangs,
  profileId,
  profileName,
  onOpenHistory,
  onMoveCorrection,
  onMoveMode,
  onAssignSession,
  onAddNewTab,
  onOpenLlmMode,
  onOpenMtMode
}) {
  const [openInNewTab, setOpenInNewTab] = useState(() => localStorage.getItem('openInNewTab') !== 'false');

  const handleToggleNewTab = () => {
    const val = !openInNewTab;
    setOpenInNewTab(val);
    localStorage.setItem('openInNewTab', val);
  };

  const [currentCorrection, setCurrentCorrection] = useState(initialCorrection || null);
  const [correctionChats, setCorrectionChats] = useState([]);
  const [correctionSearchTerm, setCorrectionSearchTerm] = useState(initialCorrection?.text || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [correctionChatInput, setCorrectionChatInput] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
      if (!isInput && inputRef.current) {
        if (e.key.length === 1) {
          inputRef.current.focus();
          inputRef.current.select();
        } else if (e.key.startsWith('Arrow')) {
          inputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const [editingChatId, setEditingChatId] = useState(null);
  const [editingContent, setEditingContent] = useState('');

  // Initial search if temp
  useEffect(() => {
    if (initialCorrection && initialCorrection.isTemp && initialCorrection.text && !currentCorrection?.id) {
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setCorrectionSearchTerm(initialCorrection.text);
      setLoading(true);
      fetch('/api/corrections/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: initialCorrection.text,
          source_lang: correctionSourceLang,
          target_lang: correctionTargetLang,
          mode_type: correctionModeType || 'both',
          profile_id: profileId,
          session_id: localStorage.getItem('active_session_id') || undefined
        })
      })
      .then(res => res.json())
      .then(data => {
        setCurrentCorrection(data.correction);
        setCorrectionChats(data.chats);
        if (fetchCorrections) fetchCorrections();
      })
      .catch(err => {
        alert(err.message);
        setCurrentCorrection(null);
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, []);

  const handleSaveEdit = async (chatId) => {
    if (!editingContent.trim()) return;
    try {
      const res = await fetch(`/api/corrections/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setCorrectionChats(prev => prev.map(c => c.id === chatId ? updated : c));
      setEditingChatId(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // If initialCorrection is provided, fetch its chats
  useEffect(() => {
    if (!initialCorrection) {
      setCurrentCorrection(null);
      setCorrectionChats([]);
      setCorrectionSearchTerm('');
      setLoading(false);
      return;
    }
    if (initialCorrection.isTemp && initialCorrection.text) {
      if (currentCorrection?.text === initialCorrection.text && (loading || correctionChats.length > 0)) return;
      handleCorrectionSearch(null, initialCorrection.text, true);
      return;
    }
    if (!initialCorrection.isTemp && initialCorrection.id) {
      if (currentCorrection?.id === initialCorrection.id && correctionChats.length > 0) return;
      setCorrectionSearchTerm(initialCorrection.text || '');
      if (initialCorrection.mode_type) {
        setCorrectionModeType?.(initialCorrection.mode_type);
      }
      setLoading(true);
      fetch(`/api/corrections/${initialCorrection.id}`)
        .then(r => {
          if (!r.ok) throw new Error("Correction not found");
          return r.json();
        })
        .then(d => {
          setCorrectionChats(d.chats || []);
          setCurrentCorrection(d.correction);
          if (d.correction?.mode_type) {
            setCorrectionModeType?.(d.correction.mode_type);
          }
        })
        .catch(e => {
          console.error(e);
          setCurrentCorrection(initialCorrection);
        })
        .finally(() => setLoading(false));
    }
  }, [initialCorrection?.id, initialCorrection?.text]);

  // Update parent tab state for ticks and titles
  useEffect(() => {
    let title = 'New Correction';
    if (correctionSearchTerm) title = correctionSearchTerm;
    if (currentCorrection && !currentCorrection.isTemp && currentCorrection.text) title = currentCorrection.text.substring(0, 30) + '...';
    onUpdateTab?.(tabId, { title, loading, hasData: !!currentCorrection && !currentCorrection.isTemp });
  }, [correctionSearchTerm, currentCorrection, loading]);

  const handleCorrectionSearch = async (e, overrideTerm, isInitial = false) => {
    e?.preventDefault();
    setShowSuggestions(false);
    const termToUse = overrideTerm !== undefined ? overrideTerm : correctionSearchTerm;
    if (!termToUse.trim()) return;

    if (!isInitial) {
      const isBusy = loading;
      const isCurrentTabBlank = !isBusy && !currentCorrection;
      const shouldOpenNewTab = (openInNewTab && !isCurrentTabBlank) || isBusy;
      if (shouldOpenNewTab) {
        if (onAddNewTab) {
          onAddNewTab(termToUse.trim());
        } else {
          window.open(`/correction/?q=${encodeURIComponent(termToUse.trim())}`, '_blank');
        }
        setCorrectionSearchTerm(currentCorrection?.text || '');
        return;
      }
    }

    setLoading(true);
    setCurrentCorrection({ text: termToUse, isTemp: true });
    setCorrectionChats([]);
    setTimeout(() => { if (fetchCorrections) fetchCorrections(); }, 250);
    try {
      const res = await fetch('/api/corrections/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: termToUse,
          source_lang: correctionSourceLang,
          target_lang: correctionTargetLang,
          mode_type: correctionModeType || 'both',
          profile_id: profileId,
          session_id: localStorage.getItem('active_session_id') || undefined
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrentCorrection(data.correction);
      setCorrectionChats(data.chats);
      if (fetchCorrections) fetchCorrections();
    } catch (err) {
      if (fetchCorrections) fetchCorrections();
      alert(err.message);
      setCurrentCorrection(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCorrectionRegenerate = async (model) => {
    if (!currentCorrection || currentCorrection.isTemp) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/corrections/${currentCorrection.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          source_lang: correctionSourceLang,
          target_lang: correctionTargetLang,
          mode_type: correctionModeType || 'both'
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrentCorrection(data.correction);
      setCorrectionChats(data.chats);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCorrectionChat = async (e) => {
    e?.preventDefault();
    if (!correctionChatInput.trim() || !currentCorrection || currentCorrection.isTemp) return;
    const newChat = { role: 'user', content: correctionChatInput, id: 'temp' };
    setCorrectionChats([...correctionChats, newChat]);
    setCorrectionChatInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/corrections/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction_id: currentCorrection.id,
          content: newChat.content,
          profile_id: profileId
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.chats) {
        setCorrectionChats(data.chats);
      } else {
        const asstMsg = { id: data.chat_id || Date.now(), role: 'assistant', content: data.response };
        setCorrectionChats(prev => [...prev.filter(c => c.id !== 'temp'), { ...newChat, id: Date.now() - 1 }, asstMsg]);
      }
    } catch (err) {
      alert(err.message);
      setCorrectionChats(prev => prev.filter(c => c.id !== 'temp'));
    } finally {
      setLoading(false);
    }
  };

  const updateColor = async (colorId) => {
    if (!currentCorrection || currentCorrection.isTemp) return;
    const res = await fetch(`/api/corrections/${currentCorrection.id}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: colorId === currentCorrection.color ? null : colorId })
    });
    if (res.ok) {
      const updated = await res.json();
      setCurrentCorrection({ ...currentCorrection, color: updated.color });
      if (fetchCorrections) fetchCorrections();
    }
  };

  const updateStars = async (newStars) => {
    if (!currentCorrection || currentCorrection.isTemp) return;
    const val = currentCorrection.stars === newStars ? 0 : newStars;
    const res = await fetch(`/api/corrections/${currentCorrection.id}/stars`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars: val })
    });
    if (res.ok) {
      setCurrentCorrection({ ...currentCorrection, stars: val });
      if (fetchCorrections) fetchCorrections();
    }
  };

  const [copied, setCopied] = useState(false);
  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFullContentToCopy = () => {
    if (!correctionChats || correctionChats.length === 0) return '';
    return correctionChats.map(c => `${c.role.toUpperCase()}:\n${c.content}`).join('\n\n---\n\n');
  };

  // Chat message action handlers
  const [retryingChatId, setRetryingChatId] = useState(null);

  const handleRetryCorrectionChat = async (chatId, model) => {
    if (!currentCorrection || currentCorrection.isTemp) return;
    setRetryingChatId(chatId);
    setLoading(true);
    try {
      const res = await fetch(`/api/corrections/chats/${chatId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.chats) {
        setCorrectionChats(data.chats);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setRetryingChatId(null);
      setLoading(false);
    }
  };

  const handleDeleteCorrectionChat = async (chatId) => {
    if (!currentCorrection || currentCorrection.isTemp) return;
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      const res = await fetch(`/api/corrections/chats/${chatId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.chats) {
        setCorrectionChats(data.chats);
      } else {
        setCorrectionChats(prev => prev.filter(c => c.id !== chatId));
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Config Drawer (System Prompt)
  const [showConfig, setShowConfig] = useState(false);
  const promptKey = profileId ? `CORRECTION_PROMPT_${profileId}` : 'CORRECTION_PROMPT';
  const [localPrompt, setLocalPrompt] = useState('');

  useEffect(() => {
    if (settings && promptKey) {
      setLocalPrompt(settings[promptKey] || '');
    }
  }, [settings, promptKey]);

  const hasCustomPrompt = profileId && settings && !!settings[promptKey];
  const globalPrompt = (settings && settings.CORRECTION_PROMPT) || (defaultSettings && defaultSettings.CORRECTION_PROMPT) || '';

  const isBoth = (correctionModeType || 'both') === 'both';
  const isCorrectOnly = correctionModeType === 'correction_only';
  const hasTargetLang = isBoth;

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 overflow-hidden">
      {/* Search Header Bar */}
      <div className="mb-4">
        <form onSubmit={handleCorrectionSearch} className="relative flex items-center gap-2">
          {/* Main search capsule */}
          <div className="flex-1 flex items-center bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700/80 rounded-2xl shadow-xs hover:border-gray-300 dark:hover:border-gray-600 focus-within:border-blue-500 dark:focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all p-1.5 gap-2">

            {/* 2+1 Mode Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 2 Mode Buttons (Segmented control) */}
              <div className="flex items-center bg-gray-100/90 dark:bg-gray-800 p-0.5 rounded-xl border border-gray-200/60 dark:border-gray-700/60">
                <button
                  type="button"
                  onClick={() => setCorrectionModeType?.('correction_only')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold select-none transition-all cursor-pointer ${
                    isCorrectOnly
                      ? 'bg-white dark:bg-gray-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                  title="Correction Only — Fix grammar, syntax, tone, and polish phrasing"
                >
                  <CheckCheck size={14} className={isCorrectOnly ? "text-teal-600 dark:text-teal-400" : ""} />
                  <span className="whitespace-nowrap hidden sm:inline">Correction Only</span>
                  <span className="whitespace-nowrap sm:hidden">Correct</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionModeType?.('both')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold select-none transition-all cursor-pointer ${
                    isBoth
                      ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-2xs font-bold'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                  title="Correction + Translation — Correct source text and translate into target language"
                >
                  <ArrowRightLeft size={14} className={isBoth ? "text-blue-600 dark:text-blue-400" : ""} />
                  <span className="whitespace-nowrap hidden sm:inline">Correction + Translation</span>
                  <span className="whitespace-nowrap sm:hidden">Correct + Trans</span>
                </button>
              </div>

              {/* +1 Machine Translate (Offline Local Model) Button */}
              <button
                type="button"
                onClick={() => (onOpenMtMode || onOpenLlmMode)?.(correctionSearchTerm || currentCorrection?.text || '')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold select-none transition-all cursor-pointer bg-gradient-to-r from-blue-500/15 via-indigo-500/15 to-purple-500/15 hover:from-blue-500/25 hover:via-indigo-500/25 hover:to-purple-500/25 text-blue-700 dark:text-blue-300 border border-blue-200/90 dark:border-blue-800/80 shadow-2xs hover:shadow-xs group"
                title="Open Offline Machine Translation (Google Translate UI with local NLLB models)"
              >
                <Zap size={14} className="text-amber-500 fill-amber-500 group-hover:scale-110 transition-transform" />
                <span className="whitespace-nowrap font-bold">Machine Translate</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-300/60 dark:border-blue-700/60">+1</span>
              </button>
            </div>

            {/* Language Capsule */}
            <div className="flex items-center bg-gray-100/90 dark:bg-gray-800 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 gap-1.5 border border-gray-200/60 dark:border-gray-700/60 shrink-0 select-none">
              <select
                value={correctionSourceLang}
                onChange={e => setCorrectionSourceLang?.(e.target.value)}
                className="bg-transparent dark:text-gray-200 border-none outline-none focus:ring-0 cursor-pointer w-[68px] text-center appearance-none truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Source Language"
              >
                {correctionLangs?.map(l => (
                  <option key={l} value={l} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {l}
                  </option>
                ))}
              </select>

              {hasTargetLang && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const temp = correctionSourceLang;
                      setCorrectionSourceLang?.(correctionTargetLang);
                      setCorrectionTargetLang?.(temp);
                    }}
                    className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-transform duration-200 active:scale-90"
                    title="Swap source and target languages"
                  >
                    <ArrowRightLeft size={13} />
                  </button>
                  <select
                    value={correctionTargetLang}
                    onChange={e => setCorrectionTargetLang?.(e.target.value)}
                    className="bg-transparent dark:text-gray-200 border-none outline-none focus:ring-0 cursor-pointer w-[68px] text-center appearance-none truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Target Language for Translation"
                  >
                    {correctionLangs?.map(l => (
                      <option key={l} value={l} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                        {l}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* Input Field */}
            <input
              type="text"
              value={correctionSearchTerm}
              onChange={e => { setCorrectionSearchTerm(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              ref={inputRef}
              placeholder={isBoth ? "Text to correct & translate..." : "Text to correct & polish..."}
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />

            {/* Clear input button */}
            {correctionSearchTerm && (
              <button
                type="button"
                onClick={() => { setCorrectionSearchTerm(''); inputRef.current?.focus(); }}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mr-1 cursor-pointer"
                title="Clear"
              >
                <X size={15} />
              </button>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!correctionSearchTerm.trim()}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-40 transition-all shrink-0 cursor-pointer"
            >
              {loading && (!correctionSearchTerm.trim() || correctionSearchTerm.trim() === currentCorrection?.text) ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <CheckCheck size={16} />
              )}
              <span className="hidden sm:inline">Review</span>
            </button>
          </div>

          {/* Config Toggle Button */}
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className={`h-11 px-3 flex items-center justify-center gap-1.5 rounded-xl border transition-all shadow-xs shrink-0 cursor-pointer ${
              showConfig
                ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 font-medium'
                : 'bg-white dark:bg-gray-900 border-gray-200/80 dark:border-gray-700/80 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            title="Toggle prompt config"
          >
            <Settings size={16} />
            <span className="text-xs hidden lg:inline">Config</span>
            {showConfig ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* Suggestions Dropdown */}
          {showSuggestions && correctionSearchTerm.trim() && corrections?.some(w => w.text.toLowerCase().includes(correctionSearchTerm.toLowerCase().trim())) && (
            <ul
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-16 right-16 top-full mt-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800"
            >
              {corrections.filter(w => w.text.toLowerCase().includes(correctionSearchTerm.toLowerCase().trim())).slice(0, 10).map(w => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCorrectionSearchTerm(w.text);
                      setShowSuggestions(false);
                      handleCorrectionSearch(null, w.text);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{w.text}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">
                      Reviewed {w.search_count || 1}×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      </div>

      {/* System Prompt Config Drawer */}
      {showConfig && (
        <div className="mb-4 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-sm text-sm space-y-2.5">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <label className="font-semibold text-gray-700 dark:text-gray-200 text-xs uppercase tracking-wider">
                System Prompt (Correction Mode)
              </label>
              {profileId && (
                hasCustomPrompt ? (
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                    Profile Custom
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                    Inherited
                  </span>
                )
              )}
            </div>
            <div className="flex items-center gap-2">
              {profileId && !hasCustomPrompt && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setLocalPrompt(globalPrompt);
                    fetch('/api/settings', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key: promptKey, value: globalPrompt }) });
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                  title="Copy global prompt to customize for this profile"
                >
                  Customize for this profile
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setLocalPrompt('');
                  fetch('/api/settings', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key: promptKey, value: '' }) });
                }}
                className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer"
              >
                {profileId ? (hasCustomPrompt ? 'Reset to Global' : 'Restore Default') : 'Restore Default'}
              </button>
            </div>
          </div>
          <textarea
            value={localPrompt || (hasCustomPrompt ? '' : globalPrompt)}
            onChange={(e) => {
              setLocalPrompt(e.target.value);
              fetch('/api/settings', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key: promptKey, value: e.target.value }) });
            }}
            placeholder="Correction system prompt..."
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            rows="4"
          />
        </div>
      )}

      {currentCorrection ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-800 rounded-2xl shadow-sm">
          {/* Card Header */}
          <div className="p-4 sm:p-5 border-b border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                {currentCorrection.isEditing ? (
                  <textarea
                    defaultValue={currentCorrection.text}
                    onBlur={async (e) => {
                      const newTerm = e.target.value;
                      if (newTerm && newTerm !== currentCorrection.text) {
                        const res = await fetch(`/api/corrections/${currentCorrection.id}/rename`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ term: newTerm })
                        });
                        if (res.ok) {
                          const updated = await res.json();
                          setCurrentCorrection({ ...currentCorrection, text: updated.text, isEditing: false });
                          fetchCorrections?.();
                        } else {
                          setCurrentCorrection({ ...currentCorrection, isEditing: false });
                        }
                      } else {
                        setCurrentCorrection({ ...currentCorrection, isEditing: false });
                      }
                    }}
                    autoFocus
                    className="border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 rounded-xl px-3 py-2 text-xl font-bold w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="2"
                  />
                ) : (
                  <div className="flex items-start gap-2 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-[#73daca] tracking-tight whitespace-pre-wrap">
                      {currentCorrection?.text || correctionSearchTerm}
                    </h2>
                    {(currentCorrection?.text || correctionSearchTerm) && (
                      <SpeechButton
                        text={currentCorrection?.text || correctionSearchTerm}
                        wordLang={currentCorrection?.source_lang}
                        profileLang={correctionSourceLang}
                        profileName={profileName}
                      />
                    )}
                    {!currentCorrection.isTemp && (
                      <button
                        onClick={() => setCurrentCorrection({ ...currentCorrection, isEditing: true })}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-md text-xs font-medium border border-gray-200/60 dark:border-gray-700/60 transition-colors cursor-pointer"
                        title="Rename"
                      >
                        <Pencil size={12} /> Rename
                      </button>
                    )}
                  </div>
                )}

                {currentCorrection.isTemp ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Loader2 className="animate-spin" size={12} /> Analyzing & Correcting...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Ready
                  </span>
                )}
              </div>

              {!currentCorrection.isTemp && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex flex-wrap items-center gap-2.5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold border text-[11px] ${
                    currentCorrection.mode_type === 'correction_only'
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60'
                      : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                  }`}>
                    {currentCorrection.mode_type === 'correction_only' ? (
                      `Correction Only (${currentCorrection.source_lang || 'Auto'})`
                    ) : (
                      `${currentCorrection.source_lang || 'Auto'} ➔ ${currentCorrection.target_lang || 'EN'}`
                    )}
                  </span>
                  {currentCorrection.session_id && (
                    <button
                      type="button"
                      onClick={() => onAssignSession?.(currentCorrection)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors border border-amber-200 dark:border-amber-800 cursor-pointer shadow-2xs group/sess"
                      title={`Session: "${currentCorrection.session_id}" — Click to change session`}
                    >
                      <Folder size={11} className="text-amber-500 dark:text-amber-400 group-hover/sess:scale-110 transition-transform" />
                      <span className="truncate max-w-[120px]">{currentCorrection.session_id}</span>
                    </button>
                  )}
                  {currentCorrection.view_count ? (
                    <span className="flex items-center gap-1" title="Views">
                      <Eye size={13} /> {currentCorrection.view_count}×
                    </span>
                  ) : null}
                  <span>•</span>
                  <span className="flex items-center gap-1" title="Reviews">
                    <CheckCheck size={13} /> {currentCorrection.search_count}×
                  </span>

                  <button
                    type="button"
                    onClick={async () => {
                      const newTag = prompt('Enter a tag:', currentCorrection.tag || '');
                      if (newTag !== null) {
                        const res = await fetch(`/api/corrections/${currentCorrection.id}/tag`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tag: newTag || null })
                        });
                        if (res.ok) {
                          setCurrentCorrection({ ...currentCorrection, tag: newTag || null });
                          fetchCorrections?.();
                        }
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors border border-purple-200 dark:border-purple-800 cursor-pointer ml-1"
                    title="Click to edit tag"
                  >
                    {currentCorrection.tag ? `#${currentCorrection.tag}` : '+ Tag'}
                  </button>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!currentCorrection.isTemp && (
              <div className="flex gap-2 items-center shrink-0">
                <div className="relative group">
                  <button
                    className="p-2 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-xl text-gray-600 dark:text-gray-300 transition-colors flex items-center gap-1 border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Regenerate correction"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <div className="absolute right-0 top-full pt-1.5 w-52 hidden group-hover:block z-20">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden py-1.5 divide-y divide-gray-100 dark:divide-gray-700/60">
                      <div className="px-3.5 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <div className="py-1">
                        <button
                          onClick={() => handleCorrectionRegenerate(settings?.CORRECTION_MODEL || settings?.MAIN_MODEL)}
                          className="block w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          Default Model
                        </button>
                        {(settings?.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                          <button
                            key={m}
                            onClick={() => handleCorrectionRegenerate(m.trim())}
                            className="block w-full text-left px-3.5 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 truncate cursor-pointer"
                            title={m.trim()}
                          >
                            {m.trim()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => copyToClipboard(getFullContentToCopy())}
                  className="p-2 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-xl text-gray-600 dark:text-gray-300 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                  title={correctionChats.length > 1 ? "Copy complete output & follow-ups" : "Copy initial correction"}
                >
                  {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>

                {onAssignSession && (
                  <button
                    onClick={() => onAssignSession(currentCorrection)}
                    className="p-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move Correction to Session"
                  >
                    <FolderPlus size={18} />
                  </button>
                )}

                {onMoveCorrection && (
                  <button
                    onClick={() => onMoveCorrection(currentCorrection, () => {
                      setCurrentCorrection(null);
                      setCorrectionChats([]);
                      setCorrectionSearchTerm('');
                    })}
                    className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move correction to another profile"
                  >
                    <ArrowRightLeft size={18} />
                  </button>
                )}

                {onMoveMode && (
                  <button
                    onClick={() => onMoveMode(currentCorrection, 'correction', () => {
                      setCurrentCorrection(null);
                      setCorrectionChats([]);
                      setCorrectionSearchTerm('');
                      onUpdateTab?.(tabId, { title: 'New Correction', loading: false, hasData: false, initialCorrection: null });
                    })}
                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move to another mode & regenerate"
                  >
                    <Shuffle size={18} />
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete this correction?')) return;
                    await fetch(`/api/corrections/${currentCorrection.id}`, { method: 'DELETE' });
                    fetchCorrections?.();
                    setCurrentCorrection(null);
                    setCorrectionChats([]);
                    setCorrectionSearchTerm('');
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800 cursor-pointer"
                  title="Delete this correction"
                >
                  <Trash2 size={18} />
                </button>

                {/* Color Dot Rating */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200/60 dark:border-gray-700/60 ml-1">
                  {COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => updateColor(c.id)}
                      className={`w-5 h-5 rounded-full border-2 border-white dark:border-gray-900 transition-transform cursor-pointer ${
                        currentCorrection?.color === c.id ? 'scale-125 ring-2 ring-blue-500 shadow-xs' : 'hover:scale-110 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                </div>

                {/* 1 to 5 Star Rating beside Color */}
                <div className="flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 ml-1">
                  <StarRating
                    value={currentCorrection?.stars || 0}
                    onChange={updateStars}
                    size="md"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Chat / Content area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {correctionChats.map((chat, idx) => (
              <div key={chat.id || idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl p-4 sm:p-5 relative group text-sm leading-relaxed ${
                    chat.role === 'user'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-50/80 dark:bg-gray-800/70 border border-gray-200/70 dark:border-gray-700/80 shadow-xs text-gray-800 dark:text-gray-100 markdown-body'
                  }`}
                >
                  {editingChatId === chat.id ? (
                    <div className="flex flex-col gap-2.5">
                      <textarea
                        value={editingContent}
                        onChange={e => setEditingContent(e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl p-3 text-sm min-h-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingChatId(null)}
                          className="px-3 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(chat.id)}
                          className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Check size={14} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {chat.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{chat.content}</div>
                      ) : (
                        <MarkdownRenderer>{chat.content}</MarkdownRenderer>
                      )}
                      {chat.role !== 'user' && chat.id !== 'temp' && (
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <SpeechButton
                            text={chat.content}
                            wordLang={currentCorrection?.target_lang || currentCorrection?.source_lang}
                            profileLang={correctionTargetLang || correctionSourceLang}
                            profileName={profileName}
                            size={12}
                            className="bg-white/90 dark:bg-gray-800/90 shadow-xs"
                          />
                          <button
                            onClick={() => { setEditingChatId(chat.id); setEditingContent(chat.content); }}
                            className="p-1.5 bg-white/80 dark:bg-gray-700/80 rounded-lg text-gray-400 hover:text-blue-500 shadow-xs border border-gray-200/50 dark:border-gray-600/50 cursor-pointer"
                            title="Edit response"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      )}

                      {chat.id !== 'temp' && (
                        <ChatMessageActions
                          chat={chat}
                          index={idx}
                          isUser={chat.role === 'user'}
                          currentModel={settings?.CORRECTION_MODEL || settings?.MAIN_MODEL}
                          fallbackModels={(settings?.FALLBACK_MODELS || '').split(',').map(m => m.trim()).filter(Boolean)}
                          onCopy={(text) => copyToClipboard(text)}
                          onRetry={handleRetryCorrectionChat}
                          onDelete={handleDeleteCorrectionChat}
                          loading={loading}
                          retryingChatId={retryingChatId}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && correctionChats.length > 0 && (
              <div className="text-gray-400 dark:text-gray-500 flex items-center gap-2 text-xs">
                <Loader2 className="animate-spin" size={14} /> Thinking...
              </div>
            )}
            {currentCorrection.isTemp && correctionChats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500">
                <Loader2 className="animate-spin mb-3 text-blue-500" size={32} />
                <p className="text-sm font-medium">Reviewing, correcting and refining language...</p>
              </div>
            )}
          </div>

          {/* Follow up question bar */}
          {!currentCorrection.isTemp && (
            <form onSubmit={handleCorrectionChat} className="p-3 border-t border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex gap-2">
              <input
                type="text"
                value={correctionChatInput}
                onChange={e => setCorrectionChatInput(e.target.value)}
                placeholder="Ask a question about this correction, tone, alternatives, or grammar rules..."
                className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                disabled={loading || !correctionChatInput.trim()}
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-xs disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Send</span>
                <Send size={14} />
              </button>
            </form>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/10 to-blue-500/10 dark:from-teal-500/20 dark:to-blue-500/20 border border-teal-200/70 dark:border-teal-800/60 flex items-center justify-center mb-4 text-teal-600 dark:text-teal-400 shadow-sm">
            <CheckCheck size={28} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">
            Flawless Correction & Translation
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
            Fix grammar, polish natural phrasing, and get optimal contextual translations with linguistic explanations.
          </p>

          {(showRecentEmpty || settings?.SHOW_RECENT_EMPTY === 'true') && corrections && corrections.length > 0 && (
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-2xl p-4 shadow-sm text-left">
              <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5"><History size={13} /> Recent Corrections</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchCorrections?.()}
                    className="hover:text-amber-500 dark:hover:text-amber-400 transition-colors lowercase font-normal cursor-pointer flex items-center gap-1"
                    title="Refresh recent corrections"
                  >
                    <RefreshCw size={11} />
                    <span>refresh</span>
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  <button
                    type="button"
                    onClick={() => onOpenHistory?.()}
                    className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors lowercase font-normal cursor-pointer"
                  >
                    view all ({corrections.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {corrections.slice(0, 10).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setCorrectionSearchTerm(t.text);
                      setCurrentCorrection(t);
                      if (t.mode_type) setCorrectionModeType?.(t.mode_type);
                      setLoading(true);
                      fetch(`/api/corrections/${t.id}`)
                        .then(r => r.json())
                        .then(d => {
                          setCorrectionChats(d.chats || []);
                          setCurrentCorrection(d.correction);
                        })
                        .catch(e => console.error(e))
                        .finally(() => setLoading(false));
                    }}
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/80 text-sm text-gray-700 dark:text-gray-200 hover:border-teal-400 dark:hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-all shadow-2xs cursor-pointer"
                  >
                    <span className="font-medium truncate max-w-xs">{t.text}</span>
                    {t.mode_type === 'correction_only' ? (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-teal-500">
                        (Correction Only)
                      </span>
                    ) : (
                      t.source_lang && t.target_lang && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-teal-500">
                          ({t.source_lang}➔{t.target_lang})
                        </span>
                      )
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Enter</kbd> to review
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
