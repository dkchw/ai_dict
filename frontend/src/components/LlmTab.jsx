import React, { useState, useEffect, useRef } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { History, ArrowRightLeft, ArrowLeft, Copy, Loader2, RefreshCw, Pencil, Check, X, Trash2, Settings, ChevronDown, ChevronUp, Sparkles, Eye, Send, Shuffle, CheckCheck, Folder, FolderPlus } from 'lucide-react';
import { COLORS } from "./SearchTab";
import SpeechButton from "./SpeechButton";
import ChatMessageActions from "./ChatMessageActions";
import StarRating from "./StarRating";

export default function LlmTab({
  llmRecords = [],
  tabId,
  fetchLlmRecords,
  settings,
  defaultSettings,
  showRecentEmpty,
  models,
  onUpdateTab,
  initialLlm,
  llmSourceLang = '🌐 Auto',
  setLlmSourceLang,
  llmTargetLang = '🇺🇸 EN',
  setLlmTargetLang,
  llmLangs = [],
  setLlmLangs,
  profileId = 1,
  profileName = '',
  onOpenHistory,
  onMoveItem,
  onMoveMode,
  onAssignSession,
  onAddNewTab,
  onBackToCorrection
}) {
  const [openInNewTab, setOpenInNewTab] = useState(() => localStorage.getItem('openInNewTab') !== 'false');

  const handleToggleNewTab = () => {
    const val = !openInNewTab;
    setOpenInNewTab(val);
    localStorage.setItem('openInNewTab', val);
  };

  const [currentLlm, setCurrentLlm] = useState(initialLlm || null);
  const [llmChats, setLlmChats] = useState([]);
  const [llmSearchTerm, setLlmSearchTerm] = useState(initialLlm?.text || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [llmChatInput, setLlmChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryingChatId, setRetryingChatId] = useState(null);
  const [copied, setCopied] = useState(false);

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
    if (initialLlm && initialLlm.isTemp && initialLlm.text && !currentLlm?.id) {
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setLlmSearchTerm(initialLlm.text);
      setLoading(true);
      fetch('/api/llm/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: initialLlm.text,
          source_lang: llmSourceLang,
          target_lang: llmTargetLang,
          mode_type: 'both',
          profile_id: profileId,
          session_id: localStorage.getItem('active_session_id') || undefined
        })
      })
      .then(res => res.json())
      .then(data => {
        setCurrentLlm(data.record);
        setLlmChats(data.chats || []);
        if (fetchLlmRecords) fetchLlmRecords();
      })
      .catch(err => {
        alert(err.message);
        setCurrentLlm(null);
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, []);

  // Fetch record by id if historical
  useEffect(() => {
    if (!initialLlm) {
      setCurrentLlm(null);
      setLlmChats([]);
      setLlmSearchTerm('');
      setLoading(false);
      return;
    }
    if (initialLlm.isTemp && initialLlm.text) {
      if (currentLlm?.text === initialLlm.text && (loading || llmChats.length > 0)) return;
      handleLlmSearch(null, initialLlm.text, true);
      return;
    }
    if (!initialLlm.isTemp && initialLlm.id) {
      if (currentLlm?.id === initialLlm.id && llmChats.length > 0) return;
      setLlmSearchTerm(initialLlm.text || '');
      setLoading(true);
      fetch(`/api/llm/records/${initialLlm.id}`)
        .then(r => {
          if (!r.ok) throw new Error("Record not found");
          return r.json();
        })
        .then(d => {
          setLlmChats(d.chats || []);
          setCurrentLlm(d.record);
        })
        .catch(e => {
          console.error(e);
          setCurrentLlm(initialLlm);
        })
        .finally(() => setLoading(false));
    }
  }, [initialLlm?.id, initialLlm?.text]);

  // Update tab title and state
  useEffect(() => {
    let title = 'Special LLM';
    if (llmSearchTerm) title = llmSearchTerm.substring(0, 25);
    if (currentLlm && !currentLlm.isTemp && currentLlm.text) title = currentLlm.text.substring(0, 25) + '...';
    onUpdateTab?.(tabId, { title, loading, hasData: !!currentLlm && !currentLlm.isTemp });
  }, [llmSearchTerm, currentLlm, loading]);

  const handleLlmSearch = async (e, overrideTerm, isInitial = false) => {
    e?.preventDefault();
    setShowSuggestions(false);
    const termToUse = overrideTerm !== undefined ? overrideTerm : llmSearchTerm;
    if (!termToUse.trim()) return;

    if (!isInitial) {
      const isBusy = loading;
      const isCurrentTabBlank = !isBusy && !currentLlm;
      const shouldOpenNewTab = (openInNewTab && !isCurrentTabBlank) || isBusy;
      if (shouldOpenNewTab) {
        if (onAddNewTab) {
          onAddNewTab(termToUse.trim());
        }
        setLlmSearchTerm(currentLlm?.text || '');
        return;
      }
    }

    setLoading(true);
    setCurrentLlm({ text: termToUse, isTemp: true });
    setLlmChats([]);
    setTimeout(() => { if (fetchLlmRecords) fetchLlmRecords(); }, 250);
    try {
      const res = await fetch('/api/llm/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: termToUse,
          source_lang: llmSourceLang,
          target_lang: llmTargetLang,
          mode_type: 'both',
          profile_id: profileId,
          session_id: localStorage.getItem('active_session_id') || undefined
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrentLlm(data.record);
      setLlmChats(data.chats || []);
      if (fetchLlmRecords) fetchLlmRecords();
    } catch (err) {
      if (fetchLlmRecords) fetchLlmRecords();
      alert(err.message);
      setCurrentLlm(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLlmRegenerate = async (model) => {
    if (!currentLlm || currentLlm.isTemp) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/llm/records/${currentLlm.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          source_lang: llmSourceLang,
          target_lang: llmTargetLang,
          mode_type: 'both'
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrentLlm(data.record);
      setLlmChats(data.chats || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLlmChat = async (e) => {
    e?.preventDefault();
    if (!llmChatInput.trim() || !currentLlm || currentLlm.isTemp) return;
    const newChat = { role: 'user', content: llmChatInput, id: 'temp' };
    setLlmChats([...llmChats, newChat]);
    setLlmChatInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: currentLlm.id,
          content: newChat.content,
          profile_id: profileId
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.chats) {
        setLlmChats(data.chats);
      } else {
        const asstMsg = { id: data.chat_id || Date.now(), role: 'assistant', content: data.response };
        setLlmChats(prev => [...prev.filter(c => c.id !== 'temp'), { ...newChat, id: Date.now() - 1 }, asstMsg]);
      }
    } catch (err) {
      alert(err.message);
      setLlmChats(prev => prev.filter(c => c.id !== 'temp'));
    } finally {
      setLoading(false);
    }
  };

  const handleRetryLlmChat = async (chatId, model) => {
    if (!currentLlm || currentLlm.isTemp) return;
    setRetryingChatId(chatId);
    setLoading(true);
    try {
      const res = await fetch(`/api/llm/chats/${chatId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          profile_id: profileId
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.chats) {
        setLlmChats(data.chats);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setRetryingChatId(null);
      setLoading(false);
    }
  };

  const handleDeleteLlmChat = async (chatId) => {
    if (!currentLlm || currentLlm.isTemp) return;
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      const res = await fetch(`/api/llm/chats/${chatId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.chats) {
        setLlmChats(data.chats);
      } else {
        setLlmChats(prev => prev.filter(c => c.id !== chatId));
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveEdit = async (chatId) => {
    if (!editingContent.trim()) return;
    try {
      const res = await fetch(`/api/llm/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setLlmChats(prev => prev.map(c => c.id === chatId ? updated : c));
      setEditingChatId(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const updateColor = async (colorId) => {
    if (!currentLlm || currentLlm.isTemp) return;
    const res = await fetch(`/api/llm/records/${currentLlm.id}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: colorId === currentLlm.color ? null : colorId })
    });
    if (res.ok) {
      setCurrentLlm({ ...currentLlm, color: colorId === currentLlm.color ? null : colorId });
      fetchLlmRecords?.();
    }
  };

  const updateStars = async (newStars) => {
    if (!currentLlm || currentLlm.isTemp) return;
    const val = currentLlm.stars === newStars ? 0 : newStars;
    const res = await fetch(`/api/llm/records/${currentLlm.id}/stars`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars: val })
    });
    if (res.ok) {
      setCurrentLlm({ ...currentLlm, stars: val });
      fetchLlmRecords?.();
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFullContentToCopy = () => {
    if (!llmChats || llmChats.length === 0) return currentLlm?.text || '';
    return llmChats.map(c => (c.role === 'user' ? `### User\n${c.content}` : `### Assistant\n${c.content}`)).join('\n\n');
  };

  // Config Drawer (System Prompt)
  const [showConfig, setShowConfig] = useState(false);
  const promptKey = profileId ? `LLM_PROMPT_${profileId}` : 'LLM_PROMPT';
  const [localPrompt, setLocalPrompt] = useState('');

  useEffect(() => {
    if (settings && promptKey) {
      setLocalPrompt(settings[promptKey] || '');
    }
  }, [settings, promptKey]);

  const hasCustomPrompt = profileId && settings && !!settings[promptKey];
  const globalPrompt = (settings && settings.LLM_PROMPT) || (defaultSettings && defaultSettings.LLM_PROMPT) || '';

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 overflow-hidden">
      {/* Top Header Bar */}
      <div className="mb-4 flex flex-col gap-2">
        <form onSubmit={handleLlmSearch} className="relative flex items-center gap-2">
          {/* Back to Correction button */}
          <button
            type="button"
            onClick={onBackToCorrection}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700/80 shadow-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shrink-0 cursor-pointer"
            title="Return to Correction Mode"
          >
            <ArrowLeft size={14} />
            <span className="whitespace-nowrap hidden sm:inline">Back to Correction</span>
            <span className="whitespace-nowrap sm:hidden">Back</span>
          </button>

          {/* Main search capsule */}
          <div className="flex-1 flex items-center bg-white dark:bg-gray-900 border border-purple-200/90 dark:border-purple-800/80 rounded-2xl shadow-xs hover:border-purple-300 dark:hover:border-purple-700 focus-within:border-purple-500 dark:focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 transition-all p-1.5 gap-2">
            
            {/* Mode Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 select-none bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 shadow-2xs">
              <Sparkles size={14} className="text-purple-600 dark:text-purple-400" />
              <span className="whitespace-nowrap">Special LLM</span>
            </div>

            {/* Language Capsule */}
            <div className="flex items-center bg-gray-100/90 dark:bg-gray-800 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 gap-1.5 border border-gray-200/60 dark:border-gray-700/60 shrink-0 select-none">
              <select
                value={llmSourceLang}
                onChange={e => setLlmSourceLang?.(e.target.value)}
                className="bg-transparent dark:text-gray-200 border-none outline-none focus:ring-0 cursor-pointer w-[68px] text-center appearance-none truncate hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                title="Source Language"
              >
                {llmLangs?.map(l => (
                  <option key={l} value={l} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {l}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  const temp = llmSourceLang;
                  setLlmSourceLang?.(llmTargetLang);
                  setLlmTargetLang?.(temp);
                }}
                className="text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition-transform duration-200 active:scale-90"
                title="Swap source and target languages"
              >
                <ArrowRightLeft size={13} />
              </button>

              <select
                value={llmTargetLang}
                onChange={e => setLlmTargetLang?.(e.target.value)}
                className="bg-transparent dark:text-gray-200 border-none outline-none focus:ring-0 cursor-pointer w-[68px] text-center appearance-none truncate hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                title="Target Language"
              >
                {llmLangs?.map(l => (
                  <option key={l} value={l} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* Input Field */}
            <input
              type="text"
              value={llmSearchTerm}
              onChange={e => { setLlmSearchTerm(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              ref={inputRef}
              placeholder="Ask LLM for deep analysis, nuanced translations, or grammatical breakdowns..."
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />

            {/* Clear button */}
            {llmSearchTerm && (
              <button
                type="button"
                onClick={() => { setLlmSearchTerm(''); inputRef.current?.focus(); }}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mr-1 cursor-pointer"
                title="Clear"
              >
                <X size={15} />
              </button>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!llmSearchTerm.trim()}
              className="bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-40 transition-all shrink-0 cursor-pointer"
            >
              {loading && (!llmSearchTerm.trim() || llmSearchTerm.trim() === currentLlm?.text) ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              <span className="hidden sm:inline">Analyze</span>
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
          {showSuggestions && llmSearchTerm.trim() && llmRecords?.some(w => w.text.toLowerCase().includes(llmSearchTerm.toLowerCase().trim())) && (
            <ul
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-16 right-16 top-full mt-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800"
            >
              {llmRecords.filter(w => w.text.toLowerCase().includes(llmSearchTerm.toLowerCase().trim())).slice(0, 10).map(w => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setLlmSearchTerm(w.text);
                      setShowSuggestions(false);
                      setCurrentLlm(w);
                      setLoading(true);
                      fetch(`/api/llm/records/${w.id}`)
                        .then(r => r.json())
                        .then(d => {
                          setLlmChats(d.chats || []);
                          setCurrentLlm(d.record);
                        })
                        .catch(e => console.error(e))
                        .finally(() => setLoading(false));
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50/70 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{w.text}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">
                      Viewed {w.search_count || 1}×
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
                System Prompt (Special LLM Mode)
              </label>
              {profileId && (
                hasCustomPrompt ? (
                  <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
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
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium cursor-pointer"
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
            placeholder="Special LLM system prompt..."
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            rows="4"
          />
        </div>
      )}

      {currentLlm ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-800 rounded-2xl shadow-sm">
          {/* Card Header */}
          <div className="p-4 sm:p-5 border-b border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                {currentLlm.isEditing ? (
                  <textarea
                    defaultValue={currentLlm.text}
                    onBlur={async (e) => {
                      const newTerm = e.target.value;
                      if (newTerm && newTerm !== currentLlm.text) {
                        const res = await fetch(`/api/llm/records/${currentLlm.id}/rename`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ term: newTerm })
                        });
                        if (res.ok) {
                          const updated = await res.json();
                          setCurrentLlm({ ...currentLlm, text: updated.text, isEditing: false });
                          fetchLlmRecords?.();
                        } else {
                          setCurrentLlm({ ...currentLlm, isEditing: false });
                        }
                      } else {
                        setCurrentLlm({ ...currentLlm, isEditing: false });
                      }
                    }}
                    autoFocus
                    className="border border-purple-400 dark:border-purple-500 bg-white dark:bg-gray-900 rounded-xl px-3 py-2 text-xl font-bold w-full focus:outline-none focus:ring-2 focus:ring-purple-500"
                    rows="2"
                  />
                ) : (
                  <div className="flex items-start gap-2 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-purple-300 tracking-tight whitespace-pre-wrap">
                      {currentLlm?.text || llmSearchTerm}
                    </h2>
                    {(currentLlm?.text || llmSearchTerm) && (
                      <SpeechButton
                        text={currentLlm?.text || llmSearchTerm}
                        wordLang={currentLlm?.source_lang}
                        profileLang={llmSourceLang}
                        profileName={profileName}
                      />
                    )}
                    {!currentLlm.isTemp && (
                      <button
                        onClick={() => setCurrentLlm({ ...currentLlm, isEditing: true })}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 rounded-md text-xs font-medium border border-gray-200/60 dark:border-gray-700/60 transition-colors cursor-pointer"
                        title="Rename"
                      >
                        <Pencil size={12} /> Rename
                      </button>
                    )}
                  </div>
                )}

                {currentLlm.isTemp ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                    <Loader2 className="animate-spin" size={12} /> Generating LLM Analysis...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    LLM Ready
                  </span>
                )}
              </div>

              {!currentLlm.isTemp && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold border text-[11px] bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60">
                    {currentLlm.source_lang || 'Auto'} ➔ {currentLlm.target_lang || 'EN'}
                  </span>
                  {currentLlm.session_id && (
                    <button
                      type="button"
                      onClick={() => onAssignSession?.(currentLlm)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors border border-amber-200 dark:border-amber-800 cursor-pointer shadow-2xs group/sess"
                      title={`Session: "${currentLlm.session_id}" — Click to change session`}
                    >
                      <Folder size={11} className="text-amber-500 dark:text-amber-400 group-hover/sess:scale-110 transition-transform" />
                      <span className="truncate max-w-[120px]">{currentLlm.session_id}</span>
                    </button>
                  )}
                  {currentLlm.view_count ? (
                    <span className="flex items-center gap-1" title="Views">
                      <Eye size={13} /> {currentLlm.view_count}×
                    </span>
                  ) : null}
                  <span>•</span>
                  <span className="flex items-center gap-1" title="Queries">
                    <Sparkles size={13} /> {currentLlm.search_count}×
                  </span>

                  <button
                    type="button"
                    onClick={async () => {
                      const newTag = prompt('Enter a tag:', currentLlm.tag || '');
                      if (newTag !== null) {
                        const res = await fetch(`/api/llm/records/${currentLlm.id}/tag`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tag: newTag || null })
                        });
                        if (res.ok) {
                          setCurrentLlm({ ...currentLlm, tag: newTag || null });
                          fetchLlmRecords?.();
                        }
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors border border-purple-200 dark:border-purple-800 cursor-pointer ml-1"
                    title="Click to edit tag"
                  >
                    {currentLlm.tag ? `#${currentLlm.tag}` : '+ Tag'}
                  </button>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!currentLlm.isTemp && (
              <div className="flex gap-2 items-center shrink-0">
                {/* Regenerate dropdown */}
                <div className="relative group">
                  <button
                    className="p-2 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-xl text-gray-600 dark:text-gray-300 transition-colors flex items-center gap-1 border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Regenerate LLM response"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <div className="absolute right-0 top-full pt-1.5 w-52 hidden group-hover:block z-20">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden py-1.5 divide-y divide-gray-100 dark:divide-gray-700/60">
                      <div className="px-3.5 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <div className="py-1">
                        <button
                          onClick={() => handleLlmRegenerate(settings?.LLM_MODEL || settings?.MAIN_MODEL)}
                          className="block w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          Default Model
                        </button>
                        {(settings?.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                          <button
                            key={m}
                            onClick={() => handleLlmRegenerate(m.trim())}
                            className="block w-full text-left px-3.5 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-gray-700 truncate cursor-pointer"
                            title={m.trim()}
                          >
                            {m.trim()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Copy button */}
                <button
                  onClick={() => copyToClipboard(getFullContentToCopy())}
                  className="p-2 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-xl text-gray-600 dark:text-gray-300 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                  title={llmChats.length > 1 ? "Copy complete output & follow-ups" : "Copy output"}
                >
                  {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>

                {onAssignSession && (
                  <button
                    onClick={() => onAssignSession(currentLlm)}
                    className="p-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move LLM Record to Session"
                  >
                    <FolderPlus size={18} />
                  </button>
                )}

                {onMoveMode && (
                  <button
                    onClick={() => onMoveMode(currentLlm, 'llm', () => {
                      setCurrentLlm(null);
                      setLlmChats([]);
                      setLlmSearchTerm('');
                      onUpdateTab?.(tabId, { title: 'Special LLM', loading: false, hasData: false, initialLlm: null });
                    })}
                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move to another mode & regenerate"
                  >
                    <Shuffle size={18} />
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete this LLM record?')) return;
                    await fetch(`/api/llm/records/${currentLlm.id}`, { method: 'DELETE' });
                    fetchLlmRecords?.();
                    setCurrentLlm(null);
                    setLlmChats([]);
                    setLlmSearchTerm('');
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800 cursor-pointer"
                  title="Delete this record"
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
                        currentLlm?.color === c.id ? 'scale-125 ring-2 ring-purple-500 shadow-xs' : 'hover:scale-110 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                </div>

                {/* Star Rating */}
                <div className="flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 ml-1">
                  <StarRating
                    value={currentLlm?.stars || 0}
                    onChange={updateStars}
                    size="md"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Chat / Content area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {llmChats.map((chat, idx) => (
              <div key={chat.id || idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl p-4 sm:p-5 relative group text-sm leading-relaxed ${
                    chat.role === 'user'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-gray-50/80 dark:bg-gray-800/70 border border-gray-200/70 dark:border-gray-700/80 shadow-xs text-gray-800 dark:text-gray-100 markdown-body'
                  }`}
                >
                  {editingChatId === chat.id ? (
                    <div className="flex flex-col gap-2.5">
                      <textarea
                        value={editingContent}
                        onChange={e => setEditingContent(e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl p-3 text-sm min-h-[160px] focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                            wordLang={currentLlm?.target_lang || currentLlm?.source_lang}
                            profileLang={llmTargetLang || llmSourceLang}
                            profileName={profileName}
                            size={12}
                            className="bg-white/90 dark:bg-gray-800/90 shadow-xs"
                          />
                          <button
                            onClick={() => { setEditingChatId(chat.id); setEditingContent(chat.content); }}
                            className="p-1.5 bg-white/80 dark:bg-gray-700/80 rounded-lg text-gray-400 hover:text-purple-500 shadow-xs border border-gray-200/50 dark:border-gray-600/50 cursor-pointer"
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
                          currentModel={settings?.LLM_MODEL || settings?.MAIN_MODEL}
                          fallbackModels={(settings?.FALLBACK_MODELS || '').split(',').map(m => m.trim()).filter(Boolean)}
                          onCopy={(text) => copyToClipboard(text)}
                          onRetry={handleRetryLlmChat}
                          onDelete={handleDeleteLlmChat}
                          loading={loading}
                          retryingChatId={retryingChatId}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && llmChats.length > 0 && (
              <div className="text-gray-400 dark:text-gray-500 flex items-center gap-2 text-xs">
                <Loader2 className="animate-spin text-purple-500" size={14} /> LLM Thinking & Generating...
              </div>
            )}
            {currentLlm.isTemp && llmChats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500">
                <Loader2 className="animate-spin mb-3 text-purple-500" size={32} />
                <p className="text-sm font-medium">Synthesizing linguistic insights with LLM...</p>
              </div>
            )}
          </div>

          {/* Follow up question bar */}
          {!currentLlm.isTemp && (
            <form onSubmit={handleLlmChat} className="p-3 border-t border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex gap-2">
              <input
                type="text"
                value={llmChatInput}
                onChange={e => setLlmChatInput(e.target.value)}
                placeholder="Ask LLM follow-up questions, explore nuances, formal/casual registers, or ask for examples..."
                className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={loading}
              />
              <button
                disabled={loading || !llmChatInput.trim()}
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 active:bg-purple-700 transition-colors text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-xs disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
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
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 dark:from-purple-500/20 dark:to-indigo-500/20 border border-purple-200/70 dark:border-purple-800/60 flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400 shadow-sm">
            <Sparkles size={28} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">
            Special LLM Mode
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
            Deep generative language reasoning, conversational grammatical analysis, tone adaptation, and contextual translation comparisons.
          </p>

          {(showRecentEmpty || settings?.SHOW_RECENT_EMPTY === 'true') && llmRecords && llmRecords.length > 0 && (
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-2xl p-4 shadow-sm text-left">
              <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5"><History size={13} /> Recent LLM Records</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchLlmRecords?.()}
                    className="hover:text-purple-500 dark:hover:text-purple-400 transition-colors lowercase font-normal cursor-pointer flex items-center gap-1"
                    title="Refresh recent LLM records"
                  >
                    <RefreshCw size={11} />
                    <span>refresh</span>
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  <button
                    type="button"
                    onClick={() => onOpenHistory?.()}
                    className="hover:text-purple-500 dark:hover:text-purple-400 transition-colors lowercase font-normal cursor-pointer"
                  >
                    view all ({llmRecords.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {llmRecords.slice(0, 10).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setLlmSearchTerm(t.text);
                      setCurrentLlm(t);
                      setLoading(true);
                      fetch(`/api/llm/records/${t.id}`)
                        .then(r => r.json())
                        .then(d => {
                          setLlmChats(d.chats || []);
                          setCurrentLlm(d.record);
                        })
                        .catch(e => console.error(e))
                        .finally(() => setLoading(false));
                    }}
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/80 text-sm text-gray-700 dark:text-gray-200 hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 transition-all shadow-2xs cursor-pointer"
                  >
                    <span className="font-medium truncate max-w-xs">{t.text}</span>
                    {t.source_lang && t.target_lang && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-purple-500">
                        ({t.source_lang}➔{t.target_lang})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Enter</kbd> to analyze
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
