// AI Dict - Speech Engine Utility
// Supports natural pronunciation, slow pronunciation, and letter-by-letter spelling,
// accurately matching the predefined profile or word language.

const LANG_MAPPINGS = [
  { patterns: ['de', 'ger', 'deutsch', 'allemand', 'tedesco', '🇩🇪', '🇦🇹', '🇨🇭'], code: 'de-DE', label: 'German' },
  { patterns: ['en', 'eng', 'english', 'englisch', 'anglais', 'ingles', '🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺'], code: 'en-US', label: 'English' },
  { patterns: ['fr', 'fre', 'fra', 'french', 'französisch', 'français', 'francais', '🇫🇷'], code: 'fr-FR', label: 'French' },
  { patterns: ['es', 'spa', 'spanish', 'spanisch', 'español', 'espanol', '🇪🇸', '🇲🇽'], code: 'es-ES', label: 'Spanish' },
  { patterns: ['it', 'ita', 'italian', 'italienisch', 'italiano', '🇮🇹'], code: 'it-IT', label: 'Italian' },
  { patterns: ['pt', 'por', 'portuguese', 'portugiesisch', 'português', 'portugues', '🇵🇹', '🇧🇷'], code: 'pt-PT', label: 'Portuguese' },
  { patterns: ['ru', 'rus', 'russian', 'russisch', 'русский', '🇷🇺'], code: 'ru-RU', label: 'Russian' },
  { patterns: ['zh', 'chi', 'zho', 'chinese', 'chinesisch', '中文', '汉语', '漢語', '🇨🇳', '🇹🇼'], code: 'zh-CN', label: 'Chinese' },
  { patterns: ['ja', 'jpn', 'jp', 'japanese', 'japanisch', '日本語', '🇯🇵'], code: 'ja-JP', label: 'Japanese' },
  { patterns: ['ko', 'kor', 'korean', 'koreanisch', '한국어', '🇰🇷'], code: 'ko-KR', label: 'Korean' },
  { patterns: ['vi', 'vie', 'vietnamese', 'vietnamesisch', 'tiếng việt', 'tieng viet', '🇻🇳'], code: 'vi-VN', label: 'Vietnamese' },
  { patterns: ['nl', 'dut', 'nld', 'dutch', 'niederländisch', 'nederlands', '🇳🇱'], code: 'nl-NL', label: 'Dutch' },
  { patterns: ['pl', 'pol', 'polish', 'polnisch', 'polski', '🇵🇱'], code: 'pl-PL', label: 'Polish' },
  { patterns: ['tr', 'tur', 'turkish', 'türkisch', 'türkçe', 'turkce', '🇹🇷'], code: 'tr-TR', label: 'Turkish' },
  { patterns: ['ar', 'ara', 'arabic', 'arabisch', 'العربية', '🇸🇦', '🇪🇬'], code: 'ar-SA', label: 'Arabic' },
  { patterns: ['sv', 'swe', 'swedish', 'schwedisch', 'svenska', '🇸🇪'], code: 'sv-SE', label: 'Swedish' },
  { patterns: ['no', 'nor', 'norwegian', 'norwegisch', 'norsk', '🇳🇴'], code: 'no-NO', label: 'Norwegian' },
  { patterns: ['da', 'dan', 'danish', 'dänisch', 'dansk', '🇩🇰'], code: 'da-DK', label: 'Danish' },
  { patterns: ['fi', 'fin', 'finnish', 'finnisch', 'suomi', '🇫🇮'], code: 'fi-FI', label: 'Finnish' },
  { patterns: ['cs', 'cze', 'ces', 'czech', 'tschechisch', 'čeština', 'cestina', '🇨🇿'], code: 'cs-CZ', label: 'Czech' },
  { patterns: ['el', 'gre', 'ell', 'greek', 'griechisch', 'ελληνικά', '🇬🇷'], code: 'el-GR', label: 'Greek' },
  { patterns: ['hi', 'hin', 'hindi', 'हिन्दी', '🇮🇳'], code: 'hi-IN', label: 'Hindi' },
  { patterns: ['th', 'tha', 'thai', 'ไทย', '🇹🇭'], code: 'th-TH', label: 'Thai' },
  { patterns: ['la', 'lat', 'latin', 'latein', 'latina'], code: 'la', label: 'Latin' }
];

export function resolveSpeechLanguage({ wordLang, profileLang, profileName }) {
  const candidates = [wordLang, profileLang, profileName].filter(Boolean);
  for (const candidate of candidates) {
    const s = String(candidate).toLowerCase().trim();
    if (!s || s === 'auto' || s.includes('🌐') || s === 'unknown') continue;

    for (const mapping of LANG_MAPPINGS) {
      if (mapping.patterns.some(p => s.includes(p))) {
        return { code: mapping.code, label: mapping.label };
      }
    }
  }

  return { code: 'en-US', label: 'English' };
}

