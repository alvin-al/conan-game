import React, { useEffect, useState } from "react";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fb, setFb] = useState(null);
  const [err, setErr] = useState("");

  const fetchCase = async () => {
    setLoading(true);
    setErr("");
    setData(null);
    setFb(null);
    try {
      const res = await fetch("/api/case-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // body: JSON.stringify({ prompt: "opsional prompt custom" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const answer = (id) => {
    if (!data) return;
    const correct = id === data.jawaban;
    setFb({
      correct,
      msg: correct
        ? data.penjelasan
        : `Jawaban benar: ${data.jawaban}. ${data.penjelasan}`,
    });
  };

  useEffect(() => {
    fetchCase();
  }, []);

  return (
    <div className='min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4'>
      <main className='w-full max-w-2xl bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-lg'>
        {loading && (
          <div className='text-center'>
            <div className='w-8 h-8 border-4 border-gray-600 border-t-yellow-400 rounded-full animate-spin mx-auto' />
            <p className='mt-3 text-yellow-300'>Membuat kasus...</p>
          </div>
        )}

        {!loading && err && (
          <div className='text-center'>
            <p className='text-red-400'>{err}</p>
            <button
              onClick={fetchCase}
              className='mt-4 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold py-2 px-4 rounded'
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!loading && !err && data && (
          <>
            <header className='text-center mb-5'>
              <h1 className='text-2xl sm:text-3xl font-bold text-yellow-300'>
                {data.judul}
              </h1>
              <p className='text-gray-400'>{data.lokasi}</p>
            </header>

            <section className='space-y-3 text-gray-300'>
              <p>
                <span className='text-yellow-400 font-semibold'>
                  Laporan Polisi:
                </span>{" "}
                {data.laporan}
              </p>
              <div>
                <span className='text-yellow-400 font-semibold'>
                  Para Tersangka:
                </span>
                <ul className='list-disc list-inside mt-2 space-y-1'>
                  {data.tersangka.map((s) => (
                    <li key={s.id}>
                      <strong>{s.nama}:</strong> {s.deskripsi}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className='mt-6'>
              <h2 className='text-center font-semibold mb-3'>
                Siapa pelaku paling mungkin?
              </h2>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                {data.tersangka.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => answer(s.id)}
                    disabled={!!fb}
                    className={`bg-gray-700 hover:bg-gray-600 disabled:opacity-60 rounded-lg py-2 px-3 font-semibold ${
                      fb && data.jawaban === s.id ? "bg-green-700" : ""
                    }`}
                  >
                    {s.id}. {s.nama}
                  </button>
                ))}
              </div>
            </section>

            {fb && (
              <section
                className={`mt-6 p-4 rounded text-center ${
                  fb.correct ? "bg-green-800" : "bg-red-800"
                }`}
              >
                <h3 className='font-bold text-lg mb-1'>
                  {fb.correct ? "Tepat!" : "Kurang tepat"}
                </h3>
                <p>{fb.msg}</p>
                <button
                  onClick={fetchCase}
                  className='mt-4 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold py-2 px-4 rounded'
                >
                  Kasus Baru
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
