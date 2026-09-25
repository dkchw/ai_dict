import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import StarRating from './StarRating';
import {
  Layers, Search, GitCompare, MessageSquare, Globe, Star, Sparkles,
  ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, Shuffle, Check,
  Edit, Edit3, X, Volume2, Send, Loader2, Play, BookOpen, Eye,
  ExternalLink, Filter, HelpCircle, RefreshCw, Columns, Plus, Minus, Trash2,
  Maximize2, Minimize2, Zap, ZapOff, CheckCheck
} from 'lucide-react';

const MODE_CONFIG = {
  search: {
    label: 'Search (Word)',
    shortLabel: 'Word',
    icon: Search,
    colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800/80',
    badgeClass: 'bg-blue-500 text-white'
  },
  compare: {
    label: 'Compare',
    shortLabel: 'Compare',
    icon: GitCompare,
    colorClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/80',
    badgeClass: 'bg-purple-500 text-white'
  },
  explain: {
    label: 'Explain',
    shortLabel: 'Explain',
    icon: MessageSquare,
    colorClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80',
    badgeClass: 'bg-indigo-500 text-white'
  },
  translation: {
    label: 'Translation',
    shortLabel: 'Translate',
    icon: Globe,
    colorClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
    badgeClass: 'bg-emerald-500 text-white'
  },
  correction: {
    label: 'Correction',
    shortLabel: 'Correct',
    icon: CheckCheck,
    colorClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800/80',
    badgeClass: 'bg-teal-500 text-white'
  }
};

