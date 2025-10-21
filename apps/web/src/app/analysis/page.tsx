'use client';
import * as React from 'react';
import { cvApi } from '@/services/api/cv';
import { jobsApi } from '@/services/api/jobs';
import { analysesApi } from '@/services/api/analyses';
import { Button } from '@/components/ui/Button';

export default function RunAnalysis() {
  const [cvs, setCvs] = React.useState<any[]>([]);
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [cvId, setCvId] = React.useState('');
  const [jobId, setJobId] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    cvApi.list().then(r => setCvs(r.items)).catch(()=>{});
    jobsApi.list().then(r => setJobs(r.items)).catch(()=>{});
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const a = await analysesApi.run({ jobId, cvId });
      window.location.href = `/analysis/${a.id}`;
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>تشغيل التحليل</h1>

      <div style={{ marginBottom: 8 }}>
        <label>CV</label>
        <select value={cvId} onChange={e => setCvId(e.target.value)} style={{ width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:6 }}>
          <option value="">— اختر CV —</option>
          {cvs.map((c:any) => <option key={c.id} value={c.id}>{c.id.slice(0,8)}...</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>Job</label>
        <select value={jobId} onChange={e => setJobId(e.target.value)} style={{ width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:6 }}>
          <option value="">— اختر وظيفة —</option>
          {jobs.map((j:any) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      <Button onClick={run} disabled={!cvId || !jobId} loading={loading}>حلّل الآن</Button>
    </div>
  );
}
