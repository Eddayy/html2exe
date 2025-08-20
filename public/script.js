function html2exeApp() {
    return {
        // State management
        currentSection: 'upload',
        currentFile: null,
        currentIconFile: null,
        currentBuildId: null,
        isDragOver: false,
        iconPreviewUrl: '',

        // Configuration
        config: {
            appName: '',
            description: '',
            width: 1200,
            height: 800,
            version: '1.0.0',
            company: ''
        },

        // Progress tracking
        progress: {
            percentage: 0,
            text: 'Preparing...',
            step: 1,
            animate: false
        },

        progressSteps: ['Upload', 'Building', 'Complete'],

        // Result tracking
        result: {
            success: false,
            error: false,
            errorMessage: '',
            errorDetails: '',
            fileName: 'app.exe',
            fileSize: '~10MB'
        },

        get isFormValid() {
            const appName = this.config.appName.trim();
            return appName && /[a-zA-Z0-9]/.test(appName) && appName.length <= 50 && !/^[._]/.test(appName);
        },

        // File handling methods
        handleDrop(event) {
            this.isDragOver = false;
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        },

        handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.handleFile(file);
            }
        },

        handleFile(file) {
            if (!this.validateFile(file)) return;
            
            this.currentFile = file;
            this.config.appName = file.name.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase().substring(0, 50);
            this.currentSection = 'config';
        },

        validateFile(file) {
            if (!file.type.includes('zip') && !file.name.toLowerCase().endsWith('.zip')) {
                return this.showError('Please select a ZIP file.');
            }
            if (file.size > 50 * 1024 * 1024) {
                return this.showError('File size exceeds 50MB limit.');
            }
            return true;
        },


        // Icon handling methods
        handleIconSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.handleIconFile(file);
            }
        },

        handleIconFile(file) {
            if (!this.validateIconFile(file)) return;
            
            this.currentIconFile = file;
            const reader = new FileReader();
            reader.onload = (e) => this.iconPreviewUrl = e.target.result;
            reader.readAsDataURL(file);
        },

        validateIconFile(file) {
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/vnd.microsoft.icon'];
            if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.ico')) {
                return this.showError('Please select a valid icon file (PNG, JPG, ICO).');
            }
            if (file.size > 5 * 1024 * 1024) {
                return this.showError('Icon file size exceeds 5MB limit.');
            }
            return true;
        },


        removeIcon() {
            this.currentIconFile = null;
            this.iconPreviewUrl = '';
            // Reset file input
            this.$refs.iconInput.value = '';
        },

        // Conversion process
        async startConversion() {
            if (!this.currentFile || !this.isFormValid) return;

            this.currentSection = 'progress';
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

                this.updateProgress(10, 'Starting build...', 1);
                
                const response = await fetch('/api/convert', { method: 'POST', body: formData });
                const result = await response.json();
                
                if (!response.ok) throw new Error(result.message || 'Upload failed');
                if (!result.success) throw new Error(result.message || 'Conversion failed');
                
                this.currentBuildId = result.buildId;
                this.updateProgress(30, 'Build started...', 1);
                await this.pollBuildStatus();

            } catch (error) {
                console.error('Conversion error:', error);
                this.showErrorResult(error.message);
            }
        },

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
        },

        updateProgressFromPhase(status) {
            const phases = {
                building: [50, status.note || 'Building Windows executable...', 2, true],
                completed: [100, 'Build completed successfully!', 3],
                failed: [0, 'Build failed', 1]
            };
            
            const [progress, text, step, animate = false] = phases[status.phase] || [50, status.description || 'Processing...', 2];
            const displayText = status.phase === 'building' && status.estimatedTime ? `${text} (Est. ${status.estimatedTime})` : text;
            this.updateProgress(progress, displayText, step, animate);
        },


        updateProgress(percentage, text, step, animate = false) {
            this.progress.percentage = percentage;
            this.progress.text = text;
            this.progress.step = step;
            this.progress.animate = animate;
        },

        showSuccessResult() {
            this.currentSection = 'result';
            this.result.success = true;
            this.result.error = false;
            
            const sanitizedName = (this.config.appName.trim() || 'My App')
                .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            this.result.fileName = `${sanitizedName}.exe`;
        },

        showErrorResult(message, details = null) {
            this.currentSection = 'result';
            this.result.success = false;
            this.result.error = true;
            this.result.errorMessage = message;
            this.result.errorDetails = details || '';
        },

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
        },

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
            if (this.$refs.fileInput) this.$refs.fileInput.value = '';
            if (this.$refs.iconInput) this.$refs.iconInput.value = '';
            
            this.currentSection = 'upload';
        },

        showError(message) {
            alert(message);
            return false;
        }
    }
}