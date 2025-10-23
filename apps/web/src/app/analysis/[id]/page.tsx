// apps/web/src/app/analysis/[id]/page.tsx
"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { analysesApi, type Analysis } from "@/services/api/analyses";

export default function ResultDetail() {
  const params = useParams<{ id: string }>();
  const [data, setData] = React.useState<Analysis | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!params?.id) return;
    analysesApi
      .get(params.id)
      .then(setData)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (loading) return <div className="max-w-3xl mx-auto">Loading...</div>;
  if (!data) return <div className="max-w-3xl mx-auto">Not found</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-lg font-bold mb-3">نتيجة التحليل</h1>

      <div className="border rounded-xl p-4 mb-4">
        <div>
          الحالة: <b>{data.status}</b>
        </div>
        <div>
          Score (0..10):{" "}
          <b>{typeof data.score === "number" ? data.score.toFixed(2) : "-"}</b>
        </div>
        {data.model && (
          <div className="text-xs text-black/60 dark:text-white/60 mt-1">
            model: {data.model}
          </div>
        )}
      </div>

      {Array.isArray(data.breakdown) && (
        <div className="mt-3">
          <h2 className="font-semibold mb-2">Per requirement</h2>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/5 dark:bg-white/10">
                <tr>
                  <th className="p-2 text-start">Requirement</th>
                  <th className="p-2">Must</th>
                  <th className="p-2">Weight</th>
                  <th className="p-2">Similarity</th>
                  <th className="p-2">Score/10</th>
                </tr>
              </thead>
              <tbody>
                {data.breakdown.map((r: any, idx: number) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{r.requirement}</td>
                    <td className="p-2 text-center">{r.mustHave ? "✓" : ""}</td>
                    <td className="p-2 text-center">{r.weight}</td>
                    <td className="p-2 text-center">
                      {(r.similarity * 100).toFixed(1)}%
                    </td>
                    <td className="p-2 text-center">
                      {r.score10?.toFixed?.(2) ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.gaps && (
        <div className="mt-4 space-y-1">
          <h2 className="font-semibold">Gaps</h2>
          <div className="text-sm">
            <b>Must-have missing:</b>{" "}
            {data.gaps.mustHaveMissing?.join(", ") || "—"}
          </div>
          <div className="text-sm">
            <b>Improve:</b> {data.gaps.improve?.join(", ") || "—"}
          </div>
        </div>
      )}
    </div>
  );
}
