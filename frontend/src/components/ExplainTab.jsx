import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Loader2, RefreshCw, BookOpen , Pencil, Check, X, Trash2} from 'lucide-react'

export default function ExplainTab({ tabId, fetchExplains, settings, models, onUpdateTab, initialExplain }) {
  const [currentExplain, setCurrentExplain] = useState(initialExplain || null)
  const [explainChats, setExplainChats] = useState([])
  const [explainSearchTerm, setExplainSearchTerm] = useState(initialExplain?.text || '')
  const [explainChatInput, setExplainChatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingChatId, setEditingChatId] = useState(null)
  const [editingContent, setEditingContent] = useState('')

  const handleSaveEdit = async (chatId) => {
    if (!editingContent.trim()) return
    try {
      const res = await fetch(`/api/explains/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setExplainChats(prev => prev.map(c => c.id === chatId ? updated : c))
      setEditingChatId(null)
    } catch (err) {
      alert(err.message)
    }
  }


  // If initialExplain is provided, fetch its chats
  useEffect(() => {
    if (initialExplain && !initialExplain.isTemp && initialExplain.id && explainChats.length === 0) {
      setLoading(true);
      fetch(`/api/explains/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: initialExplain.text}) })
        .then(r => r.json())
        .then(d => { setExplainChats(d.chats); setCurrentExplain(d.explain); })
        .catch(e => console.error(e))
        .finally(() => setLoading(false))
    }
  }, [initialExplain]);

  // Update parent tab state for ticks and titles
  useEffect(() => {
    let title = 'New Explain';
    if (explainSearchTerm) title = explainSearchTerm;
    if (currentExplain && !currentExplain.isTemp && currentExplain.content) title = currentExplain.content.substring(0, 30) + '...';
    onUpdateTab(tabId, { title, loading, hasData: !!currentExplain && !currentExplain.isTemp });
  }, [explainSearchTerm, currentExplain, loading]);

  const handleExplainSearch = async (e) => {
    e?.preventDefault()
    if (!explainSearchTerm.trim()) return
    setLoading(true)
    setCurrentExplain({ text: explainSearchTerm, isTemp: true })
    setExplainChats([])
    try {
      const res = await fetch('/api/explains/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: explainSearchTerm, session_id: localStorage.getItem('active_session_id') || undefined })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentExplain(data.explain)
      setExplainChats(data.chats)
      fetchExplains()
    } catch (err) {
      alert(err.message)
      setCurrentExplain(null)
    } finally {
      setLoading(false)
    }
  }

  const handleExplainRegenerate = async (model) => {
    if (!currentExplain || currentExplain.isTemp) return
    setLoading(true)
    try {
      const res = await fetch(`/api/explains/${currentExplain.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentExplain(data.explain)
      setExplainChats(data.chats)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExplainChat = async (e) => {
    e?.preventDefault()
    if (!explainChatInput.trim() || !currentExplain || currentExplain.isTemp) return
    const newChat = { role: 'user', content: explainChatInput, id: 'temp' }
    setExplainChats([...explainChats, newChat])
    setExplainChatInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/explains/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explain_id: currentExplain.id, content: newChat.content })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setExplainChats(prev => [...prev.filter(c => c.id !== 'temp'), newChat, data])
    } catch (err) {
      alert(err.message)
      setExplainChats(prev => prev.filter(c => c.id !== 'temp'))
    } finally {
      setLoading(false)
    }
  }

  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-full flex flex-col p-4 dark:text-gray-100">
      <form onSubmit={handleExplainSearch} className="flex gap-2 mb-4">
        <input 
          type="text" 
          value={explainSearchTerm}
          onChange={e => setExplainSearchTerm(e.target.value)}
          placeholder="Text to explain"
          className="flex-1 border dark:border-gray-600 dark:bg-gray-800 rounded-lg p-3 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button disabled={loading} type="submit" className="bg-blue-600 hover:bg-blue-700 transition-colors text-white px-6 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" size={20} /> : <BookOpen size={20} />}
          <span>Explain</span>
        </button>
      </form>

      {currentExplain ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-sm">
          <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                {currentExplain.text}
                {currentExplain.isTemp && <Loader2 className="animate-spin text-blue-500" size={20} />}
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {!currentExplain.isTemp && `Explained ${currentExplain.search_count} times`}
              </div>
            </div>
            {!currentExplain.isTemp && (
              <div className="flex gap-2 items-center">
                <div className="relative group">
                  <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1" title="Regenerate explain">
                    <RefreshCw size={20} />
                  </button>
                  <div className="absolute right-0 top-full pt-1 w-48 hidden group-hover:block z-10">
                    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg overflow-hidden py-1">
                      <div className="px-4 py-2 text-xs text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <button onClick={() => handleExplainRegenerate(settings.MAIN_MODEL)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                        Default Model
                      </button>
                      {(settings.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                        <button key={m} onClick={() => handleExplainRegenerate(m.trim())} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 truncate" title={m.trim()}>
                          {m.trim()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => copyToClipboard(explainChats[0]?.content)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Copy initial explanation">
                  {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                </button>
                <button 
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete this explanation?')) return;
                    await fetch(`/api/explains/${currentExplain.id}`, { method: 'DELETE' });
                    fetchExplains();
                    setCurrentExplain(null);
                    setExplainChats([]);
                    setExplainSearchTerm('');
                  }} 
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" 
                  title="Delete this explanation"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {explainChats.map((chat, idx) => (
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
            {loading && explainChats.length > 0 && <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Thinking...</div>}
            {currentExplain.isTemp && explainChats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p>Generating explain...</p>
              </div>
            )}
          </div>

          {!currentExplain.isTemp && (
            <form onSubmit={handleExplainChat} className="p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex gap-2">
              <input 
                type="text" 
                value={explainChatInput}
                onChange={e => setExplainChatInput(e.target.value)}
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
          Enter a sentence or paragraph to explain
        </div>
      )}
    </div>
  )
}
