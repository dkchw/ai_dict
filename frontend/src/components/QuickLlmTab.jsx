import React, { useState, useEffect, useRef } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import SpeechButton from './SpeechButton'
import {
  Zap,
  Sparkles,
  Send,
  Copy,
  Check,
  RefreshCw,
  X,
  Loader2,
  Bookmark,
  CheckCircle2,
  Settings,
  ChevronDown,
  ChevronUp,
  Globe,
  Star,
  Plus,
  Trash2,
  Edit3,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  FileText
} from 'lucide-react'

export const QUICK_LLM_PRESETS = [
  { id: 'quick_glance', icon: '⚡', name: 'Quick Glance', description: 'Core definition, POS, pronunciation & example' },
  { id: 'grammar_breakdown', icon: '🧩', name: 'Grammar & Syntax', description: 'Sentence structure, clause parsing & tense' },
  { id: 'nuance_slang', icon: '💡', name: 'Nuance & Slang', description: 'Idiomatic context, tone & cultural undertones' },
  { id: 'simplify', icon: '👶', name: 'Plain & Simple (ELI5)', description: 'Simplified explanation with everyday analogy' },
  { id: 'key_points', icon: '📋', name: 'Key Takeaways', description: 'Bullet-point synthesis & high-yield summary' },
  { id: 'examples', icon: '🗣️', name: 'Real Dialogues', description: 'Practical conversations & authentic contextual usage' },
]

const DEFAULT_NEW_LENS_PROMPT = `You are an expert multilingual linguist providing specialized analysis.
When given a word, phrase, sentence pattern, or expression:

1. Always start with:
* **Language**: <Language of the input term/sentence>
* **Base form (lemma)**: <Base form, infinitive, or root>

2. Specialized Insights:
- Provide structured, high-yield insights directly aligned with this lens.
- Highlight key distinctions, usage contexts, and common pitfalls.

3. Example Usage:
- 1-2 authentic example sentences illustrating this concept with translations in the Target Language.

Keep explanations structured in Markdown bullet points, clear, and directly to the point.

STRICT LANGUAGE ENFORCEMENT RULES:
- Target Language: Write all definitions, explanations, breakdowns, and example translations strictly in the specified Target Language.
- Source Language: Only the input term itself and direct example sentence quotes may appear in the source language.`

