import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Search, Share2, ExternalLink, Loader2, RefreshCw , Pencil, Check, X} from 'lucide-react'

export const COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Forgot' },
  { id: 'orange', hex: '#f97316', label: 'Hard' },
  { id: 'yellow', hex: '#eab308', label: 'Medium' },
  { id: 'green', hex: '#22c55e', label: 'Easy' },
  { id: 'blue', hex: '#3b82f6', label: 'Research' }
]

export default function SearchTab({ tabId, fetchWords, settings, models, templates, onUpdateTab, initialWord }) {
  const [currentWord, setCurrentWord] = useState(initialWord || null)
  const [chats, setChats] = useState([])
  const [searchTerm, setSearchTerm] = useState(initialWord?.term || '')
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(false)
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

  // If initialWord is provided, fetch its chats
  useEffect(() => {
    if (initialWord && !initialWord.isTemp && initialWord.id && chats.length === 0) {
      setLoading(true);
      fetch(`/api/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({term: initialWord.term}) })
        .then(r => r.json())
        .then(d => { setChats(d.chats); setCurrentWord(d.word); })
        .catch(e => console.error(e))
        .finally(() => setLoading(false))
    }
  }, [initialWord]);

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
    if (currentWord && !currentWord.isTemp) title = currentWord.term;
    onUpdateTab(tabId, { title, loading, hasData: !!currentWord && !currentWord.isTemp });
  }, [searchTerm, currentWord, loading]);

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!searchTerm.trim()) return
    setLoading(true)
    setCurrentWord({ term: searchTerm, isTemp: true }) 
    setChats([])
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: searchTerm })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentWord(data.word)
      setChats(data.chats)
      fetchWords() 
    } catch (err) {
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
        body: JSON.stringify({ model })
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
        body: JSON.stringify({ word_id: currentWord.id, content: newChat.content })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setChats(prev => [...prev.filter(c => c.id !== 'temp'), newChat, data])
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="h-full flex flex-col p-4 dark:text-gray-100">
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input 
          type="text" 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search word (e.g. Hund {de})"
          className="flex-1 border dark:border-gray-600 dark:bg-gray-800 rounded-lg p-3 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button disabled={loading} type="submit" className="bg-blue-600 hover:bg-blue-700 transition-colors text-white px-6 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
          <span>Search</span>
        </button>
      </form>

      {currentWord ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-sm">
          <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                {currentWord.term}
                {currentWord.isTemp && <Loader2 className="animate-spin text-blue-500" size={20} />}
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {currentWord.language && <span className="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded mr-2 text-gray-800 dark:text-gray-200">{currentWord.language}</span>}
                {currentWord.lemma && <span>Lemma: {currentWord.lemma} • </span>}
                {!currentWord.isTemp && `Searched ${currentWord.search_count} times`}
              </div>
            </div>
            {!currentWord.isTemp && (
              <div className="flex gap-2 items-center">
                <div className="relative group">
                  <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1" title="Regenerate explanation">
                    <RefreshCw size={20} />
                  </button>
                  <div className="absolute right-0 top-full pt-1 w-48 hidden group-hover:block z-10">
                    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg overflow-hidden py-1">
                      <div className="px-4 py-2 text-xs text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <button onClick={() => handleRegenerate(settings.MAIN_MODEL)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                        Default Model
                      </button>
                      {(settings.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                        <button key={m} onClick={() => handleRegenerate(m.trim())} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 truncate" title={m.trim()}>
                          {m.trim()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => copyToClipboard(chats[0]?.content)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Copy initial explanation">
                  <Share2 size={20} />
                </button>
                <div className="flex gap-1 bg-gray-200 dark:bg-gray-700 p-1 rounded">
                  {COLORS.map(c => (
                    <button 
                      key={c.id} 
                      onClick={() => updateColor(c.id)}
                      className={`w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 transition-transform ${currentWord.color === c.id ? 'scale-125' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {!currentWord.isTemp && templates.filter(t => t.language === 'all' || t.language.toLowerCase() === currentWord.language?.toLowerCase()).length > 0 && (
            <div className="p-2 border-b dark:border-gray-700 flex gap-2">
              {templates.filter(t => t.language === 'all' || t.language.toLowerCase() === currentWord.language?.toLowerCase()).map(t => (
                <a 
                  key={t.id} 
                  href={t.url_template.replace('{{str}}', encodeURIComponent(currentWord.term))} 
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm transition-colors"
                >
                  {t.icon_url ? <img src={t.icon_url} className="w-4 h-4" alt="icon"/> : <ExternalLink size={14} />}
                  Dict
                </a>
              ))}
            </div>
          )}

          {!currentWord.isTemp && relatedWords.length > 0 && (
            <div className="p-2 border-b dark:border-gray-700 flex gap-2 overflow-x-auto items-center">
              <span className="text-xs font-bold text-gray-500 uppercase ml-2">Related:</span>
              {relatedWords.map(rw => (
                <button 
                  key={rw.id}
                  onClick={() => {
                    setCurrentWord(rw)
                    setSearchTerm(rw.term)
                    fetch(`/api/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({term: rw.term}) })
                      .then(r => r.json())
                      .then(d => { setChats(d.chats); setCurrentWord(d.word); })
                  }}
                  className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors whitespace-nowrap"
                >
                  {rw.term}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {chats.map((chat, idx) => (
              <div key={chat.id || idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-xl p-4 relative group ${chat.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 shadow-sm markdown-body dark:text-gray-200'}`}>
                  {editingChatId === chat.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea 
                        value={editingContent}
                        onChange={e => setEditingContent(e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border dark:border-gray-600 rounded p-2 text-sm min-h-[200px]"
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingChatId(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"><X size={16}/></button>
                        <button onClick={() => handleSaveEdit(chat.id)} className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded"><Check size={16}/></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {chat.role === 'user' ? chat.content : <ReactMarkdown remarkPlugins={[remarkGfm]}>{chat.content}</ReactMarkdown>}
                      {chat.role !== 'user' && chat.id !== 'temp' && (
                        <button 
                          onClick={() => { setEditingChatId(chat.id); setEditingContent(chat.content); }}
                          className="absolute top-2 right-2 p-1.5 bg-gray-100 dark:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 dark:hover:bg-gray-600"
                          title="Edit response"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && chats.length > 0 && <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Thinking...</div>}
            {currentWord.isTemp && chats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p>Generating explanation...</p>
              </div>
            )}
          </div>

          {!currentWord.isTemp && (
            <form onSubmit={handleChat} className="p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask a follow up question..."
                className="flex-1 border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button disabled={loading} type="submit" className="bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors text-white px-4 rounded font-medium disabled:opacity-50">Send</button>
            </form>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Search for a word to begin
        </div>
      )}
    </div>
  )
}