export default function FlashcardTab({
  activeProfileId = 1,
  profiles = [],
  colors = [],
  initialSession = null,
  initialModes = null,
  initialViewMode = 'practice',
  onClearInitialSession = null,
  onNavigateToMode = null,
  onSessionDeleted = null
}) {
  // Session list state
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');

  // Selected session & view
  const [selectedSession, setSelectedSession] = useState(() => {
    if (!initialSession) return null;
    return typeof initialSession === 'string'
      ? { session_id: initialSession, total_count: 0 }
      : initialSession;
  });
  const [viewMode, setViewMode] = useState(initialViewMode || 'browse'); // 'browse' | 'practice'

  // Mode filters: user can choose any combination of modes
  const [selectedModes, setSelectedModes] = useState(() => {
    if (initialModes && Array.isArray(initialModes) && initialModes.length > 0) {
      return initialModes;
    }
    return ['search', 'compare', 'explain', 'translation', 'correction'];
  });

  useEffect(() => {
    if (initialSession) {
      const sessObj = typeof initialSession === 'string'
        ? { session_id: initialSession, total_count: 0 }
        : initialSession;
      setSelectedSession(sessObj);
      if (initialModes && Array.isArray(initialModes) && initialModes.length > 0) {
        setSelectedModes(initialModes);
      }
      if (initialViewMode) {
        setViewMode(initialViewMode);
      }
      if (onClearInitialSession) {
        onClearInitialSession();
      }
    }
  }, [initialSession, initialModes, initialViewMode]);

  // Cards data
  const [cards, setCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);

  // Filters within session
  const [cardSearch, setCardSearch] = useState('');
  const [starFilter, setStarFilter] = useState(null); // null = all, 0..5
  const [colorFilter, setColorFilter] = useState(null); // null = all, string = color id

  // Practice state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [practiceOrder, setPracticeOrder] = useState([]); // indices

  // 2-Column Scroll & Layout State (Default to 2 columns for book reading experience)
  const [layoutColumns, setLayoutColumns] = useState(2);
  const twoColScrollRef = useRef(null);
  const oneColScrollRef = useRef(null);
  const [spreadInfo, setSpreadInfo] = useState({
    currentSpread: 1,
    totalSpreads: 1,
    leftPage: 1,
    rightPage: 2
  });

  // Fullscreen State & Ref
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cardContainerRef = useRef(null);

  // Animation Toggle State (Persisted in localStorage, default on)
  const [animationsEnabled, setAnimationsEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_dict_flashcard_animations');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const toggleAnimations = () => {
    setAnimationsEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ai_dict_flashcard_animations', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Wheel lock & Snap debounce refs for 2-column scroll
  const wheelLockRef = useRef(false);
  const snapTimeoutRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef(null);

  const markProgrammaticScroll = () => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, animationsEnabled ? 550 : 50);
  };

  // Card click vs. text selection tracking
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  const handleCardMouseDown = (e) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCardCanvasClick = (e, flipTargetState = null) => {
    // Don't flip if an interactive modal or editor is open
    if (editingContentCard || editingTitleCard || chatCard || deleteModalSession) return;

    // 1. If any text is actively selected in the window, DO NOT flip the card!
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }

    // 2. If the mouse dragged noticeably (user was selecting text with drag), DO NOT flip!
    const dx = e.clientX - mouseDownPosRef.current.x;
    const dy = e.clientY - mouseDownPosRef.current.y;
    if (Math.hypot(dx, dy) > 5) {
      return;
    }

    // 3. Ignore clicks on interactive elements (buttons, inputs, links, etc.)
    if (e.target.closest('button, a, input, textarea, select, [role="button"], .no-card-flip')) {
      return;
    }

    // 4. Ignore clicks on designated selectable text elements (allowing double/triple click selection)
    if (e.target.closest('.card-selectable-text')) {
      return;
    }

    if (flipTargetState !== null) {
      setIsFlipped(flipTargetState);
    } else {
      setIsFlipped(prev => !prev);
    }
  };

  // Font Size Scaling (+ and -)
  const FONT_SIZES = [
    { label: '80%', cssSize: '12px' },
    { label: '90%', cssSize: '13.5px' },
    { label: '100%', cssSize: '15px' },
    { label: '115%', cssSize: '17px' },
    { label: '130%', cssSize: '19.5px' },
    { label: '150%', cssSize: '22.5px' }
  ];
  const [fontScaleIndex, setFontScaleIndex] = useState(2); // default 100%

  // Delete Session Modal State
  const [deleteModalSession, setDeleteModalSession] = useState(null);
  const [deletingSession, setDeletingSession] = useState(false);

  // Edit Title State
  const [editingTitleCard, setEditingTitleCard] = useState(null);
  const [newTitleText, setNewTitleText] = useState('');

  // Edit Content State
  const [editingContentCard, setEditingContentCard] = useState(null);
  const [newContentText, setNewContentText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Chat Drawer / Modal State
  const [chatCard, setChatCard] = useState(null);
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  // Audio playing
  const [playingAudio, setPlayingAudio] = useState(false);

  // Fetch sessions on mount / profile change
  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/sessions?profile_id=${activeProfileId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [activeProfileId]);

  // Fetch cards when selectedSession changes
  const fetchCards = async () => {
    if (!selectedSession) return;
    setLoadingCards(true);
    try {
      const sId = selectedSession.session_id === '__all__' ? 'all' : selectedSession.session_id;
      const res = await fetch(`/api/flashcards?profile_id=${activeProfileId}&session_id=${encodeURIComponent(sId)}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data);
      }
    } catch (err) {
      console.error('Failed to fetch flashcards:', err);
    } finally {
      setLoadingCards(false);
    }
  };

  useEffect(() => {
    if (selectedSession) {
      fetchCards();
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  }, [selectedSession, activeProfileId]);

  // Toggle single mode in filter
  const toggleMode = (modeKey) => {
    if (selectedModes.includes(modeKey)) {
      if (selectedModes.length === 1) return; // Keep at least one selected
      setSelectedModes(selectedModes.filter(m => m !== modeKey));
    } else {
      setSelectedModes([...selectedModes, modeKey]);
    }
  };

  // Select all modes or only one mode
  const selectAllModes = () => setSelectedModes(['search', 'compare', 'explain', 'translation', 'correction']);
  const selectOnlyMode = (m) => setSelectedModes([m]);

  // Filtered cards based on modes, search, star, and color
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // Mode filter
      if (!selectedModes.includes(card.mode)) return false;

      // Star filter
      if (starFilter !== null) {
        if (starFilter === 0 && (card.stars || 0) !== 0) return false;
        if (starFilter > 0 && card.stars !== starFilter) return false;
      }

      // Color filter
      if (colorFilter !== null) {
        if (colorFilter === 'none' && card.color) return false;
        if (colorFilter !== 'none' && card.color !== colorFilter) return false;
      }

      // Search query
      if (cardSearch.trim()) {
        const q = cardSearch.toLowerCase();
        const titleMatch = (card.title || '').toLowerCase().includes(q);
        const contentMatch = (card.content || '').toLowerCase().includes(q);
        if (!titleMatch && !contentMatch) return false;
      }

      return true;
    });
  }, [cards, selectedModes, starFilter, colorFilter, cardSearch]);

  // Reset practice order when filtered cards change or shuffle toggles
  useEffect(() => {
    const indices = filteredCards.map((_, i) => i);
    if (isShuffled) {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    setPracticeOrder(indices);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [filteredCards.length, isShuffled]);

  const currentPracticeCard = useMemo(() => {
    if (filteredCards.length === 0) return null;
    const actualIndex = practiceOrder[currentIndex] !== undefined ? practiceOrder[currentIndex] : currentIndex;
    return filteredCards[actualIndex] || filteredCards[0];
  }, [filteredCards, practiceOrder, currentIndex]);

  // Fullscreen Handler
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (cardContainerRef.current?.requestFullscreen) {
          await cardContainerRef.current.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (err) {
      // Fallback: Toggle CSS-based fullscreen mode if requestFullscreen is denied
      setIsFullscreen(prev => !prev);
    }
    setTimeout(() => {
      updateSpreadInfo();
      snapToNearestSpread();
    }, 120);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        updateSpreadInfo();
        snapToNearestSpread();
      }, 100);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 2-Column Spread Info Calculator
  const updateSpreadInfo = () => {
    const el = twoColScrollRef.current;
    if (!el) return;
    const clientWidth = el.clientWidth || 1;
    const scrollWidth = el.scrollWidth || clientWidth;
    const scrollLeft = el.scrollLeft || 0;

    const totalSpreads = Math.max(1, Math.round(scrollWidth / clientWidth));
    const currentSpread = Math.min(totalSpreads, Math.max(1, Math.round(scrollLeft / clientWidth) + 1));
    const leftPage = (currentSpread - 1) * 2 + 1;
    const rightPage = (currentSpread - 1) * 2 + 2;

    setSpreadInfo({
      currentSpread,
      totalSpreads,
      leftPage,
      rightPage
    });
  };

  // Snap to Nearest Spread with Smooth Animation
  const snapToNearestSpread = () => {
    const el = twoColScrollRef.current;
    if (!el || layoutColumns !== 2) return;
    const clientWidth = el.clientWidth || 1;
    const targetSpreadIdx = Math.round(el.scrollLeft / clientWidth);
    const targetLeft = targetSpreadIdx * clientWidth;
    if (Math.abs(el.scrollLeft - targetLeft) > 2) {
      el.scrollTo({
        left: targetLeft,
        behavior: animationsEnabled ? 'smooth' : 'auto'
      });
    }
  };

  const handleSpreadPrev = () => {
    const el = twoColScrollRef.current;
    if (!el) return;
    markProgrammaticScroll();
    const clientWidth = el.clientWidth || 1;
    const currentSpreadIdx = Math.round(el.scrollLeft / clientWidth);
    const prevIdx = Math.max(0, currentSpreadIdx - 1);
    el.scrollTo({
      left: prevIdx * clientWidth,
      behavior: animationsEnabled ? 'smooth' : 'auto'
    });
  };

  const handleSpreadNext = () => {
    const el = twoColScrollRef.current;
    if (!el) return;
    markProgrammaticScroll();
    const clientWidth = el.clientWidth || 1;
    const currentSpreadIdx = Math.round(el.scrollLeft / clientWidth);
    const totalSpreads = Math.max(1, Math.round(el.scrollWidth / clientWidth));
    const nextIdx = Math.min(totalSpreads - 1, currentSpreadIdx + 1);
    el.scrollTo({
      left: nextIdx * clientWidth,
      behavior: animationsEnabled ? 'smooth' : 'auto'
    });
  };

  const handleSpreadSelect = (spreadIndexZeroBased) => {
    const el = twoColScrollRef.current;
    if (!el) return;
    markProgrammaticScroll();
    const clientWidth = el.clientWidth || 1;
    el.scrollTo({
      left: spreadIndexZeroBased * clientWidth,
      behavior: animationsEnabled ? 'smooth' : 'auto'
    });
  };

  // Non-passive wheel and scroll listener with snappy spread pagination
  useEffect(() => {
    const el = twoColScrollRef.current;
    if (!el || layoutColumns !== 2) return;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const isDiscreteWheel = e.deltaMode !== 0 || Math.abs(delta) >= 30;

      if (isDiscreteWheel) {
        // Discrete mouse wheel notch: step one spread at a time with 200ms lock
        if (wheelLockRef.current) return;
        wheelLockRef.current = true;
        setTimeout(() => { wheelLockRef.current = false; }, 200);

        if (delta > 0) {
          handleSpreadNext();
        } else if (delta < 0) {
          handleSpreadPrev();
        }
      } else {
        // Continuous smooth trackpad panning
        el.scrollLeft += delta;

        // Auto-snap into the nearest spread once the gesture pauses
        if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = setTimeout(() => {
          snapToNearestSpread();
        }, 90);
      }
    };

    const onScroll = () => {
      updateSpreadInfo();
      // Snap-in after manual scrollbar dragging pauses (ignore if programmatic smooth scroll)
      if (!isProgrammaticScrollRef.current) {
        if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = setTimeout(() => {
          snapToNearestSpread();
        }, 120);
      }
    };

    const onScrollEnd = () => {
      if (!isProgrammaticScrollRef.current) {
        snapToNearestSpread();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
      if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    };
  }, [layoutColumns, currentPracticeCard, fontScaleIndex, isFullscreen, isFlipped]);

  // Window resize handler to realign spreads
  useEffect(() => {
    const onResize = () => {
      if (layoutColumns === 2 && twoColScrollRef.current) {
        updateSpreadInfo();
        snapToNearestSpread();
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [layoutColumns]);

  // Reset scroll and recompute spread on flip, index, layout, or font size change
  useEffect(() => {
    // Clear any pending snap timeouts from previous card or interaction
    if (snapTimeoutRef.current) {
      clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = null;
    }
    markProgrammaticScroll();

    if (isFlipped) {
      if (layoutColumns === 2 && twoColScrollRef.current) {
        twoColScrollRef.current.scrollTo({ left: 0, behavior: 'instant' });
        twoColScrollRef.current.scrollLeft = 0;
      } else if (layoutColumns === 1 && oneColScrollRef.current) {
        oneColScrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
        oneColScrollRef.current.scrollTop = 0;
      }

      setSpreadInfo({
        currentSpread: 1,
        totalSpreads: 1,
        leftPage: 1,
        rightPage: 2
      });

      const t1 = setTimeout(() => {
        if (layoutColumns === 2 && twoColScrollRef.current) {
          twoColScrollRef.current.scrollLeft = 0;
          updateSpreadInfo();
        }
      }, 50);

      const t2 = setTimeout(() => {
        if (layoutColumns === 2 && twoColScrollRef.current) {
          twoColScrollRef.current.scrollLeft = 0;
          updateSpreadInfo();
        }
      }, 150);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else {
      setSpreadInfo({
        currentSpread: 1,
        totalSpreads: 1,
        leftPage: 1,
        rightPage: 2
      });
    }
  }, [isFlipped, currentIndex, currentPracticeCard?.id, layoutColumns, fontScaleIndex, isFullscreen]);

  // Keyboard navigation for Practice mode:
  // - left right for forward and backward (←, →)
  // - enter, space, w to flip the card
  // - up, down, a, d, [, ] to navigate spreads in 2-col view
  // - + and - to control font size
  useEffect(() => {
    if (viewMode !== 'practice' || !currentPracticeCard) return;

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input or textarea
      const activeTag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(activeTag) || document.activeElement?.isContentEditable) {
        return;
      }
      if (editingTitleCard || editingContentCard || chatCard || deleteModalSession) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextCard();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevCard();
      } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.key === 'ArrowDown') {
        if (!isFlipped) {
          e.preventDefault();
          handlePrevCard();
        } else if (layoutColumns === 2) {
          e.preventDefault();
          handleSpreadPrev();
        } else if (oneColScrollRef.current) {
          e.preventDefault();
          oneColScrollRef.current.scrollBy({ top: -150, behavior: animationsEnabled ? 'smooth' : 'auto' });
        }
      } else if (e.key === '[' || e.key === '{' || e.key === 'a' || e.key === 'A') {
        if (!isFlipped) {
          e.preventDefault();
          setIsFlipped(true);
        } else if (layoutColumns === 2) {
          e.preventDefault();
          handleSpreadPrev();
        } else if (oneColScrollRef.current) {
          e.preventDefault();
          oneColScrollRef.current.scrollBy({ top: -150, behavior: animationsEnabled ? 'smooth' : 'auto' });
        }
      } else if (e.key === 'ArrowUp' || e.key === ']' || e.key === '}' || e.key === 'd' || e.key === 'D') {
        if (!isFlipped) {
          e.preventDefault();
          setIsFlipped(true);
        } else if (layoutColumns === 2) {
          e.preventDefault();
          handleSpreadNext();
        } else if (oneColScrollRef.current) {
          e.preventDefault();
          oneColScrollRef.current.scrollBy({ top: 150, behavior: animationsEnabled ? 'smooth' : 'auto' });
        }
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setFontScaleIndex(i => Math.min(FONT_SIZES.length - 1, i + 1));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setFontScaleIndex(i => Math.max(0, i - 1));
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const starNum = parseInt(e.key, 10);
        handleUpdateStars(currentPracticeCard, starNum);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    viewMode,
    currentPracticeCard,
    currentIndex,
    filteredCards.length,
    isFlipped,
    layoutColumns,
    fontScaleIndex,
    isFullscreen,
    animationsEnabled,
    editingTitleCard,
    editingContentCard,
    chatCard,
    deleteModalSession
  ]);

  const handleNextCard = () => {
    setIsFlipped(false);
    setSpreadInfo({ currentSpread: 1, totalSpreads: 1, leftPage: 1, rightPage: 2 });
    if (filteredCards.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % filteredCards.length);
  };

  const handlePrevCard = () => {
    setIsFlipped(false);
    setSpreadInfo({ currentSpread: 1, totalSpreads: 1, leftPage: 1, rightPage: 2 });
    if (filteredCards.length === 0) return;
    setCurrentIndex(prev => (prev - 1 + filteredCards.length) % filteredCards.length);
  };

  // Delete Session Submit
  const handleDeleteSessionSubmit = async (sessionId, keepItems) => {
    setDeletingSession(true);
    try {
      const res = await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          profile_id: activeProfileId,
          keep_items: keepItems
        })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setDeleteModalSession(null);
      await fetchSessions();
      if (selectedSession && (selectedSession.session_id === sessionId || selectedSession.session_id === '__all__')) {
        setSelectedSession(null);
      }
      if (onSessionDeleted) {
        onSessionDeleted(sessionId, keepItems);
      }
    } catch (err) {
      alert('Failed to delete session: ' + err.message);
    } finally {
      setDeletingSession(false);
    }
  };

  // Update Stars
  const handleUpdateStars = async (card, newStars) => {
    const updatedStars = card.stars === newStars ? 0 : newStars;
    // Optimistic UI update
    setCards(prev => prev.map(c => (c.id === card.id && c.mode === card.mode) ? { ...c, stars: updatedStars } : c));

    try {
      const endpoint = card.mode === 'search' ? `/api/words/${card.id}/stars`
        : card.mode === 'compare' ? `/api/comparisons/${card.id}/stars`
        : card.mode === 'explain' ? `/api/explains/${card.id}/stars`
        : card.mode === 'translation' ? `/api/translations/${card.id}/stars`
        : `/api/corrections/${card.id}/stars`;

      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars: updatedStars })
      });
    } catch (err) {
      console.error('Failed to update stars:', err);
    }
  };

  // Update Color
  const handleUpdateColor = async (card, newColor) => {
    const colorVal = card.color === newColor ? null : newColor;
    setCards(prev => prev.map(c => (c.id === card.id && c.mode === card.mode) ? { ...c, color: colorVal } : c));

    try {
      const endpoint = card.mode === 'search' ? `/api/words/${card.id}/color`
        : card.mode === 'compare' ? `/api/comparisons/${card.id}/color`
        : card.mode === 'explain' ? `/api/explains/${card.id}/color`
        : card.mode === 'translation' ? `/api/translations/${card.id}/color`
        : `/api/corrections/${card.id}/color`;

      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: colorVal })
      });
    } catch (err) {
      console.error('Failed to update color:', err);
    }
  };

  // Save Title Edit
  const handleSaveTitle = async () => {
    if (!editingTitleCard || !newTitleText.trim()) return;
    setSavingEdit(true);
    const card = editingTitleCard;
    const trimmedTitle = newTitleText.trim();

    try {
      const endpoint = card.mode === 'search' ? `/api/words/${card.id}/rename`
        : card.mode === 'compare' ? `/api/comparisons/${card.id}/rename`
        : card.mode === 'explain' ? `/api/explains/${card.id}/rename`
        : card.mode === 'translation' ? `/api/translations/${card.id}/rename`
        : `/api/corrections/${card.id}/rename`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: trimmedTitle })
      });

      if (res.ok) {
        setCards(prev => prev.map(c => (c.id === card.id && c.mode === card.mode) ? { ...c, title: trimmedTitle } : c));
        setEditingTitleCard(null);
      }
    } catch (err) {
      alert('Failed to update title: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Save Content Edit
  const handleSaveContent = async () => {
    if (!editingContentCard || !newContentText.trim()) return;
    setSavingEdit(true);
    const card = editingContentCard;
    const trimmedContent = newContentText.trim();

    try {
      if (!card.first_chat_id) {
        // Fetch preview/chats first to ensure chat_id exists
        const prevRes = await fetch(`/api/${card.mode === 'search' ? 'words' : card.mode === 'compare' ? 'comparisons' : card.mode === 'explain' ? 'explains' : card.mode === 'translation' ? 'translations' : 'corrections'}/${card.id}/preview`);
        const prevData = await prevRes.json();
        if (prevData.chat_id) card.first_chat_id = prevData.chat_id;
      }

      if (card.first_chat_id) {
        const endpoint = card.mode === 'search' ? `/api/chats/${card.first_chat_id}`
          : card.mode === 'compare' ? `/api/comparisons/chats/${card.first_chat_id}`
          : card.mode === 'explain' ? `/api/explains/chats/${card.first_chat_id}`
          : card.mode === 'translation' ? `/api/translations/chats/${card.first_chat_id}`
          : `/api/corrections/chats/${card.first_chat_id}`;

        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmedContent })
        });

        if (res.ok) {
          setCards(prev => prev.map(c => (c.id === card.id && c.mode === card.mode) ? { ...c, content: trimmedContent } : c));
          setEditingContentCard(null);
        }
      } else {
        alert('Could not locate chat message ID to update.');
      }
    } catch (err) {
      alert('Failed to update content: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Chat Drawer / Modal
  const handleOpenChat = async (card) => {
    setChatCard(card);
    setLoadingChats(true);
    setChats([]);
    setChatInput('');
    try {
      const endpoint = card.mode === 'search' ? `/api/words/${card.id}/chats`
        : card.mode === 'compare' ? `/api/comparisons/${card.id}/chats`
        : card.mode === 'explain' ? `/api/explains/${card.id}/chats`
        : card.mode === 'translation' ? `/api/translations/${card.id}/chats`
        : `/api/corrections/${card.id}/chats`;

      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  // Send Follow-up Chat Message
  const handleSendChat = async (e) => {
    e?.preventDefault();
    if (!chatCard || !chatInput.trim() || sendingChat) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setSendingChat(true);

    const tempUser = { id: 'temp_user', role: 'user', content: userMsg, created_at: new Date().toISOString() };
    setChats(prev => [...prev, tempUser]);

    try {
      let endpoint = '';
      let payload = {};

      if (chatCard.mode === 'search') {
        endpoint = '/api/chat';
        payload = { word_id: chatCard.id, content: userMsg };
      } else if (chatCard.mode === 'compare') {
        endpoint = '/api/comparisons/chat';
        payload = { comparison_id: chatCard.id, content: userMsg };
      } else if (chatCard.mode === 'explain') {
        endpoint = '/api/explains/chat';
        payload = { explain_id: chatCard.id, content: userMsg };
      } else if (chatCard.mode === 'translation') {
        endpoint = '/api/translations/chat';
        payload = { translation_id: chatCard.id, content: userMsg };
      } else if (chatCard.mode === 'correction') {
        endpoint = '/api/corrections/chat';
        payload = { correction_id: chatCard.id, content: userMsg };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.chats) {
          setChats(data.chats);
        } else if (data.content) {
          setChats(prev => prev.filter(c => c.id !== 'temp_user').concat([tempUser, { id: Date.now(), role: 'assistant', content: data.content, created_at: new Date().toISOString() }]));
        }
      }
    } catch (err) {
      alert('Failed to send follow-up message: ' + err.message);
    } finally {
      setSendingChat(false);
    }
  };

  // Pronounce audio
  const handlePronounce = async (text, lang) => {
    if (playingAudio) return;
    try {
      setPlayingAudio(true);
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang || 'en')}&format=base64`);
      if (res.ok) {
        const data = await res.json();
        const audio = new Audio(`data:${data.mime_type};base64,${data.audio_base64}`);
        audio.onended = () => setPlayingAudio(false);
        audio.onerror = () => setPlayingAudio(false);
        audio.play();
      } else {
        // Fallback to browser SpeechSynthesis
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(text);
          u.onend = () => setPlayingAudio(false);
          u.onerror = () => setPlayingAudio(false);
          window.speechSynthesis.speak(u);
        } else {
          setPlayingAudio(false);
        }
      }
    } catch (e) {
      setPlayingAudio(false);
    }
  };

  // Filtered sessions for Session List View
  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return sessions;
    const q = sessionSearch.toLowerCase();
    return sessions.filter(s => s.session_id.toLowerCase().includes(q));
  }, [sessions, sessionSearch]);

  const totalProfileCards = useMemo(() => {
    return sessions.reduce((sum, s) => sum + (s.total_count || 0), 0);
  }, [sessions]);

  // Render Delete Session Modal (Shared across Decks & Session views)
  const renderDeleteSessionModal = () => {
    if (!deleteModalSession) return null;
    return (
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
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 truncate" title={deleteModalSession.session_id}>
                "{deleteModalSession.session_id}"
              </p>
              <p className="text-xs text-gray-400 mt-1">
                This session contains {deleteModalSession.total_cards || deleteModalSession.total_count || 0} item(s). Choose how you would like to delete it:
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {/* Option 1: Keep items (dissociate session only) */}
            <button
              type="button"
              disabled={deletingSession}
              onClick={() => handleDeleteSessionSubmit(deleteModalSession.session_id, true)}
              className="w-full p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100/70 dark:hover:bg-blue-900/60 text-left transition-all cursor-pointer group disabled:opacity-50"
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
                Removes the session grouping. All {deleteModalSession.total_cards || deleteModalSession.total_count || 0} items will remain safe in your profile history.
              </p>
            </button>

            {/* Option 2: Delete items */}
            <button
              type="button"
              disabled={deletingSession}
              onClick={() => handleDeleteSessionSubmit(deleteModalSession.session_id, false)}
              className="w-full p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 hover:bg-red-100/60 dark:hover:bg-red-900/50 text-left transition-all cursor-pointer group disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-red-700 dark:text-red-400">
                  Delete Session & All Items
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Permanently deletes this session and all its {deleteModalSession.total_cards || deleteModalSession.total_count || 0} items and chats.
              </p>
            </button>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              disabled={deletingSession}
              onClick={() => setDeleteModalSession(null)}
              className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render Edit Title Modal
  const renderEditTitleModal = () => {
    if (!editingTitleCard) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl max-w-md w-full p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Edit size={16} className="text-amber-500" />
              <span>Edit Title / Word</span>
            </h3>
            <button
              onClick={() => setEditingTitleCard(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Word or Expression Title
            </label>
            <input
              type="text"
              value={newTitleText}
              onChange={e => setNewTitleText(e.target.value)}
              autoFocus
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingTitleCard(null)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              title="Cancel Title Edit"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingEdit || !newTitleText.trim()}
              onClick={handleSaveTitle}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              {savingEdit && <Loader2 size={13} className="animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render Edit Content Modal
  const renderEditContentModal = () => {
    if (!editingContentCard) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between shrink-0">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Edit3 size={16} className="text-blue-500" />
              <span>Edit First Output (Markdown)</span>
            </h3>
            <button
              onClick={() => setEditingContentCard(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              title="Close Edit Content Modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You can edit the definitions, examples, and tables formatted in Markdown.
            </p>
            <textarea
              value={newContentText}
              onChange={e => setNewContentText(e.target.value)}
              rows={14}
              className="w-full flex-1 font-mono text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditingContentCard(null)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              title="Cancel Content Edit"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingEdit || !newContentText.trim()}
              onClick={handleSaveContent}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              {savingEdit && <Loader2 size={13} className="animate-spin" />}
              <span>Save Content</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render Interactive Chat Modal
  const renderChatModal = () => {
    if (!chatCard) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-2xl w-full h-[80vh] max-h-[700px] flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 bg-gray-50/70 dark:bg-gray-800/40 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
                <MessageSquare size={16} />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 truncate">
                  Chat: {chatCard.title}
                </h3>
                <p className="text-[11px] text-gray-400">
                  Follow-up Q&A for this flashcard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToMode && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateToMode(chatCard.mode, chatCard);
                    setChatCard(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                  title="Open in full tab mode"
                >
                  <ExternalLink size={12} />
                  <span className="hidden sm:inline">Open Full Tab</span>
                </button>
              )}
              <button
                onClick={() => setChatCard(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg cursor-pointer"
                title="Close Chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Chat Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingChats ? (
              <div className="flex items-center justify-center h-full text-gray-400 gap-2">
                <Loader2 className="animate-spin text-blue-500" size={24} />
                <span className="text-xs">Loading chat history...</span>
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center p-6">
                <MessageSquare size={32} className="mb-2 opacity-50" />
                <p className="text-sm font-semibold">No follow-up messages yet</p>
                <p className="text-xs max-w-xs mt-1">
                  Ask any follow-up question below about definitions, usage, nuances, or grammar!
                </p>
              </div>
            ) : (
              chats.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id || i}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-br-xs'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-xs markdown-body'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 px-1 mt-0.5">
                      {isUser ? 'You' : 'Assistant'}
                    </span>
                  </div>
                );
              })
            )}
            {sendingChat && (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 flex items-center gap-2 shrink-0">
            <input
              type="text"
              placeholder="Ask a follow-up question about this card..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={sendingChat}
              className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            />
            <button
              type="submit"
              disabled={sendingChat || !chatInput.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Send</span>
              <Send size={13} />
            </button>
          </form>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDER: 1. SESSIONS OVERVIEW VIEW (Decks list)
  // ----------------------------------------------------
  if (!selectedSession) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-8 bg-gray-50/50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 animate-fadeIn">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
                <Sparkles size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                    Flashcard Decks
                  </h1>
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80">
                    {sessions.length} Decks
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Choose a session deck to browse items or enter interactive flashcard practice mode.
                </p>
              </div>
            </div>

            {/* Session Search & Refresh */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={sessionSearch}
                  onChange={e => setSessionSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 w-48 sm:w-64"
                />
              </div>
              <button
                onClick={fetchSessions}
                disabled={loadingSessions}
                className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors shadow-xs cursor-pointer"
                title="Refresh sessions"
              >
                <RefreshCw size={16} className={loadingSessions ? 'animate-spin text-amber-500' : ''} />
              </button>
            </div>
          </div>

          {/* Quick Study All Cards Card */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-md relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 z-10">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider backdrop-blur-xs">
                  Full Profile Deck
                </span>
                <span className="text-xs text-white/80">({totalProfileCards} total items)</span>
              </div>
              <h2 className="text-xl font-bold">Study All Sessions Combined</h2>
              <p className="text-sm text-white/80 max-w-xl">
                Browse or practice all words, comparisons, explanations, and translations recorded in this profile.
              </p>
            </div>
            <div className="flex items-center gap-2 z-10 shrink-0">
              <button
                onClick={() => {
                  setSelectedSession({ session_id: '__all__', total_count: totalProfileCards });
                  setViewMode('browse');
                }}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-sm font-semibold transition-all backdrop-blur-xs cursor-pointer flex items-center gap-1.5"
              >
                <BookOpen size={16} />
                <span>Browse All</span>
              </button>
              <button
                onClick={() => {
                  setSelectedSession({ session_id: '__all__', total_count: totalProfileCards });
                  setViewMode('practice');
                }}
                className="px-4 py-2 rounded-xl bg-white text-gray-900 hover:bg-white/90 text-sm font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Play size={16} className="fill-current" />
                <span>Practice All</span>
              </button>
            </div>
          </div>

          {/* Sessions Grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Study Sessions ({filteredSessions.length})
              </h3>
            </div>

            {loadingSessions ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                <Loader2 className="animate-spin text-amber-500" size={32} />
                <span className="text-sm">Loading session decks...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-300 dark:border-gray-800 p-8">
                <Layers className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={40} />
                <h4 className="text-base font-semibold text-gray-700 dark:text-gray-300">No sessions found</h4>
                <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                  Look up words or create comparisons with an active session to build flashcard decks.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSessions.map(session => (
                  <div
                    key={session.session_id}
                    className="group bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 hover:border-amber-400/80 dark:hover:border-amber-500/80 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
                    onClick={() => {
                      setSelectedSession(session);
                      setViewMode('browse');
                    }}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50 shrink-0">
                            <Layers size={18} />
                          </span>
                          <h4 className="font-bold text-base text-gray-900 dark:text-gray-100 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" title={session.session_id}>
                            {session.session_id}
                          </h4>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0">
                          {session.total_count} {session.total_count === 1 ? 'card' : 'cards'}
                        </span>
                      </div>

                      {/* Mode count pills */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {session.word_count > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                            {session.word_count} words
                          </span>
                        )}
                        {session.comparison_count > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">
                            {session.comparison_count} compares
                          </span>
                        )}
                        {session.explain_count > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                            {session.explain_count} explains
                          </span>
                        )}
                        {session.translation_count > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                            {session.translation_count} translations
                          </span>
                        )}
                        {session.correction_count > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                            {session.correction_count} corrections
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-400">
                        {session.updated_at ? new Date(session.updated_at).toLocaleDateString() : 'Recent'}
                      </span>
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setDeleteModalSession(session)}
                          className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                          title={`Delete session "${session.session_id}"`}
                        >
                          <Trash2 size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setViewMode('browse');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                        >
                          Browse
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setViewMode('practice');
                          }}
                          className="px-3 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-white shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Play size={12} className="fill-current" />
                          <span>Practice</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Delete Session Confirmation Modal */}
        {renderDeleteSessionModal()}
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: 2. SELECTED SESSION VIEW (Browse & Practice)
  // ----------------------------------------------------
  const isAllDecks = selectedSession.session_id === '__all__';

  return (
    <div className={`h-full flex flex-col bg-gray-50/50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden ${!animationsEnabled ? 'flashcard-no-animations' : ''}`}>
      {/* Top Navbar */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200/80 dark:border-gray-800 px-4 md:px-6 py-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Back button & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSelectedSession(null)}
              className="p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors cursor-pointer shrink-0"
              title="Back to Decks"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 uppercase tracking-wider shrink-0">
                  {isAllDecks ? 'All Items' : 'Session'}
                </span>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate" title={isAllDecks ? 'All Profile Flashcards' : selectedSession.session_id}>
                  {isAllDecks ? 'All Profile Flashcards' : selectedSession.session_id}
                </h2>
                <span className="text-xs text-gray-400 font-medium shrink-0">
                  ({filteredCards.length} of {cards.length})
                </span>
              </div>
            </div>
          </div>

          {/* View Mode Switcher, Animation Toggle & Fullscreen Button */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setViewMode('browse')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'browse'
                    ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <BookOpen size={14} />
                <span>Browse</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('practice');
                  setIsFlipped(false);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'practice'
                    ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Play size={14} className="fill-current" />
                <span>Practice</span>
              </button>
            </div>

            {/* Animation Toggle Button in Navbar */}
            <button
              type="button"
              onClick={toggleAnimations}
              className={`p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                !animationsEnabled
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold'
                  : ''
              }`}
              title={animationsEnabled ? "Turn off animations (Instant mode)" : "Turn on animations"}
            >
              {animationsEnabled ? <Zap size={15} className="text-amber-500" /> : <ZapOff size={15} className="text-gray-400" />}
              <span className="hidden md:inline text-xs font-semibold">{animationsEnabled ? 'Anim: On' : 'Anim: Off'}</span>
            </button>

            {/* Fullscreen Toggle Button in Navbar */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={`p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                isFullscreen
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                  : ''
              }`}
              title={isFullscreen ? "Exit Fullscreen (F / Esc)" : "Fullscreen Mode (F)"}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span className="hidden md:inline text-xs font-semibold">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              <kbd className="hidden lg:inline px-1 py-0.2 rounded bg-gray-200/70 dark:bg-gray-700/70 font-mono text-[9px]">F</kbd>
            </button>
          </div>
        </div>

        {/* Filter Controls: Modes selection (1 of 4, 2 of 4, 3 of 4 or all) + Stars + Colors */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Mode Selection Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px] mr-1">
              Modes:
            </span>
            {Object.entries(MODE_CONFIG).map(([key, config]) => {
              const isSelected = selectedModes.includes(key);
              const IconComponent = config.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleMode(key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer border ${
                    isSelected
                      ? `${config.colorClass} shadow-2xs font-semibold`
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200/80 dark:border-gray-700 opacity-60 hover:opacity-100'
                  }`}
                  title={`Toggle ${config.label}`}
                >
                  <IconComponent size={13} />
                  <span>{config.shortLabel}</span>
                  {isSelected && <Check size={11} className="stroke-[3]" />}
                </button>
              );
            })}

            <button
              type="button"
              onClick={selectAllModes}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline px-1 cursor-pointer font-medium"
            >
              All (4/4)
            </button>
          </div>

          {/* Secondary Filters: Stars + Colors + Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Star Filter Dropdown / Buttons */}
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1">
              <Star size={13} className="text-amber-400 fill-amber-400" />
              <select
                value={starFilter === null ? 'all' : starFilter}
                onChange={e => setStarFilter(e.target.value === 'all' ? null : parseInt(e.target.value, 10))}
                className="bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer text-xs"
              >
                <option value="all">All Stars</option>
                <option value="5">★★★★★ (5)</option>
                <option value="4">★★★★☆ (4)</option>
                <option value="3">★★★☆☆ (3)</option>
                <option value="2">★★☆☆☆ (2)</option>
                <option value="1">★☆☆☆☆ (1)</option>
                <option value="0">Unrated (0)</option>
              </select>
            </div>

            {/* Color Filter */}
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-red-500 via-yellow-500 to-green-500 shrink-0"></span>
              <select
                value={colorFilter === null ? 'all' : colorFilter}
                onChange={e => setColorFilter(e.target.value === 'all' ? null : e.target.value)}
                className="bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer text-xs"
              >
                <option value="all">All Colors</option>
                {colors.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
                <option value="none">No Color</option>
              </select>
            </div>

            {/* In-Session Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Filter cards..."
                value={cardSearch}
                onChange={e => setCardSearch(e.target.value)}
                className="w-32 sm:w-44 pl-2.5 pr-6 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {cardSearch && (
                <button
                  onClick={() => setCardSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {loadingCards ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <Loader2 className="animate-spin text-amber-500" size={36} />
            <span className="text-sm font-medium">Loading session flashcards...</span>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Layers className="text-gray-300 dark:text-gray-700 mb-3" size={48} />
            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">No matching flashcards</h3>
            <p className="text-sm text-gray-400 max-w-md mt-1 mb-4">
              Try enabling more modes (e.g. Search, Compare, Explain, Translation) or clear your star/search filters.
            </p>
            <button
              onClick={() => {
                selectAllModes();
                setStarFilter(null);
                setColorFilter(null);
                setCardSearch('');
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : viewMode === 'practice' ? (
          // ----------------------------------------------------
          // 2A. PRACTICE MODE (Interactive Flip Flashcard)
          // ----------------------------------------------------
          <div
            ref={cardContainerRef}
            className={`flashcard-fullscreen-container ${!animationsEnabled ? 'flashcard-no-animations' : 'transition-all duration-200'} ${
              isFullscreen
                ? 'fixed inset-0 z-50 bg-white dark:bg-gray-950 w-screen h-screen p-0 m-0 overflow-hidden flex flex-col justify-between'
                : 'h-full flex flex-col items-center justify-between p-4 md:p-8 max-w-4xl mx-auto overflow-y-auto w-full'
            }`}
          >
            {isFullscreen ? (
              // ====================================================
              // FULLSCREEN PRACTICE: Truly borderless, edge-to-edge,
              // maximizes text reading area with slim unified chrome
              // ====================================================
              currentPracticeCard && (
                <>
                  {/* Slim Edge-to-Edge Top Header */}
                  <div className="w-full px-4 md:px-6 py-2 bg-white/95 dark:bg-gray-900/95 border-b border-gray-200/80 dark:border-gray-800/80 shrink-0 flex items-center justify-between gap-3 text-xs backdrop-blur-xs select-none">
                    {/* Left: Card progress, mode badge, and flip indicator */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-bold text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        Card {currentIndex + 1} <span className="text-gray-400 font-normal">of {filteredCards.length}</span>
                      </span>
                      <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 font-mono">
                        {Math.round(((currentIndex + 1) / filteredCards.length) * 100)}%
                      </span>

                      <span className="text-gray-300 dark:text-gray-700 hidden sm:inline">•</span>

                      {/* Mode badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${MODE_CONFIG[currentPracticeCard.mode]?.colorClass || ''}`}>
                        {React.createElement(MODE_CONFIG[currentPracticeCard.mode]?.icon || HelpCircle, { size: 12 })}
                        <span>{MODE_CONFIG[currentPracticeCard.mode]?.shortLabel || currentPracticeCard.mode}</span>
                      </span>

                      {/* Flip side badge */}
                      <span className="hidden lg:inline text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        {isFlipped ? 'Back (Explanation)' : 'Front (Term)'}
                      </span>
                    </div>

                    {/* Center: In Back view, Layout columns switcher, Font zoom, and Spread Navigator */}
                    {isFlipped ? (
                      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                        {/* 1-Col vs 2-Col layout switcher */}
                        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                          <button
                            type="button"
                            onClick={() => setLayoutColumns(1)}
                            className={`px-2 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer ${layoutColumns === 1 ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            title="Single Column Vertical Scroll"
                          >
                            1-Col
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLayoutColumns(2);
                              setTimeout(updateSpreadInfo, 60);
                            }}
                            className={`px-2 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center gap-1 ${layoutColumns === 2 ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            title="2-Column Book Spread Scroll ([ and ] to move left/right)"
                          >
                            <Columns size={12} />
                            <span>2-Col</span>
                          </button>
                        </div>

                        {/* Font Size Zoom (+ and -) */}
                        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                          <button
                            type="button"
                            onClick={() => setFontScaleIndex(i => Math.max(0, i - 1))}
                            disabled={fontScaleIndex === 0}
                            className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 cursor-pointer"
                            title="Decrease font size (-)"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="px-1 text-[11px] font-mono font-bold text-gray-700 dark:text-gray-300 min-w-[32px] text-center select-none" title="Font size level (+ / -)">
                            {FONT_SIZES[fontScaleIndex].label}
                          </span>
                          <button
                            type="button"
                            onClick={() => setFontScaleIndex(i => Math.min(FONT_SIZES.length - 1, i + 1))}
                            disabled={fontScaleIndex === FONT_SIZES.length - 1}
                            className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 cursor-pointer"
                            title="Increase font size (+)"
                          >
                            <Plus size={11} />
                          </button>
                        </div>

                        {/* If 2-Col: Integrated compact spread navigator right in the top bar */}
                        {layoutColumns === 2 && (
                          <div className="flex items-center gap-1 bg-gray-100/90 dark:bg-gray-800/90 px-1.5 py-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                            <button
                              type="button"
                              onClick={handleSpreadPrev}
                              disabled={spreadInfo.currentSpread <= 1}
                              className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 cursor-pointer flex items-center gap-0.5"
                              title="Previous spread (↓, A, [)"
                            >
                              <ChevronLeft size={13} />
                              <span className="hidden sm:inline">[ Prev</span>
                            </button>
                            <span className="px-1.5 text-[11px] font-mono font-bold text-gray-700 dark:text-gray-200">
                              {spreadInfo.currentSpread}/{spreadInfo.totalSpreads}
                              <span className="hidden lg:inline text-gray-400 font-normal text-[10px] ml-1">
                                (p.{spreadInfo.leftPage}-{spreadInfo.rightPage})
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={handleSpreadNext}
                              disabled={spreadInfo.currentSpread >= spreadInfo.totalSpreads}
                              className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 cursor-pointer flex items-center gap-0.5"
                              title="Next spread (↑, D, ])"
                            >
                              <span className="hidden sm:inline">Next ]</span>
                              <ChevronRight size={13} />
                            </button>
                          </div>
                        )}

                        {/* Edit Content */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContentCard(currentPracticeCard);
                            setNewContentText(currentPracticeCard.content || '');
                          }}
                          className="hidden 2xl:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
                          title="Edit Explanation Content"
                        >
                          <Edit3 size={12} />
                          <span>Edit Content</span>
                        </button>

                        {/* Open Chat */}
                        <button
                          type="button"
                          onClick={() => handleOpenChat(currentPracticeCard)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white shadow-2xs transition-colors cursor-pointer"
                          title="Open Follow-up Chat for this card"
                        >
                          <MessageSquare size={12} />
                          <span>Chat</span>
                          {currentPracticeCard.chat_count > 1 && (
                            <span className="bg-blue-700 px-1.5 py-0.2 rounded-full text-[10px]">
                              {currentPracticeCard.chat_count}
                            </span>
                          )}
                        </button>
                      </div>
                    ) : (
                      /* Center on Front: Edit title shortcut */
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTitleCard(currentPracticeCard);
                            setNewTitleText(currentPracticeCard.title);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
                          title="Edit Title"
                        >
                          <Edit size={12} />
                          <span>Edit Title</span>
                        </button>
                      </div>
                    )}

                    {/* Right: Color tag, Star rating, Shuffle, and Exit Fullscreen */}
                    <div className="flex items-center gap-2.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {/* Color picker */}
                      <div className="hidden 2xl:flex items-center gap-1">
                        {colors.map(c => {
                          const isCurrent = currentPracticeCard.color === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleUpdateColor(currentPracticeCard, c.id)}
                              className={`w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 cursor-pointer ${isCurrent ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110' : 'opacity-60 hover:opacity-100'}`}
                              style={{ backgroundColor: c.hex }}
                              title={`${c.label} (${c.id})`}
                            />
                          );
                        })}
                        {currentPracticeCard.color && (
                          <button
                            type="button"
                            onClick={() => handleUpdateColor(currentPracticeCard, null)}
                            className="text-xs text-gray-400 hover:text-red-500 ml-0.5 cursor-pointer"
                            title="Clear color"
                          >
                            &times;
                          </button>
                        )}
                      </div>

                      <span className="text-gray-300 dark:text-gray-700 hidden 2xl:inline">|</span>

                      {/* Stars */}
                      <div className="hidden 2xl:block">
                        <StarRating
                          value={currentPracticeCard.stars || 0}
                          onChange={(stars) => handleUpdateStars(currentPracticeCard, stars)}
                          size="sm"
                        />
                      </div>

                      <span className="text-gray-300 dark:text-gray-700 hidden 2xl:inline">|</span>

                      {/* Animation Toggle */}
                      <button
                        type="button"
                        onClick={toggleAnimations}
                        className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                          !animationsEnabled
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs font-semibold'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                        }`}
                        title={animationsEnabled ? "Turn off animations (Instant mode)" : "Turn on animations"}
                      >
                        {animationsEnabled ? <Zap size={13} className="text-amber-500" /> : <ZapOff size={13} className="text-gray-400" />}
                        <span className="hidden xl:inline">{animationsEnabled ? 'Animations' : 'No Animation'}</span>
                      </button>

                      {/* Shuffle */}
                      <button
                        type="button"
                        onClick={() => setIsShuffled(!isShuffled)}
                        className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                          isShuffled
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                        }`}
                        title="Shuffle flashcard deck"
                      >
                        <Shuffle size={13} />
                      </button>

                      {/* Exit Fullscreen */}
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-300 dark:border-purple-700 hover:bg-purple-200"
                        title="Exit Fullscreen (F / Esc)"
                      >
                        <Minimize2 size={13} />
                        <span className="hidden sm:inline font-semibold">Exit</span>
                        <kbd className="hidden sm:inline px-1 py-0.2 rounded bg-purple-200/60 dark:bg-purple-800/60 font-mono text-[9px]">F</kbd>
                      </button>
                    </div>
                  </div>

                  {/* Hairline Progress Indicator */}
                  <div className="w-full bg-gray-100 dark:bg-gray-800 h-1 shrink-0 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all duration-300 ease-out"
                      style={{ width: `${((currentIndex + 1) / filteredCards.length) * 100}%` }}
                    />
                  </div>

                  {/* Borderless Fullscreen Canvas (fits 100% of viewport, zero border, zero padding) */}
                  <div
                    onMouseDown={handleCardMouseDown}
                    onClick={(e) => handleCardCanvasClick(e, true)}
                    className="w-full flex-1 min-h-0 bg-white dark:bg-gray-950 border-0 rounded-none shadow-none flex flex-col overflow-hidden relative cursor-default"
                  >
                    {!isFlipped ? (
                      /* FRONT OF FLASHCARD (Fullscreen) */
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-6 my-auto cursor-default">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePronounce(currentPracticeCard.title, currentPracticeCard.language);
                          }}
                          className="p-4 rounded-full bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-600 dark:text-amber-400 transition-colors shadow-sm cursor-pointer"
                          title="Pronounce word"
                        >
                          <Volume2 size={30} className={playingAudio ? 'animate-pulse text-amber-500' : ''} />
                        </button>

                        <div className="space-y-3 max-w-3xl card-selectable-text select-text cursor-text" onClick={e => e.stopPropagation()}>
                          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight leading-tight select-text cursor-text">
                            {currentPracticeCard.title}
                          </h1>

                          {currentPracticeCard.lemma && currentPracticeCard.lemma !== currentPracticeCard.title && (
                            <p className="text-base font-medium text-gray-500 dark:text-gray-400 select-text cursor-text">
                              Lemma: <span className="font-semibold text-gray-700 dark:text-gray-300 select-text cursor-text">{currentPracticeCard.lemma}</span>
                            </p>
                          )}
                          {currentPracticeCard.source_lang && currentPracticeCard.target_lang && (
                            <p className="text-sm text-gray-400 font-mono uppercase select-text cursor-text">
                              {currentPracticeCard.source_lang} &rarr; {currentPracticeCard.target_lang}
                            </p>
                          )}
                        </div>

                        <div className="pt-4 text-xs text-gray-400 flex items-center gap-2 select-none">
                          <span>Click anywhere or press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Enter</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Space</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">W</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">↑</kbd> to flip</span>
                        </div>
                      </div>
                    ) : (
                      /* BACK OF FLASHCARD (Fullscreen) */
                      <div className="w-full flex-1 min-h-0 flex flex-col px-6 md:px-10 lg:px-12 py-3 md:py-4 overflow-hidden select-text" onClick={e => e.stopPropagation()}>
                        {layoutColumns === 2 ? (
                          <div
                            key={`fs-2col-${currentPracticeCard?.id || currentIndex}`}
                            ref={twoColScrollRef}
                            onScroll={updateSpreadInfo}
                            className="two-col-reader card-selectable-text flex-1 w-full h-full min-h-0 overflow-x-auto overflow-y-hidden pr-2 markdown-body text-gray-800 dark:text-gray-200 select-text cursor-text"
                            style={{
                              height: '100%',
                              fontSize: FONT_SIZES[fontScaleIndex].cssSize,
                              lineHeight: 1.65,
                              scrollBehavior: animationsEnabled ? 'smooth' : 'auto'
                            }}
                          >
                            {currentPracticeCard.content ? (
                              <>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {currentPracticeCard.content}
                                </ReactMarkdown>

                                <div className="break-inside-avoid mt-8 p-5 rounded-2xl bg-gray-50/80 dark:bg-gray-850/80 border border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-center space-y-2 select-none">
                                  <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center border border-amber-200/50 dark:border-amber-800/50">
                                    <Sparkles size={16} />
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">End of Explanation</h4>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                      Press <kbd className="px-1 py-0.2 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">Enter</kbd> or <kbd className="px-1 py-0.2 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">Space</kbd> to flip • <kbd className="px-1 py-0.2 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">→</kbd> for next card
                                    </p>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <p className="text-gray-400 italic">No explanation found for this item.</p>
                            )}
                          </div>
                        ) : (
                          <div
                            key={`fs-1col-${currentPracticeCard?.id || currentIndex}`}
                            ref={oneColScrollRef}
                            className="flex-1 w-full h-full min-h-0 overflow-y-auto px-4 md:px-12 lg:px-20 markdown-body card-selectable-text text-gray-800 dark:text-gray-200 leading-relaxed select-text cursor-text"
                            style={{
                              fontSize: FONT_SIZES[fontScaleIndex].cssSize,
                              lineHeight: 1.65
                            }}
                          >
                            {currentPracticeCard.content ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {currentPracticeCard.content}
                              </ReactMarkdown>
                            ) : (
                              <p className="text-gray-400 italic">No explanation found for this item.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Slim Fullscreen Bottom Footer */}
                  <div
                    className="w-full px-4 md:px-6 py-2 bg-gray-50/90 dark:bg-gray-900/90 border-t border-gray-200/80 dark:border-gray-800/80 shrink-0 flex items-center justify-between text-xs select-none backdrop-blur-xs z-10"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={handlePrevCard}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                      <span>Previous <kbd className="hidden sm:inline font-mono text-[10px] text-gray-400">←</kbd></span>
                    </button>

                    {/* Keyboard Shortcuts Hint Legend */}
                    <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-400">
                      <span><kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">←</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">→</kbd> Cards</span>
                      <span>•</span>
                      <span><kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">Enter</kbd> / <kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">Space</kbd> Flip</span>
                      <span>•</span>
                      <span><kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">↓</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">↑</kbd> or <kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">A</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">D</kbd> Spreads</span>
                      <span>•</span>
                      <span><kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">+</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">-</kbd> Font</span>
                      <span>•</span>
                      <span><kbd className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 border border-gray-300/60 dark:border-gray-700 font-mono text-[10px]">F</kbd> Exit</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsFlipped(!isFlipped)}
                        className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw size={14} />
                        <span>{isFlipped ? 'Show Front' : 'Show Answer'}</span>
                        <kbd className="hidden sm:inline font-mono text-[10px] bg-amber-600/60 px-1 rounded">Enter / Space</kbd>
                      </button>

                      <button
                        type="button"
                        onClick={handleNextCard}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>Next <kbd className="hidden sm:inline font-mono text-[10px] text-gray-400">→</kbd></span>
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )
            ) : (
              // ====================================================
              // STANDARD PRACTICE: Boxed Card View
              // ====================================================
              <>
                {/* Progress Bar & Counter Header */}
                <div className="w-full flex items-center justify-between gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                      Card {currentIndex + 1} of {filteredCards.length}
                    </span>
                    <span className="text-gray-300 dark:text-gray-700">•</span>
                    <span className="text-[11px] text-gray-400">
                      {Math.round(((currentIndex + 1) / filteredCards.length) * 100)}% completed
                    </span>
                  </div>

                  {/* Action shortcuts */}
                  <div className="flex items-center gap-2">
                    {/* Animation Toggle */}
                    <button
                      type="button"
                      onClick={toggleAnimations}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                        !animationsEnabled
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs font-semibold'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                      }`}
                      title={animationsEnabled ? "Turn off animations (Instant mode)" : "Turn on animations"}
                    >
                      {animationsEnabled ? <Zap size={13} className="text-amber-500" /> : <ZapOff size={13} className="text-gray-400" />}
                      <span>{animationsEnabled ? 'Animations' : 'No Animation'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsShuffled(!isShuffled)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                        isShuffled
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                      }`}
                      title="Shuffle flashcard deck"
                    >
                      <Shuffle size={13} />
                      <span>{isShuffled ? 'Shuffled' : 'Shuffle'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50"
                      title="Fullscreen Mode (F)"
                    >
                      <Maximize2 size={13} />
                      <span>Fullscreen</span>
                      <kbd className="hidden sm:inline px-1 py-0.2 rounded bg-gray-200/60 dark:bg-gray-700/60 font-mono text-[9px]">F</kbd>
                    </button>
                  </div>
                </div>

                {/* Progress bar line */}
                <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden mb-4 max-w-3xl">
                  <div
                    className="bg-amber-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${((currentIndex + 1) / filteredCards.length) * 100}%` }}
                  ></div>
                </div>

                {/* Flashcard Component */}
                {currentPracticeCard && (
                  <div className="w-full flex-1 flex flex-col justify-center my-auto transition-all max-w-3xl">
                    <div
                      onMouseDown={handleCardMouseDown}
                      onClick={handleCardCanvasClick}
                      className={`w-full bg-white dark:bg-gray-900 rounded-3xl border-2 transition-all duration-200 shadow-lg flex flex-col overflow-hidden relative min-h-[380px] sm:min-h-[440px] max-h-[600px] cursor-default ${
                        isFlipped
                          ? 'border-indigo-400 dark:border-indigo-500'
                          : 'border-gray-200 dark:border-gray-800 hover:border-amber-400 dark:hover:border-amber-500'
                      }`}
                    >
                      {/* Card Header Bar */}
                      <div
                        className="p-4 md:px-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 bg-gray-50/70 dark:bg-gray-800/40 select-none"
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Mode badge */}
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${MODE_CONFIG[currentPracticeCard.mode]?.colorClass || ''}`}>
                            {React.createElement(MODE_CONFIG[currentPracticeCard.mode]?.icon || HelpCircle, { size: 13 })}
                            <span>{MODE_CONFIG[currentPracticeCard.mode]?.shortLabel || currentPracticeCard.mode}</span>
                          </span>

                          {/* Flip state badge */}
                          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                            {isFlipped ? 'Back (Explanation)' : 'Front (Term)'}
                          </span>
                        </div>

                        {/* Beside color, the 1 to 5 stars system! */}
                        <div className="flex items-center gap-3">
                          {/* Color Tag Picker */}
                          <div className="flex items-center gap-1">
                            {colors.map(c => {
                              const isCurrent = currentPracticeCard.color === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleUpdateColor(currentPracticeCard, c.id)}
                                  className={`w-4 h-4 rounded-full transition-transform hover:scale-125 cursor-pointer ${isCurrent ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110' : 'opacity-60 hover:opacity-100'}`}
                                  style={{ backgroundColor: c.hex }}
                                  title={`${c.label} (${c.id})`}
                                />
                              );
                            })}
                            {currentPracticeCard.color && (
                              <button
                                type="button"
                                onClick={() => handleUpdateColor(currentPracticeCard, null)}
                                className="text-xs text-gray-400 hover:text-red-500 ml-0.5 cursor-pointer"
                                title="Clear color"
                              >
                                &times;
                              </button>
                            )}
                          </div>

                          <span className="text-gray-300 dark:text-gray-700">|</span>

                          {/* 1 to 5 Stars Rating System */}
                          <StarRating
                            value={currentPracticeCard.stars || 0}
                            onChange={(stars) => handleUpdateStars(currentPracticeCard, stars)}
                            size="md"
                          />

                          <span className="text-gray-300 dark:text-gray-700">|</span>

                          {/* Fullscreen icon button in Card Header */}
                          <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                            title="Fullscreen Mode (F)"
                          >
                            <Maximize2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Card Body: Front vs Back */}
                      <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-between">
                        {!isFlipped ? (
                          /* FRONT OF FLASHCARD */
                          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 my-auto">
                            {/* Audio speaker button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePronounce(currentPracticeCard.title, currentPracticeCard.language);
                              }}
                              className="p-3 rounded-full bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-600 dark:text-amber-400 transition-colors shadow-xs cursor-pointer"
                              title="Pronounce word"
                            >
                              <Volume2 size={22} className={playingAudio ? 'animate-pulse text-amber-500' : ''} />
                            </button>

                            {/* Title Display & Inline Edit Button */}
                            <div className="space-y-2 max-w-xl card-selectable-text select-text cursor-text" onClick={e => e.stopPropagation()}>
                              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight leading-tight select-text cursor-text">
                                {currentPracticeCard.title}
                              </h1>

                              {/* Extra metadata if available */}
                              {currentPracticeCard.lemma && currentPracticeCard.lemma !== currentPracticeCard.title && (
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 select-text cursor-text">
                                  Lemma: <span className="font-semibold text-gray-700 dark:text-gray-300 select-text cursor-text">{currentPracticeCard.lemma}</span>
                                </p>
                              )}
                              {currentPracticeCard.source_lang && currentPracticeCard.target_lang && (
                                <p className="text-xs text-gray-400 font-mono uppercase select-text cursor-text">
                                  {currentPracticeCard.source_lang} &rarr; {currentPracticeCard.target_lang}
                                </p>
                              )}
                            </div>

                            {/* Edit Title Button */}
                            <div onClick={e => e.stopPropagation()} className="pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTitleCard(currentPracticeCard);
                                  setNewTitleText(currentPracticeCard.title);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                              >
                                <Edit size={13} />
                                <span>Edit Title</span>
                              </button>
                            </div>

                            <div className="pt-8 text-xs text-gray-400 flex items-center gap-2 select-none">
                              <span>Click anywhere or press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Enter</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">Space</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">W</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">↑</kbd> to flip • <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-[10px]">F</kbd> for Fullscreen</span>
                            </div>
                          </div>
                        ) : (
                          /* BACK OF FLASHCARD */
                          <div className="space-y-3 flex flex-col h-full" onClick={e => e.stopPropagation()}>
                            {/* Top bar on back: title, 2-col switcher, font-size zoom, action buttons */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
                              <div className="flex items-center gap-2 min-w-0">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 truncate card-selectable-text select-text cursor-text">
                                  {currentPracticeCard.title}
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTitleCard(currentPracticeCard);
                                    setNewTitleText(currentPracticeCard.title);
                                  }}
                                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded cursor-pointer"
                                  title="Edit Title"
                                >
                                  <Edit size={13} />
                                </button>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {/* 1-Col vs 2-Col Layout Switcher */}
                                <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                                  <button
                                    type="button"
                                    onClick={() => setLayoutColumns(1)}
                                    className={`px-2 py-1 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center gap-1 ${layoutColumns === 1 ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    title="Single Column Vertical Scroll"
                                  >
                                    <span>1-Col</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLayoutColumns(2);
                                      setTimeout(updateSpreadInfo, 60);
                                    }}
                                    className={`px-2 py-1 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center gap-1 ${layoutColumns === 2 ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    title="2-Column Book Spread Scroll ([ and ] to move left/right)"
                                  >
                                    <Columns size={12} />
                                    <span>2-Col</span>
                                  </button>
                                </div>

                                {/* Font Size Zoom (+ and -) */}
                                <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                                  <button
                                    type="button"
                                    onClick={() => setFontScaleIndex(i => Math.max(0, i - 1))}
                                    disabled={fontScaleIndex === 0}
                                    className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 cursor-pointer"
                                    title="Decrease font size (-)"
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span className="px-1 text-[11px] font-mono font-bold text-gray-700 dark:text-gray-300 min-w-[34px] text-center select-none" title="Font size level (+ / -)">
                                    {FONT_SIZES[fontScaleIndex].label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setFontScaleIndex(i => Math.min(FONT_SIZES.length - 1, i + 1))}
                                    disabled={fontScaleIndex === FONT_SIZES.length - 1}
                                    className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 cursor-pointer"
                                    title="Increase font size (+)"
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>

                                {/* Edit Content Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingContentCard(currentPracticeCard);
                                    setNewContentText(currentPracticeCard.content || '');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
                                  title="Edit Explanation Content"
                                >
                                  <Edit3 size={13} />
                                  <span>Edit Content</span>
                                </button>

                                {/* Open Follow-up Chat Button */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenChat(currentPracticeCard)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white shadow-xs transition-colors cursor-pointer"
                                  title="Open Follow-up Chat for this card"
                                >
                                  <MessageSquare size={13} />
                                  <span>Open Chat</span>
                                  {currentPracticeCard.chat_count > 1 && (
                                    <span className="bg-blue-700 px-1.5 py-0.2 rounded-full text-[10px]">
                                      {currentPracticeCard.chat_count}
                                    </span>
                                  )}
                                </button>
                                {/* Fullscreen Toggle on Back */}
                                <button
                                  type="button"
                                  onClick={toggleFullscreen}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                                  title="Fullscreen Mode (F)"
                                >
                                  <Maximize2 size={13} />
                                  <span className="hidden sm:inline">Fullscreen</span>
                                </button>
                              </div>
                            </div>

                            {/* Odd & Even Page Spread Navigation Bar (in 2-col mode) */}
                            {layoutColumns === 2 && (
                              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/90 dark:bg-gray-850/90 rounded-xl border border-gray-200/70 dark:border-gray-800 text-[11px] text-gray-500 shrink-0 select-none">
                                {/* Left Column Folio (Odd Page) */}
                                <button
                                  type="button"
                                  onClick={handleSpreadPrev}
                                  disabled={spreadInfo.currentSpread <= 1}
                                  className="flex items-center gap-1.5 hover:opacity-80 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                                  title="Previous spread (↓, A, [)"
                                >
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-mono font-bold text-[10px] border border-blue-200/50 dark:border-blue-800/50">
                                    Page {spreadInfo.leftPage} (Odd)
                                  </span>
                                  <span className="hidden sm:inline text-gray-400">Left Column</span>
                                </button>

                                {/* Center Spread Navigator */}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={handleSpreadPrev}
                                    disabled={spreadInfo.currentSpread <= 1}
                                    className="px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 cursor-pointer flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-200 shadow-2xs"
                                    title="Previous spread (↓, A, [)"
                                  >
                                    <ChevronLeft size={13} />
                                    <span>[ Prev</span>
                                  </button>

                                  <span className="font-semibold text-gray-700 dark:text-gray-300 font-mono text-xs">
                                    Spread {spreadInfo.currentSpread} of {spreadInfo.totalSpreads}
                                  </span>

                                  {spreadInfo.totalSpreads > 1 && (
                                    <div className="hidden sm:flex items-center gap-1">
                                      {Array.from({ length: spreadInfo.totalSpreads }).map((_, sIdx) => {
                                        const isActive = spreadInfo.currentSpread === sIdx + 1;
                                        return (
                                          <button
                                            key={sIdx}
                                            type="button"
                                            onClick={() => handleSpreadSelect(sIdx)}
                                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold transition-all cursor-pointer ${
                                              isActive
                                                ? 'bg-amber-500 text-white shadow-2xs scale-105'
                                                : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                                            }`}
                                            title={`Jump & snap to Spread ${sIdx + 1} (Pages ${sIdx * 2 + 1}-${sIdx * 2 + 2})`}
                                          >
                                            {sIdx + 1}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    onClick={handleSpreadNext}
                                    disabled={spreadInfo.currentSpread >= spreadInfo.totalSpreads}
                                    className="px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 cursor-pointer flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-200 shadow-2xs"
                                    title="Next spread (↑, D, ])"
                                  >
                                    <span>Next ]</span>
                                    <ChevronRight size={13} />
                                  </button>
                                </div>

                                {/* Right Column Folio (Even Page) */}
                                <button
                                  type="button"
                                  onClick={handleSpreadNext}
                                  disabled={spreadInfo.currentSpread >= spreadInfo.totalSpreads}
                                  className="flex items-center gap-1.5 hover:opacity-80 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                                  title="Next spread (↑, D, ])"
                                >
                                  <span className="hidden sm:inline text-gray-400">Right Column</span>
                                  <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 font-mono font-bold text-[10px] border border-purple-200/50 dark:border-purple-800/50">
                                    Page {spreadInfo.rightPage} (Even)
                                  </span>
                                </button>
                              </div>
                            )}

                            {/* First Output (Explanation) */}
                            {layoutColumns === 2 ? (
                              <div
                                key={`std-2col-${currentPracticeCard?.id || currentIndex}`}
                                ref={twoColScrollRef}
                                onScroll={updateSpreadInfo}
                                className="two-col-reader card-selectable-text flex-1 overflow-x-auto overflow-y-hidden pr-2 markdown-body text-gray-800 dark:text-gray-200 select-text cursor-text"
                                style={{
                                  height: '100%',
                                  fontSize: FONT_SIZES[fontScaleIndex].cssSize,
                                  lineHeight: 1.65,
                                  scrollBehavior: animationsEnabled ? 'smooth' : 'auto'
                                }}
                              >
                                {currentPracticeCard.content ? (
                                  <>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {currentPracticeCard.content}
                                    </ReactMarkdown>

                                    {/* Balanced finisher */}
                                    <div className="break-inside-avoid mt-8 p-5 rounded-2xl bg-gray-50/80 dark:bg-gray-850/80 border border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-center space-y-2 select-none">
                                      <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center border border-amber-200/50 dark:border-amber-800/50">
                                        <Sparkles size={16} />
                                      </div>
                                      <div>
                                        <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">End of Explanation</h4>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                          Press <kbd className="px-1 py-0.2 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">Enter</kbd> or <kbd className="px-1 py-0.2 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">Space</kbd> to flip • <kbd className="px-1 py-0.2 rounded bg-gray-200 dark:bg-gray-700 font-mono text-[10px]">→</kbd> for next card
                                        </p>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-gray-400 italic">No explanation found for this item.</p>
                                )}
                              </div>
                          ) : (
                            <div
                              key={`std-1col-${currentPracticeCard?.id || currentIndex}`}
                              ref={oneColScrollRef}
                              className="flex-1 overflow-y-auto pr-2 markdown-body card-selectable-text text-gray-800 dark:text-gray-200 leading-relaxed select-text cursor-text"
                              style={{
                                fontSize: FONT_SIZES[fontScaleIndex].cssSize,
                                lineHeight: 1.65
                              }}
                            >
                              {currentPracticeCard.content ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {currentPracticeCard.content}
                                </ReactMarkdown>
                              ) : (
                                <p className="text-gray-400 italic">No explanation found for this item.</p>
                              )}
                            </div>
                          )}

                          {/* Action row at bottom of card back (browse-mode actions) */}
                          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-800 text-xs">
                            <div className="flex items-center gap-2">
                              {/* 5 Color tags */}
                              <div className="flex items-center gap-1">
                                {colors.map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => handleUpdateColor(currentPracticeCard, c.id)}
                                    className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                                      currentPracticeCard.color === c.id ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110 opacity-70'
                                    }`}
                                    style={{ backgroundColor: c.hex }}
                                    title={c.label}
                                  />
                                ))}
                              </div>

                              <div className="h-3 w-px bg-gray-200 dark:bg-gray-700" />

                              {/* Star Rating */}
                              <StarRating
                                value={currentPracticeCard.stars || 0}
                                onChange={(val) => handleUpdateStars(currentPracticeCard, val)}
                                size="sm"
                              />
                            </div>

                            <span className="text-[11px] text-gray-400">
                              {currentPracticeCard.mode === 'search' && 'Word Entry'}
                              {currentPracticeCard.mode === 'compare' && 'Comparison'}
                              {currentPracticeCard.mode === 'explain' && 'Explanation'}
                              {currentPracticeCard.mode === 'translation' && 'Translation'}
                              {currentPracticeCard.mode === 'correction' && 'Correction'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer Controls: Prev, Next, Flip, Progress */}
                    <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-850 bg-gray-50/70 dark:bg-gray-850/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center justify-between w-full">
                        <button
                          type="button"
                          onClick={handlePrevCard}
                          className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <ChevronLeft size={16} />
                          <span className="hidden sm:inline">Previous</span>
                        </button>

                        {/* Keyboard Shortcuts Hint Legend */}
                        <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-400">
                          <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">←</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">→</kbd> Cards</span>
                          <span>•</span>
                          <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">Enter</kbd> / <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">Space</kbd> Flip</span>
                          <span>•</span>
                          <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">↓</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">↑</kbd> or <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">A</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">D</kbd> Spreads</span>
                          <span>•</span>
                          <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">+</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">-</kbd> Font</span>
                          <span>•</span>
                          <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">F</kbd> Fullscreen</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsFlipped(!isFlipped)}
                            className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw size={14} />
                            <span>{isFlipped ? 'Show Front' : 'Show Answer'}</span>
                            <kbd className="hidden sm:inline font-mono text-[10px] bg-amber-600/60 px-1 rounded">Enter / Space</kbd>
                          </button>

                          <button
                            type="button"
                            onClick={handleNextCard}
                            className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span className="hidden sm:inline">Next</span>
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </>
            )}

            {/* Practice Modals: inside cardContainerRef so they are visible even in native HTML5 Fullscreen */}
            {renderEditTitleModal()}
            {renderEditContentModal()}
            {renderChatModal()}
          </div>
        ) : (
          // ----------------------------------------------------
          // 2B. BROWSE MODE ("Browse is similar to history")
          // ----------------------------------------------------
          <div className="h-full overflow-y-auto p-4 md:p-6 space-y-3">
            <div className="max-w-5xl mx-auto space-y-3">
              {filteredCards.map((card, idx) => {
                const modeCfg = MODE_CONFIG[card.mode] || MODE_CONFIG.search;
                const IconComp = modeCfg.icon;

                return (
                  <div
                    key={`${card.mode}_${card.id}`}
                    className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition-all"
                  >
                    {/* Item Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Mode badge */}
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border shrink-0 ${modeCfg.colorClass}`}>
                          <IconComp size={12} />
                          <span>{modeCfg.shortLabel}</span>
                        </span>

                        {/* Session badge visual clue */}
                        {card.session_id && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 shrink-0" title={`Session: ${card.session_id}`}>
                            <Layers size={11} className="text-amber-500" />
                            <span className="truncate max-w-[120px]">{card.session_id}</span>
                          </span>
                        )}

                        {/* Title with edit button */}
                        <h4 className="font-bold text-base text-gray-900 dark:text-gray-100 truncate" title={card.title}>
                          {card.title}
                        </h4>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingTitleCard(card);
                            setNewTitleText(card.title);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded cursor-pointer shrink-0"
                          title="Edit Title"
                        >
                          <Edit size={13} />
                        </button>

                        {/* Pronunciation Audio */}
                        <button
                          type="button"
                          onClick={() => handlePronounce(card.title, card.language)}
                          className="p-1 text-gray-400 hover:text-amber-500 rounded cursor-pointer shrink-0"
                          title="Listen"
                        >
                          <Volume2 size={14} />
                        </button>
                      </div>

                      {/* Stars system & Color tag side by side */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* 5 Color tags */}
                        <div className="flex items-center gap-1">
                          {colors.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleUpdateColor(card, c.id)}
                              className={`w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 cursor-pointer ${card.color === c.id ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-gray-900 scale-110' : 'opacity-50 hover:opacity-100'}`}
                              style={{ backgroundColor: c.hex }}
                              title={c.label}
                            />
                          ))}
                        </div>

                        <span className="text-gray-200 dark:text-gray-700">|</span>

                        {/* 1 to 5 Star Rating */}
                        <StarRating
                          value={card.stars || 0}
                          onChange={(stars) => handleUpdateStars(card, stars)}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Content Preview (first output) */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-xs text-gray-700 dark:text-gray-300 font-sans max-h-36 overflow-y-auto markdown-body leading-relaxed border border-gray-100 dark:border-gray-800/80 mb-3">
                      {card.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {card.content}
                        </ReactMarkdown>
                      ) : (
                        <span className="italic text-gray-400">No output content available.</span>
                      )}
                    </div>

                    {/* Actions Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-800/60">
                      <div className="flex items-center gap-2 text-gray-400">
                        <span>{card.updated_at ? new Date(card.updated_at).toLocaleDateString() : 'Recent'}</span>
                        {card.chat_count > 1 && (
                          <span className="text-blue-600 dark:text-blue-400">
                            • {card.chat_count} chat messages
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Edit Content Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContentCard(card);
                            setNewContentText(card.content || '');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors cursor-pointer"
                        >
                          <Edit3 size={12} />
                          <span>Edit Content</span>
                        </button>

                        {/* Open Chat Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenChat(card)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 font-semibold transition-colors cursor-pointer"
                        >
                          <MessageSquare size={12} />
                          <span>Open Chat</span>
                        </button>

                        {/* Practice from here */}
                        <button
                          type="button"
                          onClick={() => {
                            const indexInFiltered = filteredCards.findIndex(c => c.id === card.id && c.mode === card.mode);
                            if (indexInFiltered !== -1) {
                              setCurrentIndex(indexInFiltered);
                            }
                            setViewMode('practice');
                            setIsFlipped(false);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-bold transition-all shadow-xs cursor-pointer"
                        >
                          <Play size={12} className="fill-current" />
                          <span>Practice</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modals for non-practice views (e.g. Browse Mode) */}
      {viewMode !== 'practice' && (
        <>
          {renderEditTitleModal()}
          {renderEditContentModal()}
          {renderChatModal()}
        </>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 4: DELETE SESSION (KEEP ITEMS vs ALL) */}
      {/* ---------------------------------------------------- */}
      {renderDeleteSessionModal()}
    </div>
  );
}

