import re

with open("frontend/src/App.jsx", "r") as f:
    content = f.read()

# Add imports
content = content.replace("import ReactMarkdown from 'react-markdown'", "import ReactMarkdown from 'react-markdown'\nimport SearchTab from './components/SearchTab'\nimport CompareTab from './components/CompareTab'")

# Replace states
# Find the start of state declarations
start_state = content.find("const [activeTab, setActiveTab]")
end_state = content.find("const [settings, setSettings]")

new_states = """  const [searchTabs, setSearchTabs] = useState([{ id: 'init', title: 'New Search', loading: false, hasData: false, initialWord: null }])
  const [activeSearchTabId, setActiveSearchTabId] = useState('init')
  
  const [compareTabs, setCompareTabs] = useState([{ id: 'init', title: 'New Compare', loading: false, hasData: false, initialComparison: null }])
  const [activeCompareTabId, setActiveCompareTabId] = useState('init')
  
  const [historySearchTerm, setHistorySearchTerm] = useState('')
  const [compareHistorySearchTerm, setCompareHistorySearchTerm] = useState('')
"""

content = content[:start_state + len("const [activeTab, setActiveTab] = useState('search') // search, history, flashcards, settings, compare, compare-history\n")] + \
          "  const [words, setWords] = useState([])\n  const [comparisons, setComparisons] = useState([])\n" + \
          new_states + \
          content[end_state:]

# Remove the old API handlers (handleSearch, handleRegenerate, handleChat, updateColor)
# These are now in SearchTab and CompareTab
content = re.sub(r'const handleSearch = async \(e\) => \{.*?\n  \}', '', content, flags=re.DOTALL)
content = re.sub(r'const handleRegenerate = async \(model\) => \{.*?\n  \}', '', content, flags=re.DOTALL)
content = re.sub(r'const handleChat = async \(e\) => \{.*?\n  \}', '', content, flags=re.DOTALL)
content = re.sub(r'const updateColor = async \(colorId\) => \{.*?\n    \}', '', content, flags=re.DOTALL)
content = re.sub(r'const copyToClipboard = \(text\) => \{.*?\n  \}', '', content, flags=re.DOTALL)

content = re.sub(r'const handleCompareSearch = async \(e\) => \{.*?\n  \}', '', content, flags=re.DOTALL)
content = re.sub(r'const handleCompareRegenerate = async \(model\) => \{.*?\n  \}', '', content, flags=re.DOTALL)
content = re.sub(r'const handleCompareChat = async \(e\) => \{.*?\n  \}', '', content, flags=re.DOTALL)

# Also remove deleteWord and deleteComparison? No, they are used in history tabs.
# Update delete functions since currentWord is removed
content = content.replace("    if (currentWord?.id === id) {\n      setCurrentWord(null)\n      setChats([])\n    }\n", "")
content = content.replace("    if (currentComparison?.id === id) {\n      setCurrentComparison(null)\n      setCompareChats([])\n    }\n", "")

# Update renderContent for search
# We need to replace the entire `if (activeTab === 'search') { ... }` block
search_block = """    if (activeTab === 'search') {
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
    }"""

content = re.sub(r"    if \(activeTab === 'search'\) \{.*?\n      \)\n    \}", search_block, content, flags=re.DOTALL)

# Update renderContent for compare
compare_block = """    if (activeTab === 'compare') {
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
    }"""
content = re.sub(r"    if \(activeTab === 'compare'\) \{.*?\n      \)\n    \}", compare_block, content, flags=re.DOTALL)

# Update History to open a new tab instead of overwriting search
history_click = """onClick={() => {
                    const id = Date.now().toString();
                    setSearchTabs([...searchTabs, { id, title: w.term, loading: true, hasData: false, initialWord: w }]);
                    setActiveSearchTabId(id);
                    setActiveTab('search');
                  }}"""
content = re.sub(r"onClick=\{\(\) => \{\n                    setCurrentWord\(w\).*?\.then\(d => \{ setChats\(d\.chats\); setCurrentWord\(d\.word\); \}\)\n                  \}\}", history_click, content, flags=re.DOTALL)

compare_history_click = """onClick={() => {
                    const id = Date.now().toString();
                    setCompareTabs([...compareTabs, { id, title: c.terms, loading: true, hasData: false, initialComparison: c }]);
                    setActiveCompareTabId(id);
                    setActiveTab('compare');
                  }}"""
content = re.sub(r"onClick=\{\(\) => \{\n                    setCurrentComparison\(c\).*?\.then\(d => \{ setCompareChats\(d\.chats\); setCurrentComparison\(d\.comparison\); \}\)\n                  \}\}", compare_history_click, content, flags=re.DOTALL)


with open("frontend/src/App.jsx", "w") as f:
    f.write(content)

print("Done")
