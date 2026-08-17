import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Share2, Loader2, RefreshCw, GitCompare , Pencil, Check, X} from 'lucide-react'

export default function CompareTab({ tabId, fetchComparisons, settings, models, onUpdateTab, initialComparison }) {
  const [currentComparison, setCurrentComparison] = useState(initialComparison || null)
  const [compareChats, setCompareChats] = useState([])
  const [comparisonSearchTerm, setComparisonSearchTerm] = useState(initialComparison?.terms || '')
  const [compareChatInput, setCompareChatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingChatId, setEditingChatId] = useState(null)
  const [editingContent, setEditingContent] = useState('')

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
    if (initialComparison && !initialComparison.isTemp && initialComparison.id && compareChats.length === 0) {
      setLoading(true);
      fetch(`/api/comparisons/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({terms: initialComparison.terms}) })
        .then(r => r.json())
        .then(d => { setCompareChats(d.chats); setCurrentComparison(d.comparison); })
        .catch(e => console.error(e))
        .finally(() => setLoading(false))
    }
  }, [initialComparison]);

  // Update parent tab state for ticks and titles
  useEffect(() => {
    let title = 'New Compare';
    if (comparisonSearchTerm) title = comparisonSearchTerm;
    if (currentComparison && !currentComparison.isTemp) title = currentComparison.terms;
    onUpdateTab(tabId, { title, loading, hasData: !!currentComparison && !currentComparison.isTemp });
  }, [comparisonSearchTerm, currentComparison, loading]);

  const handleCompareSearch = async (e) => {
    e?.preventDefault()
    if (!comparisonSearchTerm.trim()) return
    setLoading(true)
    setCurrentComparison({ terms: comparisonSearchTerm, isTemp: true })
    setCompareChats([])
    try {
      const res = await fetch('/api/comparisons/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: comparisonSearchTerm })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentComparison(data.comparison)
      setCompareChats(data.chats)
      fetchComparisons()
    } catch (err) {
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
        body: JSON.stringify({ model })
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
        body: JSON.stringify({ comparison_id: currentComparison.id, content: newChat.content })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCompareChats(prev => [...prev.filter(c => c.id !== 'temp'), newChat, data])
    } catch (err) {
      alert(err.message)
      setCompareChats(prev => prev.filter(c => c.id !== 'temp'))
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="h-full flex flex-col p-4 dark:text-gray-100">
      <form onSubmit={handleCompareSearch} className="flex gap-2 mb-4">
        <input 
          type="text" 
          value={comparisonSearchTerm}
          onChange={e => setComparisonSearchTerm(e.target.value)}
          placeholder="Words to compare (e.g. affect, effect)"
          className="flex-1 border dark:border-gray-600 dark:bg-gray-800 rounded-lg p-3 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button disabled={loading} type="submit" className="bg-blue-600 hover:bg-blue-700 transition-colors text-white px-6 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" size={20} /> : <GitCompare size={20} />}
          <span>Compare</span>
        </button>
      </form>

      {currentComparison ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-sm">
          <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                {currentComparison.terms}
                {currentComparison.isTemp && <Loader2 className="animate-spin text-blue-500" size={20} />}
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {!currentComparison.isTemp && `Compared ${currentComparison.search_count} times`}
              </div>
            </div>
            {!currentComparison.isTemp && (
              <div className="flex gap-2 items-center">
                <div className="relative group">
                  <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1" title="Regenerate comparison">
                    <RefreshCw size={20} />
                  </button>
                  <div className="absolute right-0 top-full pt-1 w-48 hidden group-hover:block z-10">
                    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg overflow-hidden py-1">
                      <div className="px-4 py-2 text-xs text-gray-500 font-bold uppercase tracking-wider">Regenerate with:</div>
                      <button onClick={() => handleCompareRegenerate(settings.COMPARE_MODEL || settings.MAIN_MODEL)} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                        Default Model
                      </button>
                      {(settings.FALLBACK_MODELS || '').split(',').filter(m => m.trim()).map(m => (
                        <button key={m} onClick={() => handleCompareRegenerate(m.trim())} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 truncate" title={m.trim()}>
                          {m.trim()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => copyToClipboard(compareChats[0]?.content)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Copy comparison">
                  <Share2 size={20} />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {compareChats.map((chat, idx) => (
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
            {loading && compareChats.length > 0 && <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Thinking...</div>}
            {currentComparison.isTemp && compareChats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p>Generating comparison...</p>
              </div>
            )}
          </div>

          {!currentComparison.isTemp && (
            <form onSubmit={handleCompareChat} className="p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex gap-2">
              <input 
                type="text" 
                value={compareChatInput}
                onChange={e => setCompareChatInput(e.target.value)}
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
          Enter words separated by commas to compare
        </div>
      )}
    </div>
  )
}
