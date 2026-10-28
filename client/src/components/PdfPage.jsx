import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Spinner } from './ui.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function PdfPage({ url, pageNumber, zoom, onPageCount }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 650 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask;
    const loadDocument = async () => {
      setLoading(true);
      setError('');
      try {
        loadingTask = pdfjsLib.getDocument({ url, isEvalSupported: false, useSystemFonts: true });
        const document = await loadingTask.promise;
        if (cancelled) return;
        setPdfDocument(document);
        const validPageNumber = Math.max(1, Math.min(pageNumber, document.numPages));
        onPageCount(document.numPages, validPageNumber);
      } catch {
        if (!cancelled) {
          setError('This PDF could not be opened. Try again or download the document.');
          setLoading(false);
        }
      }
    };
    setPdfDocument(null);
    loadDocument();
    return () => {
      cancelled = true;
      setPdfDocument(null);
      loadingTask?.destroy();
    };
  }, [url, onPageCount]);

  useEffect(() => {
    let cancelled = false;
    let renderingTask;
    const render = async () => {
      setLoading(true);
      setError('');
      try {
        const document = pdfDocument;
        if (!document) return;
        const validPageNumber = Math.max(1, Math.min(pageNumber, document.numPages));
        const page = await document.getPage(validPageNumber);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min((containerSize.width - 32) / baseViewport.width, (containerSize.height - 32) / baseViewport.height);
        const scale = Math.max(0.1, fitScale) * zoom / 100;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d', { alpha: false });
        if (!canvas || !context) throw new Error('This browser cannot render PDF pages on a canvas.');
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderingTask = page.render({ canvasContext: context, viewport, transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        await renderingTask.promise;
        if (!cancelled) setLoading(false);
      } catch (cause) {
        if (!cancelled && cause?.name !== 'RenderingCancelledException') {
          setError('This PDF page could not be displayed. Try another page or download the document.');
          setLoading(false);
        }
      }
    };
    render();
    return () => {
      cancelled = true;
      renderingTask?.cancel();
    };
  }, [pdfDocument, pageNumber, zoom, containerSize.width, containerSize.height]);

  return <div ref={containerRef} className="reader-page-scroll relative h-[72dvh] w-full overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2 sm:h-[78dvh]" aria-label={`PDF page ${pageNumber}`}>
    <div className="flex min-h-full min-w-full items-center justify-center"><canvas ref={canvasRef} className="shrink-0" aria-label={`Rendered PDF page ${pageNumber}`} /></div>
    {loading && !error && <div role="status" className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm text-slate-600"><Spinner /><span className="ml-2">Rendering page {pageNumber}…</span></div>}
    {error && <div role="alert" className="absolute inset-x-3 top-3 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">{error}</div>}
  </div>;
}
