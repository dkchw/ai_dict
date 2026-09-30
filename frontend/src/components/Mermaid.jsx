import React, { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';
import { Copy, Check, Maximize2, X, Code, Eye, Download, AlertCircle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function Mermaid({ chart = '', className = '' }) {
  const containerRef = useRef(null);
  const modalContainerRef = useRef(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [themeMode, setThemeMode] = useState('dark');

  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  // Track system or page theme changes
  useEffect(() => {
    function detectTheme() {
      const isDark = document.documentElement.classList.contains('dark') ||
                     document.documentElement.getAttribute('data-theme') !== 'light';
      setThemeMode(isDark ? 'dark' : 'default');
    }

    detectTheme();

    const observer = new MutationObserver(() => {
      detectTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    return () => observer.disconnect();
  }, []);

  // Render diagram with mermaid
  useEffect(() => {
    let isMounted = true;
    const cleanChart = (chart || '').trim();

    if (!cleanChart) {
      setSvg('');
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const renderDiagram = async () => {
      const isDark = themeMode === 'dark';
      const uniqueRenderId = `mermaid-svg-${instanceId}-${Math.random().toString(36).slice(2, 7)}`;

      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: isDark ? 'dark' : 'default',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          logLevel: 'error',
          suppressErrorRendering: true,
          themeVariables: isDark ? {
            darkMode: true,
            background: 'transparent',
            primaryColor: '#3b82f6',
            primaryTextColor: '#f3f4f6',
            primaryBorderColor: '#60a5fa',
            lineColor: '#93c5fd',
            secondaryColor: '#1e293b',
            tertiaryColor: '#0f172a'
          } : {
            darkMode: false,
            background: 'transparent',
            primaryColor: '#2563eb',
            primaryTextColor: '#1f2937',
            primaryBorderColor: '#3b82f6',
            lineColor: '#2563eb',
            secondaryColor: '#f8fafc',
            tertiaryColor: '#e2e8f0'
          }
        });

        const { svg: renderedSvg, bindFunctions } = await mermaid.render(uniqueRenderId, cleanChart);

        // Remove any orphan error elements that mermaid might have attached to body
        const errEl = document.getElementById(`d${uniqueRenderId}`);
        if (errEl) errEl.remove();

        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
          setLoading(false);

          if (bindFunctions && containerRef.current) {
            setTimeout(() => {
              if (containerRef.current) {
                try {
                  bindFunctions(containerRef.current);
                } catch (e) {}
              }
            }, 0);
          }
        }
      } catch (err) {
        // Clean up orphan elements
        const errEl = document.getElementById(`d${uniqueRenderId}`);
        if (errEl) errEl.remove();

        if (isMounted) {
          setError(err?.message || 'Failed to render Mermaid diagram');
          setLoading(false);
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [chart, themeMode, instanceId]);

  // Handle ESC key for modal
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(chart.trim());
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (e) {}
  };

  const handleCopySvg = async () => {
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      setCopiedSvg(true);
      setTimeout(() => setCopiedSvg(false), 2000);
    } catch (e) {}
  };

  const handleDownloadSvg = () => {
    if (!svg) return;
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mermaid-diagram-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {}
  };

  return (
    <div className={`my-4 rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/70 dark:bg-gray-900/60 overflow-hidden shadow-xs transition-all ${className}`}>
      {/* Mermaid Header Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-gray-100/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700/70 text-xs">
        <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[11px]">
            📊
          </span>
          <span className="tracking-wide text-[11.5px] font-semibold text-gray-800 dark:text-gray-200">
            Mermaid Diagram
          </span>
          {error && (
            <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-normal">
              Syntax Error
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle between rendered diagram and source code */}
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors cursor-pointer"
            title={showCode ? 'View rendered diagram' : 'View mermaid source code'}
          >
            {showCode ? <Eye size={13} /> : <Code size={13} />}
            <span className="text-[11px] font-medium">{showCode ? 'Diagram' : 'Code'}</span>
          </button>

          {/* Copy Code */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors cursor-pointer"
            title="Copy mermaid code"
          >
            {copiedCode ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            <span className="text-[11px] font-medium">{copiedCode ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Download SVG */}
          {svg && !error && !showCode && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors cursor-pointer"
              title="Download diagram as SVG"
            >
              <Download size={13} />
              <span className="text-[11px] font-medium hidden sm:inline">SVG</span>
            </button>
          )}

          {/* Expand / Modal */}
          {svg && !error && !showCode && (
            <button
              type="button"
              onClick={() => {
                setZoomScale(1);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors cursor-pointer"
              title="View full size diagram"
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 overflow-x-auto min-h-[90px] flex items-center justify-center">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-gray-400 dark:text-gray-500 text-xs">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Rendering diagram...</span>
          </div>
        ) : showCode ? (
          <pre className="w-full text-xs font-mono p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto selection:bg-blue-600">
            <code>{chart.trim()}</code>
          </pre>
        ) : error ? (
          <div className="w-full flex flex-col gap-2.5">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
              <div className="flex-1">
                <div className="font-semibold mb-0.5">Could not render Mermaid diagram</div>
                <div className="opacity-80 font-mono text-[11px] break-all">{error}</div>
              </div>
            </div>
            <pre className="w-full text-xs font-mono p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto selection:bg-blue-600">
              <code>{chart.trim()}</code>
            </pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full flex justify-center items-center select-text [&>svg]:max-w-full [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {/* Fullscreen / Enlarged Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl max-h-[92vh] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-850/80">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                <span>📊</span>
                <span>Mermaid Diagram Preview</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Zoom Controls */}
                <div className="flex items-center bg-gray-200/80 dark:bg-gray-800 rounded-lg p-0.5 mr-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setZoomScale(prev => Math.max(0.4, prev - 0.2))}
                    className="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="px-2 font-mono text-[11px] font-semibold text-gray-600 dark:text-gray-400">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomScale(prev => Math.min(3, prev + 0.2))}
                    className="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 cursor-pointer border-l border-gray-300 dark:border-gray-700 ml-0.5"
                    title="Reset Zoom (100%)"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>

                {/* Copy SVG */}
                <button
                  type="button"
                  onClick={handleCopySvg}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer transition-colors"
                  title="Copy SVG to clipboard"
                >
                  {copiedSvg ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  <span>{copiedSvg ? 'Copied' : 'Copy SVG'}</span>
                </button>

                {/* Download SVG */}
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 cursor-pointer transition-colors"
                  title="Download SVG file"
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg cursor-pointer transition-colors ml-1"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body with Zoom */}
            <div
              ref={modalContainerRef}
              className="p-8 overflow-auto flex-1 flex items-center justify-center min-h-[360px] bg-gray-50/50 dark:bg-gray-950/50"
            >
              <div
                style={{
                  transform: `scale(${zoomScale})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out'
                }}
                className="w-full flex justify-center items-center [&>svg]:max-w-none [&>svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
