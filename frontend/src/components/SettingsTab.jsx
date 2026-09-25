import React, { useState, useEffect } from 'react'
import { Palette, Edit, Trash2, ExternalLink, ChevronDown, ChevronRight, RotateCcw, Save, Sparkles, User } from 'lucide-react'

// Collapsible section component
function Section({ title, subtitle, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{title}</div>
          {subtitle && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>}
        </div>
        {open ? <ChevronDown size={18} className="text-gray-400 shrink-0" /> : <ChevronRight size={18} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 py-5 space-y-5 bg-white dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  )
}

// Model input with autocomplete datalist and inheritance status
function ModelInput({
  id, label, description, value, onChange, placeholder,
  models, defaultVal, isGlobal, isCustom, inheritedVal, onReset, profileName
}) {
  const listId = `${id}-list`
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</label>
          {!isGlobal && (
            isCustom ? (
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                Custom ({profileName})
              </span>
            ) : (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                Inherited
              </span>
            )
          )}
        </div>
        {!isGlobal ? (
          isCustom && (
            <button
              type="button"
              onClick={onReset}
              className="text-[10px] text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
              title={`Reset to inherit global: ${inheritedVal || defaultVal || 'Global Default'}`}
            >
              <RotateCcw size={10} /> Reset to Global
            </button>
          )
        ) : (
          defaultVal && value !== defaultVal && value !== '' && (
            <button
              type="button"
              onClick={() => onChange(defaultVal)}
              className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
              title={`Reset to default: ${defaultVal}`}
            >
              <RotateCcw size={10} /> reset
            </button>
          )
        )}
      </div>
      {description && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{description}</p>}
      <input
        type="text"
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={!isGlobal ? (inheritedVal ? `Inheriting: ${inheritedVal}` : placeholder || defaultVal || '') : (placeholder || defaultVal || '')}
        className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      />
      <datalist id={listId}>
        {defaultVal && <option value={defaultVal} />}
        {(models || []).map(m => <option key={m.id} value={m.id} />)}
      </datalist>
    </div>
  )
}

// Reasoning select
function ReasoningSelect({ label, value, onChange, isGlobal, isCustom, inheritedVal, onReset, profileName }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block">{label}</label>
          {!isGlobal && (
            isCustom ? (
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                Custom ({profileName})
              </span>
            ) : (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                Inherited ({inheritedVal || 'default'})
              </span>
            )
          )}
        </div>
        {!isGlobal && isCustom && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
            title="Reset to inherit global reasoning setting"
          >
            <RotateCcw size={10} /> Reset to Global
          </button>
        )}
      </div>
      <select
        value={value || (isGlobal ? 'default' : '')}
        onChange={e => onChange(e.target.value)}
        className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {!isGlobal && (
          <option value="">
            Inherit Global ({inheritedVal || 'default'})
          </option>
        )}
        <option value="default">Default (No Reasoning — let model decide)</option>
        <option value="none">None (Force disable reasoning)</option>
        <option value="minimal">Minimal (~1k tokens)</option>
        <option value="low">Low (~2k tokens)</option>
        <option value="medium">Medium (~4k tokens)</option>
        <option value="high">High (~8k tokens)</option>
        <option value="xhigh">X-High (~16k tokens)</option>
        <option value="max">Max (~32k tokens)</option>
      </select>
    </div>
  )
}

