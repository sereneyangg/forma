'use client';

import { useEffect, useId, useState, type RefObject } from 'react';
import { ArrowRight, Check, CheckCheck, Eye, Layers2, Pencil, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_ALIGNMENT, type Alignment, type DrawingAction, type Guidance } from '@/lib/guidance';

export type GuideView = 'guide' | 'original' | 'reference';
const colorFor = (kind: DrawingAction['kind']) => kind === 'lift' ? '#b87729' : '#39745c';

function Marks({ action, id, preview = false }: { action: DrawingAction; id: string; preview?: boolean }) {
  const color = colorFor(action.kind);
  if (action.kind === 'edge') return <path d={action.path} fill="none" stroke={preview ? '#3f493e' : color} strokeWidth={preview ? 3 : 4} strokeLinecap="round" strokeLinejoin="round" />;
  return <>
    <defs><pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)"><path d="M0 0V18" stroke={preview ? '#495845' : color} strokeWidth="3" opacity={preview ? .45 : .7} /></pattern></defs>
    <path d={action.path} fill={action.kind === 'lift' ? preview ? '#fffbed' : '#d99e4238' : `url(#${id})`} opacity={action.kind === 'lift' && preview ? .58 : 1} />
    {!preview && <path d={action.path} fill={action.kind === 'lift' ? 'none' : '#65a78220'} stroke={color} strokeWidth=".6" />}
  </>;
}

