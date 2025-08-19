const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

class ElectronBuilder {
  constructor() {
    this.templatesDir = path.join(__dirname, '..', 'templates');
    this.distDir = path.join(__dirname, '..', 'dist');
    this.cacheDir = path.join(__dirname, '..', '.cache');
    this.nodeModulesCacheDir = path.join(this.cacheDir, 'node_modules');
  }

  /**
   * Create Electron application from user content
   * @param {string} buildDir - Directory containing user content
   * @param {string} buildId - Unique build identifier
   * @param {object} config - App configuration options
   * @param {object} iconData - Icon file data (optional)
   * @returns {string} Path to created Electron app
   */
  async createElectronApp(buildDir, buildId, config = {}, iconData = null) {
    try {
      const electronAppDir = path.join(buildDir, 'electron-app');
      await fs.ensureDir(electronAppDir);

      // Default configuration
      const userAppName = config.appName || 'My App';
      const appConfig = {
        appName: this.sanitizeAppName(userAppName),  // Technical name (sanitized)
        productName: userAppName,                     // Display name (as user typed)
        version: config.version || '1.0.0',
        description: config.description || 'Generated desktop application from HTML',
        author: config.author || 'HTML2EXE Converter',
        width: config.width || 1200,
        height: config.height || 800,
        website: config.website || '',
        company: config.company || config.author || 'HTML2EXE Converter',
        ...config
      };

      // Generate derived properties
      appConfig.appId = this.generateAppId(appConfig.appName);
      appConfig.copyright = this.generateCopyright(appConfig.author || appConfig.company);

      console.log(`Creating Electron app for build ${buildId}`);
      console.log(`Technical name: ${appConfig.appName}`);
      console.log(`Display name: ${appConfig.productName}`);

      // Copy user content to app directory
      const userContentDir = path.join(buildDir, 'content');
      const appContentDir = path.join(electronAppDir, 'app');
      await fs.copy(userContentDir, appContentDir);

      // Generate Electron files from templates
      await this.generateMainJs(electronAppDir, appConfig);
      await this.generatePreloadJs(electronAppDir, appConfig);
      await this.generatePackageJson(electronAppDir, appConfig, iconData);

      // Process custom icon if provided
      if (iconData) {
        await this.processCustomIcon(electronAppDir, iconData);
      }

      // Install Electron dependencies
      await this.installDependencies(electronAppDir);

      console.log(`Electron app created successfully for build ${buildId}`);
      return electronAppDir;

    } catch (error) {
      throw new Error(`Failed to create Electron app: ${error.message}`);
    }
  }

