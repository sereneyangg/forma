'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Camera, Check, CheckCheck, CircleHelp, Focus, Grid2X2, ImagePlus, Leaf, LoaderCircle, Maximize2, Pause, Play, Plus, ScanLine, ShieldCheck, Sparkles, Square, Upload, Video, X } from 'lucide-react';
import { readUpload } from '@/lib/analysis';
import { analyzeDrawing, DEFAULT_ALIGNMENT, type Alignment, type GuidedReview } from '@/lib/guidance';
import { ActionList, AlignmentControls, FocusLesson, GuideControls, GuideOverlay, type GuideView } from '@/components/visual-guide';

type Mode = 'live' | 'review';
const FILE_TYPES = 'image/jpeg,image/png,image/webp';

function Brand() {
  return <a className="brand" href="/" aria-label="Forma home"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M5 29 17 6M15 30 27 7M7 21h22M25 29l8-16" /></svg><span>forma<span className="brand-dot">.</span></span></a>;
}

export default function Studio() {
  const [mode, setMode] = useState<Mode>('live');
  const [reference, setReference] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState('');
  const [drawing, setDrawing] = useState<string | null>(null);
  const [drawingName, setDrawingName] = useState('');
  const [liveReview, setLiveReview] = useState<GuidedReview | null>(null);
  const [finishedReview, setFinishedReview] = useState<GuidedReview | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [grid, setGrid] = useState(false);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saved, setSaved] = useState(false);
  const [guideView, setGuideView] = useState<GuideView>('guide');
  const [guideOpacity, setGuideOpacity] = useState(.4);
  const [selectedId, setSelectedId] = useState('');
  const [completedEdits, setCompletedEdits] = useState<string[]>([]);
  const [alignment, setAlignment] = useState<Alignment>(DEFAULT_ALIGNMENT);
  const [alignmentDraft, setAlignmentDraft] = useState<Alignment>(DEFAULT_ALIGNMENT);
  const [aligning, setAligning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const uploadRequest = useRef(0);
  const reviewRequest = useRef(0);
  const drawingInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const cameraPanel = useRef<HTMLDivElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const activeReview = mode === 'live' ? liveReview : finishedReview;
  const isSample = drawing === '/sample-drawing.svg';
  const guidance = activeReview?.guidance;
  const selectedAction = guidance?.actions.find(action => action.id === selectedId) ?? guidance?.actions[0];
  const selectEdit = (id: string) => {
    setSelectedId(id); setGuideView('guide'); setAligning(false);
    if (mode === 'live' && cameraOn) setPaused(true);
  };
  const toggleEdit = (id: string) => setCompletedEdits(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]);

  const stopCamera = useCallback(() => {
    cameraRequest.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraOn(false); setCameraPending(false); setPaused(false);
  }, []);

  useEffect(() => () => {
    cameraRequest.current++;
    reviewRequest.current++;
    uploadRequest.current++;
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (!cameraOn || paused) return;
    const timer = setInterval(() => { if (!document.hidden) setSeconds(s => s + 1); }, 1000);
    return () => clearInterval(timer);
  }, [cameraOn, paused]);

  useEffect(() => {
    if (!cameraOn || paused || !reference || mode !== 'live') return;
    let cancelled = false;
    let busy = false;
    const update = async () => {
      if (busy || document.hidden || !video.current || video.current.readyState < 2) return;
      busy = true;
      try {
        const canvas = document.createElement('canvas');
        const v = video.current;
        canvas.width = 640;
        canvas.height = Math.max(2, Math.round(640 * v.videoHeight / v.videoWidth));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Camera analysis is unavailable in this browser.');
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const review = await analyzeDrawing(canvas.toDataURL('image/jpeg', .8), reference, alignment);
        if (!cancelled) setLiveReview(review);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not read this camera frame.');
      } finally { busy = false; }
    };
    const first = setTimeout(update, 800);
    const timer = setInterval(update, 4500);
    return () => { cancelled = true; clearTimeout(first); clearInterval(timer); };
  }, [cameraOn, paused, reference, mode, alignment]);

  const changeMode = (next: Mode) => {
    if (mode === next) return;
    reviewRequest.current++; setAnalyzing(false);
    setAlignment((next === 'live' ? liveReview : finishedReview)?.guidance.alignment ?? DEFAULT_ALIGNMENT);
    stopCamera(); setMode(next); setError(''); setAligning(false); setSelectedId(''); setCompletedEdits([]); setGuideView('guide');
  };

  const startCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs a supported browser on HTTPS or localhost. You can still upload a drawing in Finished review.');
      return;
    }
    const request = ++cameraRequest.current;
    setLiveReview(null); setSelectedId(''); setCompletedEdits([]);
    setCameraPending(true);
    let incoming: MediaStream | null = null;
    try {
      incoming = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
      if (request !== cameraRequest.current) { incoming.getTracks().forEach(t => t.stop()); return; }
      stream.current = incoming;
      if (!video.current) { stopCamera(); return; }
      video.current.srcObject = incoming;
      await video.current.play();
      if (request !== cameraRequest.current) return;
      incoming.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (stream.current !== incoming) return;
          stopCamera(); setError('Your camera disconnected. Reconnect it and try again.');
        };
      });
      setCameraOn(true); setPaused(false); setSeconds(0);
    } catch (e) {
      incoming?.getTracks().forEach(t => t.stop());
      if (request !== cameraRequest.current) return;
      stream.current = null;
      const name = e instanceof DOMException ? e.name : '';
      setError(name === 'NotAllowedError' ? 'Camera permission was not granted. Allow camera access in your browser settings, then try again. You can also use Finished review.' : name === 'NotFoundError' ? 'No camera was found. Connect a camera or upload your work in Finished review.' : name === 'NotReadableError' ? 'Your camera may be in use by another app. Close that app and try again.' : 'The camera could not start. Try again or use Finished review.');
    } finally { if (request === cameraRequest.current) setCameraPending(false); }
  };

  const invalidateReviews = () => {
    reviewRequest.current++;
    setAnalyzing(false); setLiveReview(null); setFinishedReview(null); setSaved(false);
    setSelectedId(''); setCompletedEdits([]); setGuideView('guide'); setAligning(false);
    setAlignment(DEFAULT_ALIGNMENT); setAlignmentDraft(DEFAULT_ALIGNMENT);
  };

  const upload = async (file: File | undefined, target: 'reference' | 'drawing') => {
    if (!file) return;
    const request = ++uploadRequest.current;
    setError(''); setUploading(true);
    try {
      const src = await readUpload(file);
      if (request !== uploadRequest.current) return;
      if (target === 'reference') { setReference(src); setReferenceName(file.name); }
      else { setDrawing(src); setDrawingName(file.name); }
      invalidateReviews();
    } catch (e) { if (request === uploadRequest.current) setError(e instanceof Error ? e.message : 'Unable to open the image.'); }
    finally { if (request === uploadRequest.current) setUploading(false); }
  };

  const reviewDrawing = async (src = drawing, ref = reference, placement = alignment) => {
    if (!src) return;
    const request = ++reviewRequest.current;
    setAnalyzing(true); setError(''); setSaved(false);
    try {
      const review = await analyzeDrawing(src, ref, placement);
      if (request === reviewRequest.current) { setFinishedReview(review); setGuideView('guide'); setCompletedEdits([]); }
    } catch (e) { if (request === reviewRequest.current) setError(e instanceof Error ? e.message : 'Unable to review this drawing.'); }
    finally { if (request === reviewRequest.current) setAnalyzing(false); }
  };

  const trySample = async () => {
    uploadRequest.current++; setUploading(false);
    stopCamera(); invalidateReviews(); setMode('review'); setError('');
    setDrawing('/sample-drawing.svg'); setDrawingName('Pear study · sample drawing');
    setReference('/sample-reference.svg'); setReferenceName('Pear · sample illustration');
    await reviewDrawing('/sample-drawing.svg', '/sample-reference.svg', DEFAULT_ALIGNMENT);
  };

  const beginAlignment = () => {
    setAlignmentDraft(alignment); setAligning(true); setGuideView('reference');
    if (mode === 'live' && cameraOn) setPaused(true);
  };
  const applyAlignment = async () => {
    if (!guidance || !reference) return;
    const request = ++reviewRequest.current;
    setAnalyzing(true); setError('');
    try {
      const review = await analyzeDrawing(guidance.source, reference, alignmentDraft);
      if (request !== reviewRequest.current) return;
      setAlignment(alignmentDraft);
      if (mode === 'live') setLiveReview(review); else setFinishedReview(review);
      setSelectedId(''); setCompletedEdits([]); setAligning(false); setGuideView('guide');
    } catch (e) { if (request === reviewRequest.current) setError(e instanceof Error ? e.message : 'Could not update the guides.'); }
    finally { if (request === reviewRequest.current) setAnalyzing(false); }
  };

  const saveNotes = () => {
    if (!activeReview) return;
    const content = ['FORMA — DRAWING NOTES', new Date(activeReview.createdAt).toLocaleString(), '', activeReview.summary, '', ...activeReview.guidance.actions.flatMap((action, index) => [`EDIT ${index + 1}: ${action.title} — ${action.location}`, action.evidence, `Tool: ${action.tool}`, ...action.steps.map((step, i) => `${i + 1}. ${step}`), '']), ...activeReview.notes.flatMap(n => [`${n.area.toUpperCase()} — ${n.title}`, n.body, '']), 'TRY THIS NEXT', activeReview.exercise, '', 'About this feedback: browser-based measurements of tonal range and dark-mark placement. It does not judge subject likeness, anatomy, perspective, or artistic quality. Camera lighting, background, and framing affect results.'].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'forma-drawing-notes.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
  };

  const removeReference = () => { setReference(null); setReferenceName(''); invalidateReviews(); };
  const modeKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const next = e.key === 'Home' ? 'live' : e.key === 'End' ? 'review' : mode === 'live' ? 'review' : 'live';
      changeMode(next); document.getElementById(`tab-${next}`)?.focus();
    }
  };

  return <>
    <header className="site-header"><div className="header-inner"><Brand /><span className="header-tagline">A little guidance. A little growth.</span><button className="help-button" onClick={() => helpDialog.current?.showModal()}><CircleHelp size={17} /><span>How it works</span></button></div></header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span className="tiny-line" /> YOUR PERSONAL DRAWING STUDIO</div><h1>Find your form<span>.</span></h1><p>Make a mark. Get a little perspective. Keep creating.</p></div><div className="intro-note"><svg viewBox="0 0 75 46" aria-hidden="true"><path d="M5 30C14 4 20 1 22 12S15 49 32 32 48 9 52 17 55 32 70 12" /></svg><span>Progress over perfection.</span></div></section>
      <div className="mode-row"><div className="mode-tabs" role="tablist" aria-label="Drawing feedback mode"><button id="tab-live" role="tab" aria-selected={mode === 'live'} aria-controls="studio-panel" tabIndex={mode === 'live' ? 0 : -1} className={mode === 'live' ? 'active' : ''} onClick={() => changeMode('live')} onKeyDown={modeKeyDown}><Video size={17} />Live practice<span className="tab-dot" /></button><button id="tab-review" role="tab" aria-selected={mode === 'review'} aria-controls="studio-panel" tabIndex={mode === 'review' ? 0 : -1} className={mode === 'review' ? 'active' : ''} onClick={() => changeMode('review')} onKeyDown={modeKeyDown}><ScanLine size={17} />Finished review</button></div><span className="mode-description">{mode === 'live' ? 'Feedback as your drawing takes shape.' : 'A fresh look at what you’ve made.'}</span></div>
      {error && <div className="error-banner" role="alert"><CircleHelp size={18} /><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}><X size={17} /></button></div>}
      <section id="studio-panel" role="tabpanel" aria-labelledby={`tab-${mode}`} className="studio-grid">
        <div className="workspace">
          <div className="drawing-card">
            <div className="panel-heading"><div><span className="section-number">01</span><h2>{mode === 'live' ? 'Your workspace' : 'Your drawing'}</h2></div><span className={`status ${cameraOn && !paused && mode === 'live' ? 'live-status' : ''}`}><i />{mode === 'live' ? cameraOn ? paused ? 'Feedback paused' : 'Camera live' : 'Camera off' : drawing ? isSample ? 'Sample study' : 'Ready to review' : 'Ready when you are'}</span></div>
            <div className={`canvas-area ${guidance ? 'has-guides' : ''} ${cameraOn && mode === 'live' ? 'camera-active' : ''} ${drawing && mode === 'review' ? 'has-drawing' : ''} ${dragging ? 'is-dragging' : ''}`} ref={cameraPanel}
              onDragOver={e => { if (mode === 'review') { e.preventDefault(); setDragging(true); } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
              onDrop={e => { e.preventDefault(); setDragging(false); if (mode === 'review') void upload(e.dataTransfer.files[0], 'drawing'); }}>
              {mode === 'live' && <video ref={video} muted playsInline aria-label="Live view of your drawing" className={cameraOn ? 'camera-video visible' : 'camera-video'} />}
              {mode === 'live' && (!cameraOn || paused) && guidance && <img className="paused-frame" src={guidance.source} alt="Paused camera frame used for the visual guides" />}
              {mode === 'review' && drawing && <img className="drawing-preview" src={drawing} alt={isSample ? 'Sample pencil drawing of a pear with hatched shadows' : 'Your uploaded drawing'} />}
              {((mode === 'live' && !cameraOn && !guidance) || (mode === 'review' && !drawing)) && <div className="empty-canvas"><div className="viewfinder"><span /><span /><span /><span />{mode === 'live' ? <Camera size={31} strokeWidth={1.3} /> : <ImagePlus size={31} strokeWidth={1.3} />}</div><h3>{mode === 'live' ? 'A new perspective starts here.' : 'Every drawing has a next step.'}</h3><p>{mode === 'live' ? <>Set your camera above your paper.<br />Let’s see what you’re working on.</> : <>Drop your finished drawing here,<br />and take a moment to look a little closer.</>}</p><button className="button primary" disabled={cameraPending || uploading} onClick={() => mode === 'live' ? void startCamera() : drawingInput.current?.click()}>{cameraPending || uploading ? <LoaderCircle size={17} className="spin" /> : mode === 'live' ? <Video size={17} /> : <Upload size={17} />}{cameraPending ? 'Connecting camera…' : uploading ? 'Opening image…' : mode === 'live' ? 'Enable camera' : 'Upload your drawing'}{!cameraPending && !uploading && <ArrowRight size={16} />}</button><span className="canvas-hint">{mode === 'live' ? 'You’re in control. Turn it off anytime.' : 'JPG, PNG, or WebP · up to 12 MB'}</span>{cameraPending && <button className="text-button" onClick={stopCamera}>Cancel</button>}</div>}
              {grid && ((mode === 'live' && (cameraOn || !!guidance)) || (mode === 'review' && drawing)) && <div className="grid-overlay" aria-hidden="true"><i /><i /><i /><i /></div>}
              {guidance && ((mode === 'live' && (cameraOn || !!guidance)) || (mode === 'review' && drawing)) && <GuideOverlay guidance={aligning ? { ...guidance, alignment: alignmentDraft } : guidance} selected={selectedAction} view={guideView} opacity={guideOpacity} completed={completedEdits} container={cameraPanel} onSelect={selectEdit} />}
              {mode === 'live' && (cameraOn || guidance) && <><div className="live-badge"><span />{!cameraOn ? 'LAST FRAME' : paused ? 'STUDY FRAME' : 'LIVE'}<b>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</b></div><div className="camera-controls">{cameraOn ? <><button className="camera-control" onClick={() => setPaused(p => !p)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Resume live' : 'Study this frame'}</button><button className="camera-control stop-control" onClick={stopCamera}><Square size={13} fill="currentColor" />Stop camera</button></> : <button className="camera-control" disabled={cameraPending} onClick={() => void startCamera()}><Video size={15} />{cameraPending ? 'Connecting…' : 'Restart camera'}</button>}</div>{!reference && <div className="camera-reference-prompt">Add a reference below to start live feedback.</div>}</>}
              {mode === 'review' && drawing && <button className="replace-drawing" onClick={() => drawingInput.current?.click()} disabled={uploading}><Upload size={14} />Replace drawing</button>}
              {!(mode === 'live' && (cameraOn || guidance)) && !(mode === 'review' && drawing) && <><span className="canvas-corner top-left">+</span><span className="canvas-corner top-right">+</span><span className="canvas-corner bottom-left">+</span><span className="canvas-corner bottom-right">+</span></>}
            </div>
            {guidance && <GuideControls view={guideView} setView={view => { setGuideView(view); if (mode === 'live' && cameraOn) setPaused(true); }} hasReference={!!reference} opacity={guideOpacity} setOpacity={setGuideOpacity} />}
            <div className="canvas-toolbar"><span><Focus size={16} />{mode === 'live' ? 'Good light. Full page. Clear view.' : 'A straight-on photo works best.'}</span><div><button className={`icon-button ${grid ? 'selected' : ''}`} aria-label="Toggle composition grid" aria-pressed={grid} title="Composition grid" onClick={() => setGrid(g => !g)} disabled={mode === 'live' ? !cameraOn && !guidance : !drawing}><Grid2X2 size={16} /></button><button className="icon-button" aria-label="View drawing fullscreen" title="Fullscreen" disabled={mode === 'live' ? !cameraOn && !guidance : !drawing} onClick={() => { if (cameraPanel.current?.requestFullscreen) void cameraPanel.current.requestFullscreen().catch(() => setError('Fullscreen is not supported in this view. Try opening the site in your browser.')); else setError('Fullscreen is not supported in this browser.'); }}><Maximize2 size={16} /></button></div></div>
          </div>
          {guidance && reference && <div className="alignment-entry"><span>Guides look out of place?</span><button onClick={beginAlignment}>Align reference <Focus size={13} /></button></div>}
          {aligning && <AlignmentControls value={alignmentDraft} onChange={setAlignmentDraft} onApply={() => void applyAlignment()} onCancel={() => { setAligning(false); setGuideView('guide'); }} busy={analyzing} />}
          <div className="reference-card" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(e.dataTransfer.files[0], 'reference'); }}>
            <button className={`reference-thumbnail ${reference ? 'filled' : ''}`} aria-label={reference ? 'Replace reference image' : 'Upload reference image'} onClick={() => referenceInput.current?.click()} disabled={uploading}>{reference ? <img src={reference} alt="Your reference" /> : <ImagePlus size={23} strokeWidth={1.4} />}</button>
            <div className="reference-copy"><h2>Your reference <span>{mode === 'live' ? 'FOR LIVE FEEDBACK' : 'OPTIONAL'}</span></h2><p>{reference ? referenceName : 'A photo to learn from. A place to begin.'}</p>{reference && <span className="reference-ready"><Check size={12} />Ready for comparison</span>}</div>
            <button className="reference-upload" onClick={() => referenceInput.current?.click()} disabled={uploading}>{reference ? 'Change' : 'Add image'}{reference ? <Upload size={15} /> : <Plus size={16} />}</button>{reference && <button className="icon-button remove-reference" aria-label="Remove reference" onClick={removeReference}><X size={15} /></button>}
          </div>
          {mode === 'review' && drawing && <div className="review-action"><span>{finishedReview ? 'Changed something? Take another look.' : 'Ready for a fresh pair of eyes?'}</span><button className="button primary" onClick={() => void reviewDrawing()} disabled={analyzing || uploading}>{analyzing ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{analyzing ? 'Looking closely…' : finishedReview ? 'Review again' : 'Review my drawing'}<ArrowRight size={16} /></button></div>}
          {guidance && <FocusLesson guidance={guidance} action={selectedAction} completed={completedEdits} onComplete={toggleEdit} />}
          <div className="privacy-note"><ShieldCheck size={14} /><span>Your images stay on your device. Your practice stays yours.</span></div>
        </div>
        <aside className={`feedback-panel ${activeReview ? 'has-feedback' : ''}`} aria-label="Drawing feedback">
          <div className="feedback-heading"><div><span className="sparkle-box"><Sparkles size={16} /></span><h2>Your next edits</h2></div><span className={`feedback-state ${activeReview ? 'ready' : ''}`}>{analyzing ? 'Looking…' : activeReview ? mode === 'live' && cameraOn && !paused ? 'LIVE' : 'YOUR NOTES' : 'STANDING BY'}</span></div>
          {activeReview ? <><div className="review-intro"><span className="eyebrow">{isSample && mode === 'review' ? 'A SAMPLE PEAR STUDY' : mode === 'live' ? 'AS YOU DRAW' : 'YOUR DRAWING, REVISITED'}</span><h3>{activeReview.summary}</h3><p>{mode === 'live' ? cameraOn ? paused ? 'Feedback is paused. Resume when you’re ready.' : 'Tap a numbered mark to freeze the frame and work on that edit.' : 'Your last camera notes. Start the camera to continue.' : guidance?.message ?? 'Choose a marked region to see what to try.'}</p></div><ActionList guidance={activeReview.guidance} selected={selectedAction} completed={completedEdits} onSelect={selectEdit} onComplete={toggleEdit} /><details className="measurement-details"><summary>Image measurements</summary><div className="feedback-notes">{activeReview.notes.map((note, i) => <article className={`feedback-note ${note.kind}`} key={note.area}><div className="note-top"><span>{String(i + 1).padStart(2, '0')} / {note.area}</span>{note.kind === 'positive' ? <CheckCheck size={15} /> : <Focus size={15} />}</div><h4>{note.title}</h4><p>{note.body}</p></article>)}</div></details><div className="next-step"><span><Leaf size={14} />ONE EDIT AT A TIME</span><p>{guidance?.actions.length ? 'Choose a number, try the marks shown, then upload an updated photo or resume the camera to compare again. “Tried” tracks your practice; it does not certify a correction.' : activeReview.exercise}</p></div><div className="review-footer"><button className="text-button" onClick={saveNotes}>{saved ? <Check size={14} /> : <ArrowDownToLine size={14} />}{saved ? 'Notes downloaded' : 'Save your notes'}</button><span>{Math.round(activeReview.stats.range * 100)}% tonal range</span></div><button className="measurement-note" onClick={() => helpDialog.current?.showModal()}><CircleHelp size={12} />How these visual guides work</button></> : <>
            <div className="coach-welcome"><span className="eyebrow">ROOM TO GROW</span><h3>Your next good drawing<br />starts with looking.</h3><p>{mode === 'live' ? 'See where to add a line, build a shadow, or lift a highlight. Every guide comes with a small step to try.' : 'Get numbered marks on your drawing and close-up instructions for each suggested edit.'}</p></div>
            <ol className="setup-steps">{(mode === 'live' ? [{ title: 'Bring a reference', body: 'Upload the image you’d like to draw.', done: !!reference }, { title: 'Find your angle', body: 'Point your camera at your paper.', done: cameraOn }, { title: 'Make your first mark', body: 'Tap a marked area for a visual lesson.', done: false }] : [{ title: 'Share your drawing', body: 'Upload a clear photo of your work.', done: !!drawing }, { title: 'Add a reference, if you like', body: 'See how light and placement compare.', done: !!reference }, { title: 'Look a little closer', body: 'See exactly where to try your next edit.', done: false }]).map((step, i) => <li key={step.title}><span className={`step-number ${step.done ? 'complete' : ''}`}>{step.done ? <Check size={14} /> : String(i + 1).padStart(2, '0')}</span><div><h4>{step.title}</h4><p>{step.body}</p></div></li>)}</ol>
            <div className="sample-card"><div><span className="eyebrow">JUST EXPLORING?</span><h4>Start with a simple study.</h4><button onClick={() => void trySample()}>Try an example <ArrowRight size={14} /></button></div><img src="/sample-drawing.svg" alt="A delicate pencil study of a pear" /></div>
            <div className="coach-bottom"><span className="small-sun">✳</span><span>Small steps make better drawings.</span></div>
          </>}
        </aside>
      </section>
      <footer className="site-footer"><span>MADE FOR THE PROCESS.</span><p>No pressure. Just progress.</p><span>ONE MARK AT A TIME <ArrowRight size={12} /></span></footer>
    </main>
    <input ref={drawingInput} type="file" accept={FILE_TYPES} className="sr-only" tabIndex={-1} aria-label="Choose a drawing image" onChange={e => { void upload(e.target.files?.[0], 'drawing'); e.target.value = ''; }} />
    <input ref={referenceInput} type="file" accept={FILE_TYPES} className="sr-only" tabIndex={-1} aria-label="Choose a reference image" onChange={e => { void upload(e.target.files?.[0], 'reference'); e.target.value = ''; }} />
    <dialog ref={helpDialog} className="help-dialog" onClick={e => { if (e.target === e.currentTarget) helpDialog.current?.close(); }}><div className="dialog-inner"><button className="dialog-close icon-button" aria-label="Close help" onClick={() => helpDialog.current?.close()}><X size={20} /></button><span className="eyebrow">WELCOME TO FORMA</span><h2>A little perspective,<br />at your own pace.</h2><div className="help-item"><Video size={21} /><div><h3>Practice in the moment</h3><p>Add a reference photo, enable your camera, and frame your paper. Guides update approximately every 4.5 seconds. Tap a numbered marker or choose “Study this frame” to freeze the analyzed image while you inspect it. Resume when you are ready for another look.</p></div></div><div className="help-item"><ScanLine size={21} /><div><h3>Revisit a finished drawing</h3><p>Upload a JPG, PNG, or WebP, add an optional reference, then choose “Review my drawing.” Select a numbered edit to see a close-up of your drawing, the reference detail, illustrative pencil or eraser marks, and step-by-step instructions. Use Reference view and Align reference to match the subject placement before making changes. Download your notes to keep the instructions.</p></div></div><div className="honest-note"><h3>What Forma looks at</h3><p>Forma compares local contours and tonal regions with your reference. Green lines suggest an edge to check, green hatching suggests adding tone, and amber patches suggest lifting graphite. These are conditional image-difference guides, not a finished or AI-generated version of your artwork. It works best with dark marks on light paper and matching, straight-on framing.</p><p>Without a reference, Forma offers optional technique exercises on existing marks; it cannot know which objects or details are missing. This local engine does not recognize anatomy, named features, or perspective errors. Camera shadows and backgrounds affect measurements; use the notes as prompts for your own eye.</p></div><div className="help-privacy"><ShieldCheck size={17} /><p>Images and camera frames are processed on your device. Nothing is uploaded or stored. Reloading clears your session.</p></div><button className="button primary" onClick={() => helpDialog.current?.close()}>Let’s make a mark <ArrowRight size={16} /></button></div></dialog>
  </>;
}
