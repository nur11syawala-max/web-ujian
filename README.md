# Smart Import Backend

Backend kecil untuk fitur "Smart Import (AI)" di Portal Guru.
Alur: terima file `.docx` → konversi pakai **Pandoc** (equation Word/OMML otomatis
jadi LaTeX `$...$`) → kirim teksnya ke **Gemini** → kembalikan array JSON soal
terstruktur (pg_biasa / pg_kompleks / benar_salah).

## Prasyarat

1. Sudah punya [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`) terpasang.
2. Sudah punya API key Gemini (dari [Google AI Studio](https://aistudio.google.com/app/apikey)).
3. Project GCP yang sama dengan Firebase kamu (`ujian-smamuma`).

## Cara Deploy

Jalankan dari dalam folder ini (folder yang berisi `Dockerfile`, `server.js`, `package.json`):

```bash
gcloud config set project ujian-smamuma

gcloud run deploy smart-import-backend \
  --source . \
  --region asia-southeast2 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=ISI_API_KEY_GEMINI_KAMU_DI_SINI
```

Setelah selesai, `gcloud` akan menampilkan URL, contohnya:

```
https://smart-import-backend-xxxxxxxxxx-et.a.run.app
```

**Catat URL ini** — akan dipakai di `importir.html` (variabel `SMART_IMPORT_URL`).

## Catatan keamanan (opsional, boleh nanti)

Untuk saat ini `GEMINI_API_KEY` disimpan sebagai environment variable biasa di
Cloud Run — cukup aman karena tidak terlihat dari sisi browser/client. Kalau nanti
mau lebih rapi, API key ini bisa dipindah ke **Secret Manager**:

```bash
gcloud secrets create gemini-api-key --data-file=- <<< "ISI_API_KEY_KAMU"
gcloud run deploy smart-import-backend --source . --region asia-southeast2 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

## Test manual (tanpa frontend)

```bash
curl -X POST https://URL_CLOUD_RUN_KAMU/parse-docx \
  -F "file=@/path/ke/contoh-soal.docx"
```

Responnya berupa `{ "questions": [...] }` yang formatnya sudah cocok
dipakai langsung oleh `importir.html`.

## Batasan yang perlu diketahui

- Ukuran file dibatasi 15MB.
- Timeout Pandoc 60 detik — dokumen sangat panjang (>100 halaman) mungkin perlu
  dipecah dulu.
- AI tetap bisa salah menebak tipe soal atau kunci jawaban — **selalu cek lewat
  fitur Pratinjau di Portal Guru sebelum menekan "Terbitkan ke Siswa"**.
