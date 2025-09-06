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
  const userPrompt = body?.prompt;

  const prompt = `IKUTI INSTRUKSI INI DENGAN KETAT.

TUJUAN:
Hasilkan satu kasus detektif singkat dan logis dalam bahasa Indonesia.

ATURAN WAJIB:
- Keluarkan HANYA JSON mentah (tanpa teks lain, tanpa markdown, tanpa \`\`\`, tanpa komentar).
- Semua nilai string pakai tanda kutip ganda ".
- Jangan sisipkan baris baru \\n di dalam nilai string (gunakan kalimat tunggal per field).
- Jangan gunakan karakter yang tidak valid di JSON.
- Panjang total tetap ringkas.

BATASAN KONTEN:
- Hindari kekerasan grafis dan isu sensitif. Gunakan bahasa Indonesia baku.

SPESIFIKASI OUTPUT (HARUS persis sesuai struktur di bawah):
{
  "judul": "Judul kasus singkat (maks 60 karakter)",
  "lokasi": "Kota, Negara (mis. Bandung, Indonesia)",
  "laporan": "2-4 kalimat: siapa korban, cara/kejadian, waktu perkiraan, dan 1-2 petunjuk kunci yang relevan.",
  "tersangka": [
    {"id":"A","nama":"Nama lengkap","deskripsi":"1 kalimat: peran/relasi + alibi dengan waktu spesifik + 1 detail yang dapat diverifikasi"},
    {"id":"B","nama":"Nama lengkap","deskripsi":"1 kalimat: peran/relasi + alibi dengan waktu spesifik + 1 detail yang dapat diverifikasi"},
    {"id":"C","nama":"Nama lengkap","deskripsi":"1 kalimat: peran/relasi + alibi dengan waktu spesifik + 1 detail yang dapat diverifikasi"}
  ],
  "jawaban": "A atau B atau C (huruf besar)",
  "penjelasan": "2-5 kalimat: jelaskan penalaran yang mengaitkan petunjuk kunci ke pelaku dan membantah alibi tersangka lain secara logis."
}

KETENTUAN LOGIKA:
- Pastikan hanya SATU pelaku yang paling mungkin.
- Petunjuk kunci harus konsisten dengan penjelasan dan membantah alibi tersangka lain.
- Hindari detail yang tidak relevan atau kebetulan berlebihan.

KELUARKAN HANYA JSON SESUAI STRUKTUR DI ATAS.`;

  try {
    // 1) Create prediction
    const create = await fetch(
      "https://api.replicate.com/v1/models/ibm-granite/granite-3.3-8b-instruct/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { prompt, max_tokens: 768, temperature: 0.8 },
        }),
      }
    );

    if (!create.ok) {
      const text = await create.text();
      return res.status(create.status).json({ error: text });
    }
    let pred = await create.json();

    // 2) Poll sampai selesai (maks 90 detik)
    const start = Date.now();
    while (pred.status !== "succeeded" && pred.status !== "failed") {
      if (Date.now() - start > 90_000) {
        return res.status(504).json({ error: "Polling timeout (90s)" });
      }
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

    // 3) Gabung output & parse JSON
    const raw = Array.isArray(pred.output)
      ? pred.output.join("")
      : String(pred.output || "");
    const cleaned = raw.replace(/```json|```/g, "").trim();

    // parser “tahan banting”
    const json = safeParseJson(cleaned);
    if (!json)
      return res.status(422).json({ error: "Output bukan JSON valid", raw });

    return res.status(200).json(json);
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

// --- helpers ---
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf("{");
    if (s >= 0) {
      let d = 0;
      for (let i = s; i < text.length; i++) {
        if (text[i] === "{") d++;
        else if (text[i] === "}") d--;
        if (d === 0) {
          try {
            return JSON.parse(text.slice(s, i + 1));
          } catch {}
        }
      }
    }
    return null;
  }
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
