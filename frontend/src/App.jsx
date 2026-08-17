import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import SearchTab from './components/SearchTab'
import CompareTab from './components/CompareTab'
import { Search, History, Settings as SettingsIcon, BookOpen, Share2, Trash2, ExternalLink, Moon, Sun, Loader2, RefreshCw, Library, GitCompare, List } from 'lucide-react'

// Colors for bookmarking: Red (Forgot), Orange (Hard), Yellow (Medium), Green (Easy), Blue (Research)
const COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Forgot' },
  { id: 'orange', hex: '#f97316', label: 'Hard' },
  { id: 'yellow', hex: '#eab308', label: 'Medium' },
  { id: 'green', hex: '#22c55e', label: 'Easy' },
  { id: 'blue', hex: '#3b82f6', label: 'Research' }
]

function App() {
  const [activeTab, setActiveTab] = useState('search') // search, history, flashcards, settings, compare, compare-history
  const [words, setWords] = useState([])
  const [comparisons, setComparisons] = useState([])
  const [searchTabs, setSearchTabs] = useState([{ id: 'init', title: 'New Search', loading: false, hasData: false, initialWord: null }])
  const [activeSearchTabId, setActiveSearchTabId] = useState('init')
  
  const [compareTabs, setCompareTabs] = useState([{ id: 'init', title: 'New Compare', loading: false, hasData: false, initialComparison: null }])
  const [activeCompareTabId, setActiveCompareTabId] = useState('init')
  
  const [historySearchTerm, setHistorySearchTerm] = useState('')
  const [compareHistorySearchTerm, setCompareHistorySearchTerm] = useState('')
const [settings, setSettings] = useState({ OPENROUTER_API_KEY: '', MAIN_MODEL: '', CHAT_MODEL: '', COMPARE_MODEL: '', FALLBACK_MODELS: '' })
  const [templates, setTemplates] = useState([])
  const [models, setModels] = useState([])
  const [darkMode, setDarkMode] = useState(false)
  const [relatedWords, setRelatedWords] = useState([])

  useEffect(() => {
    fetchWords()
    fetchComparisons()
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

  const fetchComparisons = async () => {
    const res = await fetch('/api/comparisons')
    if (res.ok) setComparisons(await res.json())
  }

  

  

  

  const deleteComparison = async (id) => {
    if (!confirm('Are you sure?')) return
    await fetch(`/api/comparisons/${id}`, { method: 'DELETE' })
    fetchComparisons()
  }

  const fetchSettings = async () => {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const data = await res.json()
      setSettings(prev => ({...prev, ...data.settings}))
      setTemplates(data.templates)
    }
  }

  

  

  



  const deleteWord = async (id) => {
    if (!confirm('Are you sure?')) return
    await fetch(`/api/words/${id}`, { method: 'DELETE' })
    fetchWords()
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
        <div className="h-full overflow-y-auto">
          <div className="p-6 max-w-2xl mx-auto text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Settings</h2>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const res = await fetch('/api/settings/export')
                    const data = await res.json()
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'ai_dict_settings.json'
                    a.click()
                  }}
                  className="bg-green-600 hover:bg-green-700 transition-colors text-white px-3 py-1.5 rounded text-sm font-medium"
                >
                  Export
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 transition-colors text-white px-3 py-1.5 rounded text-sm font-medium cursor-pointer">
                  Import
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = async (e) => {
                        try {
                          const data = JSON.parse(e.target.result)
                          await fetch('/api/settings/import', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                          })
                          alert('Settings imported successfully')
                          fetchSettings()
                        } catch (err) {
                          alert('Invalid settings file')
                        }
                      }
                      reader.readAsText(file)
                    }}
                  />
                </label>
              </div>
            </div>
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
              <input 
                type="text" 
                list="main-models-list"
                value={settings.MAIN_MODEL || ''}
                onChange={e => setSettings({...settings, MAIN_MODEL: e.target.value})}
                placeholder="inclusionai/ling-3.0-flash"
                className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {models.length > 0 && (
                <datalist id="main-models-list">
                  <option value="inclusionai/ling-3.0-flash" />
                  {models.map(m => <option key={m.id} value={m.id} />)}
                </datalist>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Chat Model (For follow up)</label>
              <input 
                type="text" 
                list="chat-models-list"
                value={settings.CHAT_MODEL || ''}
                onChange={e => setSettings({...settings, CHAT_MODEL: e.target.value})}
                placeholder="~deepseek/deepseek-v4-flash-latest"
                className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {models.length > 0 && (
                <datalist id="chat-models-list">
                  <option value="~deepseek/deepseek-v4-flash-latest" />
                  {models.map(m => <option key={m.id} value={m.id} />)}
                </datalist>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Compare Model (For comparison)</label>
              <input 
                type="text" 
                list="compare-models-list"
                value={settings.COMPARE_MODEL || ''}
                onChange={e => setSettings({...settings, COMPARE_MODEL: e.target.value})}
                placeholder="~deepseek/deepseek-v4-flash-latest"
                className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {models.length > 0 && (
                <datalist id="compare-models-list">
                  <option value="~deepseek/deepseek-v4-flash-latest" />
                  {models.map(m => <option key={m.id} value={m.id} />)}
                </datalist>
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
            <div>
              <label className="block text-sm font-medium mb-2">Dictionary Prompt</label>
              <textarea 
                value={settings.DICT_PROMPT || ''}
                onChange={e => setSettings({...settings, DICT_PROMPT: e.target.value})}
                placeholder="Leave blank to use default..."
                rows="4"
                className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Comparison Prompt</label>
              <textarea 
                value={settings.COMPARE_PROMPT || ''}
                onChange={e => setSettings({...settings, COMPARE_PROMPT: e.target.value})}
                placeholder="Leave blank to use default..."
                rows="4"
                className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <button 
              onClick={async () => {
                const keys = ['OPENROUTER_API_KEY', 'MAIN_MODEL', 'CHAT_MODEL', 'COMPARE_MODEL', 'FALLBACK_MODELS', 'DICT_PROMPT', 'COMPARE_PROMPT']
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
        </div>
      )
    }

    if (activeTab === 'compare') {
      return (
        <div className="h-full flex flex-col">
          <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto">
            {compareTabs.map(t => (
              <div key={t.id} className={`flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeCompareTabId ? 'bg-white dark:bg-gray-800 font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500'}`} onClick={() => setActiveCompareTabId(t.id)}>
                <span className="truncate max-w-[150px]">{t.title}</span>
                {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500" title="Done"></div>}
                <button onClick={(e) => { e.stopPropagation(); setCompareTabs(compareTabs.filter(st => st.id !== t.id)); if(activeCompareTabId === t.id) setActiveCompareTabId(compareTabs[0]?.id || '') }} className="ml-2 text-gray-400 hover:text-red-500">&times;</button>
              </div>
            ))}
            <button onClick={() => { const id = Date.now().toString(); setCompareTabs([...compareTabs, { id, title: 'New Compare', loading: false, hasData: false, initialComparison: null }]); setActiveCompareTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 font-bold">+</button>
          </div>
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {compareTabs.map(t => (
              <div key={t.id} className={t.id === activeCompareTabId ? 'h-full block' : 'hidden'}>
                <CompareTab tabId={t.id} fetchComparisons={fetchComparisons} settings={settings} models={models} initialComparison={t.initialComparison} onUpdateTab={(id, data) => setCompareTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} />
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTab === 'search') {
      return (
        <div className="h-full flex flex-col">
          <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto">
            {searchTabs.map(t => (
              <div key={t.id} className={`flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeSearchTabId ? 'bg-white dark:bg-gray-800 font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500'}`} onClick={() => setActiveSearchTabId(t.id)}>
                <span className="truncate max-w-[150px]">{t.title}</span>
                {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500" title="Done"></div>}
                <button onClick={(e) => { e.stopPropagation(); setSearchTabs(searchTabs.filter(st => st.id !== t.id)); if(activeSearchTabId === t.id) setActiveSearchTabId(searchTabs[0]?.id || '') }} className="ml-2 text-gray-400 hover:text-red-500">&times;</button>
              </div>
            ))}
            <button onClick={() => { const id = Date.now().toString(); setSearchTabs([...searchTabs, { id, title: 'New Search', loading: false, hasData: false, initialWord: null }]); setActiveSearchTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 font-bold">+</button>
          </div>
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {searchTabs.map(t => (
              <div key={t.id} className={t.id === activeSearchTabId ? 'h-full block' : 'hidden'}>
                <SearchTab tabId={t.id} fetchWords={fetchWords} settings={settings} models={models} templates={templates} initialWord={t.initialWord} onUpdateTab={(id, data) => setSearchTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} />
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTab === 'history') {
      const filteredWords = words.filter(w => 
        w.term.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
        (w.lemma && w.lemma.toLowerCase().includes(historySearchTerm.toLowerCase()))
      );
      const totalWords = filteredWords.length;
      const totalSearches = filteredWords.reduce((sum, w) => sum + (w.search_count || 0), 0);

      return (
        <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h2 className="text-2xl font-bold">History</h2>
              <div className="relative w-full sm:w-64">
                <input 
                  type="text" 
                  value={historySearchTerm}
                  onChange={e => setHistorySearchTerm(e.target.value)}
                  placeholder="Search history..."
                  className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                />
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border dark:border-gray-700 shadow-sm items-center">
              <div className="flex items-center gap-1">
                <span className="font-medium">Total Words:</span> 
                <span className="text-gray-900 dark:text-gray-100 font-bold">{totalWords}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium">Total Searches:</span> 
                <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
              </div>
              {filteredWords.some(w => w.color) && (
                <div className="flex gap-3 items-center lg:ml-2 lg:border-l lg:pl-4 dark:border-gray-700">
                  {COLORS.map(c => {
                    const count = filteredWords.filter(w => w.color === c.id).length;
                    if (count === 0) return null;
                    return (
                      <div key={c.id} className="flex items-center gap-1.5" title={c.label}>
                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: c.hex}} />
                        <span className="text-gray-900 dark:text-gray-100 font-bold">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-3">
            {filteredWords.map(w => (
              <div key={w.id} className="border dark:border-gray-700 p-4 rounded-lg flex justify-between items-center bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
                <div 
                  className="flex-1 cursor-pointer" 
                  onClick={() => {
                    const id = Date.now().toString();
                    setSearchTabs([...searchTabs, { id, title: w.term, loading: true, hasData: false, initialWord: w }]);
                    setActiveSearchTabId(id);
                    setActiveTab('search');
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

    if (activeTab === 'compare-history') {
      const filteredComparisons = comparisons.filter(c => 
        c.terms.toLowerCase().includes(compareHistorySearchTerm.toLowerCase())
      );
      const totalComparisons = filteredComparisons.length;
      const totalSearches = filteredComparisons.reduce((sum, c) => sum + (c.search_count || 0), 0);

      return (
        <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h2 className="text-2xl font-bold">Comparison History</h2>
              <div className="relative w-full sm:w-64">
                <input 
                  type="text" 
                  value={compareHistorySearchTerm}
                  onChange={e => setCompareHistorySearchTerm(e.target.value)}
                  placeholder="Search comparison history..."
                  className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                />
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border dark:border-gray-700 shadow-sm items-center">
              <div className="flex items-center gap-1">
                <span className="font-medium">Total Comparisons:</span> 
                <span className="text-gray-900 dark:text-gray-100 font-bold">{totalComparisons}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium">Total Searches:</span> 
                <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            {filteredComparisons.map(c => (
              <div key={c.id} className="border dark:border-gray-700 p-4 rounded-lg flex justify-between items-center bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
                <div 
                  className="flex-1 cursor-pointer" 
                  onClick={() => {
                    const id = Date.now().toString();
                    setCompareTabs([...compareTabs, { id, title: c.terms, loading: true, hasData: false, initialComparison: c }]);
                    setActiveCompareTabId(id);
                    setActiveTab('compare');
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{c.terms}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">({c.search_count} searches)</span>
                  </div>
                </div>
                <button onClick={() => deleteComparison(c.id)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 size={20} /></button>
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
        <nav className="flex-1 p-2 md:p-4 space-y-2 overflow-y-auto">
          <NavItem icon={<Search />} label="Search" active={activeTab === 'search'} onClick={() => setActiveTab('search')} />
          <NavItem icon={<History />} label="History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <NavItem icon={<GitCompare />} label="Compare" active={activeTab === 'compare'} onClick={() => setActiveTab('compare')} />
          <NavItem icon={<List />} label="Compare History" active={activeTab === 'compare-history'} onClick={() => setActiveTab('compare-history')} />
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
