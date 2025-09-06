// server.js (Node 18+)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ganti origin sesuai port dev kamu (5173/5174)
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"] }));
app.use(express.json({ limit: "1mb" }));

const TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_URL =
  "https://api.replicate.com/v1/models/ibm-granite/granite-3.3-8b-instruct/predictions";

// preflight (kadang perlu eksplisit)
app.options("*", cors());

// healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

// create prediction
app.post("/api/case", async (req, res) => {
  try {
    if (!TOKEN)
      return res.status(500).json({ error: "Missing REPLICATE_API_TOKEN" });
    console.log("[POST /api/case] body:", req.body);

    const r = await fetch(REPLICATE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Token ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const text = await r.text(); // log mentah buat debug
    console.log("[Replicate create status]", r.status, text);
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// poll status
app.get("/api/poll", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "Missing url" });

    const r = await fetch(url, {
      headers: { Authorization: `Token ${TOKEN}` },
    });

    const text = await r.text();
    console.log("[Replicate poll status]", r.status, text);
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Proxy on http://localhost:${PORT}`));
