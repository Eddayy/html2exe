class Html2ExeApp {
    constructor() {
        // State management
        this.currentSection = 'upload';
        this.currentFile = null;
        this.currentIconFile = null;
        this.currentBuildId = null;
        this.isDragOver = false;
        this.iconPreviewUrl = '';

        // Configuration
        this.config = {
            appName: '',
            description: '',
            width: 1200,
            height: 800,
            version: '1.0.0',
            company: ''
        };

        // Progress tracking
        this.progress = {
            percentage: 0,
            text: 'Preparing...',
            step: 1,
            animate: false
        };

        this.progressSteps = ['Upload', 'Building', 'Complete'];

        // Result tracking
        this.result = {
            success: false,
            error: false,
            errorMessage: '',
            errorDetails: '',
            fileName: 'app.exe',
            fileSize: '~10MB'
        };

        // DOM elements
        this.elements = {};
        
        // Initialize app
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupElements());
        } else {
            this.setupElements();
        }
    }

    setupElements() {
        // Get all DOM elements
        this.elements = {
            // Sections
            uploadSection: document.getElementById('upload-section'),
            configSection: document.getElementById('config-section'),
            progressSection: document.getElementById('progress-section'),
            resultSection: document.getElementById('result-section'),
            
            // Upload elements
            uploadArea: document.getElementById('upload-area'),
            browseBtn: document.getElementById('browse-btn'),
            fileInput: document.getElementById('file-input'),
            
            // Config form elements
            appName: document.getElementById('app-name'),
            appDescription: document.getElementById('app-description'),
            appWidth: document.getElementById('app-width'),
            appHeight: document.getElementById('app-height'),
            appVersion: document.getElementById('app-version'),
            appCompany: document.getElementById('app-company'),
            
            // Icon elements
            iconUploadArea: document.getElementById('icon-upload-area'),
            iconInput: document.getElementById('icon-input'),
            iconPreview: document.getElementById('icon-preview'),
            iconPreviewImg: document.getElementById('icon-preview-img'),
            iconUploadPlaceholder: document.getElementById('icon-upload-placeholder'),
            removeIconBtn: document.getElementById('remove-icon-btn'),
            
            // Action buttons
            backBtn: document.getElementById('back-btn'),
            convertBtn: document.getElementById('convert-btn'),
            downloadBtn: document.getElementById('download-btn'),
            resetBtn: document.getElementById('reset-btn'),
            
            // Progress elements
            progressFill: document.getElementById('progress-fill'),
            progressText: document.getElementById('progress-text'),
            progressSteps: document.getElementById('progress-steps'),
            
            // Result elements
            resultSuccess: document.getElementById('result-success'),
            resultError: document.getElementById('result-error'),
            resultFilename: document.getElementById('result-filename'),
            resultFilesize: document.getElementById('result-filesize'),
            errorMessage: document.getElementById('error-message'),
            errorDetails: document.getElementById('error-details'),
            errorDetailsText: document.getElementById('error-details-text')
        };

        this.setupEventListeners();
        this.updateFormValidation();
    }

    setupEventListeners() {
        // File upload drag and drop
        this.elements.uploadArea.addEventListener('dragenter', (e) => {
            e.preventDefault();
            this.isDragOver = true;
            this.elements.uploadArea.classList.add('dragover');
        });

        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.elements.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.isDragOver = false;
            this.elements.uploadArea.classList.remove('dragover');
        });

        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.handleDrop(e);
        });

        this.elements.uploadArea.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        // File input
        this.elements.browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.fileInput.click();
        });

        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        // Icon upload
        this.elements.iconUploadArea.addEventListener('click', () => {
            this.elements.iconInput.click();
        });

        this.elements.iconInput.addEventListener('change', (e) => {
            this.handleIconSelect(e);
        });

        this.elements.removeIconBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeIcon();
        });

        // Form inputs for validation
        ['appName', 'appDescription', 'appWidth', 'appHeight', 'appVersion', 'appCompany'].forEach(field => {
            this.elements[field].addEventListener('input', () => {
                this.config[field === 'appName' ? 'appName' : 
                           field === 'appDescription' ? 'description' :
                           field === 'appWidth' ? 'width' :
                           field === 'appHeight' ? 'height' :
                           field === 'appVersion' ? 'version' : 'company'] = this.elements[field].value;
                this.updateFormValidation();
            });
        });

        // Navigation buttons
        this.elements.backBtn.addEventListener('click', () => {
            this.showSection('upload');
        });

        this.elements.convertBtn.addEventListener('click', () => {
            this.startConversion();
        });

        this.elements.downloadBtn.addEventListener('click', () => {
            this.downloadFile();
        });

        this.elements.resetBtn.addEventListener('click', () => {
            this.reset();
        });
    }

    showSection(sectionName) {
        // Hide all sections
        ['uploadSection', 'configSection', 'progressSection', 'resultSection'].forEach(section => {
            this.elements[section].style.display = 'none';
        });

        // Show target section
        const sectionMap = {
            'upload': 'uploadSection',
            'config': 'configSection',
            'progress': 'progressSection',
            'result': 'resultSection'
        };

        this.elements[sectionMap[sectionName]].style.display = 'block';
        this.currentSection = sectionName;
    }

    get isFormValid() {
        const appName = this.config.appName.trim();
        return appName && /[a-zA-Z0-9]/.test(appName) && appName.length <= 50 && !/^[._]/.test(appName);
    }

    updateFormValidation() {
        this.elements.convertBtn.disabled = !this.isFormValid;
    }

    // File handling methods
    handleDrop(event) {
        this.isDragOver = false;
        this.elements.uploadArea.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.handleFile(file);
        }
    }

    handleFile(file) {
        if (!this.validateFile(file)) return;
        
        this.currentFile = file;
        this.config.appName = file.name.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase().substring(0, 50);
        this.elements.appName.value = this.config.appName;
        this.updateFormValidation();
        this.showSection('config');
    }

    validateFile(file) {
        if (!file.type.includes('zip') && !file.name.toLowerCase().endsWith('.zip')) {
            return this.showError('Please select a ZIP file.');
        }
        if (file.size > 50 * 1024 * 1024) {
            return this.showError('File size exceeds 50MB limit.');
        }
        return true;
    }

    // Icon handling methods
    handleIconSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.handleIconFile(file);
        }
    }

    handleIconFile(file) {
        if (!this.validateIconFile(file)) return;
        
        this.currentIconFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            this.iconPreviewUrl = e.target.result;
            this.elements.iconPreviewImg.src = this.iconPreviewUrl;
            this.elements.iconPreview.style.display = 'block';
            this.elements.iconUploadPlaceholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    validateIconFile(file) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/vnd.microsoft.icon'];
        if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.ico')) {
            return this.showError('Please select a valid icon file (PNG, JPG, ICO).');
        }
        if (file.size > 5 * 1024 * 1024) {
            return this.showError('Icon file size exceeds 5MB limit.');
        }
        return true;
    }

    removeIcon() {
        this.currentIconFile = null;
        this.iconPreviewUrl = '';
        this.elements.iconPreview.style.display = 'none';
        this.elements.iconUploadPlaceholder.style.display = 'block';
        this.elements.iconInput.value = '';
    }

    // Conversion process
    async startConversion() {
        if (!this.currentFile || !this.isFormValid) return;

        this.showSection('progress');
        this.updateProgress(5, 'Preparing...', 1);
        
        try {
            const formData = new FormData();
            formData.append('zipFile', this.currentFile);
            
            if (this.currentIconFile) {
                formData.append('iconFile', this.currentIconFile);
            }
            
            Object.entries(this.config).forEach(([key, value]) => {
                if (value != null) formData.append(key, value);
            });

            this.updateProgress(10, 'Uploading...', 1);
            
            const response = await fetch('/api/convert', { method: 'POST', body: formData });
            const result = await response.json();
            
            if (!response.ok) throw new Error(result.message || 'Upload failed');
            if (!result.success) throw new Error(result.message || 'Conversion failed');
            
            this.currentBuildId = result.buildId;
            this.updateProgress(30, 'Extracting...', 1);
            await this.pollBuildStatus();

        } catch (error) {
            console.error('Conversion error:', error);
            this.showErrorResult(error.message);
        }
    }

    async pollBuildStatus() {
        let attempts = 0;

        const poll = async () => {
            try {
                if (++attempts > 100) {
                    throw new Error('Build timeout - the conversion process is taking longer than expected. Please try again.');
                }

                const response = await fetch(`/api/status/${this.currentBuildId}`);
                if (!response.ok) throw new Error('Failed to check build status');

                const status = await response.json();

                if (status.phase) {
                    this.updateProgressFromPhase(status);
                    
                    if (status.phase === 'completed') {
                        return setTimeout(() => this.showSuccessResult(), 1000);
                    }
                    if (status.phase === 'failed') {
                        return this.showErrorResult(status.error || 'Build failed with unknown error');
                    }
                    if (status.phase !== 'not_found') {
                        return setTimeout(poll, 1000);
                    }
                    throw new Error('Build not found');
                }

                // Legacy fallback
                const statusMap = {
                    processing: [75, 'Building application...', 2],
                    completed: [100, 'Build complete!', 3],
                    default: [50, 'Processing...', 2]
                };
                const [progress, text, step] = statusMap[status.status] || statusMap.default;
                this.updateProgress(progress, text, step);
                setTimeout(poll, 1000);

            } catch (error) {
                console.error('Status polling error:', error);
                this.showErrorResult(error.message);
            }
        };

        setTimeout(poll, 1000);
    }

    updateProgressFromPhase(status) {
        const phases = {
            building: [50, status.note || 'Building Windows executable...', 2, true],
            completed: [100, 'Build completed successfully!', 3],
            failed: [0, 'Build failed', 1]
        };
        
        const [progress, text, step, animate = false] = phases[status.phase] || [50, status.description || 'Processing...', 2];
        const displayText = status.phase === 'building' && status.estimatedTime ? `${text} (Est. ${status.estimatedTime})` : text;
        this.updateProgress(progress, displayText, step, animate);
    }

    updateProgress(percentage, text, step, animate = false) {
        this.progress.percentage = percentage;
        this.progress.text = text;
        this.progress.step = step;
        this.progress.animate = animate;
        
        // Update DOM
        this.elements.progressFill.style.width = `${percentage}%`;
        this.elements.progressText.textContent = text;
        
        if (animate) {
            this.elements.progressFill.classList.add('loading-animation');
        } else {
            this.elements.progressFill.classList.remove('loading-animation');
        }
        
        // Update step indicators
        const steps = this.elements.progressSteps.querySelectorAll('.step');
        steps.forEach((stepEl, index) => {
            stepEl.classList.remove('active', 'completed');
            if (index + 1 === step) {
                stepEl.classList.add('active');
            } else if (index + 1 < step) {
                stepEl.classList.add('completed');
            }
        });
    }

    showSuccessResult() {
        this.showSection('result');
        this.result.success = true;
        this.result.error = false;
        
        const sanitizedName = (this.config.appName.trim() || 'My App')
            .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        this.result.fileName = `${sanitizedName}.exe`;
        
        // Update DOM
        this.elements.resultSuccess.style.display = 'block';
        this.elements.resultError.style.display = 'none';
        this.elements.resultFilename.textContent = this.result.fileName;
    }

    showErrorResult(message, details = null) {
        this.showSection('result');
        this.result.success = false;
        this.result.error = true;
        this.result.errorMessage = message;
        this.result.errorDetails = details || '';
        
        // Update DOM
        this.elements.resultSuccess.style.display = 'none';
        this.elements.resultError.style.display = 'block';
        this.elements.errorMessage.textContent = message;
        
        if (details) {
            this.elements.errorDetails.style.display = 'block';
            this.elements.errorDetailsText.textContent = details;
        } else {
            this.elements.errorDetails.style.display = 'none';
        }
    }

    // Download functionality
    async downloadFile() {
        if (!this.currentBuildId) {
            return this.showError('No file available for download');
        }

        try {
            const response = await fetch(`/api/download/${this.currentBuildId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Download failed');
            }

            const contentDisposition = response.headers.get('Content-Disposition');
            const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] || 'app.exe';

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Download error:', error);
            this.showError('Download failed: ' + error.message);
        }
    }

    // Reset functionality
    reset() {
        this.currentFile = null;
        this.currentIconFile = null;
        this.currentBuildId = null;
        this.iconPreviewUrl = '';
        
        // Reset form
        this.config = {
            appName: '',
            description: '',
            width: 1200,
            height: 800,
            version: '1.0.0',
            company: ''
        };
        
        // Reset DOM form elements
        this.elements.appName.value = '';
        this.elements.appDescription.value = '';
        this.elements.appWidth.value = '1200';
        this.elements.appHeight.value = '800';
        this.elements.appVersion.value = '1.0.0';
        this.elements.appCompany.value = '';
        
        // Reset result
        this.result = {
            success: false,
            error: false,
            errorMessage: '',
            errorDetails: '',
            fileName: 'app.exe',
            fileSize: '~10MB'
        };
        
        // Reset file inputs
        this.elements.fileInput.value = '';
        this.elements.iconInput.value = '';
        
        // Reset icon preview
        this.elements.iconPreview.style.display = 'none';
        this.elements.iconUploadPlaceholder.style.display = 'block';
        
        this.updateFormValidation();
        this.showSection('upload');
    }

    showError(message) {
        alert(message);
        return false;
    }
}

// Initialize the app
const app = new Html2ExeApp();