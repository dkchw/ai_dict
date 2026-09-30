import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import MarkdownRenderer from './components/MarkdownRenderer'
import SearchTab from './components/SearchTab'
import CompareTab from './components/CompareTab'
import ExplainTab from './components/ExplainTab'
import TranslationTab from './components/TranslationTab'
import CorrectionTab from './components/CorrectionTab'
import LlmTab from './components/LlmTab'
import MtTab from './components/MtTab'
import QuickLlmTab from './components/QuickLlmTab'
import SettingsTab from './components/SettingsTab'
import FlashcardTab from './components/FlashcardTab'
import StarRating from './components/StarRating'
import {
  Search, Globe, History, Settings as SettingsIcon, BookOpen, Share2, Trash2,
  ExternalLink, Moon, Sun, Loader2, RefreshCw, Library, GitCompare, List, Menu,
  MessageSquare, ScanLine, Palette, Edit, ChevronUp, ChevronDown, ArrowLeft,
  ArrowRightLeft, Layers, X, Plus, Shuffle, Eye, Sparkles, Star, CheckCircle2, AlertCircle,
  Folder, FolderPlus, FolderInput, CheckSquare, Calendar, Clock, Play,
  User, ChevronsUpDown, ArrowUpDown, Check, CheckCheck, Zap
} from 'lucide-react'

// Colors for bookmarking: Red (Forgot), Orange (Hard), Yellow (Medium), Green (Easy), Blue (Research)
const COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Forgot' },
  { id: 'orange', hex: '#f97316', label: 'Hard' },
  { id: 'yellow', hex: '#eab308', label: 'Medium' },
  { id: 'green', hex: '#22c55e', label: 'Easy' },
  { id: 'blue', hex: '#3b82f6', label: 'Research' }
]

