const unzipper = require('unzipper');
const fs = require('fs-extra');
const path = require('path');

class FileProcessor {
  constructor() {
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB per file
    this.maxTotalSize = 50 * 1024 * 1024; // 50MB total
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
      
      // Check for and handle nested folder structure (GitHub-style ZIPs)
      await this.handleNestedStructure(extractDir);
      
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
      
      // Extract ZIP using unzipper's Parse method for better control and error handling
      const extractedEntries = [];
      
      await new Promise((resolve, reject) => {
        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(zipBuffer);
        
        bufferStream
          .pipe(unzipper.Parse())
          .on('entry', async (entry) => {
            const fileName = entry.path;
            const type = entry.type; // 'Directory' or 'File'
            
            try {
              if (type === 'File') {
                // Ensure safe path
                const safePath = this.sanitizePath(fileName);
                const fullPath = path.join(extractDir, safePath);
                
                // Create directory structure if needed
                await fs.ensureDir(path.dirname(fullPath));
                
                // Extract file
                const writeStream = fs.createWriteStream(fullPath);
                entry.pipe(writeStream);
                
                await new Promise((fileResolve, fileReject) => {
                  writeStream.on('close', () => {
                    extractedEntries.push(fileName);
                    console.log(`Extracted file: ${fileName}`);
                    fileResolve();
                  });
                  writeStream.on('error', fileReject);
                  entry.on('error', fileReject);
                });
              } else {
                // Handle directories
                const safePath = this.sanitizePath(fileName);
                const fullPath = path.join(extractDir, safePath);
                await fs.ensureDir(fullPath);
                console.log(`Created directory: ${fileName}`);
                entry.autodrain();
              }
            } catch (entryError) {
              console.error(`Error processing entry ${fileName}:`, entryError.message);
              entry.autodrain(); // Skip this entry and continue
            }
          })
          .on('close', () => {
            console.log(`Extraction completed. Processed ${extractedEntries.length} files.`);
            resolve();
          })
          .on('error', reject);
      });
      
      // Get list of actually extracted files for validation and logging
      const extractedFiles = await this.getAllFiles(extractDir);
      console.log(`Found ${extractedFiles.length} files after extraction`);
      
      // Validate each extracted file
      for (const filePath of extractedFiles) {
        const relativePath = path.relative(extractDir, filePath);
        const pathCheck = this.sanitizeAndValidatePath(extractDir, relativePath);
        
        // Validate file path (prevent directory traversal)
        if (!pathCheck.safe) {
          throw new Error(`Unsafe path detected: ${relativePath}`);
        }
        const safePath = pathCheck.path;
        
        // Check file size
        const stats = await fs.stat(filePath);
        if (stats.size > this.maxFileSize) {
          throw new Error(`File too large: ${relativePath} (${stats.size} bytes)`);
        }
        
        // Validate file extension
        if (!this.isAllowedFile(safePath)) {
          throw new Error(`File type not allowed: ${safePath}`);
        }
      }
      
      console.log(`Successfully validated ${extractedFiles.length} files`);
      return extractedFiles.map(filePath => ({
        path: path.relative(extractDir, filePath),
        fullPath: filePath
      }));
      
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
      
      // Only check for truly dangerous patterns that shouldn't be in desktop apps
      const suspiciousPatterns = [
        /eval\s*\(/gi,                           // eval() calls
        /new\s+Function\s*\(/gi,                 // Function constructor
        /<script[^>]*src=["']data:/gi,          // data: URLs in scripts
      ];
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          console.warn(`Warning: Suspicious content detected in ${htmlFilePath} - this may not work properly in desktop app`);
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to validate HTML file ${htmlFilePath}: ${error.message}`);
    }
  }

  /**
   * Handle nested folder structure (common with GitHub ZIP downloads)
   * If there's only one top-level directory containing all files, flatten the structure
   * @param {string} extractDir - Directory containing extracted files
   */
  async handleNestedStructure(extractDir) {
    try {
      const entries = await fs.readdir(extractDir, { withFileTypes: true });
      
      // Check if there's only one entry and it's a directory
      if (entries.length === 1 && entries[0].isDirectory()) {
        const nestedDir = path.join(extractDir, entries[0].name);
        console.log(`Detected nested structure in directory: ${entries[0].name}`);
        
        // Check if this nested directory contains web files (index.html or other HTML files)
        const nestedFiles = await this.getAllFiles(nestedDir);
        const hasHtmlFiles = nestedFiles.some(file => path.extname(file).toLowerCase() === '.html');
        
        if (hasHtmlFiles) {
          console.log('Flattening nested directory structure...');
          
          // Move all files from nested directory to extract directory
          const nestedEntries = await fs.readdir(nestedDir, { withFileTypes: true });
          
          for (const entry of nestedEntries) {
            const sourcePath = path.join(nestedDir, entry.name);
            const targetPath = path.join(extractDir, entry.name);
            
            await fs.move(sourcePath, targetPath);
            console.log(`Moved ${entry.name} from nested directory to root`);
          }
          
          // Remove the now-empty nested directory
          await fs.remove(nestedDir);
          console.log(`Removed empty nested directory: ${entries[0].name}`);
        }
      }
    } catch (error) {
      console.error('Error handling nested structure:', error.message);
      // Don't throw error - this is best-effort optimization
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
   * Sanitize path and validate it's safe (no directory traversal)
   * @param {string} baseDir - Base directory
   * @param {string} filePath - File path to sanitize and check
   * @returns {{safe: boolean, path: string}} Object with safety flag and sanitized path
   */
  sanitizeAndValidatePath(baseDir, filePath) {
    const sanitized = this.sanitizePath(filePath);
    const resolvedPath = path.resolve(baseDir, sanitized);
    const resolvedBase = path.resolve(baseDir);
    
    const safe = resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
    
    return { safe, path: sanitized };
  }

  /**
   * Check if path is safe (no directory traversal) - kept for compatibility
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
    return true;
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