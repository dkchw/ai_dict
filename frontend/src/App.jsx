import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Search, History, Settings as SettingsIcon, BookOpen, Share2, Trash2, ExternalLink, Moon, Sun, Loader2, RefreshCw, Library } from 'lucide-react'

// Colors for bookmarking: Red (Forgot), Orange (Hard), Yellow (Medium), Green (Easy), Blue (Research)
const COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Forgot' },
  { id: 'orange', hex: '#f97316', label: 'Hard' },
  { id: 'yellow', hex: '#eab308', label: 'Medium' },
  { id: 'green', hex: '#22c55e', label: 'Easy' },
  { id: 'blue', hex: '#3b82f6', label: 'Research' }
]

function App() {
  const [activeTab, setActiveTab] = useState('search') // search, history, flashcards, settings
  const [words, setWords] = useState([])
  const [currentWord, setCurrentWord] = useState(null)
  const [chats, setChats] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({ OPENROUTER_API_KEY: '', MAIN_MODEL: '', CHAT_MODEL: '' })
  const [templates, setTemplates] = useState([])
  const [models, setModels] = useState([])
  const [darkMode, setDarkMode] = useState(false)
  const [relatedWords, setRelatedWords] = useState([])

  useEffect(() => {
    fetchWords()
    fetchSettings()
    // Load dark mode preference
    const isDark = localStorage.getItem('darkMode') === 'true'
    setDarkMode(isDark)
  }, [])

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

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('darkMode', 'true')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('darkMode', 'false')
    }
  }, [darkMode])

  useEffect(() => {
    if (settings.OPENROUTER_API_KEY) {
      fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${settings.OPENROUTER_API_KEY}` }
      })
      .then(r => r.json())
      .then(d => {
        if (d.data) setModels(d.data.sort((a,b) => a.id.localeCompare(b.id)))
      })
      .catch(e => console.error(e))
    }
  }, [settings.OPENROUTER_API_KEY])

  const fetchWords = async () => {
    const res = await fetch('/api/words')
    if (res.ok) setWords(await res.json())
  }

  const fetchSettings = async () => {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const data = await res.json()
      setSettings(prev => ({...prev, ...data.settings}))
      setTemplates(data.templates)
    }
  }

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!searchTerm.trim()) return
    setLoading(true)
    setCurrentWord({ term: searchTerm, isTemp: true }) // Set temp word to show UI immediately
    setChats([])
    setActiveTab('search')
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
      fetchWords() // Refresh history
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

  const deleteWord = async (id) => {
    if (!confirm('Are you sure?')) return
    await fetch(`/api/words/${id}`, { method: 'DELETE' })
    if (currentWord?.id === id) {
      setCurrentWord(null)
      setChats([])
    }
    fetchWords()
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const handleHomeClick = () => {
    setCurrentWord(null)
    setSearchTerm('')
    setChats([])
    setActiveTab('search')
  }

  const renderContent = () => {
    if (activeTab === 'settings') {
      return (
        <div className="p-6 max-w-2xl mx-auto text-gray-900 dark:text-gray-100">
          <h2 className="text-2xl font-bold mb-6">Settings</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">OpenRouter API Key</label>
              <input 
                type="password" 
                value={settings.OPENROUTER_API_KEY || ''}
                onChange={e => setSettings({...settings, OPENROUTER_API_KEY: e.target.value})}
                className="w-full border dark:border-gray-600 dark:bg-gray-800 rounded p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Main Model (For initial explanation)</label>
              {models.length > 0 ? (
                <select 
                  value={settings.MAIN_MODEL || 'inclusionai/ling-3.0-flash'}
                  onChange={e => setSettings({...settings, MAIN_MODEL: e.target.value})}
                  className="w-full border dark:border-gray-600 dark:bg-gray-800 rounded p-2"
                >
                  <option value="inclusionai/ling-3.0-flash">inclusionai/ling-3.0-flash (Default)</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              ) : (
                <input 
                  type="text" 
                  value={settings.MAIN_MODEL || ''}
                  onChange={e => setSettings({...settings, MAIN_MODEL: e.target.value})}
                  className="w-full border dark:border-gray-600 dark:bg-gray-800 rounded p-2"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Chat Model (For follow up)</label>
              {models.length > 0 ? (
                <select 
                  value={settings.CHAT_MODEL || 'deepseek/deepseek-v4-flash-latest'}
                  onChange={e => setSettings({...settings, CHAT_MODEL: e.target.value})}
                  className="w-full border dark:border-gray-600 dark:bg-gray-800 rounded p-2"
                >
                  <option value="deepseek/deepseek-v4-flash-latest">deepseek/deepseek-v4-flash-latest (Default)</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              ) : (
                <input 
                  type="text" 
                  value={settings.CHAT_MODEL || ''}
                  onChange={e => setSettings({...settings, CHAT_MODEL: e.target.value})}
                  className="w-full border dark:border-gray-600 dark:bg-gray-800 rounded p-2"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Fallback Models (Comma separated)</label>
              <input 
                type="text" 
                value={settings.FALLBACK_MODELS || ''}
                placeholder="model1/a, model2/b"
                onChange={e => setSettings({...settings, FALLBACK_MODELS: e.target.value})}
                className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button 
              onClick={async () => {
                const keys = ['OPENROUTER_API_KEY', 'MAIN_MODEL', 'CHAT_MODEL', 'FALLBACK_MODELS']
                for (let key of keys) {
                  await fetch('/api/settings', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ key, value: settings[key] || '' })
                  })
                }
                alert('Saved')
              }}
              className="mt-4 bg-blue-600 hover:bg-blue-700 transition-colors text-white px-4 py-2 rounded font-medium"
            >Save Settings</button>

            <hr className="my-8 dark:border-gray-700" />
            
            <div>
              <h3 className="text-xl font-bold mb-4">External Links</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Add buttons that appear based on the word's detected language. Use <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{`{{str}}`}</code> as a placeholder for the searched word. Use "All" to show for all languages.
              </p>
              
              <div className="space-y-4 mb-6">
                {templates.map(t => (
                  <div key={t.id} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700">
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 font-medium">
                        {t.icon_url ? <img src={t.icon_url} className="w-4 h-4" alt=""/> : <ExternalLink size={14} />}
                        {t.language}
                      </div>
                      <div className="text-sm text-gray-500 truncate">{t.url_template}</div>
                    </div>
                    <button 
                      onClick={async () => {
                        await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
                        fetchSettings()
                      }}
                      className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded"
                    ><Trash2 size={20}/></button>
                  </div>
                ))}
              </div>

              <form 
                onSubmit={async (e) => {
                  e.preventDefault()
                  const fd = new FormData(e.target)
                  await fetch('/api/templates', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                      language: fd.get('language'),
                      url_template: fd.get('url_template'),
                      icon_url: fd.get('icon_url')
                    })
                  })
                  e.target.reset()
                  fetchSettings()
                }}
                className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700 space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Language</label>
                    <input name="language" required placeholder="e.g. German, All" className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Icon URL (optional)</label>
                    <input name="icon_url" placeholder="https://..." className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL Template</label>
                  <input name="url_template" required placeholder="https://dict.leo.org/german-english/{{str}}" className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2" />
                </div>
                <button type="submit" className="bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600 text-white px-4 py-2 rounded font-medium">Add Template</button>
              </form>
            </div>
          </div>
        </div>
      )
    }

    if (activeTab === 'search') {
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

              {/* External Links */}
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

              {/* Related Words */}
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
                    <div className={`max-w-[85%] rounded-xl p-4 ${chat.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 shadow-sm markdown-body dark:text-gray-200'}`}>
                      {chat.role === 'user' ? chat.content : <ReactMarkdown>{chat.content}</ReactMarkdown>}
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

    if (activeTab === 'history') {
      return (
        <div className="p-6 text-gray-900 dark:text-gray-100">
          <h2 className="text-2xl font-bold mb-6">History</h2>
          <div className="grid gap-3">
            {words.map(w => (
              <div key={w.id} className="border dark:border-gray-700 p-4 rounded-lg flex justify-between items-center bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
                <div 
                  className="flex-1 cursor-pointer" 
                  onClick={() => {
                    setCurrentWord(w)
                    setSearchTerm(w.term)
                    setActiveTab('search')
                    // Fetch chats
                    fetch(`/api/search`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({term: w.term}) })
                      .then(r => r.json())
                      .then(d => { setChats(d.chats); setCurrentWord(d.word); })
                  }}
                >
                  <div className="flex items-center gap-2">
                    {w.color && <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.find(c => c.id === w.color)?.hex}} />}
                    <span className="font-bold text-lg">{w.term}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">({w.search_count} searches)</span>
                  </div>
                  {w.lemma && <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Lemma: {w.lemma} • {w.language}</div>}
                </div>
                <button onClick={() => deleteWord(w.id)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 size={20} /></button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTab === 'flashcards') {
      return (
        <div className="p-6 max-w-4xl mx-auto h-full flex flex-col text-gray-900 dark:text-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Flashcards & Export</h2>
            <button 
              onClick={() => {
                const csv = [
                  ['Term', 'Language', 'Lemma', 'Color', 'Searches'].join(','),
                  ...words.map(w => [w.term, w.language || '', w.lemma || '', w.color || '', w.search_count].map(s => `"${s}"`).join(','))
                ].join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'ai_dict_export.csv'
                a.click()
              }}
              className="bg-green-600 hover:bg-green-700 transition-colors text-white px-4 py-2 rounded font-medium"
            >
              Export CSV
            </button>
          </div>
          
          <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
            {words.map(w => (
              <div key={w.id} className="border dark:border-gray-700 p-4 rounded-xl shadow-sm bg-white dark:bg-gray-800 hover:shadow-md transition-shadow relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full" style={{backgroundColor: COLORS.find(c => c.id === w.color)?.hex || 'transparent'}} />
                <div className="flex justify-between mb-2 pl-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{w.language}</span>
                  <span className="text-xs text-gray-400">{new Date(w.updated_at).toLocaleDateString()}</span>
                </div>
                <h3 className="text-2xl font-bold mb-2 pl-2">{w.term}</h3>
                {w.lemma && <div className="text-gray-600 dark:text-gray-400 pl-2">Lemma: {w.lemma}</div>}
              </div>
            ))}
          </div>
        </div>
      )
    }
  }

  return (
    <div className={`flex h-screen font-sans ${darkMode ? 'dark bg-gray-950' : 'bg-gray-100'}`}>
      {/* Sidebar */}
      <div className="w-16 md:w-64 bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col z-10 shadow-sm">
        <div className="h-16 flex items-center justify-between md:px-6 border-b dark:border-gray-800">
          <button 
            onClick={handleHomeClick}
            className="font-bold text-xl text-blue-600 dark:text-blue-500 tracking-tight flex-1 flex items-center justify-center md:justify-start gap-2 hover:opacity-80 transition-opacity"
            title="Home / New Search"
          >
            <Library size={24} />
            <span className="hidden md:inline">AI Dict</span>
          </button>
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="hidden md:flex p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        <nav className="flex-1 p-2 md:p-4 space-y-2">
          <NavItem icon={<Search />} label="Search" active={activeTab === 'search'} onClick={() => setActiveTab('search')} />
          <NavItem icon={<History />} label="History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <NavItem icon={<BookOpen />} label="Flashcards" active={activeTab === 'flashcards'} onClick={() => setActiveTab('flashcards')} />
        </nav>
        <div className="p-2 md:p-4 border-t dark:border-gray-800 space-y-2">
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="md:hidden w-full flex items-center justify-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <NavItem icon={<SettingsIcon />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-950">
        {renderContent()}
      </div>
    </div>
  )
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

export default App