const cleanLemma = (lemma) => {
  if (!lemma) return '';
  let cleaned = String(lemma).replace(/^[•*\-\s]+/, '');
  cleaned = cleaned.replace(/^\*?\*?Base form \(lemma\):?\*?\*?\s*/i, '');
  cleaned = cleaned.replace(/`/g, '').trim();
  cleaned = cleaned.split('\n')[0].trim();
  return cleaned;
};

const isEmojiString = (str) => {
  if (!str) return false;
  try {
    return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(str);
  } catch (e) {
    return false;
  }
};

const getProfileInitial = (name) => {
  if (!name) return 'P';
  const trimmed = String(name).trim();
  if (!trimmed) return 'P';

  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      // If there's an emoji anywhere in the name (e.g. '🇩🇪 German', 'German 🇩🇪', '📚 Vocab'), prioritize using that emoji!
      for (const { segment } of segmenter.segment(trimmed)) {
        if (isEmojiString(segment)) {
          return segment;
        }
      }
      // Otherwise use the first grapheme cluster
      const iterator = segmenter.segment(trimmed)[Symbol.iterator]();
      const first = iterator.next().value;
      if (first && first.segment) {
        return isEmojiString(first.segment) ? first.segment : first.segment.toUpperCase();
      }
    }
  } catch (e) {}

  // Fallback: Array.from splits UTF-16 surrogate pairs safely without producing broken '?' replacement chars
  const chars = Array.from(trimmed);
  const foundEmoji = chars.find(c => isEmojiString(c));
  if (foundEmoji) return foundEmoji;
  const first = chars[0] || 'P';
  return isEmojiString(first) ? first : first.toUpperCase();
};

function ProfileAvatar({ name, className = "w-8 h-8 rounded-lg" }) {
  const initial = getProfileInitial(name);
  const isEmoji = isEmojiString(initial);

  return (
    <div 
      className={`${className} bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0 border border-indigo-200/80 dark:border-indigo-700/60 shadow-2xs select-none ${
        isEmoji ? 'text-sm leading-none' : 'text-xs'
      }`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function HoverReviewPopup({ content, anchorRect, popupSize, setPopupSize, isResizingRef, onMouseEnter, onMouseLeave }) {
  const popupRef = useRef(null);
  const containerRef = useRef(null);

  const parsePixelValue = (val, defaultVal) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const num = parseInt(val, 10);
      if (!isNaN(num)) return num;
    }
    return defaultVal;
  };

  const preferredW = parsePixelValue(popupSize?.w, 600);
  const preferredH = popupSize?.h ? parsePixelValue(popupSize.h, 350) : null;

  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Fallback to safe coordinates if anchorRect is absent
  const rect = anchorRect || (containerRef.current?.parentElement ? containerRef.current.parentElement.getBoundingClientRect() : { top: 120, bottom: 150, left: 100, right: 200, width: 100, height: 30 });

  const spaceAbove = rect.top - 16;
  const spaceBelow = windowHeight - rect.bottom - 16;
  const estimatedH = preferredH || 320;

  // Choose whether to display above or below based on space
  const isAbove = (spaceBelow < estimatedH || spaceBelow < 260) && spaceAbove > spaceBelow;

  // Clamped viewport limits:
  const maxAvailableHeight = Math.max(120, Math.floor(isAbove ? rect.top - 20 : windowHeight - rect.bottom - 20));
  const maxAvailableWidth = Math.max(280, windowWidth - 32);

  // Automatic clamp to viewport limits for both upward and downward!
  const clampedW = Math.min(preferredW, maxAvailableWidth);
  const clampedH = preferredH ? Math.min(preferredH, maxAvailableHeight) : null;

  // Clamped horizontal position (keeps popup within screen margins)
  const leftPos = Math.max(12, Math.min(rect.left, windowWidth - clampedW - 16));

  const startResize = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    if (isResizingRef) isResizingRef.current = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popupRef.current ? popupRef.current.offsetWidth : clampedW;
    const startH = popupRef.current ? popupRef.current.offsetHeight : (clampedH || 320);
    const startLeft = containerRef.current ? containerRef.current.offsetLeft : leftPos;

    let finalW = startW;
    let finalH = startH;

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';

    let dragCursor = 'nwse-resize';
    if (direction === 'right' || direction === 'left') dragCursor = 'ew-resize';
    else if (direction === 'top' || direction === 'bottom') dragCursor = 'ns-resize';
    else if (direction === 'top-right' || direction === 'bottom-left') dragCursor = 'nesw-resize';
    document.body.style.cursor = dragCursor;

    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newW = startW;
      let newH = startH;

      if (direction.includes('right')) {
        const maxW = windowWidth - startLeft - 16;
        newW = Math.max(260, Math.min(startW + deltaX, maxW));
      } else if (direction.includes('left')) {
        const maxW = startLeft + startW - 16;
        newW = Math.max(260, Math.min(startW - deltaX, maxW));
        if (containerRef.current) {
          containerRef.current.style.left = `${startLeft + (startW - newW)}px`;
        }
      }

      if (direction.includes('bottom')) {
        if (!isAbove) {
          newH = Math.max(120, Math.min(startH + deltaY, maxAvailableHeight));
        }
      } else if (direction.includes('top')) {
        if (isAbove) {
          newH = Math.max(120, Math.min(startH - deltaY, maxAvailableHeight));
        }
      }

      finalW = newW;
      finalH = newH;

      // Direct DOM manipulation during mousemove - zero lag, buttery smooth!
      if (popupRef.current) {
        if (direction.includes('right') || direction.includes('left')) {
          popupRef.current.style.width = `${newW}px`;
        }
        if (direction.includes('bottom') || direction.includes('top')) {
          popupRef.current.style.height = `${newH}px`;
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;

      // Persist size cleanly upon release
      setPopupSize({ w: finalW, h: finalH });
      try {
        localStorage.setItem('hoverPopupSize', JSON.stringify({ w: finalW, h: finalH }));
      } catch (err) {}

      // Generous delay so mouseup never triggers an inadvertent mouseleave
      setTimeout(() => {
        if (isResizingRef) isResizingRef.current = false;
      }, 300);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const bridgeGap = 8;

  const containerStyle = {
    position: 'fixed',
    left: `${leftPos}px`,
    zIndex: 9999,
    pointerEvents: 'auto',
    ...(isAbove
      ? {
          bottom: `${windowHeight - rect.top}px`,
          paddingBottom: `${bridgeGap}px`
        }
      : {
          top: `${rect.bottom}px`,
          paddingTop: `${bridgeGap}px`
        }
    )
  };

  const popupContent = (
    <div 
      ref={containerRef}
      style={containerStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div 
        ref={popupRef}
        style={{ 
          width: `${clampedW}px`, 
          height: clampedH ? `${clampedH}px` : 'auto', 
          maxHeight: `${maxAvailableHeight}px` 
        }}
        className="relative p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl text-sm overflow-auto custom-scrollbar cursor-auto min-w-[260px] min-h-[120px] select-text text-gray-900 dark:text-gray-100" 
        onClick={e => e.stopPropagation()}
      >
        {/* Horizontal Resize Handles (Left & Right edges) */}
        <div 
          onMouseDown={e => startResize(e, 'right')} 
          className="absolute top-0 right-0 w-3 h-full cursor-ew-resize hover:bg-blue-500/25 active:bg-blue-500/50 transition-colors z-20" 
          title="Drag horizontally to resize width" 
        />
        <div 
          onMouseDown={e => startResize(e, 'left')} 
          className="absolute top-0 left-0 w-3 h-full cursor-ew-resize hover:bg-blue-500/25 active:bg-blue-500/50 transition-colors z-20" 
          title="Drag horizontally to resize width" 
        />

        {/* Vertical Resize Handle */}
        {isAbove ? (
          <div 
            onMouseDown={e => startResize(e, 'top')} 
            className="absolute top-0 left-0 h-3.5 w-full cursor-ns-resize hover:bg-blue-500/25 active:bg-blue-500/50 transition-colors z-20" 
            title="Drag vertically to resize height" 
          />
        ) : (
          <div 
            onMouseDown={e => startResize(e, 'bottom')} 
            className="absolute bottom-0 left-0 h-3.5 w-full cursor-ns-resize hover:bg-blue-500/25 active:bg-blue-500/50 transition-colors z-20" 
            title="Drag vertically to resize height" 
          />
        )}

        {/* Corner Resize Handles */}
        {isAbove ? (
          <>
            <div 
              onMouseDown={e => startResize(e, 'top-right')} 
              className="absolute top-0 right-0 w-7 h-7 cursor-nesw-resize hover:bg-blue-500/30 active:bg-blue-500/60 transition-colors z-30 flex items-center justify-center group" 
              title="Drag diagonally to resize width & height" 
            >
              <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 3l6 6M9 3l12 12" />
              </svg>
            </div>
            <div 
              onMouseDown={e => startResize(e, 'top-left')} 
              className="absolute top-0 left-0 w-7 h-7 cursor-nwse-resize hover:bg-blue-500/30 active:bg-blue-500/60 transition-colors z-30 flex items-center justify-center group" 
              title="Drag diagonally to resize width & height" 
            >
              <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 3l-6 6M15 3l-12 12" />
              </svg>
            </div>
          </>
        ) : (
          <>
            <div 
              onMouseDown={e => startResize(e, 'bottom-right')} 
              className="absolute bottom-0 right-0 w-7 h-7 cursor-nwse-resize hover:bg-blue-500/30 active:bg-blue-500/60 transition-colors z-30 flex items-center justify-center group" 
              title="Drag diagonally to resize width & height" 
            >
              <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15l-6 6M21 9l-12 12" />
              </svg>
            </div>
            <div 
              onMouseDown={e => startResize(e, 'bottom-left')} 
              className="absolute bottom-0 left-0 w-7 h-7 cursor-nesw-resize hover:bg-blue-500/30 active:bg-blue-500/60 transition-colors z-30 flex items-center justify-center group" 
              title="Drag diagonally to resize width & height" 
            >
              <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 15l6 6M3 9l12 12" />
              </svg>
            </div>
          </>
        )}

        {content ? (
          <div className="markdown-body pr-2">
            <MarkdownRenderer>{content}</MarkdownRenderer>
          </div>
        ) : (
          <div className="flex items-center justify-center p-6 gap-2 text-gray-400">
            <Loader2 className="animate-spin text-blue-500 w-5 h-5" />
            <span className="text-xs">Loading preview...</span>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(popupContent, document.body) : popupContent;
}

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const rawQ = urlParams.get('q');
  const pathParts = window.location.pathname.split('/').filter(Boolean);

  let initialTab = 'search';
  if (pathParts[0] === 'compare') initialTab = 'compare';
  else if (pathParts[0] === 'explain') initialTab = 'explain';
  else if (pathParts[0] === 'translation') initialTab = 'translation';
  else if (pathParts[0] === 'correction') initialTab = 'correction';
  else if (pathParts[0] === 'llm') initialTab = 'llm';
  else if (pathParts[0] === 'settings') initialTab = 'settings';
  else if (pathParts[0] === 'flashcard' || pathParts[0] === 'flashcards') initialTab = 'flashcard';
  else if (pathParts[0] === 'mt' || pathParts[0] === 'machinetranslation') initialTab = 'mt';
  else if (pathParts[0] === 'quickllm' || pathParts[0] === 'quick-llm' || pathParts[0] === 'simplellm') initialTab = 'quick_llm';

  const [activeTab, setActiveTab] = useState(initialTab);

  // Search Tabs State
  const isSearchRoute = pathParts.length === 0 || pathParts[0] === 'search';
  let initialSearchQ = (isSearchRoute && rawQ) ? rawQ : '';
  let openSearchHistory = false;
  let initSearchHistoryQ = '';
  if (!initialSearchQ && isSearchRoute && pathParts.length >= 2 && pathParts[0] === 'search') {
    const q = decodeURIComponent(pathParts.slice(1).join('/'));
    openSearchHistory = true;
    if (q.toLowerCase() !== 'history') {
      initSearchHistoryQ = q.toLowerCase().startsWith('history/') ? q.substring(8) : q;
    }
  }

  const [searchTabs, setSearchTabs] = useState(
    initialSearchQ ? [
      { id: 'history', title: 'History' },
      { id: 'init', title: initialSearchQ, loading: false, hasData: false, initialWord: { term: initialSearchQ, isTemp: true } }
    ] : [
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Search', loading: false, hasData: false, initialWord: null }
    ]
  );
  const [activeSearchTabId, setActiveSearchTabId] = useState(openSearchHistory ? 'history' : 'init');
  const [historySearchTerm, setHistorySearchTerm] = useState(initSearchHistoryQ || '');

  // Compare Tabs State
  let initialCompareQ = (pathParts[0] === 'compare' && rawQ) ? rawQ : '';
  let openCompareHistory = false;
  let initCompareHistoryQ = '';
  if (!initialCompareQ && pathParts.length >= 2 && pathParts[0] === 'compare') {
    const q = decodeURIComponent(pathParts.slice(1).join('/'));
    openCompareHistory = true;
    if (q.toLowerCase() !== 'history') {
      initCompareHistoryQ = q.toLowerCase().startsWith('history/') ? q.substring(8) : q;
    }
  }

  const [compareTabs, setCompareTabs] = useState(
    initialCompareQ ? [
      { id: 'history', title: 'History' },
      { id: 'init', title: initialCompareQ, loading: false, hasData: false, initialComparison: { terms: initialCompareQ, isTemp: true } }
    ] : [
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Compare', loading: false, hasData: false, initialComparison: null }
    ]
  );
  const [activeCompareTabId, setActiveCompareTabId] = useState(openCompareHistory ? 'history' : 'init');
  const [compareHistorySearchTerm, setCompareHistorySearchTerm] = useState(initCompareHistoryQ || '');

  // Explain Tabs State
  let initialExplainQ = (pathParts[0] === 'explain' && rawQ) ? rawQ : '';
  let openExplainHistory = false;
  let initExplainHistoryQ = '';
  if (!initialExplainQ && pathParts.length >= 2 && pathParts[0] === 'explain') {
    const q = decodeURIComponent(pathParts.slice(1).join('/'));
    openExplainHistory = true;
    if (q.toLowerCase() !== 'history') {
      initExplainHistoryQ = q.toLowerCase().startsWith('history/') ? q.substring(8) : q;
    }
  }

  const [explainTabs, setExplainTabs] = useState(
    initialExplainQ ? [
      { id: 'history', title: 'History' },
      { id: 'init', title: initialExplainQ, loading: false, hasData: false, initialExplain: { text: initialExplainQ, isTemp: true } }
    ] : [
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Explain', loading: false, hasData: false, initialExplain: null }
    ]
  );
  const [activeExplainTabId, setActiveExplainTabId] = useState(openExplainHistory ? 'history' : 'init');
  const [explainHistorySearchTerm, setExplainHistorySearchTerm] = useState(initExplainHistoryQ || '');

  // Translation Tabs State
  let initialTranslationQ = (pathParts[0] === 'translation' && rawQ) ? rawQ : '';
  let openTranslationHistory = false;
  let initTranslationHistoryQ = '';
  if (!initialTranslationQ && pathParts.length >= 2 && pathParts[0] === 'translation') {
    const q = decodeURIComponent(pathParts.slice(1).join('/'));
    openTranslationHistory = true;
    if (q.toLowerCase() !== 'history') {
      initTranslationHistoryQ = q.toLowerCase().startsWith('history/') ? q.substring(8) : q;
    }
  }

  const [translationTabs, setTranslationTabs] = useState(
    initialTranslationQ ? [
      { id: 'history', title: 'History' },
      { id: 'init', title: initialTranslationQ, loading: false, hasData: false, initialTranslation: { text: initialTranslationQ, isTemp: true } }
    ] : [
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Translation', loading: false, hasData: false, initialTranslation: null }
    ]
  );
  const [activeTranslationTabId, setActiveTranslationTabId] = useState(openTranslationHistory ? 'history' : 'init');
  const [translationHistorySearchTerm, setTranslationHistorySearchTerm] = useState(initTranslationHistoryQ || '');

  // Correction Tabs State
  let initialCorrectionQ = (pathParts[0] === 'correction' && rawQ) ? rawQ : '';
  let openCorrectionHistory = false;
  let initCorrectionHistoryQ = '';
  if (!initialCorrectionQ && pathParts.length >= 2 && pathParts[0] === 'correction') {
    const q = decodeURIComponent(pathParts.slice(1).join('/'));
    openCorrectionHistory = true;
    if (q.toLowerCase() !== 'history') {
      initCorrectionHistoryQ = q.toLowerCase().startsWith('history/') ? q.substring(8) : q;
    }
  }

  const [correctionTabs, setCorrectionTabs] = useState(
    initialCorrectionQ ? [
      { id: 'history', title: 'History' },
      { id: 'init', title: initialCorrectionQ, loading: false, hasData: false, initialCorrection: { text: initialCorrectionQ, isTemp: true } }
    ] : [
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Correction', loading: false, hasData: false, initialCorrection: null }
    ]
  );
  const [activeCorrectionTabId, setActiveCorrectionTabId] = useState(openCorrectionHistory ? 'history' : 'init');
  const [correctionHistorySearchTerm, setCorrectionHistorySearchTerm] = useState(initCorrectionHistoryQ || '');

  // LLM Tabs State
  let initialLlmQ = (pathParts[0] === 'llm' && rawQ) ? rawQ : '';
  let openLlmHistory = false;
  let initLlmHistoryQ = '';
  if (!initialLlmQ && pathParts.length >= 2 && pathParts[0] === 'llm') {
    const q = decodeURIComponent(pathParts.slice(1).join('/'));
    openLlmHistory = true;
    if (q.toLowerCase() !== 'history') {
      initLlmHistoryQ = q.toLowerCase().startsWith('history/') ? q.substring(8) : q;
    }
  }

  const [llmTabs, setLlmTabs] = useState(
    initialLlmQ ? [
      { id: 'history', title: 'History' },
      { id: 'init', title: initialLlmQ.substring(0, 25), loading: false, hasData: false, initialLlm: { text: initialLlmQ, isTemp: true } }
    ] : [
      { id: 'history', title: 'History' },
      { id: 'init', title: 'Special LLM', loading: false, hasData: false, initialLlm: null }
    ]
  );
  const [activeLlmTabId, setActiveLlmTabId] = useState(openLlmHistory ? 'history' : 'init');
  const [llmHistorySearchTerm, setLlmHistorySearchTerm] = useState(initLlmHistoryQ || '');

  // Machine Translation (MT) Tabs State
  let initialMtQ = ((pathParts[0] === 'mt' || pathParts[0] === 'machinetranslation') && rawQ) ? rawQ : '';
  let openMtHistory = false;
  let initMtHistoryQ = '';
  if (!initialMtQ && pathParts.length >= 2 && (pathParts[0] === 'mt' || pathParts[0] === 'machinetranslation')) {
    const q = decodeURIComponent(pathParts.slice(1).join('/'));
    openMtHistory = true;
    if (q.toLowerCase() !== 'history') {
      initMtHistoryQ = q.toLowerCase().startsWith('history/') ? q.substring(8) : q;
    }
  }

  const [mtTabs, setMtTabs] = useState(
    initialMtQ ? [
      { id: 'history', title: 'History' },
      { id: 'init', title: initialMtQ.substring(0, 25), loading: false, hasData: false, initialMt: { text: initialMtQ, isTemp: true } }
    ] : [
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Translation', loading: false, hasData: false, initialMt: null }
    ]
  );
  const [activeMtTabId, setActiveMtTabId] = useState(openMtHistory ? 'history' : 'init');
  const [mtHistorySearchTerm, setMtHistorySearchTerm] = useState(initMtHistoryQ || '');

  // Profile and Data state
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(
    parseInt(localStorage.getItem('activeProfileId')) || parseInt(sessionStorage.getItem('activeProfileId')) || 1
  );
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem('active_session_id') || '');
  const [moveSessionModal, setMoveSessionModal] = useState(null);
  const [deleteSessionModal, setDeleteSessionModal] = useState(null);
  const [moveItemModal, setMoveItemModal] = useState(null);
  const [moveModeModal, setMoveModeModal] = useState(null);
  const [manageSessionsModalOpen, setManageSessionsModalOpen] = useState(false);
  const [isWordSelectMode, setIsWordSelectMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState(new Set());
  const [moveToSessionModal, setMoveToSessionModal] = useState(null);
  const [flashcardInitialSession, setFlashcardInitialSession] = useState(null);
  const [flashcardInitialModes, setFlashcardInitialModes] = useState(null);
  const [flashcardInitialViewMode, setFlashcardInitialViewMode] = useState('practice');

  // Profile management & quick-switcher state
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [manageProfilesModalOpen, setManageProfilesModalOpen] = useState(false);
  const profileDropdownRef = useRef(null);
  const [newProfileInputName, setNewProfileInputName] = useState('');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState(null);

  // Close profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    };
    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileDropdownOpen]);

  // Floating Toast Notifications System
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type = 'info', title, message, actionLabel, onAction, duration = 6000 }) => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, type, title, message, actionLabel, onAction, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const updateToast = useCallback((id, updates) => {
    setToasts(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, ...updates };
      if (updates.duration && updates.duration > 0) {
        setTimeout(() => {
          setToasts(curr => curr.filter(item => item.id !== id));
        }, updates.duration);
      }
      return updated;
    }));
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const [words, setWords] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [explains, setExplains] = useState([]);
  const [translations, setTranslations] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [llmRecords, setLlmRecords] = useState([]);
  const [mtRecords, setMtRecords] = useState([]);

  // Deep Search
  const [deepSearch, setDeepSearch] = useState(() => {
    const saved = localStorage.getItem('deepSearch');
    return saved !== null ? JSON.parse(saved) : false;
  });
  useEffect(() => {
    localStorage.setItem('deepSearch', JSON.stringify(deepSearch));
  }, [deepSearch]);

  // Language state & Sync helper
  const syncLang = (key, val, setter) => {
    setter(val);
    localStorage.setItem(key, val);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: val })
    }).catch(e => console.error(e));
  };

  const NORMALIZE_LANG_MAP = {
    'auto detect': '🌐 Auto',
    'auto': '🌐 Auto',
    'src: auto': '🌐 Auto',
    'tgt: auto': '🌐 Auto',
    'english': '🇺🇸 EN',
    'en': '🇺🇸 EN',
    'german': '🇩🇪 DE',
    'de': '🇩🇪 DE',
    'vietnamese': '🇻🇳 VI',
    'vi': '🇻🇳 VI',
    'french': '🇫🇷 FR',
    'fr': '🇫🇷 FR',
    'spanish': '🇪🇸 ES',
    'es': '🇪🇸 ES',
    'japanese': '🇯🇵 JA',
    'ja': '🇯🇵 JA',
    'chinese': '🇨🇳 ZH',
    'zh': '🇨🇳 ZH',
    'korean': '🇰🇷 KO',
    'ko': '🇰🇷 KO',
    'russian': '🇷🇺 RU',
    'ru': '🇷🇺 RU',
    'italian': '🇮🇹 IT',
    'it': '🇮🇹 IT',
    'portuguese': '🇵🇹 PT',
    'pt': '🇵🇹 PT',
    'dutch': '🇳🇱 NL',
    'nl': '🇳🇱 NL',
    'arabic': '🇸🇦 AR',
    'ar': '🇸🇦 AR',
  };

  const normalizeLang = (lang, fallback = '🌐 Auto') => {
    if (!lang) return fallback;
    const key = lang.trim().toLowerCase();
    return NORMALIZE_LANG_MAP[key] || lang.trim();
  };

  const DEFAULT_LANGS = ['🌐 Auto', '🇺🇸 EN', '🇩🇪 DE', '🇻🇳 VI', '🇫🇷 FR', '🇪🇸 ES', '🇯🇵 JA', '🇨🇳 ZH', '🇰🇷 KO'];

  const [searchTargetLang, setSearchTargetLang] = useState(() => normalizeLang(localStorage.getItem(`searchTargetLang_${activeProfileId}`), '🇺🇸 EN'));
  const [searchSourceLang, setSearchSourceLang] = useState(() => normalizeLang(localStorage.getItem(`searchSourceLang_${activeProfileId}`), '🌐 Auto'));

  const [compareTargetLang, setCompareTargetLang] = useState(() => 
    normalizeLang(localStorage.getItem(`compareTargetLang_${activeProfileId}`)) || 
    normalizeLang(localStorage.getItem(`searchTargetLang_${activeProfileId}`), '🇺🇸 EN')
  );
  const [compareSourceLang, setCompareSourceLang] = useState(() => normalizeLang(localStorage.getItem(`compareSourceLang_${activeProfileId}`), '🌐 Auto'));

  const [explainTargetLang, setExplainTargetLang] = useState(() => 
    normalizeLang(localStorage.getItem(`explainTargetLang_${activeProfileId}`)) || 
    normalizeLang(localStorage.getItem(`searchTargetLang_${activeProfileId}`), '🇺🇸 EN')
  );
  const [explainSourceLang, setExplainSourceLang] = useState(() => normalizeLang(localStorage.getItem(`explainSourceLang_${activeProfileId}`), '🌐 Auto'));

  const [translationSourceLang, setTranslationSourceLang] = useState(() => normalizeLang(localStorage.getItem(`translationSourceLang_${activeProfileId}`), '🌐 Auto'));
  const [translationTargetLang, setTranslationTargetLang] = useState(() => normalizeLang(localStorage.getItem(`translationTargetLang_${activeProfileId}`), '🇺🇸 EN'));

  const [translationLangs, setTranslationLangs] = useState(() => {
    const saved = localStorage.getItem('translationLangs');
    if (!saved) return DEFAULT_LANGS;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(l => normalizeLang(l, l));
      }
    } catch (e) {}
    return DEFAULT_LANGS;
  });
  useEffect(() => {
    localStorage.setItem('translationLangs', JSON.stringify(translationLangs));
  }, [translationLangs]);

  const [correctionSourceLang, setCorrectionSourceLang] = useState(() => normalizeLang(localStorage.getItem(`correctionSourceLang_${activeProfileId}`), '🌐 Auto'));
  const [correctionTargetLang, setCorrectionTargetLang] = useState(() => normalizeLang(localStorage.getItem(`correctionTargetLang_${activeProfileId}`), '🇺🇸 EN'));
  const [correctionModeType, setCorrectionModeType] = useState(() => localStorage.getItem(`correctionModeType_${activeProfileId}`) || 'both');
  const [correctionLangs, setCorrectionLangs] = useState(() => {
    const saved = localStorage.getItem('correctionLangs');
    if (!saved) return DEFAULT_LANGS;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(l => normalizeLang(l, l));
      }
    } catch (e) {}
    return DEFAULT_LANGS;
  });
  useEffect(() => {
    localStorage.setItem('correctionLangs', JSON.stringify(correctionLangs));
  }, [correctionLangs]);

  const [llmSourceLang, setLlmSourceLang] = useState(() => normalizeLang(localStorage.getItem(`llmSourceLang_${activeProfileId}`), '🌐 Auto'));
  const [llmTargetLang, setLlmTargetLang] = useState(() => normalizeLang(localStorage.getItem(`llmTargetLang_${activeProfileId}`), '🇺🇸 EN'));
  const [llmLangs, setLlmLangs] = useState(() => {
    const saved = localStorage.getItem('llmLangs');
    if (!saved) return DEFAULT_LANGS;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(l => normalizeLang(l, l));
      }
    } catch (e) {}
    return DEFAULT_LANGS;
  });
  useEffect(() => {
    localStorage.setItem('llmLangs', JSON.stringify(llmLangs));
  }, [llmLangs]);

  const [mtSourceLang, setMtSourceLang] = useState(() => normalizeLang(localStorage.getItem(`mtSourceLang_${activeProfileId}`), '🌐 Auto'));
  const [mtTargetLang, setMtTargetLang] = useState(() => normalizeLang(localStorage.getItem(`mtTargetLang_${activeProfileId}`), '🇺🇸 EN'));

  const [settings, setSettings] = useState({ OPENROUTER_API_KEY: '', MAIN_MODEL: '', EXPLAIN_MODEL: '', COMPARE_MODEL: '', TRANSLATION_MODEL: '', CHAT_MODEL: '', FALLBACK_MODELS: '' });
  const [defaultSettings, setDefaultSettings] = useState({});
  const [templates, setTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [models, setModels] = useState([]);
  const [theme, setTheme] = useState('tokyonight');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historySort, setHistorySort] = useState('date');

  // Internal Tabs state (default: false)
  const [internalTabsEnabled, setInternalTabsEnabled] = useState(() => {
    const saved = localStorage.getItem('internalTabsEnabled');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const updateInternalTabsEnabled = (enabled) => {
    setInternalTabsEnabled(enabled);
    localStorage.setItem('internalTabsEnabled', JSON.stringify(enabled));
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'INTERNAL_TABS', value: JSON.stringify(enabled) })
    }).catch(e => console.error(e));
  };

  // Hover Preview states
  const [hoverReviewMode, setHoverReviewMode] = useState(() => {
    const saved = localStorage.getItem('hoverReviewMode');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleHoverReviewMode = () => {
    const next = !hoverReviewMode;
    setHoverReviewMode(next);
    localStorage.setItem('hoverReviewMode', JSON.stringify(next));
  };

  // Show Recent Lookups on Empty State (default: false)
  const [showRecentEmpty, setShowRecentEmpty] = useState(() => {
    const saved = localStorage.getItem('showRecentEmpty');
    return saved !== null ? saved === 'true' : false;
  });

  const updateShowRecentEmpty = (enabled) => {
    setShowRecentEmpty(enabled);
    const val = enabled ? 'true' : 'false';
    localStorage.setItem('showRecentEmpty', val);
    setSettings(prev => ({ ...prev, SHOW_RECENT_EMPTY: val }));
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'SHOW_RECENT_EMPTY', value: val })
    }).catch(e => console.error(e));
  };

  const [hoveredPreviewId, setHoveredPreviewId] = useState(null);
  const [hoverAnchorRect, setHoverAnchorRect] = useState(null);
  const [previewContent, setPreviewContent] = useState({});

  const [popupSize, setPopupSize] = useState(() => {
    const saved = localStorage.getItem('hoverPopupSize');
    return saved ? JSON.parse(saved) : null;
  });

  const hoverLeaveTimerRef = useRef(null);
  const hoverEnterTimerRef = useRef(null);
  const isResizingRef = useRef(false);

  const handleHover = (id, type, targetEl) => {
    if (!hoverReviewMode) return;
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }

    const rect = targetEl ? targetEl.getBoundingClientRect() : null;

    if (hoverEnterTimerRef.current) {
      clearTimeout(hoverEnterTimerRef.current);
    }

    // Small 70ms debounce so rapid mouse movements across list don't flash or spam requests
    hoverEnterTimerRef.current = setTimeout(async () => {
      setHoverAnchorRect(rect);
      setHoveredPreviewId(id);

      if (!previewContent[id]) {
        const endpoint = type === 'search' ? `/api/words/${id}/preview` :
                         type === 'compare' ? `/api/comparisons/${id}/preview` :
                         type === 'translation' ? `/api/translations/${id}/preview` :
                         type === 'correction' ? `/api/corrections/${id}/preview` :
                         type === 'llm' ? `/api/llm/records/${id}/preview` :
                         `/api/explains/${id}/preview`;
        try {
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            setPreviewContent(prev => ({ ...prev, [id]: data.content }));
          }
        } catch (e) {
          console.error(e);
        }
      }
    }, 70);
  };

  const handleHoverLeave = () => {
    if (isResizingRef.current) return;
    if (hoverEnterTimerRef.current) {
      clearTimeout(hoverEnterTimerRef.current);
      hoverEnterTimerRef.current = null;
    }
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
    }
    hoverLeaveTimerRef.current = setTimeout(() => {
      if (!isResizingRef.current) {
        setHoveredPreviewId(null);
        setHoverAnchorRect(null);
      }
    }, 350);
  };

  const handlePopupMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  };

  useEffect(() => {
    const handleScroll = (e) => {
      if (isResizingRef.current) return;
      if (e.target && e.target.closest && e.target.closest('.custom-scrollbar')) return;
      setHoveredPreviewId(null);
      setHoverAnchorRect(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // API fetches
  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) setProfiles(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectProfile = (profileId) => {
    const targetId = parseInt(profileId);
    if (!targetId || targetId === activeProfileId) {
      setProfileDropdownOpen(false);
      return;
    }
    const targetProfile = profiles.find(p => p.id === targetId);
    setActiveProfileId(targetId);
    setProfileDropdownOpen(false);
    addToast({
      type: 'success',
      title: 'Profile Switched',
      message: `Active profile is now "${targetProfile?.name || targetId}"`,
      duration: 2500
    });
  };

  const handleCreateProfile = async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setIsCreatingProfile(true);
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      if (res.ok) {
        const newP = await res.json();
        await fetchProfiles();
        setActiveProfileId(newP.id);
        setNewProfileInputName('');
        setProfileDropdownOpen(false);
        addToast({
          type: 'success',
          title: 'Profile Created',
          message: `Created and switched to profile "${newP.name}"`,
          duration: 3000
        });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({
          type: 'error',
          title: 'Creation Failed',
          message: err.detail || 'Could not create profile'
        });
      }
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: 'Network Error',
        message: 'Failed to communicate with server'
      });
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const handleRenameProfile = async (profileId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/profiles/${profileId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      if (res.ok) {
        await fetchProfiles();
        setEditingProfileId(null);
        setEditingProfileName('');
        addToast({
          type: 'success',
          title: 'Profile Renamed',
          message: `Profile renamed to "${trimmed}"`,
          duration: 2500
        });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({
          type: 'error',
          title: 'Rename Failed',
          message: err.detail || 'Could not rename profile'
        });
      }
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: 'Network Error',
        message: 'Failed to rename profile'
      });
    }
  };

  const handleSetDefaultProfile = async (profileId) => {
    try {
      const res = await fetch(`/api/profiles/${profileId}/set_default`, {
        method: 'PATCH'
      });
      if (res.ok) {
        await fetchProfiles();
        const p = profiles.find(item => item.id === profileId);
        addToast({
          type: 'success',
          title: 'Default Profile Updated',
          message: `"${p?.name || 'Profile'}" is now the default profile`,
          duration: 2500
        });
      } else {
        addToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to set default profile'
        });
      }
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: 'Network Error',
        message: 'Network error setting default profile'
      });
    }
  };

  const handleDeleteProfile = async (profileId) => {
    const targetProfile = profiles.find(p => p.id === profileId);
    if (targetProfile?.is_default) {
      addToast({
        type: 'error',
        title: 'Action Prohibited',
        message: 'Cannot delete the default profile'
      });
      return;
    }
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setConfirmDeleteProfileId(null);
        if (activeProfileId === profileId) {
          const fallback = profiles.find(p => p.is_default && p.id !== profileId) || profiles.find(p => p.id !== profileId);
          if (fallback) {
            setActiveProfileId(fallback.id);
          }
        }
        await fetchProfiles();
        addToast({
          type: 'success',
          title: 'Profile Deleted',
          message: `Profile "${targetProfile?.name || ''}" and its associated history were deleted`,
          duration: 3000
        });
      } else {
        const err = await res.json().catch(() => ({}));
        addToast({
          type: 'error',
          title: 'Deletion Failed',
          message: err.detail || 'Could not delete profile'
        });
      }
    } catch (e) {
      console.error(e);
      addToast({
        type: 'error',
        title: 'Network Error',
        message: 'Network error deleting profile'
      });
    }
  };

  const handleMoveProfileRank = async (profileId, direction) => {
    const idx = profiles.findIndex(p => p.id === profileId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === profiles.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newProfiles = [...profiles];
    const temp = newProfiles[idx];
    newProfiles[idx] = newProfiles[targetIdx];
    newProfiles[targetIdx] = temp;
    
    setProfiles(newProfiles);

    try {
      const res = await fetch('/api/profiles/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_ids: newProfiles.map(p => p.id) })
      });
      if (!res.ok) {
        await fetchProfiles();
      }
    } catch (e) {
      console.error(e);
      await fetchProfiles();
    }
  };

  const fetchWords = async () => {
    try {
      const res = await fetch(`/api/words?profile_id=${activeProfileId}`);
      if (res.ok) setWords(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchComparisons = async () => {
    try {
      const res = await fetch(`/api/comparisons?profile_id=${activeProfileId}`);
      if (res.ok) setComparisons(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchExplains = async () => {
    try {
      const res = await fetch(`/api/explains?profile_id=${activeProfileId}`);
      if (res.ok) setExplains(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTranslations = async () => {
    try {
      const res = await fetch(`/api/translations?profile_id=${activeProfileId}`);
      if (res.ok) setTranslations(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCorrections = async () => {
    try {
      const res = await fetch(`/api/corrections?profile_id=${activeProfileId}`);
      if (res.ok) setCorrections(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLlmRecords = async () => {
    try {
      const res = await fetch(`/api/llm/records?profile_id=${activeProfileId}`);
      if (res.ok) setLlmRecords(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMtRecords = async () => {
    try {
      const res = await fetch(`/api/mt/records?profile_id=${activeProfileId}`);
      if (res.ok) setMtRecords(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);

  const handleRefreshHistory = async (mode) => {
    if (isRefreshingHistory) return;
    setIsRefreshingHistory(true);
    try {
      if (mode === 'words') {
        await fetchWords();
        fetchComparisons();
        fetchExplains();
        fetchTranslations();
        fetchCorrections();
        fetchLlmRecords();
        fetchMtRecords();
      } else if (mode === 'comparisons') {
        await fetchComparisons();
        fetchWords();
        fetchExplains();
        fetchTranslations();
        fetchCorrections();
        fetchLlmRecords();
        fetchMtRecords();
      } else if (mode === 'explains') {
        await fetchExplains();
        fetchWords();
        fetchComparisons();
        fetchTranslations();
        fetchCorrections();
        fetchLlmRecords();
        fetchMtRecords();
      } else if (mode === 'translations') {
        await fetchTranslations();
        fetchWords();
        fetchComparisons();
        fetchExplains();
        fetchCorrections();
        fetchLlmRecords();
        fetchMtRecords();
      } else if (mode === 'corrections') {
        await fetchCorrections();
        fetchWords();
        fetchComparisons();
        fetchExplains();
        fetchTranslations();
        fetchLlmRecords();
        fetchMtRecords();
      } else if (mode === 'llm') {
        await fetchLlmRecords();
        fetchWords();
        fetchComparisons();
        fetchExplains();
        fetchTranslations();
        fetchCorrections();
        fetchMtRecords();
      } else if (mode === 'mt') {
        await fetchMtRecords();
        fetchWords();
        fetchComparisons();
        fetchExplains();
        fetchTranslations();
        fetchCorrections();
        fetchLlmRecords();
      } else {
        await Promise.all([
          fetchWords(),
          fetchComparisons(),
          fetchExplains(),
          fetchTranslations(),
          fetchCorrections(),
          fetchLlmRecords(),
          fetchMtRecords()
        ]);
      }
    } catch (e) {
      console.error('Failed to refresh history:', e);
    } finally {
      setTimeout(() => {
        setIsRefreshingHistory(false);
      }, 400);
    }
  };

  const fetchSettings = async () => {
    try {
      const [res, defRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/settings/defaults')
      ]);
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, ...(data.settings || {}) }));
        setTemplates(data.templates || []);

        if (defRes.ok) {
          const defData = await defRes.json();
          setDefaultSettings(defData);
        }

        if (data.settings && data.settings.INTERNAL_TABS !== undefined) {
          try {
            const val = JSON.parse(data.settings.INTERNAL_TABS);
            setInternalTabsEnabled(val);
            localStorage.setItem('internalTabsEnabled', JSON.stringify(val));
          } catch (e) {}
        }

        if (data.settings && data.settings.SHOW_RECENT_EMPTY !== undefined) {
          const val = data.settings.SHOW_RECENT_EMPTY === 'true';
          setShowRecentEmpty(val);
          localStorage.setItem('showRecentEmpty', val ? 'true' : 'false');
        }

        if (data.settings && data.settings.LANGUAGES) {
          const list = data.settings.LANGUAGES.split(',').map(s => s.trim()).filter(Boolean);
          if (list.length > 0) {
            setTranslationLangs(list);
            localStorage.setItem('translationLangs', JSON.stringify(list));
          }
        }

        const modes = [
          { prefix: 'search', tgtSet: setSearchTargetLang, srcSet: setSearchSourceLang, defTgt: '🇺🇸 EN', defSrc: '🌐 Auto' },
          { prefix: 'compare', tgtSet: setCompareTargetLang, srcSet: setCompareSourceLang, defTgt: '🌐 Auto', defSrc: '🌐 Auto' },
          { prefix: 'explain', tgtSet: setExplainTargetLang, srcSet: setExplainSourceLang, defTgt: '🌐 Auto', defSrc: '🌐 Auto' },
          { prefix: 'translation', tgtSet: setTranslationTargetLang, srcSet: setTranslationSourceLang, defTgt: '🇺🇸 EN', defSrc: '🌐 Auto' }
        ];

        modes.forEach(({ prefix, tgtSet, srcSet, defTgt, defSrc }) => {
          const tgtKey = `${prefix}TargetLang_${activeProfileId}`;
          const srcKey = `${prefix}SourceLang_${activeProfileId}`;

          if (data.settings && data.settings[tgtKey]) {
            const val = normalizeLang(data.settings[tgtKey], defTgt);
            tgtSet(val);
            localStorage.setItem(tgtKey, val);
          } else if (!localStorage.getItem(tgtKey) && data.settings && data.settings.SEARCH_TARGET_LANG) {
            const val = normalizeLang(data.settings.SEARCH_TARGET_LANG, defTgt);
            tgtSet(val);
            localStorage.setItem(tgtKey, val);
          }

          if (data.settings && data.settings[srcKey]) {
            const val = normalizeLang(data.settings[srcKey], defSrc);
            srcSet(val);
            localStorage.setItem(srcKey, val);
          } else if (!localStorage.getItem(srcKey) && data.settings && data.settings.SEARCH_SOURCE_LANG) {
            const val = normalizeLang(data.settings.SEARCH_SOURCE_LANG, defSrc);
            srcSet(val);
            localStorage.setItem(srcKey, val);
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isProfileFirstMount = useRef(true);
  useEffect(() => {
    fetchProfiles();
    fetchSettings();
    const savedTheme = localStorage.getItem('theme') || 'tokyonight';
    setTheme(savedTheme);

    const handlePopState = () => {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts[0] === 'compare') setActiveTab('compare');
      else if (parts[0] === 'explain') setActiveTab('explain');
      else if (parts[0] === 'translation') setActiveTab('translation');
      else if (parts[0] === 'correction') setActiveTab('correction');
      else if (parts[0] === 'llm') setActiveTab('llm');
      else if (parts[0] === 'mt' || parts[0] === 'machinetranslation') setActiveTab('mt');
      else if (parts[0] === 'settings') setActiveTab('settings');
      else if (parts[0] === 'flashcard' || parts[0] === 'flashcards') setActiveTab('flashcard');
      else if (parts[0] === 'quickllm' || parts[0] === 'quick-llm' || parts[0] === 'simplellm') setActiveTab('quick_llm');
      else setActiveTab('search');
    };
    window.addEventListener('popstate', handlePopState);

    const handleStorageChange = (e) => {
      if (e.key === 'activeProfileId' && e.newValue) {
        const newId = parseInt(e.newValue);
        if (newId && !isNaN(newId)) {
          setActiveProfileId(newId);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    sessionStorage.setItem('activeProfileId', activeProfileId);
    localStorage.setItem('activeProfileId', activeProfileId);
    fetchWords();
    fetchComparisons();
    fetchExplains();
    fetchTranslations();
    fetchCorrections();
    fetchLlmRecords();
    fetchMtRecords();
    fetchSettings();

    // Sync language preferences for the active profile
    const pSearchTarget = normalizeLang(localStorage.getItem(`searchTargetLang_${activeProfileId}`), '🇺🇸 EN');
    const pSearchSource = normalizeLang(localStorage.getItem(`searchSourceLang_${activeProfileId}`), '🌐 Auto');
    setSearchTargetLang(pSearchTarget);
    setSearchSourceLang(pSearchSource);

    const pCompareTarget = normalizeLang(localStorage.getItem(`compareTargetLang_${activeProfileId}`)) || pSearchTarget;
    const pCompareSource = normalizeLang(localStorage.getItem(`compareSourceLang_${activeProfileId}`), '🌐 Auto');
    setCompareTargetLang(pCompareTarget);
    setCompareSourceLang(pCompareSource);

    const pExplainTarget = normalizeLang(localStorage.getItem(`explainTargetLang_${activeProfileId}`)) || pSearchTarget;
    const pExplainSource = normalizeLang(localStorage.getItem(`explainSourceLang_${activeProfileId}`), '🌐 Auto');
    setExplainTargetLang(pExplainTarget);
    setExplainSourceLang(pExplainSource);

    const pTransSource = normalizeLang(localStorage.getItem(`translationSourceLang_${activeProfileId}`), '🌐 Auto');
    const pTransTarget = normalizeLang(localStorage.getItem(`translationTargetLang_${activeProfileId}`), '🇺🇸 EN');
    setTranslationSourceLang(pTransSource);
    setTranslationTargetLang(pTransTarget);

    const pCorrSource = normalizeLang(localStorage.getItem(`correctionSourceLang_${activeProfileId}`), '🌐 Auto');
    const pCorrTarget = normalizeLang(localStorage.getItem(`correctionTargetLang_${activeProfileId}`), '🇺🇸 EN');
    const pCorrModeType = localStorage.getItem(`correctionModeType_${activeProfileId}`) || 'both';
    setCorrectionSourceLang(pCorrSource);
    setCorrectionTargetLang(pCorrTarget);
    setCorrectionModeType(pCorrModeType);

    const pLlmSource = normalizeLang(localStorage.getItem(`llmSourceLang_${activeProfileId}`), '🌐 Auto');
    const pLlmTarget = normalizeLang(localStorage.getItem(`llmTargetLang_${activeProfileId}`), '🇺🇸 EN');
    setLlmSourceLang(pLlmSource);
    setLlmTargetLang(pLlmTarget);

    const pMtSource = normalizeLang(localStorage.getItem(`mtSourceLang_${activeProfileId}`), '🌐 Auto');
    const pMtTarget = normalizeLang(localStorage.getItem(`mtTargetLang_${activeProfileId}`), '🇺🇸 EN');
    setMtSourceLang(pMtSource);
    setMtTargetLang(pMtTarget);

    if (isProfileFirstMount.current) {
      isProfileFirstMount.current = false;
      return;
    }

    setSearchTabs([
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Search', loading: false, hasData: false, initialWord: null }
    ]);
    setActiveSearchTabId('init');
    setCompareTabs([
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Compare', loading: false, hasData: false, initialComparison: null }
    ]);
    setActiveCompareTabId('init');
    setExplainTabs([
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Explain', loading: false, hasData: false, initialExplain: null }
    ]);
    setActiveExplainTabId('init');
    setTranslationTabs([
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Translation', loading: false, hasData: false, initialTranslation: null }
    ]);
    setActiveTranslationTabId('init');
    setCorrectionTabs([
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Correction', loading: false, hasData: false, initialCorrection: null }
    ]);
    setActiveCorrectionTabId('init');
    setLlmTabs([
      { id: 'history', title: 'History' },
      { id: 'init', title: 'Special LLM', loading: false, hasData: false, initialLlm: null }
    ]);
    setActiveLlmTabId('init');
    setMtTabs([
      { id: 'history', title: 'History' },
      { id: 'init', title: 'New Translation', loading: false, hasData: false, initialMt: null }
    ]);
    setActiveMtTabId('init');
  }, [activeProfileId]);

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
    } else if (activeTab === 'translation') {
      const tab = translationTabs.find(t => t.id === activeTranslationTabId);
      if (tab) title = tab.title;
      emoji = tab?.id === 'history' ? '🕒' : '🌐';
    } else if (activeTab === 'correction') {
      const tab = correctionTabs.find(t => t.id === activeCorrectionTabId);
      if (tab) title = tab.title;
      emoji = tab?.id === 'history' ? '🕒' : '✅';
    } else if (activeTab === 'llm') {
      const tab = llmTabs.find(t => t.id === activeLlmTabId);
      if (tab) title = tab.title;
      emoji = tab?.id === 'history' ? '🕒' : '✨';
    } else if (activeTab === 'mt') {
      const tab = mtTabs.find(t => t.id === activeMtTabId);
      if (tab) title = tab.title;
      emoji = tab?.id === 'history' ? '🕒' : '⚡';
    } else if (activeTab === 'quick_llm') {
      title = 'Quick LLM (Ling Flash)';
      emoji = '⚡';
    } else if (activeTab === 'settings') {
      title = 'Settings';
      emoji = '⚙️';
    }
    document.title = `${emoji} ${title} | AI Dict`;
  }, [activeTab, activeSearchTabId, activeCompareTabId, activeExplainTabId, activeTranslationTabId, activeCorrectionTabId, activeLlmTabId, activeMtTabId, searchTabs, compareTabs, explainTabs, translationTabs, correctionTabs, llmTabs, mtTabs]);

  useEffect(() => {
    const isDark = theme !== 'light';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    document.documentElement.removeAttribute('data-theme');
    if (theme !== 'light' && theme !== 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (settings.OPENROUTER_API_KEY) {
      fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${settings.OPENROUTER_API_KEY}` }
      })
      .then(r => r.json())
      .then(d => {
        if (d.data) setModels(d.data.sort((a, b) => a.id.localeCompare(b.id)));
      })
      .catch(e => console.error(e));
    }
  }, [settings.OPENROUTER_API_KEY]);

  const deleteWord = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/words/${id}`, { method: 'DELETE' });
    fetchWords();
  };

  const deleteComparison = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/comparisons/${id}`, { method: 'DELETE' });
    fetchComparisons();
  };

  const deleteExplain = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/explains/${id}`, { method: 'DELETE' });
    fetchExplains();
  };

  const deleteTranslation = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/translations/${id}`, { method: 'DELETE' });
    fetchTranslations();
  };

  const deleteCorrection = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/corrections/${id}`, { method: 'DELETE' });
    fetchCorrections();
  };

  const deleteLlmRecord = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/llm/records/${id}`, { method: 'DELETE' });
    fetchLlmRecords();
  };

  const deleteMtRecord = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/mt/records/${id}`, { method: 'DELETE' });
    fetchMtRecords();
  };

  const cycleColor = async (item, type) => {
    const currentIndex = COLORS.findIndex(c => c.id === item.color);
    let colorId = null;
    if (currentIndex === -1) {
      colorId = COLORS[0].id;
    } else if (currentIndex < COLORS.length - 1) {
      colorId = COLORS[currentIndex + 1].id;
    }
    const endpoint = type === 'word' ? 'words' :
                     type === 'comparison' ? 'comparisons' :
                     type === 'translation' ? 'translations' :
                     type === 'correction' ? 'corrections' :
                     type === 'llm' ? 'llm/records' :
                     type === 'mt' ? 'mt/records' : 'explains';
    await fetch(`/api/${endpoint}/${item.id}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: colorId })
    });
    if (type === 'word') fetchWords();
    else if (type === 'comparison') fetchComparisons();
    else if (type === 'explain') fetchExplains();
    else if (type === 'translation') fetchTranslations();
    else if (type === 'correction') fetchCorrections();
    else if (type === 'llm') fetchLlmRecords();
    else if (type === 'mt') fetchMtRecords();
  };

  const updateItemStars = async (item, type, newStars) => {
    const val = item.stars === newStars ? 0 : newStars;
    const endpoint = type === 'word' ? 'words' :
                     type === 'comparison' ? 'comparisons' :
                     type === 'translation' ? 'translations' :
                     type === 'correction' ? 'corrections' :
                     type === 'llm' ? 'llm/records' :
                     type === 'mt' ? 'mt/records' : 'explains';
    await fetch(`/api/${endpoint}/${item.id}/stars`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars: val })
    });
    if (type === 'word') fetchWords();
    else if (type === 'comparison') fetchComparisons();
    else if (type === 'explain') fetchExplains();
    else if (type === 'translation') fetchTranslations();
    else if (type === 'correction') fetchCorrections();
    else if (type === 'llm') fetchLlmRecords();
    else if (type === 'mt') fetchMtRecords();
  };

  const updateLanguage = async (id, currentLanguage) => {
    const newLang = prompt('Enter correct language (e.g. German):', currentLanguage || '');
    if (newLang !== null) {
      await fetch(`/api/words/${id}/language`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: newLang })
      });
      fetchWords();
    }
  };

  const renameItem = async (id, currentVal, type) => {
    const promptText = type === 'word' ? 'Enter new term:' :
                       type === 'comparison' ? 'Enter new comparison terms:' :
                       type === 'translation' ? 'Enter new translation text:' :
                       type === 'correction' ? 'Enter new correction text:' :
                       type === 'llm' ? 'Enter new text:' :
                       type === 'mt' ? 'Enter new text:' :
                       'Enter new text:';
    const newVal = prompt(promptText, currentVal);
    if (newVal && newVal !== currentVal) {
      const endpoint = type === 'word' ? `/api/words/${id}/rename` :
                       type === 'comparison' ? `/api/comparisons/${id}/rename` :
                       type === 'translation' ? `/api/translations/${id}/rename` :
                       type === 'correction' ? `/api/corrections/${id}/rename` :
                       type === 'llm' ? `/api/llm/records/${id}/rename` :
                       type === 'mt' ? `/api/mt/records/${id}/rename` :
                       `/api/explains/${id}/rename`;
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: newVal })
      });
      if (type === 'word') fetchWords();
      else if (type === 'comparison') fetchComparisons();
      else if (type === 'explain') fetchExplains();
      else if (type === 'translation') fetchTranslations();
      else if (type === 'correction') fetchCorrections();
      else if (type === 'llm') fetchLlmRecords();
      else if (type === 'mt') fetchMtRecords();
    }
  };

  const exportData = async (type) => {
    const res = await fetch(`/api/data/export?type=${type}&profile_id=${activeProfileId}`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    a.download = `ai_dict_${type}_${dateStr}.json`;
    a.click();
  };

  const importData = async (type, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        await fetch(`/api/data/import?type=${type}&profile_id=${activeProfileId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        alert(`${type} imported successfully`);
        fetchWords();
        fetchComparisons();
        fetchExplains();
        fetchTranslations();
        fetchCorrections();
        fetchLlmRecords();
        fetchMtRecords();
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const clearData = async (type) => {
    if (!confirm(`Are you sure you want to delete ALL ${type} history for this profile? This cannot be undone.`)) return;
    await fetch(`/api/data/clear?type=${type}&profile_id=${activeProfileId}`, { method: 'DELETE' });
    fetchWords();
    fetchComparisons();
    fetchExplains();
    fetchTranslations();
    fetchCorrections();
    fetchLlmRecords();
    fetchMtRecords();
  };

  const handleHomeClick = () => {
    handleSearchClick();
  };

  const updateUrlPath = (path) => {
    if (window.location.pathname !== path || window.location.search) {
      window.history.pushState(null, '', path);
    }
  };

  const handleSearchClick = () => {
    if (internalTabsEnabled) {
      const id = Date.now().toString();
      setSearchTabs([...searchTabs, { id, title: 'New Search', loading: false, hasData: false, initialWord: null }]);
      setActiveSearchTabId(id);
    } else {
      const mainTab = searchTabs.find(t => t.id !== 'history') || searchTabs[0];
      if (mainTab) setActiveSearchTabId(mainTab.id);
    }
    setActiveTab('search');
    updateUrlPath('/search');
  };

  const handleCompareClick = () => {
    if (internalTabsEnabled) {
      const id = Date.now().toString();
      setCompareTabs([...compareTabs, { id, title: 'New Compare', loading: false, hasData: false, initialComparison: null }]);
      setActiveCompareTabId(id);
    } else {
      const mainTab = compareTabs.find(t => t.id !== 'history') || compareTabs[0];
      if (mainTab) setActiveCompareTabId(mainTab.id);
    }
    setActiveTab('compare');
    updateUrlPath('/compare');
  };

  const handleExplainClick = () => {
    if (internalTabsEnabled) {
      const id = Date.now().toString();
      setExplainTabs([...explainTabs, { id, title: 'New Explain', loading: false, hasData: false, initialExplain: null }]);
      setActiveExplainTabId(id);
    } else {
      const mainTab = explainTabs.find(t => t.id !== 'history') || explainTabs[0];
      if (mainTab) setActiveExplainTabId(mainTab.id);
    }
    setActiveTab('explain');
    updateUrlPath('/explain');
  };

  const handleTranslationClick = () => {
    if (internalTabsEnabled) {
      const id = Date.now().toString();
      setTranslationTabs([...translationTabs, { id, title: 'New Translation', loading: false, hasData: false, initialTranslation: null }]);
      setActiveTranslationTabId(id);
    } else {
      const mainTab = translationTabs.find(t => t.id !== 'history') || translationTabs[0];
      if (mainTab) setActiveTranslationTabId(mainTab.id);
    }
    setActiveTab('translation');
    updateUrlPath('/translation');
  };

  const handleCorrectionClick = () => {
    if (internalTabsEnabled) {
      const id = Date.now().toString();
      setCorrectionTabs([...correctionTabs, { id, title: 'New Correction', loading: false, hasData: false, initialCorrection: null }]);
      setActiveCorrectionTabId(id);
    } else {
      const mainTab = correctionTabs.find(t => t.id !== 'history') || correctionTabs[0];
      if (mainTab) setActiveCorrectionTabId(mainTab.id);
    }
    setActiveTab('correction');
    updateUrlPath('/correction');
  };

  const handleLlmClick = () => {
    if (internalTabsEnabled) {
      const id = Date.now().toString();
      setLlmTabs([...llmTabs, { id, title: 'Special LLM', loading: false, hasData: false, initialLlm: null }]);
      setActiveLlmTabId(id);
    } else {
      const mainTab = llmTabs.find(t => t.id !== 'history') || llmTabs[0];
      if (mainTab) setActiveLlmTabId(mainTab.id);
    }
    setActiveTab('llm');
    updateUrlPath('/llm');
  };

  const handleOpenLlmMode = (initialText = '') => {
    setActiveTab('llm');
    updateUrlPath('/llm');
    const trimmed = (initialText || '').trim();
    if (trimmed) {
      if (internalTabsEnabled) {
        const blankTab = llmTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
        if (blankTab) {
          setLlmTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: trimmed.substring(0, 25), loading: true, hasData: false, initialLlm: { text: trimmed, isTemp: true } } : t));
          setActiveLlmTabId(blankTab.id);
        } else {
          const id = Date.now().toString();
          setLlmTabs(prev => [...prev, { id, title: trimmed.substring(0, 25), loading: true, hasData: false, initialLlm: { text: trimmed, isTemp: true } }]);
          setActiveLlmTabId(id);
        }
      } else {
        const mainTab = llmTabs.find(t => t.id !== 'history') || llmTabs[0];
        if (mainTab) {
          setLlmTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: trimmed.substring(0, 25), loading: true, hasData: false, initialLlm: { text: trimmed, isTemp: true } } : t));
          setActiveLlmTabId(mainTab.id);
        }
      }
    } else {
      const mainTab = llmTabs.find(t => t.id !== 'history') || llmTabs[0];
      if (mainTab) setActiveLlmTabId(mainTab.id);
    }
  };

  const handleOpenMtMode = (initialText = '') => {
    setActiveTab('mt');
    updateUrlPath('/mt');
    const trimmed = (initialText || '').trim();
    if (trimmed) {
      if (internalTabsEnabled) {
        const blankTab = mtTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
        if (blankTab) {
          setMtTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: trimmed.substring(0, 25), loading: true, hasData: false, initialMt: { text: trimmed, isTemp: true } } : t));
          setActiveMtTabId(blankTab.id);
        } else {
          const id = Date.now().toString();
          setMtTabs(prev => [...prev, { id, title: trimmed.substring(0, 25), loading: true, hasData: false, initialMt: { text: trimmed, isTemp: true } }]);
          setActiveMtTabId(id);
        }
      } else {
        const mainTab = mtTabs.find(t => t.id !== 'history') || mtTabs[0];
        if (mainTab) {
          setMtTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: trimmed.substring(0, 25), loading: true, hasData: false, initialMt: { text: trimmed, isTemp: true } } : t));
          setActiveMtTabId(mainTab.id);
        }
      }
    } else {
      const mainTab = mtTabs.find(t => t.id !== 'history') || mtTabs[0];
      if (mainTab) setActiveMtTabId(mainTab.id);
    }
  };

  const handleMtClick = () => {
    if (internalTabsEnabled) {
      const id = Date.now().toString();
      setMtTabs([...mtTabs, { id, title: 'New Translation', loading: false, hasData: false, initialMt: null }]);
      setActiveMtTabId(id);
    } else {
      const mainTab = mtTabs.find(t => t.id !== 'history') || mtTabs[0];
      if (mainTab) setActiveMtTabId(mainTab.id);
    }
    setActiveTab('mt');
    updateUrlPath('/mt');
  };

  const handleQuickLlmClick = () => {
    setActiveTab('quick_llm');
    updateUrlPath('/quickllm');
  };

  const getGroupedByDay = (items, sortKey) => {
    if (historySort === 'count') {
      return { 'All': [...items].sort((a, b) => (b.search_count || 0) - (a.search_count || 0)) };
    }
    if (historySort === 'alpha') {
      return { 'All': [...items].sort((a, b) => (a[sortKey] || '').localeCompare(b[sortKey] || '')) };
    }
    const sorted = [...items].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
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
  };

  const getSessionStats = (sessionName) => {
    const w = words.filter(item => item.session_id === sessionName).length;
    const c = comparisons.filter(item => item.session_id === sessionName).length;
    const e = explains.filter(item => item.session_id === sessionName).length;
    const t = translations.filter(item => item.session_id === sessionName).length;
    const cr = corrections.filter(item => item.session_id === sessionName).length;
    const ll = llmRecords.filter(item => item.session_id === sessionName).length;
    const mt = mtRecords.filter(item => item.session_id === sessionName).length;
    return { words: w, comparisons: c, explains: e, translations: t, corrections: cr, llm: ll, mt: mt, total: w + c + e + t + cr + ll + mt };
  };

  const getAllSessions = () => {
    const sessionNames = new Set();
    words.forEach(w => w.session_id && sessionNames.add(w.session_id));
    comparisons.forEach(c => c.session_id && sessionNames.add(c.session_id));
    explains.forEach(e => e.session_id && sessionNames.add(e.session_id));
    translations.forEach(t => t.session_id && sessionNames.add(t.session_id));
    corrections.forEach(cr => cr.session_id && sessionNames.add(cr.session_id));
    llmRecords.forEach(l => l.session_id && sessionNames.add(l.session_id));
    mtRecords.forEach(m => m.session_id && sessionNames.add(m.session_id));
    
    return Array.from(sessionNames).map(name => ({
      name,
      ...getSessionStats(name)
    })).sort((a, b) => b.total - a.total);
  };

  const handleStartNewSession = () => {
    const defaultName = "Session " + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const name = prompt("Enter session name:", defaultName);
    if (name && name.trim()) {
      const trimmed = name.trim();
      localStorage.setItem('active_session_id', trimmed);
      setActiveSessionId(trimmed);
    }
  };

  const handleJumpToFlashcardFromSession = (sessionName, forceMode = null) => {
    const s = getAllSessions().find(item => item.name === sessionName);
    const sessionObj = s
      ? {
          session_id: s.name,
          total_count: s.total,
          word_count: s.words,
          comparison_count: s.comparisons,
          explain_count: s.explains,
          translation_count: s.translations,
          correction_count: s.corrections
        }
      : { session_id: sessionName, total_count: 0 };

    // Determine mode filter
    let modes = ['search', 'compare', 'explain', 'translation', 'correction'];
    if (forceMode === '__all__') {
      modes = ['search', 'compare', 'explain', 'translation', 'correction'];
    } else if (forceMode) {
      modes = [forceMode];
    } else {
      // If user opened from search mode, jump to search mode only (if session has words)
      if (activeTab === 'search') {
        modes = (s && s.words > 0) ? ['search'] : ['search', 'compare', 'explain', 'translation', 'correction'];
      } else if (activeTab === 'compare') {
        modes = (s && s.comparisons > 0) ? ['compare'] : ['search', 'compare', 'explain', 'translation', 'correction'];
      } else if (activeTab === 'explain') {
        modes = (s && s.explains > 0) ? ['explain'] : ['search', 'compare', 'explain', 'translation', 'correction'];
      } else if (activeTab === 'translation') {
        modes = (s && s.translations > 0) ? ['translation'] : ['search', 'compare', 'explain', 'translation', 'correction'];
      } else if (activeTab === 'correction') {
        modes = (s && s.corrections > 0) ? ['correction'] : ['search', 'compare', 'explain', 'translation', 'correction'];
      }
    }

    setFlashcardInitialSession(sessionObj);
    setFlashcardInitialModes(modes);
    setFlashcardInitialViewMode('practice');

    setManageSessionsModalOpen(false);
    setActiveTab('flashcard');
    updateUrlPath('/flashcard');
  };

  const handleEndSession = () => {
    localStorage.removeItem('active_session_id');
    setActiveSessionId('');
  };

  const handleActivateSession = (name) => {
    localStorage.setItem('active_session_id', name);
    setActiveSessionId(name);
  };

  const handleRenameSession = async (oldName) => {
    const newName = prompt(`Rename session "${oldName}" to:`, oldName);
    if (!newName || newName.trim() === oldName || !newName.trim()) return;
    try {
      const res = await fetch('/api/sessions/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: oldName, new_name: newName.trim(), profile_id: activeProfileId })
      });
      if (!res.ok) throw new Error(await res.text());
      if (activeSessionId === oldName) {
        localStorage.setItem('active_session_id', newName.trim());
        setActiveSessionId(newName.trim());
      }
      await Promise.all([fetchWords(), fetchComparisons(), fetchExplains(), fetchTranslations(), fetchCorrections()]);
    } catch (err) {
      alert("Failed to rename session: " + err.message);
    }
  };

  const handleDeleteSession = (sessionName) => {
    const stats = getSessionStats(sessionName);
    setDeleteSessionModal({
      sessionName,
      stats,
      loading: false
    });
  };

  const confirmDeleteSession = async (sessionName, keepItems) => {
    setDeleteSessionModal(prev => prev ? { ...prev, loading: true } : null);
    try {
      const res = await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionName,
          profile_id: activeProfileId,
          keep_items: keepItems
        })
      });
      if (!res.ok) throw new Error(await res.text());
      if (activeSessionId === sessionName) {
        localStorage.removeItem('active_session_id');
        setActiveSessionId('');
      }
      setDeleteSessionModal(null);
      await Promise.all([fetchWords(), fetchComparisons(), fetchExplains(), fetchTranslations(), fetchCorrections()]);
    } catch (err) {
      alert("Failed to delete session: " + err.message);
      setDeleteSessionModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const openMoveSessionModal = async (sessionName) => {
    const stats = getSessionStats(sessionName);
    const otherProfiles = profiles.filter(p => p.id !== activeProfileId);
    const defaultTarget = otherProfiles.length > 0 ? otherProfiles[0].id : 'new';
    setMoveSessionModal({
      sessionName,
      stats,
      targetProfileId: defaultTarget,
      newProfileName: '',
      loading: false
    });
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const allSessions = await res.json();
        const found = allSessions.find(s => s.session_id === sessionName);
        if (found) {
          setMoveSessionModal(prev => prev && prev.sessionName === sessionName ? {
            ...prev,
            stats: {
              words: found.word_count,
              comparisons: found.comparison_count,
              explains: found.explain_count,
              translations: found.translation_count,
              corrections: found.correction_count || 0,
              total: found.total_count
            }
          } : prev);
        }
      }
    } catch (e) {}
  };

  const handleExecuteMoveSession = async () => {
    if (!moveSessionModal) return;
    const { sessionName, targetProfileId, newProfileName } = moveSessionModal;
    
    let finalTargetId = targetProfileId;
    let finalTargetName = '';

    setMoveSessionModal(prev => ({ ...prev, loading: true }));

    try {
      if (targetProfileId === 'new') {
        if (!newProfileName || !newProfileName.trim()) {
          alert("Please enter a name for the new profile.");
          setMoveSessionModal(prev => ({ ...prev, loading: false }));
          return;
        }
        const pRes = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newProfileName.trim() })
        });
        if (!pRes.ok) throw new Error(await pRes.text());
        const newP = await pRes.json();
        finalTargetId = newP.id;
        finalTargetName = newP.name;
      } else {
        const found = profiles.find(p => p.id === parseInt(targetProfileId));
        finalTargetName = found ? found.name : `Profile #${targetProfileId}`;
      }

      const res = await fetch('/api/sessions/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionName,
          target_profile_id: parseInt(finalTargetId)
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      await Promise.all([
        fetchWords(),
        fetchComparisons(),
        fetchExplains(),
        fetchTranslations(),
        fetchCorrections(),
        fetchProfiles()
      ]);

      setMoveSessionModal(null);
      
      if (confirm(`Successfully moved session "${sessionName}" (${data.moved_items} items) to "${finalTargetName}".\n\nWould you like to switch to "${finalTargetName}" now?`)) {
        sessionStorage.setItem('activeProfileId', finalTargetId);
        localStorage.setItem('activeProfileId', finalTargetId);
        window.location.href = window.location.pathname;
      }
    } catch (err) {
      alert("Failed to move session: " + err.message);
      setMoveSessionModal(prev => ({ ...prev, loading: false }));
    }
  };

  const openMoveItemModal = (item, type = 'word', onSuccessCallback = null) => {
    const otherProfiles = profiles.filter(p => p.id !== activeProfileId);
    setMoveItemModal({
      item,
      type,
      title: item.term || item.terms || item.text || 'Item',
      targetProfileId: otherProfiles.length > 0 ? otherProfiles[0].id : 'new',
      newProfileName: '',
      loading: false,
      onSuccessCallback
    });
  };

  const handleExecuteMoveItem = async () => {
    if (!moveItemModal) return;
    const { item, type, title, targetProfileId, newProfileName, onSuccessCallback } = moveItemModal;

    let finalTargetId = targetProfileId;
    let finalTargetName = '';

    setMoveItemModal(prev => ({ ...prev, loading: true }));

    try {
      if (targetProfileId === 'new') {
        if (!newProfileName || !newProfileName.trim()) {
          alert("Please enter a name for the new profile.");
          setMoveItemModal(prev => ({ ...prev, loading: false }));
          return;
        }
        const pRes = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newProfileName.trim() })
        });
        if (!pRes.ok) throw new Error(await pRes.text());
        const newP = await pRes.json();
        finalTargetId = newP.id;
        finalTargetName = newP.name;
      } else {
        const found = profiles.find(p => p.id === parseInt(targetProfileId));
        finalTargetName = found ? found.name : `Profile #${targetProfileId}`;
      }

      const endpoint = type === 'word' ? `/api/words/${item.id}/move` :
                       type === 'comparison' ? `/api/comparisons/${item.id}/move` :
                       type === 'explain' ? `/api/explains/${item.id}/move` :
                       type === 'translation' ? `/api/translations/${item.id}/move` :
                       type === 'correction' ? `/api/corrections/${item.id}/move` :
                       type === 'llm' ? `/api/llm/records/${item.id}/move` :
                       type === 'mt' ? `/api/mt/records/${item.id}/move` :
                       `/api/corrections/${item.id}/move`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_profile_id: parseInt(finalTargetId)
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      await Promise.all([
        fetchWords(),
        fetchComparisons(),
        fetchExplains(),
        fetchTranslations(),
        fetchCorrections(),
        fetchLlmRecords(),
        fetchMtRecords(),
        fetchProfiles()
      ]);

      if (onSuccessCallback) {
        onSuccessCallback();
      }

      setMoveItemModal(null);

      const actionDesc = data.action === 'merged' ? 'merged into existing entry in' : 'moved to';
      if (confirm(`Successfully ${actionDesc} "${title}" in "${finalTargetName}".\n\nWould you like to switch to "${finalTargetName}" now?`)) {
        sessionStorage.setItem('activeProfileId', finalTargetId);
        localStorage.setItem('activeProfileId', finalTargetId);
        window.location.href = window.location.pathname;
      }
    } catch (err) {
      alert("Failed to move item: " + err.message);
      setMoveItemModal(prev => ({ ...prev, loading: false }));
    }
  };

  const toggleSelectWord = (id) => {
    setSelectedWordIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllWords = (allWordList) => {
    const allIds = allWordList.map(w => w.id);
    if (selectedWordIds.size === allIds.length) {
      setSelectedWordIds(new Set());
    } else {
      setSelectedWordIds(new Set(allIds));
    }
  };

  const openMoveToSessionModal = ({ items = [], currentSession = null }) => {
    const existingSessions = getAllSessions();
    const defaultTarget = existingSessions.length > 0 ? 'existing' : 'new';
    const defaultExisting = (currentSession && existingSessions.some(s => s.name === currentSession))
      ? currentSession
      : (existingSessions[0]?.name || '');
    setMoveToSessionModal({
      items,
      currentSession,
      targetType: defaultTarget,
      selectedExistingSession: defaultExisting,
      newSessionName: '',
      loading: false
    });
  };

  const handleExecuteMoveToSession = async () => {
    if (!moveToSessionModal || moveToSessionModal.loading) return;
    const { items, targetType, selectedExistingSession, newSessionName } = moveToSessionModal;

    let targetSessionId = null;
    if (targetType === 'existing') {
      if (!selectedExistingSession || !selectedExistingSession.trim()) {
        alert('Please select an existing session.');
        return;
      }
      targetSessionId = selectedExistingSession.trim();
    } else if (targetType === 'new') {
      if (!newSessionName || !newSessionName.trim()) {
        alert('Please enter a name for the new session.');
        return;
      }
      targetSessionId = newSessionName.trim();
    } else if (targetType === 'none') {
      targetSessionId = null;
    }

    setMoveToSessionModal(prev => ({ ...prev, loading: true }));

    try {
      const wordIds = items.filter(i => !i.mode || i.mode === 'word' || i.mode === 'search').map(i => i.id);
      const otherItems = items.filter(i => i.mode && i.mode !== 'word' && i.mode !== 'search');

      const res = await fetch('/api/sessions/assign-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: targetSessionId,
          word_ids: wordIds,
          items: otherItems,
          profile_id: activeProfileId
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      await Promise.all([
        fetchWords(),
        fetchComparisons(),
        fetchExplains(),
        fetchTranslations(),
        fetchCorrections(),
        fetchLlmRecords(),
        fetchMtRecords()
      ]);

      const count = items.length;
      const isAllWords = items.every(i => !i.mode || i.mode === 'word' || i.mode === 'search');
      const itemNoun = count === 1 ? (items[0]?.title ? `"${items[0].title}"` : (isAllWords ? 'Word' : 'Item')) : `${count} ${isAllWords ? 'words' : 'items'}`;
      const sessionLabel = targetSessionId ? `session "${targetSessionId}"` : 'no session (unassigned)';

      addToast({
        type: 'success',
        title: 'Moved to Session',
        message: `Successfully assigned ${itemNoun} to ${sessionLabel}.`,
        duration: 5000
      });

      setSelectedWordIds(new Set());
      setIsWordSelectMode(false);
      setMoveToSessionModal(null);
    } catch (err) {
      console.error('Failed to move to session:', err);
      alert(`Failed to assign to session: ${err.message}`);
      setMoveToSessionModal(prev => ({ ...prev, loading: false }));
    }
  };

  const openMoveModeModal = (item, fromMode, onSuccessCallback = null) => {
    const term = item?.term || item?.text || item?.terms || '';
    const defaultTo = fromMode === 'word' ? 'explain' : 'word';
    setMoveModeModal({
      item,
      fromMode,
      term,
      toMode: defaultTo,
      onSuccessCallback
    });
  };

  const handleExecuteMoveMode = () => {
    if (!moveModeModal) return;
    const { item, fromMode, term, toMode, onSuccessCallback } = moveModeModal;

    // Immediately close modal so user doesn't have to wait ("just done")
    setMoveModeModal(null);

    // Call callback immediately to reset source tab view if initiated from active tab
    if (onSuccessCallback) {
      try {
        onSuccessCallback();
      } catch (err) {
        console.error("onSuccessCallback error:", err);
      }
    }

    const modeLabels = {
      word: 'Word',
      search: 'Word',
      explain: 'Explain',
      translation: 'Translation',
      compare: 'Compare',
      correction: 'Correction',
      llm: 'Special LLM',
      mt: 'Machine Translation'
    };
    const targetLabel = modeLabels[toMode] || toMode;

    // Display non-blocking background progress toast
    const toastId = addToast({
      type: 'loading',
      title: `Moving to ${targetLabel} Mode`,
      message: `Regenerating "${term}" in ${targetLabel} mode in the background...`,
      duration: 0
    });

    const backendFrom = fromMode === 'word' ? 'search' : fromMode;
    const backendTo = toMode === 'word' ? 'search' : toMode;

    fetch('/api/modes/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_mode: backendFrom,
        to_mode: backendTo,
        item_id: item?.id,
        term: term,
        profile_id: activeProfileId
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text();
          let detail = errText;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.detail) detail = parsed.detail;
          } catch (_) {}
          throw new Error(detail);
        }
        return res.json();
      })
      .then((data) => {
        Promise.all([
          fetchWords(),
          fetchExplains(),
          fetchTranslations(),
          fetchComparisons(),
          fetchCorrections(),
          fetchLlmRecords(),
          fetchMtRecords()
        ]);

        updateToast(toastId, {
          type: 'success',
          title: `Moved to ${targetLabel} Mode`,
          message: `"${term}" regenerated successfully.`,
          actionLabel: 'View',
          onAction: () => {
            if (toMode === 'word' && data.word) {
              setActiveTab('search');
              if (internalTabsEnabled) {
                const blankTab = searchTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                if (blankTab) {
                  setSearchTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: data.word.term, loading: false, hasData: true, initialWord: data.word, isHistorical: false } : t));
                  setActiveSearchTabId(blankTab.id);
                } else {
                  const id = Date.now().toString();
                  setSearchTabs(prev => [...prev, { id, title: data.word.term, loading: false, hasData: true, initialWord: data.word, isHistorical: false }]);
                  setActiveSearchTabId(id);
                }
              } else {
                const mainTab = searchTabs.find(t => t.id !== 'history') || searchTabs[0];
                if (mainTab) {
                  setSearchTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: data.word.term, loading: false, hasData: true, initialWord: data.word, isHistorical: false } : t));
                  setActiveSearchTabId(mainTab.id);
                }
              }
            } else if (toMode === 'explain' && data.explain) {
              setActiveTab('explain');
              if (internalTabsEnabled) {
                const blankTab = explainTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                if (blankTab) {
                  setExplainTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: data.explain.text, loading: false, hasData: true, initialExplain: data.explain, isHistorical: false } : t));
                  setActiveExplainTabId(blankTab.id);
                } else {
                  const id = Date.now().toString();
                  setExplainTabs(prev => [...prev, { id, title: data.explain.text, loading: false, hasData: true, initialExplain: data.explain, isHistorical: false }]);
                  setActiveExplainTabId(id);
                }
              } else {
                const mainTab = explainTabs.find(t => t.id !== 'history') || explainTabs[0];
                if (mainTab) {
                  setExplainTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: data.explain.text, loading: false, hasData: true, initialExplain: data.explain, isHistorical: false } : t));
                  setActiveExplainTabId(mainTab.id);
                }
              }
            } else if (toMode === 'translation' && data.translation) {
              setActiveTab('translation');
              if (internalTabsEnabled) {
                const blankTab = translationTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                if (blankTab) {
                  setTranslationTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: data.translation.text, loading: false, hasData: true, initialTranslation: data.translation, isHistorical: false } : t));
                  setActiveTranslationTabId(blankTab.id);
                } else {
                  const id = Date.now().toString();
                  setTranslationTabs(prev => [...prev, { id, title: data.translation.text, loading: false, hasData: true, initialTranslation: data.translation, isHistorical: false }]);
                  setActiveTranslationTabId(id);
                }
              } else {
                const mainTab = translationTabs.find(t => t.id !== 'history') || translationTabs[0];
                if (mainTab) {
                  setTranslationTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: data.translation.text, loading: false, hasData: true, initialTranslation: data.translation, isHistorical: false } : t));
                  setActiveTranslationTabId(mainTab.id);
                }
              }
            } else if (toMode === 'correction' && data.correction) {
              setActiveTab('correction');
              if (internalTabsEnabled) {
                const blankTab = correctionTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                if (blankTab) {
                  setCorrectionTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: data.correction.text, loading: false, hasData: true, initialCorrection: data.correction, isHistorical: false } : t));
                  setActiveCorrectionTabId(blankTab.id);
                } else {
                  const id = Date.now().toString();
                  setCorrectionTabs(prev => [...prev, { id, title: data.correction.text, loading: false, hasData: true, initialCorrection: data.correction, isHistorical: false }]);
                  setActiveCorrectionTabId(id);
                }
              } else {
                const mainTab = correctionTabs.find(t => t.id !== 'history') || correctionTabs[0];
                if (mainTab) {
                  setCorrectionTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: data.correction.text, loading: false, hasData: true, initialCorrection: data.correction, isHistorical: false } : t));
                  setActiveCorrectionTabId(mainTab.id);
                }
              }
            } else if (toMode === 'llm' && data.llm) {
              setActiveTab('llm');
              if (internalTabsEnabled) {
                const blankTab = llmTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                if (blankTab) {
                  setLlmTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: data.llm.text, loading: false, hasData: true, initialLlm: data.llm, isHistorical: false } : t));
                  setActiveLlmTabId(blankTab.id);
                } else {
                  const id = Date.now().toString();
                  setLlmTabs(prev => [...prev, { id, title: data.llm.text, loading: false, hasData: true, initialLlm: data.llm, isHistorical: false }]);
                  setActiveLlmTabId(id);
                }
              } else {
                const mainTab = llmTabs.find(t => t.id !== 'history') || llmTabs[0];
                if (mainTab) {
                  setLlmTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: data.llm.text, loading: false, hasData: true, initialLlm: data.llm, isHistorical: false } : t));
                  setActiveLlmTabId(mainTab.id);
                }
              }
            } else if (toMode === 'compare' && data.comparison) {
              setActiveTab('compare');
              if (internalTabsEnabled) {
                const blankTab = compareTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                if (blankTab) {
                  setCompareTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: data.comparison.terms, loading: false, hasData: true, initialComparison: data.comparison, isHistorical: false } : t));
                  setActiveCompareTabId(blankTab.id);
                } else {
                  const id = Date.now().toString();
                  setCompareTabs(prev => [...prev, { id, title: data.comparison.terms, loading: false, hasData: true, initialComparison: data.comparison, isHistorical: false }]);
                  setActiveCompareTabId(id);
                }
              } else {
                const mainTab = compareTabs.find(t => t.id !== 'history') || compareTabs[0];
                if (mainTab) {
                  setCompareTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: data.comparison.terms, loading: false, hasData: true, initialComparison: data.comparison, isHistorical: false } : t));
                  setActiveCompareTabId(mainTab.id);
                }
              }
            } else if (toMode === 'mt' && data.mt) {
              setActiveTab('mt');
              if (internalTabsEnabled) {
                const blankTab = mtTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                if (blankTab) {
                  setMtTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: data.mt.text.substring(0, 25), loading: false, hasData: true, initialMt: data.mt } : t));
                  setActiveMtTabId(blankTab.id);
                } else {
                  const id = Date.now().toString();
                  setMtTabs(prev => [...prev, { id, title: data.mt.text.substring(0, 25), loading: false, hasData: true, initialMt: data.mt }]);
                  setActiveMtTabId(id);
                }
              } else {
                const mainTab = mtTabs.find(t => t.id !== 'history') || mtTabs[0];
                if (mainTab) {
                  setMtTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: data.mt.text.substring(0, 25), loading: false, hasData: true, initialMt: data.mt } : t));
                  setActiveMtTabId(mainTab.id);
                }
              }
              updateUrlPath(`/mt/${encodeURIComponent(data.mt.text)}`);
            }
          },
          duration: 7000
        });
      })
      .catch((err) => {
        console.error("Failed to move mode in background:", err);
        updateToast(toastId, {
          type: 'error',
          title: `Move Mode Failed`,
          message: `Could not move "${term}": ${err.message}`,
          duration: 8000
        });
      });
  };

  const renderGroupHeader = (group, groupItems, mode = 'word') => {
    const isSession = groupItems.length > 0 && groupItems[0]?.session_id === group;
    if (!isSession) {
      const isDate = group !== 'All';
      const allSelected = mode === 'word' && groupItems.length > 0 && groupItems.every(i => selectedWordIds.has(i.id));
      const someSelected = mode === 'word' && groupItems.some(i => selectedWordIds.has(i.id));
      const selectedCount = mode === 'word' ? groupItems.filter(i => selectedWordIds.has(i.id)).length : 0;

      const handleToggleSelectGroup = (e) => {
        if (e) e.stopPropagation();
        if (mode !== 'word') return;
        setIsWordSelectMode(true);
        setSelectedWordIds(prev => {
          const next = new Set(prev);
          if (allSelected) {
            groupItems.forEach(i => next.delete(i.id));
          } else {
            groupItems.forEach(i => next.add(i.id));
          }
          return next;
        });
      };

      const handleMoveGroupToSession = (e) => {
        if (e) e.stopPropagation();
        openMoveToSessionModal({
          items: groupItems.map(item => ({
            id: item.id,
            mode: mode || 'word',
            title: item.term || item.terms || item.text || 'Item'
          })),
          currentSession: null
        });
      };

      return (
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-gray-50/90 dark:bg-gray-800/70 rounded-xl border border-gray-200/80 dark:border-gray-700/70 shadow-2xs mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {mode === 'word' && (
              <label 
                className="flex items-center cursor-pointer select-none"
                title={allSelected ? `Deselect all items in ${group}` : `Select all ${groupItems.length} items in ${group}`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={handleToggleSelectGroup}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer"
                />
              </label>
            )}

            <div className="flex items-center gap-1.5 min-w-0">
              {isDate ? (
                <Calendar size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
              ) : (
                <Clock size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
              )}
              <h3 className="text-xs md:text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider truncate" title={group}>
                {group}
              </h3>
            </div>

            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 font-medium">
              {selectedCount > 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  ({selectedCount}/{groupItems.length} selected)
                </span>
              ) : (
                `(${groupItems.length} ${groupItems.length === 1 ? (mode === 'word' ? 'word' : 'item') : (mode === 'word' ? 'words' : 'items')})`
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {mode === 'word' && (
              <button
                type="button"
                onClick={handleToggleSelectGroup}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer border ${
                  allSelected
                    ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                    : 'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 shadow-2xs'
                }`}
                title={allSelected ? `Deselect all items in ${group}` : `Select all items in ${group}`}
              >
                <CheckSquare size={13} className={allSelected ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'} />
                <span>{allSelected ? (isDate ? 'Deselect Date' : 'Deselect All') : (isDate ? 'Select Date' : 'Select All')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleMoveGroupToSession}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60 transition-colors shadow-2xs cursor-pointer"
              title={`Move all ${groupItems.length} items from ${group} to a session`}
            >
              <FolderPlus size={13} />
              <span>{isDate ? 'Move Date to Session' : 'Move to Session'}</span>
            </button>
          </div>
        </div>
      );
    }

    const sessionStats = getSessionStats(group);
    const isActive = activeSessionId === group;

    return (
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-xs mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0">
            <Layers size={12} />
            Session
          </span>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate" title={group}>
            {group}
          </h3>
          {isActive ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Active
            </span>
          ) : (
            <button
              onClick={() => handleActivateSession(group)}
              className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 hover:bg-green-50 dark:bg-gray-700 dark:hover:bg-green-950/40 text-gray-600 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400 border border-gray-200 dark:border-gray-600 transition-colors cursor-pointer shrink-0"
              title="Make this the active session for recording new searches"
            >
              Set Active
            </button>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            ({sessionStats.total} {sessionStats.total === 1 ? 'item' : 'items'})
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleJumpToFlashcardFromSession(group)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors cursor-pointer"
            title={`Study "${group}" in Flashcards (${mode === 'word' ? 'Words only' : mode === 'comparison' ? 'Comparisons only' : mode === 'explain' ? 'Explains only' : 'Translations only'})`}
          >
            <Play size={11} className="fill-current" />
            <span>Flashcard</span>
          </button>
          <button
            onClick={() => openMoveSessionModal(group)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 transition-colors shadow-2xs cursor-pointer"
            title="Move entire session across all modes to another profile"
          >
            <ArrowRightLeft size={13} />
            <span>Move to Profile</span>
          </button>
          <button
            onClick={() => handleRenameSession(group)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            title="Rename Session"
          >
            <Edit size={13} />
          </button>
          <button
            onClick={() => handleDeleteSession(group)}
            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer"
            title="Delete Session"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    const activeProfileName = profiles.find(p => p.id === activeProfileId)?.name || '';
    if (activeTab === 'flashcard') {
      return (
        <FlashcardTab
          activeProfileId={activeProfileId}
          profiles={profiles}
          colors={COLORS}
          initialSession={flashcardInitialSession}
          initialModes={flashcardInitialModes}
          initialViewMode={flashcardInitialViewMode}
          onClearInitialSession={() => {
            setFlashcardInitialSession(null);
            setFlashcardInitialModes(null);
            setFlashcardInitialViewMode('practice');
          }}
          onSessionDeleted={async () => {
            await Promise.all([fetchWords(), fetchComparisons(), fetchExplains(), fetchTranslations(), fetchCorrections(), fetchLlmRecords()]);
          }}
          onNavigateToMode={(mode, item) => {
            if (mode === 'search') {
              setActiveTab('search');
              updateUrlPath('/search');
              const mainTab = searchTabs.find(t => t.id !== 'history') || searchTabs[0];
              if (mainTab) {
                setSearchTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: item.title, loading: false, hasData: true, initialWord: { id: item.id, term: item.title } } : t));
                setActiveSearchTabId(mainTab.id);
              }
            } else if (mode === 'compare') {
              setActiveTab('compare');
              updateUrlPath('/compare');
              const mainTab = compareTabs.find(t => t.id !== 'history') || compareTabs[0];
              if (mainTab) {
                setCompareTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: item.title, loading: false, hasData: true, initialComparison: { id: item.id, terms: item.title } } : t));
                setActiveCompareTabId(mainTab.id);
              }
            } else if (mode === 'explain') {
              setActiveTab('explain');
              updateUrlPath('/explain');
              const mainTab = explainTabs.find(t => t.id !== 'history') || explainTabs[0];
              if (mainTab) {
                setExplainTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: item.title, loading: false, hasData: true, initialExplain: { id: item.id, text: item.title } } : t));
                setActiveExplainTabId(mainTab.id);
              }
            } else if (mode === 'translation') {
              setActiveTab('translation');
              updateUrlPath('/translation');
              const mainTab = translationTabs.find(t => t.id !== 'history') || translationTabs[0];
              if (mainTab) {
                setTranslationTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: item.title, loading: false, hasData: true, initialTranslation: { id: item.id, text: item.title } } : t));
                setActiveTranslationTabId(mainTab.id);
              }
            } else if (mode === 'correction') {
              setActiveTab('correction');
              updateUrlPath('/correction');
              const mainTab = correctionTabs.find(t => t.id !== 'history') || correctionTabs[0];
              if (mainTab) {
                setCorrectionTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: item.title, loading: false, hasData: true, initialCorrection: { id: item.id, text: item.title } } : t));
                setActiveCorrectionTabId(mainTab.id);
              }
            } else if (mode === 'llm') {
              setActiveTab('llm');
              updateUrlPath('/llm');
              const mainTab = llmTabs.find(t => t.id !== 'history') || llmTabs[0];
              if (mainTab) {
                setLlmTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: item.title, loading: false, hasData: true, initialLlm: { id: item.id, text: item.title } } : t));
                setActiveLlmTabId(mainTab.id);
              }
            }
          }}
        />
      );
    }

    if (activeTab === 'settings') {
      return (
        <SettingsTab 
          settings={settings} 
          setSettings={setSettings} 
          fetchSettings={fetchSettings} 
          defaultSettings={defaultSettings} 
          models={models} 
          theme={theme} 
          setTheme={setTheme} 
          templates={templates} 
          setTemplates={setTemplates} 
          editingTemplate={editingTemplate} 
          setEditingTemplate={setEditingTemplate} 
          exportData={exportData} 
          importData={importData} 
          clearData={clearData} 
          internalTabsEnabled={internalTabsEnabled}
          updateInternalTabsEnabled={updateInternalTabsEnabled}
          showRecentEmpty={showRecentEmpty}
          updateShowRecentEmpty={updateShowRecentEmpty}
          profiles={profiles}
          activeProfileId={activeProfileId}
        />
      );
    }

    if (activeTab === 'quick_llm') {
      return (
        <QuickLlmTab
          profileId={activeProfileId}
          profileName={activeProfileName}
          settings={settings}
          onSaveWord={() => {
            fetchWords();
          }}
        />
      );
    }

    if (activeTab === 'compare') {
      const filteredComparisons = comparisons.filter(c => {
        const q = compareHistorySearchTerm.toLowerCase();
        if (!q) return true;
        if (c.terms && c.terms.toLowerCase().includes(q)) return true;
        if (c.session_id && c.session_id.toLowerCase().includes(q)) return true;
        if (deepSearch && c.response && c.response.toLowerCase().includes(q)) return true;
        return false;
      });
      const totalComparisons = filteredComparisons.length;
      const totalSearches = filteredComparisons.reduce((sum, c) => sum + (c.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          {internalTabsEnabled && (
            <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
              {compareTabs.map(t => (
                <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeCompareTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveCompareTabId(t.id)}>
                  {t.id === 'history' ? <History size={14} /> : <GitCompare size={14} />}
                  <span className="truncate max-w-[150px]">{t.title || 'New Compare'}</span>
                  {t.id !== 'history' && (
                    <>
                      {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                      {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                      <button onClick={(e) => { e.stopPropagation(); setCompareTabs(compareTabs.filter(st => st.id !== t.id)); if (activeCompareTabId === t.id) setActiveCompareTabId(compareTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                    </>
                  )}
                </div>
              ))}
              <button onClick={() => { const id = Date.now().toString(); setCompareTabs([...compareTabs, { id, title: 'New Compare', loading: false, hasData: false, initialComparison: null }]); setActiveCompareTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {compareTabs.map(t => (
              <div key={t.id} className={t.id === activeCompareTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                  <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col gap-4 mb-6">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <h2 className="text-2xl font-bold text-purple-600 dark:text-[#bb9af7] whitespace-nowrap">Comparison History</h2>
                          <button
                            onClick={() => handleRefreshHistory('comparisons')}
                            disabled={isRefreshingHistory}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-purple-600 dark:hover:text-purple-400 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
                            title="Refresh history"
                          >
                            <RefreshCw size={15} className={isRefreshingHistory ? 'animate-spin text-purple-500' : ''} />
                          </button>
                          {!internalTabsEnabled && (
                            <button
                              onClick={() => {
                                const mainTab = compareTabs.find(t => t.id !== 'history') || compareTabs[0];
                                if (mainTab) setActiveCompareTabId(mainTab.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                            >
                              <ArrowLeft size={14} />
                              <span>Back to Compare</span>
                            </button>
                          )}
                        </div>
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
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" checked={deepSearch} onChange={e => setDeepSearch(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-blue-500 focus:ring-blue-500" />
                          Deep Search
                        </label>
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
                          {activeSessionId && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                              <span className="font-semibold truncate max-w-[120px]" title={activeSessionId}>{activeSessionId}</span>
                              <button 
                                onClick={handleEndSession}
                                className="text-green-600 hover:text-red-500 dark:text-green-400 dark:hover:text-red-400 ml-1 font-bold"
                                title="Stop recording to this session"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                          <button 
                            onClick={handleStartNewSession}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors"
                          >
                            New Session
                          </button>
                          <button 
                            onClick={() => setManageSessionsModalOpen(true)}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1"
                            title="Manage all sessions in this profile"
                          >
                            <Layers size={13} />
                            <span>Sessions</span>
                          </button>
                          <button
                            onClick={() => handleRefreshHistory('comparisons')}
                            disabled={isRefreshingHistory}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Refresh history"
                          >
                            <RefreshCw size={12} className={isRefreshingHistory ? 'animate-spin text-purple-500' : ''} />
                            <span>Refresh</span>
                          </button>
                          <button onClick={() => exportData('comparisons')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('comparisons', e)} />
                          </label>
                          <button onClick={() => clearData('comparisons')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 pb-12">
                      {Object.entries(getGroupedByDay(filteredComparisons, 'terms')).map(([group, groupItems]) => (
                        <div key={group} className="space-y-3">
                          {renderGroupHeader(group, groupItems, 'comparison')}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5 gap-4">
                            {groupItems.map(c => (
                              <div 
                                key={c.id} 
                                className="border border-gray-200/90 dark:border-gray-700/80 p-3.5 rounded-xl shadow-xs bg-white dark:bg-gray-800 hover:shadow-md hover:border-purple-400/40 dark:hover:border-purple-500/40 transition-all flex flex-col justify-between group min-w-0"
                              >
                                <div 
                                  className="cursor-pointer min-w-0"
                                  onClick={() => {
                                    if (internalTabsEnabled) {
                                      const blankTab = compareTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                                      if (blankTab) {
                                        setCompareTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: c.terms, loading: true, hasData: false, initialComparison: c } : t));
                                        setActiveCompareTabId(blankTab.id);
                                      } else {
                                        const id = Date.now().toString();
                                        setCompareTabs([...compareTabs, { id, title: c.terms, loading: true, hasData: false, initialComparison: c }]);
                                        setActiveCompareTabId(id);
                                      }
                                    } else {
                                      const mainTab = compareTabs.find(t => t.id !== 'history') || compareTabs[0];
                                      if (mainTab) {
                                        setCompareTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: c.terms, loading: true, hasData: false, initialComparison: c } : t));
                                        setActiveCompareTabId(mainTab.id);
                                      }
                                    }
                                  }}
                                  onMouseEnter={(e) => handleHover(c.id, 'compare', e.currentTarget)}
                                  onMouseLeave={handleHoverLeave}
                                >
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); cycleColor(c, 'comparison'); }}
                                        className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 aspect-square cursor-pointer hover:scale-125 transition-transform"
                                        style={{ backgroundColor: COLORS.find(col => col.id === c.color)?.hex || 'transparent' }}
                                        title={COLORS.find(col => col.id === c.color)?.label || 'Click to set bookmark color'}
                                      />
                                      <StarRating value={c.stars || 0} onChange={(stars) => updateItemStars(c, 'comparison', stars)} size="xs" />
                                      <span 
                                        className="font-bold text-base text-gray-900 dark:text-[#bb9af7] truncate group-hover:text-purple-500 dark:group-hover:text-[#bb9af7] transition-colors" 
                                        title={c.terms}
                                      >
                                        {c.terms}
                                      </span>
                                    </div>
                                    <span 
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap"
                                      title={`${c.search_count || 1} searches`}
                                    >
                                      {c.search_count || 1}×
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1.5 min-w-0 flex-wrap">
                                    {c.session_id && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveToSessionModal({
                                            items: [{ id: c.id, mode: 'comparison', title: c.terms }],
                                            currentSession: c.session_id
                                          });
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shrink-0 cursor-pointer shadow-2xs group/sess"
                                        title={`Session: "${c.session_id}" — Click to change session`}
                                      >
                                        <Folder size={11} className="text-amber-500 dark:text-amber-400 shrink-0 group-hover/sess:scale-110 transition-transform" />
                                        <span className="truncate max-w-[120px]">{c.session_id}</span>
                                      </button>
                                    )}
                                    <span className="font-medium text-gray-500 dark:text-gray-400 shrink-0">Comparison</span>
                                    {c.tag && <span className="truncate">• {c.tag}</span>}
                                  </div>
                                  {hoverReviewMode && hoveredPreviewId === c.id && (
                                    <HoverReviewPopup 
                                      content={previewContent[c.id]} 
                                      anchorRect={hoverAnchorRect}
                                      popupSize={popupSize} 
                                      setPopupSize={setPopupSize} 
                                      isResizingRef={isResizingRef}
                                      onMouseEnter={handlePopupMouseEnter}
                                      onMouseLeave={handleHoverLeave}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 min-w-0">
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 shrink-0" title={`${c.view_count || 1} views`}>
                                    <Eye size={12} className="opacity-70" />
                                    <span>{c.view_count || 1}</span>
                                  </span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveModeModal(c, 'compare'); }} 
                                      className="p-1.5 text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Comparison to another mode & regenerate"
                                    >
                                      <Shuffle size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveToSessionModal({
                                          items: [{ id: c.id, mode: 'comparison', title: c.terms }],
                                          currentSession: c.session_id
                                        });
                                      }} 
                                      className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Comparison to Session"
                                    >
                                      <FolderPlus size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveItemModal(c, 'comparison'); }} 
                                      className="p-1.5 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Comparison to Profile"
                                    >
                                      <ArrowRightLeft size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); renameItem(c.id, c.terms, 'comparison'); }} 
                                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer" 
                                      title="Rename Comparison"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteComparison(c.id); }} 
                                      className="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Delete Comparison"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <CompareTab 
                    key={`${activeProfileId}_${t.id}`}
                    comparisons={comparisons} 
                    onOpenHistory={() => setActiveCompareTabId('history')} 
                    sourceLang={compareSourceLang} 
                    setSourceLang={(val) => syncLang(`compareSourceLang_${activeProfileId}`, val, setCompareSourceLang)} 
                    targetLang={compareTargetLang} 
                    setTargetLang={(val) => syncLang(`compareTargetLang_${activeProfileId}`, val, setCompareTargetLang)} 
                    translationLangs={translationLangs} 
                    profileId={activeProfileId} 
                    tabId={t.id} 
                    fetchComparisons={fetchComparisons} 
                    settings={settings} 
                    defaultSettings={defaultSettings} 
                    showRecentEmpty={showRecentEmpty}
                    models={models} 
                    initialComparison={t.initialComparison} 
                    onUpdateTab={(id, data) => setCompareTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} 
                    onMoveComparison={(item, cb) => openMoveItemModal(item, 'comparison', cb)}
                    onMoveMode={(item, cb) => openMoveModeModal(item, 'compare', cb)}
                    onAssignSession={(item) => openMoveToSessionModal({ items: [{ id: item.id, mode: 'comparison', title: item.terms }], currentSession: item.session_id })}
                    onAddNewTab={internalTabsEnabled ? (terms) => {
                      const id = Date.now().toString();
                      setCompareTabs(prev => [...prev, { id, title: terms, loading: true, hasData: false, initialComparison: { terms, isTemp: true } }]);
                      setActiveCompareTabId(id);
                    } : null}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'search') {
      const filteredWords = words.filter(w => {
        const q = historySearchTerm.toLowerCase();
        if (!q) return true;
        if (w.term && w.term.toLowerCase().includes(q)) return true;
        if (w.session_id && w.session_id.toLowerCase().includes(q)) return true;
        if (deepSearch) {
          if (w.response && w.response.toLowerCase().includes(q)) return true;
          if (w.details && w.details.toLowerCase().includes(q)) return true;
        }
        return false;
      });
      const totalWords = filteredWords.length;
      const totalSearches = filteredWords.reduce((sum, w) => sum + (w.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          {internalTabsEnabled && (
            <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
              {searchTabs.map(t => (
                <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeSearchTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveSearchTabId(t.id)}>
                  {t.id === 'history' ? <History size={14} /> : <Search size={14} />}
                  <span className="truncate max-w-[150px]">{t.title || 'New Search'}</span>
                  {t.id !== 'history' && (
                    <>
                      {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                      {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                      <button onClick={(e) => { e.stopPropagation(); setSearchTabs(searchTabs.filter(st => st.id !== t.id)); if (activeSearchTabId === t.id) setActiveSearchTabId(searchTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                    </>
                  )}
                </div>
              ))}
              <button onClick={() => { const id = Date.now().toString(); setSearchTabs([...searchTabs, { id, title: 'New Search', loading: false, hasData: false, initialWord: null }]); setActiveSearchTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {searchTabs.map(t => (
              <div key={t.id} className={t.id === activeSearchTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                  <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col gap-4 mb-6">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <h2 className="text-2xl font-bold text-blue-600 dark:text-[#7aa2f7] whitespace-nowrap">Word History</h2>
                          <button
                            onClick={() => handleRefreshHistory('words')}
                            disabled={isRefreshingHistory}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
                            title="Refresh history"
                          >
                            <RefreshCw size={15} className={isRefreshingHistory ? 'animate-spin text-blue-500' : ''} />
                          </button>
                          {!internalTabsEnabled && (
                            <button
                              onClick={() => {
                                const mainTab = searchTabs.find(t => t.id !== 'history') || searchTabs[0];
                                if (mainTab) setActiveSearchTabId(mainTab.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                            >
                              <ArrowLeft size={14} />
                              <span>Back to Search</span>
                            </button>
                          )}
                        </div>
                        <div className="relative w-full sm:w-64">
                          <input 
                            type="text" 
                            value={historySearchTerm}
                            onChange={e => setHistorySearchTerm(e.target.value)}
                            placeholder="Search word history..."
                            className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                          />
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" checked={deepSearch} onChange={e => setDeepSearch(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-blue-500 focus:ring-blue-500" />
                          Deep Search
                        </label>
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
                          {activeSessionId && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                              <span className="font-semibold truncate max-w-[120px]" title={activeSessionId}>{activeSessionId}</span>
                              <button 
                                onClick={handleEndSession}
                                className="text-green-600 hover:text-red-500 dark:text-green-400 dark:hover:text-red-400 ml-1 font-bold"
                                title="Stop recording to this session"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                          <button 
                            onClick={() => {
                              if (isWordSelectMode) {
                                setIsWordSelectMode(false);
                                setSelectedWordIds(new Set());
                              } else {
                                setIsWordSelectMode(true);
                              }
                            }}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                              isWordSelectMode
                                ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-900/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-semibold'
                                : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                            }`}
                            title="Toggle multi-select words"
                          >
                            <CheckSquare size={13} />
                            <span>{isWordSelectMode ? 'Cancel Select' : 'Select'}</span>
                          </button>
                          <button 
                            onClick={handleStartNewSession}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors"
                          >
                            New Session
                          </button>
                          <button 
                            onClick={() => setManageSessionsModalOpen(true)}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1"
                            title="Manage all sessions in this profile"
                          >
                            <Layers size={13} />
                            <span>Sessions</span>
                          </button>
                          <button
                            onClick={() => handleRefreshHistory('words')}
                            disabled={isRefreshingHistory}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Refresh history"
                          >
                            <RefreshCw size={12} className={isRefreshingHistory ? 'animate-spin text-blue-500' : ''} />
                            <span>Refresh</span>
                          </button>
                          <button onClick={() => exportData('words')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('words', e)} />
                          </label>
                          <button onClick={() => clearData('words')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>

                    {isWordSelectMode && (
                      <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-50/95 dark:bg-gray-800/95 backdrop-blur-md border border-amber-300 dark:border-amber-700/80 rounded-xl shadow-lg mb-4">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-xs md:text-sm text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                            <CheckSquare size={16} className="text-amber-600 dark:text-amber-400" />
                            <span>{selectedWordIds.size} of {filteredWords.length} words selected</span>
                          </span>
                          <button
                            onClick={() => handleSelectAllWords(filteredWords)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                          >
                            {selectedWordIds.size === filteredWords.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const selectedWords = words.filter(w => selectedWordIds.has(w.id));
                              openMoveToSessionModal({
                                items: selectedWords.map(w => ({ id: w.id, mode: 'word', title: w.term })),
                                currentSession: null
                              });
                            }}
                            disabled={selectedWordIds.size === 0}
                            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <FolderPlus size={14} />
                            <span>Move to Session ({selectedWordIds.size})</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsWordSelectMode(false);
                              setSelectedWordIds(new Set());
                            }}
                            className="px-3 py-1.5 bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-6 pb-12">
                      {Object.entries(getGroupedByDay(filteredWords, 'term')).map(([group, groupItems]) => (
                        <div key={group} className="space-y-3">
                          {renderGroupHeader(group, groupItems, 'word')}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5 gap-4">
                            {groupItems.map(w => (
                              <div 
                                key={w.id} 
                                className={`border p-3.5 rounded-xl shadow-xs transition-all flex flex-col justify-between group min-w-0 ${
                                  selectedWordIds.has(w.id)
                                    ? 'border-amber-400 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 ring-2 ring-amber-400/30'
                                    : 'border-gray-200/90 dark:border-gray-700/80 bg-white dark:bg-gray-800 hover:shadow-md hover:border-blue-400/40 dark:hover:border-blue-500/40'
                                }`}
                              >
                                <div 
                                  className="cursor-pointer min-w-0"
                                  onClick={() => {
                                    if (isWordSelectMode) {
                                      toggleSelectWord(w.id);
                                      return;
                                    }
                                    if (internalTabsEnabled) {
                                      const blankTab = searchTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                                      if (blankTab) {
                                        setSearchTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: w.term, loading: true, hasData: false, initialWord: w } : t));
                                        setActiveSearchTabId(blankTab.id);
                                      } else {
                                        const id = Date.now().toString();
                                        setSearchTabs([...searchTabs, { id, title: w.term, loading: true, hasData: false, initialWord: w }]);
                                        setActiveSearchTabId(id);
                                      }
                                    } else {
                                      const mainTab = searchTabs.find(t => t.id !== 'history') || searchTabs[0];
                                      if (mainTab) {
                                        setSearchTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: w.term, loading: true, hasData: false, initialWord: w } : t));
                                        setActiveSearchTabId(mainTab.id);
                                      }
                                    }
                                  }}
                                  onMouseEnter={(e) => !isWordSelectMode && handleHover(w.id, 'search', e.currentTarget)}
                                  onMouseLeave={handleHoverLeave}
                                >
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {isWordSelectMode && (
                                        <input
                                          type="checkbox"
                                          checked={selectedWordIds.has(w.id)}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            toggleSelectWord(w.id);
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-gray-300 dark:border-gray-600 cursor-pointer shrink-0 mr-1"
                                        />
                                      )}
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); cycleColor(w, 'word'); }}
                                        className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 aspect-square cursor-pointer hover:scale-125 transition-transform"
                                        style={{ backgroundColor: COLORS.find(c => c.id === w.color)?.hex || 'transparent' }}
                                        title={COLORS.find(c => c.id === w.color)?.label || 'Click to set bookmark color'}
                                      />
                                      <StarRating value={w.stars || 0} onChange={(stars) => updateItemStars(w, 'word', stars)} size="xs" />
                                      <span 
                                        className="font-bold text-base text-gray-900 dark:text-[#7aa2f7] truncate group-hover:text-blue-500 dark:group-hover:text-[#7dcfff] transition-colors" 
                                        title={w.term}
                                      >
                                        {w.term}
                                      </span>
                                    </div>
                                    <span 
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap"
                                      title={`${w.search_count || 1} searches`}
                                    >
                                      {w.search_count || 1}×
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1.5 min-w-0 flex-wrap">
                                    {w.session_id && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveToSessionModal({
                                            items: [{ id: w.id, mode: 'word', title: w.term }],
                                            currentSession: w.session_id
                                          });
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shrink-0 cursor-pointer shadow-2xs group/sess"
                                        title={`Session: "${w.session_id}" — Click to change session`}
                                      >
                                        <Folder size={11} className="text-amber-500 dark:text-amber-400 shrink-0 group-hover/sess:scale-110 transition-transform" />
                                        <span className="truncate max-w-[120px]">{w.session_id}</span>
                                      </button>
                                    )}
                                    {w.language && (
                                      <span className="font-medium text-gray-600 dark:text-gray-400 shrink-0">
                                        {w.language}
                                      </span>
                                    )}
                                    {w.lemma && (
                                      <span className="truncate" title={cleanLemma(w.lemma)}>
                                        • {cleanLemma(w.lemma)}
                                      </span>
                                    )}
                                  </div>
                                  {hoverReviewMode && hoveredPreviewId === w.id && (
                                    <HoverReviewPopup 
                                      content={previewContent[w.id]} 
                                      anchorRect={hoverAnchorRect}
                                      popupSize={popupSize} 
                                      setPopupSize={setPopupSize} 
                                      isResizingRef={isResizingRef}
                                      onMouseEnter={handlePopupMouseEnter}
                                      onMouseLeave={handleHoverLeave}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 min-w-0">
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 shrink-0" title={`${w.view_count || 1} views`}>
                                    <Eye size={12} className="opacity-70" />
                                    <span>{w.view_count || 1}</span>
                                  </span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveModeModal(w, 'word'); }} 
                                      className="p-1.5 text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Word to another mode & regenerate"
                                    >
                                      <Shuffle size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveToSessionModal({
                                          items: [{ id: w.id, mode: 'word', title: w.term }],
                                          currentSession: w.session_id
                                        });
                                      }} 
                                      className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Word to Session"
                                    >
                                      <FolderPlus size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveItemModal(w, 'word'); }} 
                                      className="p-1.5 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Word to Profile"
                                    >
                                      <ArrowRightLeft size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); updateLanguage(w.id, w.language); }} 
                                      className="p-1.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Edit Language"
                                    >
                                      <Globe size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); renameItem(w.id, w.term, 'word'); }} 
                                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer" 
                                      title="Rename Word"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteWord(w.id); }} 
                                      className="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Delete Word"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <SearchTab 
                    key={`${activeProfileId}_${t.id}`}
                    words={words} 
                    onOpenHistory={() => setActiveSearchTabId('history')} 
                    profileId={activeProfileId} 
                    profileName={activeProfileName}
                    searchSourceLang={searchSourceLang} 
                    setSearchSourceLang={(val) => syncLang(`searchSourceLang_${activeProfileId}`, val, setSearchSourceLang)} 
                    searchTargetLang={searchTargetLang} 
                    setSearchTargetLang={(val) => syncLang(`searchTargetLang_${activeProfileId}`, val, setSearchTargetLang)} 
                    translationLangs={translationLangs} 
                    tabId={t.id} 
                    fetchWords={fetchWords} 
                    settings={settings} 
                    defaultSettings={defaultSettings} 
                    showRecentEmpty={showRecentEmpty}
                    models={models} 
                    templates={templates} 
                    initialWord={t.initialWord} 
                    onUpdateTab={(id, data) => setSearchTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} 
                    onMoveWord={(word, cb) => openMoveItemModal(word, 'word', cb)}
                    onMoveMode={(word, cb) => openMoveModeModal(word, 'word', cb)}
                    onAssignSession={(word) => openMoveToSessionModal({ items: [{ id: word.id, mode: 'word', title: word.term }], currentSession: word.session_id })}
                    onAddNewTab={internalTabsEnabled ? (term) => {
                      const id = Date.now().toString();
                      setSearchTabs(prev => [...prev, { id, title: term, loading: true, hasData: false, initialWord: { term, isTemp: true } }]);
                      setActiveSearchTabId(id);
                    } : null}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'explain') {
      const filteredExplains = explains.filter(c => {
        const q = explainHistorySearchTerm.toLowerCase();
        if (!q) return true;
        if (c.text && c.text.toLowerCase().includes(q)) return true;
        if (c.session_id && c.session_id.toLowerCase().includes(q)) return true;
        if (deepSearch && c.response && c.response.toLowerCase().includes(q)) return true;
        return false;
      });
      const totalExplains = filteredExplains.length;
      const totalSearches = filteredExplains.reduce((sum, c) => sum + (c.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          {internalTabsEnabled && (
            <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
              {explainTabs.map(t => (
                <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeExplainTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveExplainTabId(t.id)}>
                  {t.id === 'history' ? <History size={14} /> : <MessageSquare size={14} />}
                  <span className="truncate max-w-[150px]">{t.title || 'New Explain'}</span>
                  {t.id !== 'history' && (
                    <>
                      {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                      {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                      <button onClick={(e) => { e.stopPropagation(); setExplainTabs(explainTabs.filter(st => st.id !== t.id)); if (activeExplainTabId === t.id) setActiveExplainTabId(explainTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                    </>
                  )}
                </div>
              ))}
              <button onClick={() => { const id = Date.now().toString(); setExplainTabs([...explainTabs, { id, title: 'New Explain', loading: false, hasData: false, initialExplain: null }]); setActiveExplainTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {explainTabs.map(t => (
              <div key={t.id} className={t.id === activeExplainTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                  <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col gap-4 mb-6">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <h2 className="text-2xl font-bold text-teal-600 dark:text-[#73daca] whitespace-nowrap">Explain History</h2>
                          <button
                            onClick={() => handleRefreshHistory('explains')}
                            disabled={isRefreshingHistory}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-teal-600 dark:hover:text-teal-400 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
                            title="Refresh history"
                          >
                            <RefreshCw size={15} className={isRefreshingHistory ? 'animate-spin text-teal-500' : ''} />
                          </button>
                          {!internalTabsEnabled && (
                            <button
                              onClick={() => {
                                const mainTab = explainTabs.find(t => t.id !== 'history') || explainTabs[0];
                                if (mainTab) setActiveExplainTabId(mainTab.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                            >
                              <ArrowLeft size={14} />
                              <span>Back to Explain</span>
                            </button>
                          )}
                        </div>
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
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" checked={deepSearch} onChange={e => setDeepSearch(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-blue-500 focus:ring-blue-500" />
                          Deep Search
                        </label>
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
                          {activeSessionId && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                              <span className="font-semibold truncate max-w-[120px]" title={activeSessionId}>{activeSessionId}</span>
                              <button 
                                onClick={handleEndSession}
                                className="text-green-600 hover:text-red-500 dark:text-green-400 dark:hover:text-red-400 ml-1 font-bold"
                                title="Stop recording to this session"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                          <button 
                            onClick={handleStartNewSession}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors"
                          >
                            New Session
                          </button>
                          <button 
                            onClick={() => setManageSessionsModalOpen(true)}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1"
                            title="Manage all sessions in this profile"
                          >
                            <Layers size={13} />
                            <span>Sessions</span>
                          </button>
                          <button
                            onClick={() => handleRefreshHistory('explains')}
                            disabled={isRefreshingHistory}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Refresh history"
                          >
                            <RefreshCw size={12} className={isRefreshingHistory ? 'animate-spin text-teal-500' : ''} />
                            <span>Refresh</span>
                          </button>
                          <button onClick={() => exportData('explains')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('explains', e)} />
                          </label>
                          <button onClick={() => clearData('explains')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 pb-12">
                      {Object.entries(getGroupedByDay(filteredExplains, 'text')).map(([group, groupItems]) => (
                        <div key={group} className="space-y-3">
                          {renderGroupHeader(group, groupItems, 'explain')}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5 gap-4">
                            {groupItems.map(c => (
                              <div 
                                key={c.id} 
                                className="border border-gray-200/90 dark:border-gray-700/80 p-3.5 rounded-xl shadow-xs bg-white dark:bg-gray-800 hover:shadow-md hover:border-teal-400/40 dark:hover:border-teal-500/40 transition-all flex flex-col justify-between group min-w-0"
                              >
                                <div 
                                  className="cursor-pointer min-w-0"
                                  onClick={() => {
                                    if (internalTabsEnabled) {
                                      const blankTab = explainTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                                      if (blankTab) {
                                        setExplainTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialExplain: c } : t));
                                        setActiveExplainTabId(blankTab.id);
                                      } else {
                                        const id = Date.now().toString();
                                        setExplainTabs([...explainTabs, { id, title: c.text, loading: true, hasData: false, initialExplain: c }]);
                                        setActiveExplainTabId(id);
                                      }
                                    } else {
                                      const mainTab = explainTabs.find(t => t.id !== 'history') || explainTabs[0];
                                      if (mainTab) {
                                        setExplainTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialExplain: c } : t));
                                        setActiveExplainTabId(mainTab.id);
                                      }
                                    }
                                  }}
                                  onMouseEnter={(e) => handleHover(c.id, 'explain', e.currentTarget)}
                                  onMouseLeave={handleHoverLeave}
                                >
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); cycleColor(c, 'explain'); }}
                                        className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 aspect-square cursor-pointer hover:scale-125 transition-transform"
                                        style={{ backgroundColor: COLORS.find(col => col.id === c.color)?.hex || 'transparent' }}
                                        title={COLORS.find(col => col.id === c.color)?.label || 'Click to set bookmark color'}
                                      />
                                      <StarRating value={c.stars || 0} onChange={(stars) => updateItemStars(c, 'explain', stars)} size="xs" />
                                      <span 
                                        className="font-bold text-base text-gray-900 dark:text-[#73daca] truncate group-hover:text-teal-500 dark:group-hover:text-[#73daca] transition-colors" 
                                        title={c.text}
                                      >
                                        {c.text}
                                      </span>
                                    </div>
                                    <span 
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap"
                                      title={`${c.search_count || 1} searches`}
                                    >
                                      {c.search_count || 1}×
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1.5 min-w-0 flex-wrap">
                                    {c.session_id && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveToSessionModal({
                                            items: [{ id: c.id, mode: 'explain', title: c.text }],
                                            currentSession: c.session_id
                                          });
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shrink-0 cursor-pointer shadow-2xs group/sess"
                                        title={`Session: "${c.session_id}" — Click to change session`}
                                      >
                                        <Folder size={11} className="text-amber-500 dark:text-amber-400 shrink-0 group-hover/sess:scale-110 transition-transform" />
                                        <span className="truncate max-w-[120px]">{c.session_id}</span>
                                      </button>
                                    )}
                                    <span className="font-medium text-gray-500 dark:text-gray-400 shrink-0">Explanation</span>
                                    {c.tag && <span className="truncate">• {c.tag}</span>}
                                  </div>
                                  {hoverReviewMode && hoveredPreviewId === c.id && (
                                    <HoverReviewPopup 
                                      content={previewContent[c.id]} 
                                      anchorRect={hoverAnchorRect}
                                      popupSize={popupSize} 
                                      setPopupSize={setPopupSize} 
                                      isResizingRef={isResizingRef}
                                      onMouseEnter={handlePopupMouseEnter}
                                      onMouseLeave={handleHoverLeave}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 min-w-0">
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 shrink-0" title={`${c.view_count || 1} views`}>
                                    <Eye size={12} className="opacity-70" />
                                    <span>{c.view_count || 1}</span>
                                  </span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveModeModal(c, 'explain'); }} 
                                      className="p-1.5 text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Explain to another mode & regenerate"
                                    >
                                      <Shuffle size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveToSessionModal({
                                          items: [{ id: c.id, mode: 'explain', title: c.text }],
                                          currentSession: c.session_id
                                        });
                                      }} 
                                      className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Explain to Session"
                                    >
                                      <FolderPlus size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveItemModal(c, 'explain'); }} 
                                      className="p-1.5 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Explain to Profile"
                                    >
                                      <ArrowRightLeft size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); renameItem(c.id, c.text, 'explain'); }} 
                                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer" 
                                      title="Rename Explain"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteExplain(c.id); }} 
                                      className="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Delete Explain"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ExplainTab 
                    key={`${activeProfileId}_${t.id}`}
                    explains={explains} 
                    onOpenHistory={() => setActiveExplainTabId('history')} 
                    sourceLang={explainSourceLang} 
                    setSourceLang={(val) => syncLang(`explainSourceLang_${activeProfileId}`, val, setExplainSourceLang)} 
                    targetLang={explainTargetLang} 
                    setTargetLang={(val) => syncLang(`explainTargetLang_${activeProfileId}`, val, setExplainTargetLang)} 
                    translationLangs={translationLangs} 
                    profileId={activeProfileId} 
                    profileName={activeProfileName}
                    tabId={t.id} 
                    fetchExplains={fetchExplains} 
                    settings={settings} 
                    defaultSettings={defaultSettings} 
                    showRecentEmpty={showRecentEmpty}
                    models={models} 
                    initialExplain={t.initialExplain} 
                    onUpdateTab={(id, data) => setExplainTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} 
                    onMoveExplain={(item, cb) => openMoveItemModal(item, 'explain', cb)}
                    onMoveMode={(item, cb) => openMoveModeModal(item, 'explain', cb)}
                    onAssignSession={(item) => openMoveToSessionModal({ items: [{ id: item.id, mode: 'explain', title: item.text }], currentSession: item.session_id })}
                    onAddNewTab={internalTabsEnabled ? (text) => {
                      const id = Date.now().toString();
                      setExplainTabs(prev => [...prev, { id, title: text, loading: true, hasData: false, initialExplain: { text, isTemp: true } }]);
                      setActiveExplainTabId(id);
                    } : null}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'translation') {
      const filteredTranslations = translations.filter(c => {
        const q = translationHistorySearchTerm.toLowerCase();
        if (!q) return true;
        if (c.text && c.text.toLowerCase().includes(q)) return true;
        if (c.session_id && c.session_id.toLowerCase().includes(q)) return true;
        if (deepSearch && c.response && c.response.toLowerCase().includes(q)) return true;
        return false;
      });
      const totalTranslations = filteredTranslations.length;
      const totalSearches = filteredTranslations.reduce((sum, c) => sum + (c.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          {internalTabsEnabled && (
            <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
              {translationTabs.map(t => (
                <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeTranslationTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveTranslationTabId(t.id)}>
                  {t.id === 'history' ? <History size={14} /> : <Globe size={14} />}
                  <span className="truncate max-w-[150px]">{t.title || 'New Translation'}</span>
                  {t.id !== 'history' && (
                    <>
                      {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                      {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                      <button onClick={(e) => { e.stopPropagation(); setTranslationTabs(translationTabs.filter(st => st.id !== t.id)); if (activeTranslationTabId === t.id) setActiveTranslationTabId(translationTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                    </>
                  )}
                </div>
              ))}
              <button onClick={() => { const id = Date.now().toString(); setTranslationTabs([...translationTabs, { id, title: 'New Translation', loading: false, hasData: false, initialTranslation: null }]); setActiveTranslationTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {translationTabs.map(t => (
              <div key={t.id} className={t.id === activeTranslationTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                  <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col gap-4 mb-6">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <h2 className="text-2xl font-bold text-amber-600 dark:text-[#e0af68] whitespace-nowrap">Translation History</h2>
                          <button
                            onClick={() => handleRefreshHistory('translations')}
                            disabled={isRefreshingHistory}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-amber-600 dark:hover:text-amber-400 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
                            title="Refresh history"
                          >
                            <RefreshCw size={15} className={isRefreshingHistory ? 'animate-spin text-amber-500' : ''} />
                          </button>
                          {!internalTabsEnabled && (
                            <button
                              onClick={() => {
                                const mainTab = translationTabs.find(t => t.id !== 'history') || translationTabs[0];
                                if (mainTab) setActiveTranslationTabId(mainTab.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                            >
                              <ArrowLeft size={14} />
                              <span>Back to Translation</span>
                            </button>
                          )}
                        </div>
                        <div className="relative w-full sm:w-64">
                          <input 
                            type="text" 
                            value={translationHistorySearchTerm}
                            onChange={e => setTranslationHistorySearchTerm(e.target.value)}
                            placeholder="Search translation history..."
                            className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                          />
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" checked={deepSearch} onChange={e => setDeepSearch(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-blue-500 focus:ring-blue-500" />
                          Deep Search
                        </label>
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
                            <span className="font-medium">Total Translations:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalTranslations}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Total Searches:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeSessionId && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                              <span className="font-semibold truncate max-w-[120px]" title={activeSessionId}>{activeSessionId}</span>
                              <button 
                                onClick={handleEndSession}
                                className="text-green-600 hover:text-red-500 dark:text-green-400 dark:hover:text-red-400 ml-1 font-bold"
                                title="Stop recording to this session"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                          <button 
                            onClick={handleStartNewSession}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors"
                          >
                            New Session
                          </button>
                          <button 
                            onClick={() => setManageSessionsModalOpen(true)}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1"
                            title="Manage all sessions in this profile"
                          >
                            <Layers size={13} />
                            <span>Sessions</span>
                          </button>
                          <button
                            onClick={() => handleRefreshHistory('translations')}
                            disabled={isRefreshingHistory}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Refresh history"
                          >
                            <RefreshCw size={12} className={isRefreshingHistory ? 'animate-spin text-amber-500' : ''} />
                            <span>Refresh</span>
                          </button>
                          <button onClick={() => exportData('translations')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('translations', e)} />
                          </label>
                          <button onClick={() => clearData('translations')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 pb-12">
                      {Object.entries(getGroupedByDay(filteredTranslations, 'text')).map(([group, groupItems]) => (
                        <div key={group} className="space-y-3">
                          {renderGroupHeader(group, groupItems, 'translation')}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5 gap-4">
                            {groupItems.map(c => (
                              <div 
                                key={c.id} 
                                className="border border-gray-200/90 dark:border-gray-700/80 p-3.5 rounded-xl shadow-xs bg-white dark:bg-gray-800 hover:shadow-md hover:border-amber-400/40 dark:hover:border-amber-500/40 transition-all flex flex-col justify-between group min-w-0"
                              >
                                <div 
                                  className="cursor-pointer min-w-0"
                                  onClick={() => {
                                    if (internalTabsEnabled) {
                                      const blankTab = translationTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                                      if (blankTab) {
                                        setTranslationTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialTranslation: c } : t));
                                        setActiveTranslationTabId(blankTab.id);
                                      } else {
                                        const id = Date.now().toString();
                                        setTranslationTabs([...translationTabs, { id, title: c.text, loading: true, hasData: false, initialTranslation: c }]);
                                        setActiveTranslationTabId(id);
                                      }
                                    } else {
                                      const mainTab = translationTabs.find(t => t.id !== 'history') || translationTabs[0];
                                      if (mainTab) {
                                        setTranslationTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialTranslation: c } : t));
                                        setActiveTranslationTabId(mainTab.id);
                                      }
                                    }
                                  }}
                                  onMouseEnter={(e) => handleHover(c.id, 'translation', e.currentTarget)}
                                  onMouseLeave={handleHoverLeave}
                                >
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); cycleColor(c, 'translation'); }}
                                        className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 aspect-square cursor-pointer hover:scale-125 transition-transform"
                                        style={{ backgroundColor: COLORS.find(col => col.id === c.color)?.hex || 'transparent' }}
                                        title={COLORS.find(col => col.id === c.color)?.label || 'Click to set bookmark color'}
                                      />
                                      <StarRating value={c.stars || 0} onChange={(stars) => updateItemStars(c, 'translation', stars)} size="xs" />
                                      <span 
                                        className="font-bold text-base text-gray-900 dark:text-[#e0af68] truncate group-hover:text-amber-500 dark:group-hover:text-[#e0af68] transition-colors" 
                                        title={c.text}
                                      >
                                        {c.text}
                                      </span>
                                    </div>
                                    <span 
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap"
                                      title={`${c.search_count || 1} searches`}
                                    >
                                      {c.search_count || 1}×
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1.5 min-w-0 flex-wrap">
                                    {c.session_id && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveToSessionModal({
                                            items: [{ id: c.id, mode: 'translation', title: c.text }],
                                            currentSession: c.session_id
                                          });
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shrink-0 cursor-pointer shadow-2xs group/sess"
                                        title={`Session: "${c.session_id}" — Click to change session`}
                                      >
                                        <Folder size={11} className="text-amber-500 dark:text-amber-400 shrink-0 group-hover/sess:scale-110 transition-transform" />
                                        <span className="truncate max-w-[120px]">{c.session_id}</span>
                                      </button>
                                    )}
                                    {(c.source_lang || c.target_lang) && (
                                      <span className="font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                        {c.source_lang || 'Auto'} &rarr; {c.target_lang || 'En'}
                                      </span>
                                    )}
                                    {c.tag && <span className="truncate">• {c.tag}</span>}
                                  </div>
                                  {hoverReviewMode && hoveredPreviewId === c.id && (
                                    <HoverReviewPopup 
                                      content={previewContent[c.id]} 
                                      anchorRect={hoverAnchorRect}
                                      popupSize={popupSize} 
                                      setPopupSize={setPopupSize} 
                                      isResizingRef={isResizingRef}
                                      onMouseEnter={handlePopupMouseEnter}
                                      onMouseLeave={handleHoverLeave}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 min-w-0">
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 shrink-0" title={`${c.view_count || 1} views`}>
                                    <Eye size={12} className="opacity-70" />
                                    <span>{c.view_count || 1}</span>
                                  </span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveModeModal(c, 'translation'); }} 
                                      className="p-1.5 text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Translation to another mode & regenerate"
                                    >
                                      <Shuffle size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveToSessionModal({
                                          items: [{ id: c.id, mode: 'translation', title: c.text }],
                                          currentSession: c.session_id
                                        });
                                      }} 
                                      className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Translation to Session"
                                    >
                                      <FolderPlus size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveItemModal(c, 'translation'); }} 
                                      className="p-1.5 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Translation to Profile"
                                    >
                                      <ArrowRightLeft size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); renameItem(c.id, c.text, 'translation'); }} 
                                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer" 
                                      title="Rename Translation"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteTranslation(c.id); }} 
                                      className="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Delete Translation"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <TranslationTab 
                    key={`${activeProfileId}_${t.id}`}
                    translations={translations} 
                    onOpenHistory={() => setActiveTranslationTabId('history')} 
                    profileId={activeProfileId} 
                    profileName={activeProfileName}
                    tabId={t.id} 
                    fetchTranslations={fetchTranslations} 
                    settings={settings} 
                    defaultSettings={defaultSettings} 
                    showRecentEmpty={showRecentEmpty}
                    models={models} 
                    initialTranslation={t.initialTranslation} 
                    onUpdateTab={(id, data) => setTranslationTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} 
                    translationSourceLang={translationSourceLang} 
                    setTranslationSourceLang={(val) => syncLang(`translationSourceLang_${activeProfileId}`, val, setTranslationSourceLang)} 
                    translationTargetLang={translationTargetLang} 
                    setTranslationTargetLang={(val) => syncLang(`translationTargetLang_${activeProfileId}`, val, setTranslationTargetLang)} 
                    translationLangs={translationLangs} 
                    setTranslationLangs={setTranslationLangs} 
                    onMoveTranslation={(item, cb) => openMoveItemModal(item, 'translation', cb)}
                    onMoveMode={(item, cb) => openMoveModeModal(item, 'translation', cb)}
                    onAssignSession={(item) => openMoveToSessionModal({ items: [{ id: item.id, mode: 'translation', title: item.text }], currentSession: item.session_id })}
                    onAddNewTab={internalTabsEnabled ? (text) => {
                      const id = Date.now().toString();
                      setTranslationTabs(prev => [...prev, { id, title: text, loading: true, hasData: false, initialTranslation: { text, isTemp: true } }]);
                      setActiveTranslationTabId(id);
                    } : null}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'correction') {
      const filteredCorrections = corrections.filter(c => {
        const q = correctionHistorySearchTerm.toLowerCase();
        if (!q) return true;
        if (c.text && c.text.toLowerCase().includes(q)) return true;
        if (c.session_id && c.session_id.toLowerCase().includes(q)) return true;
        if (deepSearch && c.response && c.response.toLowerCase().includes(q)) return true;
        return false;
      });
      const totalCorrections = filteredCorrections.length;
      const totalSearches = filteredCorrections.reduce((sum, c) => sum + (c.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          {internalTabsEnabled && (
            <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
              {correctionTabs.map(t => (
                <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeCorrectionTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveCorrectionTabId(t.id)}>
                  {t.id === 'history' ? <History size={14} /> : <CheckCheck size={14} />}
                  <span className="truncate max-w-[150px]">{t.title || 'New Correction'}</span>
                  {t.id !== 'history' && (
                    <>
                      {t.loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
                      {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                      <button onClick={(e) => { e.stopPropagation(); setCorrectionTabs(correctionTabs.filter(st => st.id !== t.id)); if (activeCorrectionTabId === t.id) setActiveCorrectionTabId(correctionTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                    </>
                  )}
                </div>
              ))}
              <button onClick={() => { const id = Date.now().toString(); setCorrectionTabs([...correctionTabs, { id, title: 'New Correction', loading: false, hasData: false, initialCorrection: null }]); setActiveCorrectionTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {correctionTabs.map(t => (
              <div key={t.id} className={t.id === activeCorrectionTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                  <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col gap-4 mb-6">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Correction History</h2>
                          <button
                            onClick={() => handleRefreshHistory('corrections')}
                            disabled={isRefreshingHistory}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
                            title="Refresh history"
                          >
                            <RefreshCw size={15} className={isRefreshingHistory ? 'animate-spin text-emerald-500' : ''} />
                          </button>
                          {!internalTabsEnabled && (
                            <button
                              onClick={() => {
                                const mainTab = correctionTabs.find(t => t.id !== 'history') || correctionTabs[0];
                                if (mainTab) setActiveCorrectionTabId(mainTab.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                            >
                              <ArrowLeft size={14} />
                              <span>Back to Correction</span>
                            </button>
                          )}
                        </div>
                        <div className="relative w-full sm:w-64">
                          <input 
                            type="text" 
                            value={correctionHistorySearchTerm}
                            onChange={e => setCorrectionHistorySearchTerm(e.target.value)}
                            placeholder="Search correction history..."
                            className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                          />
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" checked={deepSearch} onChange={e => setDeepSearch(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-blue-500 focus:ring-blue-500" />
                          Deep Search
                        </label>
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
                            <span className="font-medium">Total Corrections:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalCorrections}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Total Searches:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeSessionId && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                              <span className="font-semibold truncate max-w-[120px]" title={activeSessionId}>{activeSessionId}</span>
                              <button 
                                onClick={handleEndSession}
                                className="text-green-600 hover:text-red-500 dark:text-green-400 dark:hover:text-red-400 ml-1 font-bold"
                                title="Stop recording to this session"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                          <button 
                            onClick={handleStartNewSession}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors"
                          >
                            New Session
                          </button>
                          <button 
                            onClick={() => setManageSessionsModalOpen(true)}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1"
                            title="Manage all sessions in this profile"
                          >
                            <Layers size={13} />
                            <span>Sessions</span>
                          </button>
                          <button
                            onClick={() => handleRefreshHistory('corrections')}
                            disabled={isRefreshingHistory}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Refresh history"
                          >
                            <RefreshCw size={12} className={isRefreshingHistory ? 'animate-spin text-emerald-500' : ''} />
                            <span>Refresh</span>
                          </button>
                          <button onClick={() => exportData('corrections')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('corrections', e)} />
                          </label>
                          <button onClick={() => clearData('corrections')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 pb-12">
                      {Object.entries(getGroupedByDay(filteredCorrections, 'text')).map(([group, groupItems]) => (
                        <div key={group} className="space-y-3">
                          {renderGroupHeader(group, groupItems, 'correction')}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5 gap-4">
                            {groupItems.map(c => (
                              <div 
                                key={c.id} 
                                className="border border-gray-200/90 dark:border-gray-700/80 p-3.5 rounded-xl shadow-xs bg-white dark:bg-gray-800 hover:shadow-md hover:border-emerald-400/40 dark:hover:border-emerald-500/40 transition-all flex flex-col justify-between group min-w-0"
                              >
                                <div 
                                  className="cursor-pointer min-w-0"
                                  onClick={() => {
                                    if (internalTabsEnabled) {
                                      const blankTab = correctionTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                                      if (blankTab) {
                                        setCorrectionTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialCorrection: c } : t));
                                        setActiveCorrectionTabId(blankTab.id);
                                      } else {
                                        const id = Date.now().toString();
                                        setCorrectionTabs([...correctionTabs, { id, title: c.text, loading: true, hasData: false, initialCorrection: c }]);
                                        setActiveCorrectionTabId(id);
                                      }
                                    } else {
                                      const mainTab = correctionTabs.find(t => t.id !== 'history') || correctionTabs[0];
                                      if (mainTab) {
                                        setCorrectionTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialCorrection: c } : t));
                                        setActiveCorrectionTabId(mainTab.id);
                                      }
                                    }
                                  }}
                                  onMouseEnter={(e) => handleHover(c.id, 'correction', e.currentTarget)}
                                  onMouseLeave={handleHoverLeave}
                                >
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); cycleColor(c, 'correction'); }}
                                        className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 aspect-square cursor-pointer hover:scale-125 transition-transform"
                                        style={{ backgroundColor: COLORS.find(col => col.id === c.color)?.hex || 'transparent' }}
                                        title={COLORS.find(col => col.id === c.color)?.label || 'Click to set bookmark color'}
                                      />
                                      <StarRating value={c.stars || 0} onChange={(stars) => updateItemStars(c, 'correction', stars)} size="xs" />
                                      <span 
                                        className="font-bold text-base text-gray-900 dark:text-emerald-400 truncate group-hover:text-emerald-500 transition-colors" 
                                        title={c.text}
                                      >
                                        {c.text}
                                      </span>
                                    </div>
                                    <span 
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap"
                                      title={`${c.search_count || 1} searches`}
                                    >
                                      {c.search_count || 1}×
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1.5 min-w-0 flex-wrap">
                                    {c.session_id && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveToSessionModal({
                                            items: [{ id: c.id, mode: 'correction', title: c.text }],
                                            currentSession: c.session_id
                                          });
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shrink-0 cursor-pointer shadow-2xs group/sess"
                                        title={`Session: "${c.session_id}" — Click to change session`}
                                      >
                                        <Folder size={11} className="text-amber-500 dark:text-amber-400 shrink-0 group-hover/sess:scale-110 transition-transform" />
                                        <span className="truncate max-w-[120px]">{c.session_id}</span>
                                      </button>
                                    )}
                                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 ${
                                      c.mode_type === 'correction_only'
                                        ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                    }`}>
                                      {c.mode_type === 'correction_only' ? 'Correction Only' : 'Correction + Translation'}
                                    </span>
                                    {(c.source_lang || c.target_lang) && (
                                      <span className="font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                        {c.source_lang || 'Auto'} &rarr; {c.target_lang || 'En'}
                                      </span>
                                    )}
                                    {c.tag && <span className="truncate">• {c.tag}</span>}
                                  </div>
                                  {hoverReviewMode && hoveredPreviewId === c.id && (
                                    <HoverReviewPopup 
                                      content={previewContent[c.id]} 
                                      anchorRect={hoverAnchorRect}
                                      popupSize={popupSize} 
                                      setPopupSize={setPopupSize} 
                                      isResizingRef={isResizingRef}
                                      onMouseEnter={handlePopupMouseEnter}
                                      onMouseLeave={handleHoverLeave}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 min-w-0">
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 shrink-0" title={`${c.view_count || 1} views`}>
                                    <Eye size={12} className="opacity-70" />
                                    <span>{c.view_count || 1}</span>
                                  </span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveModeModal(c, 'correction'); }} 
                                      className="p-1.5 text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Correction to another mode & regenerate"
                                    >
                                      <Shuffle size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveToSessionModal({
                                          items: [{ id: c.id, mode: 'correction', title: c.text }],
                                          currentSession: c.session_id
                                        });
                                      }} 
                                      className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Correction to Session"
                                    >
                                      <FolderPlus size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveItemModal(c, 'correction'); }} 
                                      className="p-1.5 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move Correction to Profile"
                                    >
                                      <ArrowRightLeft size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); renameItem(c.id, c.text, 'correction'); }} 
                                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer" 
                                      title="Rename Correction"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteCorrection(c.id); }} 
                                      className="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Delete Correction"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <CorrectionTab 
                    key={`${activeProfileId}_${t.id}`}
                    corrections={corrections} 
                    onOpenHistory={() => setActiveCorrectionTabId('history')} 
                    profileId={activeProfileId} 
                    profileName={activeProfileName}
                    tabId={t.id} 
                    fetchCorrections={fetchCorrections} 
                    settings={settings} 
                    defaultSettings={defaultSettings} 
                    showRecentEmpty={showRecentEmpty}
                    models={models} 
                    initialCorrection={t.initialCorrection} 
                    onUpdateTab={(id, data) => setCorrectionTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} 
                    correctionSourceLang={correctionSourceLang} 
                    setCorrectionSourceLang={(val) => syncLang(`correctionSourceLang_${activeProfileId}`, val, setCorrectionSourceLang)} 
                    correctionTargetLang={correctionTargetLang} 
                    setCorrectionTargetLang={(val) => syncLang(`correctionTargetLang_${activeProfileId}`, val, setCorrectionTargetLang)} 
                    correctionModeType={correctionModeType}
                    setCorrectionModeType={(val) => {
                      setCorrectionModeType(val);
                      try { localStorage.setItem(`correctionModeType_${activeProfileId}`, val); } catch (e) {}
                    }}
                    correctionLangs={correctionLangs} 
                    setCorrectionLangs={setCorrectionLangs} 
                    onMoveCorrection={(item, cb) => openMoveItemModal(item, 'correction', cb)}
                    onMoveMode={(item, cb) => openMoveModeModal(item, 'correction', cb)}
                    onAssignSession={(item) => openMoveToSessionModal({ items: [{ id: item.id, mode: 'correction', title: item.text }], currentSession: item.session_id })}
                    onAddNewTab={internalTabsEnabled ? (text) => {
                      const id = Date.now().toString();
                      setCorrectionTabs(prev => [...prev, { id, title: text, loading: true, hasData: false, initialCorrection: { text, isTemp: true } }]);
                      setActiveCorrectionTabId(id);
                    } : null}
                    onOpenLlmMode={handleOpenLlmMode}
                    onOpenMtMode={handleOpenMtMode}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'llm') {
      const filteredLlmRecords = llmRecords.filter(item => {
        const q = llmHistorySearchTerm.toLowerCase();
        if (!q) return true;
        if (item.text && item.text.toLowerCase().includes(q)) return true;
        if (item.session_id && item.session_id.toLowerCase().includes(q)) return true;
        if (deepSearch && item.response && item.response.toLowerCase().includes(q)) return true;
        return false;
      });
      const totalLlmRecords = filteredLlmRecords.length;
      const totalSearches = filteredLlmRecords.reduce((sum, item) => sum + (item.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          {internalTabsEnabled && (
            <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
              {llmTabs.map(t => (
                <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeLlmTabId ? 'bg-white dark:bg-gray-800 font-medium text-purple-600 dark:text-purple-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveLlmTabId(t.id)}>
                  {t.id === 'history' ? <History size={14} /> : <Sparkles size={14} />}
                  <span className="truncate max-w-[150px]">{t.title || 'Special LLM'}</span>
                  {t.id !== 'history' && (
                    <>
                      {t.loading && <Loader2 size={12} className="animate-spin text-purple-500" />}
                      {!t.loading && t.hasData && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Done"></div>}
                      <button onClick={(e) => { e.stopPropagation(); setLlmTabs(llmTabs.filter(st => st.id !== t.id)); if (activeLlmTabId === t.id) setActiveLlmTabId(llmTabs[0]?.id || 'history') }} className="ml-2 text-gray-400 hover:text-red-500 shrink-0">&times;</button>
                    </>
                  )}
                </div>
              ))}
              <button onClick={() => { const id = Date.now().toString(); setLlmTabs([...llmTabs, { id, title: 'Special LLM', loading: false, hasData: false, initialLlm: null }]); setActiveLlmTabId(id) }} className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold shrink-0">+</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
            {llmTabs.map(t => (
              <div key={t.id} className={t.id === activeLlmTabId ? 'h-full block' : 'hidden'}>
                {t.id === 'history' ? (
                  <div className="h-full overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col gap-4 mb-6">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <h2 className="text-2xl font-bold text-purple-600 dark:text-purple-400 whitespace-nowrap flex items-center gap-2">
                            <Sparkles size={24} className="text-purple-500" />
                            <span>Special LLM History</span>
                          </h2>
                          <button
                            onClick={() => handleRefreshHistory('llm')}
                            disabled={isRefreshingHistory}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-purple-600 dark:hover:text-purple-400 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center cursor-pointer"
                            title="Refresh history"
                          >
                            <RefreshCw size={15} className={isRefreshingHistory ? 'animate-spin text-purple-500' : ''} />
                          </button>
                          {!internalTabsEnabled && (
                            <button
                              onClick={() => {
                                const mainTab = llmTabs.find(t => t.id !== 'history') || llmTabs[0];
                                if (mainTab) setActiveLlmTabId(mainTab.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                            >
                              <ArrowLeft size={14} />
                              <span>Back to LLM Mode</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setActiveTab('correction');
                              updateUrlPath('/correction');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 transition-colors shadow-sm cursor-pointer"
                            title="Back to Correction mode"
                          >
                            <CheckCheck size={14} />
                            <span>Back to Correction</span>
                          </button>
                        </div>
                        <div className="relative w-full sm:w-64">
                          <input 
                            type="text" 
                            value={llmHistorySearchTerm}
                            onChange={e => setLlmHistorySearchTerm(e.target.value)}
                            placeholder="Search LLM history..."
                            className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm shadow-sm"
                          />
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" checked={deepSearch} onChange={e => setDeepSearch(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-purple-500 focus:ring-purple-500" />
                          Deep Search
                        </label>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => toggleHoverReviewMode()}
                            className={`p-1.5 rounded-lg flex items-center gap-1.5 text-sm border shadow-sm transition-colors ${hoverReviewMode ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700 dark:bg-purple-600 dark:border-purple-600 dark:text-white dark:hover:bg-purple-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                            title="Toggle Quick Review on Hover"
                          >
                            <ScanLine size={16} /> 
                            <span className="hidden sm:inline font-medium">Hover Review</span>
                          </button>
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-2">Sort by:</span>
                          <select 
                            value={historySort} 
                            onChange={e => setHistorySort(e.target.value)} 
                            className="border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm shadow-sm"
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
                            <span className="font-medium">Total Records:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalLlmRecords}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Total Searches:</span> 
                            <span className="text-gray-900 dark:text-gray-100 font-bold">{totalSearches}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeSessionId && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                              <span className="font-semibold truncate max-w-[120px]" title={activeSessionId}>{activeSessionId}</span>
                              <button 
                                onClick={handleEndSession}
                                className="text-green-600 hover:text-red-500 dark:text-green-400 dark:hover:text-red-400 ml-1 font-bold"
                                title="Stop recording to this session"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                          <button 
                            onClick={handleStartNewSession}
                            className="px-2 py-1 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs font-medium transition-colors"
                          >
                            New Session
                          </button>
                          <button 
                            onClick={() => setManageSessionsModalOpen(true)}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1"
                            title="Manage all sessions in this profile"
                          >
                            <Layers size={13} />
                            <span>Sessions</span>
                          </button>
                          <button
                            onClick={() => handleRefreshHistory('llm')}
                            disabled={isRefreshingHistory}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Refresh history"
                          >
                            <RefreshCw size={12} className={isRefreshingHistory ? 'animate-spin text-purple-500' : ''} />
                            <span>Refresh</span>
                          </button>
                          <button onClick={() => exportData('llm')} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300">Export</button>
                          <label className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-xs font-medium transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                            Import
                            <input type="file" accept=".json" className="hidden" onChange={(e) => importData('llm', e)} />
                          </label>
                          <button onClick={() => clearData('llm')} className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors">Clear All</button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 pb-12">
                      {Object.entries(getGroupedByDay(filteredLlmRecords, 'text')).map(([group, groupItems]) => (
                        <div key={group} className="space-y-3">
                          {renderGroupHeader(group, groupItems, 'llm')}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5 gap-4">
                            {groupItems.map(c => (
                              <div 
                                key={c.id} 
                                className="border border-gray-200/90 dark:border-gray-700/80 p-3.5 rounded-xl shadow-xs bg-white dark:bg-gray-800 hover:shadow-md hover:border-purple-400/40 dark:hover:border-purple-500/40 transition-all flex flex-col justify-between group min-w-0"
                              >
                                <div 
                                  className="cursor-pointer min-w-0"
                                  onClick={() => {
                                    if (internalTabsEnabled) {
                                      const blankTab = llmTabs.find(t => t.id !== 'history' && !t.loading && !t.hasData);
                                      if (blankTab) {
                                        setLlmTabs(prev => prev.map(t => t.id === blankTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialLlm: c } : t));
                                        setActiveLlmTabId(blankTab.id);
                                      } else {
                                        const id = Date.now().toString();
                                        setLlmTabs([...llmTabs, { id, title: c.text, loading: true, hasData: false, initialLlm: c }]);
                                        setActiveLlmTabId(id);
                                      }
                                    } else {
                                      const mainTab = llmTabs.find(t => t.id !== 'history') || llmTabs[0];
                                      if (mainTab) {
                                        setLlmTabs(prev => prev.map(t => t.id === mainTab.id ? { ...t, title: c.text, loading: true, hasData: false, initialLlm: c } : t));
                                        setActiveLlmTabId(mainTab.id);
                                      }
                                    }
                                  }}
                                  onMouseEnter={(e) => handleHover(c.id, 'llm', e.currentTarget)}
                                  onMouseLeave={handleHoverLeave}
                                >
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); cycleColor(c, 'llm'); }}
                                        className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 aspect-square cursor-pointer hover:scale-125 transition-transform"
                                        style={{ backgroundColor: COLORS.find(col => col.id === c.color)?.hex || 'transparent' }}
                                        title={COLORS.find(col => col.id === c.color)?.label || 'Click to set bookmark color'}
                                      />
                                      <StarRating value={c.stars || 0} onChange={(stars) => updateItemStars(c, 'llm', stars)} size="xs" />
                                      <span 
                                        className="font-bold text-base text-gray-900 dark:text-purple-300 truncate group-hover:text-purple-400 transition-colors" 
                                        title={c.text}
                                      >
                                        {c.text}
                                      </span>
                                    </div>
                                    <span 
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap"
                                      title={`${c.search_count || 1} searches`}
                                    >
                                      {c.search_count || 1}×
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-1.5 min-w-0 flex-wrap">
                                    {c.session_id && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveToSessionModal({
                                            items: [{ id: c.id, mode: 'llm', title: c.text }],
                                            currentSession: c.session_id
                                          });
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shrink-0 cursor-pointer shadow-2xs group/sess"
                                        title={`Session: "${c.session_id}" — Click to change session`}
                                      >
                                        <Folder size={11} className="text-amber-500 dark:text-amber-400 shrink-0 group-hover/sess:scale-110 transition-transform" />
                                        <span className="truncate max-w-[120px]">{c.session_id}</span>
                                      </button>
                                    )}
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                                      Special LLM
                                    </span>
                                    {(c.source_lang || c.target_lang) && (
                                      <span className="font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                        {c.source_lang || 'Auto'} &rarr; {c.target_lang || 'En'}
                                      </span>
                                    )}
                                    {c.tag && <span className="truncate">• {c.tag}</span>}
                                  </div>
                                  {hoverReviewMode && hoveredPreviewId === c.id && (
                                    <HoverReviewPopup 
                                      content={previewContent[c.id]} 
                                      anchorRect={hoverAnchorRect}
                                      popupSize={popupSize} 
                                      setPopupSize={setPopupSize} 
                                      isResizingRef={isResizingRef}
                                      onMouseEnter={handlePopupMouseEnter}
                                      onMouseLeave={handleHoverLeave}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 min-w-0">
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 shrink-0" title={`${c.view_count || 1} views`}>
                                    <Eye size={12} className="opacity-70" />
                                    <span>{c.view_count || 1}</span>
                                  </span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveModeModal(c, 'llm'); }} 
                                      className="p-1.5 text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move LLM Record to another mode & regenerate"
                                    >
                                      <Shuffle size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMoveToSessionModal({
                                          items: [{ id: c.id, mode: 'llm', title: c.text }],
                                          currentSession: c.session_id
                                        });
                                      }} 
                                      className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move LLM Record to Session"
                                    >
                                      <FolderPlus size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openMoveItemModal(c, 'llm'); }} 
                                      className="p-1.5 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Move LLM Record to Profile"
                                    >
                                      <ArrowRightLeft size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); renameItem(c.id, c.text, 'llm'); }} 
                                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer" 
                                      title="Rename LLM Record"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteLlmRecord(c.id); }} 
                                      className="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors cursor-pointer" 
                                      title="Delete LLM Record"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <LlmTab 
                    key={`${activeProfileId}_${t.id}`}
                    llmRecords={llmRecords} 
                    onOpenHistory={() => setActiveLlmTabId('history')} 
                    profileId={activeProfileId} 
                    profileName={activeProfileName}
                    tabId={t.id} 
                    fetchLlmRecords={fetchLlmRecords} 
                    settings={settings} 
                    defaultSettings={defaultSettings} 
                    showRecentEmpty={showRecentEmpty}
                    models={models} 
                    initialLlm={t.initialLlm} 
                    onUpdateTab={(id, data) => setLlmTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))} 
                    llmSourceLang={llmSourceLang} 
                    setLlmSourceLang={(val) => syncLang(`llmSourceLang_${activeProfileId}`, val, setLlmSourceLang)} 
                    llmTargetLang={llmTargetLang} 
                    setLlmTargetLang={(val) => syncLang(`llmTargetLang_${activeProfileId}`, val, setLlmTargetLang)} 
                    llmLangs={llmLangs} 
                    setLlmLangs={setLlmLangs} 
                    onMoveItem={(item, cb) => openMoveItemModal(item, 'llm', cb)}
                    onMoveMode={(item, cb) => openMoveModeModal(item, 'llm', cb)}
                    onAssignSession={(item) => openMoveToSessionModal({ items: [{ id: item.id, mode: 'llm', title: item.text }], currentSession: item.session_id })}
                    onAddNewTab={internalTabsEnabled ? (text) => {
                      const id = Date.now().toString();
                      setLlmTabs(prev => [...prev, { id, title: text, loading: true, hasData: false, initialLlm: { text, isTemp: true } }]);
                      setActiveLlmTabId(id);
                    } : null}
                    onBackToCorrection={() => {
                      setActiveTab('correction');
                      updateUrlPath('/correction');
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === 'mt') {
      const filteredMtRecords = mtRecords.filter(item => {
        const q = mtHistorySearchTerm.toLowerCase();
        if (!q) return true;
        if (item.text && item.text.toLowerCase().includes(q)) return true;
        if (item.translated_text && item.translated_text.toLowerCase().includes(q)) return true;
        if (item.session_id && item.session_id.toLowerCase().includes(q)) return true;
        return false;
      });
      const totalMtRecords = filteredMtRecords.length;
      const totalSearches = filteredMtRecords.reduce((sum, item) => sum + (item.search_count || 0), 0);

      return (
        <div className="h-full flex flex-col">
          {internalTabsEnabled && (
            <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>
              {mtTabs.map(t => (
                <div key={t.id} className={`shrink-0 flex items-center gap-2 px-4 py-2 border-r dark:border-gray-800 cursor-pointer ${t.id === activeMtTabId ? 'bg-white dark:bg-gray-800 font-medium text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`} onClick={() => setActiveMtTabId(t.id)}>
                  {t.id === 'history' ? <History size={14} /> : <Zap size={14} />}
                  <span className="truncate max-w-[150px]">{t.title}</span>
                  {t.id !== 'history' && mtTabs.filter(x => x.id !== 'history').length > 1 && (
                    <X size={12} className="hover:text-red-500 rounded p-0.5" onClick={(e) => {
                      e.stopPropagation();
                      const newTabs = mtTabs.filter(x => x.id !== t.id);
                      setMtTabs(newTabs);
                      if (activeMtTabId === t.id) {
                        const remaining = newTabs.filter(x => x.id !== 'history');
                        setActiveMtTabId(remaining[remaining.length - 1]?.id || 'history');
                      }
                    }} />
                  )}
                </div>
              ))}
              <button
                className="px-3 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 border-r dark:border-gray-800 cursor-pointer"
                onClick={() => {
                  const id = Date.now().toString();
                  setMtTabs([...mtTabs, { id, title: 'New Translation', loading: false, hasData: false, initialMt: null }]);
                  setActiveMtTabId(id);
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          )}

          <div className="flex-1 relative overflow-hidden">
            {mtTabs.map(t => (
              <div key={t.id} className={`h-full w-full ${t.id === activeMtTabId ? 'block' : 'hidden'}`}>
                {t.id === 'history' ? (
                  <div className="h-full flex flex-col p-4 md:p-6 overflow-y-auto">
                    <div className="max-w-4xl w-full mx-auto space-y-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const nonHist = mtTabs.find(x => x.id !== 'history');
                              if (nonHist) setActiveMtTabId(nonHist.id);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-pointer border border-gray-200/60 dark:border-gray-700/60"
                          >
                            <ArrowLeft size={14} />
                            <span>Translate View</span>
                          </button>
                          <h2 className="text-xl font-bold flex items-center gap-2">
                            <Zap className="text-blue-500 fill-blue-500/20" />
                            <span>Machine Translation History</span>
                          </h2>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 font-medium">
                            {totalMtRecords} translations &bull; {totalSearches} views
                          </span>
                          <button
                            type="button"
                            onClick={() => clearData('mt')}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 transition-colors cursor-pointer border border-red-200/80 dark:border-red-800/80"
                            title="Clear all Machine Translation history for this profile"
                          >
                            <Trash2 size={13} />
                            <span>Clear All</span>
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input
                          type="text"
                          value={mtHistorySearchTerm}
                          onChange={e => setMtHistorySearchTerm(e.target.value)}
                          placeholder="Search translation history, text, or sessions..."
                          className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {filteredMtRecords.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                          <Zap size={36} className="mx-auto mb-2 opacity-40" />
                          <p>No machine translation records found.</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {Object.entries(getGroupedByDay(filteredMtRecords, 'text')).map(([day, items]) => (
                            <div key={day} className="space-y-3">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                                {day}
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {items.map(rec => (
                                  <div
                                    key={rec.id}
                                    className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-2xs space-y-2 group cursor-pointer"
                                    onClick={() => {
                                      const nonHist = mtTabs.find(x => x.id !== 'history');
                                      if (nonHist) {
                                        setMtTabs(prev => prev.map(pt => pt.id === nonHist.id ? { ...pt, title: rec.text.substring(0, 25), initialMt: rec } : pt));
                                        setActiveMtTabId(nonHist.id);
                                      } else {
                                        const id = Date.now().toString();
                                        setMtTabs(prev => [...prev, { id, title: rec.text.substring(0, 25), loading: false, hasData: true, initialMt: rec }]);
                                        setActiveMtTabId(id);
                                      }
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                                        {rec.text}
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {rec.color && (
                                          <span
                                            className="w-2.5 h-2.5 rounded-full"
                                            style={{ backgroundColor: COLORS.find(c => c.id === rec.color)?.hex || '#3b82f6' }}
                                          />
                                        )}
                                        {rec.stars > 0 && (
                                          <span className="text-xs text-amber-500 font-bold">
                                            {'★'.repeat(rec.stars)}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 font-medium bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg">
                                      {rec.translated_text}
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800/80 text-[11px] text-gray-400">
                                      <div className="flex items-center gap-2">
                                        <span>{rec.source_lang || 'Auto'} &rarr; {rec.target_lang || 'EN'}</span>
                                        {rec.model_name && <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">{rec.model_name}</span>}
                                        {rec.session_id && (
                                          <span className="text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded text-[10px]">
                                            {rec.session_id}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          onClick={() => deleteMtRecord(rec.id)}
                                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                                          title="Delete"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <MtTab
                    key={`${activeProfileId}_${t.id}`}
                    mtRecords={mtRecords}
                    tabId={t.id}
                    fetchMtRecords={fetchMtRecords}
                    settings={settings}
                    defaultSettings={defaultSettings}
                    showRecentEmpty={showRecentEmpty}
                    initialMt={t.initialMt}
                    onUpdateTab={(id, data) => setMtTabs(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt))}
                    mtSourceLang={mtSourceLang}
                    setMtSourceLang={(val) => syncLang(`mtSourceLang_${activeProfileId}`, val, setMtSourceLang)}
                    mtTargetLang={mtTargetLang}
                    setMtTargetLang={(val) => syncLang(`mtTargetLang_${activeProfileId}`, val, setMtTargetLang)}
                    profileId={activeProfileId}
                    profileName={activeProfileName}
                    onOpenHistory={() => setActiveMtTabId('history')}
                    onMoveItem={(item, cb) => openMoveItemModal(item, 'mt', cb)}
                    onMoveMode={(item, cb) => openMoveModeModal(item, 'mt', cb)}
                    onAssignSession={(item) => openMoveToSessionModal({ items: [{ id: item.id, mode: 'mt', title: item.text }], currentSession: item.session_id })}
                    onAddNewTab={internalTabsEnabled ? (text) => {
                      const id = Date.now().toString();
                      setMtTabs(prev => [...prev, { id, title: text, loading: true, hasData: false, initialMt: { text, isTemp: true } }]);
                      setActiveMtTabId(id);
                    } : null}
                    onBackToCorrection={() => {
                      setActiveTab('correction');
                      updateUrlPath('/correction');
                    }}
                    onSendToCorrection={(text) => {
                      handleCorrectionClick();
                      setCorrectionTabs(prev => {
                        const first = prev.find(p => p.id !== 'history');
                        if (first) {
                          return prev.map(p => p.id === first.id ? { ...p, title: text.substring(0, 25), initialCorrection: { text, isTemp: true } } : p);
                        }
                        return prev;
                      });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || null;
  const activeProfileRank = Math.max(1, profiles.findIndex(p => p.id === activeProfileId) + 1);

  return (
    <div className={`flex h-screen font-sans text-gray-900 dark:text-gray-100 ${theme !== 'light' ? 'bg-gray-950' : 'bg-gray-100'}`}>
      {models && models.length > 0 && (
        <datalist id="all-models-list">
          {models.map(m => <option key={m.id} value={m.id} />)}
        </datalist>
      )}
      {/* Sidebar */}
      <div className={`bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col z-10 shadow-sm transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-16 md:w-64'}`}>
        <div className={`h-16 flex items-center justify-between border-b dark:border-gray-800 ${sidebarCollapsed ? 'px-2 justify-center' : 'md:px-6 px-2'}`}>
          <button 
            onClick={handleHomeClick}
            className={`font-bold text-xl text-blue-600 dark:text-blue-500 tracking-tight flex items-center justify-center md:justify-start gap-2 hover:opacity-80 transition-opacity ${sidebarCollapsed ? 'hidden' : 'flex-1 hidden md:flex'}`}
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
          <NavItem collapsed={sidebarCollapsed} icon={<Globe />} label="Translation" active={activeTab === 'translation'} onClick={handleTranslationClick} />
          <NavItem collapsed={sidebarCollapsed} icon={<CheckCheck />} label="Correction" active={activeTab === 'correction'} onClick={handleCorrectionClick} />
          <NavItem collapsed={sidebarCollapsed} icon={<Zap className="text-amber-500 fill-amber-500/20" />} label="Quick LLM" active={activeTab === 'quick_llm'} onClick={handleQuickLlmClick} />
          <NavItem collapsed={sidebarCollapsed} icon={<Zap />} label="Machine Translate" active={activeTab === 'mt'} onClick={handleMtClick} />
        </nav>

        <div className="p-2 md:p-4 border-t dark:border-gray-800 space-y-2">
          <NavItem 
            collapsed={sidebarCollapsed} 
            icon={<Sparkles className="text-amber-500" />} 
            label="Flashcards" 
            active={activeTab === 'flashcard'} 
            onClick={() => { setActiveTab('flashcard'); updateUrlPath('/flashcard'); }} 
          />

          {/* Profile Section (Adaptive Expanded & Collapsed) */}
          <div className="relative my-1" ref={profileDropdownRef}>
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className={`w-full flex items-center justify-center p-2 rounded-xl transition-all cursor-pointer relative group ${
                  profileDropdownOpen 
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/70 dark:border-indigo-800/60 shadow-xs' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300'
                }`}
                title={`Profile: ${activeProfile?.name || 'Default'}`}
              >
                <ProfileAvatar name={activeProfile?.name} className="w-8 h-8 rounded-lg" />
                {activeProfile?.is_default && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white dark:border-gray-900 shadow-2xs" title="Default profile" />
                )}
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Profile
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      setManageProfilesModalOpen(true);
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-1.5 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                    title="Open Profile Manager & Reranker"
                  >
                    <ArrowUpDown size={12} />
                    <span>Rerank</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all cursor-pointer group shadow-2xs ${
                    profileDropdownOpen
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                      : 'bg-gray-50 dark:bg-gray-800/80 border-gray-200/80 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-100/70 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ProfileAvatar name={activeProfile?.name} className="w-8 h-8 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-gray-900 dark:text-gray-100 truncate">
                          {activeProfile?.name || 'Default Profile'}
                        </span>
                        {activeProfile?.is_default && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/60 rounded shrink-0">
                            Def
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                        #{activeProfileRank} of {profiles.length} profiles
                      </div>
                    </div>
                  </div>
                  <ChevronsUpDown size={15} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0 ml-1" />
                </button>
              </div>
            )}

            {/* Profile Popover Quick Switcher */}
            {profileDropdownOpen && (
              <div 
                className={`absolute z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-700/90 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 ${
                  sidebarCollapsed 
                    ? 'left-full ml-3 bottom-0 w-80' 
                    : 'bottom-full mb-2 left-0 right-0 w-full sm:w-80'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-1.5 pb-2 border-b dark:border-gray-700/70">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-200">
                    <User size={14} className="text-indigo-500" />
                    <span>Profiles</span>
                    <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                      ({profiles.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProfileDropdownOpen(false);
                      setManageProfilesModalOpen(true);
                    }}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer transition-colors"
                    title="Open Profile Manager & Reranker"
                  >
                    <ArrowUpDown size={12} />
                    <span>Rerank</span>
                  </button>
                </div>

                {/* Profiles list */}
                <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
                  {profiles.map((p, idx) => {
                    const isActive = p.id === activeProfileId;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProfile(p.id)}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer group transition-all ${
                          isActive
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 font-semibold border border-indigo-200/80 dark:border-indigo-800/80 shadow-2xs'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            isActive 
                              ? 'bg-indigo-200/80 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200' 
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }`}>
                            #{idx + 1}
                          </span>
                          <ProfileAvatar name={p.name} className="w-5 h-5 rounded-md text-[10px]" />
                          <span className="truncate">{p.name}</span>
                          {p.is_default && (
                            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 px-1 py-0.2 rounded shrink-0">
                              Default
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-1.5">
                          {isActive && <Check size={14} className="text-indigo-600 dark:text-indigo-400" />}
                          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveProfileRank(p.id, 'up');
                              }}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-20 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 transition-colors"
                              title="Move up in rank"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              type="button"
                              disabled={idx === profiles.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveProfileRank(p.id, 'down');
                              }}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-20 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 transition-colors"
                              title="Move down in rank"
                            >
                              <ChevronDown size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="pt-2 border-t dark:border-gray-700/70">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProfileDropdownOpen(false);
                      setManageProfilesModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                  >
                    <ArrowUpDown size={13} />
                    <span>Manage & Rerank Profiles</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <NavItem collapsed={sidebarCollapsed} icon={<SettingsIcon />} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); updateUrlPath('/settings'); }} />
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-950">
        {renderContent()}
      </div>

      {/* Modals */}
      {typeof document !== 'undefined' && moveSessionModal && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 border dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between border-b dark:border-gray-700 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-indigo-600 dark:text-indigo-400" />
                Move Session to Profile
              </h3>
              <button 
                onClick={() => setMoveSessionModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-lg border dark:border-gray-700 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Session:</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{moveSessionModal.sessionName}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Contents:</span>
                <span className="text-gray-700 dark:text-gray-300 font-medium">
                  {moveSessionModal.stats.words} words, {moveSessionModal.stats.comparisons} compares, {moveSessionModal.stats.explains} explains, {moveSessionModal.stats.translations} trans
                </span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 pt-1 border-t dark:border-gray-700">
                <span>Total items to move:</span>
                <span>{moveSessionModal.stats.total} items</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Select Destination Profile:
              </label>
              <select
                value={moveSessionModal.targetProfileId}
                onChange={(e) => setMoveSessionModal({ ...moveSessionModal, targetProfileId: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
              >
                {profiles.filter(p => p.id !== activeProfileId).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.is_default ? '(Default)' : ''}
                  </option>
                ))}
                <option value="new">+ Create New Profile...</option>
              </select>
            </div>

            {moveSessionModal.targetProfileId === 'new' && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
                  New Profile Name:
                </label>
                <input
                  type="text"
                  value={moveSessionModal.newProfileName}
                  onChange={(e) => setMoveSessionModal({ ...moveSessionModal, newProfileName: e.target.value })}
                  placeholder="e.g. Spanish B2, Medical, Work..."
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg p-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400">
              All entries, explanations, tags, bookmark colors, and AI chat history in this session will be safely transferred to the selected profile.
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t dark:border-gray-700">
              <button
                type="button"
                onClick={() => setMoveSessionModal(null)}
                disabled={moveSessionModal.loading}
                className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMoveSession}
                disabled={moveSessionModal.loading || (moveSessionModal.targetProfileId === 'new' && !moveSessionModal.newProfileName.trim())}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {moveSessionModal.loading && <Loader2 size={16} className="animate-spin" />}
                <span>Move Entire Session</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && moveItemModal && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between border-b dark:border-gray-700 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-indigo-600 dark:text-indigo-400" />
                Move {moveItemModal.type === 'word' ? 'Word' : moveItemModal.type === 'comparison' ? 'Comparison' : moveItemModal.type === 'explain' ? 'Explanation' : 'Translation'} to Profile
              </h3>
              <button 
                onClick={() => setMoveItemModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/60 p-3.5 rounded-xl border border-gray-200/80 dark:border-gray-700 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider">
                  {moveItemModal.type === 'word' ? 'Word' : 'Item'}:
                </span>
                <span className="font-bold text-base text-gray-900 dark:text-gray-100 truncate max-w-[240px]">
                  {moveItemModal.title}
                </span>
              </div>
              {moveItemModal.item.language && (
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Language:</span>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{moveItemModal.item.language}</span>
                </div>
              )}
              {moveItemModal.item.search_count !== undefined && (
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Usage:</span>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{moveItemModal.item.search_count} searches</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Select Destination Profile:
              </label>
              <select
                value={moveItemModal.targetProfileId}
                onChange={(e) => setMoveItemModal({ ...moveItemModal, targetProfileId: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl p-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
              >
                {profiles.filter(p => p.id !== activeProfileId).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.is_default ? '(Default)' : ''}
                  </option>
                ))}
                <option value="new">+ Create New Profile...</option>
              </select>
            </div>

            {moveItemModal.targetProfileId === 'new' && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
                  New Profile Name:
                </label>
                <input
                  type="text"
                  value={moveItemModal.newProfileName}
                  onChange={(e) => setMoveItemModal({ ...moveItemModal, newProfileName: e.target.value })}
                  placeholder="e.g. Spanish, German B2, Work..."
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              This item, its explanation, bookmarks, tags, and follow-up AI chats will be transferred to the destination profile. If it already exists there, its history will be safely merged.
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t dark:border-gray-700">
              <button
                type="button"
                onClick={() => setMoveItemModal(null)}
                disabled={moveItemModal.loading}
                className="px-4 py-2 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMoveItem}
                disabled={moveItemModal.loading || (moveItemModal.targetProfileId === 'new' && !moveItemModal.newProfileName.trim())}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {moveItemModal.loading && <Loader2 size={16} className="animate-spin" />}
                <span>Move {moveItemModal.type === 'word' ? 'Word' : 'Item'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && moveToSessionModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between border-b dark:border-gray-700 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <FolderPlus size={19} className="text-amber-500 dark:text-amber-400" />
                <span>
                  {moveToSessionModal.items.length === 1
                    ? `Move "${moveToSessionModal.items[0]?.title || (moveToSessionModal.items[0]?.mode === 'word' ? 'Word' : 'Item')}" to Session`
                    : `Move ${moveToSessionModal.items.length} ${moveToSessionModal.items.every(i => !i.mode || i.mode === 'word' || i.mode === 'search') ? 'words' : 'items'} to Session`}
                </span>
              </h3>
              <button
                onClick={() => setMoveToSessionModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {moveToSessionModal.items.length === 1 && (
              <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200/80 dark:border-gray-700 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                    Current Session:
                  </span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {moveToSessionModal.currentSession || '(None / Unassigned)'}
                  </span>
                </div>
              </div>
            )}

            {moveToSessionModal.items.length > 1 && (
              <div className="bg-amber-50/60 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/80 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
                Selected {moveToSessionModal.items.every(i => !i.mode || i.mode === 'word' || i.mode === 'search') ? 'words' : 'items'} ({moveToSessionModal.items.length}):{' '}
                <span className="font-semibold">
                  {moveToSessionModal.items.slice(0, 5).map(i => i.title).join(', ')}
                  {moveToSessionModal.items.length > 5 ? `, +${moveToSessionModal.items.length - 5} more` : ''}
                </span>
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Target Session:
              </label>

              {/* Option 1: Choose existing session */}
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="sessionTargetType"
                  value="existing"
                  checked={moveToSessionModal.targetType === 'existing'}
                  onChange={() => setMoveToSessionModal({ ...moveToSessionModal, targetType: 'existing' })}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block">
                    Choose an existing session
                  </span>
                  {moveToSessionModal.targetType === 'existing' && (
                    <select
                      value={moveToSessionModal.selectedExistingSession}
                      onChange={(e) => setMoveToSessionModal({ ...moveToSessionModal, selectedExistingSession: e.target.value })}
                      className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                      disabled={getAllSessions().length === 0}
                    >
                      {getAllSessions().length === 0 ? (
                        <option value="">(No existing sessions)</option>
                      ) : (
                        getAllSessions().map(s => (
                          <option key={s.name} value={s.name}>
                            {s.name} ({s.total} {s.total === 1 ? 'item' : 'items'})
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>
              </label>

              {/* Option 2: Create a new session */}
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="sessionTargetType"
                  value="new"
                  checked={moveToSessionModal.targetType === 'new'}
                  onChange={() => setMoveToSessionModal({ ...moveToSessionModal, targetType: 'new' })}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block">
                    Create a new session
                  </span>
                  {moveToSessionModal.targetType === 'new' && (
                    <input
                      type="text"
                      value={moveToSessionModal.newSessionName}
                      onChange={(e) => setMoveToSessionModal({ ...moveToSessionModal, newSessionName: e.target.value })}
                      placeholder="Enter new session name..."
                      className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleExecuteMoveToSession();
                      }}
                    />
                  )}
                </div>
              </label>

              {/* Option 3: Remove / Unassign from session */}
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="sessionTargetType"
                  value="none"
                  checked={moveToSessionModal.targetType === 'none'}
                  onChange={() => setMoveToSessionModal({ ...moveToSessionModal, targetType: 'none' })}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block">
                    Remove from session (Unassign)
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Item(s) will be kept in profile without belonging to any session.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t dark:border-gray-700">
              <button
                type="button"
                onClick={() => setMoveToSessionModal(null)}
                disabled={moveToSessionModal.loading}
                className="px-4 py-2 text-xs font-medium rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMoveToSession}
                disabled={
                  moveToSessionModal.loading ||
                  (moveToSessionModal.targetType === 'existing' && !moveToSessionModal.selectedExistingSession) ||
                  (moveToSessionModal.targetType === 'new' && !moveToSessionModal.newSessionName.trim())
                }
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {moveToSessionModal.loading && <Loader2 size={14} className="animate-spin" />}
                <span>
                  {moveToSessionModal.targetType === 'none'
                    ? 'Unassign from Session'
                    : 'Move to Session'}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && moveModeModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between border-b dark:border-gray-700 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Shuffle size={19} className="text-purple-600 dark:text-purple-400" />
                  Move Mode & Regenerate
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Switch entry type and regenerate suitable explanation
                </p>
              </div>
              <button 
                onClick={() => setMoveModeModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/60 p-3.5 rounded-xl border border-gray-200/80 dark:border-gray-700 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider">
                  Text / Term:
                </span>
                <span className="font-bold text-base text-gray-900 dark:text-gray-100 truncate max-w-[240px]">
                  {moveModeModal.term}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Current Mode:</span>
                <span className="text-purple-600 dark:text-purple-400 font-semibold uppercase">
                  {moveModeModal.fromMode}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Choose Target Mode:
              </label>
              <select
                value={moveModeModal.toMode}
                onChange={(e) => setMoveModeModal({ ...moveModeModal, toMode: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl p-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer font-medium"
              >
                {moveModeModal.fromMode !== 'word' && (
                  <option value="word">🔍 Word Mode (Definition, Lemma, Pronunciation)</option>
                )}
                {moveModeModal.fromMode !== 'explain' && (
                  <option value="explain">📖 Explain Mode (Comprehensive Grammar & Syntax Breakdown)</option>
                )}
                {moveModeModal.fromMode !== 'translation' && (
                  <option value="translation">🌐 Translation Mode (Multi-language Translation & Analysis)</option>
                )}
                {moveModeModal.fromMode !== 'correction' && (
                  <option value="correction">✅ Correction Mode (Grammar Correction & Translation)</option>
                )}
                {moveModeModal.fromMode !== 'compare' && (
                  <option value="compare">⚔️ Compare Mode (Side-by-side Term Comparison)</option>
                )}
                {moveModeModal.fromMode !== 'llm' && (
                  <option value="llm">✨ Special LLM Mode (Advanced LLM Analysis & Translation)</option>
                )}
              </select>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              This will move "{moveModeModal.term}" from <strong>{moveModeModal.fromMode}</strong> and regenerate in <strong>{moveModeModal.toMode}</strong> mode in the background. You can continue working immediately without waiting!
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t dark:border-gray-700">
              <button
                type="button"
                onClick={() => setMoveModeModal(null)}
                className="px-4 py-2 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMoveMode}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Shuffle size={15} />
                <span>Move & Regenerate ✦</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && manageSessionsModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-xl w-full p-6 border dark:border-gray-700 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b dark:border-gray-700 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Layers size={18} className="text-blue-600 dark:text-blue-400" />
                  Manage Sessions
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Profile: <span className="font-semibold text-gray-700 dark:text-gray-300">{profiles.find(p => p.id === activeProfileId)?.name || 'Current'}</span>
                </p>
              </div>
              <button 
                onClick={() => setManageSessionsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {getAllSessions().length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                  <Layers size={32} className="mx-auto mb-2 opacity-40" />
                  No sessions recorded in this profile yet.
                </div>
              ) : (
                getAllSessions().map(s => (
                  <div key={s.name} className="flex flex-wrap items-center justify-between p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{s.name}</h4>
                        {activeSessionId === s.name && (
                          <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-2 items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setManageSessionsModalOpen(false);
                            setActiveTab('search');
                            updateUrlPath('/search');
                            setActiveSearchTabId('history');
                          }}
                          className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                          title="View words in Search History"
                        >
                          {s.words} words
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setManageSessionsModalOpen(false);
                            setActiveTab('compare');
                            updateUrlPath('/compare');
                            setActiveCompareTabId('history');
                          }}
                          className="hover:text-purple-600 dark:hover:text-purple-400 hover:underline cursor-pointer transition-colors"
                          title="View comparisons in Compare History"
                        >
                          {s.comparisons} comparisons
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setManageSessionsModalOpen(false);
                            setActiveTab('explain');
                            updateUrlPath('/explain');
                            setActiveExplainTabId('history');
                          }}
                          className="hover:text-teal-600 dark:hover:text-teal-400 hover:underline cursor-pointer transition-colors"
                          title="View explanations in Explain History"
                        >
                          {s.explains} explains
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setManageSessionsModalOpen(false);
                            setActiveTab('translation');
                            updateUrlPath('/translation');
                            setActiveTranslationTabId('history');
                          }}
                          className="hover:text-amber-600 dark:hover:text-amber-400 hover:underline cursor-pointer transition-colors"
                          title="View translations in Translation History"
                        >
                          {s.translations} translations
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setManageSessionsModalOpen(false);
                            setActiveTab('correction');
                            updateUrlPath('/correction');
                            setActiveCorrectionTabId('history');
                          }}
                          className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline cursor-pointer transition-colors"
                          title="View corrections in Correction History"
                        >
                          {s.corrections} corrections
                        </button>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">({s.total} total)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Jump straight to Flashcard */}
                      <button
                        type="button"
                        onClick={() => handleJumpToFlashcardFromSession(s.name)}
                        disabled={s.total === 0}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        title={
                          s.total === 0
                            ? `Session "${s.name}" has no items`
                            : activeTab === 'search'
                            ? `Jump straight to Flashcards for "${s.name}" (${s.words > 0 ? 'Words only' : 'All items'})`
                            : activeTab === 'compare'
                            ? `Jump straight to Flashcards for "${s.name}" (${s.comparisons > 0 ? 'Comparisons only' : 'All items'})`
                            : activeTab === 'explain'
                            ? `Jump straight to Flashcards for "${s.name}" (${s.explains > 0 ? 'Explains only' : 'All items'})`
                            : activeTab === 'translation'
                            ? `Jump straight to Flashcards for "${s.name}" (${s.translations > 0 ? 'Translations only' : 'All items'})`
                            : activeTab === 'correction'
                            ? `Jump straight to Flashcards for "${s.name}" (${s.corrections > 0 ? 'Corrections only' : 'All items'})`
                            : `Jump straight to Flashcards for "${s.name}"`
                        }
                      >
                        <Play size={11} className="fill-current" />
                        <span>
                          Flashcard{activeTab === 'search' && s.words > 0 ? ' (Word)' : activeTab === 'compare' && s.comparisons > 0 ? ' (Compare)' : activeTab === 'explain' && s.explains > 0 ? ' (Explain)' : activeTab === 'translation' && s.translations > 0 ? ' (Translate)' : activeTab === 'correction' && s.corrections > 0 ? ' (Correction)' : ''}
                        </span>
                      </button>

                      {/* Quick "All" button if session has items from other modes too */}
                      {activeTab === 'search' && s.words > 0 && s.total > s.words && (
                        <button
                          type="button"
                          onClick={() => handleJumpToFlashcardFromSession(s.name, '__all__')}
                          className="px-1.5 py-1 text-[11px] font-semibold rounded-md bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 text-amber-800 dark:text-amber-200 border border-amber-300/70 dark:border-amber-700/60 cursor-pointer transition-colors"
                          title={`Study all ${s.total} items across all modes in Flashcards`}
                        >
                          All ({s.total})
                        </button>
                      )}
                      {activeSessionId !== s.name ? (
                        <button
                          onClick={() => handleActivateSession(s.name)}
                          className="px-2 py-1 text-xs font-medium rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 transition-colors cursor-pointer"
                          title="Activate this session for new searches"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          onClick={handleEndSession}
                          className="px-2 py-1 text-xs font-medium rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                          title="Stop recording to this session"
                        >
                          End
                        </button>
                      )}
                      <button
                        onClick={() => { setManageSessionsModalOpen(false); openMoveSessionModal(s.name); }}
                        className="px-2 py-1 text-xs font-medium rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Move entire session to another profile"
                      >
                        <ArrowRightLeft size={12} />
                        <span>Move</span>
                      </button>
                      <button
                        onClick={() => handleRenameSession(s.name)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded cursor-pointer"
                        title="Rename session"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteSession(s.name)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded cursor-pointer"
                        title="Delete session"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t dark:border-gray-700">
              <button
                onClick={handleStartNewSession}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>New Session</span>
              </button>
              <button
                onClick={() => setManageSessionsModalOpen(false)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Session Modal with Keep Items Choice */}
      {deleteSessionModal && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0">
                <Trash2 size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">
                  Delete Session
                </h3>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 truncate" title={deleteSessionModal.sessionName}>
                  "{deleteSessionModal.sessionName}"
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  This session contains {deleteSessionModal.stats?.total || 0} item(s). Choose how you would like to delete it:
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              {/* Option 1: Keep items (dissociate session only) */}
              <button
                type="button"
                disabled={deleteSessionModal.loading}
                onClick={() => confirmDeleteSession(deleteSessionModal.sessionName, true)}
                className="w-full p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100/70 dark:hover:bg-blue-900/60 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-blue-700 dark:text-blue-300">
                    Delete Session Only (Keep Items)
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/80 text-blue-700 dark:text-blue-300">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Removes the session grouping. All {deleteSessionModal.stats?.total || 0} items will remain safe in your profile history.
                </p>
              </button>

              {/* Option 2: Delete items */}
              <button
                type="button"
                disabled={deleteSessionModal.loading}
                onClick={() => confirmDeleteSession(deleteSessionModal.sessionName, false)}
                className="w-full p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 hover:bg-red-100/60 dark:hover:bg-red-900/50 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-red-700 dark:text-red-400">
                    Delete Session & All Items
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Permanently deletes this session and all its {deleteSessionModal.stats?.total || 0} items and chats.
                </p>
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                disabled={deleteSessionModal.loading}
                onClick={() => setDeleteSessionModal(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Manage & Rerank Profiles Modal */}
      {typeof document !== 'undefined' && manageProfilesModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b dark:border-gray-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800 shrink-0">
                  <ArrowUpDown size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                    Manage & Rerank Profiles
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Reorder profiles to set their priority, switch profiles, rename, or designate a default.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setManageProfilesModalOpen(false);
                  setEditingProfileId(null);
                  setConfirmDeleteProfileId(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Create New Profile Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateProfile(newProfileInputName);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80"
            >
              <div className="relative flex-1">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={newProfileInputName}
                  onChange={(e) => setNewProfileInputName(e.target.value)}
                  placeholder="Create new profile name..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={!newProfileInputName.trim() || isCreatingProfile}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0 shadow-2xs"
              >
                <Plus size={14} />
                <span>{isCreatingProfile ? 'Creating...' : 'Add Profile'}</span>
              </button>
            </form>

            {/* Profiles List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {profiles.map((p, idx) => {
                const isActive = p.id === activeProfileId;
                const isEditing = editingProfileId === p.id;
                const isConfirmingDelete = confirmDeleteProfileId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border transition-all p-3 space-y-2.5 ${
                      isActive
                        ? 'border-indigo-300 dark:border-indigo-700/80 bg-indigo-50/20 dark:bg-indigo-950/20 shadow-xs'
                        : 'border-gray-200 dark:border-gray-700/70 bg-gray-50/60 dark:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: Rank & Name */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Rank Badge & Arrows */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md border shadow-2xs ${
                            isActive
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                          }`}>
                            #{idx + 1}
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveProfileRank(p.id, 'up')}
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 transition-colors"
                              title="Move Up"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              type="button"
                              disabled={idx === profiles.length - 1}
                              onClick={() => handleMoveProfileRank(p.id, 'down')}
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 transition-colors"
                              title="Move Down"
                            >
                              <ChevronDown size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Initial Circle */}
                        <ProfileAvatar name={p.name} className="w-8 h-8 rounded-lg" />

                        {/* Name or Inline Rename Form */}
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <input
                              type="text"
                              autoFocus
                              value={editingProfileName}
                              onChange={(e) => setEditingProfileName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameProfile(p.id, editingProfileName);
                                if (e.key === 'Escape') { setEditingProfileId(null); setEditingProfileName(''); }
                              }}
                              className="w-full px-2.5 py-1 text-xs font-semibold rounded-lg border border-indigo-400 dark:border-indigo-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleRenameProfile(p.id, editingProfileName)}
                              className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg cursor-pointer transition-colors"
                              title="Save Name"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingProfileId(null); setEditingProfileName(''); }}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg cursor-pointer transition-colors"
                              title="Cancel"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">
                              {p.name}
                            </span>
                            {p.is_default && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 px-1.5 py-0.5 rounded-full">
                                <Star size={10} className="fill-amber-500 text-amber-500" />
                                Default
                              </span>
                            )}
                            {isActive && (
                              <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700/60 px-1.5 py-0.5 rounded-full">
                                Active Profile
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Switch button if not active */}
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleSelectProfile(p.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer mr-1"
                          >
                            Switch
                          </button>
                        )}

                        {/* Set Default */}
                        {!p.is_default ? (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultProfile(p.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                            title="Set as Default Profile"
                          >
                            <Star size={15} />
                          </button>
                        ) : (
                          <span className="p-1.5 text-amber-500" title="Current Default Profile">
                            <Star size={15} className="fill-amber-500 text-amber-500" />
                          </span>
                        )}

                        {/* Rename */}
                        <button
                          type="button"
                          onClick={() => { setEditingProfileId(p.id); setEditingProfileName(p.name); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                          title="Rename Profile"
                        >
                          <Edit size={15} />
                        </button>

                        {/* Delete */}
                        {p.is_default ? (
                          <button
                            type="button"
                            disabled
                            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50"
                            title="Default profile cannot be deleted"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProfileId(isConfirmingDelete ? null : p.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete Profile"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Delete Confirmation */}
                    {isConfirmingDelete && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs space-y-2 animate-in fade-in duration-150">
                        <p className="text-rose-800 dark:text-rose-200 font-medium leading-relaxed">
                          ⚠️ Are you sure you want to delete profile <span className="font-bold">"{p.name}"</span>? All words, comparisons, explanations, translations, and profile settings will be permanently removed.
                        </p>
                        <div className="flex items-center gap-2 justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProfileId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(p.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer shadow-2xs"
                          >
                            Yes, Delete Profile
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t dark:border-gray-800 text-xs">
              <span className="text-gray-400 dark:text-gray-500">
                💡 Profile ranks determine display priority in selectors and menus.
              </span>
              <button
                type="button"
                onClick={() => {
                  setManageProfilesModalOpen(false);
                  setEditingProfileId(null);
                  setConfirmDeleteProfileId(null);
                }}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 hover:opacity-90 cursor-pointer shadow-2xs transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Toast Notifications */}
      {typeof document !== 'undefined' && toasts.length > 0 && createPortal(
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-xl p-3.5 shadow-xl border backdrop-blur-md transition-all duration-300 flex items-start gap-3 text-sm ${
                toast.type === 'error'
                  ? 'bg-rose-50/95 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-100 shadow-rose-500/10'
                  : toast.type === 'success'
                  ? 'bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-100 shadow-emerald-500/10'
                  : toast.type === 'loading'
                  ? 'bg-white/95 dark:bg-gray-900/95 border-purple-300 dark:border-purple-800/60 text-gray-900 dark:text-gray-100 shadow-purple-500/10'
                  : 'bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 shadow-gray-500/10'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {toast.type === 'loading' && <Loader2 size={18} className="animate-spin text-purple-600 dark:text-purple-400" />}
                {toast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />}
                {toast.type === 'error' && <AlertCircle size={18} className="text-rose-600 dark:text-rose-400" />}
                {toast.type === 'info' && <Sparkles size={18} className="text-blue-600 dark:text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <div className="font-semibold text-xs leading-tight mb-0.5">{toast.title}</div>
                )}
                <div className="text-xs text-gray-600 dark:text-gray-300 break-words leading-relaxed">
                  {toast.message}
                </div>
                {toast.actionLabel && toast.onAction && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        toast.onAction();
                        removeToast(toast.id);
                      }}
                      className="text-xs font-semibold px-2.5 py-1 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      <span>{toast.actionLabel}</span>
                      <ArrowLeft size={12} className="rotate-180" />
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded cursor-pointer"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer ${
        collapsed ? 'justify-center' : 'justify-center md:justify-start'
      } ${
        active 
          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200/70 dark:border-blue-800/60 shadow-xs' 
          : 'hover:bg-gray-100 dark:hover:bg-gray-800/80 text-gray-600 dark:text-gray-400 font-medium'
      }`}
      title={collapsed ? label : undefined}
    >
      <div className="shrink-0">{icon}</div>
      <span className={collapsed ? 'hidden' : 'hidden md:inline overflow-hidden text-ellipsis whitespace-nowrap text-sm'}>{label}</span>
    </button>
  );
}

export default App;
