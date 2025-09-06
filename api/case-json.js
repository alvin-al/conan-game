// api/case-json.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!TOKEN)
    return res.status(500).json({ error: "Missing REPLICATE_API_TOKEN" });

  const body = await readBody(req);
  const userCaseText = body?.caseText?.trim();
  const isGenerate = !userCaseText;

  const prompt = isGenerate
    ? buildGeneratePrompt()
    : buildAnalyzePrompt(userCaseText);

  try {
    const create = await fetch(
      "https://api.replicate.com/v1/models/ibm-granite/granite-3.3-8b-instruct/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { prompt, max_tokens: 650, temperature: 0.2, top_p: 0.9 },
        }),
      }
    );

    if (!create.ok) {
      const text = await create.text();
      return res.status(create.status).json({ error: text });
    }
    let pred = await create.json();

    // Poll sampai selesai (≤ 90s)
    const start = Date.now();
    while (pred.status !== "succeeded" && pred.status !== "failed") {
      if (Date.now() - start > 90_000)
        return res.status(504).json({ error: "Polling timeout (90s)" });
      await sleep(900);
      const poll = await fetch(pred.urls.get, {
        headers: { Authorization: `Token ${TOKEN}` },
      });
      pred = await poll.json();
    }

    if (pred.status === "failed") {
      return res
        .status(500)
        .json({ error: pred?.error || "Prediction failed" });
    }

    const raw = Array.isArray(pred.output)
      ? pred.output.join("")
      : String(pred.output || "");
    const parsed = parseJsonRobust(raw);

    if (isGenerate) {
      if (!isValidCase(parsed)) {
        return res.status(422).json({
          error:
            "Output kasus tidak valid. Harus ada {judul, lokasi, laporan, tersangka(3), jawaban(A|B|C), penjelasan}.",
          raw,
          parsed,
        });
      }
      return res.status(200).json(parsed);
    } else {
      if (!isValidAnalysis(parsed)) {
        return res.status(422).json({
          error:
            "Output analisis tidak valid. Harus { jawaban: 'A|B|C', penjelasan: '...' }",
          raw,
          parsed,
        });
      }
      return res.status(200).json(parsed);
    }
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

/* ================= PROMPTS ================= */

function buildGeneratePrompt() {
  return `IKUTI INSTRUKSI INI DENGAN KETAT.

TUJUAN
- Hasilkan SATU kasus detektif singkat (ID) lengkap 3 tersangka.

ATURAN WAJIB
- Keluarkan HANYA JSON valid (tanpa teks lain/markdown/\\\`\\\`\\\`/komentar).
- Semua string pakai tanda kutip ganda ".
- Field "jawaban" HARUS persis SATU huruf kapital dan cocok regex: ^[ABC]$  (BUKAN "A|B" atau "A, C").
- Buat ringkas dan konsisten waktu & tempat.
- Semua output dibuat dengan bahasa Indonesia

FORMAT OUTPUT (WAJIB)
{
  "judul": "Judul kasus singkat (maks 60 karakter)",
  "lokasi": "Kota, Negara",
  "laporan": "2-4 kalimat: siapa korban, waktu/kejadian, dan 1-2 petunjuk kunci.",
  "tersangka": [
    {"id":"A","nama":"Nama lengkap","deskripsi":"1 kalimat alibi + detail lokasional/waktu"},
    {"id":"B","nama":"Nama lengkap","deskripsi":"1 kalimat alibi + detail lokasional/waktu"},
    {"id":"C","nama":"Nama lengkap","deskripsi":"1 kalimat alibi + detail lokasional/waktu"}
  ],
  "jawaban": "A|B|C",
  "penjelasan": "2-4 kalimat: kaitkan petunjuk kunci ke pelaku dan bantah alibi lainnya."
}

CONTOH YANG SALAH
{ "jawaban": "A|B", "penjelasan": "..." }  <-- TIDAK BOLEH. BUKAN SATU HURUF.

CONTOH YANG BENAR
{ "jawaban": "C", "penjelasan": "..." }

HASILKAN HANYA JSON SESUAI FORMAT.`;
}

function buildAnalyzePrompt(caseText) {
  return `IKUTI INSTRUKSI INI DENGAN KETAT.

TUJUAN
- Analisis kasus berikut untuk menentukan SATU pelaku paling mungkin.

ATURAN WAJIB
- Keluarkan HANYA JSON valid (tanpa teks lain/markdown).
- "jawaban" HARUS persis SATU huruf kapital dan cocok regex: ^[ABC]$.
- "penjelasan" 2–4 kalimat, faktual, merujuk petunjuk & alibi.

FORMAT OUTPUT (WAJIB)
{
  "jawaban": "A|B|C",
  "penjelasan": "alasan singkat 2–4 kalimat"
}

CONTOH YANG SALAH
{ "jawaban": "A|B", "penjelasan": "..." }

CONTOH YANG BENAR
{ "jawaban": "B", "penjelasan": "..." }

KASUS
${caseText}

HASILKAN HANYA JSON SESUAI FORMAT.`;
}

/* ================= HELPERS ================= */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonRobust(text) {
  const cleaned = String(text || "")
    .replace(/```json|```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{");
    if (s >= 0) {
      let d = 0;
      for (let i = s; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === "{") d++;
        else if (ch === "}") d--;
        if (d === 0) {
          try {
            return JSON.parse(cleaned.slice(s, i + 1));
          } catch {}
        }
      }
    }
    return null;
  }
}

function isValidCase(obj) {
  if (!obj || typeof obj !== "object") return false;
  const hasKeys = [
    "judul",
    "lokasi",
    "laporan",
    "tersangka",
    "jawaban",
    "penjelasan",
  ].every((k) => k in obj);
  if (!hasKeys) return false;
  if (!Array.isArray(obj.tersangka) || obj.tersangka.length !== 3) return false;
  if (!["A", "B", "C"].includes(obj.jawaban)) return false;
  return true;
}

function isValidAnalysis(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!["A", "B", "C"].includes(obj.jawaban)) return false;
  if (typeof obj.penjelasan !== "string" || obj.penjelasan.length < 10)
    return false;
  return true;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}
