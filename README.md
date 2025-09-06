# Conan Game 

Sebuah interaktif berbasis **AI** yang memanfaatkan model **IBM Granite** melalui **Replicate API** untuk memainkan peran sebagai Detektif Conan.
Proyek ini dibuat sebagai tugas submission **IBM SkillsBuild Bootcamp**.

---

## Fitur
- **Generate Kasus** secara otomatis menggunakan AI.
- **3 Tersangka** per kasus, lengkap dengan alibi dan petunjuk.
- **Kuis Interaktif**: pilih siapa pelaku paling mungkin.
- **Analisis Otomatis**: AI menjelaskan logika di balik jawaban.
- Dibangun dengan **React + Vite** dan **Tailwind CSS**.
- Backend menggunakan **Vercel Serverless Function** untuk memanggil **Replicate API**.

---

## 🛠️ Teknologi yang Digunakan
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Vercel Serverless Function
- **AI for Create Application** : ChatGPT
- **AI Model:** [IBM Granite Instruct 3.3B (via Replicate)](https://replicate.com/ibm-granite/granite-3.3-8b-instruct)
- **Deployment:** Vercel

---

## 📦 Instalasi Lokal
```bash
# Clone repo
git clone https://github.com/username/ai-detective-quiz.git
cd ai-detective-quiz

# Install dependencies
npm install

# Jalankan di lokal
npm run dev
