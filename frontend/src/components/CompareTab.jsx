import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { History, Zap, ArrowRightLeft, Copy, Loader2, RefreshCw, GitCompare, Pencil, Check, X, Trash2, Settings, ChevronDown, ChevronUp, Sparkles, Eye, Send, Shuffle } from 'lucide-react'
import ChatMessageActions from './ChatMessageActions'

export default function CompareTab({ comparisons, tabId, fetchComparisons, settings, defaultSettings, showRecentEmpty, models, onUpdateTab, initialComparison, profileId, sourceLang, setSourceLang, targetLang, setTargetLang, translationLangs, onOpenHistory, onMoveComparison, onMoveMode, onAddNewTab }) {
  const [openInNewTab, setOpenInNewTab] = useState(() => localStorage.getItem('openInNewTab') !== 'false');
  
  const handleToggleNewTab = () => {
    const val = !openInNewTab;
    setOpenInNewTab(val);
    localStorage.setItem('openInNewTab', val);
  };
  const [currentComparison, setCurrentComparison] = useState(initialComparison || null)
  const [compareChats, setCompareChats] = useState([])
  const [comparisonSearchTerm, setComparisonSearchTerm] = useState(initialComparison?.terms || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [compareChatInput, setCompareChatInput] = useState('')
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
    if (initialComparison && initialComparison.isTemp && initialComparison.terms && !currentComparison?.explanation) {
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setComparisonSearchTerm(initialComparison.terms);
      setLoading(true);
      fetch('/api/comparisons/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: initialComparison.terms, profile_id: profileId, session_id: localStorage.getItem('active_session_id') || undefined, source_language: sourceLang, target_language: targetLang })
      })
      .then(res => res.json())
      .then(data => {
        setCurrentComparison(data.comparison);
        setCompareChats(data.chats);
        if (fetchComparisons) fetchComparisons();
      })
      .catch(err => {
        alert(err.message);
        setCurrentComparison(null);
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, []);

  const handleSaveEdit = async (chatId) => {
    if (!editingContent.trim()) return
    try {
      const res = await fetch(`/api/comparisons/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setCompareChats(prev => prev.map(c => c.id === chatId ? updated : c))
      setEditingChatId(null)
    } catch (err) {
      alert(err.message)
    }
  }


  // If initialComparison is provided, fetch its chats
  useEffect(() => {
    if (!initialComparison) {
      setCurrentComparison(null);
      setCompareChats([]);
      setComparisonSearchTerm('');
      setLoading(false);
      return;
    }
    if (initialComparison.isTemp && initialComparison.terms) {
      if (currentComparison?.terms === initialComparison.terms && (loading || compareChats.length > 0)) return;
      handleCompareSearch(null, initialComparison.terms, true);
      return;
    }
    if (!initialComparison.isTemp && initialComparison.id) {
      if (currentComparison?.id === initialComparison.id && compareChats.length > 0) return;
      setComparisonSearchTerm(initialComparison.terms || '');
      setLoading(true);
      fetch(`/api/comparisons/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({terms: initialComparison.terms, profile_id: profileId, source_language: sourceLang, target_language: targetLang}) })
        .then(r => r.json())
        .then(d => { setCompareChats(d.chats); setCurrentComparison(d.comparison); })
        .catch(e => console.error(e))
        .finally(() => setLoading(false))
    }
  }, [initialComparison?.id, initialComparison?.terms]);

  // Update parent tab state for ticks and titles
  useEffect(() => {
    let title = 'New Compare';
    if (comparisonSearchTerm) title = comparisonSearchTerm;
    if (currentComparison && !currentComparison.isTemp && currentComparison.terms) title = currentComparison.terms;
    onUpdateTab(tabId, { title, loading, hasData: !!currentComparison && !currentComparison.isTemp });
  }, [comparisonSearchTerm, currentComparison, loading]);

  const handleCompareSearch = async (e, overrideTerm, isInitial = false) => {
    e?.preventDefault()
    setShowSuggestions(false)
    const termToUse = overrideTerm !== undefined ? overrideTerm : comparisonSearchTerm;
    if (!termToUse.trim()) return

    if (!isInitial) {
      const isBusy = loading;
      const isCurrentTabBlank = !isBusy && !currentComparison;
      const shouldOpenNewTab = (openInNewTab && !isCurrentTabBlank) || isBusy;
      if (shouldOpenNewTab) {
        if (onAddNewTab) {
          onAddNewTab(termToUse.trim());
        } else {
          window.open(`/compare/?q=${encodeURIComponent(termToUse.trim())}`, '_blank');
        }
        setComparisonSearchTerm(currentComparison?.terms || '');
        return;
      }
    }

    setLoading(true)
    setCurrentComparison({ terms: termToUse, isTemp: true })
    setCompareChats([])
    // Refresh history immediately so comparison shows in sidebar even if generation is in-flight or user navigates
    setTimeout(() => { if (fetchComparisons) fetchComparisons(); }, 250);
    try {
      const res = await fetch('/api/comparisons/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: termToUse, profile_id: profileId, session_id: localStorage.getItem('active_session_id') || undefined, source_language: sourceLang, target_language: targetLang })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentComparison(data.comparison)
      setCompareChats(data.chats)
      if (fetchComparisons) fetchComparisons()
    } catch (err) {
      if (fetchComparisons) fetchComparisons()
      alert(err.message)
      setCurrentComparison(null)
    } finally {
      setLoading(false)
    }
  }

  const handleCompareRegenerate = async (model) => {
    if (!currentComparison || currentComparison.isTemp) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comparisons/${currentComparison.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, source_language: sourceLang, target_language: targetLang })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentComparison(data.comparison)
      setCompareChats(data.chats)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCompareChat = async (e) => {
    e?.preventDefault()
    if (!compareChatInput.trim() || !currentComparison || currentComparison.isTemp) return
    const newChat = { role: 'user', content: compareChatInput, id: 'temp' }
    setCompareChats([...compareChats, newChat])
    setCompareChatInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/comparisons/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comparison_id: currentComparison.id, content: newChat.content, profile_id: profileId })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.chats) {
        setCompareChats(data.chats)
      } else {
        setCompareChats(prev => [...prev.filter(c => c.id !== 'temp'), { ...newChat, id: Date.now() - 1 }, data])
      }
    } catch (err) {
      alert(err.message)
      setCompareChats(prev => prev.filter(c => c.id !== 'temp'))
    } finally {
      setLoading(false)
    }
  }

  const [copied, setCopied] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const promptKey = profileId ? `COMPARE_PROMPT_${profileId}` : 'COMPARE_PROMPT'
  const hasCustomPrompt = Boolean(settings && settings[promptKey])
  const globalPrompt = (settings && settings.COMPARE_PROMPT) || (defaultSettings ? defaultSettings.COMPARE_PROMPT : '') || ''
  const [localPrompt, setLocalPrompt] = useState(settings?.[promptKey] || '')

  useEffect(() => {
    setLocalPrompt(settings?.[promptKey] || '')
  }, [profileId, settings, promptKey])

  const [retryingChatId, setRetryingChatId] = useState(null)

  const handleRetryCompareChat = async (chat, model) => {
    if (!currentComparison || currentComparison.isTemp || !chat) return
    if (compareChats.length > 0 && compareChats[0].id === chat.id && chat.role === 'assistant') {
      return handleCompareRegenerate(model || settings?.COMPARE_MODEL || settings?.MAIN_MODEL)
    }
    setRetryingChatId(chat.id)
    setLoading(true)
    try {
      const res = await fetch(`/api/comparisons/chats/${chat.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || undefined })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.comparison) setCurrentComparison(data.comparison)
      if (data.chats) setCompareChats(data.chats)
      if (fetchComparisons) fetchComparisons()
    } catch (err) {
      alert(err.message)
    } finally {
      setRetryingChatId(null)
      setLoading(false)
    }
  }

  const handleDeleteCompareChat = async (chat) => {
    if (!chat || !currentComparison) return
    if (compareChats.length > 0 && compareChats[0].id === chat.id && chat.role === 'assistant') {
      if (!confirm('Are you sure you want to delete this entire comparison?')) return
      await fetch(`/api/comparisons/${currentComparison.id}`, { method: 'DELETE' })
      if (fetchComparisons) fetchComparisons()
      setCurrentComparison(null)
      setCompareChats([])
      setComparisonSearchTerm('')
      return
    }

    if (!confirm('Are you sure you want to delete this message?')) return
    try {
      const res = await fetch(`/api/comparisons/chats/${chat.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.chats) {
        setCompareChats(data.chats)
      } else {
        setCompareChats(prev => prev.filter(c => c.id !== chat.id))
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const getFullContentToCopy = () => {
    if (!compareChats || compareChats.length === 0) return ''
    if (compareChats.length === 1) return compareChats[0]?.content || ''
    const parts = []
    if (compareChats[0]?.content) {
      parts.push(compareChats[0].content.trim())
    }
    const followups = []
    for (let i = 1; i < compareChats.length; i++) {
      const c = compareChats[i]
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
      {/* Top Search Command Bar */}
      <div className="mb-3">
        <form onSubmit={handleCompareSearch} className="flex items-center gap-2 relative">
          {/* History button */}
          <button
            type="button"
            onClick={() => { if (onOpenHistory) onOpenHistory(); }}
            className="h-11 px-3 flex items-center justify-center gap-1.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200/80 dark:border-gray-700/80 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
            title="Open Comparison History"
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
                value={sourceLang}
                onChange={e => setSourceLang(e.target.value)}
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
                  const temp = sourceLang;
                  setSourceLang(targetLang);
                  setTargetLang(temp);
                }}
                className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-transform duration-200 active:scale-90"
                title="Swap source and target languages"
              >
                <ArrowRightLeft size={13} />
              </button>
              <select
                value={targetLang}
                onChange={e => setTargetLang(e.target.value)}
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
              value={comparisonSearchTerm}
              onChange={e => { setComparisonSearchTerm(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              ref={inputRef}
              placeholder="Words to compare (e.g. affect, effect)..."
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />

            {/* Clear input button */}
            {comparisonSearchTerm && (
              <button
                type="button"
                onClick={() => { setComparisonSearchTerm(''); inputRef.current?.focus(); }}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mr-1 cursor-pointer"
                title="Clear"
              >
                <X size={15} />
              </button>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!comparisonSearchTerm.trim()}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-40 transition-all shrink-0 cursor-pointer"
            >
              {loading && (!comparisonSearchTerm.trim() || comparisonSearchTerm.trim() === currentComparison?.terms) ? <Loader2 className="animate-spin" size={16} /> : <GitCompare size={16} />}
              <span className="hidden sm:inline">Compare</span>
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
          {showSuggestions && comparisonSearchTerm.trim() && comparisons?.some(w => w.terms.toLowerCase().includes(comparisonSearchTerm.toLowerCase().trim())) && (
            <ul
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-16 right-16 top-full mt-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800"
            >
              {comparisons.filter(w => w.terms.toLowerCase().includes(comparisonSearchTerm.toLowerCase().trim())).slice(0, 10).map(w => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setComparisonSearchTerm(w.terms);
                      setShowSuggestions(false);
                      handleCompareSearch(null, w.terms);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{w.terms}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">
                      Compared {w.search_count || 1}×
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
              <label className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                <Settings size={15} className="text-blue-500" />
                System Prompt
              </label>
              {profileId && (
                hasCustomPrompt ? (
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                    Profile Custom
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700">
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
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 font-medium cursor-pointer"
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

      {currentComparison ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-800 rounded-2xl shadow-sm">
          {/* Card Header */}
          <div className="p-4 sm:p-5 border-b border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-[#bb9af7] tracking-tight">
                  {currentComparison?.terms || comparisonSearchTerm}
                </h2>
                {currentComparison.isTemp ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Loader2 className="animate-spin" size={12} /> Comparing...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Ready
                  </span>
                )}
              </div>

              {!currentComparison.isTemp && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-2">
                  {currentComparison.view_count ? (
                    <span className="flex items-center gap-1" title="Views">
                      <Eye size={13} /> {currentComparison.view_count}×
                    </span>
                  ) : null}
                  <span>•</span>
                  <span className="flex items-center gap-1" title="Comparisons">
                    <GitCompare size={13} /> {currentComparison.search_count}×
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!currentComparison.isTemp && (
              <div className="flex gap-2 items-center shrink-0">
                <div className="relative group">
                  <button
                    className="p-2 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-xl text-gray-600 dark:text-gray-300 transition-colors flex items-center gap-1 border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Regenerate comparison"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <div className="absolute right-0 top-full pt-1.5 w-52 hidden group-hover:block z-20">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden py-1.5 divide-y divide-gray-100 dark:divide-gray-700/60">
                      <div className="px-3.5 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <div className="py-1">
                        <button
                          onClick={() => handleCompareRegenerate(settings.COMPARE_MODEL || settings.MAIN_MODEL)}
                          className="block w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          Default Model
                        </button>
                        {(settings.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                          <button
                            key={m}
                            onClick={() => handleCompareRegenerate(m.trim())}
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
                  title={compareChats.length > 1 ? "Copy complete output & follow-ups" : "Copy initial explanation"}
                >
                  {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>

                {onMoveMode && (
                  <button
                    onClick={() => onMoveMode(currentComparison, 'compare', () => {
                      setCurrentComparison(null);
                      setCompareChats([]);
                      setComparisonSearchTerm('');
                      onUpdateTab?.(tabId, { title: 'New Compare', loading: false, hasData: false, initialComparison: null });
                    })}
                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move to another mode & regenerate"
                  >
                    <Shuffle size={18} />
                  </button>
                )}

                {onMoveComparison && (
                  <button
                    onClick={() => onMoveComparison(currentComparison, () => {
                      setCurrentComparison(null);
                      setCompareChats([]);
                      setComparisonSearchTerm('');
                    })}
                    className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move comparison to another profile"
                  >
                    <ArrowRightLeft size={18} />
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete this comparison?')) return;
                    await fetch(`/api/comparisons/${currentComparison.id}`, { method: 'DELETE' });
                    fetchComparisons();
                    setCurrentComparison(null);
                    setCompareChats([]);
                    setComparisonSearchTerm('');
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800/50 cursor-pointer"
                  title="Delete this comparison"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {compareChats.map((chat, idx) => (
              <div key={chat.id || idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 relative group ${
                  chat.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-xs shadow-xs'
                    : 'bg-white dark:bg-gray-800 border border-gray-200/90 dark:border-gray-700/80 shadow-xs markdown-body dark:text-gray-100 rounded-bl-xs'
                }`}>
                  {editingChatId === chat.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editingContent}
                        onChange={e => setEditingContent(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm min-h-[200px] text-gray-900 dark:text-gray-100 font-mono"
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingChatId(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-pointer"><X size={16}/></button>
                        <button onClick={() => handleSaveEdit(chat.id)} className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded cursor-pointer"><Check size={16}/></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {chat.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{chat.content}</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{chat.content}</ReactMarkdown>
                      )}
                      {chat.role !== 'user' && chat.id !== 'temp' && (
                        <button
                          onClick={() => { setEditingChatId(chat.id); setEditingContent(chat.content); }}
                          className="absolute top-2.5 right-2.5 p-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer shadow-xs"
                          title="Edit response"
                        >
                          <Pencil size={13} />
                        </button>
                      )}

                      {chat.id !== 'temp' && (
                        <ChatMessageActions
                          chat={chat}
                          index={idx}
                          isUser={chat.role === 'user'}
                          currentModel={settings?.COMPARE_MODEL || settings?.MAIN_MODEL}
                          fallbackModels={(settings?.FALLBACK_MODELS || '').split(',').map(m => m.trim()).filter(Boolean)}
                          onCopy={(text) => copyToClipboard(text)}
                          onRetry={handleRetryCompareChat}
                          onDelete={handleDeleteCompareChat}
                          loading={loading}
                          retryingChatId={retryingChatId}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {loading && compareChats.length > 0 && (
              <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2 text-sm">
                <Loader2 className="animate-spin text-blue-500" size={16} />
                <span>Generating follow-up...</span>
              </div>
            )}

            {currentComparison.isTemp && compareChats.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                <Loader2 className="animate-spin mb-3 text-blue-500" size={32} />
                <p className="text-sm font-medium">Generating comparison analysis...</p>
              </div>
            )}
          </div>

          {/* Follow-up question input */}
          {!currentComparison.isTemp && (
            <form onSubmit={handleCompareChat} className="p-3 border-t border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex gap-2 items-center">
              <input
                type="text"
                value={compareChatInput}
                onChange={e => setCompareChatInput(e.target.value)}
                placeholder="Ask a follow-up question about this comparison..."
                className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-gray-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                disabled={loading}
              />
              <button
                disabled={loading || !compareChatInput.trim()}
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 transition-colors text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
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
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 border border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400 shadow-sm">
            <GitCompare size={28} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">
            Word & Concept Comparison
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
            Enter words or phrases separated by commas to explore nuanced differences, usage boundaries, connotations, and examples.
          </p>

          {(showRecentEmpty || settings?.SHOW_RECENT_EMPTY === 'true') && comparisons && comparisons.length > 0 && (
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-2xl p-4 shadow-sm text-left">
              <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5"><History size={13} /> Recent Comparisons</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchComparisons?.()}
                    className="hover:text-purple-500 dark:hover:text-purple-400 transition-colors lowercase font-normal cursor-pointer flex items-center gap-1"
                    title="Refresh recent comparisons"
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
                    view all ({comparisons.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {comparisons.slice(0, 10).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setComparisonSearchTerm(c.terms);
                      handleCompareSearch(null, c.terms);
                    }}
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/80 text-sm text-gray-700 dark:text-gray-200 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all shadow-2xs cursor-pointer"
                  >
                    <span className="font-medium">{c.terms}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Enter</kbd> to compare
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