// Prompt textarea with restore/reset
function PromptField({
  label, value, onChange, defaultValue, rows = 6,
  isGlobal, isCustom, inheritedVal, onReset, onCopyGlobal, profileName
}) {
  const effective = isGlobal ? (value || defaultValue || '') : value
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</label>
          {!isGlobal && (
            isCustom ? (
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                Custom ({profileName})
              </span>
            ) : (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                Inherited
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isGlobal ? (
            <>
              {!isCustom && (
                <button
                  type="button"
                  onClick={onCopyGlobal}
                  className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline px-1.5 py-0.5 font-medium"
                  title="Copy global prompt into this field to customize"
                >
                  <Sparkles size={11} /> Copy Global Prompt
                </button>
              )}
              {isCustom && (
                <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded transition-colors"
                  title="Reset to inherit global prompt"
                >
                  <RotateCcw size={10} /> Reset to Global
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => onChange(defaultValue || '')}
              className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded transition-colors"
              title="Restore to default built-in prompt"
            >
              <RotateCcw size={10} /> Restore Default
            </button>
          )}
        </div>
      </div>
      <textarea
        value={effective}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={!isGlobal ? `Inheriting global prompt:\n\n${inheritedVal || defaultValue || ''}` : ''}
        className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
    </div>
  )
}

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-0731'

export default function SettingsTab({
  settings, setSettings, fetchSettings, defaultSettings,
  models, theme, setTheme,
  templates, setTemplates, editingTemplate, setEditingTemplate,
  exportData, importData, clearData,
  internalTabsEnabled, updateInternalTabsEnabled,
  showRecentEmpty, updateShowRecentEmpty,
  profiles = [], activeProfileId
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState(activeProfileId || 'global')
  const [ollamaStatus, setOllamaStatus] = useState({ running: false, models: [], activeModel: '', loading: false })
  const [mtStatus, setMtStatus] = useState({ active_level: 'standard', extension_default: true, models: {}, ollama_ready: false, loading: false })

  const fetchOllamaStatus = async () => {
    setOllamaStatus(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/ollama/status')
      if (res.ok) {
        const data = await res.json()
        setOllamaStatus({ running: !!data.running, models: data.models || [], activeModel: data.active_model || '', loading: false })
      } else {
        setOllamaStatus(prev => ({ ...prev, running: false, loading: false }))
      }
    } catch {
      setOllamaStatus(prev => ({ ...prev, running: false, loading: false }))
    }
  }

  const fetchMtStatus = async () => {
    setMtStatus(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/mt/status')
      if (res.ok) {
        const data = await res.json()
        setMtStatus({
          active_level: data.active_level || 'standard',
          extension_default: data.extension_default !== false,
          models: data.models || {},
          ollama_ready: !!data.ollama_ready,
          loading: false
        })
      } else {
        setMtStatus(prev => ({ ...prev, loading: false }))
      }
    } catch {
      setMtStatus(prev => ({ ...prev, loading: false }))
    }
  }

  useEffect(() => {
    fetchOllamaStatus()
    fetchMtStatus()
  }, [])

  const s = settings || {}
  const dd = defaultSettings || {}

  useEffect(() => {
    if (activeProfileId && selectedProfileId === undefined) {
      setSelectedProfileId(activeProfileId)
    }
  }, [activeProfileId])

  const isGlobal = selectedProfileId === 'global'
  const currentProfile = !isGlobal ? (profiles || []).find(p => p.id === selectedProfileId) : null
  const profileSuffix = !isGlobal && currentProfile ? `_${currentProfile.id}` : ''
  const profileName = currentProfile?.name || 'Profile'

  const upd = (key, val) => setSettings(prev => ({ ...prev, [key]: val }))

  // Helpers for profile vs global resolution
  const getVal = (baseKey) => {
    if (isGlobal) {
      return s[baseKey] !== undefined ? s[baseKey] : ''
    }
    return s[`${baseKey}${profileSuffix}`] !== undefined ? s[`${baseKey}${profileSuffix}`] : ''
  }

  const getInheritedVal = (baseKey) => {
    return s[baseKey] || dd[baseKey] || ''
  }

  const setVal = (baseKey, val) => {
    if (isGlobal) {
      upd(baseKey, val)
    } else {
      upd(`${baseKey}${profileSuffix}`, val)
    }
  }

  const isCustom = (baseKey) => {
    if (isGlobal) return false
    const v = s[`${baseKey}${profileSuffix}`]
    return v !== undefined && v !== '' && v !== null
  }

  const resetVal = (baseKey) => {
    if (isGlobal) {
      upd(baseKey, dd[baseKey] || '')
    } else {
      upd(`${baseKey}${profileSuffix}`, '')
    }
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      fetchSettings()
    } catch (err) {
      alert('Failed to save settings: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto text-gray-900 dark:text-gray-100 space-y-5">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Settings</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configure AI Dict behaviour and models</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const res = await fetch('/api/settings/export')
                const data = await res.json()
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                const dateStr = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]
                a.download = `ai_dict_settings_${dateStr}.json`
                a.click()
              }}
              className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border dark:border-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >Export Settings</button>
            <label className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border dark:border-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors">
              Import Settings
              <input type="file" accept=".json" className="hidden" onChange={async (e) => {
                const file = e.target.files[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = async (ev) => {
                  try {
                    const data = JSON.parse(ev.target.result)
                    await fetch('/api/settings/import', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data)
                    })
                    alert('Settings imported successfully')
                    fetchSettings()
                  } catch { alert('Invalid settings file') }
                }
                reader.readAsText(file)
              }} />
            </label>
          </div>
        </div>

        {/* ── APPEARANCE ── */}
        <Section title="🎨 Appearance" subtitle="Theme and UI preferences" defaultOpen={true}>
          <div>
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">App Theme</label>
            <div className="flex items-center gap-2">
              <Palette size={18} className="text-gray-400 shrink-0" />
              <select
                value={theme}
                onChange={e => setTheme(e.target.value)}
                className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="tokyonight">Tokyo Night (Default)</option>
                <option value="nord">Nord</option>
                <option value="dracula">Dracula</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg border dark:border-gray-700">
            <div>
              <div className="text-sm font-semibold">Internal Tabs</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Enable browser-style tabs inside each mode. When off, a cleaner segmented control is used instead.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
              <input
                type="checkbox"
                checked={internalTabsEnabled || false}
                onChange={e => updateInternalTabsEnabled?.(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg border dark:border-gray-700">
            <div>
              <div className="text-sm font-semibold">Show Recent Lookups on Empty State</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Display recent words and lookups on initial empty search/mode screens. Disabled by default.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
              <input
                type="checkbox"
                checked={showRecentEmpty !== undefined ? showRecentEmpty : s.SHOW_RECENT_EMPTY === 'true'}
                onChange={e => {
                  if (updateShowRecentEmpty) {
                    updateShowRecentEmpty(e.target.checked);
                  } else {
                    upd('SHOW_RECENT_EMPTY', e.target.checked ? 'true' : 'false');
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </Section>

        {/* ── PROFILE SELECTOR (CENTRAL CONFIGURATION) ── */}
        <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/70 dark:from-gray-800 dark:via-gray-800/90 dark:to-gray-800 border border-blue-200/80 dark:border-gray-700 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <User size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Profile-Specific Configuration</span>
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                {isGlobal ? '🌐 Global Default Settings' : `👤 Profile: ${profileName}`}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isGlobal
                  ? 'Configuring global baseline models and prompts. Profiles inherit these unless they define their own overrides.'
                  : `Configuring models, reasoning, and prompts for "${profileName}". Any field left blank or reset inherits from Global Default.`
                }
              </p>
            </div>
            {!isGlobal && (
              <div className="self-start sm:self-auto">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Configuring {profileName}
                </span>
              </div>
            )}
          </div>

          {/* Profile pills */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-blue-200/60 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setSelectedProfileId('global')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedProfileId === 'global'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border dark:border-gray-600'
              }`}
            >
              <span>🌐 Global Default</span>
            </button>
            {(profiles || []).map(p => {
              const isActive = selectedProfileId === p.id
              const isCurrentSession = p.id === activeProfileId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProfileId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border dark:border-gray-600'
                  }`}
                >
                  <span>👤 {p.name}</span>
                  {isCurrentSession && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${isActive ? 'bg-blue-700 text-blue-100' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                      active
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── MODELS CONFIGURATION ── */}
        <Section
          title={`🤖 AI Models ${!isGlobal ? `(${profileName})` : '(Global Default)'}`}
          subtitle={isGlobal ? 'Default models used across AI Dict' : `Model overrides specifically for ${profileName}`}
          defaultOpen={true}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ModelInput
              id="main-model"
              label="Search Model"
              description="Used for Search / Dictionary lookups"
              value={getVal('MAIN_MODEL')}
              onChange={v => setVal('MAIN_MODEL', v)}
              placeholder={DEFAULT_MODEL}
              defaultVal={DEFAULT_MODEL}
              models={models}
              isGlobal={isGlobal}
              isCustom={isCustom('MAIN_MODEL')}
              inheritedVal={getInheritedVal('MAIN_MODEL')}
              onReset={() => resetVal('MAIN_MODEL')}
              profileName={profileName}
            />
            <ModelInput
              id="explain-model"
              label="Explain Model"
              description="Used for Explain mode lookups"
              value={getVal('EXPLAIN_MODEL')}
              onChange={v => setVal('EXPLAIN_MODEL', v)}
              placeholder={DEFAULT_MODEL}
              defaultVal={DEFAULT_MODEL}
              models={models}
              isGlobal={isGlobal}
              isCustom={isCustom('EXPLAIN_MODEL')}
              inheritedVal={getInheritedVal('EXPLAIN_MODEL')}
              onReset={() => resetVal('EXPLAIN_MODEL')}
              profileName={profileName}
            />
            <ModelInput
              id="compare-model"
              label="Compare Model"
              description="Used for word comparisons"
              value={getVal('COMPARE_MODEL')}
              onChange={v => setVal('COMPARE_MODEL', v)}
              placeholder={DEFAULT_MODEL}
              defaultVal={DEFAULT_MODEL}
              models={models}
              isGlobal={isGlobal}
              isCustom={isCustom('COMPARE_MODEL')}
              inheritedVal={getInheritedVal('COMPARE_MODEL')}
              onReset={() => resetVal('COMPARE_MODEL')}
              profileName={profileName}
            />
            <ModelInput
              id="translation-model"
              label="Translation Model"
              description="Used for Translation mode"
              value={getVal('TRANSLATION_MODEL')}
              onChange={v => setVal('TRANSLATION_MODEL', v)}
              placeholder={DEFAULT_MODEL}
              defaultVal={DEFAULT_MODEL}
              models={models}
              isGlobal={isGlobal}
              isCustom={isCustom('TRANSLATION_MODEL')}
              inheritedVal={getInheritedVal('TRANSLATION_MODEL')}
              onReset={() => resetVal('TRANSLATION_MODEL')}
              profileName={profileName}
            />
            <ModelInput
              id="correction-model"
              label="Correction Model"
              description="Used for Correction & Translation mode"
              value={getVal('CORRECTION_MODEL')}
              onChange={v => setVal('CORRECTION_MODEL', v)}
              placeholder={DEFAULT_MODEL}
              defaultVal={DEFAULT_MODEL}
              models={models}
              isGlobal={isGlobal}
              isCustom={isCustom('CORRECTION_MODEL')}
              inheritedVal={getInheritedVal('CORRECTION_MODEL')}
              onReset={() => resetVal('CORRECTION_MODEL')}
              profileName={profileName}
            />
            <div className="md:col-span-2">
              <ModelInput
                id="chat-model"
                label="Chat Model"
                description="Used for all follow-up chats across all modes"
                value={getVal('CHAT_MODEL')}
                onChange={v => setVal('CHAT_MODEL', v)}
                placeholder={DEFAULT_MODEL}
                defaultVal={DEFAULT_MODEL}
                models={models}
                isGlobal={isGlobal}
                isCustom={isCustom('CHAT_MODEL')}
                inheritedVal={getInheritedVal('CHAT_MODEL')}
                onReset={() => resetVal('CHAT_MODEL')}
                profileName={profileName}
              />
            </div>
          </div>
        </Section>

        {/* ── REASONING BUDGET ── */}
        <Section
          title={`🧠 Reasoning Budget ${!isGlobal ? `(${profileName})` : '(Global Default)'}`}
          subtitle="Controls how much 'thinking' tokens each mode uses"
          defaultOpen={false}
        >
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-300">
            <strong>Default (recommended):</strong> No reasoning parameter is sent to the API — the model uses its own defaults. Set a specific level only if you want to force a reasoning budget, or set <em>None</em> to explicitly disable thinking for models that support it.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReasoningSelect
              label="Search Reasoning"
              value={getVal('MAIN_REASONING')}
              onChange={v => setVal('MAIN_REASONING', v)}
              isGlobal={isGlobal}
              isCustom={isCustom('MAIN_REASONING')}
              inheritedVal={getInheritedVal('MAIN_REASONING')}
              onReset={() => resetVal('MAIN_REASONING')}
              profileName={profileName}
            />
            <ReasoningSelect
              label="Explain Reasoning"
              value={getVal('EXPLAIN_REASONING')}
              onChange={v => setVal('EXPLAIN_REASONING', v)}
              isGlobal={isGlobal}
              isCustom={isCustom('EXPLAIN_REASONING')}
              inheritedVal={getInheritedVal('EXPLAIN_REASONING')}
              onReset={() => resetVal('EXPLAIN_REASONING')}
              profileName={profileName}
            />
            <ReasoningSelect
              label="Compare Reasoning"
              value={getVal('COMPARE_REASONING')}
              onChange={v => setVal('COMPARE_REASONING', v)}
              isGlobal={isGlobal}
              isCustom={isCustom('COMPARE_REASONING')}
              inheritedVal={getInheritedVal('COMPARE_REASONING')}
              onReset={() => resetVal('COMPARE_REASONING')}
              profileName={profileName}
            />
            <ReasoningSelect
              label="Translation Reasoning"
              value={getVal('TRANSLATION_REASONING')}
              onChange={v => setVal('TRANSLATION_REASONING', v)}
              isGlobal={isGlobal}
              isCustom={isCustom('TRANSLATION_REASONING')}
              inheritedVal={getInheritedVal('TRANSLATION_REASONING')}
              onReset={() => resetVal('TRANSLATION_REASONING')}
              profileName={profileName}
            />
            <ReasoningSelect
              label="Correction Reasoning"
              value={getVal('CORRECTION_REASONING')}
              onChange={v => setVal('CORRECTION_REASONING', v)}
              isGlobal={isGlobal}
              isCustom={isCustom('CORRECTION_REASONING')}
              inheritedVal={getInheritedVal('CORRECTION_REASONING')}
              onReset={() => resetVal('CORRECTION_REASONING')}
              profileName={profileName}
            />
            <div className="md:col-span-2">
              <ReasoningSelect
                label="Chat Reasoning"
                value={getVal('CHAT_REASONING')}
                onChange={v => setVal('CHAT_REASONING', v)}
                isGlobal={isGlobal}
                isCustom={isCustom('CHAT_REASONING')}
                inheritedVal={getInheritedVal('CHAT_REASONING')}
                onReset={() => resetVal('CHAT_REASONING')}
                profileName={profileName}
              />
            </div>
          </div>
        </Section>

        {/* ── SYSTEM PROMPTS ── */}
        <Section
          title={`📝 System Prompts ${!isGlobal ? `(${profileName})` : '(Global Default)'}`}
          subtitle="Customize what the AI is instructed to do for each mode"
          defaultOpen={false}
        >
          <PromptField
            label="Search / Dictionary Prompt"
            value={getVal('DICT_PROMPT')}
            onChange={v => setVal('DICT_PROMPT', v)}
            defaultValue={dd.DICT_PROMPT || ''}
            isGlobal={isGlobal}
            isCustom={isCustom('DICT_PROMPT')}
            inheritedVal={getInheritedVal('DICT_PROMPT')}
            onReset={() => resetVal('DICT_PROMPT')}
            onCopyGlobal={() => setVal('DICT_PROMPT', getInheritedVal('DICT_PROMPT'))}
            profileName={profileName}
          />
          <PromptField
            label="Comparison Prompt"
            value={getVal('COMPARE_PROMPT')}
            onChange={v => setVal('COMPARE_PROMPT', v)}
            defaultValue={dd.COMPARE_PROMPT || ''}
            isGlobal={isGlobal}
            isCustom={isCustom('COMPARE_PROMPT')}
            inheritedVal={getInheritedVal('COMPARE_PROMPT')}
            onReset={() => resetVal('COMPARE_PROMPT')}
            onCopyGlobal={() => setVal('COMPARE_PROMPT', getInheritedVal('COMPARE_PROMPT'))}
            profileName={profileName}
          />
          <PromptField
            label="Explain Prompt"
            value={getVal('EXPLAIN_PROMPT')}
            onChange={v => setVal('EXPLAIN_PROMPT', v)}
            defaultValue={dd.EXPLAIN_PROMPT || ''}
            isGlobal={isGlobal}
            isCustom={isCustom('EXPLAIN_PROMPT')}
            inheritedVal={getInheritedVal('EXPLAIN_PROMPT')}
            onReset={() => resetVal('EXPLAIN_PROMPT')}
            onCopyGlobal={() => setVal('EXPLAIN_PROMPT', getInheritedVal('EXPLAIN_PROMPT'))}
            profileName={profileName}
          />
          <PromptField
            label="Translation Prompt"
            value={getVal('TRANSLATE_PROMPT')}
            onChange={v => setVal('TRANSLATE_PROMPT', v)}
            defaultValue={dd.TRANSLATE_PROMPT || ''}
            isGlobal={isGlobal}
            isCustom={isCustom('TRANSLATE_PROMPT')}
            inheritedVal={getInheritedVal('TRANSLATE_PROMPT')}
            onReset={() => resetVal('TRANSLATE_PROMPT')}
            onCopyGlobal={() => setVal('TRANSLATE_PROMPT', getInheritedVal('TRANSLATE_PROMPT'))}
            profileName={profileName}
          />
          <PromptField
            label="Correction Prompt"
            value={getVal('CORRECTION_PROMPT')}
            onChange={v => setVal('CORRECTION_PROMPT', v)}
            defaultValue={dd.CORRECTION_PROMPT || ''}
            isGlobal={isGlobal}
            isCustom={isCustom('CORRECTION_PROMPT')}
            inheritedVal={getInheritedVal('CORRECTION_PROMPT')}
            onReset={() => resetVal('CORRECTION_PROMPT')}
            onCopyGlobal={() => setVal('CORRECTION_PROMPT', getInheritedVal('CORRECTION_PROMPT'))}
            profileName={profileName}
          />
        </Section>

        {/* ── LANGUAGES ── */}
        <Section title="🌐 Languages" subtitle="Languages shown in dropdowns and default search languages" defaultOpen={false}>
          <div>
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">Available Languages (Global)</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Comma-separated, supports emoji flags. These populate language dropdowns in Search, Compare, Explain, and Translation modes.</p>
            <input
              type="text"
              value={s.LANGUAGES || '🌐 Auto, 🇺🇸 EN, 🇩🇪 DE, 🇻🇳 VI, 🇫🇷 FR, 🇪🇸 ES, 🇯🇵 JA, 🇨🇳 ZH, 🇰🇷 KO'}
              onChange={e => upd('LANGUAGES', e.target.value)}
              className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="🌐 Auto, 🇺🇸 EN, 🇻🇳 VI"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">
                Default Source Language {!isGlobal && `(${profileName})`}
              </label>
              <input
                type="text"
                value={isGlobal ? (s.SEARCH_SOURCE_LANG || '') : (s[`searchSourceLang_${currentProfile?.id}`] || '')}
                onChange={e => {
                  if (isGlobal) upd('SEARCH_SOURCE_LANG', e.target.value)
                  else upd(`searchSourceLang_${currentProfile?.id}`, e.target.value)
                }}
                placeholder={isGlobal ? '🌐 Auto' : (s.SEARCH_SOURCE_LANG || '🌐 Auto')}
                className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">
                Default Target Language {!isGlobal && `(${profileName})`}
              </label>
              <input
                type="text"
                value={isGlobal ? (s.SEARCH_TARGET_LANG || '') : (s[`searchTargetLang_${currentProfile?.id}`] || '')}
                onChange={e => {
                  if (isGlobal) upd('SEARCH_TARGET_LANG', e.target.value)
                  else upd(`searchTargetLang_${currentProfile?.id}`, e.target.value)
                }}
                placeholder={isGlobal ? '🇺🇸 EN' : (s.SEARCH_TARGET_LANG || '🇺🇸 EN')}
                className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </Section>

        {/* ── API CREDENTIALS & FALLBACKS ── */}
        <Section title="🔑 OpenRouter API Credentials" subtitle="Account-wide API key and fallback models" defaultOpen={false}>
          <div>
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">OpenRouter API Key</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Required for all AI features. Get one free at <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">openrouter.ai</a>.</p>
            <input
              type="password"
              value={s.OPENROUTER_API_KEY || ''}
              onChange={e => upd('OPENROUTER_API_KEY', e.target.value)}
              placeholder="sk-or-..."
              className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">Fallback Models</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Comma-separated list of models to try if the main model fails.</p>
            <input
              type="text"
              value={s.FALLBACK_MODELS || ''}
              onChange={e => upd('FALLBACK_MODELS', e.target.value)}
              placeholder="google/gemini-3.8-flash"
              className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </Section>

        {/* ── OLLAMA LOCAL OFFLINE FALLBACK ── */}
        <Section
          title="🦙 Local Ollama Offline Mode"
          subtitle="Automatically use local Ollama model when internet access is unavailable"
          defaultOpen={true}
        >
          <div className="space-y-4">
            {/* Status Card */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60">
              <div className="flex items-center gap-3">
                <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${ollamaStatus.running ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-rose-500'}`} />
                <div>
                  <div className="text-sm font-semibold flex flex-wrap items-center gap-2">
                    <span>{ollamaStatus.running ? 'Ollama Connected' : 'Ollama Not Detected'}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-normal bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {s.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {ollamaStatus.running
                      ? (ollamaStatus.models.length > 0 
                          ? `${ollamaStatus.models.length} model(s) installed: ${ollamaStatus.models.join(', ')}`
                          : 'Running, but no models found. Run "ollama pull <model>" in terminal.')
                      : 'Make sure Ollama is installed and running (e.g. `ollama serve`) to enable offline lookups.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchOllamaStatus}
                disabled={ollamaStatus.loading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw size={12} className={ollamaStatus.loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {/* Toggle */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={s.OLLAMA_FALLBACK_ENABLED !== 'false' && s.OLLAMA_FALLBACK_ENABLED !== false}
                onChange={e => upd('OLLAMA_FALLBACK_ENABLED', e.target.checked ? 'true' : 'false')}
                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Enable Automatic Ollama Fallback on Network / Internet Failure
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  When enabled, if internet access is not available or OpenRouter is unreachable, AI Dict seamlessly switches to your local Ollama model so lookups and chats never fail.
                </p>
              </div>
            </label>

            {/* Model & URL Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1">
                  Ollama Fallback Model
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Select an installed model or type any model tag. Leave empty to auto-detect.
                </p>
                <div className="relative">
                  <input
                    type="text"
                    list="ollama-installed-models"
                    value={s.OLLAMA_MODEL || ''}
                    onChange={e => upd('OLLAMA_MODEL', e.target.value)}
                    placeholder={ollamaStatus.activeModel ? `Auto-detect: ${ollamaStatus.activeModel}` : 'Auto-detect installed model'}
                    className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="ollama-installed-models">
                    {ollamaStatus.models.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1">
                  Ollama Base URL
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Local Ollama API endpoint (OpenAI-compatible v1 URL).
                </p>
                <input
                  type="text"
                  value={s.OLLAMA_BASE_URL || ''}
                  onChange={e => upd('OLLAMA_BASE_URL', e.target.value)}
                  placeholder="http://127.0.0.1:11434/v1"
                  className="w-full border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Offline Machine Translation (Facebook NLLB) */}
        <Section
          title="🌐 Offline Machine Translation (Facebook NLLB)"
          subtitle="Direct, instantaneous offline translation engine with 3 quality levels"
          defaultOpen={true}
        >
          <div className="space-y-4">
            {/* Status Card */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60">
              <div className="flex items-center gap-3">
                <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${
                  mtStatus.models?.[s.MT_LEVEL || 'standard']?.ready || mtStatus.ollama_ready
                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                    : 'bg-amber-500'
                }`} />
                <div>
                  <div className="text-sm font-semibold flex flex-wrap items-center gap-2">
                    <span>
                      {mtStatus.models?.[s.MT_LEVEL || 'standard']?.ready
                        ? `NLLB Model Ready (${mtStatus.models?.[s.MT_LEVEL || 'standard']?.name})`
                        : mtStatus.ollama_ready
                        ? 'Ollama MT Ready (NLLB preparing in background)'
                        : 'Local MT Ready'}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-medium bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      Level: {(s.MT_LEVEL || 'standard').toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Fast CTranslate2 inference powered by Facebook NLLB-200 int8 quantization (200 languages supported).
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchMtStatus}
                disabled={mtStatus.loading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw size={12} className={mtStatus.loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {/* Model Quality Level Radios */}
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-2">
                Local Translation Model Level
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    level: 'small',
                    name: 'Small (600M int8)',
                    desc: 'Small local translate model with reasonable accuracy (~600MB)',
                    spec: 'Fastest'
                  },
                  {
                    level: 'standard',
                    name: 'Standard (Facebook NLLB)',
                    desc: 'Facebook NLLB model with reasonable quant (~600MB/1.3GB)',
                    spec: 'Recommended'
                  },
                  {
                    level: 'big',
                    name: 'Big (1.3B int8 / Local LLM)',
                    desc: 'High precision large local model or local LLM translation',
                    spec: 'Highest Accuracy'
                  }
                ].map(opt => {
                  const isSel = (s.MT_LEVEL || 'standard') === opt.level;
                  return (
                    <div
                      key={opt.level}
                      onClick={() => upd('MT_LEVEL', opt.level)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all select-none ${
                        isSel
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 shadow-xs ring-1 ring-blue-500'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{opt.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {opt.spec}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                        {opt.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Default in Chrome Extension checkbox */}
            <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={s.MT_DEFAULT_IN_EXTENSION !== 'false' && s.MT_DEFAULT_IN_EXTENSION !== false}
                onChange={e => upd('MT_DEFAULT_IN_EXTENSION', e.target.checked ? 'true' : 'false')}
                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Use Machine Translation as default in Chrome Extension
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  When enabled, text selection in Chrome displays instantaneous Google Translate style output. Clicking "Special Mode" will invoke the full LLM.
                </p>
              </div>
            </label>
          </div>
        </Section>

        {/* Save button */}
        <button
          onClick={saveAll}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all shadow-md ${
            saving
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : saved
              ? 'bg-green-600 text-white shadow-green-500/20'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-[0.99]'
          }`}
        >
          <Save size={18} />
          {saving ? 'Saving All Settings…' : saved ? '✓ All Settings Saved!' : 'Save All Settings'}
        </button>

        {/* ── DATA MANAGEMENT ── */}
        <Section title="💾 Data Management" subtitle="Export, import, or clear all your history and database" defaultOpen={false}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The <strong>Database ZIP</strong> export is the recommended backup — it includes everything: profiles, settings, and all history. Perfect for moving to a new device.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/data/export_zip"
              className="bg-blue-600 hover:bg-blue-700 transition-colors text-white px-3 py-1.5 rounded-lg text-sm font-medium inline-block"
            >
              Export Database (ZIP)
            </a>
            <label className="bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer">
              Import Database (ZIP)
              <input type="file" accept=".zip" className="hidden" onChange={async (e) => {
                const file = e.target.files[0]
                if (!file) return
                const formData = new FormData()
                formData.append('file', file)
                try {
                  const res = await fetch('/api/data/import_zip', { method: 'POST', body: formData })
                  if (res.ok) { alert('Database imported! Refreshing…'); window.location.reload() }
                  else { const err = await res.json(); alert('Failed: ' + err.detail) }
                } catch { alert('Error importing database') }
              }} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportData('all')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Export JSON</button>
            <label className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors">
              Import JSON
              <input type="file" accept=".json" className="hidden" onChange={e => importData('all', e)} />
            </label>
            <button onClick={() => clearData('all')} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              Clear All Data
            </button>
          </div>
        </Section>

        {/* ── EXTERNAL LINKS ── */}
        <Section title="🔗 External Dictionary Links" subtitle="Add language-specific buttons that appear on search results" defaultOpen={false}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">{`{{str}}`}</code> as placeholder for the word/lemma. Use <strong>All</strong> in the Language field to show for every language.
          </p>

          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {t.icon_url ? <img src={t.icon_url} className="w-4 h-4" alt="" /> : <ExternalLink size={14} />}
                    {t.name || 'Dict'} <span className="text-xs font-normal text-gray-500">({t.language})</span>
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">{t.url_template}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditingTemplate(t)} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-1.5 rounded transition-colors"><Edit size={16} /></button>
                  <button onClick={async () => {
                    await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
                    if (editingTemplate?.id === t.id) setEditingTemplate(null)
                    fetchSettings()
                  }} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="text-sm text-gray-400 text-center py-4">No external links configured yet.</div>
            )}
          </div>

          <form
            id="template-form"
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.target)
              const body = { name: fd.get('name') || 'Dict', language: fd.get('language'), url_template: fd.get('url_template'), icon_url: fd.get('icon_url') }
              if (editingTemplate) {
                await fetch(`/api/templates/${editingTemplate.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                setEditingTemplate(null)
              } else {
                await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
              }
              e.target.reset()
              fetchSettings()
            }}
            className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-lg border dark:border-gray-700 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">{editingTemplate ? '✏️ Edit Template' : '➕ Add New Template'}</h4>
              {editingTemplate && (
                <button type="button" onClick={() => { setEditingTemplate(null); document.getElementById('template-form').reset() }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block text-gray-700 dark:text-gray-300">Name</label>
                <input name="name" required placeholder="e.g. Leo Dict" defaultValue={editingTemplate?.name || 'Dict'} key={`name-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block text-gray-700 dark:text-gray-300">Language</label>
                <input name="language" required placeholder="e.g. German, All" defaultValue={editingTemplate?.language || ''} key={`lang-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block text-gray-700 dark:text-gray-300">Icon URL (optional)</label>
                <input name="icon_url" placeholder="https://..." defaultValue={editingTemplate?.icon_url || ''} key={`icon-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-gray-700 dark:text-gray-300">URL Template</label>
              <input name="url_template" required placeholder="https://dict.leo.org/german-english/{{str}}" defaultValue={editingTemplate?.url_template || ''} key={`url-${editingTemplate?.id || 'new'}`} className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="bg-gray-800 dark:bg-gray-600 hover:bg-gray-900 dark:hover:bg-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">{editingTemplate ? 'Update Template' : 'Add Template'}</button>
          </form>
        </Section>

        <div className="pb-6" />
      </div>
    </div>
  )
}
