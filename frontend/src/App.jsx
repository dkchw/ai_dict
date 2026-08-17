import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SearchTab from './components/SearchTab'
import CompareTab from './components/CompareTab'
import ExplainTab from './components/ExplainTab'
import { Search, History, Settings as SettingsIcon, BookOpen, Share2, Trash2, ExternalLink, Moon, Sun, Loader2, RefreshCw, Library, GitCompare, List , Menu, MessageSquare, ScanLine, Palette, Edit } from 'lucide-react'

// Colors for bookmarking: Red (Forgot), Orange (Hard), Yellow (Medium), Green (Easy), Blue (Research)
const COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Forgot' },
  { id: 'orange', hex: '#f97316', label: 'Hard' },
  { id: 'yellow', hex: '#eab308', label: 'Medium' },
  { id: 'green', hex: '#22c55e', label: 'Easy' },
  { id: 'blue', hex: '#3b82f6', label: 'Research' }
]

function HoverReviewPopup({ content, popupSize, setPopupSize }) {
  const popupRef = useRef(null);
  const containerRef = useRef(null);
  const [position, setPosition] = useState('bottom');
  const [leftOffset, setLeftOffset] = useState(0);

  useEffect(() => {
    if (containerRef.current && popupRef.current) {
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const popupHeight = popupRef.current.offsetHeight || 300;
      const popupWidth = popupRef.current.offsetWidth || 600;
      
      if (parentRect.bottom + popupHeight > windowHeight && parentRect.top > popupHeight) {
        setPosition('top');
      } else {
        setPosition('bottom');
      }

      const overflowRight = (parentRect.left + popupWidth) - (windowWidth - 20);
      if (overflowRight > 0) {
        setLeftOffset(-overflowRight);
      } else {
        setLeftOffset(0);
      }
    }
  }, [content]);

  const handleMouseUp = () => {
    if (popupRef.current) {
      const w = popupRef.current.style.width;
      const h = popupRef.current.style.height;
      if (w || h) {
        setPopupSize({ w, h });
        localStorage.setItem('hoverPopupSize', JSON.stringify({ w, h }));
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`absolute z-50 ${position === 'top' ? 'bottom-full pb-2' : 'top-full pt-2'}`}
      style={{ left: leftOffset }}
    >
      <div 
        ref={popupRef}
        onMouseUp={handleMouseUp}
        style={{ width: popupSize?.w || 'min(600px, 90vw)', height: popupSize?.h || 'auto' }}
        className="p-5 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-2xl text-sm overflow-auto custom-scrollbar cursor-auto resize min-w-[300px] min-h-[150px] max-w-[90vw] max-h-[80vh]" 
        onClick={e => e.stopPropagation()}
      >
        {content ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex justify-center p-4"><Loader2 className="animate-spin text-gray-400" /></div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('search') // search, history, flashcards, settings, compare, compare-history, explain, explain-history
  const [words, setWords] = useState([])
  const [comparisons, setComparisons] = useState([])
  const [explains, setExplains] = useState([])
  
  const [searchTabs, setSearchTabs] = useState([
    { id: 'history', title: 'History' },
    { id: 'init', title: 'New Search', loading: false, hasData: false, initialWord: null }
  ])
  const [activeSearchTabId, setActiveSearchTabId] = useState('init')
  
  const [compareTabs, setCompareTabs] = useState([
    { id: 'history', title: 'History' },
    { id: 'init', title: 'New Compare', loading: false, hasData: false, initialComparison: null }
  ])
  const [activeCompareTabId, setActiveCompareTabId] = useState('init')
  
  const [explainTabs, setExplainTabs] = useState([
    { id: 'history', title: 'History' },
    { id: 'init', title: 'New Explain', loading: false, hasData: false, initialExplain: null }
  ])
  const [activeExplainTabId, setActiveExplainTabId] = useState('init')
  
  const [historySearchTerm, setHistorySearchTerm] = useState('')
  const [compareHistorySearchTerm, setCompareHistorySearchTerm] = useState('')
  const [explainHistorySearchTerm, setExplainHistorySearchTerm] = useState('')
  
  const [settings, setSettings] = useState({ OPENROUTER_API_KEY: '', MAIN_MODEL: '', CHAT_MODEL: '', COMPARE_MODEL: '', FALLBACK_MODELS: '' })
  const [templates, setTemplates] = useState([])
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [models, setModels] = useState([])
  const [theme, setTheme] = useState('tokyonight')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [historySort, setHistorySort] = useState('date')
  
  const [hoverReviewMode, setHoverReviewMode] = useState(() => {
    const saved = localStorage.getItem('hoverReviewMode')
    return saved !== null ? JSON.parse(saved) : true
  })
  
  const toggleHoverReviewMode = () => {
    const next = !hoverReviewMode
    setHoverReviewMode(next)
    localStorage.setItem('hoverReviewMode', JSON.stringify(next))
  }
  
  const [hoveredPreviewId, setHoveredPreviewId] = useState(null)
  const [previewContent, setPreviewContent] = useState({})
  
  const [popupSize, setPopupSize] = useState(() => {
    const saved = localStorage.getItem('hoverPopupSize')
    return saved ? JSON.parse(saved) : null
  })
  
  const handleHover = async (id, type) => {
    if (!hoverReviewMode) return;
    setHoveredPreviewId(id);
    if (!previewContent[id]) {
      const endpoint = type === 'search' ? `/api/words/${id}/preview` : type === 'compare' ? `/api/comparisons/${id}/preview` : `/api/explains/${id}/preview`;
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          setPreviewContent(prev => ({...prev, [id]: data.content}));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  const getGroupedByDay = (items, sortKey) => {
    if (historySort === 'count') {
      return { 'All': [...items].sort((a,b) => (b.search_count || 0) - (a.search_count || 0)) };
    }
    if (historySort === 'alpha') {
      return { 'All': [...items].sort((a,b) => (a[sortKey] || '').localeCompare(b[sortKey] || '')) };
    }
    
    const sorted = [...items].sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    const groups = {};
    sorted.forEach(item => {
      let key;
      if (item.session_id) {
        key = item.session_id;
      } else {
        const d = new Date(item.updated_at || item.created_at || Date.now());
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        if (d.toDateString() === today.toDateString()) key = 'Today';
        else if (d.toDateString() === yesterday.toDateString()) key = 'Yesterday';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }

  useEffect(() => {
    fetchWords()
    fetchComparisons()
    fetchExplains()
    fetchSettings()
    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'tokyonight'
    setTheme(savedTheme)
  }, [])

  useEffect(() => {
    let emoji = '📖';
    let title = 'AI Dict';
    if (activeTab === 'search') {
      const tab = searchTabs.find(t => t.id === activeSearchTabId);
      if (tab) title = tab.title;
      emoji = tab?.id === 'history' ? '🕒' : '📖';
    } else if (activeTab === 'compare') {
      const tab = compareTabs.find(t => t.id === activeCompareTabId);
      if (tab) title = tab.title;
      emoji = tab?.id === 'history' ? '🕒' : '⚖️';
    } else if (activeTab === 'explain') {
      const tab = explainTabs.find(t => t.id === activeExplainTabId);
      if (tab) title = tab.title;
      emoji = tab?.id === 'history' ? '🕒' : '💬';
    } else if (activeTab === 'settings') {
      title = 'Settings';
      emoji = '⚙️';
    } else if (activeTab === 'flashcards') {
      title = 'Flashcards';
      emoji = '🃏';
    }
    document.title = `${emoji} ${title} | AI Dict`;
  }, [activeTab, activeSearchTabId, activeCompareTabId, activeExplainTabId, searchTabs, compareTabs, explainTabs]);

  useEffect(() => {
    const isDark = theme !== 'light';
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    
    document.documentElement.removeAttribute('data-theme')
    if (theme !== 'light' && theme !== 'dark') {
      document.documentElement.setAttribute('data-theme', theme)
    }
    localStorage.setItem('theme', theme)
  }, [theme])

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

  const fetchExplains = async () => {
    const res = await fetch('/api/explains')
    if (res.ok) setExplains(await res.json())
  }

  const deleteComparison = async (id) => {
    if (!confirm('Are you sure?')) return
    await fetch(`/api/comparisons/${id}`, { method: 'DELETE' })
    fetchComparisons()
  }

  const deleteExplain = async (id) => {
    if (!confirm('Are you sure?')) return
    await fetch(`/api/explains/${id}`, { method: 'DELETE' })
    fetchExplains()
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

  const updateLanguage = async (id, currentLanguage) => {
    const newLang = prompt('Enter correct language (e.g. German):', currentLanguage || '');
    if (newLang !== null) {
      await fetch(`/api/words/${id}/language`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ language: newLang })
      });
      fetchWords();
    }
  }

  const handleHomeClick = () => {
    handleSearchClick()
  }

  const handleSearchClick = () => {
    const id = Date.now().toString()
    setSearchTabs([...searchTabs, { id, title: 'New Search', loading: false, hasData: false, initialWord: null }])
    setActiveSearchTabId(id)
    setActiveTab('search')
  }

  const handleCompareClick = () => {
    const id = Date.now().toString()
    setCompareTabs([...compareTabs, { id, title: 'New Compare', loading: false, hasData: false, initialComparison: null }])
    setActiveCompareTabId(id)
    setActiveTab('compare')
  }

  const handleExplainClick = () => {
    const id = Date.now().toString()
    setExplainTabs([...explainTabs, { id, title: 'New Explain', loading: false, hasData: false, initialExplain: null }])
    setActiveExplainTabId(id)
    setActiveTab('explain')
  }

  const exportData = async (type) => {
    const res = await fetch(`/api/data/export?type=${type}`)
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai_dict_data_${type}.json`
    a.click()
  }

  const importData = async (type, e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result)
        await fetch(`/api/data/import?type=${type}`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(data)
        })
        alert(`${type} imported successfully`)
        fetchWords()
        fetchExplains()
        fetchComparisons()
      } catch (err) {
        alert('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const clearData = async (type) => {
    if (!confirm(`Are you sure you want to delete ALL ${type} history? This cannot be undone.`)) return
    await fetch(`/api/data/clear?type=${type}`, { method: 'DELETE' })
    fetchWords()
    fetchExplains()
    fetchComparisons()
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
              <label className="block text-sm font-medium mb-2">App Theme</label>
              <div className="flex items-center gap-2">
                <Palette size={20} className="text-gray-500" />
                <select 
                  value={theme}
                  onChange={e => setTheme(e.target.value)}
                  className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="tokyonight">Tokyo Night (Default)</option>
                  <option value="nord">Nord</option>
                  <option value="dracula">Dracula</option>
                </select>
              </div>
            </div>
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
              <h3 className="text-xl font-bold mb-4">Data Management (All History)</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Export, import, or clear all of your history (Words, Explains, and Comparisons) collectively.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => exportData('all')}
                  className="bg-green-600 hover:bg-green-700 transition-colors text-white px-3 py-1.5 rounded text-sm font-medium"
                >
                  Export All Data
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 transition-colors text-white px-3 py-1.5 rounded text-sm font-medium cursor-pointer">
                  Import All Data
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => importData('all', e)}
                  />
                </label>
                <button
                  onClick={() => clearData('all')}
                  className="bg-red-600 hover:bg-red-700 transition-colors text-white px-3 py-1.5 rounded text-sm font-medium"
                >
                  Clear All Data
                </button>
              </div>
            </div>

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
                        {t.name || 'Dict'} <span className="text-sm font-normal text-gray-500">({t.language})</span>
                      </div>
                      <div className="text-sm text-gray-500 truncate">{t.url_template}</div>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setEditingTemplate(t)}
                        className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-2 rounded"
                      ><Edit size={20}/></button>
                      <button 
                        onClick={async () => {
                          await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
                          if (editingTemplate?.id === t.id) setEditingTemplate(null)
                          fetchSettings()
                        }}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded"
                      ><Trash2 size={20}/></button>
                    </div>
                  </div>
                ))}
              </div>

              <form 
                id="template-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const fd = new FormData(e.target)
                  const body = {
                    name: fd.get('name') || 'Dict',
                    language: fd.get('language'),
                    url_template: fd.get('url_template'),
                    icon_url: fd.get('icon_url')
                  }
                  if (editingTemplate) {
                    await fetch(`/api/templates/${editingTemplate.id}`, {
                      method: 'PUT',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify(body)
                    })
                    setEditingTemplate(null)
                  } else {
                    await fetch('/api/templates', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify(body)
                    })
                  }
                  e.target.reset()
                  fetchSettings()
                }}
                className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold">{editingTemplate ? 'Edit Template' : 'Add New Template'}</h4>
                  {editingTemplate && (
                    <button type="button" onClick={() => { setEditingTemplate(null); document.getElementById('template-form').reset(); }} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input name="name" required placeholder="e.g. Leo Dict" defaultValue={editingTemplate?.name || 'Dict'} key={`name-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Language</label>
                    <input name="language" required placeholder="e.g. German, All" defaultValue={editingTemplate?.language || ''} key={`lang-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Icon URL (optional)</label>
                    <input name="icon_url" placeholder="https://..." defaultValue={editingTemplate?.icon_url || ''} key={`icon-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL Template</label>
                  <input name="url_template" required placeholder="https://dict.leo.org/german-english/{{str}}" defaultValue={editingTemplate?.url_template || ''} key={`url-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded p-2" />
                </div>
                <button type="submit" className="bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600 text-white px-4 py-2 rounded font-medium">{editingTemplate ? 'Update Template' : 'Add Template'}</button>
              </form>
            </div>
          </div>
        </div>
        </div>
      )
    }

    if (activeTab === 'compare') {
      const filteredComparisons = comparisons.filter(c => 
        c.terms.toLowerCase().includes(compareHistorySearchTerm.toLowerCase())
      );
      const totalComparisons = filteredComparisons.length;
      const totalSearches = filteredComparisons.reduce((sum, c) => sum + (c.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
            {compareTabs.map(t => (
              <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeCompareTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveCompareTabId(t.id)}>
                {t.id === 'history' ? <History size={14} /> : <GitCompare size={14} />}
                <span className="truncate max-w-[150px]">{t.title || 'New Compare'}</span>
                {t.id !== 'history' && (
                  <>
                    {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                    {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                    <button onClick={(e) => { e.stopPropagation(); setCompareTabs(compareTabs.filter(st => st.id !== t.id)); if(activeCompareTabId === t.id) setActiveCompareTabId(compareTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                  </>
                )}
              </div>
            ))}
            <button onClick={() => { const id = Date.now().toString(); setCompareTabs([...compareTabs, { id, title: 'New Compare', loading: false, hasData: false, initialComparison: null }]); setActiveCompareTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
          </div>
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {compareTabs.map(t => (
              <div key={t.id} className={t.id === activeCompareTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
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
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => toggleHoverReviewMode()}
                            className={`p-1.5 rounded-lg flex items-center gap-1.5 text-sm border shadow-sm transition-colors ${hoverReviewMode ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:border-blue-600 dark:text-white dark:hover:bg-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                            title="Toggle Quick Review on Hover"
                          >
                            <ScanLine size={16} /> 
                            <span className="hidden sm:inline font-medium">Hover Review</span>
                          </button>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-2">Sort by:</span>
                          <select 
                            value={historySort} 
                            onChange={e => setHistorySort(e.target.value)} 
                            className="border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                          >
                            <option value="date">Date (Grouped)</option>
                            <option value="count">Most Searched</option>
                            <option value="alpha">Alphabetical</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border dark:border-gray-700 shadow-sm items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Total Comparisons:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalComparisons}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Total Searches:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => {
                              const sessionId = "Session " + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              localStorage.setItem('active_session_id', sessionId);
                              alert("Started " + sessionId);
                            }} className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors">New Session</button>
                            <button onClick={() => exportData('comparisons')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('comparisons', e)} />
                          </label>
                          <button onClick={() => clearData('comparisons')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-6">
                      {Object.entries(getGroupedByDay(filteredComparisons, 'terms')).map(([groupName, groupItems]) => (
                        <div key={groupName}>
                          {historySort === 'date' && (
                              <div className="flex items-center justify-between mb-3 border-b dark:border-gray-800 pb-1">
                                <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">{groupName}</h3>
                                {groupName.startsWith('Session') && (
                                  <button 
                                    onClick={async () => {
                                      if(!confirm(`Delete all data in ${groupName}?`)) return;
                                      await fetch(`/api/sessions/${groupName}`, { method: 'DELETE' });
                                      if(localStorage.getItem('active_session_id') === groupName) localStorage.removeItem('active_session_id');
                                      fetchWords();
                                      fetchComparisons();
                                      fetchExplains();
                                    }}
                                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                                  >
                                    Delete Group
                                  </button>
                                )}
                              </div>
                            )}
                          <div className="grid gap-3">
                            {groupItems.map(c => (
                              <div key={c.id} className="border dark:border-gray-700 p-4 rounded-lg flex justify-between items-center bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow relative">
                                <div 
                                  className="flex-1 cursor-pointer" 
                                  onClick={() => {
                                    const id = Date.now().toString();
                                    setCompareTabs([...compareTabs, { id, title: c.terms, loading: true, hasData: false, initialComparison: c }]);
                                    setActiveCompareTabId(id);
                                  }}
                                >
                                  <div 
                                    className="flex items-center gap-2 w-fit relative"
                                    onMouseEnter={() => handleHover(c.id, 'compare')}
                                    onMouseLeave={() => setHoveredPreviewId(null)}
                                  >
                                    <span className="font-bold text-lg">{c.terms}</span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm">({c.search_count} searches)</span>
                                    {hoverReviewMode && hoveredPreviewId === c.id && (
                                      <HoverReviewPopup content={previewContent[c.id]} popupSize={popupSize} setPopupSize={setPopupSize} />
                                    )}
                                  </div>
                                </div>
                                <button onClick={() => deleteComparison(c.id)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 size={20} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <CompareTab tabId={t.id} fetchComparisons={fetchComparisons} settings={settings} models={models} initialComparison={t.initialComparison} onUpdateTab={(id, data) => setCompareTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} />
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTab === 'search') {
      const filteredWords = words.filter(w => 
        w.term.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
        w.lemma?.toLowerCase().includes(historySearchTerm.toLowerCase())
      );
      const totalWords = filteredWords.length;
      const totalSearches = filteredWords.reduce((sum, w) => sum + (w.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
            {searchTabs.map(t => (
              <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeSearchTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveSearchTabId(t.id)}>
                {t.id === 'history' ? <History size={14} /> : <BookOpen size={14} />}
                <span className="truncate max-w-[150px]">{t.title || 'New Search'}</span>
                {t.id !== 'history' && (
                  <>
                    {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                    {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                    <button onClick={(e) => { e.stopPropagation(); setSearchTabs(searchTabs.filter(st => st.id !== t.id)); if(activeSearchTabId === t.id) setActiveSearchTabId(searchTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                  </>
                )}
              </div>
            ))}
            <button onClick={() => { const id = Date.now().toString(); setSearchTabs([...searchTabs, { id, title: 'New Search', loading: false, hasData: false, initialWord: null }]); setActiveSearchTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
          </div>
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {searchTabs.map(t => (
              <div key={t.id} className={t.id === activeSearchTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                    <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <h2 className="text-2xl font-bold">Search History</h2>
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
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => toggleHoverReviewMode()}
                              className={`p-1.5 rounded-lg flex items-center gap-1.5 text-sm border shadow-sm transition-colors ${hoverReviewMode ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:border-blue-600 dark:text-white dark:hover:bg-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                              title="Toggle Quick Review on Hover"
                            >
                              <ScanLine size={16} /> 
                              <span className="hidden sm:inline font-medium">Hover Review</span>
                            </button>
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-2">Sort by:</span>
                            <select 
                              value={historySort} 
                              onChange={e => setHistorySort(e.target.value)} 
                              className="border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                            >
                              <option value="date">Date (Grouped)</option>
                              <option value="count">Most Searched</option>
                              <option value="alpha">Alphabetical</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border dark:border-gray-700 shadow-sm items-center justify-between w-full">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Total Words:</span> 
                              <span className="text-gray-900 dark:text-gray-100 font-bold">{totalWords}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Total Searches:</span> 
                              <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => {
                              const sessionId = "Session " + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              localStorage.setItem('active_session_id', sessionId);
                              alert("Started " + sessionId);
                            }} className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors">New Session</button>
                            <button onClick={() => exportData('words')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                            <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                              Import
                              <input type="file" accept=".json" className="hidden" onChange={(e) => importData('words', e)} />
                            </label>
                            <button onClick={() => clearData('words')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-6">
                        {Object.entries(getGroupedByDay(filteredWords, 'term')).map(([groupName, groupItems]) => (
                          <div key={groupName}>
                            {historySort === 'date' && (
                              <div className="flex items-center justify-between mb-3 border-b dark:border-gray-800 pb-1">
                                <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">{groupName}</h3>
                                {groupName.startsWith('Session') && (
                                  <button 
                                    onClick={async () => {
                                      if(!confirm(`Delete all data in ${groupName}?`)) return;
                                      await fetch(`/api/sessions/${groupName}`, { method: 'DELETE' });
                                      if(localStorage.getItem('active_session_id') === groupName) localStorage.removeItem('active_session_id');
                                      fetchWords();
                                      fetchComparisons();
                                      fetchExplains();
                                    }}
                                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                                  >
                                    Delete Group
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="grid gap-3">
                              {groupItems.map(w => (
                                <div key={w.id} className="border dark:border-gray-700 p-4 rounded-lg flex justify-between items-center bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow relative">
                                  <div 
                                    className="flex-1 cursor-pointer" 
                                    onClick={() => {
                                      const id = Date.now().toString();
                                      setSearchTabs([...searchTabs, { id, title: w.term, loading: true, hasData: false, initialWord: w }]);
                                      setActiveSearchTabId(id);
                                    }}
                                  >
                                    <div 
                                      className="flex items-center gap-2 w-fit relative"
                                      onMouseEnter={() => handleHover(w.id, 'search')}
                                      onMouseLeave={() => setHoveredPreviewId(null)}
                                    >
                                      {w.color && (
                                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS.find(c => c.id === w.color)?.hex || w.color }} title={COLORS.find(c => c.id === w.color)?.label} />
                                      )}
                                      <span className="font-bold text-lg">{w.term}</span>
                                      <span className="text-gray-500 dark:text-gray-400 text-sm">({w.search_count} searches)</span>
                                      {hoverReviewMode && hoveredPreviewId === w.id && (
                                        <HoverReviewPopup content={previewContent[w.id]} popupSize={popupSize} setPopupSize={setPopupSize} />
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center flex-wrap gap-2">
                                      <span 
                                        className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                        title="Click to edit language"
                                        onClick={(e) => { e.stopPropagation(); updateLanguage(w.id, w.language); }}
                                      >
                                        {w.language || '+ Add Language'}
                                      </span>
                                      {w.lemma && <span>Lemma: {w.lemma}</span>}
                                    </div>
                                  </div>
                                  <button onClick={() => deleteWord(w.id)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 size={20} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                ) : (
                  <SearchTab tabId={t.id} fetchWords={fetchWords} settings={settings} models={models} templates={templates} initialWord={t.initialWord} onUpdateTab={(id, data) => setSearchTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} />
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTab === 'explain') {
      const filteredExplains = explains.filter(c => 
        c.text.toLowerCase().includes(explainHistorySearchTerm.toLowerCase())
      );
      const totalExplains = filteredExplains.length;
      const totalSearches = filteredExplains.reduce((sum, c) => sum + (c.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
            {explainTabs.map(t => (
              <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeExplainTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveExplainTabId(t.id)}>
                {t.id === 'history' ? <History size={14} /> : <MessageSquare size={14} />}
                <span className="truncate max-w-[150px]">{t.title || 'New Explain'}</span>
                {t.id !== 'history' && (
                  <>
                    {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                    {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                    <button onClick={(e) => { e.stopPropagation(); setExplainTabs(explainTabs.filter(st => st.id !== t.id)); if(activeExplainTabId === t.id) setActiveExplainTabId(explainTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                  </>
                )}
              </div>
            ))}
            <button onClick={() => { const id = Date.now().toString(); setExplainTabs([...explainTabs, { id, title: 'New Explain', loading: false, hasData: false, initialExplain: null }]); setActiveExplainTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
          </div>
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {explainTabs.map(t => (
              <div key={t.id} className={t.id === activeExplainTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                  <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <h2 className="text-2xl font-bold">Explain History</h2>
                        <div className="relative w-full sm:w-64">
                          <input 
                            type="text" 
                            value={explainHistorySearchTerm}
                            onChange={e => setExplainHistorySearchTerm(e.target.value)}
                            placeholder="Search explain history..."
                            className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                          />
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => toggleHoverReviewMode()}
                            className={`p-1.5 rounded-lg flex items-center gap-1.5 text-sm border shadow-sm transition-colors ${hoverReviewMode ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:border-blue-600 dark:text-white dark:hover:bg-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                            title="Toggle Quick Review on Hover"
                          >
                            <ScanLine size={16} /> 
                            <span className="hidden sm:inline font-medium">Hover Review</span>
                          </button>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-2">Sort by:</span>
                          <select 
                            value={historySort} 
                            onChange={e => setHistorySort(e.target.value)} 
                            className="border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                          >
                            <option value="date">Date (Grouped)</option>
                            <option value="count">Most Searched</option>
                            <option value="alpha">Alphabetical</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border dark:border-gray-700 shadow-sm items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Total Explains:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalExplains}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Total Searches:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => {
                              const sessionId = "Session " + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              localStorage.setItem('active_session_id', sessionId);
                              alert("Started " + sessionId);
                            }} className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors">New Session</button>
                            <button onClick={() => exportData('explains')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('explains', e)} />
                          </label>
                          <button onClick={() => clearData('explains')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-6">
                      {Object.entries(getGroupedByDay(filteredExplains, 'text')).map(([groupName, groupItems]) => (
                        <div key={groupName}>
                          {historySort === 'date' && (
                              <div className="flex items-center justify-between mb-3 border-b dark:border-gray-800 pb-1">
                                <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">{groupName}</h3>
                                {groupName.startsWith('Session') && (
                                  <button 
                                    onClick={async () => {
                                      if(!confirm(`Delete all data in ${groupName}?`)) return;
                                      await fetch(`/api/sessions/${groupName}`, { method: 'DELETE' });
                                      if(localStorage.getItem('active_session_id') === groupName) localStorage.removeItem('active_session_id');
                                      fetchWords();
                                      fetchComparisons();
                                      fetchExplains();
                                    }}
                                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                                  >
                                    Delete Group
                                  </button>
                                )}
                              </div>
                            )}
                          <div className="grid gap-3">
                            {groupItems.map(c => (
                              <div key={c.id} className="border dark:border-gray-700 p-4 rounded-lg flex justify-between items-center bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow relative">
                                <div 
                                  className="flex-1 cursor-pointer" 
                                  onClick={() => {
                                    const id = Date.now().toString();
                                    setExplainTabs([...explainTabs, { id, title: c.text, loading: true, hasData: false, initialExplain: c }]);
                                    setActiveExplainTabId(id);
                                  }}
                                >
                                  <div 
                                    className="flex items-center gap-2 w-fit relative"
                                    onMouseEnter={() => handleHover(c.id, 'explain')}
                                    onMouseLeave={() => setHoveredPreviewId(null)}
                                  >
                                    <span className="font-bold text-lg">{c.text}</span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm">({c.search_count} searches)</span>
                                    {hoverReviewMode && hoveredPreviewId === c.id && (
                                      <HoverReviewPopup content={previewContent[c.id]} popupSize={popupSize} setPopupSize={setPopupSize} />
                                    )}
                                  </div>
                                </div>
                                <button onClick={() => deleteExplain(c.id)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 size={20} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ExplainTab tabId={t.id} fetchExplains={fetchExplains} settings={settings} models={models} initialExplain={t.initialExplain} onUpdateTab={(id, data) => setExplainTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} />
                )}
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
    <div className={`flex h-screen font-sans ${theme !== 'light' ? 'bg-gray-950' : 'bg-gray-100'}`}>
      {/* Sidebar */}
      <div className={`bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col z-10 shadow-sm transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-16 md:w-64"}`}>
        <div className={`h-16 flex items-center justify-between border-b dark:border-gray-800 ${sidebarCollapsed ? "px-2 justify-center" : "md:px-6 px-2"}`}>
          <button 
            onClick={handleHomeClick}
            className={`font-bold text-xl text-blue-600 dark:text-blue-500 tracking-tight flex items-center justify-center md:justify-start gap-2 hover:opacity-80 transition-opacity ${sidebarCollapsed ? "hidden" : "flex-1 hidden md:flex"}`}
            title="Home / New Search"
          >
            <Library size={24} />
            <span className="hidden md:inline">AI Dict</span>
          </button>
          
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors hidden md:flex mx-auto"
            title="Toggle Sidebar"
          >
            <Menu size={20} />
          </button>
        </div>
        <nav className="flex-1 p-2 md:p-4 space-y-2 overflow-y-auto">
          <NavItem collapsed={sidebarCollapsed} icon={<Search />} label="Search" active={activeTab === 'search'} onClick={handleSearchClick} />
          <NavItem collapsed={sidebarCollapsed} icon={<GitCompare />} label="Compare" active={activeTab === 'compare'} onClick={handleCompareClick} />
          <NavItem collapsed={sidebarCollapsed} icon={<MessageSquare />} label="Explain" active={activeTab === 'explain'} onClick={handleExplainClick} />
          <NavItem collapsed={sidebarCollapsed} icon={<BookOpen />} label="Flashcards" active={activeTab === 'flashcards'} onClick={() => setActiveTab('flashcards')} />
        </nav>
        <div className="p-2 md:p-4 border-t dark:border-gray-800 space-y-2">
          <NavItem collapsed={sidebarCollapsed} icon={<SettingsIcon />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-950">
        {renderContent()}
      </div>
    </div>
  )
}

function NavItem({ icon, label, active, onClick, collapsed }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${collapsed ? "justify-center" : "justify-center md:justify-start"} ${active ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
      title={collapsed ? label : undefined}
    >
      <div className="shrink-0">{icon}</div>
      <span className={collapsed ? "hidden" : "hidden md:inline overflow-hidden text-ellipsis whitespace-nowrap"}>{label}</span>
    </button>
  )
}

export default App
