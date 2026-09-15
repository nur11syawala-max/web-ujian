const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

if (!process.env.GEMINI_API_KEY) {
  console.warn("PERINGATAN: env var GEMINI_API_KEY belum diset!");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Kamu adalah asisten yang mengubah naskah soal ujian (format Markdown hasil konversi Word, dengan rumus matematika sudah dalam bentuk LaTeX memakai $...$ untuk inline dan $$...$$ untuk block) menjadi array JSON soal terstruktur.

ATURAN TIPE SOAL:
- "pg_biasa": pilihan ganda dengan TEPAT 1 jawaban benar.
- "pg_kompleks": pilihan ganda yang jawaban benarnya BISA lebih dari 1.
- "benar_salah": beberapa pernyataan yang masing-masing dinilai Benar atau Salah (biasanya berbentuk tabel di naskah asli).

FORMAT SETIAP ITEM (WAJIB, tanpa field tambahan lain):
{
  "type": "pg_biasa" | "pg_kompleks" | "benar_salah",
  "text": "teks soal, pertahankan notasi LaTeX apa adanya",
  "options": ["opsi A", "opsi B", "..."],
  "statements": ["pernyataan 1", "pernyataan 2", "..."],
  "key": "huruf/kode jawaban benar"
}

ATURAN PENGISIAN:
- Untuk pg_biasa / pg_kompleks: isi "options" (urut A,B,C,D,E), "statements" dikosongkan menjadi []. Isi "key" dengan huruf jawaban benar, pisahkan koma jika lebih dari satu, contoh "B" atau "A, C, E".
- Untuk benar_salah: isi "statements", "options" dikosongkan menjadi []. Isi "key" dengan urutan nilai "B" atau "S" sepanjang jumlah pernyataan, dipisah koma, contoh "B, S, B, B".
- PERTAHANKAN semua notasi LaTeX ($...$ atau $$...$$) persis apa adanya di "text", "options", dan "statements". JANGAN diterjemahkan, disederhanakan, atau dihilangkan.
- JANGAN menebak-nebak kunci jawaban jika di naskah tidak ada penanda eksplisit (misal "Kunci:", "Jawaban:", cetak tebal yang jelas menandakan kunci, dsb). Jika benar-benar tidak ada info kunci, isi "key" dengan string kosong "".
- Abaikan header/footer administratif (nama mapel, kelas, dsb) di naskah — itu bukan bagian dari soal.
- Balas HANYA dengan JSON array yang valid. Jangan tambahkan teks pembuka, penutup, atau markdown code fence apa pun.`;

function runPandoc(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(
      "pandoc",
      [inputPath, "-f", "docx", "-t", "markdown", "--wrap=none", "-o", outputPath],
      { timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error("Pandoc gagal memproses file: " + (stderr || err.message)));
        resolve();
      }
    );
  });
}

function safeUnlink(p) {
  fs.unlink(p, () => {});
}

app.post("/parse-docx", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File .docx tidak ditemukan pada request." });
  }

  const docxPath = req.file.path;
  const mdPath = path.join(os.tmpdir(), crypto.randomUUID() + ".md");

  try {
    await runPandoc(docxPath, mdPath);
    const markdown = fs.readFileSync(mdPath, "utf-8");

    if (!markdown.trim()) {
      return res.status(422).json({ error: "Dokumen tampak kosong setelah dikonversi oleh Pandoc." });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: "\n\nNaskah soal (Markdown):\n\n" + markdown },
    ]);

    const raw = result.response.text();

    let questions;
    try {
      questions = JSON.parse(raw);
    } catch (e) {
      return res.status(502).json({ error: "Gagal mem-parsing hasil AI menjadi JSON.", raw });
    }

    if (!Array.isArray(questions)) {
      return res.status(502).json({ error: "Hasil AI bukan berbentuk array soal.", raw });
    }

    res.json({ questions, markdown_preview: markdown.slice(0, 500) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    safeUnlink(docxPath);
    safeUnlink(mdPath);
  }
});

app.get("/", (req, res) => {
  res.send("Smart Import backend aktif. Gunakan POST /parse-docx dengan field 'file'.");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Smart Import backend jalan di port " + PORT));
