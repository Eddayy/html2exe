# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HTML2EXE Converter is a Node.js web service that converts HTML/CSS/JS projects packaged as ZIP files into Windows executable desktop applications using Electron. The service processes uploaded ZIP files, validates their contents, and builds portable Windows executables.

## Architecture

The application follows a modular architecture:

- **server.js**: Express.js server with REST API endpoints for conversion, download, and status checking
- **services/fileProcessor.js**: Handles ZIP file extraction, validation, and security checks
- **services/electronBuilder.js**: Creates Electron applications and builds Windows executables
- **templates/**: Contains template files for generating Electron app structure
- **public/**: Static web interface for file uploads
- **temp/**: Temporary storage for processing (auto-cleaned every 15 minutes)
- **dist/**: Final executable output directory

## Development Commands

```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Run tests
npm test
```

## Key Features

- ZIP file upload with security validation (50MB limit, file type restrictions)
- HTML/CSS/JS content extraction and validation
- Electron app generation from templates with variable substitution
- Windows executable building (portable .exe format)
- Automatic cleanup of temporary files
- Security headers via Helmet (CORS, CSP)
- Custom icon support (PNG, JPG, ICO formats up to 5MB)

## Security Measures

The application implements several security layers:
- File extension blocking for executables (.exe, .bat, .sh, etc.)
- Path traversal protection during ZIP extraction
- Content validation for HTML files (warns about external scripts, event handlers)
- 10MB per-file and 50MB total size limits
- CORS and CSP headers via Helmet middleware

## Template System

Electron applications are generated from templates in `/templates/` with variable substitution:
- `main.js.template`: Electron main process with security restrictions
- `package.json.template`: Package configuration with electron-builder settings
- `preload.js.template`: Preload script for renderer security (referenced but not in current templates/)

## Build Process

1. ZIP file uploaded via POST `/api/convert`
2. Content extracted to `temp/{buildId}/content/`
3. Electron app structure created in `temp/{buildId}/electron-app/`
4. Dependencies installed from cache (optimized - copies cached node_modules instead of running npm install for each build)
5. Windows executable built via `npm run build` (electron-builder)
6. Output moved to `dist/{buildId}/` for download

### Node Modules Caching

To optimize build performance, the system uses a shared node_modules cache:
- First build installs dependencies in `.cache/node_modules/`
- Subsequent builds copy from cache instead of reinstalling
- Cache is invalidated when package.json template changes (MD5 hash check)
- Fallback to npm install if cache copy fails
- Cache directory is automatically created and managed

## API Endpoints

- `POST /api/convert`: Upload ZIP and optional icon, returns build ID
- `GET /api/download/{buildId}`: Download generated executable
- `GET /api/status/{buildId}`: Check build status
- `GET /api/health`: Health check endpoint