let activeAudioEl = null;
let audioCtx = null;
let activeSource = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function playAudioBuffer(arrayBuffer, rate = 1.0, { onStart, onEnd, onError } = {}) {
  try {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('Web Audio API not available');
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = rate || 1.0;
    source.connect(ctx.destination);
    activeSource = source;

    source.onended = () => {
      if (activeSource === source) {
        activeSource = null;
      }
      if (onEnd) onEnd();
    };

    if (onStart) onStart();
    source.start(0);
    return true;
  } catch (err) {
    if (onError) onError(err);
    return false;
  }
}

export function stopSpeech() {
  if (activeSource) {
    try {
      activeSource.stop();
      activeSource.disconnect();
    } catch (e) {}
    activeSource = null;
  }
  if (activeAudioEl) {
    try {
      activeAudioEl.pause();
      activeAudioEl.currentTime = 0;
    } catch (e) {}
    activeAudioEl = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
}

/**
 * Speak text in natural or slow pronunciation mode.
 * Primary: Uses backend /api/tts + Web Audio API (immune to Brave Shields and Firefox speech-dispatcher issues)
 * Fallback: Web Speech API (speechSynthesis) or direct HTML5 Audio
 * @param {string} text - Word or phrase to speak
 * @param {object} options - { mode: 'pronounce'|'slow', lang: 'de-DE', onStart, onEnd, onError }
 */
export async function speakText(text, options = {}) {
  const {
    mode = 'pronounce',
    lang = 'en-US',
    onStart,
    onEnd,
    onError
  } = options;

  stopSpeech();

  if (!text || !text.trim()) {
    if (onEnd) onEnd();
    return;
  }

  const textToSpeak = text.trim();
  const speechRate = mode === 'slow' ? 0.65 : 1.0;
  let cleanLang = (lang || 'en').trim().toLowerCase();
  if (cleanLang.includes('-') && !cleanLang.startsWith('zh')) {
    cleanLang = cleanLang.split('-')[0];
  }
  if (!cleanLang || cleanLang === 'auto' || cleanLang === 'unknown') {
    cleanLang = 'en';
  }

  // 1. Try local backend TTS (/api/tts?format=base64...) via Web Audio API
  // This is same-origin, 100% reliable in Brave (no shield blocking) and Firefox (no speech-dispatcher needed)
  try {
    const res = await fetch(`/api/tts?format=base64&text=${encodeURIComponent(textToSpeak.slice(0, 200))}&lang=${encodeURIComponent(cleanLang)}`);
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.audio_base64) {
          const arrayBuf = base64ToArrayBuffer(data.audio_base64);
          const played = await playAudioBuffer(arrayBuf, speechRate, { onStart, onEnd, onError });
          if (played) return;
        }
      }
    }
  } catch (err) {
    console.warn('Backend TTS call failed, falling back to Web Speech API:', err);
  }

  // 2. Fallback to Web Speech API
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = lang;
      utterance.rate = speechRate;
      utterance.pitch = 1.0;

      // Match native voice if available
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const langPrefix = lang.slice(0, 2).toLowerCase();
        const bestVoice = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase()) ||
                          voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
        if (bestVoice) {
          utterance.voice = bestVoice;
        }
      }

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        playFallbackAudio(textToSpeak, lang, { onStart, onEnd, onError });
      };

      window.speechSynthesis.speak(utterance);
      return;
    } catch (err) {
      console.warn('SpeechSynthesis error, using fallback audio:', err);
    }
  }

  // 3. Fallback to Google TTS Audio
  playFallbackAudio(textToSpeak, lang, { onStart, onEnd, onError });
}

function playFallbackAudio(text, lang, { onStart, onEnd, onError }) {
  try {
    const langCode = (lang || 'en-US').slice(0, 2).toLowerCase();
    const encoded = encodeURIComponent(text.slice(0, 100));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langCode}&q=${encoded}`;

    const audio = new Audio(url);
    activeAudioEl = audio;

    audio.onplay = () => {
      if (onStart) onStart();
    };

    audio.onended = () => {
      activeAudioEl = null;
      if (onEnd) onEnd();
    };

    audio.onerror = (e) => {
      activeAudioEl = null;
      if (onError) onError(e);
      if (onEnd) onEnd();
    };

    audio.play().catch(e => {
      activeAudioEl = null;
      if (onError) onError(e);
      if (onEnd) onEnd();
    });
  } catch (e) {
    if (onError) onError(e);
    if (onEnd) onEnd();
  }
}
