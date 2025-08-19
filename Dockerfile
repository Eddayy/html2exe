# Multi-stage build for HTML2EXE converter
FROM node:24-alpine AS base

# Install system dependencies and pnpm
RUN apk add --no-cache \
    ca-certificates \
    git \
    bash && \
    npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install Node.js dependencies
RUN pnpm install --prod --frozen-lockfile

# Go build stage
FROM golang:1.25-alpine AS go-builder

# Install system dependencies for Go/Wails
RUN apk add --no-cache \
    gcc \
    musl-dev \
    git \
    bash

# Set GOBIN to ensure wails is installed in a known location
ENV GOBIN=/usr/local/bin

# Install Wails CLI
RUN go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Final runtime stage
FROM node:24-alpine

# Install runtime dependencies and pnpm
RUN apk add --no-cache \
    ca-certificates \
    git \
    bash \
    gcc \
    musl-dev && \
    npm install -g pnpm

# Copy Go and Wails from builder stage
COPY --from=golang:1.25-alpine /usr/local/go /usr/local/go
COPY --from=go-builder /usr/local/bin/wails /usr/local/bin/wails

# Set Go environment
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/home/appuser/go"
ENV GOROOT="/usr/local/go"
ENV GOCACHE="/home/appuser/.cache/go-build"

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy application dependencies from base stage
COPY --from=base --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=appuser:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p temp dist /home/appuser/go /home/appuser/.cache && \
    chown -R appuser:nodejs temp dist /home/appuser && \
    chmod -R 755 temp dist /home/appuser

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["pnpm", "start"]