'use client';
import * as React from 'react';
import { jobsApi, type JobRequirement } from '@/services/api/jobs';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { Button } from '@/components/ui/Button';

export default function NewJob() {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [reqs, setReqs] = React.useState<JobRequirement[]>([]);

  const addReq = () => setReqs(r => [...r, { requirement: '', mustHave: true, weight: 1 }]);
  const updateReq = (idx: number, patch: Partial<JobRequirement>) => setReqs(r => r.map((it,i) => i===idx? { ...it, ...patch } : it));
  const removeReq = (idx: number) => setReqs(r => r.filter((_,i)=>i!==idx));

  const onSubmit = async () => {
    try {
      const job = await jobsApi.create({ title, description, requirements: reqs });
      window.location.href = `/analysis/run`; // أو انتقل لتفاصيل الوظيفة لو وفّرت صفحة لها
    } catch (e: any) {
      alert(e.message || 'Failed');
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>وظيفة جديدة</h1>
      <div style={{ marginBottom: 8 }}>
        <Input placeholder="العنوان" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <TextArea placeholder="الوصف" rows={6} value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 8, marginBottom: 8 }}>
        <h2 style={{ fontWeight: 600 }}>المتطلبات</h2>
        <Button onClick={addReq}>+ إضافة</Button>
      </div>

      <div style={{ display:'grid', gap: 8 }}>
        {reqs.map((r, idx) => (
          <div key={idx} style={{ border:'1px solid #ddd', borderRadius:8, padding:8 }}>
            <div style={{ marginBottom: 6 }}>
              <Input placeholder="Requirement" value={r.requirement} onChange={e => updateReq(idx,{ requirement: e.target.value })} />
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <label><input type="checkbox" checked={r.mustHave} onChange={e => updateReq(idx,{ mustHave: e.target.checked })} /> mustHave</label>
              <input type="number" step="0.1" value={r.weight} onChange={e => updateReq(idx,{ weight: Number(e.target.value) })} style={{ width:100 }} />
              <Button onClick={() => removeReq(idx)}>حذف</Button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <Button onClick={onSubmit} disabled={!title || !description}>حفظ</Button>
      </div>
    </div>
  );
}