export function GuideOverlay({ guidance, selected, view, opacity, completed, container, onSelect }: {
  guidance: Guidance; selected?: DrawingAction; view: GuideView; opacity: number; completed: string[];
  container: RefObject<HTMLDivElement | null>; onSelect: (id: string) => void;
}) {
  const [rect, setRect] = useState({ width: 0, height: 0 });
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setRect({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setRect({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [container]);
  const ratio = guidance.width / guidance.height;
  const width = Math.min(rect.width, rect.height * ratio), height = width / ratio;
  if (!width || view === 'original') return null;
  const a = guidance.alignment;
  return <div className="guide-layer" style={{ width, height, left: (rect.width - width) / 2, top: (rect.height - height) / 2 }}>
    <svg className="guide-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      {view === 'reference' && guidance.reference && <image href={guidance.reference} x="0" y="0" width="1000" height="1000" preserveAspectRatio="none" opacity={opacity} transform={`translate(${a.x * 1000 + (1 - a.scale) * 500},${a.y * 1000 + (1 - a.scale) * 500}) scale(${a.scale})`} />}
      {view === 'guide' && selected && !completed.includes(selected.id) && <><Marks action={selected} id={`${id}-main`} /><rect x={selected.bounds.x * 1000} y={selected.bounds.y * 1000} width={selected.bounds.w * 1000} height={selected.bounds.h * 1000} rx="15" fill="none" stroke={colorFor(selected.kind)} strokeWidth="2" strokeDasharray="9 9" opacity=".75" /></>}
    </svg>
    {view === 'guide' && guidance.actions.map((action, index) => <button key={action.id} className={`guide-pin ${selected?.id === action.id ? 'active' : ''} ${completed.includes(action.id) ? 'done' : ''}`} style={{ left: `${action.pin.x * 100}%`, top: `${action.pin.y * 100}%`, '--pin-color': colorFor(action.kind) } as React.CSSProperties} aria-label={`Show edit ${index + 1}: ${action.title} at ${action.location}`} aria-pressed={selected?.id === action.id} onClick={() => onSelect(action.id)}>{completed.includes(action.id) ? <Check size={13} /> : index + 1}</button>)}
  </div>;
}

export function GuideControls({ view, setView, hasReference, opacity, setOpacity }: {
  view: GuideView; setView: (view: GuideView) => void; hasReference: boolean;
  opacity: number; setOpacity: (value: number) => void;
}) {
  return <div className="guide-controls"><div className="guide-switch" role="group" aria-label="Drawing view"><button aria-pressed={view === 'guide'} className={view === 'guide' ? 'active' : ''} onClick={() => setView('guide')}><Pencil size={13} />Show edits</button><button aria-pressed={view === 'original'} className={view === 'original' ? 'active' : ''} onClick={() => setView('original')}><Eye size={13} />Original</button>{hasReference && <button aria-pressed={view === 'reference'} className={view === 'reference' ? 'active' : ''} onClick={() => setView('reference')}><Layers2 size={13} />Reference</button>}</div>{view === 'reference' ? <label className="opacity-control">Opacity <input aria-label="Reference overlay opacity" type="range" min="0" max="100" value={Math.round(opacity * 100)} onChange={e => setOpacity(+e.target.value / 100)} /><span>{Math.round(opacity * 100)}%</span></label> : <span className="guide-caption"><span className="legend-dot" />Tap a number to see the next mark.</span>}</div>;
}

export function ActionList({ guidance, selected, completed, onSelect, onComplete }: {
  guidance: Guidance; selected?: DrawingAction; completed: string[]; onSelect: (id: string) => void; onComplete: (id: string) => void;
}) {
  return <div className="action-list"><div className="action-progress"><span>{guidance.reference ? 'FOLLOW YOUR REFERENCE' : 'TECHNIQUE EXERCISE'}</span><span>{guidance.actions.filter(a => completed.includes(a.id)).length} / {guidance.actions.length} tried</span></div>{guidance.actions.map((action, index) => <article className={`action-card ${selected?.id === action.id ? 'selected' : ''} ${completed.includes(action.id) ? 'completed' : ''}`} key={action.id}><button className="action-select" onClick={() => onSelect(action.id)} aria-pressed={selected?.id === action.id}><span className="action-number" style={{ background: colorFor(action.kind) }}>{index + 1}</span><span><span className="action-location">{action.location} · {action.kind === 'edge' ? 'contour' : action.kind === 'shade' ? 'add tone' : action.kind === 'lift' ? 'lighten' : 'blend'}</span><strong>{action.title}</strong></span></button><p>{action.evidence}</p><div className="action-bottom"><button className="show-edit" onClick={() => onSelect(action.id)}>{selected?.id === action.id ? 'Showing on drawing' : 'Show me'}<ArrowRight size={13} /></button><button className="tried-button" aria-pressed={completed.includes(action.id)} onClick={() => onComplete(action.id)}>{completed.includes(action.id) ? <CheckCheck size={13} /> : <Check size={13} />}{completed.includes(action.id) ? 'Tried it' : 'Mark tried'}</button></div></article>)}{guidance.actions.length === 0 && <p className="guidance-empty">{guidance.message}</p>}<p className="guide-disclosure">{guidance.reference ? 'Guide marks show image differences, not a grade. Match the reference framing before changing your drawing.' : 'These are optional exercises. A reference is needed to locate missing shapes or details.'}</p></div>;
}

function DetailImage({ guidance, action, kind }: { guidance: Guidance; action: DrawingAction; kind: 'original' | 'reference' | 'guide' }) {
  const id = useId().replace(/:/g, '');
  const box = action.bounds;
  const x = Math.max(0, box.x - .055), y = Math.max(0, box.y - .055);
  const w = Math.min(1 - x, Math.max(.18, box.w + .11)), h = Math.min(1 - y, Math.max(.18, box.h + .11));
  const a = guidance.alignment;
  return <svg className="detail-image" role="img" aria-label={kind === 'reference' ? 'Reference detail in the selected region' : kind === 'guide' ? 'Illustration of suggested marks over your drawing' : 'Your original drawing in the selected region'} viewBox={`${x * 1000} ${y * 1000} ${w * 1000} ${h * 1000}`} preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="1000" height="1000" fill="#fffdf8" />
    <image href={kind === 'reference' ? guidance.reference : guidance.source} width="1000" height="1000" preserveAspectRatio="none" transform={kind === 'reference' ? `translate(${a.x * 1000 + (1 - a.scale) * 500},${a.y * 1000 + (1 - a.scale) * 500}) scale(${a.scale})` : undefined} />
    {kind === 'guide' && <Marks action={action} id={`${id}-detail`} preview />}
  </svg>;
}

export function FocusLesson({ guidance, action, completed, onComplete }: { guidance: Guidance; action?: DrawingAction; completed: string[]; onComplete: (id: string) => void }) {
  if (!action) return null;
  const index = guidance.actions.indexOf(action);
  return <section className="focus-lesson" aria-label="Step-by-step drawing lesson"><div className="lesson-header"><div><span className="eyebrow">LET’S WORK ON EDIT {index + 1}</span><h3>{action.title}<span> · {action.location}</span></h3></div><Pencil size={19} /></div><div className={`detail-strip ${guidance.reference ? 'three-up' : ''}`}><figure><DetailImage guidance={guidance} action={action} kind="original" /><figcaption>Your drawing</figcaption></figure>{guidance.reference && <figure><DetailImage guidance={guidance} action={action} kind="reference" /><figcaption>Reference detail</figcaption></figure>}<figure className="suggested-detail"><DetailImage guidance={guidance} action={action} kind="guide" /><figcaption>Marks to try <span>illustration</span></figcaption></figure></div><p className="lesson-tool"><Pencil size={13} />{action.tool}</p><ol className="lesson-steps">{action.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol><div className="lesson-footer"><span>Guide marks only. Your original stays unchanged.</span><button onClick={() => onComplete(action.id)} className="button primary"><Check size={14} />{completed.includes(action.id) ? 'Tried — undo check' : 'I tried this edit'}</button></div></section>;
}

export function AlignmentControls({ value, onChange, onApply, onCancel, busy }: { value: Alignment; onChange: (value: Alignment) => void; onApply: () => void; onCancel: () => void; busy: boolean }) {
  return <div className="alignment-controls"><div><h3><SlidersHorizontal size={15} />Line up your reference</h3><button aria-label="Close reference alignment" onClick={onCancel}><X size={16} /></button></div><p>Use the overlay to match the subject’s position and size. Start with photos cropped to the same area.</p><div className="alignment-sliders">{(['x', 'y', 'scale'] as const).map(key => <label key={key}>{key === 'x' ? 'Left / right' : key === 'y' ? 'Up / down' : 'Size'}<input type="range" aria-label={`Reference ${key === 'x' ? 'horizontal position' : key === 'y' ? 'vertical position' : 'scale'}`} min={key === 'scale' ? 50 : -35} max={key === 'scale' ? 160 : 35} value={Math.round(value[key] * 100)} onChange={e => onChange({ ...value, [key]: +e.target.value / 100 })} /><output>{Math.round(value[key] * 100)}%</output></label>)}</div><div className="alignment-buttons"><button className="text-button" onClick={() => onChange(DEFAULT_ALIGNMENT)}><RotateCcw size={13} />Reset</button><button className="button primary" onClick={onApply} disabled={busy}>{busy ? 'Comparing…' : 'Apply & update guides'}<ArrowRight size={14} /></button></div></div>;
}
