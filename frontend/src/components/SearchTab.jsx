import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowRightLeft, Search, History, PlusSquare, Zap, Copy, ExternalLink, Loader2, RefreshCw, Pencil, Check, X, Trash2, Settings, ChevronDown, ChevronUp, Edit, Sparkles, BookOpen, Eye, Send, Shuffle, Folder, FolderPlus } from 'lucide-react'

import SpeechButton from './SpeechButton'
import ChatMessageActions from './ChatMessageActions'
import StarRating from './StarRating'

const LANGUAGE_MAP = {
  'english': ['en', 'eng'],
  'german': ['de', 'deu', 'ger'],
  'french': ['fr', 'fre', 'fra'],
  'spanish': ['es', 'spa'],
  'italian': ['it', 'ita'],
  'japanese': ['ja', 'jpn', 'jp'],
  'chinese': ['zh', 'zho', 'chi'],
  'korean': ['ko', 'kor'],
  'russian': ['ru', 'rus'],
  'portuguese': ['pt', 'por'],
  'dutch': ['nl', 'nld', 'dut'],
  'vietnamese': ['vi', 'vie'],
  'polish': ['pl', 'pol'],
  'turkish': ['tr', 'tur'],
  'arabic': ['ar', 'ara'],
  'hindi': ['hi', 'hin'],
  'swedish': ['sv', 'swe'],
  'danish': ['da', 'dan'],
  'norwegian': ['no', 'nor'],
  'finnish': ['fi', 'fin'],
  'greek': ['el', 'ell', 'gre'],
  'czech': ['cs', 'ces', 'cze'],
  'romanian': ['ro', 'ron', 'rum'],
  'hungarian': ['hu', 'hun'],
  'thai': ['th', 'tha'],
  'indonesian': ['id', 'ind'],
  'ukrainian': ['uk', 'ukr'],
};

function matchLanguage(aiLanguage, templateLanguage) {
  if (!aiLanguage || !templateLanguage) return false;
  const aiLang = aiLanguage.toLowerCase().trim();
  const cleanAi = aiLang.replace(/[^\w]/g, '').trim();
  const tplLangs = templateLanguage.toLowerCase().split(',').map(s => s.trim());
  const cleanTpls = tplLangs.map(s => s.replace(/[^\w]/g, '').trim());
  
  if (tplLangs.includes('all') || cleanTpls.includes('all')) return true;
  if (tplLangs.includes(aiLang) || (cleanAi && cleanTpls.includes(cleanAi))) return true;
  
  for (const [name, codes] of Object.entries(LANGUAGE_MAP)) {
    if (aiLang.includes(name) || name.includes(aiLang) || (cleanAi && codes.includes(cleanAi))) {
      if (tplLangs.some(l => codes.includes(l) || l === name) || cleanTpls.some(l => codes.includes(l) || l === name)) {
        return true;
      }
    }
  }
  return false;
}

export const COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Forgot' },
  { id: 'orange', hex: '#f97316', label: 'Hard' },
  { id: 'yellow', hex: '#eab308', label: 'Medium' },
  { id: 'green', hex: '#22c55e', label: 'Easy' },
  { id: 'blue', hex: '#3b82f6', label: 'Research' }
]

