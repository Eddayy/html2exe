const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');
const sharpIco = require('sharp-ico');

class ExeBuilder {
  constructor() {
    this.distDir = path.join(__dirname, '..', 'dist');
    this.tempDir = path.join(__dirname, '..', 'temp');
  }

  /**
   * Create Wails application from user content
   * @param {string} buildDir - Directory containing user content
   * @param {string} buildId - Unique build identifier
   * @param {object} config - App configuration options
   * @param {object} iconData - Icon file data (optional)
   * @returns {string} Path to created Wails app
   */
  async createWailsApp(buildDir, buildId, config = {}, iconData = null) {
    try {
      const wailsAppDir = path.join(buildDir, 'wails-app');
      // Don't create wailsAppDir yet - let Wails init create it

      // Default configuration
      const userAppName = config.appName || 'My App';
      const sanitizedName = this.sanitizeAppName(userAppName);
      
      // Validate the sanitized name
      if (!sanitizedName || sanitizedName === 'my-app' && userAppName !== 'My App') {
        throw new Error(`Invalid app name: "${userAppName}". App names must contain at least one alphanumeric character.`);
      }
      
      const appConfig = {
        // Sanitized fields that must not be overridden
        appName: sanitizedName,                       // Technical name (sanitized)
        productName: userAppName,                     // Display name (as user typed)
        // User-configurable fields
        version: config.version || '1.0.0',
        description: config.description || 'Generated desktop application from HTML',
        width: parseInt(config.width) || 1200,
        height: parseInt(config.height) || 800,
        company: config.company || 'HTML2EXE Converter'
      };

      // Generate derived properties
      appConfig.appId = this.generateAppId(appConfig.appName);
      appConfig.copyright = this.generateCopyright(appConfig.company);

      console.log(`Creating Wails app for build ${buildId}`);
      console.log(`Technical name: ${appConfig.appName}`);
      console.log(`Display name: ${appConfig.productName}`);

      // Initialize Wails project
      await this.initWailsProject(wailsAppDir, appConfig);
      
      // Check if content is static files (no package.json) or a Node.js project
      const userContentDir = path.join(buildDir, 'content');
      const packageJsonPath = path.join(userContentDir, 'package.json');
      const isStaticContent = !(await fs.pathExists(packageJsonPath));

      if (isStaticContent) {
        // For static files, copy directly to frontend/dist and skip npm commands
        const frontendDistDir = path.join(wailsAppDir, 'frontend', 'dist');
        // Clear existing dist directory to prevent file conflicts
        await fs.remove(frontendDistDir);
        await fs.ensureDir(frontendDistDir);
        await fs.copy(userContentDir, frontendDistDir);
        console.log('Static content detected - copied directly to frontend/dist');
      } else {
        // For Node.js projects, copy to frontend directory as before
        const frontendDir = path.join(wailsAppDir, 'frontend');
        // Clear existing frontend directory to prevent file conflicts
        await fs.remove(frontendDir);
        await fs.ensureDir(frontendDir);
        await fs.copy(userContentDir, frontendDir);
        console.log('Node.js project detected - copied to frontend directory');
      }

      // Update Wails configuration
      await this.updateWailsConfig(wailsAppDir, appConfig, isStaticContent);
      
      // Update main.go with window dimensions and embed path
      await this.updateMainGo(wailsAppDir, appConfig);

      // Process custom icon if provided
      if (iconData) {
        await this.processCustomIcon(wailsAppDir, iconData);
      }

      console.log(`Wails app created successfully for build ${buildId}`);
      return wailsAppDir;

    } catch (error) {
      throw new Error(`Failed to create Wails app: ${error.message}. This usually indicates an issue with file permissions or disk space.`);
    }
  }

