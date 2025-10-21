'use client';
import * as React from 'react';
import { cvApi, type CV } from '@/services/api/cv';

export default function CvList() {
  const [items, setItems] = React.useState<CV[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    cvApi.list().then(r => setItems(r.items)).catch(e => alert(e.message)).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>قائمة السير الذاتية</h1>
      {loading ? 'Loading...' : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {items.map(i => (
            <li key={i.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', gap: 8, alignItems:'center' }}>
                <span style={{ fontWeight: 600 }}>{i.id.slice(0,8)}...</span>
                {i.publicUrl && <a href={i.publicUrl} target="_blank" rel="noreferrer">عرض</a>}
              </div>
              <span style={{ fontSize: 12, color: '#777' }}>{new Date(i.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
