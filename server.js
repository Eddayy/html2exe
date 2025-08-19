const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const fileProcessor = require('./services/fileProcessor');
const electronBuilder = require('./services/electronBuilder');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}));

app.use(cors());


// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static files
app.use(express.static('public'));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for ZIP files
    files: 2 // Allow ZIP file + icon file
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'zipFile') {
      // Validate ZIP file
      if (file.mimetype === 'application/zip' || 
          file.mimetype === 'application/x-zip-compressed' ||
          file.originalname.toLowerCase().endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new Error('ZIP file must be a valid ZIP archive'), false);
      }
    } else if (file.fieldname === 'iconFile') {
      // Validate icon file
      const allowedIconTypes = [
        'image/png', 
        'image/jpeg', 
        'image/jpg', 
        'image/x-icon', 
        'image/vnd.microsoft.icon'
      ];
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.ico'];
      const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
      
      if (allowedIconTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
        // Check icon file size (5MB limit)
        if (file.size && file.size > 5 * 1024 * 1024) {
          cb(new Error('Icon file size exceeds 5MB limit'), false);
        } else {
          cb(null, true);
        }
      } else {
        cb(new Error('Icon file must be PNG, JPG, or ICO format'), false);
      }
    } else {
      cb(new Error('Unexpected field'), false);
    }
  }
});

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Upload and convert endpoint
app.post('/api/convert', upload.fields([
  { name: 'zipFile', maxCount: 1 },
  { name: 'iconFile', maxCount: 1 }
]), async (req, res) => {
  if (!req.files || !req.files.zipFile) {
    return res.status(400).json({ error: 'No ZIP file provided' });
  }

  const buildId = uuidv4();
  
  try {
    const zipFile = req.files.zipFile[0];
    const iconFile = req.files.iconFile ? req.files.iconFile[0] : null;
    
    console.log(`Starting build ${buildId} for file: ${zipFile.originalname}`);
    if (iconFile) {
      console.log(`Custom icon provided: ${iconFile.originalname}`);
    }
    
    // Process the uploaded ZIP file
    const tempDir = await fileProcessor.processZipFile(zipFile.buffer, buildId);
    
    // Process icon file if provided
    let iconData = null;
    if (iconFile) {
      iconData = {
        buffer: iconFile.buffer,
        originalname: iconFile.originalname,
        mimetype: iconFile.mimetype
      };
    }
    
    // Generate Electron application
    const electronAppPath = await electronBuilder.createElectronApp(tempDir, buildId, req.body, iconData);
    
    // Build executable
    const executablePath = await electronBuilder.buildExecutable(electronAppPath, buildId);
    
    // Return download info
    res.json({
      success: true,
      buildId: buildId,
      downloadUrl: `/api/download/${buildId}`,
      message: 'Conversion completed successfully'
    });
    
    console.log(`Build ${buildId} completed successfully`);
    
  } catch (error) {
    console.error(`Build ${buildId} failed:`, error.message);
    
    // Clean up on error
    try {
      await fileProcessor.cleanup(buildId);
    } catch (cleanupError) {
      console.error(`Cleanup failed for build ${buildId}:`, cleanupError.message);
    }
    
    res.status(500).json({
      error: 'Conversion failed',
      message: error.message,
      buildId: buildId
    });
  }
});

// Download endpoint
app.get('/api/download/:buildId', async (req, res) => {
  const { buildId } = req.params;
  
  try {
    const executablePath = path.join(__dirname, 'dist', buildId);
    
    // Find the executable file
    const files = await fs.readdir(executablePath);
    const executableFile = files.find(file => 
      file.endsWith('.exe') || 
      file.endsWith('.dmg') || 
      file.endsWith('.deb') ||
      file.endsWith('.appimage')
    );
    
    if (!executableFile) {
      return res.status(404).json({ error: 'Executable not found' });
    }
    
    const filePath = path.join(executablePath, executableFile);
    
    // Check if file exists
    if (!(await fs.pathExists(filePath))) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${executableFile}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      console.log(`File ${executableFile} downloaded for build ${buildId}`);
    });
    
    fileStream.on('error', (error) => {
      console.error(`Download error for build ${buildId}:`, error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    });
    
  } catch (error) {
    console.error(`Download failed for build ${buildId}:`, error.message);
    res.status(500).json({ error: 'Download failed', message: error.message });
  }
});

// Get build status
app.get('/api/status/:buildId', async (req, res) => {
  const { buildId } = req.params;
  
  try {
    const tempDir = path.join(__dirname, 'temp', buildId);
    const distDir = path.join(__dirname, 'dist', buildId);
    
    const tempExists = await fs.pathExists(tempDir);
    const distExists = await fs.pathExists(distDir);
    
    if (distExists) {
      res.json({ status: 'completed', buildId });
    } else if (tempExists) {
      res.json({ status: 'processing', buildId });
    } else {
      res.json({ status: 'not_found', buildId });
    }
  } catch (error) {
    res.status(500).json({ error: 'Status check failed', message: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: 'File upload error', message: error.message });
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Cleanup function
async function periodicCleanup() {
  try {
    await fileProcessor.periodicCleanup();
    console.log('Periodic cleanup completed');
  } catch (error) {
    console.error('Periodic cleanup failed:', error.message);
  }
}

// Start cleanup interval (every 15 minutes)
setInterval(periodicCleanup, 15 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  try {
    await fileProcessor.cleanupAll();
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Shutdown cleanup failed:', error.message);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  
  try {
    await fileProcessor.cleanupAll();
  } catch (error) {
    console.error('Shutdown cleanup failed:', error.message);
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`HTML2EXE Converter Server running on port ${PORT}`);
  console.log(`Web interface: http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/convert`);
});

module.exports = app;