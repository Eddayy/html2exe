const unzipper = require('unzipper');
const fs = require('fs-extra');
const path = require('path');

class FileProcessor {
  constructor() {
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB per file
    this.maxTotalSize = 50 * 1024 * 1024; // 50MB total
    this.allowedExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
    this.blockedExtensions = ['.exe', '.bat', '.sh', '.cmd', '.scr', '.vbs', '.ps1', '.com', '.pif'];
  }

  /**
   * Process uploaded ZIP file
   * @param {Buffer} zipBuffer - The ZIP file buffer
   * @param {string} buildId - Unique build identifier
   * @returns {string} Path to extracted content directory
   */
  async processZipFile(zipBuffer, buildId) {
    try {
      // Validate ZIP buffer
      this.validateZipBuffer(zipBuffer);
      
      // Create build directory
      const buildDir = path.join(this.tempDir, buildId);
      await fs.ensureDir(buildDir);
      
      const extractDir = path.join(buildDir, 'content');
      await fs.ensureDir(extractDir);
      
      // Extract ZIP file
      const extractedFiles = await this.extractZipFile(zipBuffer, extractDir);
      
      // Validate extracted content
      await this.validateExtractedContent(extractDir);
      
      // Ensure index.html exists
      await this.ensureIndexHtml(extractDir);
      
      console.log(`Successfully processed ZIP file for build ${buildId}`);
      console.log(`Extracted ${extractedFiles.length} files`);
      
      return buildDir;
      
    } catch (error) {
      // Clean up on error
      try {
        await this.cleanup(buildId);
      } catch (cleanupError) {
        console.error(`Cleanup failed after processing error: ${cleanupError.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Validate ZIP buffer
   * @param {Buffer} buffer - ZIP file buffer
   */
  validateZipBuffer(buffer) {
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty ZIP file provided');
    }
    
    if (buffer.length > this.maxTotalSize) {
      throw new Error(`ZIP file too large. Maximum size is ${this.maxTotalSize / (1024 * 1024)}MB`);
    }
    
    // Check ZIP file signature
    const zipSignature = buffer.slice(0, 4);
    const validSignatures = [
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // Standard ZIP
      Buffer.from([0x50, 0x4B, 0x05, 0x06]), // Empty ZIP
      Buffer.from([0x50, 0x4B, 0x07, 0x08])  // Spanned ZIP
    ];
    
    const isValidZip = validSignatures.some(sig => zipSignature.equals(sig.slice(0, zipSignature.length)));
    if (!isValidZip) {
      throw new Error('Invalid ZIP file format');
    }
  }

  /**
   * Extract ZIP file to directory
   * @param {Buffer} zipBuffer - ZIP file buffer
   * @param {string} extractDir - Directory to extract to
   * @returns {Array} List of extracted files
   */
  async extractZipFile(zipBuffer, extractDir) {
    try {
      console.log(`Extracting ZIP buffer (${zipBuffer.length} bytes) to ${extractDir}`);
      
      // Use unzipper.Open to extract from buffer
      const directory = await unzipper.Open.buffer(zipBuffer);
      const extractedFiles = [];
      
      console.log(`ZIP contains ${directory.files.length} entries`);
      
      for (const file of directory.files) {
        console.log(`Processing entry: ${file.path}, type: ${file.type}, size: ${file.uncompressedSize}`);
        
        // Skip directories
        if (file.type === 'Directory') {
          console.log(`Skipping directory: ${file.path}`);
          continue;
        }
        
        // Validate file path (prevent directory traversal)
        const safePath = this.sanitizePath(file.path);
        if (!this.isPathSafe(extractDir, safePath)) {
          throw new Error(`Unsafe path detected: ${file.path}`);
        }
        
        // Check file size
        if (file.uncompressedSize > this.maxFileSize) {
          throw new Error(`File too large: ${file.path} (${file.uncompressedSize} bytes)`);
        }
        
        // Validate file extension
        if (!this.isAllowedFile(safePath)) {
          throw new Error(`File type not allowed: ${safePath}`);
        }
        
        // Extract file
        const outputPath = path.join(extractDir, safePath);
        const outputDir = path.dirname(outputPath);
        
        console.log(`Extracting ${file.path} to ${outputPath}`);
        
        // Ensure directory exists
        await fs.ensureDir(outputDir);
        
        // Extract file content
        const content = await file.buffer();
        await fs.writeFile(outputPath, content);
        
        extractedFiles.push({
          path: safePath,
          size: file.uncompressedSize,
          fullPath: outputPath
        });
        
        console.log(`Successfully extracted: ${file.path}`);
      }
      
      const totalSize = extractedFiles.reduce((sum, file) => sum + file.size, 0);
      console.log(`Extracted ${extractedFiles.length} files, total size: ${totalSize} bytes`);
      
      return extractedFiles;
      
    } catch (error) {
      console.error('ZIP extraction error:', error.message);
      throw new Error(`ZIP extraction failed: ${error.message}. Please ensure your ZIP file is valid and not corrupted.`);
    }
  }

  /**
   * Validate extracted content
   * @param {string} extractDir - Directory containing extracted files
   */
  async validateExtractedContent(extractDir) {
    try {
      console.log(`Validating content in directory: ${extractDir}`);
      
      // Check if directory exists
      if (!(await fs.pathExists(extractDir))) {
        throw new Error(`Extract directory does not exist: ${extractDir}`);
      }
      
      const files = await this.getAllFiles(extractDir);
      console.log(`Found ${files.length} files in extract directory`);
      
      if (files.length === 0) {
        // List directory contents for debugging
        try {
          const dirContents = await fs.readdir(extractDir, { withFileTypes: true });
          console.log('Directory contents:', dirContents.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            isFile: item.isFile()
          })));
        } catch (listError) {
          console.error('Failed to list directory contents:', listError.message);
        }
        
        throw new Error('No files found in ZIP archive');
      }
      
      // Log all found files for debugging
      console.log('Extracted files:', files.map(file => path.relative(extractDir, file)));
      
      // Check for at least one HTML file
      const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
      if (htmlFiles.length === 0) {
        const allExtensions = [...new Set(files.map(file => path.extname(file).toLowerCase()))];
        console.log('File extensions found:', allExtensions);
        throw new Error(`No HTML files found in ZIP archive. Found file types: ${allExtensions.join(', ')}`);
      }
      
      // Validate HTML content
      for (const htmlFile of htmlFiles) {
        await this.validateHtmlFile(htmlFile);
      }
      
      console.log(`Validated ${files.length} files, including ${htmlFiles.length} HTML files`);
      
    } catch (error) {
      throw new Error(`Content validation failed: ${error.message}. Ensure your ZIP contains at least one .html file and only allowed file types.`);
    }
  }

  /**
   * Validate HTML file content
   * @param {string} htmlFilePath - Path to HTML file
   */
  async validateHtmlFile(htmlFilePath) {
    try {
      const content = await fs.readFile(htmlFilePath, 'utf8');
      
      // Basic HTML structure validation
      if (!content.includes('<html') && !content.includes('<!DOCTYPE')) {
        console.warn(`Warning: ${htmlFilePath} may not be a valid HTML document`);
      }
      
      // Check for potentially dangerous content
      const dangerousPatterns = [
        /<script[^>]*src=["']https?:\/\/[^"']*["']/gi, // External scripts
        /javascript:/gi,
        /on\w+\s*=/gi, // Event handlers
        /<iframe/gi,
        /<object/gi,
        /<embed/gi
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          console.warn(`Warning: Potentially unsafe content detected in ${htmlFilePath}`);
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to validate HTML file ${htmlFilePath}: ${error.message}`);
    }
  }

  /**
   * Ensure index.html exists in the extracted content
   * @param {string} extractDir - Directory containing extracted files
   */
  async ensureIndexHtml(extractDir) {
    const indexPath = path.join(extractDir, 'index.html');
    
    if (await fs.pathExists(indexPath)) {
      return; // index.html already exists
    }
    
    // Look for any HTML file to use as index
    const files = await this.getAllFiles(extractDir);
    const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
    
    if (htmlFiles.length === 0) {
      throw new Error('No HTML files found to use as index.html');
    }
    
    // Use the first HTML file found
    const firstHtmlFile = htmlFiles[0];
    console.log(`Using ${path.basename(firstHtmlFile)} as index.html`);
    
    await fs.copy(firstHtmlFile, indexPath);
  }

  /**
   * Get all files recursively from directory
   * @param {string} dir - Directory to scan
   * @returns {Array} List of file paths
   */
  async getAllFiles(dir) {
    const files = [];
    
    async function scan(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    }
    
    await scan(dir);
    return files;
  }

  /**
   * Sanitize file path to prevent directory traversal
   * @param {string} filePath - Original file path
   * @returns {string} Sanitized file path
   */
  sanitizePath(filePath) {
    // Remove leading slashes and resolve relative paths
    let sanitized = filePath.replace(/^\/+/, '');
    sanitized = path.normalize(sanitized);
    
    // Remove any remaining parent directory references
    sanitized = sanitized.replace(/\.\.[\/\\]/g, '');
    
    return sanitized;
  }

  /**
   * Check if path is safe (no directory traversal)
   * @param {string} baseDir - Base directory
   * @param {string} filePath - File path to check
   * @returns {boolean} True if path is safe
   */
  isPathSafe(baseDir, filePath) {
    const resolvedPath = path.resolve(baseDir, filePath);
    const resolvedBase = path.resolve(baseDir);
    
    return resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
  }

  /**
   * Check if file is allowed based on extension
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file is allowed
   */
  isAllowedFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    // Check blocked extensions first
    if (this.blockedExtensions.includes(ext)) {
      return false;
    }
    
    // Allow files with allowed extensions or no extension (directories)
    return this.allowedExtensions.includes(ext) || !ext;
  }

