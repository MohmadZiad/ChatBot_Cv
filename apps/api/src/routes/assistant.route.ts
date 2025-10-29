import type { FastifyInstance } from "fastify";
import { chatCompletion, chatJson } from "../services/openai";

const STRICT_PROMPT = `2) استخراج الحقول من وصف الوظيفة (لملء الصفحة/النموذج)
أعد JSON فقط بالمفاتيح التالية بعد استخراجها حرفيًا من وصف الوظيفة المدخل (job_description). 
لا تُخمِّن. إن غاب الحقل اتركه فارغًا.

Input:
- job_description: نص وصف الوظيفة.

Output (JSON فقط):
{
  "title": "",                 // العنوان كما ورد
  "summary": "",               // وصف مختصر من جملتين كحد أقصى من النص نفسه
  "level": "",                 // Junior | Mid | Senior | Lead (كما ورد حرفيًا إن وُجد)
  "required_experience_years": "",  // رقم أو نطاق كما ورد (مثال: "1-3")
  "contract_types": [],        // مثل: ["دوام كامل","دوام جزئي","عن بعد","عقد/فريلانِس"]
  "languages": [],             // مثل: ["العربية","الإنجليزية","الفرنسية","الألمانية","الإسبانية"]
  "must_have": [],             // مهارات أساسية كما وردت نصًا
  "nice_to_have": [],          // مهارات إضافية كما وردت نصًا
  "tools": [],                 // أدوات/برامج ذُكرت
  "frameworks": [],            // أُطر عمل ذُكرت
  "apis": [],                  // واجهات برمجية ذُكرت
  "location": "",             // كما ورد إن وجد
  "remote": "",               // "نعم" أو "لا" فقط إذا ورد نصًا
  "notes": ""                  // أي بنود صريحة مهمة من النص نفسه (سطر واحد)
}

3) اقتراح متطلبات (زر: اقترح متطلبات) اعتمادًا على وصف الوظيفة المحفوظ
اعتمد فقط على job_description المُعطى. لا تُخمِّن. أخرج JSON صالح دون أي نص خارجه.

Input:
- job_description: نص الوظيفة.

Output:
{
  "must_have": [
    {"skill": "", "weight": 2},   // weight: 1 أو 2 أو 3 (3 أعلى أولوية) إن وُجدت أولوية صريحة بالنص، وإلا 2
    ...
  ],
  "nice_to_have": [
    {"skill": "", "weight": 1},
    ...
  ]
}

4) توليد عنوان ووصف مختصر (أزرار: اقترح عنوان / اقترح وصف)
أخرج JSON فقط. لا تُخمِّن.

Input:
- job_description: نص الوظيفة.

Output:
{
  "title": "",     // أقرب عنوان مطابق لما ورد
  "summary": ""    // سطر واحد قصير من النص نفسه يشرح الدور
}

5) إظهار اللغات المطلوبة بوضوح (زر: استخراج اللغات)
أعد JSON فقط. لا تُخمِّن.

Input:
- job_description: نص الوظيفة (وقد يحتوي قسم "Languages" أو شروط لغوية).

Output:
{
  "languages": [],              // ["العربية","الإنجليزية",...]
  "proficiency_if_stated": {}   // مفتاح=اللغة، قيمة=مستوى الإتقان كما ورد نصًا (مثال: "FLUENT","B2","Native")
}

6) تلخيص الخبرة المطلوبة بوضوح (زر: الخبرة المطلوبة)
أعد JSON فقط من النص كما ورد. لا تُخمِّن.

Input:
- job_description: نص الوظيفة.

Output:
{
  "required_experience_years": "",      // مثال: "1-3" أو "3+" أو "سنة واحدة" كما ورد
  "experience_detail": ""               // سطر واحد يقتبس أو يلخّص الصياغة كما هي من النص
}

7) تحليل سريع لسيرة ذاتية واحدة مقابل الوظيفة (CV Quick Check)
قارن cv_text مع job_description بدقة. لا تُخمِّن. أخرج JSON فقط.

Input:
- job_description: نص الوظيفة.
- cv_text: نص السيرة الذاتية.

Steps (داخل النموذج فقط، لا تُظهرها):
- طابق المهارات المذكورة نصًا بين CV والوظيفة.
- صنّف المطابقة إلى must_have_match و nice_to_have_match حسب ما ورد في وصف الوظيفة فقط.
- احسب score نهائيًا كنسبة تقريبية = (عدد المهارات المطابقة / إجمالي مهارات الوظيفة المذكورة) * 100. 
- لا تستخدم مهارات غير مذكورة في الوصف.

Output:
{
  "score_percent": 0,
  "must_have_match": ["", ...],
  "must_have_missing": ["", ...],
  "nice_to_have_match": ["", ...],
  "nice_to_have_missing": ["", ...],
  "notes": ""   // سطر واحد فقط، بدون نصائح عامة
}

8) تحليل شامل بعد رفع السيرة (لوحة التحليل الرئيسية)
أخرج JSON فقط. لا تُخمِّن.

Input:
- job_description: نص الوظيفة.
- cvs: [{ "name": "", "text": "" }]   // مصفوفة سِيَر

Output:
{
  "jobs_requirements": {
    "title": "",
    "summary": "",
    "level": "",
    "required_experience_years": "",
    "languages": [],
    "contract_types": [],
    "must_have": [],
    "nice_to_have": []
  },
  "cvs_analysis": [
    {
      "name": "",
      "score_percent": 0,
      "must_have_match": [],
      "must_have_missing": [],
      "nice_to_have_match": [],
      "nice_to_have_missing": []
    }
  ]
}

9) مُولِّد اقتراحات سريع (زر AI عام داخل الصفحة)
أنت مُقتضَب جدًا. أخرج اقتراحات قصيرة بنقاط فقط، دون أي شرح إضافي.

Input:
- topic: أحد الأنواع التالية فقط ["عنوان","وصف","متطلبات","ملخص"].
- job_description: نص الوظيفة.

Output:
- إذا كان topic="عنوان": أخرج سطر واحد عنوان مطابق.
- إذا كان topic="وصف": أخرج سطر واحد وصف مختصر من النص.
- إذا كان topic="متطلبات": أخرج قائمة نقطية قصيرة (5-10 عناصر كحد أقصى) مأخوذة من النص نفسه.
- إذا كان topic="ملخص": أخرج 3 نقاط قصيرة من النص نفسه.

10) مساعد متطلبات لشخص محدد (مثال: خبرة سنة ويريد التعلّم أونلاين)
لا تُخمِّن خارج النص المُعطى عن الشخص. أعد JSON فقط.

Input:
- candidate_profile: وصف قصير للشخص (مثال: "مطور واجهات، خبرة سنة، يرغب بالتعلم أونلاين").
- job_description: نص الوظيفة.

Output:
{
  "fit_notes": "",            // سطر واحد: أين يطابق المرشح المتطلبات المذكورة نصًا
  "gaps": [],                 // فجوات مطلوبة مذكورة نصًا في الوصف ولا تظهر في الوصف القصير للمرشح
  "learning_suggestions": []  // نقاط قصيرة وعملية جدًا مرتبطة مباشرة بالمتطلبات المذكورة في الوصف فقط
}

11) مولّد نموذج المتطلبات السريعة (UI “إضافة متطلبات سريعة”)
اعتمد فقط على job_description. أعد JSON فقط بمصفوفات جاهزة للعرض.

Input:
- job_description: نص الوظيفة.

Output:
{
  "left_column": ["Next.js","JavaScript","Express","GraphQL","Tailwind CSS"],
  "right_column": ["React","TypeScript","Node.js","NestJS","REST"]
}

12) مخرجات نصية صِرفة (لا JSON) عند الحاجة للأزرار التي تتطلب نص فقط

نص عنوان فقط:

أعد سطرًا واحدًا لعنوان الوظيفة كما ورد في النص. لا تضف أي شيء آخر.


نص وصف مختصر فقط:

أعد سطرًا واحدًا يصف الدور من النص نفسه. لا تضف أي شيء آخر.


قائمة متطلبات نقطية فقط:

أعد نقاطًا قصيرة (كل نقطة في سطر) مأخوذة من نص الوظيفة نفسه. لا تضف أي نقطة غير مذكورة.

Critical 
اعمل الي طلبته منك اوعى تخرب اشي  كان ش غال 
كلشي يكون زابط 
لاني بدي اسلم المشروع كمان ساعة 
يعني معك ساعة تزبط هاد الاشي خد راحتك وفكر منيح واقرا ا اليطلبته منيح`;

const MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    const error: any = new Error(`${field} required`);
    error.status = 400;
    error.code = "BAD_INPUT";
    throw error;
  }
  return value.trim();
}

function ensureArray(value: unknown, field: string): any[] {
  if (!Array.isArray(value)) {
    const error: any = new Error(`${field} must be an array`);
    error.status = 400;
    error.code = "BAD_INPUT";
    throw error;
  }
  return value;
}

async function runJsonTask<T = any>(step: string, content: string): Promise<T> {
  const response = await chatJson<T>(
    [
      { role: "system", content: STRICT_PROMPT },
      {
        role: "user",
        content: `نفّذ البند (${step}) بناءً على المعطيات التالية:\n${content}\nأعد المخرجات بالضبط كما هو محدد.`,
      },
    ],
    { temperature: 0.1, model: MODEL }
  );
  if (!response) {
    const error: any = new Error("assistant returned empty response");
    error.status = 502;
    error.code = "AI_EMPTY";
    throw error;
  }
  return response;
}

async function runTextTask(step: string, content: string): Promise<string> {
  const response = await chatCompletion(
    [
      { role: "system", content: STRICT_PROMPT },
      {
        role: "user",
        content: `نفّذ البند (${step}) بناءً على المعطيات التالية:\n${content}\nأعد المخرج المطلوب فقط.`,
      },
    ],
    { temperature: 0.2, model: MODEL }
  );
  const trimmed = response.trim();
  if (!trimmed) {
    const error: any = new Error("assistant returned empty text");
    error.status = 502;
    error.code = "AI_EMPTY";
    throw error;
  }
  return trimmed;
}

