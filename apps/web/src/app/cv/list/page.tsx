"use client";
import * as React from "react";
import { cvApi, type CV, buildPublicUrl } from "@/services/api/cv";

export default function CVList() {
  const [items, setItems] = React.useState<CV[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    cvApi
      .list()
      .then((r) => setItems(r.items))
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        قائمة السير الذاتية
      </h1>
      {loading ? (
        "Loading…"
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((i) => {
            const publicUrl = buildPublicUrl(i);
            const created = i.createdAt
              ? new Date(i.createdAt).toLocaleString()
              : "—";
            return (
              <li
                key={i.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{i.id.slice(0, 8)}…</span>
                  <span style={{ opacity: 0.8 }}>{i.originalFilename}</span>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {publicUrl && (
                    <a href={publicUrl} target="_blank" rel="noreferrer">
                      عرض
                    </a>
                  )}
                  <span style={{ fontSize: 12, color: "#777" }}>{created}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
