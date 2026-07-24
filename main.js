const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function cleanupUploads() {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000;
  fs.readdir(uploadsDir, (err, files) => {
    if (err || !files) return;
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > maxAge) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}
setInterval(cleanupUploads, 10 * 60 * 1000);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_PDF_TYPES = ['application/pdf'];

const uploadImages = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Tipe file tidak didukung. Hanya JPG, JPEG, PNG, WebP.'));
  }
});

const uploadPdf = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PDF_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('File harus berformat PDF.'));
  }
});

/// Ghostscript Compress 
function gsCompress(inputPath, outputPath, level) {
  return new Promise((resolve, reject) => {
    let args;

    switch (level) {
      case 'low':
        args = [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          '-dPDFSETTINGS=/ebook',
          '-dNOPAUSE', '-dQUIET', '-dBATCH',
          '-dColorImageResolution=150',
          '-dGrayImageResolution=150',
          '-dMonoImageResolution=150',
          '-dDownsampleColorImages=true',
          '-dDownsampleGrayImages=true',
          `-sOutputFile=${outputPath}`,
          inputPath
        ];
        break;

      case 'high':
        args = [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          '-dPDFSETTINGS=/screen',
          '-dNOPAUSE', '-dQUIET', '-dBATCH',
          '-dColorImageResolution=72',
          '-dGrayImageResolution=72',
          '-dMonoImageResolution=72',
          '-dDownsampleColorImages=true',
          '-dDownsampleGrayImages=true',
          '-dDownsampleMonoImages=true',
          '-dColorImageDownsampleType=/Bicubic',
          '-dGrayImageDownsampleType=/Bicubic',
          '-dCompressFonts=true',
          '-dSubsetFonts=true',
          '-dCompressPages=true',
          '-dEmbedAllFonts=false',
          `-sOutputFile=${outputPath}`,
          inputPath
        ];
        break;

      default: // medium
        args = [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          '-dPDFSETTINGS=/screen',
          '-dNOPAUSE', '-dQUIET', '-dBATCH',
          '-dColorImageResolution=85',
          '-dGrayImageResolution=85',
          '-dMonoImageResolution=85',
          '-dDownsampleColorImages=true',
          '-dDownsampleGrayImages=true',
          '-dColorImageDownsampleType=/Bicubic',
          '-dGrayImageDownsampleType=/Bicubic',
          '-dCompressFonts=true',
          '-dSubsetFonts=true',
          '-dCompressPages=true',
          '-dEmbedAllFonts=false',
          `-sOutputFile=${outputPath}`,
          inputPath
        ];
        break;
    }

    execFile('gs', args, { timeout: 120000 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

//  Convert Images to PDF 
app.post('/api/convert', uploadImages.array('images', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Tidak ada file gambar yang diupload.' });
    }

    const paperSize = req.body.paperSize || 'a4';
    const orientation = req.body.orientation || 'portrait';
    const margin = parseInt(req.body.margin) || 0;

    const pdfDoc = await PDFDocument.create();

    let pageWidth, pageHeight;
    switch (paperSize) {
      case 'a3': pageWidth = 841.89; pageHeight = 1190.55; break;
      case 'letter': pageWidth = 612; pageHeight = 792; break;
      case 'legal': pageWidth = 612; pageHeight = 1008; break;
      default: pageWidth = 595.28; pageHeight = 841.89; break;
    }

    if (orientation === 'landscape') {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }

    const marginPt = margin * 2.835;

    for (const file of req.files) {
      try {
        const imageBytes = fs.readFileSync(file.path);
        let image;
        const ext = path.extname(file.originalname).toLowerCase();

        if (ext === '.png') {
          image = await pdfDoc.embedPng(imageBytes);
        } else {
          image = await pdfDoc.embedJpg(imageBytes);
        }

        const contentWidth = pageWidth - marginPt * 2;
        const contentHeight = pageHeight - marginPt * 2;
        const imgAspect = image.width / image.height;
        const pageAspect = contentWidth / contentHeight;

        let drawWidth, drawHeight;
        if (imgAspect > pageAspect) {
          drawWidth = contentWidth;
          drawHeight = contentWidth / imgAspect;
        } else {
          drawHeight = contentHeight;
          drawWidth = contentHeight * imgAspect;
        }

        const x = marginPt + (contentWidth - drawWidth) / 2;
        const y = marginPt + (contentHeight - drawHeight) / 2;

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
      } catch (imgErr) {
        console.error(`Error processing ${file.originalname}:`, imgErr.message);
      }
    }

    const pdfBytes = await pdfDoc.save();
    const outputName = `converted_${uuidv4()}.pdf`;
    const outputPath = path.join(uploadsDir, outputName);
    fs.writeFileSync(outputPath, pdfBytes);

    res.json({
      success: true,
      downloadUrl: `/uploads/${outputName}`,
      fileName: outputName,
      pages: pdfDoc.getPageCount(),
      size: pdfBytes.length
    });
  } catch (err) {
    console.error('Convert error:', err);
    res.status(500).json({ error: 'Gagal mengkonversi gambar ke PDF.' });
  } finally {
    if (req.files) {
      req.files.forEach(f => { if (f.path && fs.existsSync(f.path)) fs.unlink(f.path, () => {}); });
    }
  }
});

// API: Compress PDF (Ghostscript) 
app.post('/api/compress', uploadPdf.single('pdf'), async (req, res) => {
  const inputPath = req.file ? req.file.path : null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file PDF yang diupload.' });
    }

    const level = req.body.level || 'medium';
    const originalSize = fs.statSync(req.file.path).size;

    const outputName = `compressed_${uuidv4()}.pdf`;
    const outputPath = path.join(uploadsDir, outputName);

    await gsCompress(req.file.path, outputPath, level);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('Ghostscript gagal menghasilkan file output.');
    }

    let compressedSize = fs.statSync(outputPath).size;

    if (level === 'medium' && compressedSize > originalSize * 0.5) {
      fs.unlinkSync(outputPath);
      const aggressiveArgs = [
        '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', '-dPDFSETTINGS=/screen',
        '-dNOPAUSE', '-dQUIET', '-dBATCH',
        '-dColorImageResolution=72', '-dGrayImageResolution=72', '-dMonoImageResolution=72',
        '-dDownsampleColorImages=true', '-dDownsampleGrayImages=true',
        '-dDownsampleMonoImages=true',
        '-dColorImageDownsampleType=/Bicubic', '-dGrayImageDownsampleType=/Bicubic',
        '-dCompressFonts=true', '-dSubsetFonts=true', '-dCompressPages=true',
        '-dEmbedAllFonts=false',
        `-sOutputFile=${outputPath}`, req.file.path
      ];
      await new Promise((resolve, reject) => {
        execFile('gs', aggressiveArgs, { timeout: 120000 }, (err) => err ? reject(err) : resolve());
      });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        compressedSize = fs.statSync(outputPath).size;
      }
    }

    const savedPercent = originalSize > 0
      ? (((originalSize - compressedSize) / originalSize) * 100).toFixed(1)
      : 0;

    let pageCount = 0;
    try {
      const pdfDoc = await PDFDocument.load(fs.readFileSync(outputPath));
      pageCount = pdfDoc.getPageCount();
    } catch (e) {
      pageCount = 0;
    }

    res.json({
      success: true,
      downloadUrl: `/uploads/${outputName}`,
      fileName: outputName,
      originalSize,
      compressedSize,
      savedPercent,
      pages: pageCount
    });
  } catch (err) {
    console.error('Compress error:', err);
    res.status(500).json({ error: 'Gagal mengkompresi PDF. ' + (err.message || '') });
  } finally {
    if (inputPath && fs.existsSync(inputPath)) fs.unlink(inputPath, () => {});
  }
});

// Download endpoint 
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File tidak ditemukan.' });
  }
  res.download(filePath, () => {
    setTimeout(() => {
      if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
    }, 2000);
  });
});

// Error handler for multer 
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Maksimal 20 gambar.' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Ukuran file melebihi batas.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// Start Server 
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  IM-PDF Tools running at:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://0.0.0.0:${PORT}\n`);
});