export async function assistantRoute(app: FastifyInstance) {
  app.post("/:action", async (req, reply) => {
    if (!process.env.OPENAI_API_KEY) {
      return reply.code(503).send({ error: "OPENAI_API_KEY missing" });
    }

    const params = req.params as { action?: string };
    const action = (params.action || "").toLowerCase();
    const body = ((await req.body) ?? {}) as Record<string, unknown>;

    try {
      switch (action) {
        case "extract-fields": {
          const jd = requireString(body.job_description, "job_description");
          const result = await runJsonTask("2", `job_description:\n"""\n${jd}\n"""`);
          return reply.send(result);
        }
        case "suggest-requirements": {
          const jd = requireString(body.job_description, "job_description");
          const result = await runJsonTask("3", `job_description:\n"""\n${jd}\n"""`);
          return reply.send(result);
        }
        case "title-summary": {
          const jd = requireString(body.job_description, "job_description");
          const result = await runJsonTask("4", `job_description:\n"""\n${jd}\n"""`);
          return reply.send(result);
        }
        case "languages": {
          const jd = requireString(body.job_description, "job_description");
          const result = await runJsonTask("5", `job_description:\n"""\n${jd}\n"""`);
          return reply.send(result);
        }
        case "experience": {
          const jd = requireString(body.job_description, "job_description");
          const result = await runJsonTask("6", `job_description:\n"""\n${jd}\n"""`);
          return reply.send(result);
        }
        case "cv-quick-check": {
          const jd = requireString(body.job_description, "job_description");
          const cvText = requireString(body.cv_text, "cv_text");
          const payload = `job_description:\n"""\n${jd}\n"""\ncv_text:\n"""\n${cvText}\n"""`;
          const result = await runJsonTask("7", payload);
          return reply.send(result);
        }
        case "analysis-dashboard": {
          const jd = requireString(body.job_description, "job_description");
          const cvs = ensureArray(body.cvs, "cvs");
          const payload = `job_description:\n"""\n${jd}\n"""\ncvs:\n${JSON.stringify(cvs, null, 2)}`;
          const result = await runJsonTask("8", payload);
          return reply.send(result);
        }
        case "quick-suggestions": {
          const topic = requireString(body.topic, "topic");
          const jd = requireString(body.job_description, "job_description");
          const output = await runTextTask("9", `topic: ${topic}\njob_description:\n"""\n${jd}\n"""`);
          return reply.send({ output });
        }
        case "candidate-helper": {
          const profile = requireString(body.candidate_profile, "candidate_profile");
          const jd = requireString(body.job_description, "job_description");
          const payload = `candidate_profile:\n"""\n${profile}\n"""\njob_description:\n"""\n${jd}\n"""`;
          const result = await runJsonTask("10", payload);
          return reply.send(result);
        }
        case "requirements-template": {
          const jd = requireString(body.job_description, "job_description");
          const result = await runJsonTask("11", `job_description:\n"""\n${jd}\n"""`);
          return reply.send(result);
        }
        case "title-text": {
          const jd = requireString(body.job_description, "job_description");
          const output = await runTextTask("12 - نص عنوان فقط", `job_description:\n"""\n${jd}\n"""`);
          return reply.send({ output });
        }
        case "summary-text": {
          const jd = requireString(body.job_description, "job_description");
          const output = await runTextTask("12 - نص وصف مختصر فقط", `job_description:\n"""\n${jd}\n"""`);
          return reply.send({ output });
        }
        case "requirements-list": {
          const jd = requireString(body.job_description, "job_description");
          const output = await runTextTask("12 - قائمة متطلبات نقطية فقط", `job_description:\n"""\n${jd}\n"""`);
          return reply.send({ output });
        }
        default:
          return reply.code(404).send({ error: "unknown action" });
      }
    } catch (err: any) {
      req.log.error({ err, action }, "assistant action failed");
      const status = err?.status || 500;
      return reply.code(status).send({ error: err?.code || "ASSISTANT_FAILED", message: err?.message || "assistant failed" });
    }
  });
}
