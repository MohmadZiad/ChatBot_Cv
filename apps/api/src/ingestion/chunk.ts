export function chunkText(raw: string, target = 1000) {
    const text = raw.replace(/\r/g, '').trim();
    const chunks: { section: string; content: string }[] = [];
  
    const map: Record<string,string> = {};
    const sections = [
      { key: 'experience', rx: /(experience|work history|الخبرة|خبرات|الخبره)/i },
      { key: 'skills',     rx: /(skills|المهارات|مهارات)/i },
      { key: 'education',  rx: /(education|التعليم|الدراسة|الشهادات)/i },
      { key: 'summary',    rx: /(summary|about|ملخص|نبذة)/i }
    ];
  
    let lastIdx = 0;
    const marks: {key: string; idx: number}[] = [];
    const lines = text.split('\n');
    for (let i=0;i<lines.length;i++) {
      const l = lines[i];
      for (const s of sections) {
        if (s.rx.test(l)) marks.push({ key: s.key, idx: i });
      }
    }
    if (marks.length > 0) {
      marks.sort((a,b)=>a.idx-b.idx);
      for (let i=0;i<marks.length;i++) {
        const start = marks[i].idx;
        const end = i+1 < marks.length ? marks[i+1].idx : lines.length;
        map[marks[i].key] = lines.slice(start, end).join('\n');
      }
    } else {
      map['other'] = text;
    }
  
    for (const [section, content] of Object.entries(map)) {
      if (!content) continue;
      if (content.length <= target + 200) {
        chunks.push({ section, content });
      } else {
        let i = 0;
        while (i < content.length) {
          const slice = content.slice(i, i + target);
          chunks.push({ section, content: slice });
          i += target;
        }
      }
    }
    return chunks;
  }
  