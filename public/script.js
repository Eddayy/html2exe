class HTML2EXEConverter {
    constructor() {
        this.currentFile = null;
        this.currentIconFile = null;
        this.currentBuildId = null;
        this.initializeElements();
        this.attachEventListeners();
        this.initializeDragAndDrop();
    }

    initializeElements() {
        // Sections
        this.uploadSection = document.getElementById('uploadSection');
        this.configSection = document.getElementById('configSection');
        this.progressSection = document.getElementById('progressSection');
        this.resultSection = document.getElementById('resultSection');

        // Upload elements
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.browseBtn = document.getElementById('browseBtn');

        // Config elements
        this.appNameInput = document.getElementById('appName');
        this.appDescriptionInput = document.getElementById('appDescription');
        this.appWidthInput = document.getElementById('appWidth');
        this.appHeightInput = document.getElementById('appHeight');
        this.appVersionInput = document.getElementById('appVersion');
        this.appCompanyInput = document.getElementById('appCompany');

        // Icon upload elements
        this.iconFile = document.getElementById('iconFile');
        this.iconUploadArea = document.getElementById('iconUploadArea');
        this.iconPreview = document.getElementById('iconPreview');
        this.iconPreviewImage = document.getElementById('iconPreviewImage');
        this.iconUploadPlaceholder = document.getElementById('iconUploadPlaceholder');
        this.removeIconBtn = document.getElementById('removeIconBtn');

        // Action buttons
        this.backBtn = document.getElementById('backBtn');
        this.convertBtn = document.getElementById('convertBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.downloadBtn = document.getElementById('downloadBtn');

        // Progress elements
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.progressSteps = {
            step1: document.getElementById('step1'),
            step2: document.getElementById('step2'),
            step3: document.getElementById('step3'),
            step4: document.getElementById('step4')
        };

        // Result elements
        this.resultSuccess = document.getElementById('resultSuccess');
        this.resultError = document.getElementById('resultError');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorDetails = document.getElementById('errorDetails');
        this.errorDetailText = document.getElementById('errorDetailText');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');

        // Loading overlay
        this.loadingOverlay = document.getElementById('loadingOverlay');
    }

    attachEventListeners() {
        // File input
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.browseBtn.addEventListener('click', () => this.fileInput.click());

        // Navigation buttons
        this.backBtn.addEventListener('click', () => this.showUploadSection());
        this.convertBtn.addEventListener('click', () => this.startConversion());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.downloadBtn.addEventListener('click', () => this.downloadFile());

        // Form validation
        this.appNameInput.addEventListener('input', () => this.validateForm());
        this.appDescriptionInput.addEventListener('input', () => this.validateForm());
        this.appWidthInput.addEventListener('input', () => this.validateForm());
        this.appHeightInput.addEventListener('input', () => this.validateForm());

        // Icon upload
        this.iconFile.addEventListener('change', (e) => this.handleIconSelect(e));
        this.iconUploadArea.addEventListener('click', () => this.iconFile.click());
        this.removeIconBtn.addEventListener('click', (e) => this.removeIcon(e));
    }

    initializeDragAndDrop() {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Highlight drop area
        ['dragenter', 'dragover'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.remove('dragover');
            });
        });

        // Handle dropped files
        this.uploadArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // Handle click to browse
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.handleFile(file);
        }
    }

    handleFile(file) {
        // Validate file
        if (!this.validateFile(file)) {
            return;
        }

        this.currentFile = file;
        
        // Auto-populate app name from file name
        const fileName = file.name.replace(/\.zip$/i, '');
        this.appNameInput.value = this.sanitizeAppName(fileName);
        
        // Show config section
        this.showConfigSection();
    }

    validateFile(file) {
        // Check file type
        if (!file.type.includes('zip') && !file.name.toLowerCase().endsWith('.zip')) {
            this.showError('Please select a ZIP file.');
            return false;
        }

        // Check file size (50MB limit)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showError('File size exceeds 50MB limit.');
            return false;
        }

        return true;
    }

    sanitizeAppName(name) {
        return name
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase()
            .substring(0, 50);
    }


    async startConversion() {
        if (!this.currentFile || !this.validateForm()) {
            return;
        }

        this.showProgressSection();
        
        try {
            // Create form data
            const formData = new FormData();
            formData.append('zipFile', this.currentFile);
            
            // Add icon file if provided
            if (this.currentIconFile) {
                formData.append('iconFile', this.currentIconFile);
            }
            
            // Add configuration
            const config = {
                appName: this.appNameInput.value.trim(),
                description: this.appDescriptionInput.value.trim(),
                width: parseInt(this.appWidthInput.value),
                height: parseInt(this.appHeightInput.value),
                version: this.appVersionInput.value.trim(),
                company: this.appCompanyInput.value.trim()
            };

            // Add config to form data
            Object.keys(config).forEach(key => {
                // Send all config values, even empty strings (but not undefined/null)
                if (config[key] !== undefined && config[key] !== null) {
                    formData.append(key, config[key]);
                }
            });

            // Start upload - simplified to just show building phase
            this.updateProgress(10, 'Starting build...', 1);

            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Upload failed');
            }

            const result = await response.json();
            
            if (result.success) {
                this.currentBuildId = result.buildId;
                this.updateProgress(30, 'Build started...', 1);
                
                // Poll for completion
                await this.pollBuildStatus();
            } else {
                throw new Error(result.message || 'Conversion failed');
            }

        } catch (error) {
            console.error('Conversion error:', error);
            this.showErrorResult(error.message);
        }
    }

    async pollBuildStatus() {
        const maxAttempts = 100; // 10 minutes maximum (increased for longer builds)
        let attempts = 0;

        const poll = async () => {
            try {
                attempts++;
                
                if (attempts > maxAttempts) {
                    throw new Error('Build timeout - the conversion process is taking longer than expected. Please try again.');
                }

                const response = await fetch(`/api/status/${this.currentBuildId}`);
                
                if (!response.ok) {
                    throw new Error('Failed to check build status');
                }

                const status = await response.json();

                // Handle new granular phases
                if (status.phase) {
                    this.updateProgressFromPhase(status);
                } else {
                    // Legacy fallback
                    this.updateProgressLegacy(status);
                }

                // Continue polling unless completed or failed
                if (status.phase === 'completed') {
                    setTimeout(async () => {
                        await this.showSuccessResult();
                    }, 1000);
                } else if (status.phase === 'failed') {
                    const errorMsg = status.error || 'Build failed with unknown error';
                    this.showErrorResult(errorMsg);
                } else if (status.phase !== 'not_found') {
                    setTimeout(poll, 1000);
                } else {
                    throw new Error('Build not found');
                }

            } catch (error) {
                console.error('Status polling error:', error);
                this.showErrorResult(error.message);
            }
        };

        // Start polling
        setTimeout(poll, 1000);
    }

    updateProgressFromPhase(status) {
        const phaseConfig = {
            'building': { 
                progress: 50, 
                text: status.note || 'Building Windows executable...', 
                step: 2,
                animate: true
            },
            'completed': { progress: 100, text: 'Build completed successfully!', step: 3 },
            'failed': { progress: 0, text: 'Build failed', step: 1 }
        };

        const config = phaseConfig[status.phase] || { progress: 50, text: status.description || 'Processing...', step: 2 };
        
        // Add time estimate for building phase
        let displayText = config.text;
        if (status.phase === 'building' && status.estimatedTime) {
            displayText += ` (Est. ${status.estimatedTime})`;
        }
        
        this.updateProgress(config.progress, displayText, config.step, config.animate);
    }

    updateProgressLegacy(status) {
        // Legacy support for old status format
        switch (status.status) {
            case 'processing':
                this.updateProgress(75, 'Building application...', 3);
                break;
            case 'completed':
                this.updateProgress(100, 'Build complete!', 4);
                break;
            default:
                this.updateProgress(50, 'Processing...', 2);
                break;
        }
    }

    updateProgress(percentage, text, step, animate = false) {
        this.progressFill.style.width = `${percentage}%`;
        this.progressText.textContent = text;

        // Add or remove loading animation class
        if (animate) {
            this.progressFill.classList.add('loading-animation');
        } else {
            this.progressFill.classList.remove('loading-animation');
        }

        // Update step indicators - simplified to 3 steps
        Object.keys(this.progressSteps).forEach((key, index) => {
            const stepElement = this.progressSteps[key];
            
            // Only show first 3 steps
            if (index >= 3) {
                stepElement.style.display = 'none';
                return;
            }
            
            stepElement.style.display = 'block';
            
            if (index + 1 < step) {
                stepElement.classList.add('completed');
                stepElement.classList.remove('active');
            } else if (index + 1 === step) {
                stepElement.classList.add('active');
                stepElement.classList.remove('completed');
            } else {
                stepElement.classList.remove('active', 'completed');
            }
        });
    }

    showUploadSection() {
        this.hideAllSections();
        this.uploadSection.style.display = 'block';
        this.currentFile = null;
        this.fileInput.value = '';
    }

    showConfigSection() {
        this.hideAllSections();
        this.configSection.style.display = 'block';
        this.validateForm();
    }

    validateForm() {
        const appName = this.appNameInput.value.trim();
        const appWidth = parseInt(this.appWidthInput.value);
        const appHeight = parseInt(this.appHeightInput.value);
        
        let isValid = true;
        let errorMessage = '';
        
        // Validate app name (following npm package naming rules)
        if (!appName) {
            isValid = false;
            errorMessage = 'App name is required';
        } else if (!/[a-zA-Z0-9]/.test(appName)) {
            isValid = false;
            errorMessage = 'App name must contain at least one letter or number';
        } else if (appName.length > 214) {
            isValid = false;
            errorMessage = 'App name must be 214 characters or less';
        } else if (/^[._]/.test(appName)) {
            isValid = false;
            errorMessage = 'App name cannot start with a dot or underscore';
        } else if (/[A-Z]/.test(appName)) {
            // Warn but don't block - we'll convert to lowercase
            this.showFormValidationMessage('App name will be converted to lowercase for compatibility');
        }
        
        // Validate dimensions
        if (appWidth < 400 || appWidth > 2000) {
            isValid = false;
            errorMessage = 'Window width must be between 400 and 2000 pixels';
        }
        
        if (appHeight < 300 || appHeight > 1500) {
            isValid = false;
            errorMessage = 'Window height must be between 300 and 1500 pixels';
        }
        
        // Update convert button state
        this.convertBtn.disabled = !isValid;
        
        // Show/hide error message if needed
        this.showFormValidationMessage(errorMessage);
        
        return isValid;
    }

    showFormValidationMessage(message) {
        let errorDiv = document.getElementById('formValidationError');
        
        if (message) {
            if (!errorDiv) {
                errorDiv = document.createElement('div');
                errorDiv.id = 'formValidationError';
                errorDiv.className = 'form-validation-error';
                this.convertBtn.parentNode.insertBefore(errorDiv, this.convertBtn);
            }
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        } else if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    showProgressSection() {
        this.hideAllSections();
        this.progressSection.style.display = 'block';
        this.updateProgress(5, 'Preparing...', 1);
    }

    async showSuccessResult() {
        this.hideAllSections();
        this.resultSection.style.display = 'block';
        this.resultSuccess.style.display = 'block';
        this.resultError.style.display = 'none';

        // Update file info - show executable with dynamic size
        const appName = this.appNameInput.value.trim() || 'My App';
        // Sanitize the name for filename display (similar to backend)
        const sanitizedName = appName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        this.fileName.textContent = `${sanitizedName}.exe`;
        this.fileSize.textContent = '~10MB';
    }

    showErrorResult(message, details = null) {
        this.hideAllSections();
        this.resultSection.style.display = 'block';
        this.resultSuccess.style.display = 'none';
        this.resultError.style.display = 'block';

        this.errorMessage.textContent = message;
        
        if (details) {
            this.errorDetails.style.display = 'block';
            this.errorDetailText.textContent = details;
        } else {
            this.errorDetails.style.display = 'none';
        }
    }


    hideAllSections() {
        this.uploadSection.style.display = 'none';
        this.configSection.style.display = 'none';
        this.progressSection.style.display = 'none';
        this.resultSection.style.display = 'none';
    }

    async downloadFile() {
        if (!this.currentBuildId) {
            this.showError('No file available for download');
            return;
        }

        try {
            this.loadingOverlay.style.display = 'flex';

            const response = await fetch(`/api/download/${this.currentBuildId}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Download failed');
            }

            // Get filename from response headers
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'app.exe';
            
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="([^"]+)"/);
                if (match) {
                    filename = match[1];
                }
            }

            // Download the file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('Download error:', error);
            this.showError('Download failed: ' + error.message);
        } finally {
            this.loadingOverlay.style.display = 'none';
        }
    }

    reset() {
        this.currentFile = null;
        this.currentIconFile = null;
        this.currentBuildId = null;
        this.fileInput.value = '';
        
        // Reset form
        this.appNameInput.value = '';
        this.appDescriptionInput.value = '';
        this.appWidthInput.value = '1200';
        this.appHeightInput.value = '800';
        this.appVersionInput.value = '1.0.0';
        this.appCompanyInput.value = '';
        
        // Reset icon
        this.removeIcon();
        
        this.showUploadSection();
    }

    showError(message) {
        // Simple error notification
        alert(message);
    }

    // Icon handling methods
    handleIconSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.handleIconFile(file);
        }
    }

    handleIconFile(file) {
        // Validate icon file
        if (!this.validateIconFile(file)) {
            return;
        }

        this.currentIconFile = file;
        this.showIconPreview(file);
    }

    validateIconFile(file) {
        // Check file type
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/vnd.microsoft.icon'];
        if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.ico')) {
            this.showError('Please select a valid icon file (PNG, JPG, ICO).');
            return false;
        }

        // Check file size (5MB limit for icons)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showError('Icon file size exceeds 5MB limit.');
            return false;
        }

        return true;
    }

    showIconPreview(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.iconPreviewImage.src = e.target.result;
            this.iconPreview.style.display = 'flex';
            this.iconUploadPlaceholder.style.display = 'none';
        };
        
        reader.readAsDataURL(file);
    }

    removeIcon(event) {
        if (event) {
            event.stopPropagation(); // Prevent triggering the upload area click
        }
        
        this.currentIconFile = null;
        this.iconFile.value = '';
        this.iconPreview.style.display = 'none';
        this.iconUploadPlaceholder.style.display = 'flex';
        this.iconPreviewImage.src = '';
    }

}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const converter = new HTML2EXEConverter();
    
    // Make converter available globally for debugging
    window.converter = converter;
});