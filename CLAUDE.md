# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HTML2EXE is a web service that converts HTML/CSS/JavaScript applications into Windows desktop executables using the Wails framework. It provides a web interface for uploading ZIP files and generates native Windows .exe files through an asynchronous build pipeline.

## Development Commands

```bash
# Start development server with auto-reload
pnpm dev

# Start production server
pnpm start

# Run tests
pnpm test

# Install dependencies
pnpm install

# Build Docker image
docker build -t html2exe .

# Run with Docker (development with volume mounting)
docker run -p 3000:3000 -v $(pwd):/app html2exe
```

## Core Architecture

### Build Pipeline Flow
The conversion process follows these tracked phases:
1. **UPLOADING** → **EXTRACTING** → **VALIDATING** → **GENERATING** → **INSTALLING** → **BUILDING** → **DISTRIBUTING** → **COMPLETED**

### Key Services
- **`services/fileProcessor.js`**: ZIP extraction, validation, security checks, and content type detection
- **`services/exeBuilder.js`**: Wails project creation, Go app configuration, and Windows executable building

### Static vs Dynamic Content Detection
The system detects content type by checking for `package.json`:
- **Static content** (no package.json): Files copied directly to `frontend/dist`, wails.json skips npm commands
- **Node.js projects** (with package.json): Files copied to `frontend`, wails.json includes npm install/build commands

## Wails Integration

### Project Structure Generated
```
temp/{buildId}/wails-app/
├── main.go              # Go application with window config
├── wails.json           # Frontend build configuration
├── frontend/            # User content location
│   ├── dist/           # Static files (or build output)
│   └── [user files]    # Original web application
└── build/              # Icons and build artifacts
```

### Build Configuration
- Uses Wails vanilla template for initialization
- Targets Windows/amd64 platform exclusively
- Embeds frontend assets using Go embed directive
- Processes custom icons to Windows ICO format using Sharp

## API Endpoints

- `POST /api/convert` - Upload ZIP file with optional config (appName, version, width, height, etc.)
- `GET /api/status/:buildId` - Real-time build progress tracking
- `GET /api/download/:buildId` - Download completed executable
- `GET /api/health` - Service health check

## File Processing Rules

### Security Validations
- ZIP files limited to 50MB
- Icon files limited to 5MB
- Blocked file extensions for security
- Directory traversal protection
- Path sanitization for Windows compatibility

### Content Requirements
- Must contain at least one HTML file
- Supports nested directory structures
- Validates file types and content

## System Dependencies

### Required External Tools
- **Go**: Programming language runtime
- **Wails CLI**: Desktop application framework (`wails build` command)
- **Node.js**: >=16.0.0 for server runtime

### Build Process
The system uses `execSync` to run `wails build -platform windows/amd64` with:
- 10-minute timeout for builds
- 10MB output buffer
- Working directory set to generated Wails app

## Error Handling & Cleanup

- Build status tracking with in-memory Map
- Automatic cleanup every 15 minutes
- 2-hour retention for temporary files
- Graceful shutdown with resource cleanup on process termination

## Development Notes

### Testing
- Test files exist in `test/` directory (static.zip, react.zip)
- Jest + Supertest testing framework implemented
- Run tests with `pnpm test`

### File Paths
All file operations use absolute paths. Temporary builds are stored in `temp/{buildId}/` and final executables in `dist/{buildId}/`.

### Icon Processing
Custom icons are processed through Sharp.js pipeline:
1. Resize to 256x256 for ICO conversion
2. Generate Windows-compatible ICO file
3. Create 512x512 PNG for app icon
4. Place in `build/windows/icon.ico` and `build/appicon.png`