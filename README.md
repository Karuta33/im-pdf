# IM-PDF Tools

Tool sederhana buat konversi gambar jadi PDF sama kompresi PDF, jalanin sendiri di lokal.

## Yang Bisa Dilakuin

- **Image to PDF** — Upload beberapa gambar sekaligus, atur urutannya, pilih ukuran kertas (A4, A3, Letter, Legal), atur orientasi dan margin, terus jadiin satu file PDF.
- **Compress PDF** — Kompresi file PDF biar ukurannya lebih kecil. Ada 3 level: Low, Medium, dan High. Kalau medium kurang ngefek, script otomatis coba kompresi lebih agresif.

## Tech Stack

- **Node.js + Express.js** — backendnya
- **pdf-lib** — buat ngolah PDF (embed gambar, bikin halaman, dll)
- **Ghostscript (`gs`)** — buat kompresi PDF, lebih powerful dibanding kompresi pake JS murni
- **Multer** — handle upload file

## Syarat

Pastiin di mesin kamu udah ada:
- **Node.js** (v14 ke atas harusnya aman)
- **Ghostscript** — ini penting buat fitur kompresi PDF

Cek Ghostscript udah terinstall belum:

```bash
gs --version
```

Kalau belum, install dulu:

```bash
# Debian/Ubuntu
sudo apt install ghostscript

# macOS (pake Homebrew)
brew install ghostscript

# Windows
# Download dari https://www.ghostscript.com/releases/gsdnld.html
# terus tambahin ke PATH
```

## Cara Install

```bash
# clone repo https://github.com/Karuta33/im-pdf
cd im-pdf
# install dependencies
npm install
```

## Cara Jalankan

```bash
npm start
```

Abis itu buka browser, akses `http://localhost:4000`.

Port defaultnya 4000. Kalau mau ganti, set environment variable `PORT` sebelum jalanin:

```bash
PORT=8080 npm start
```

## API

Kalau mau pake lewat API langsung (misal dari app lain):

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/convert` | POST | Upload gambar, convert ke PDF. Field: `images` (file), `paperSize`, `orientation`, `margin` |
| `/api/compress` | POST | Upload PDF, kompresi. Field: `pdf` (file), `level` (low/medium/high) |
| `/api/download/:filename` | GET | Download file hasil convert/kompresi |

Semua response bentuknya JSON. Contoh response sukses convert:

```json
{
  "success": true,
  "downloadUrl": "/uploads/converted_xxx.pdf",
  "fileName": "converted_xxx.pdf",
  "pages": 5,
  "size": 102400
}
```

## Catatan Penting

- File di folder `uploads/` bakal kehapus otomatis setelah 10 menit, jadi jangan simpen file penting di situ.
- Untuk konversi gambar ke PDF: maksimal 20 gambar per request, ukuran tiap file maks 50MB. Format yang didukung: JPG, JPEG, PNG, WebP.
- Untuk kompresi PDF: maksimal 1 file per request, ukuran maks 100MB.
- Ghostscript harus terinstall di sistem kalau mau pake fitur kompresi. Tanpa Ghostscript, fitur convert gambar ke PDF tetap jalan.