  /**
   * Build executable from Electron app
   * @param {string} electronAppPath - Path to Electron app directory
   * @param {string} buildId - Unique build identifier
   * @returns {string} Path to built executable directory
   */
  async buildExecutable(electronAppPath, buildId) {
    try {
      console.log(`Building executable for build ${buildId}`);

      const outputDir = path.join(this.distDir, buildId);
      await fs.ensureDir(outputDir);

      // Always build for Windows only
      const target = '--win';

      // Build the application
      const buildCommand = `npm run build -- --publish=never`;
      
      console.log(`Executing build command: ${buildCommand}`);
      console.log(`Working directory: ${electronAppPath}`);

      try {
        const output = execSync(buildCommand, {
          cwd: electronAppPath,
          stdio: 'pipe',
          timeout: 300000, // 5 minutes timeout
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
          encoding: 'utf8'
        });
        
        console.log('Build output:', output);
        
      } catch (buildError) {
        console.error('Build command failed:', buildError.message);
        if (buildError.stdout) {
          console.log('Build stdout:', buildError.stdout.toString());
        }
        if (buildError.stderr) {
          console.error('Build stderr:', buildError.stderr.toString());
        }
        throw new Error(`Build command failed: ${buildError.message}`);
      }

      // List contents of electron app directory after build
      try {
        const electronAppContents = await fs.readdir(electronAppPath);
        console.log('Electron app directory contents after build:', electronAppContents);
        
        const distPath = path.join(electronAppPath, 'dist');
        if (await fs.pathExists(distPath)) {
          const distContents = await fs.readdir(distPath);
          console.log('Dist directory contents:', distContents);
        }
      } catch (listError) {
        console.warn('Failed to list directory contents:', listError.message);
      }

      // Find and move the built executable
      const builtFiles = await this.findBuiltExecutable(electronAppPath);
      
      if (builtFiles.length === 0) {
        // Try to find any files in dist directory for debugging
        const distDir = path.join(electronAppPath, 'dist');
        const parentDistDir = path.join(electronAppPath, '..', 'dist');
        
        console.log('Checking dist directories:');
        console.log('Local dist:', distDir);
        console.log('Parent dist:', parentDistDir);
        
        if (await fs.pathExists(distDir)) {
          const allFiles = await this.getAllFilesInDirectory(distDir);
          console.log('All files in local dist directory:', allFiles);
        }
        
        if (await fs.pathExists(parentDistDir)) {
          const allFiles = await this.getAllFilesInDirectory(parentDistDir);
          console.log('All files in parent dist directory:', allFiles);
          
          // Check if there are executables in the parent dist directory
          const parentBuiltFiles = await this.findBuiltExecutableInDirectory(parentDistDir);
          if (parentBuiltFiles.length > 0) {
            console.log('Found executables in parent dist directory, copying them...');
            for (const file of parentBuiltFiles) {
              const fileName = path.basename(file);
              const destPath = path.join(outputDir, fileName);
              await fs.copy(file, destPath);
              console.log(`Copied executable from parent dist: ${fileName}`);
            }
            console.log(`Build completed successfully for build ${buildId}`);
            return outputDir;
          }
        }
        
        throw new Error('No executable files found after build');
      }

      // Copy built files to final output directory
      for (const file of builtFiles) {
        const fileName = path.basename(file);
        const destPath = path.join(outputDir, fileName);
        await fs.copy(file, destPath);
        console.log(`Copied executable: ${fileName}`);
      }

      console.log(`Build completed successfully for build ${buildId}`);
      return outputDir;

    } catch (error) {
      console.error(`Build failed for ${buildId}:`, error.message);
      throw new Error(`Failed to build executable: ${error.message}`);
    }
  }

