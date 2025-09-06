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

  const prompt =
    userPrompt ||
    `Jawab hanya JSON valid:
{
  "judul": "string",
  "lokasi": "string",
  "laporan": "string",
  "tersangka": [
    {"id":"A","nama":"string","deskripsi":"string"},
    {"id":"B","nama":"string","deskripsi":"string"},
    {"id":"C","nama":"string","deskripsi":"string"}
  ],
  "jawaban": "A|B|C",
  "penjelasan": "string"
}`;

  const MODEL_VERSION =
    "57b7f1a6f05047b744af1e673238128f2c256a81e39b75691c28b6d817af7b65";

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
          version: MODEL_VERSION,
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