export default function QuickLlmTab({
  profileId = 1,
  profileName = '',
  settings = {},
  onSaveWord,
  initialText = ''
}) {
  const defaultPromptKey = settings[`SIMPLE_LLM_DEFAULT_PROMPT_${profileId}`] || settings['SIMPLE_LLM_DEFAULT_PROMPT'] || 'quick_glance'
  const defaultModel = settings[`SIMPLE_LLM_MODEL_${profileId}`] || settings['SIMPLE_LLM_MODEL'] || 'inclusionai/ling-3.0-flash'

  const [inputText, setInputText] = useState(initialText)
  const [lenses, setLenses] = useState(QUICK_LLM_PRESETS)
  const [selectedPrompt, setSelectedPrompt] = useState(() => {
    return localStorage.getItem('quick_llm_selected_prompt') || defaultPromptKey || 'quick_glance'
  })
  const [modelOverride, setModelOverride] = useState(defaultModel)
  const [saveModelToast, setSaveModelToast] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isSaved, setIsSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [defaultToast, setDefaultToast] = useState(false)

  // Lens Manager Modal States
  const [showManageModal, setShowManageModal] = useState(false)
  const [showPromptDrawer, setShowPromptDrawer] = useState(false)
  const [editingLens, setEditingLens] = useState(null) // null for list, object for add/edit
  const [lensForm, setLensForm] = useState({ id: '', name: '', icon: '💡', description: '', prompt: '' })
  const [lensActionLoading, setLensActionLoading] = useState(false)

  const textareaRef = useRef(null)

  useEffect(() => {
    if (defaultModel) {
      setModelOverride(defaultModel)
    }
  }, [defaultModel])

  const handleSaveModelAsDefault = async () => {
    const cleanModel = (modelOverride || '').trim() || 'inclusionai/ling-3.0-flash'
    try {
      const key = profileId && profileId !== 1 ? `SIMPLE_LLM_MODEL_${profileId}` : 'SIMPLE_LLM_MODEL'
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: cleanModel })
      })
      setSaveModelToast(true)
      setTimeout(() => setSaveModelToast(false), 2500)
    } catch (e) {
      alert('Failed to save default model: ' + e.message)
    }
  }

  // Fetch lenses from backend
  const fetchLenses = async () => {
    try {
      const res = await fetch('/api/simple-llm/prompts')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setLenses(data)
          if (!data.some(l => l.id === selectedPrompt)) {
            setSelectedPrompt(data[0].id)
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch lenses:', e)
    }
  }

  useEffect(() => {
    fetchLenses()
  }, [])

  useEffect(() => {
    if (initialText) {
      setInputText(initialText)
    }
  }, [initialText])

  const handleSelectPrompt = (promptId) => {
    setSelectedPrompt(promptId)
    try {
      localStorage.setItem('quick_llm_selected_prompt', promptId)
    } catch (e) {}
  }

  const handleLookup = async (promptKeyToUse = selectedPrompt, textToQuery = inputText) => {
    const query = (textToQuery || '').trim()
    if (!query) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/simple-llm/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: query,
          prompt_key: promptKeyToUse,
          model: (modelOverride || '').trim() || undefined,
          profile_id: profileId
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Lookup failed')
      }

      const data = await res.json()
      setResult(data)
      setIsSaved(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveToProfile = async () => {
    if (!result || isSaved || saving) return
    setSaving(true)

    try {
      const res = await fetch('/api/simple-llm/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: result.term || inputText,
          content: result.content,
          source_lang: result.language,
          profile_id: profileId
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Failed to save')
      }

      const savedData = await res.json()
      setIsSaved(true)
      if (onSaveWord && savedData.word) {
        onSaveWord(savedData.word)
      }
    } catch (err) {
      alert(`Could not save word: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefaultPrompt = async (presetId) => {
    try {
      handleSelectPrompt(presetId)
      const key = `SIMPLE_LLM_DEFAULT_PROMPT_${profileId}`
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: presetId })
      })
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'SIMPLE_LLM_DEFAULT_PROMPT', value: presetId })
      }).catch(() => {})
      setDefaultToast(true)
      setTimeout(() => setDefaultToast(false), 2000)
    } catch (e) {
      console.error('Failed to set default prompt:', e)
    }
  }

  const handleCopy = () => {
    if (!result?.content) return
    navigator.clipboard.writeText(result.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleLookup()
    }
  }

  // --- Lens Management Actions ---
  const handleMoveLens = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= lenses.length) return
    const newLenses = [...lenses]
    const [moved] = newLenses.splice(index, 1)
    newLenses.splice(targetIndex, 0, moved)
    setLenses(newLenses)

    try {
      const order = newLenses.map(l => l.id)
      await fetch('/api/simple-llm/prompts/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      })
    } catch (e) {
      console.error('Failed to save reorder:', e)
    }
  }

  const handleOpenAddLens = () => {
    setLensForm({
      id: '',
      name: '',
      icon: '💡',
      description: '',
      prompt: DEFAULT_NEW_LENS_PROMPT
    })
    setEditingLens({ isNew: true })
  }

  const handleOpenEditLens = (lens) => {
    // Strip leading emoji from name if present to keep icon clean
    const rawName = (lens.name || '').replace(/^[^\w\s\u00C0-\u024F\u1E00-\u1EFF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]+\s*/, '')
    setLensForm({
      id: lens.id,
      name: rawName || lens.name,
      icon: lens.icon || '⚡',
      description: lens.description || '',
      prompt: lens.prompt || ''
    })
    setEditingLens(lens)
  }

  const handleSaveLensForm = async (e) => {
    e?.preventDefault()
    if (!lensForm.name.trim()) {
      alert('Please enter a name for this lens.')
      return
    }
    if (!lensForm.prompt.trim()) {
      alert('Please enter system prompt instructions for this lens.')
      return
    }

    setLensActionLoading(true)
    try {
      const res = await fetch('/api/simple-llm/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lensForm.id || undefined,
          name: lensForm.name.trim(),
          icon: lensForm.icon.trim() || '⚡',
          description: lensForm.description.trim(),
          prompt: lensForm.prompt.trim()
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to save lens')
      }

      const data = await res.json()
      if (Array.isArray(data.prompts)) {
        setLenses(data.prompts)
        if (data.prompt_id) {
          setSelectedPrompt(data.prompt_id)
        }
      } else {
        await fetchLenses()
      }
      setEditingLens(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setLensActionLoading(false)
    }
  }

  const handleDeleteLens = async (lensId, lensName) => {
    if (!confirm(`Are you sure you want to remove the lens "${lensName}"?`)) return
    setLensActionLoading(true)
    try {
      const res = await fetch(`/api/simple-llm/prompts/${encodeURIComponent(lensId)}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to delete lens')
      }
      const data = await res.json()
      if (Array.isArray(data.prompts)) {
        setLenses(data.prompts)
        if (selectedPrompt === lensId && data.prompts[0]) {
          setSelectedPrompt(data.prompts[0].id)
        }
      } else {
        await fetchLenses()
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setLensActionLoading(false)
    }
  }

  const handleResetLenses = async () => {
    if (!confirm('Reset all lenses to original factory presets and default order?')) return
    setLensActionLoading(true)
    try {
      const res = await fetch('/api/simple-llm/prompts/reset', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.prompts)) {
          setLenses(data.prompts)
          setSelectedPrompt(data.prompts[0]?.id || 'quick_glance')
        } else {
          await fetchLenses()
        }
      }
      setEditingLens(null)
    } catch (err) {
      alert('Failed to reset: ' + err.message)
    } finally {
      setLensActionLoading(false)
    }
  }

  const activePresetObj = lenses.find(p => p.id === selectedPrompt) || lenses[0] || QUICK_LLM_PRESETS[0]

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto p-4 md:p-6 space-y-4">
        
        {/* Header Hero Banner */}
        <div className="bg-white dark:bg-gray-800 border border-amber-500/30 dark:border-amber-500/25 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Zap className="w-5 h-5 fill-amber-500/30" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-50 flex items-center gap-2">
                  Quick LLM
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                    Ling Flash
                  </span>
                </h1>
                {profileName && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                    {profileName}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                Lightweight, rapid-glance language analysis with instant analytical lenses. Zero auto-save overhead.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition cursor-pointer"
              title="Toggle model & configuration"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Config</span>
              {showConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Optional Model Config Drawer */}
        {showConfig && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3.5 text-xs shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1 w-full">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-gray-800 dark:text-gray-200">
                    Model Identifier:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSaveModelAsDefault}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[11px] shadow-xs transition cursor-pointer"
                      title="Save this model as the default for this profile"
                    >
                      <Check className="w-3 h-3" />
                      <span>{saveModelToast ? 'Saved as Default!' : 'Save as Default'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelOverride('inclusionai/ling-3.0-flash')}
                      className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-[11px] font-medium cursor-pointer"
                      title="Reset to Ling Flash"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={modelOverride}
                    onChange={(e) => setModelOverride(e.target.value)}
                    placeholder="inclusionai/ling-3.0-flash"
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Quick Model Chips */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Quick Presets:</span>
              {[
                { label: '⚡ Ling Flash', model: 'inclusionai/ling-3.0-flash' },
                { label: '🔍 DeepSeek Flash', model: 'deepseek/deepseek-v4-flash-0731' },
                { label: '♊ Gemini 2.5 Flash', model: 'google/gemini-2.5-flash' },
              ].map(preset => (
                <button
                  key={preset.model}
                  type="button"
                  onClick={() => setModelOverride(preset.model)}
                  className={`px-2 py-0.5 rounded-md text-[11px] border transition cursor-pointer ${
                    modelOverride === preset.model
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-900 dark:text-amber-200 font-bold'
                      : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700/60 text-[11px] text-gray-500 dark:text-gray-400">
              <span>Quick LLM uses this model for ultra-low latency, ephemeral analytical lookups.</span>
              <button
                type="button"
                onClick={() => {
                  setEditingLens(null)
                  setShowManageModal(true)
                }}
                className="text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Manage & Customize Lenses →</span>
              </button>
            </div>
          </div>
        )}

        {/* Prompt Lens Preset Bar */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <span>Analytical Lens</span>
              </span>
              {activePresetObj?.description && (
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  • {activePresetObj.description}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSetDefaultPrompt(selectedPrompt)}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 border border-amber-500/30 transition cursor-pointer"
                title="Set current lens as default for Quick LLM"
              >
                <Star className="w-3.5 h-3.5 fill-amber-500/40" />
                <span>{defaultToast ? '★ Saved Default!' : 'Set Default'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const cur = lenses.find(l => l.id === selectedPrompt) || lenses[0]
                  if (cur) {
                    handleOpenEditLens(cur)
                    setShowManageModal(true)
                  }
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 border border-indigo-200/70 dark:border-indigo-800/60 transition cursor-pointer"
                title="Directly view and edit the system prompt for the currently active lens"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Lens Prompt</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingLens(null)
                  setShowManageModal(true)
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition cursor-pointer"
                title="Manage, customize, reorder or add lenses"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Manage Lenses</span>
              </button>
            </div>
          </div>

          {/* Lenses Pill Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {lenses.map((preset) => {
              const isActive = selectedPrompt === preset.id
              const icon = preset.icon || '⚡'
              const displayName = preset.name ? (preset.name.includes(icon) ? preset.name : `${icon} ${preset.name}`) : preset.id

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    handleSelectPrompt(preset.id)
                    if (result && !loading) {
                      handleLookup(preset.id)
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-gray-950 ring-2 ring-amber-500/50 scale-[1.02]'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200/80 dark:border-gray-600'
                  }`}
                  title={preset.description || displayName}
                >
                  <span>{displayName}</span>
                </button>
              )
            })}
          </div>

          {/* Active Lens Prompt Quick Viewer & Drawer */}
          {(() => {
            const activePreset = lenses.find(l => l.id === selectedPrompt) || lenses[0]
            if (!activePreset) return null
            return (
              <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-xs overflow-hidden mt-2">
                <div
                  className="py-2 px-3 flex items-center justify-between cursor-pointer hover:bg-amber-100/40 dark:hover:bg-amber-900/30 transition select-none"
                  onClick={() => setShowPromptDrawer(!showPromptDrawer)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Active Lens Prompt:</span>
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {activePreset.icon} {activePreset.name}
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 hidden md:inline truncate max-w-sm">
                      {activePreset.description || activePreset.prompt?.substring(0, 50) + '...'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenEditLens(activePreset)
                        setShowManageModal(true)
                      }}
                      className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60"
                      title="Edit this lens prompt in modal"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit Prompt</span>
                    </button>
                    {showPromptDrawer ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </div>
                </div>

                {showPromptDrawer && (
                  <div className="p-3 border-t border-amber-200/60 dark:border-amber-900/40 bg-white/70 dark:bg-gray-900/70 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Exact system prompt instructions sent to LLM for this lens:</span>
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenEditLens(activePreset)
                          setShowManageModal(true)
                        }}
                        className="text-amber-600 dark:text-amber-400 hover:underline font-semibold"
                      >
                        Customize / Edit Full Prompt
                      </button>
                    </div>
                    <pre className="font-mono text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/60 whitespace-pre-wrap select-text">
                      {activePreset.prompt}
                    </pre>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Input Text Card */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 md:p-5 shadow-sm space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type or paste a word, phrase, sentence, or dialogue..."
              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-3.5 text-[15px] leading-relaxed text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 resize-y transition shadow-inner font-sans"
            />
            {inputText && (
              <button
                type="button"
                onClick={() => setInputText('')}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 transition cursor-pointer"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono text-[10px] border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200">Enter</kbd> to analyze, <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono text-[10px] border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200">Shift+Enter</kbd> for newline
            </div>

            <button
              type="button"
              disabled={loading || !inputText.trim()}
              onClick={() => handleLookup(selectedPrompt)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 active:scale-98 text-gray-950 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-gray-950" />
                  <span>Analyze</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2 font-medium">
            <X className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Output Result Card */}
        {result && (
          <div className="bg-white dark:bg-gray-800 border-l-4 border-l-amber-500 border-y border-r border-gray-200 dark:border-gray-700/80 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            
            {/* Result Header & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200/80 dark:border-gray-700/80">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
                  {result.term || result.lemma || inputText}
                </span>
                {result.language && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-700">
                    {result.language}
                  </span>
                )}
                {result.lemma && result.lemma !== result.term && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    (Base: <strong className="text-gray-900 dark:text-gray-200">{result.lemma}</strong>)
                  </span>
                )}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold border border-amber-500/30">
                  ⚡ Ephemeral • Zero Auto-Save
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaved || saving}
                  onClick={handleSaveToProfile}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                    isSaved
                      ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                      : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                  }`}
                  title="Save word & explanation to your study profile database"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : isSaved ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      <span>Saved to Profile</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save to Profile</span>
                    </>
                  )}
                </button>

                <SpeechButton text={result.term || inputText} />

                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/70 transition cursor-pointer"
                  title="Copy analysis markdown"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Post-Output Prompt Lens Switcher Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-gray-800 dark:text-gray-200">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 text-xs uppercase tracking-wider">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Switch Lens:
                </span>
                <select
                  value={selectedPrompt}
                  onChange={(e) => {
                    const newKey = e.target.value
                    handleSelectPrompt(newKey)
                    handleLookup(newKey, result.term || inputText)
                  }}
                  className="rounded-lg border border-amber-500/40 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100 outline-none cursor-pointer focus:ring-2 focus:ring-amber-500"
                >
                  {lenses.map((p) => {
                    const icon = p.icon || '⚡'
                    const name = p.name ? (p.name.includes(icon) ? p.name : `${icon} ${p.name}`) : p.id
                    return (
                      <option key={p.id} value={p.id}>
                        {name}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <span>Model: <strong className="font-mono text-gray-800 dark:text-gray-200">{result.model || 'inclusionai/ling-3.0-flash'}</strong></span>
              </div>
            </div>

            {/* Markdown Content Display with full theme readability */}
            <div className="markdown-body p-2 sm:p-4 text-[15px] sm:text-[16px] leading-relaxed dark:text-gray-100 select-text">
              <MarkdownRenderer>{result.content || ''}</MarkdownRenderer>
            </div>

          </div>
        )}

      </div>

      {/* Lens Manager Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    Manage Analytical Lenses
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">
                      {lenses.length}
                    </span>
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Add, rename, customize prompts, reorder, or delete lenses.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!editingLens && (
                  <button
                    type="button"
                    onClick={handleOpenAddLens}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-gray-950 transition cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Lens</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowManageModal(false)
                    setEditingLens(null)
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              {editingLens ? (
                /* Lens Add / Edit Form */
                <form onSubmit={handleSaveLensForm} className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                      {editingLens.isNew ? 'Create New Analytical Lens' : `Configure Lens: ${editingLens.name || editingLens.id}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingLens(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium cursor-pointer"
                    >
                      ← Back to list
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Icon / Emoji:
                      </label>
                      <input
                        type="text"
                        value={lensForm.icon}
                        onChange={(e) => setLensForm({ ...lensForm, icon: e.target.value })}
                        placeholder="⚡"
                        maxLength={4}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-center text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-amber-500 font-emoji"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Lens Name:
                      </label>
                      <input
                        type="text"
                        value={lensForm.name}
                        onChange={(e) => setLensForm({ ...lensForm, name: e.target.value })}
                        placeholder="e.g. Root Words & Etymology"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Short Description:
                    </label>
                    <input
                      type="text"
                      value={lensForm.description}
                      onChange={(e) => setLensForm({ ...lensForm, description: e.target.value })}
                      placeholder="e.g. Trace linguistic roots, historical origin and cognates"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                      <span>System Prompt Instructions:</span>
                      <span className="text-[11px] font-normal text-gray-500">Defines how Ling Flash analyzes input</span>
                    </label>
                    <textarea
                      rows={9}
                      value={lensForm.prompt}
                      onChange={(e) => setLensForm({ ...lensForm, prompt: e.target.value })}
                      placeholder="System prompt template..."
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-3 text-xs font-mono text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed resize-y"
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      Tip: Keep the prompt structured with language mandates and Markdown formatting for clean output.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingLens(null)}
                      className="px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={lensActionLoading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-gray-950 transition cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {lensActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Save Lens</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Lens Ordered List */
                <div className="space-y-2">
                  {lenses.map((lens, index) => {
                    const isDefault = defaultPromptKey === lens.id
                    const icon = lens.icon || '⚡'
                    const displayName = lens.name ? (lens.name.includes(icon) ? lens.name : `${icon} ${lens.name}`) : lens.id

                    return (
                      <div
                        key={lens.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 hover:border-gray-300 dark:hover:border-gray-600 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-md bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                            #{index + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                                {displayName}
                              </span>
                              {isDefault && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                  DEFAULT
                                </span>
                              )}
                              {lens.is_custom && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                  Custom
                                </span>
                              )}
                            </div>
                            {lens.description && (
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5 max-w-sm">
                                {lens.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons: Rerank, Default, Edit, Delete */}
                        <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                          {/* Re-rank Up */}
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveLens(index, -1)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                            title="Move up in rank order"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Re-rank Down */}
                          <button
                            type="button"
                            disabled={index === lenses.length - 1}
                            onClick={() => handleMoveLens(index, 1)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                            title="Move down in rank order"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Set Default */}
                          <button
                            type="button"
                            onClick={() => handleSetDefaultPrompt(lens.id)}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isDefault
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                            title="Set as profile default"
                          >
                            <Star className={`w-3.5 h-3.5 ${isDefault ? 'fill-amber-500' : ''}`} />
                          </button>

                          {/* Edit / Config */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditLens(lens)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition cursor-pointer"
                            title="Configure prompt instructions, name or icon"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteLens(lens.id, lens.name)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 hover:text-red-700 transition cursor-pointer"
                            title="Delete lens"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/50">
              <button
                type="button"
                onClick={handleResetLenses}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400 font-medium transition cursor-pointer"
                title="Reset all lenses back to built-in presets"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Factory Defaults</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false)
                  setEditingLens(null)
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