  /**
   * Clean up build directory
   * @param {string} buildId - Build ID to clean up
   */
  async cleanup(buildId) {
    try {
      const buildDir = path.join(this.tempDir, buildId);
      const distDir = path.join(__dirname, '..', 'dist', buildId);
      
      if (await fs.pathExists(buildDir)) {
        await fs.remove(buildDir);
        console.log(`Cleaned up temp directory for build ${buildId}`);
      }
      
      if (await fs.pathExists(distDir)) {
        await fs.remove(distDir);
        console.log(`Cleaned up dist directory for build ${buildId}`);
      }
      
    } catch (error) {
      console.error(`Cleanup failed for build ${buildId}:`, error.message);
      throw error;
    }
  }

  /**
   * Periodic cleanup of old builds
   */
  async periodicCleanup() {
    try {
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours
      const now = Date.now();
      
      // Clean temp directory
      if (await fs.pathExists(this.tempDir)) {
        const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const dirPath = path.join(this.tempDir, entry.name);
            const stats = await fs.stat(dirPath);
            
            if (now - stats.mtime.getTime() > maxAge) {
              await fs.remove(dirPath);
              console.log(`Cleaned up old temp directory: ${entry.name}`);
            }
          }
        }
      }
      
      // Clean dist directory
      const distDir = path.join(__dirname, '..', 'dist');
      if (await fs.pathExists(distDir)) {
        const entries = await fs.readdir(distDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const dirPath = path.join(distDir, entry.name);
            const stats = await fs.stat(dirPath);
            
            if (now - stats.mtime.getTime() > maxAge) {
              await fs.remove(dirPath);
              console.log(`Cleaned up old dist directory: ${entry.name}`);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Periodic cleanup failed:', error.message);
    }
  }

  /**
   * Clean up all build directories
   */
  async cleanupAll() {
    try {
      if (await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir);
        console.log('Cleaned up all temp directories');
      }
      
      const distDir = path.join(__dirname, '..', 'dist');
      if (await fs.pathExists(distDir)) {
        await fs.remove(distDir);
        console.log('Cleaned up all dist directories');
      }
      
    } catch (error) {
      console.error('Cleanup all failed:', error.message);
    }
  }
}

module.exports = new FileProcessor();