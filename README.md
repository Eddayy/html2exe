# HTML2EXE

Convert your HTML/CSS/JavaScript web applications into native Windows desktop executables.

## What it does

HTML2EXE is a web service that takes your web application (uploaded as a ZIP file) and converts it into a standalone Windows .exe file using the Wails framework. No need to learn desktop development - if you can build a web app, you can create a desktop app.

## Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start the server:**
   ```bash
   pnpm dev
   ```

3. **Open your browser:** Navigate to `http://localhost:3000`

4. **Upload your web app:** ZIP your HTML/CSS/JS files and upload them

5. **Download your .exe:** Wait for the build to complete and download your Windows executable

## Requirements

- Node.js ≥16.0.0
- Go programming language
- Wails CLI framework

## Supported Web Applications

- **Static sites**: HTML, CSS, JavaScript files
- **Node.js projects**: React, Vue, Angular, or any project with package.json
- **Custom icons**: Optional .ico or .png files for your app

## API Usage

If you want to integrate programmatically:

- `POST /api/convert` - Upload ZIP file for conversion
- `GET /api/status/:buildId` - Check build progress
- `GET /api/download/:buildId` - Download the executable
- `GET /api/health` - Service health check

## Docker

```bash
# Build image
docker build -t html2exe .

# Run container
docker run -p 3000:3000 html2exe
```

## Development

For detailed development instructions, architecture details, and AI assistant context, see [CLAUDE.md](./CLAUDE.md).

## License

[Add your license here]