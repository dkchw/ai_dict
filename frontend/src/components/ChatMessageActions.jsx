import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, RotateCcw, ChevronDown, Trash2, Loader2 } from 'lucide-react';

export default function ChatMessageActions({
  chat,
  index,
  isUser,
  currentModel,
  fallbackModels = [],
  onCopy,
  onRetry,
  onDelete,
  loading = false,
  retryingChatId = null
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef(null);

  const isRetrying = retryingChatId === chat?.id;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (onCopy) {
      onCopy(chat?.content, chat?.id);
    } else if (chat?.content) {
      navigator.clipboard.writeText(chat.content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetryDefault = (e) => {
    e.stopPropagation();
    setShowDropdown(false);
    onRetry?.(chat, currentModel || null);
  };

  const handleSelectModel = (e, model) => {
    e.stopPropagation();
    setShowDropdown(false);
    onRetry?.(chat, model);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(chat);
  };

  // Filter valid fallback models, excluding the current model if it's already there
  const validFallbacks = (fallbackModels || [])
    .map(m => (typeof m === 'string' ? m.trim() : (m?.id || '')))
    .filter(m => m && m !== currentModel);

  if (isUser) {
    return (
      <div className="mt-2.5 pt-2 border-t border-blue-500/40 flex items-center justify-end gap-1.5 text-xs text-blue-100 select-none">
        {/* Copy Button */}
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded-md hover:bg-blue-500/50 text-blue-100 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          title="Copy question"
        >
          {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
        </button>

        {/* Retry Button with Fallback Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <div className="inline-flex items-center rounded-md bg-blue-700/60 hover:bg-blue-700/80 border border-blue-400/40 text-blue-100 text-xs overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={handleRetryDefault}
              disabled={loading}
              className="px-2 py-1 hover:bg-blue-600/70 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Retry answer with current model"
            >
              {isRetrying ? (
                <Loader2 size={12} className="animate-spin text-blue-200" />
              ) : (
                <RotateCcw size={12} />
              )}
              <span className="text-[11px] font-medium">Retry</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown(!showDropdown);
              }}
              disabled={loading}
              className="px-1.5 py-1 hover:bg-blue-600/70 border-l border-blue-500/40 transition-colors cursor-pointer disabled:opacity-50"
              title="Choose model to retry with"
            >
              <ChevronDown size={11} className={`transition-transform duration-150 ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Model selection dropdown */}
          {showDropdown && (
            <div className="absolute right-0 bottom-full mb-1.5 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden py-1 z-30 text-gray-800 dark:text-gray-100 divide-y divide-gray-100 dark:divide-gray-700/60 animate-fadeIn">
              <div className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">
                Retry with model:
              </div>
              <div className="py-1 max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={(e) => handleSelectModel(e, currentModel || null)}
                  className="block w-full text-left px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/80 cursor-pointer"
                >
                  <span className="font-semibold text-blue-600 dark:text-blue-400">Default Model</span>
                  {currentModel && (
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate font-normal">
                      {currentModel}
                    </span>
                  )}
                </button>
                {validFallbacks.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => handleSelectModel(e, m)}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/80 truncate cursor-pointer"
                    title={m}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delete Button */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="p-1 rounded-md hover:bg-red-500/50 text-blue-200 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          title="Delete message"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  // Assistant message actions
  return (
    <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-start gap-1.5 text-xs text-gray-500 dark:text-gray-400 select-none">
      {/* Copy Button */}
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/80 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer flex items-center gap-1"
        title="Copy response"
      >
        {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      </button>

      {/* Retry Button with Fallback Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div className="inline-flex items-center rounded-lg bg-gray-100/90 dark:bg-gray-700/60 hover:bg-gray-200/80 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600/70 text-gray-700 dark:text-gray-200 text-xs overflow-hidden shadow-2xs">
          <button
            type="button"
            onClick={handleRetryDefault}
            disabled={loading}
            className="px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Retry response with current model"
          >
            {isRetrying ? (
              <Loader2 size={12} className="animate-spin text-blue-500" />
            ) : (
              <RotateCcw size={12} />
            )}
            <span className="text-[11px] font-medium">Retry</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(!showDropdown);
            }}
            disabled={loading}
            className="px-1.5 py-1 hover:bg-gray-200 dark:hover:bg-gray-600 border-l border-gray-200 dark:border-gray-600/70 transition-colors cursor-pointer disabled:opacity-50"
            title="Choose model to retry with"
          >
            <ChevronDown size={11} className={`transition-transform duration-150 ${showDropdown ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Model selection dropdown */}
        {showDropdown && (
          <div className="absolute left-0 bottom-full mb-1.5 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden py-1 z-30 text-gray-800 dark:text-gray-100 divide-y divide-gray-100 dark:divide-gray-700/60 animate-fadeIn">
            <div className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">
              Retry with model:
            </div>
            <div className="py-1 max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={(e) => handleSelectModel(e, currentModel || null)}
                className="block w-full text-left px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/80 cursor-pointer"
              >
                <span className="font-semibold text-blue-600 dark:text-blue-400">Default Model</span>
                {currentModel && (
                  <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate font-normal">
                    {currentModel}
                  </span>
                )}
              </button>
              {validFallbacks.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={(e) => handleSelectModel(e, m)}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700/80 truncate cursor-pointer"
                  title={m}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Button */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-400 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-50"
        title="Delete message"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