export default function SearchTab({ words, onOpenHistory, tabId, fetchWords, settings, defaultSettings, showRecentEmpty, models, templates, onUpdateTab, initialWord, profileId, profileName, searchSourceLang, setSearchSourceLang, searchTargetLang, setSearchTargetLang, translationLangs, onMoveWord, onMoveMode, onAddNewTab, onAssignSession }) {
  const [currentWord, setCurrentWord] = useState(initialWord || null)
  const [chats, setChats] = useState([])
  const [searchTerm, setSearchTerm] = useState(initialWord?.term || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [openInNewTab, setOpenInNewTab] = useState(() => localStorage.getItem('openInNewTab') !== 'false');
  
  const handleToggleNewTab = () => {
    const val = !openInNewTab;
    setOpenInNewTab(val);
    localStorage.setItem('openInNewTab', val);
  };

  const [chatInput, setChatInput] = useState('')
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

  const handleSaveEdit = async (chatId) => {
    if (!editingContent.trim()) return
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setChats(prev => prev.map(c => c.id === chatId ? updated : c))
      setEditingChatId(null)
    } catch (err) {
      alert(err.message)
    }
  }

  const [relatedWords, setRelatedWords] = useState([])


  // Auto-search if loaded from URL
  useEffect(() => {
    if (initialWord && initialWord.isTemp && initialWord.term && !currentWord?.explanation) {
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setSearchTerm(initialWord.term);
      setLoading(true);
      fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: initialWord.term, profile_id: profileId, session_id: localStorage.getItem('active_session_id') || undefined, source_language: searchSourceLang, target_language: searchTargetLang })
      })
      .then(res => res.json())
      .then(data => {
        setCurrentWord(data.word);
        setChats(data.chats);
        if (fetchWords) fetchWords();
      })
      .catch(err => {
        alert(err.message);
        setCurrentWord(null);
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, []);

  // If initialWord is provided, fetch its chats
  useEffect(() => {
    if (!initialWord) {
      setCurrentWord(null);
      setChats([]);
      setSearchTerm('');
      setLoading(false);
      return;
    }
    if (initialWord.isTemp && initialWord.term) {
      if (currentWord?.term === initialWord.term && (loading || chats.length > 0)) return;
      handleSearch(null, initialWord.term, true);
      return;
    }
    if (!initialWord.isTemp && initialWord.id) {
      if (currentWord?.id === initialWord.id && chats.length > 0) return;
      setSearchTerm(initialWord.term || '');
      setLoading(true);
      fetch(`/api/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({term: initialWord.term, profile_id: profileId, source_language: searchSourceLang, target_language: searchTargetLang}) })
        .then(r => r.json())
        .then(d => { setChats(d.chats); setCurrentWord(d.word); })
        .catch(e => console.error(e))
        .finally(() => setLoading(false))
    }
  }, [initialWord?.id, initialWord?.term]);

  useEffect(() => {
    if (currentWord && !currentWord.isTemp && currentWord.id) {
      fetch(`/api/words/${currentWord.id}/related`)
        .then(r => r.json())
        .then(setRelatedWords)
        .catch(() => setRelatedWords([]))
    } else {
      setRelatedWords([])
    }
  }, [currentWord?.id])

  // Update parent tab state for ticks and titles
  useEffect(() => {
    let title = 'New Search';
    if (searchTerm) title = searchTerm;
    if (currentWord && !currentWord.isTemp && currentWord.term) title = currentWord.term;
    onUpdateTab(tabId, { title, loading, hasData: !!currentWord && !currentWord.isTemp });
  }, [searchTerm, currentWord, loading]);

  const handleSearch = async (e, overrideTerm, isInitial = false) => {
    e?.preventDefault()
    setShowSuggestions(false)
    const termToUse = overrideTerm !== undefined ? overrideTerm : searchTerm;
    if (!termToUse.trim()) return
    
    if (!isInitial) {
      const isBusy = loading;
      const isCurrentTabBlank = !isBusy && !currentWord;
      const shouldOpenNewTab = (openInNewTab && !isCurrentTabBlank) || isBusy;
      if (shouldOpenNewTab) {
        if (onAddNewTab) {
          onAddNewTab(termToUse.trim());
        } else {
          window.open(`/search/?q=${encodeURIComponent(termToUse.trim())}`, '_blank');
        }
        setSearchTerm(currentWord?.term || '');
        return;
      }
    }
    
    setLoading(true)
    setCurrentWord({ term: termToUse, isTemp: true }) 
    setChats([])
    // Refresh history immediately so word shows in sidebar even if generation is in-flight or user navigates
    setTimeout(() => { if (fetchWords) fetchWords(); }, 250);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: termToUse, profile_id: profileId, session_id: localStorage.getItem('active_session_id') || undefined, source_language: searchSourceLang, target_language: searchTargetLang })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentWord(data.word)
      setChats(data.chats)
      if (fetchWords) fetchWords(); 
    } catch (err) {
      if (fetchWords) fetchWords();
      alert(err.message)
      setCurrentWord(null)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async (model) => {
    if (!currentWord || currentWord.isTemp) return
    setLoading(true)
    try {
      const res = await fetch(`/api/words/${currentWord.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, source_language: searchSourceLang, target_language: searchTargetLang })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentWord(data.word)
      setChats(data.chats)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChat = async (e) => {
    e?.preventDefault()
    if (!chatInput.trim() || !currentWord || currentWord.isTemp) return
    const newChat = { role: 'user', content: chatInput, id: 'temp' }
    setChats([...chats, newChat])
    setChatInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word_id: currentWord.id, content: newChat.content, profile_id: profileId })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.chats) {
        setChats(data.chats)
      } else {
        setChats(prev => [...prev.filter(c => c.id !== 'temp'), { ...newChat, id: Date.now() - 1 }, data])
      }
    } catch (err) {
      alert(err.message)
      setChats(prev => prev.filter(c => c.id !== 'temp'))
    } finally {
      setLoading(false)
    }
  }

  const updateColor = async (colorId) => {
    if (!currentWord || currentWord.isTemp) return
    const res = await fetch(`/api/words/${currentWord.id}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: colorId === currentWord.color ? null : colorId })
    })
    if (res.ok) {
      const updated = await res.json()
      setCurrentWord(updated)
      fetchWords()
    }
  }

  const updateStars = async (newStars) => {
    if (!currentWord || currentWord.isTemp) return
    const val = currentWord.stars === newStars ? 0 : newStars
    const res = await fetch(`/api/words/${currentWord.id}/stars`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars: val })
    })
    if (res.ok) {
      const updated = await res.json()
      setCurrentWord(prev => ({ ...prev, stars: updated.stars }))
      if (fetchWords) fetchWords()
    }
  }

  const [copied, setCopied] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const promptKey = profileId ? `DICT_PROMPT_${profileId}` : 'DICT_PROMPT'
  const hasCustomPrompt = Boolean(settings && settings[promptKey])
  const globalPrompt = (settings && settings.DICT_PROMPT) || (defaultSettings ? defaultSettings.DICT_PROMPT : '') || ''
  const [localPrompt, setLocalPrompt] = useState(settings?.[promptKey] || '')

  useEffect(() => {
    setLocalPrompt(settings?.[promptKey] || '')
  }, [profileId, settings, promptKey])

  const [retryingChatId, setRetryingChatId] = useState(null)

  const handleRetryChat = async (chat, model) => {
    if (!currentWord || currentWord.isTemp || !chat) return
    // If first assistant chat, regenerate word
    if (chats.length > 0 && chats[0].id === chat.id && chat.role === 'assistant') {
      return handleRegenerate(model || settings?.MAIN_MODEL)
    }
    setRetryingChatId(chat.id)
    setLoading(true)
    try {
      const res = await fetch(`/api/chats/${chat.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || undefined })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.word) setCurrentWord(data.word)
      if (data.chats) setChats(data.chats)
      if (fetchWords) fetchWords()
    } catch (err) {
      alert(err.message)
    } finally {
      setRetryingChatId(null)
      setLoading(false)
    }
  }

  const handleDeleteChat = async (chat) => {
    if (!chat || !currentWord) return
    // If first chat / initial explanation:
    if (chats.length > 0 && chats[0].id === chat.id && chat.role === 'assistant') {
      if (!confirm('Are you sure you want to delete this entire word search?')) return
      await fetch(`/api/words/${currentWord.id}`, { method: 'DELETE' })
      if (fetchWords) fetchWords()
      setCurrentWord(null)
      setChats([])
      setSearchTerm('')
      return
    }

    if (!confirm('Are you sure you want to delete this message?')) return
    try {
      const res = await fetch(`/api/chats/${chat.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.chats) {
        setChats(data.chats)
      } else {
        setChats(prev => prev.filter(c => c.id !== chat.id))
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const getFullContentToCopy = () => {
    if (!chats || chats.length === 0) return ''
    if (chats.length === 1) return chats[0]?.content || ''
    const parts = []
    if (chats[0]?.content) {
      parts.push(chats[0].content.trim())
    }
    const followups = []
    for (let i = 1; i < chats.length; i++) {
      const c = chats[i]
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
        <form onSubmit={handleSearch} className="flex items-center gap-2 relative">
          {/* History button */}
          <button
            type="button"
            onClick={() => { if (onOpenHistory) onOpenHistory(); }}
            className="h-11 px-3 flex items-center justify-center gap-1.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200/80 dark:border-gray-700/80 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
            title="Open History"
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
                value={searchSourceLang}
                onChange={e => setSearchSourceLang(e.target.value)}
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
                  const temp = searchSourceLang;
                  setSearchSourceLang(searchTargetLang);
                  setSearchTargetLang(temp);
                }}
                className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-transform duration-200 active:scale-90"
                title="Swap source and target languages"
              >
                <ArrowRightLeft size={13} />
              </button>
              <select
                value={searchTargetLang}
                onChange={e => setSearchTargetLang(e.target.value)}
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
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              ref={inputRef}
              placeholder="Search any word or expression..."
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />

            {/* Clear input button */}
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); inputRef.current?.focus(); }}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mr-1 cursor-pointer"
                title="Clear"
              >
                <X size={15} />
              </button>
            )}

            {/* Search Submit Button */}
            <button
              type="submit"
              disabled={!searchTerm.trim()}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-40 transition-all shrink-0 cursor-pointer"
            >
              {loading && (!searchTerm.trim() || searchTerm.trim() === currentWord?.term) ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
              <span className="hidden sm:inline">Search</span>
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
          {showSuggestions && searchTerm.trim() && words?.some(w => w.term.toLowerCase().startsWith(searchTerm.toLowerCase().trim())) && (
            <ul
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-16 right-16 top-full mt-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800"
            >
              {words.filter(w => w.term.toLowerCase().startsWith(searchTerm.toLowerCase().trim())).slice(0, 10).map(w => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm(w.term);
                      setShowSuggestions(false);
                      handleSearch(null, w.term);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="truncate text-sm">
                      <span className="font-bold text-blue-600 dark:text-blue-400">{w.term.substring(0, searchTerm.trim().length)}</span>
                      {w.term.substring(searchTerm.trim().length)}
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">
                      Searched {w.search_count || 1}×
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

      {currentWord ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-800 rounded-2xl shadow-sm">
          {/* Card Header */}
          <div className="p-4 sm:p-5 border-b border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-[#7aa2f7] tracking-tight">
                  {currentWord?.term || searchTerm}
                </h2>
                {(currentWord?.term || searchTerm) && (
                  <SpeechButton
                    text={currentWord?.term || searchTerm}
                    wordLang={currentWord?.language}
                    profileLang={searchSourceLang}
                    profileName={profileName}
                  />
                )}
                {!currentWord.isTemp && (
                  <button
                    onClick={async () => {
                      const newTerm = prompt("Rename word:", currentWord.term);
                      if (newTerm && newTerm !== currentWord.term) {
                        try {
                          const res = await fetch(`/api/words/${currentWord.id}/rename`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ term: newTerm })
                          });
                          if (res.ok) {
                            const updated = await res.json();
                            setCurrentWord({...currentWord, term: updated.term});
                            if (fetchWords) fetchWords();
                          }
                        } catch(e) { console.error(e) }
                      }
                    }}
                    className="p-1 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Rename Word"
                  >
                    <Edit size={16} />
                  </button>
                )}
                {currentWord.isTemp ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Loader2 className="animate-spin" size={12} /> Searching...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Ready
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors cursor-pointer flex items-center gap-1"
                  title="Click to edit language"
                  onClick={async () => {
                    const newLang = prompt('Enter correct language:', currentWord.language || '');
                    if (newLang !== null) {
                      await fetch(`/api/words/${currentWord.id}/language`, {
                        method: 'PATCH',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ language: newLang })
                      });
                      setCurrentWord({...currentWord, language: newLang});
                      if (fetchWords) fetchWords();
                    }
                  }}
                >
                  <span>{currentWord.language || '+ Add Language'}</span>
                  <Pencil size={11} className="opacity-70" />
                </button>

                {currentWord.lemma && (
                  <span className="px-2.5 py-1 rounded-lg font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200/70 dark:border-gray-700">
                    Lemma: <span className="font-semibold text-gray-900 dark:text-gray-100">{currentWord.lemma}</span>
                  </span>
                )}

                {currentWord.session_id && (
                  <button
                    type="button"
                    onClick={() => onAssignSession?.(currentWord)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors cursor-pointer"
                    title={`Session: "${currentWord.session_id}". Click to change or move session.`}
                  >
                    <Folder size={12} className="text-amber-500 dark:text-amber-400" />
                    <span>{currentWord.session_id}</span>
                  </button>
                )}

                {!currentWord.isTemp && (
                  <span className="flex items-center gap-2 text-gray-400 dark:text-gray-500 ml-1">
                    {currentWord.view_count ? (
                      <span className="flex items-center gap-1" title="Views">
                        <Eye size={13} /> {currentWord.view_count}×
                      </span>
                    ) : null}
                    <span>•</span>
                    <span className="flex items-center gap-1" title="Searches">
                      <Search size={13} /> {currentWord.search_count}×
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons on the right */}
            {!currentWord.isTemp && (
              <div className="flex gap-2 items-center shrink-0">
                <div className="relative group">
                  <button
                    className="p-2 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-xl text-gray-600 dark:text-gray-300 transition-colors flex items-center gap-1 border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Regenerate explanation"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <div className="absolute right-0 top-full pt-1.5 w-52 hidden group-hover:block z-20">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden py-1.5 divide-y divide-gray-100 dark:divide-gray-700/60">
                      <div className="px-3.5 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <div className="py-1">
                        <button
                          onClick={() => handleRegenerate(settings.MAIN_MODEL)}
                          className="block w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          Default Model
                        </button>
                        {(settings.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                          <button
                            key={m}
                            onClick={() => handleRegenerate(m.trim())}
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
                  title={chats.length > 1 ? "Copy complete output & follow-ups" : "Copy explanation"}
                >
                  {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>

                {onMoveWord && (
                  <button
                    onClick={() => onMoveWord(currentWord, () => {
                      setCurrentWord(null);
                      setChats([]);
                      setSearchTerm('');
                    })}
                    className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move word to another profile"
                  >
                    <ArrowRightLeft size={18} />
                  </button>
                )}

                {onAssignSession && (
                  <button
                    onClick={() => onAssignSession(currentWord)}
                    className="p-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move / Assign word to session"
                  >
                    <FolderPlus size={18} />
                  </button>
                )}

                {onMoveMode && (
                  <button
                    onClick={() => onMoveMode(currentWord, () => {
                      setCurrentWord(null);
                      setChats([]);
                      setSearchTerm('');
                      onUpdateTab?.(tabId, { title: 'New Search', loading: false, hasData: false, initialWord: null });
                    })}
                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-xl text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors border border-gray-200/60 dark:border-gray-700/60 cursor-pointer"
                    title="Move to another mode & regenerate"
                  >
                    <Shuffle size={18} />
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete this search?')) return;
                    await fetch(`/api/words/${currentWord.id}`, { method: 'DELETE' });
                    fetchWords();
                    setCurrentWord(null);
                    setChats([]);
                    setSearchTerm('');
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800/50 cursor-pointer"
                  title="Delete this search"
                >
                  <Trash2 size={18} />
                </button>

                {/* Color rating dots */}
                <div className="flex items-center gap-1.5 bg-gray-100/90 dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200/80 dark:border-gray-700">
                  {COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => updateColor(c.id)}
                      className={`w-5 h-5 rounded-full transition-all duration-150 cursor-pointer ${
                        currentWord.color === c.id
                          ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900 scale-110'
                          : 'opacity-75 hover:opacity-100 hover:scale-110'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={`${c.label} (${currentWord.color === c.id ? 'Active' : 'Click to set'})`}
                    />
                  ))}
                </div>

                {/* 1 to 5 Star Rating System beside Color */}
                <div className="flex items-center px-2 py-1.5 bg-gray-100/90 dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700">
                  <StarRating
                    value={currentWord.stars || 0}
                    onChange={updateStars}
                    size="md"
                  />
                </div>
              </div>
            )}
          </div>

          {/* External Dictionaries bar */}
          {!currentWord.isTemp && templates.filter(t => matchLanguage(currentWord.language, t.language)).length > 0 && (
            <div className="bg-gray-100/60 dark:bg-gray-800/50 px-4 py-2.5 border-b border-gray-200/80 dark:border-gray-800 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1 mr-1">
                <BookOpen size={13} /> External:
              </span>
              {templates.filter(t => matchLanguage(currentWord.language, t.language)).map(t => (
                <a
                  key={t.id}
                  href={t.url_template.replace('{{str}}', encodeURIComponent(currentWord.term))}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-medium transition-colors shadow-2xs"
                >
                  {t.icon_url ? <img src={t.icon_url} className="w-3.5 h-3.5 rounded-xs" alt="icon"/> : <ExternalLink size={12} />}
                  <span>{t.name || 'Dict'}</span>
                </a>
              ))}
            </div>
          )}

          {/* Related Words */}
          {!currentWord.isTemp && relatedWords.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-200/80 dark:border-gray-800 flex gap-2 overflow-x-auto items-center bg-gray-50/30 dark:bg-gray-900/30">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Related:</span>
              {relatedWords.map(rw => (
                <button
                  key={rw.id}
                  onClick={() => {
                    setCurrentWord(rw);
                    setSearchTerm(rw.term);
                    setTimeout(() => { if (fetchWords) fetchWords(); }, 250);
                    fetch(`/api/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({term: rw.term, profile_id: profileId, source_language: searchSourceLang, target_language: searchTargetLang}) })
                      .then(r => r.json())
                      .then(d => { setChats(d.chats); setCurrentWord(d.word); if (fetchWords) fetchWords(); });
                  }}
                  className="px-2.5 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 rounded-full text-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors whitespace-nowrap cursor-pointer font-medium"
                >
                  {rw.term}
                </button>
              ))}
            </div>
          )}

          {/* Chat / Explanation Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {chats.map((chat, idx) => (
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
                          currentModel={settings?.MAIN_MODEL}
                          fallbackModels={(settings?.FALLBACK_MODELS || '').split(',').map(m => m.trim()).filter(Boolean)}
                          onCopy={(text) => copyToClipboard(text)}
                          onRetry={handleRetryChat}
                          onDelete={handleDeleteChat}
                          loading={loading}
                          retryingChatId={retryingChatId}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {loading && chats.length > 0 && (
              <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2 text-sm">
                <Loader2 className="animate-spin text-blue-500" size={16} />
                <span>Generating follow-up...</span>
              </div>
            )}

            {currentWord.isTemp && chats.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                <Loader2 className="animate-spin mb-3 text-blue-500" size={32} />
                <p className="text-sm font-medium">Generating dictionary explanation...</p>
              </div>
            )}
          </div>

          {/* Follow-up question input */}
          {!currentWord.isTemp && (
            <form onSubmit={handleChat} className="p-3 border-t border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 flex gap-2 items-center">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask a follow-up question about this word..."
                className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-gray-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                disabled={loading}
              />
              <button
                disabled={loading || !chatInput.trim()}
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
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border border-blue-200/70 dark:border-blue-800/60 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400 shadow-sm">
            <Sparkles size={28} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">
            AI Dictionary & Language Intelligence
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
            Search any word or expression to get deep definitions, lemma forms, contextual examples, and grammatical nuance.
          </p>

          {(showRecentEmpty || settings?.SHOW_RECENT_EMPTY === 'true') && words && words.length > 0 && (
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-2xl p-4 shadow-sm text-left">
              <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5"><History size={13} /> Recent Lookups</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchWords?.()}
                    className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors lowercase font-normal cursor-pointer flex items-center gap-1"
                    title="Refresh recent lookups"
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
                    view all ({words.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {words.slice(0, 10).map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setSearchTerm(w.term);
                      handleSearch(null, w.term);
                    }}
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/80 text-sm text-gray-700 dark:text-gray-200 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all shadow-2xs cursor-pointer"
                  >
                    <span className="font-medium">{w.term}</span>
                    {w.language && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-mono">
                        {w.language.substring(0, 2)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Enter</kbd> to search
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
