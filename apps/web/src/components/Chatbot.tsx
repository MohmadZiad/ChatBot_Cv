'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Play, Loader2 } from 'lucide-react';
import { type Lang, t } from '@/lib/i18n';
import { cvApi } from '@/services/api/cv';
import { jobsApi } from '@/services/api/jobs';
import { analysesApi, type Analysis } from '@/services/api/analyses';

type Msg = { role: 'bot'|'user'|'sys', text: string };

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>((localStorage.getItem('lang') as Lang) || 'ar');
  const tt = useMemo(()=> (path: string)=> t(lang, path),[lang]);

  useEffect(()=> {
    const onStorage = () => setLang((localStorage.getItem('lang') as Lang) || 'ar');
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: tt('chat.hello') }]);
  const [cvs, setCvs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [cvId, setCvId] = useState('');
  const [jobId, setJobId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);

  useEffect(() => {
    if (!open) return;
    cvApi.list().then(r=>setCvs(r.items)).catch(()=>{});
    jobsApi.list().then(r=>setJobs(r.items)).catch(()=>{});
  }, [open]);

  const run = async () => {
    if (!cvId || !jobId) return;
    setLoading(true);
    setMsgs(m=>[...m, { role:'user', text: `${tt('chat.run')} ▶️` }]);
    try {
      const a = await analysesApi.run({ jobId, cvId });
      setMsgs(m=>[...m, { role:'sys', text: tt('chat.running') }]);
      // جلب النتيجة النهائية
      const fin = await analysesApi.get(a.id);
      setResult(fin);
      setMsgs(m=>[...m, { role:'bot', text: `${tt('chat.done')} • ${tt('chat.score')}: ${fin.score?.toFixed?.(2) ?? '-'}` }]);
    } catch (e:any) {
      setMsgs(m=>[...m, { role:'bot', text: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* زر عائم */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 end-5 z-[60] size-12 rounded-2xl bg-gradient-to-br from-black to-stone-800 text-white grid place-items-center shadow-xl hover:scale-105 transition"
        aria-label="Open Assistant"
      >
        <MessageCircle />
      </button>

      {/* نافذة الشات */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 130, damping: 16 }}
              className="absolute bottom-0 end-0 m-5 w-[min(420px,calc(100vw-2.5rem))] rounded-3xl border border-white/20 bg-white/80 dark:bg-black/70 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10">
                <div className="text-sm font-semibold">{tt('chat.title')}</div>
                <button onClick={()=>setOpen(false)} className="size-8 grid place-items-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10">
                  <X size={18}/>
                </button>
              </div>

              <div className="max-h-[60vh] overflow-auto p-3 space-y-2">
                {msgs.map((m,i)=>(
                  <div key={i} className={
                    m.role==='user' ? 'ms-auto max-w-[85%] rounded-2xl bg-blue-600 text-white px-3 py-2 shadow'
                    : m.role==='sys' ? 'mx-auto max-w-[85%] rounded-2xl bg-black/5 dark:bg-white/10 px-3 py-2 text-xs'
                    : 'me-auto max-w-[85%] rounded-2xl bg-white/70 dark:bg-white/10 px-3 py-2 shadow'
                  }>
                    {m.text}
                  </div>
                ))}

                {/* اختيارات */}
                <div className="space-y-2">
                  <div className="text-xs opacity-70">{tt('chat.pickCv')}</div>
                  <select value={cvId} onChange={e=>setCvId(e.target.value)} className="w-full rounded-xl border px-3 py-2 bg-white/70 dark:bg-white/5">
                    <option value="">{tt('chat.pickCv')}</option>
                    {cvs.map(c=> <option key={c.id} value={c.id}>{c.id.slice(0,10)}…</option>)}
                  </select>

                  <div className="text-xs opacity-70 mt-2">{tt('chat.pickJob')}</div>
                  <select value={jobId} onChange={e=>setJobId(e.target.value)} className="w-full rounded-xl border px-3 py-2 bg-white/70 dark:bg-white/5">
                    <option value="">{tt('chat.pickJob')}</option>
                    {jobs.map(j=> <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>

                  <button
                    onClick={run}
                    disabled={!cvId || !jobId || loading}
                    className="mt-2 inline-flex items-center justify-center gap-2 w-full rounded-2xl bg-black text-white px-4 py-2 hover:opacity-90 disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="animate-spin"/> : <Play size={16}/>}
                    {loading ? tt('chat.running') : tt('chat.run')}
                  </button>
                </div>

                {/* النتيجة */}
                {result && (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded-2xl border p-3 bg-white/70 dark:bg-white/5">
                      <div className="font-semibold">{tt('chat.score')} • {(result.score ?? 0).toFixed(2)}</div>
                      <div className="text-xs opacity-70">status: {result.status}</div>
                    </div>

                    {Array.isArray(result.breakdown) && (
                      <div className="rounded-2xl border p-3 bg-white/70 dark:bg-white/5">
                        <div className="font-semibold mb-2">Breakdown</div>
                        <div className="space-y-2 max-h-60 overflow-auto pr-1">
                          {result.breakdown.map((r:any,idx:number)=>(
                            <div key={idx} className="rounded-xl border px-3 py-2">
                              <div className="text-sm font-medium">{r.requirement}</div>
                              <div className="text-xs opacity-70">
                                must:{r.mustHave?'✓':'—'} • weight:{r.weight} • sim:{(r.similarity*100).toFixed(1)}% • score:{r.score10?.toFixed?.(2) ?? '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.gaps && (
                      <div className="rounded-2xl border p-3 bg-white/70 dark:bg-white/5">
                        <div className="font-semibold mb-1">{tt('chat.gaps')}</div>
                        <div className="text-xs opacity-80">must-missing: {result.gaps.mustHaveMissing?.join(', ') || '—'}</div>
                        <div className="text-xs opacity-80">improve: {result.gaps.improve?.join(', ') || '—'}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
