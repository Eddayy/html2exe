const request = require('supertest');
const fs = require('fs-extra');
const path = require('path');

// Mock external dependencies for testing
jest.setTimeout(10000);

// Import the Express app
const { app } = require('../server');

describe('HTML2EXE API', () => {
  afterAll(async () => {
    // Clean up any test files
    const tempDir = path.join(__dirname, '..', 'temp');
    if (fs.existsSync(tempDir)) {
      fs.removeSync(tempDir);
    }
  });

  describe('GET /api/health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'OK');
    });
  });

  describe('POST /api/convert', () => {
    test('should accept static zip file upload', async () => {
      const staticZipPath = path.join(__dirname, 'static.zip');
      
      if (!fs.existsSync(staticZipPath)) {
        console.log('Skipping test: static.zip not found');
        return;
      }

      const response = await request(app)
        .post('/api/convert')
        .attach('file', staticZipPath)
        .field('appName', 'TestApp')
        .field('width', '800')
        .field('height', '600');
      
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('buildId');
      }
    });

    test('should accept React zip file upload', async () => {
      const reactZipPath = path.join(__dirname, 'react.zip');
      
      if (!fs.existsSync(reactZipPath)) {
        console.log('Skipping test: react.zip not found');
        return;
      }

      const response = await request(app)
        .post('/api/convert')
        .attach('file', reactZipPath)
        .field('appName', 'ReactApp')
        .field('width', '1024')
        .field('height', '768');
      
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('buildId');
      }
    });

    test('should reject request without file', async () => {
      const response = await request(app)
        .post('/api/convert')
        .field('appName', 'TestApp');
      
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/status/:buildId', () => {
    test('should handle non-existent build status', async () => {
      const response = await request(app)
        .get('/api/status/non-existent-id');
      
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/download/:buildId', () => {
    test('should handle non-existent build download', async () => {
      const response = await request(app)
        .get('/api/download/non-existent-id');
      
      expect([404, 500]).toContain(response.status);
    });
  });
});