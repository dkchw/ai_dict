import re

def patch_file(filename, endpoint_prefix):
    with open(filename, 'r') as f:
        content = f.read()

    # Add remarkGfm import
    content = content.replace("import ReactMarkdown from 'react-markdown'", "import ReactMarkdown from 'react-markdown'\nimport remarkGfm from 'remark-gfm'")
    
    # Add Pencil and Check to lucide-react imports
    content = re.sub(r"import \{(.*?)\} from 'lucide-react'", r"import {\1, Pencil, Check, X} from 'lucide-react'", content)

    # Add editing states
    state_injection = """  const [editingChatId, setEditingChatId] = useState(null)
  const [editingContent, setEditingContent] = useState('')

  const handleSaveEdit = async (chatId) => {
    if (!editingContent.trim()) return
    try {
      const res = await fetch(`%s/${chatId}`, {
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
""" % endpoint_prefix

    # Note: CompareTab uses `setCompareChats` and `compareChats` instead of `setChats` and `chats`
    if 'CompareTab' in filename:
        state_injection = state_injection.replace('setChats(', 'setCompareChats(')

    # Insert state
    content = re.sub(r"(const \[loading, setLoading\] = useState\(false\))", r"\1\n" + state_injection, content)

    # Replace rendering of Markdown
    # Search for: <ReactMarkdown>{chat.content}</ReactMarkdown>
    # or similar in SearchTab and CompareTab
    
    chat_array = 'chats' if 'SearchTab' in filename else 'compareChats'

    chat_render = """                <div className={`max-w-[85%] rounded-xl p-4 relative group ${chat.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 shadow-sm markdown-body dark:text-gray-200'}`}>
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
                </div>"""

    # We need to replace the inner div of the map
    # The regex must match the div with `max-w-[85%]`
    content = re.sub(r"<div className=\{`max-w-\[85%\].*?</ReactMarkdown>.*?</div>", chat_render, content, flags=re.DOTALL)

    with open(filename, 'w') as f:
        f.write(content)

patch_file('frontend/src/components/SearchTab.jsx', '/api/chats')
patch_file('frontend/src/components/CompareTab.jsx', '/api/comparisons/chats')

print("Done")
