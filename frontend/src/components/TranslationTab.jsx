import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { History, Zap, ArrowRightLeft, Copy, Loader2, RefreshCw, BookOpen, Pencil, Check, X, Trash2, Settings, ChevronDown, ChevronUp, Sparkles, Languages, Eye, Send, Shuffle } from 'lucide-react';
import { COLORS } from "./SearchTab";
import SpeechButton from "./SpeechButton";
import ChatMessageActions from "./ChatMessageActions";
import StarRating from "./StarRating";

export default function TranslationTab({ translations, tabId, fetchTranslations, settings, defaultSettings, showRecentEmpty, models, onUpdateTab, initialTranslation, translationSourceLang, setTranslationSourceLang, translationTargetLang, setTranslationTargetLang, translationLangs, setTranslationLangs, profileId, profileName, onOpenHistory, onMoveTranslation, onMoveMode, onAddNewTab }) {
  const [openInNewTab, setOpenInNewTab] = useState(() => localStorage.getItem('openInNewTab') !== 'false');
  
  const handleToggleNewTab = () => {
    const val = !openInNewTab;
    setOpenInNewTab(val);
    localStorage.setItem('openInNewTab', val);
  };
  const [currentTranslation, setCurrentTranslation] = useState(initialTranslation || null)
  const [translationChats, setTranslationChats] = useState([])
  const [translationSearchTerm, setTranslationSearchTerm] = useState(initialTranslation?.text || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [translationChatInput, setTranslationChatInput] = useState('')
  const [loading, setLoading] = useState(false)

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

  const [editingChatId, setEditingChatId] = useState(null)
  const [editingContent, setEditingContent] = useState('')


  useEffect(() => {
    if (initialTranslation && initialTranslation.isTemp && initialTranslation.text && !currentTranslation?.translation) {
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setTranslationSearchTerm(initialTranslation.text);
      setLoading(true);
      fetch('/api/translations/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: initialTranslation.text, source_lang: translationSourceLang, target_lang: translationTargetLang, profile_id: profileId, session_id: localStorage.getItem('active_session_id') || undefined })
      })
      .then(res => res.json())
      .then(data => {
        setCurrentTranslation(data.translation);
        setTranslationChats(data.chats);
        if (fetchTranslations) fetchTranslations();
      })
      .catch(err => {
        alert(err.message);
        setCurrentTranslation(null);
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, []);

  const handleSaveEdit = async (chatId) => {
    if (!editingContent.trim()) return
    try {
      const res = await fetch(`/api/translations/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setTranslationChats(prev => prev.map(c => c.id === chatId ? updated : c))
      setEditingChatId(null)
    } catch (err) {
      alert(err.message)
    }
  }


  // If initialTranslation is provided, fetch its chats
  useEffect(() => {
    if (!initialTranslation) {
      setCurrentTranslation(null);
      setTranslationChats([]);
      setTranslationSearchTerm('');
      setLoading(false);
      return;
    }
    if (initialTranslation.isTemp && initialTranslation.text) {
      if (currentTranslation?.text === initialTranslation.text && (loading || translationChats.length > 0)) return;
      handleTranslationSearch(null, initialTranslation.text, true);
      return;
    }
    if (!initialTranslation.isTemp && initialTranslation.id) {
      if (currentTranslation?.id === initialTranslation.id && translationChats.length > 0) return;
      setTranslationSearchTerm(initialTranslation.text || '');
      setLoading(true);
      fetch(`/api/translations/search`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: initialTranslation.text,
          profile_id: profileId,
          source_lang: translationSourceLang,
          target_lang: translationTargetLang
        })
      })
        .then(r => r.json())
        .then(d => { setTranslationChats(d.chats); setCurrentTranslation(d.translation); })
        .catch(e => console.error(e))
        .finally(() => setLoading(false))
    }
  }, [initialTranslation?.id, initialTranslation?.text]);

  // Update parent tab state for ticks and titles
  useEffect(() => {
    let title = 'New Translation';
    if (translationSearchTerm) title = translationSearchTerm;
    if (currentTranslation && !currentTranslation.isTemp && currentTranslation.content) title = currentTranslation.content.substring(0, 30) + '...';
    onUpdateTab(tabId, { title, loading, hasData: !!currentTranslation && !currentTranslation.isTemp });
  }, [translationSearchTerm, currentTranslation, loading]);

  const handleTranslationSearch = async (e, overrideTerm, isInitial = false) => {
    e?.preventDefault()
    setShowSuggestions(false)
    const termToUse = overrideTerm !== undefined ? overrideTerm : translationSearchTerm;
    if (!termToUse.trim()) return

    if (!isInitial) {
      const isBusy = loading;
      const isCurrentTabBlank = !isBusy && !currentTranslation;
      const shouldOpenNewTab = (openInNewTab && !isCurrentTabBlank) || isBusy;
      if (shouldOpenNewTab) {
        if (onAddNewTab) {
          onAddNewTab(termToUse.trim());
        } else {
          window.open(`/translation/?q=${encodeURIComponent(termToUse.trim())}`, '_blank');
        }
        setTranslationSearchTerm(currentTranslation?.text || '');
        return;
      }
    }

    setLoading(true)
    setCurrentTranslation({ text: termToUse, isTemp: true })
    setTranslationChats([])
    // Refresh history immediately so translation shows in sidebar even if generation is in-flight or user navigates
    setTimeout(() => { if (fetchTranslations) fetchTranslations(); }, 250);
    try {
      const res = await fetch('/api/translations/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: termToUse, source_lang: translationSourceLang, target_lang: translationTargetLang, profile_id: profileId, session_id: localStorage.getItem('active_session_id') || undefined })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentTranslation(data.translation)
      setTranslationChats(data.chats)
      if (fetchTranslations) fetchTranslations()
    } catch (err) {
      if (fetchTranslations) fetchTranslations()
      alert(err.message)
      setCurrentTranslation(null)
    } finally {
      setLoading(false)
    }
  }

  const handleTranslationRegenerate = async (model) => {
    if (!currentTranslation || currentTranslation.isTemp) return
    setLoading(true)
    try {
      const res = await fetch(`/api/translations/${currentTranslation.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, source_lang: translationSourceLang, target_lang: translationTargetLang })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentTranslation(data.translation)
      setTranslationChats(data.chats)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTranslationChat = async (e) => {
    e?.preventDefault()
    if (!translationChatInput.trim() || !currentTranslation || currentTranslation.isTemp) return
    const newChat = { role: 'user', content: translationChatInput, id: 'temp' }
    setTranslationChats([...translationChats, newChat])
    setTranslationChatInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/translations/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translation_id: currentTranslation.id, content: newChat.content, profile_id: profileId })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.chats) {
        setTranslationChats(data.chats)
      } else {
        const asstMsg = { id: data.chat_id || Date.now(), role: 'assistant', content: data.response }
        setTranslationChats(prev => [...prev.filter(c => c.id !== 'temp'), { ...newChat, id: Date.now() - 1 }, asstMsg])
      }
    } catch (err) {
      alert(err.message)
      setTranslationChats(prev => prev.filter(c => c.id !== 'temp'))
    } finally {
      setLoading(false)
    }
  }

  
  const updateColor = async (colorId) => {
    if (!currentTranslation || currentTranslation.isTemp) return
    const res = await fetch(`/api/translations/${currentTranslation.id}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: colorId === currentTranslation.color ? null : colorId })
    })
    if (res.ok) {
      const updated = await res.json()
      setCurrentTranslation(updated)
      fetchTranslations()
    }
  }

  const updateStars = async (newStars) => {
    if (!currentTranslation || currentTranslation.isTemp) return
    const val = currentTranslation.stars === newStars ? 0 : newStars
    const res = await fetch(`/api/translations/${currentTranslation.id}/stars`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars: val })
    })
    if (res.ok) {
      const updated = await res.json()
      setCurrentTranslation(prev => ({ ...prev, stars: updated.stars }))
      if (fetchTranslations) fetchTranslations()
    }
  }

  const [copied, setCopied] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const promptKey = profileId ? `TRANSLATE_PROMPT_${profileId}` : 'TRANSLATE_PROMPT'
  const hasCustomPrompt = Boolean(settings && settings[promptKey])
  const globalPrompt = (settings && settings.TRANSLATE_PROMPT) || (defaultSettings ? defaultSettings.TRANSLATE_PROMPT : '') || ''
  const [localPrompt, setLocalPrompt] = useState(settings?.[promptKey] || '')

  useEffect(() => {
    setLocalPrompt(settings?.[promptKey] || '')
  }, [profileId, settings, promptKey])


  const [retryingChatId, setRetryingChatId] = useState(null)

  const handleRetryTranslationChat = async (chat, model) => {
    if (!currentTranslation || currentTranslation.isTemp || !chat) return
    if (translationChats.length > 0 && translationChats[0].id === chat.id && chat.role === 'assistant') {
      return handleTranslationRegenerate(model || settings?.TRANSLATION_MODEL || settings?.MAIN_MODEL)
    }
    setRetryingChatId(chat.id)
    setLoading(true)
    try {
      const res = await fetch(`/api/translations/chats/${chat.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || undefined })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.translation) setCurrentTranslation(data.translation)
      if (data.chats) setTranslationChats(data.chats)
      if (fetchTranslations) fetchTranslations()
    } catch (err) {
      alert(err.message)
    } finally {
      setRetryingChatId(null)
      setLoading(false)
    }
  }

  const handleDeleteTranslationChat = async (chat) => {
    if (!chat || !currentTranslation) return
    if (translationChats.length > 0 && translationChats[0].id === chat.id && chat.role === 'assistant') {
      if (!confirm('Are you sure you want to delete this entire translation?')) return
      await fetch(`/api/translations/${currentTranslation.id}`, { method: 'DELETE' })
      if (fetchTranslations) fetchTranslations()
      setCurrentTranslation(null)
      setTranslationChats([])
      setTranslationSearchTerm('')
      return
    }

    if (!confirm('Are you sure you want to delete this message?')) return
    try {
      const res = await fetch(`/api/translations/chats/${chat.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.chats) {
        setTranslationChats(data.chats)
      } else {
        setTranslationChats(prev => prev.filter(c => c.id !== chat.id))
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const getFullContentToCopy = () => {
    if (!translationChats || translationChats.length === 0) return ''
    if (translationChats.length === 1) return translationChats[0]?.content || ''
    const parts = []
    if (translationChats[0]?.content) {
      parts.push(translationChats[0].content.trim())
    }
    const followups = []
    for (let i = 1; i < translationChats.length; i++) {
      const c = translationChats[i]
      if (c.role === 'user') {
        followups.push(`**User:** ${c.content.trim()}`)
      } else {
        followups.push(`**AI:**\n${c.content.trim()}`)
      }
    }
    if (followups.length > 0) {
      parts.push('\n\n---\n### Follow-up Conversation\n\n' + followups.join('\n\n'))
    }
    return parts.join('\n')
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 dark:text-gray-100 max-w-[1750px] mx-auto w-full">
      {/* Top Command Bar */}
      <div className="relative mb-4">
        <form onSubmit={handleTranslationSearch} className="flex items-center gap-2">
          {/* History drawer button */}
          <button
            type="button"
            onClick={() => { if (onOpenHistory) onOpenHistory(); }}
            className="h-11 px-3.5 flex items-center justify-center gap-1.5 bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-all shadow-xs shrink-0 cursor-pointer"
            title="Open Translation History"
          >
            <History size={18} />
            <span className="text-xs font-medium hidden sm:inline">History</span>
          </button>

          {/* Quick Open in New Tab toggle */}
          <button
            type="button"
            onClick={handleToggleNewTab}
            className={`h-11 px-3 flex items-center justify-center gap-1.5 rounded-xl border transition-all shadow-xs shrink-0 cursor-pointer ${
              openInNewTab
                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-400 font-semibold'
                : 'bg-white dark:bg-gray-900 border-gray-200/80 dark:border-gray-700/80 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            title="Toggle Quick Open in New Tab"
          >
            <Zap size={16} className={openInNewTab ? 'fill-blue-500 text-blue-500 dark:fill-blue-400 dark:text-blue-400' : ''} />
            <span className="text-xs hidden md:inline">New Tab</span>
          </button>

          {/* Integrated Search Input Container */}
          <div className="flex-1 relative flex items-center bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700/80 rounded-xl shadow-xs hover:border-blue-400/60 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all p-1">
            {/* Language Capsule */}
            <div className="flex items-center bg-gray-100/90 dark:bg-gray-800 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 gap-1.5 border border-gray-200/60 dark:border-gray-700/60 shrink-0 select-none">
              <select
                value={translationSourceLang}
                onChange={e => setTranslationSourceLang(e.target.value)}
                className="bg-transparent dark:text-gray-200 border-none outline-none focus:ring-0 cursor-pointer w-[68px] text-center appearance-none truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Source Language"
              >
                {translationLangs?.map(l => (
                  <option key={l} value={l} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const temp = translationSourceLang;
                  setTranslationSourceLang(translationTargetLang);
                  setTranslationTargetLang(temp);
                }}
                className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-transform duration-200 active:scale-90"
                title="Swap source and target languages"
              >
                <ArrowRightLeft size={13} />
              </button>
              <select
                value={translationTargetLang}
                onChange={e => setTranslationTargetLang(e.target.value)}
                className="bg-transparent dark:text-gray-200 border-none outline-none focus:ring-0 cursor-pointer w-[68px] text-center appearance-none truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Target Language"
              >
                {translationLangs?.map(l => (
                  <option key={l} value={l} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* Input Field */}
            <input
              type="text"
              value={translationSearchTerm}
              onChange={e => { setTranslationSearchTerm(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              ref={inputRef}
              placeholder="Text or phrase to translate..."
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />

            {/* Clear input button */}
            {translationSearchTerm && (
              <button
                type="button"
                onClick={() => { setTranslationSearchTerm(''); inputRef.current?.focus(); }}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mr-1 cursor-pointer"
                title="Clear"
              >
                <X size={15} />
              </button>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!translationSearchTerm.trim()}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-40 transition-all shrink-0 cursor-pointer"
            >
              {loading && (!translationSearchTerm.trim() || translationSearchTerm.trim() === currentTranslation?.text) ? <Loader2 className="animate-spin" size={16} /> : <Languages size={16} />}
              <span className="hidden sm:inline">Translate</span>
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
          {showSuggestions && translationSearchTerm.trim() && translations?.some(w => w.text.toLowerCase().includes(translationSearchTerm.toLowerCase().trim())) && (
            <ul
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-16 right-16 top-full mt-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800"
            >
              {translations.filter(w => w.text.toLowerCase().includes(translationSearchTerm.toLowerCase().trim())).slice(0, 10).map(w => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTranslationSearchTerm(w.text);
                      setShowSuggestions(false);
                      handleTranslationSearch(null, w.text);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{w.text}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">
                      Translated {w.search_count || 1}×
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
                System Prompt
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
            placeholder="System prompt..."
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            rows="3"
          />
        </div>
      )}

      {currentTranslation ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-800 rounded-2xl shadow-sm">
          {/* Card Header */}
          <div className="p-4 sm:p-5 border-b border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                {currentTranslation.isEditing ? (
                  <textarea
                    defaultValue={currentTranslation.text}
                    onBlur={async (e) => {
                      const newTerm = e.target.value;
                      if (newTerm && newTerm !== currentTranslation.text) {
                        const res = await fetch(`/api/translations/${currentTranslation.id}/rename`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ term: newTerm })
                        });
                        if (res.ok) {
                          const updated = await res.json();
                          setCurrentTranslation({...currentTranslation, text: updated.text, isEditing: false});
                          fetchTranslations();
                        } else {
                          setCurrentTranslation({...currentTranslation, isEditing: false});
                        }
                      } else {
                        setCurrentTranslation({...currentTranslation, isEditing: false});
                      }
                    }}
                    autoFocus
                    className="border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 rounded-xl px-3 py-2 text-xl font-bold w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="2"
                  />
                ) : (
                  <div className="flex items-start gap-2 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-[#e0af68] tracking-tight whitespace-pre-wrap">
                      {currentTranslation?.text || translationSearchTerm}
                    </h2>
                    {(currentTranslation?.text || translationSearchTerm) && (
                      <SpeechButton
                        text={currentTranslation?.text || translationSearchTerm}
                        wordLang={currentTranslation?.source_lang}
                        profileLang={translationSourceLang}
                        profileName={profileName}
                      />
                    )}
                    {!currentTranslation.isTemp && (
                      <button
                        onClick={() => setCurrentTranslation({...currentTranslation, isEditing: true})}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-md text-xs font-medium border border-gray-200/60 dark:border-gray-700/60 transition-colors cursor-pointer"
                        title="Rename"
                      >
                        <Pencil size={12} /> Rename
                      </button>
                    )}
                  </div>
                )}

                {currentTranslation.isTemp ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Loader2 className="animate-spin" size={12} /> Translating...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Ready
                  </span>
                )}
              </div>

              {!currentTranslation.isTemp && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800/60 text-[11px]">
                    {currentTranslation.source_lang} ➔ {currentTranslation.target_lang}
                  </span>
                  {currentTranslation.view_count ? (
                    <span className="flex items-center gap-1" title="Views">
                      <Eye size={13} /> {currentTranslation.view_count}×
                    </span>
                  ) : null}
                  <span>•</span>
                  <span className="flex items-center gap-1" title="Translations">
                    <Languages size={13} /> {currentTranslation.search_count}×
                  </span>

                  <button
                    type="button"
                    onClick={async () => {
                      const newTag = prompt('Enter a tag:', currentTranslation.tag || '');
                      if (newTag !== null) {
                        const res = await fetch(`/api/translations/${currentTranslation.id}/tag`, {
                          method: 'PATCH',
                          headers: {'Content-Type': 'application/json'},
                          body: JSON.stringify({ tag: newTag || null })
                        });
                        if (res.ok) {
                          setCurrentTranslation({...currentTranslation, tag: newTag || null});
                          fetchTranslations();
                        }
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors border border-purple-200 dark:border-purple-800 cursor-pointer ml-1"
                    title="Click to edit tag"
                  >
                    {currentTranslation.tag ? `#${currentTranslation.tag}` : '+ Tag'}
                  </button>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!currentTranslation.isTemp && (
              <div className="flex gap-2 items-center shrink-0">
                <div className="relative group">
                  <button
                    className="p-2 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-xl text-gray-600 dark:text-gray-300 transition-colors flex items-center gap-1 border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Regenerate translation"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <div className="absolute right-0 top-full pt-1.5 w-52 hidden group-hover:block z-20">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden py-1.5 divide-y divide-gray-100 dark:divide-gray-700/60">
                      <div className="px-3.5 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <div className="py-1">
                        <button
                          onClick={() => handleTranslationRegenerate(settings.TRANSLATION_MODEL || settings.MAIN_MODEL)}
                          className="block w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          Default Model
                        </button>
                        {(settings.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                          <button
                            key={m}
                            onClick={() => handleTranslationRegenerate(m.trim())}
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
                  title={translationChats.length > 1 ? "Copy complete output & follow-ups" : "Copy initial translation"}
                >
                  {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>

                {onMoveTranslation && (
                  <button
                    onClick={() => onMoveTranslation(currentTranslation, () => {
                      setCurrentTranslation(null);
                      setTranslationChats([]);
                      setTranslationSearchTerm('');
                    })}
                    className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move translation to another profile"
                  >
                    <ArrowRightLeft size={18} />
                  </button>
                )}

                {onMoveMode && (
                  <button
                    onClick={() => onMoveMode(currentTranslation, 'translation', () => {
                      setCurrentTranslation(null);
                      setTranslationChats([]);
                      setTranslationSearchTerm('');
                      onUpdateTab?.(tabId, { title: 'New Translation', loading: false, hasData: false, initialTranslation: null });
                    })}
                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move to another mode & regenerate"
                  >
                    <Shuffle size={18} />
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete this translation?')) return;
                    await fetch(`/api/translations/${currentTranslation.id}`, { method: 'DELETE' });
                    fetchTranslations();
                    setCurrentTranslation(null);
                    setTranslationChats([]);
                    setTranslationSearchTerm('');
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800 cursor-pointer"
                  title="Delete this translation"
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
                        currentTranslation?.color === c.id ? 'scale-125 ring-2 ring-blue-500 shadow-xs' : 'hover:scale-110 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                </div>

                {/* 1 to 5 Star Rating beside Color */}
                <div className="flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 ml-1">
                  <StarRating
                    value={currentTranslation?.stars || 0}
                    onChange={updateStars}
                    size="md"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Chat / Content area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {translationChats.map((chat, idx) => (
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{chat.content}</ReactMarkdown>
                      )}
                      {chat.role !== 'user' && chat.id !== 'temp' && (
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <SpeechButton
                            text={chat.content}
                            wordLang={currentTranslation?.target_lang}
                            profileLang={translationTargetLang}
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
                          currentModel={settings?.TRANSLATION_MODEL || settings?.MAIN_MODEL}
                          fallbackModels={(settings?.FALLBACK_MODELS || '').split(',').map(m => m.trim()).filter(Boolean)}
                          onCopy={(text) => copyToClipboard(text)}
                          onRetry={handleRetryTranslationChat}
                          onDelete={handleDeleteTranslationChat}
                          loading={loading}
                          retryingChatId={retryingChatId}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && translationChats.length > 0 && (
              <div className="text-gray-400 dark:text-gray-500 flex items-center gap-2 text-xs">
                <Loader2 className="animate-spin" size={14} /> Thinking...
              </div>
            )}
            {currentTranslation.isTemp && translationChats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500">
                <Loader2 className="animate-spin mb-3 text-blue-500" size={32} />
                <p className="text-sm font-medium">Translating with context and nuance...</p>
              </div>
            )}
          </div>

          {/* Follow up question bar */}
          {!currentTranslation.isTemp && (
            <form onSubmit={handleTranslationChat} className="p-3 border-t border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex gap-2">
              <input
                type="text"
                value={translationChatInput}
                onChange={e => setTranslationChatInput(e.target.value)}
                placeholder="Ask a question about this translation (e.g., tone, alternatives, formality)..."
                className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                disabled={loading || !translationChatInput.trim()}
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
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border border-blue-200/70 dark:border-blue-800/60 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400 shadow-sm">
            <Languages size={28} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">
            Deep Contextual Translation
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
            Translate text, idioms, and sentences across languages with nuanced phrasing, cultural adaptation, and stylistic notes.
          </p>

          {(showRecentEmpty || settings?.SHOW_RECENT_EMPTY === 'true') && translations && translations.length > 0 && (
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-2xl p-4 shadow-sm text-left">
              <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5"><History size={13} /> Recent Translations</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchTranslations?.()}
                    className="hover:text-amber-500 dark:hover:text-amber-400 transition-colors lowercase font-normal cursor-pointer flex items-center gap-1"
                    title="Refresh recent translations"
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
                    view all ({translations.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {translations.slice(0, 10).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTranslationSearchTerm(t.text);
                      handleTranslationSearch(null, t.text);
                    }}
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/80 text-sm text-gray-700 dark:text-gray-200 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all shadow-2xs cursor-pointer"
                  >
                    <span className="font-medium truncate max-w-xs">{t.text}</span>
                    {t.source_lang && t.target_lang && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-blue-500">
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
              Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Enter</kbd> to translate
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