  /**
   * Build executable from Wails app
   * @param {string} wailsAppPath - Path to Wails app directory
   * @param {string} buildId - Unique build identifier
   * @returns {string} Path to built executable directory
   */
  async buildExecutable(wailsAppPath, buildId) {
    try {
      console.log(`Building executable for build ${buildId}`);

      const outputDir = path.join(this.distDir, buildId);
      await fs.ensureDir(outputDir);

      // Build the application using Wails
      const buildCommand = `wails build -platform windows/amd64`;
      
      console.log(`Executing build command: ${buildCommand}`);
      console.log(`Working directory: ${wailsAppPath}`);

      try {
        const output = execSync(buildCommand, {
          cwd: wailsAppPath,
          stdio: 'pipe',
          timeout: 600000, // 10 minutes timeout
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
        throw new Error(`Build command failed: ${buildError.message}. This could be due to missing Go, Wails CLI, or insufficient system resources.`);
      }

      // List contents of wails app directory after build
      try {
        const wailsAppContents = await fs.readdir(wailsAppPath);
        console.log('Wails app directory contents after build:', wailsAppContents);
        
        const buildPath = path.join(wailsAppPath, 'build', 'bin');
        if (await fs.pathExists(buildPath)) {
          const buildContents = await fs.readdir(buildPath);
          console.log('Build directory contents:', buildContents);
        }
      } catch (listError) {
        console.warn('Failed to list directory contents:', listError.message);
      }

      // Find and move the built executable
      const builtFiles = await this.findBuiltExecutable(wailsAppPath);
      
      if (builtFiles.length === 0) {
        // Check for executables in build/bin if local search fails
        const buildBinDir = path.join(wailsAppPath, 'build', 'bin');
        
        if (await fs.pathExists(buildBinDir)) {
          const buildBinFiles = await this.findBuiltExecutableInDirectory(buildBinDir);
          if (buildBinFiles.length > 0) {
            console.log('Found executables in build/bin directory, copying them...');
            for (const file of buildBinFiles) {
              const fileName = path.basename(file);
              const destPath = path.join(outputDir, fileName);
              await fs.copy(file, destPath);
              console.log(`Copied executable from build/bin: ${fileName}`);
            }
            console.log(`Build completed successfully for build ${buildId}`);
            return outputDir;
          }
        }
        
        throw new Error('No executable files found after build. The Wails build process may have failed silently or the build output was not generated correctly.');
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
   * Initialize Wails project using CLI
   * @param {string} wailsAppDir - Wails app directory
   * @param {object} config - App configuration
   */
  async initWailsProject(wailsAppDir, config) {
    try {
      const projectName = config.appName;
      console.log(`Initializing Wails project: ${projectName}`);
      
      // Create a temporary directory for wails init
      const tempInitDir = path.join(this.tempDir, `wails-init-${Date.now()}`);
      await fs.ensureDir(tempInitDir);
      
      try {
        // Initialize Wails project with vanilla template in temp directory
        const initCommand = `wails init -n "${projectName}" -t vanilla`;
        
        execSync(initCommand, {
          cwd: tempInitDir,
          stdio: 'pipe',
          timeout: 60000, // 1 minute timeout
          encoding: 'utf8'
        });
        
        // Move the generated project to our target directory
        const generatedDir = path.join(tempInitDir, projectName);
        if (await fs.pathExists(generatedDir)) {
          // Ensure parent directory exists
          await fs.ensureDir(path.dirname(wailsAppDir));
          await fs.move(generatedDir, wailsAppDir);
          console.log('Wails project initialized successfully');
        } else {
          throw new Error(`Wails init did not create expected directory: ${generatedDir}`);
        }
      } finally {
        // Clean up temporary directory
        await fs.remove(tempInitDir).catch(err => {
          console.warn('Failed to clean up temp directory:', err.message);
        });
      }
    } catch (error) {
      throw new Error(`Failed to initialize Wails project: ${error.message}`);
    }
  }


  /**
   * Update Wails configuration file
   * @param {string} wailsAppDir - Wails app directory
   * @param {object} config - App configuration
   * @param {boolean} isStaticContent - Whether content is static files without package.json
   */
  async updateWailsConfig(wailsAppDir, config, isStaticContent = false) {
    try {
      const configPath = path.join(wailsAppDir, 'wails.json');
      
      // Read existing wails.json
      const wailsConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      
      // Create configuration based on content type
      let minimalConfig;
      
      if (isStaticContent) {
        // For static content - no npm install/build commands
        minimalConfig = {
          version: wailsConfig.version || '1',
          name: config.appName,
          outputfilename: config.productName,
          'frontend:dir': 'frontend/dist',
          'frontend:install': '',
          'frontend:build': '',
          'frontend:dev:watcher': '',
          'frontend:dev:serverUrl': 'auto',
          info: {
            companyName: config.company,
            productVersion: config.version,
            copyright: config.copyright,
            comments: config.description
          }
        };
      } else {
        // For Node.js projects - keep npm commands
        minimalConfig = {
          version: wailsConfig.version || '1',
          name: config.appName,
          outputfilename: config.productName,
          'frontend:dir': 'frontend',
          'frontend:install': 'npm install',
          'frontend:build': 'npm run build',
          'frontend:dev:watcher': 'npm run dev',
          'frontend:dev:serverUrl': 'auto',
          info: {
            companyName: config.company,
            productVersion: config.version,
            copyright: config.copyright,
            comments: config.description
          }
        };
      }
      
      // Replace entire config with minimal version
      Object.keys(wailsConfig).forEach(key => delete wailsConfig[key]);
      Object.assign(wailsConfig, minimalConfig);
      
      // Write updated configuration
      await fs.writeFile(configPath, JSON.stringify(wailsConfig, null, 2));
      console.log('Updated wails.json configuration');
    } catch (error) {
      throw new Error(`Failed to update Wails configuration: ${error.message}`);
    }
  }

  /**
   * Update main.go with window dimensions and embed path
   * @param {string} wailsAppDir - Wails app directory
   * @param {object} config - App configuration
   */
  async updateMainGo(wailsAppDir, config) {
    try {
      const mainGoPath = path.join(wailsAppDir, 'main.go');
      let mainGoContent = await fs.readFile(mainGoPath, 'utf8');
      
      // Update window title, width, and height in the Wails options
      mainGoContent = mainGoContent.replace(/Title:\s*"[^"]*"/, `Title:  "${config.productName}"`);
      mainGoContent = mainGoContent.replace(/Width:\s*\d+/, `Width:  ${config.width}`);
      mainGoContent = mainGoContent.replace(/Height:\s*\d+/, `Height: ${config.height}`);
      
      // Update embed directive to point to frontend directory (not frontend/dist)
      // mainGoContent = mainGoContent.replace(/\/\/go:embed all:frontend\/dist/, '//go:embed all:frontend');
      
      await fs.writeFile(mainGoPath, mainGoContent);
      console.log('Updated main.go with window configuration and embed path');
    } catch (error) {
      throw new Error(`Failed to update main.go: ${error.message}`);
    }
  }
  
  /**
   * Process custom icon file for Wails
   * @param {string} wailsAppDir - Wails app directory
   * @param {object} iconData - Icon file data
   */
  async processCustomIcon(wailsAppDir, iconData) {
    try {
      console.log(`Processing custom icon: ${iconData.originalname}`);
      
      // Get image metadata to check current size
      const imageInfo = await sharp(iconData.buffer).metadata();
      console.log(`Original image size: ${imageInfo.width}x${imageInfo.height}`);
      
      // Create build/windows directory structure
      const windowsBuildDir = path.join(wailsAppDir, 'build', 'windows');
      await fs.ensureDir(windowsBuildDir);
      
      // Process as ICO for Windows using sharp-ico
      console.log(`Converting icon to ICO format for Windows`);
      
      // Resize to 256x256 and convert to PNG first
      const pngBuffer = await sharp(iconData.buffer)
        .resize(256, 256, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
        })
        .png()
        .toBuffer();
      
      // Convert PNG to ICO using sharp-ico
      const icoBuffer = sharpIco.encode([pngBuffer]);
      
      // Save as icon.ico in build/windows directory
      const iconPath = path.join(windowsBuildDir, 'icon.ico');
      await fs.writeFile(iconPath, icoBuffer);
      
      // Also create appicon.png in build root for other uses
      const buildDir = path.join(wailsAppDir, 'build');
      await fs.ensureDir(buildDir);
      
      const appIconBuffer = await sharp(iconData.buffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();
      
      const appiconPath = path.join(buildDir, 'appicon.png');
      await fs.writeFile(appiconPath, appIconBuffer);
      
      console.log(`Custom icon processed and saved to build/windows/icon.ico and build/appicon.png`);
      
    } catch (error) {
      console.warn('Failed to process custom icon:', error.message);
      console.warn('Continuing without custom icon...');
      // Don't throw error - just log warning and continue without icon
    }
  }


  /**
   * Find built executable files
   * @param {string} wailsAppDir - Wails app directory
   * @returns {Array} Array of executable file paths
   */
  async findBuiltExecutable(wailsAppDir) {
    const buildBinDir = path.join(wailsAppDir, 'build', 'bin');
    return await this.findBuiltExecutableInDirectory(buildBinDir);
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
   * Sanitize app name for npm package.json name field (follows npm naming rules)
   * @param {string} name - Raw app name
   * @returns {string} Sanitized app name
   */
  sanitizeAppName(name) {
    return name
      .toLowerCase()
      .trim()
      // Replace spaces, underscores with hyphens
      .replace(/[\s_]+/g, '-')
      // Remove all characters except lowercase letters, numbers, hyphens, dots
      .replace(/[^a-z0-9.-]/g, '')
      // Replace multiple hyphens/dots with single ones
      .replace(/[-]{2,}/g, '-')
      .replace(/[.]{2,}/g, '.')
      // Remove leading/trailing hyphens, dots, or underscores (npm rule)
      .replace(/^[.-]+|[.-]+$/g, '')
      // Ensure doesn't start with dot or underscore (npm rule)
      .replace(/^[._]/, '')
      // Ensure it doesn't start with numbers (add 'app-' prefix)
      .replace(/^(\d)/, 'app-$1')
      // Ensure minimum length and npm-compliant fallback
      .substring(0, 214) || 'my-app'; // npm max length is 214 chars
  }

  /**
   * Generate app ID from app name (for reverse-domain style identifier)
   * @param {string} appName - Sanitized app name  
   * @returns {string} App ID in reverse domain format
   */
  generateAppId(appName) {
    // Convert to reverse domain style (com.html2exe.appname)
    const cleanName = appName.replace(/[.-]/g, ''); // Remove dots and hyphens
    // Ensure it starts with a letter for valid identifier
    const validName = cleanName.match(/^[a-z]/) ? cleanName : `app${cleanName}`;
    return validName.substring(0, 50); // Keep reasonable length for app ID
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
   * @param {string} company - Company name
   * @returns {string} Copyright string
   */
  generateCopyright(company) {
    const currentYear = new Date().getFullYear();
    return `Copyright © ${currentYear} ${company}`;
  }

}

module.exports = new ExeBuilder();