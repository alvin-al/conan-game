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
  const wantAutoCase = !userCaseText;

  // === Prompt builder (ID) ===
  function buildPrompt(caseText) {
    return `IKUTI INSTRUKSI INI DENGAN KETAT.

TUJUAN
- Analisis kasus detektif berikut dan tentukan SATU pelaku paling mungkin.

ATURAN WAJIB
- Keluarkan HANYA JSON valid (tanpa teks lain, tanpa markdown, tanpa \`\`\`, tanpa komentar).
- Jangan tampilkan langkah berpikir internal.
- Semua string pakai tanda kutip ganda ".
- Field "jawaban" HARUS salah satu dari: "A", "B", atau "C".
- Tulis penjelasan singkat, faktual, konsisten dengan data.

KRITERIA PENILAIAN
- Utamakan kecocokan waktu & tempat (apakah berada di TKP pada waktu kejadian).
- Periksa kekuatan/kelemahan alibi.
- Hindari spekulasi di luar informasi kasus.

FORMAT OUTPUT PASTI (WAJIB)
{
  "jawaban": "A|B|C",
  "penjelasan": "2–4 kalimat ringkas yang menunjuk bukti utama dan membantah alibi tersangka lain."
}

${
  caseText
    ? `KASUS\n${caseText}\n`
    : `GENERATE KASUS
Buat kasus singkat (ID), 3 tersangka (A/B/C), waktu & tempat jelas, lalu pilih pelaku sesuai kriteria.`
}

HASILKAN HANYA JSON SESUAI FORMAT DI ATAS.`;
  }

  // panggil Replicate (pakai endpoint model slug; TANPA field "version")
  async function callReplicate(prompt) {
    const r = await fetch(
      "https://api.replicate.com/v1/models/ibm-granite/granite-3.3-8b-instruct/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { prompt, max_tokens: 512, temperature: 0.2, top_p: 0.9 },
        }),
      }
    );
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Replicate HTTP ${r.status}: ${text}`);
    }
    return r.json();
  }

  async function poll(getUrl, timeoutMs = 90000) {
    const start = Date.now();
    while (true) {
      const r = await fetch(getUrl, {
        headers: { Authorization: `Token ${TOKEN}` },
      });
      if (!r.ok) throw new Error(`Poll HTTP ${r.status}`);
      const pred = await r.json();

      if (pred.status === "succeeded") return pred;
      if (pred.status === "failed")
        throw new Error(pred?.error || "Prediction failed");

      if (Date.now() - start > timeoutMs) throw new Error("Polling timeout");
      await sleep(900);
    }
  }

  // parsing JSON ketat + fallback
  function parseJsonStrict(rawText) {
    const cleaned = String(rawText || "")
      .replace(/```json|```/g, "")
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // fallback: ambil objek {...} pertama
      const s = cleaned.indexOf("{");
      if (s >= 0) {
        let d = 0;
        for (let i = s; i < cleaned.length; i++) {
          if (cleaned[i] === "{") d++;
          else if (cleaned[i] === "}") d--;
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

  function isValidAnswer(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (!["A", "B", "C"].includes(obj.jawaban)) return false;
    if (typeof obj.penjelasan !== "string" || obj.penjelasan.length < 10)
      return false;
    return true;
  }

  async function runOnce(promptText) {
    let pred = await callReplicate(promptText);
    pred = await poll(pred.urls.get);

    const raw = Array.isArray(pred.output)
      ? pred.output.join("")
      : String(pred.output || "");
    const parsed = parseJsonStrict(raw);
    return { parsed, raw };
  }

  try {
    const promptText = buildPrompt(userCaseText);

    // 1st try
    let { parsed, raw } = await runOnce(promptText);

    // retry sekali jika tidak valid
    if (!isValidAnswer(parsed)) {
      const retryPrompt = buildPrompt(
        (userCaseText || "") +
          '\n\nCATATAN: Jawaban sebelumnya tidak valid. Pastikan hanya JSON dan \'jawaban\' adalah salah satu dari "A","B","C".'
      );
      const retry = await runOnce(retryPrompt);
      parsed = retry.parsed;
      raw = retry.raw;
    }

    if (!isValidAnswer(parsed)) {
      return res.status(422).json({
        error: "Output bukan JSON valid atau 'jawaban' tidak A/B/C.",
        raw,
        parsed,
      });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

// --- helpers ---
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