  /**
   * Get all files in directory recursively (for debugging)
   * @param {string} dir - Directory to scan
   * @returns {Array} Array of file paths
   */
  async getAllFilesInDirectory(dir) {
    const files = [];
    
    const scan = async (currentDir) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          files.push(path.relative(dir, fullPath));
        }
      }
    };
    
    await scan(dir);
    return files;
  }

  /**
   * Generate main.js from template
   * @param {string} electronAppDir - Electron app directory
   * @param {object} config - App configuration
   */
  async generateMainJs(electronAppDir, config) {
    const templatePath = path.join(this.templatesDir, 'main.js.template');
    const outputPath = path.join(electronAppDir, 'main.js');

    let template = await fs.readFile(templatePath, 'utf8');
    
    // Replace template variables
    template = template.replace(/{{width}}/g, config.width);
    template = template.replace(/{{height}}/g, config.height);

    await fs.writeFile(outputPath, template);
    console.log('Generated main.js');
  }

  /**
   * Generate preload.js from template
   * @param {string} electronAppDir - Electron app directory
   * @param {object} config - App configuration
   */
  async generatePreloadJs(electronAppDir, config) {
    const templatePath = path.join(this.templatesDir, 'preload.js.template');
    const outputPath = path.join(electronAppDir, 'preload.js');

    let template = await fs.readFile(templatePath, 'utf8');
    
    // Replace template variables
    template = template.replace(/{{appName}}/g, config.appName);

    await fs.writeFile(outputPath, template);
    console.log('Generated preload.js');
  }

  /**
   * Generate package.json from template
   * @param {string} electronAppDir - Electron app directory
   * @param {object} config - App configuration
   * @param {object} iconData - Icon file data (optional)
   */
  async generatePackageJson(electronAppDir, config, iconData = null) {
    const templatePath = path.join(this.templatesDir, 'package.json.template');
    const outputPath = path.join(electronAppDir, 'package.json');

    let template = await fs.readFile(templatePath, 'utf8');
    
    // Replace template variables
    template = template.replace(/{{appName}}/g, config.appName);
    template = template.replace(/{{version}}/g, config.version);
    template = template.replace(/{{description}}/g, config.description);
    template = template.replace(/{{author}}/g, config.author);
    template = template.replace(/{{appId}}/g, config.appId);
    template = template.replace(/{{productName}}/g, config.productName);
    template = template.replace(/{{website}}/g, config.website);
    template = template.replace(/{{company}}/g, config.company);
    template = template.replace(/{{copyright}}/g, config.copyright);
    
    // Handle icon configuration
    if (iconData) {
      template = template.replace(/{{iconConfig}}/g, ',\n      "icon": "app/icon.ico"');
    } else {
      template = template.replace(/{{iconConfig}}/g, '');
    }

    await fs.writeFile(outputPath, template);
    console.log('Generated package.json');
  }

  /**
   * Process custom icon file
   * @param {string} electronAppDir - Electron app directory
   * @param {object} iconData - Icon file data
   */
  async processCustomIcon(electronAppDir, iconData) {
    try {
      const appDir = path.join(electronAppDir, 'app');
      await fs.ensureDir(appDir);
      
      const iconPath = path.join(appDir, 'icon.ico');
      
      // For now, just save the icon as-is
      // In a production system, you might want to convert PNG/JPG to ICO format
      await fs.writeFile(iconPath, iconData.buffer);
      
      console.log(`Custom icon saved: ${iconData.originalname} -> icon.ico`);
      
    } catch (error) {
      console.warn('Failed to process custom icon:', error.message);
      // Don't throw error - just log warning and continue without icon
    }
  }

  /**
   * Ensure cached node_modules exists and is up to date
   * @param {string} packageJsonPath - Path to package.json to check against cache
   */
  async ensureCachedNodeModules(packageJsonPath) {
    try {
      await fs.ensureDir(this.cacheDir);
      
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
      const packageHash = require('crypto').createHash('md5').update(packageJsonContent).digest('hex');
      const hashFile = path.join(this.cacheDir, 'package-hash.txt');
      
      // Check if cache exists and is valid
      let cacheValid = false;
      if (await fs.pathExists(this.nodeModulesCacheDir) && await fs.pathExists(hashFile)) {
        const cachedHash = await fs.readFile(hashFile, 'utf8');
        cacheValid = (cachedHash.trim() === packageHash);
      }
      
      if (!cacheValid) {
        console.log('Creating or updating cached node_modules...');
        
        // Create temporary directory for installing dependencies
        const tempDir = path.join(this.cacheDir, 'temp-install');
        await fs.ensureDir(tempDir);
        
        // Copy package.json to temp directory
        await fs.copy(packageJsonPath, path.join(tempDir, 'package.json'));
        
        // Install dependencies in temp directory
        execSync('npm install --production', {
          cwd: tempDir,
          stdio: 'pipe',
          timeout: 120000 // 2 minutes timeout
        });
        
        // Remove old cache if it exists
        if (await fs.pathExists(this.nodeModulesCacheDir)) {
          await fs.remove(this.nodeModulesCacheDir);
        }
        
        // Move node_modules to cache
        await fs.move(path.join(tempDir, 'node_modules'), this.nodeModulesCacheDir);
        
        // Save package hash
        await fs.writeFile(hashFile, packageHash);
        
        // Clean up temp directory
        await fs.remove(tempDir);
        
        console.log('Cached node_modules created successfully');
      } else {
        console.log('Using existing cached node_modules');
      }
    } catch (error) {
      throw new Error(`Failed to ensure cached node_modules: ${error.message}`);
    }
  }

  /**
   * Install Electron dependencies using cache
   * @param {string} electronAppDir - Electron app directory
   */
  async installDependencies(electronAppDir) {
    try {
      console.log('Installing Electron dependencies from cache...');
      
      const packageJsonPath = path.join(electronAppDir, 'package.json');
      const nodeModulesPath = path.join(electronAppDir, 'node_modules');
      
      // Ensure cached node_modules exists and is up to date
      await this.ensureCachedNodeModules(packageJsonPath);
      
      // Copy cached node_modules to electron app directory
      console.log('Copying cached node_modules...');
      await fs.copy(this.nodeModulesCacheDir, nodeModulesPath);
      
      console.log('Dependencies installed successfully from cache');
    } catch (error) {
      console.warn('Cache installation failed, falling back to npm install:', error.message);
      
      // Fallback to traditional npm install if cache fails
      try {
        execSync('npm install', {
          cwd: electronAppDir,
          stdio: 'pipe',
          timeout: 120000 // 2 minutes timeout
        });
        
        console.log('Dependencies installed successfully via npm install');
      } catch (npmError) {
        throw new Error(`Failed to install dependencies: ${npmError.message}`);
      }
    }
  }

  /**
   * Find built executable files
   * @param {string} electronAppDir - Electron app directory
   * @returns {Array} Array of executable file paths
   */
  async findBuiltExecutable(electronAppDir) {
    const distDir = path.join(electronAppDir, 'dist');
    return await this.findBuiltExecutableInDirectory(distDir);
  }

  /**
   * Find built executable files in a specific directory
   * @param {string} distDir - Directory to search in
   * @returns {Array} Array of executable file paths
   */
  async findBuiltExecutableInDirectory(distDir) {
    const files = [];

    console.log(`Looking for executables in: ${distDir}`);

    if (!(await fs.pathExists(distDir))) {
      console.log('Dist directory does not exist');
      return files;
    }

    // Recursively search for executable files
    const searchDirectory = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isFile()) {
          // Check for Windows executable file extensions only
          const ext = path.extname(entry.name).toLowerCase();
          if (['.exe'].includes(ext)) {
            console.log(`Found executable: ${fullPath}`);
            files.push(fullPath);
          }
        } else if (entry.isDirectory()) {
          // Recursively check subdirectories
          await searchDirectory(fullPath);
        }
      }
    };

    await searchDirectory(distDir);

    console.log(`Found ${files.length} executable files`);
    return files;
  }

  /**
   * Sanitize app name for use in file systems and package names
   * @param {string} name - Raw app name
   * @returns {string} Sanitized app name
   */
  sanitizeAppName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) || 'my-app';
  }

  /**
   * Generate app ID from app name
   * @param {string} appName - Sanitized app name
   * @returns {string} App ID
   */
  generateAppId(appName) {
    return appName.replace(/-/g, '');
  }

  /**
   * Generate product name from app name
   * @param {string} appName - Sanitized app name
   * @returns {string} Product name
   */
  generateProductName(appName) {
    return appName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate copyright string
   * @param {string} authorOrCompany - Author or company name
   * @returns {string} Copyright string
   */
  generateCopyright(authorOrCompany) {
    const currentYear = new Date().getFullYear();
    return `Copyright © ${currentYear} ${authorOrCompany}`;
  }

  /**
   * Clear the cached node_modules directory
   * Useful for debugging or when dependencies need to be refreshed
   */
  async clearCache() {
    try {
      if (await fs.pathExists(this.cacheDir)) {
        await fs.remove(this.cacheDir);
        console.log('Cache cleared successfully');
      } else {
        console.log('No cache to clear');
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error.message);
    }
  }

  /**
   * Get cache status and size
   * @returns {object} Cache information
   */
  async getCacheInfo() {
    try {
      const cacheExists = await fs.pathExists(this.nodeModulesCacheDir);
      if (!cacheExists) {
        return { exists: false, size: 0 };
      }

      const stats = await fs.stat(this.nodeModulesCacheDir);
      const hashFile = path.join(this.cacheDir, 'package-hash.txt');
      const hashExists = await fs.pathExists(hashFile);
      
      return {
        exists: true,
        size: stats.size,
        lastModified: stats.mtime,
        hasValidHash: hashExists
      };
    } catch (error) {
      return { exists: false, size: 0, error: error.message };
    }
  }

  /**
   * Get available build targets (Windows only)
   * @returns {Array} Array of available targets
   */
  getAvailableTargets() {
    return ['nsis', 'portable'];
  }
}

module.exports = new ElectronBuilder();