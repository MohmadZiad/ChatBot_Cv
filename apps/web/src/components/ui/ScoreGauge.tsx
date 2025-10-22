// apps/web/src/components/ui/ScoreGauge.tsx
'use client';
export default function ScoreGauge({ value, size=140 }:{value:number; size?:number}) {
  const v = Math.max(0, Math.min(10, Number(value||0)));
  const r = size/2 - 10, c = 2*Math.PI*r, dash = c*(v/10);
  return (
    <svg width={size} height={size} className="overflow-visible">
      <circle cx={size/2} cy={size/2} r={r} className="fill-none stroke-gray-200 dark:stroke-slate-700" strokeWidth={10}/>
      <circle cx={size/2} cy={size/2} r={r} className="fill-none stroke-indigo-500"
        strokeWidth={10} strokeDasharray={`${dash} ${c-dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="font-semibold text-3xl">{v.toFixed(1)}</text>
      <text x="50%" y="70%" textAnchor="middle" className="text-xs opacity-60">/ 10</text>
    </svg>
  );
}
