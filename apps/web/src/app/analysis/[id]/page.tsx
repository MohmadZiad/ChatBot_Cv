'use client';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { analysesApi, type Analysis } from '@/services/api/analyses';

export default function ResultDetail() {
  const params = useParams<{ id: string }>();
  const [data, setData] = React.useState<Analysis | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!params?.id) return;
    analysesApi.get(params.id).then(setData).catch(e => alert(e.message)).finally(()=>setLoading(false));
  }, [params?.id]);

  if (loading) return <div style={{ maxWidth: 900, margin: '0 auto' }}>Loading...</div>;
  if (!data) return <div style={{ maxWidth: 900, margin: '0 auto' }}>Not found</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>نتيجة التحليل</h1>
      <div style={{ border:'1px solid #ddd', borderRadius:8, padding:12, marginBottom:12 }}>
        <div>الحالة: <b>{data.status}</b></div>
        <div>Score (0..10): <b>{typeof data.score === 'number' ? data.score.toFixed(2) : '-'}</b></div>
        {data.model && <div style={{ fontSize: 12, color:'#777' }}>model: {data.model}</div>}
      </div>

      {Array.isArray(data.breakdown) && (
        <div style={{ marginTop: 10 }}>
          <h2 style={{ fontWeight:600, marginBottom:8 }}>Per requirement</h2>
          <table style={{ width: '100%', borderCollapse:'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ textAlign:'left', padding:8, border:'1px solid #eee' }}>Requirement</th>
                <th style={{ padding:8, border:'1px solid #eee' }}>Must</th>
                <th style={{ padding:8, border:'1px solid #eee' }}>Weight</th>
                <th style={{ padding:8, border:'1px solid #eee' }}>Similarity</th>
                <th style={{ padding:8, border:'1px solid #eee' }}>Score/10</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((r:any, idx:number) => (
                <tr key={idx}>
                  <td style={{ padding:8, border:'1px solid #eee' }}>{r.requirement}</td>
                  <td style={{ padding:8, textAlign:'center', border:'1px solid #eee' }}>{r.mustHave ? '✓' : ''}</td>
                  <td style={{ padding:8, textAlign:'center', border:'1px solid #eee' }}>{r.weight}</td>
                  <td style={{ padding:8, textAlign:'center', border:'1px solid #eee' }}>{(r.similarity*100).toFixed(1)}%</td>
                  <td style={{ padding:8, textAlign:'center', border:'1px solid #eee' }}>{r.score10?.toFixed?.(2) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.gaps && (
        <div style={{ marginTop: 10 }}>
          <h2 style={{ fontWeight:600, marginBottom:6 }}>Gaps</h2>
          <div style={{ fontSize: 14 }}><b>Must-have missing:</b> {data.gaps.mustHaveMissing?.join(', ') || '—'}</div>
          <div style={{ fontSize: 14 }}><b>Improve:</b> {data.gaps.improve?.join(', ') || '—'}</div>
        </div>
      )}
    </div>
  );
}
