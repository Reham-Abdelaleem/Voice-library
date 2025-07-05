// Configuration
const API_BASE_URL = 'http://127.0.0.1:5000/api';

// Global state
let currentConfig = {};
let workerStatus = {};
let voices = {
    elevenlabs: [],
    deepgram: [],
    cartesia: []
};
let currentVoiceSample = null;

// DOM Elements
const elements = {
    // Navigation
    menuItems: document.querySelectorAll('.menu-item'),
    contentSections: document.querySelectorAll('.content-section'),
    
    // Header
    pageTitle: document.getElementById('page-title'),
    pageSubtitle: document.getElementById('page-subtitle'),
    workerStatus: document.getElementById('worker-status'),
    
    // Dashboard
    workerStatusDisplay: document.getElementById('worker-status-display'),
    workerDetails: document.getElementById('worker-details'),
    workerPid: document.getElementById('worker-pid'),
    currentTtsProvider: document.getElementById('current-tts-provider'),
    currentTtsModel: document.getElementById('current-tts-model'),
    currentSttProvider: document.getElementById('current-stt-provider'),
    currentLlmProvider: document.getElementById('current-llm-provider'),
    currentWorkerMode: document.getElementById('current-worker-mode'),
    
    // Quick Actions
    startWorkerBtn: document.getElementById('start-worker-btn'),
    stopWorkerBtn: document.getElementById('stop-worker-btn'),
    refreshStatusBtn: document.getElementById('refresh-status-btn'),
    
    // Voice Library
    providerTabs: document.querySelectorAll('.provider-tabs .tab-btn'),
    providerContents: document.querySelectorAll('.provider-content'),
    loadElevenlabsVoicesBtn: document.getElementById('load-elevenlabs-voices'),
    loadDeepgramVoicesBtn: document.getElementById('load-deepgram-voices'),
    loadCartesiaVoicesBtn: document.getElementById('load-cartesia-voices'),
    elevenlabsVoicesGrid: document.getElementById('elevenlabs-voices-grid'),
    deepgramVoicesGrid: document.getElementById('deepgram-voices-grid'),
    cartesiaVoicesGrid: document.getElementById('cartesia-voices-grid'),
    
    // Configuration
    configTabs: document.querySelectorAll('.config-tabs .tab-btn'),
    configPanels: document.querySelectorAll('.config-panel'),
    ttsForm: document.getElementById('tts-form'),
    sttForm: document.getElementById('stt-form'),
    llmForm: document.getElementById('llm-form'),
    workerForm: document.getElementById('worker-form'),
    elevenlabsModelGroup: document.getElementById('elevenlabs-model-group'),
    
    // Update All Form
    updateAllForm: document.getElementById('update-all-form'),
    
    // Worker Management
    workerManagementStatus: document.getElementById('worker-management-status'),
    workerManagementInfo: document.getElementById('worker-management-info'),
    workerManagementPid: document.getElementById('worker-management-pid'),
    workerManagementMode: document.getElementById('worker-management-mode'),
    workerManagementRoom: document.getElementById('worker-management-room'),
    startWorkerManagementBtn: document.getElementById('start-worker-management-btn'),
    stopWorkerManagementBtn: document.getElementById('stop-worker-management-btn'),
    refreshWorkerManagementBtn: document.getElementById('refresh-worker-management-btn'),
    
    // Voice Sample Modal
    voiceSampleModal: document.getElementById('voice-sample-modal'),
    modalVoiceName: document.getElementById('modal-voice-name'),
    modalVoiceId: document.getElementById('modal-voice-id'),
    modalVoiceProvider: document.getElementById('modal-voice-provider'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    voiceSampleAudio: document.getElementById('voice-sample-audio'),
    sampleTextInput: document.getElementById('sample-text-input'),
    generateSampleBtn: document.getElementById('generate-sample-btn'),
    downloadSampleBtn: document.getElementById('download-sample-btn'),
    
    // Loading
    loadingOverlay: document.getElementById('loading-overlay'),
    toastContainer: document.getElementById('toast-container')
};

// Utility Functions
function showLoading() {
    elements.loadingOverlay.classList.add('active');
}

function hideLoading() {
    elements.loadingOverlay.classList.remove('active');
}

function showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="toast-icon ${iconMap[type]}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
    
    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
}

function updateStatusIndicator(element, status) {
    if (!element) return;
    element.className = `status-indicator ${element.classList.contains('large') ? 'large' : ''} ${status}`;
    
    const statusText = {
        running: 'Running',
        stopped: 'Stopped',
        loading: 'Loading...',
        error: 'Error'
    };
    
    const span = element.querySelector('span');
    if (span) {
        span.textContent = statusText[status] || 'Unknown';
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Request failed:', error);
        throw error;
    }
}

async function loadConfig() {
    try {
        const config = await apiRequest('/config');
        currentConfig = config;
        updateConfigDisplay();
        return config;
    } catch (error) {
        showToast('error', 'Error', 'Failed to load configuration');
        throw error;
    }
}

async function loadWorkerStatus() {
    try {
        const status = await apiRequest('/status');
        workerStatus = status;
        updateWorkerStatusDisplay();
        return status;
    } catch (error) {
        showToast('error', 'Error', 'Failed to load worker status');
        updateStatusIndicator(elements.workerStatus, 'error');
        updateStatusIndicator(elements.workerStatusDisplay, 'error');
        updateStatusIndicator(elements.workerManagementStatus, 'error');
        throw error;
    }
}

async function startWorker() {
    try {
        showLoading();
        const result = await apiRequest('/start', { method: 'POST' });
        showToast('success', 'Success', result.message);
        await loadWorkerStatus();
    } catch (error) {
        showToast('error', 'Error', 'Failed to start worker');
    } finally {
        hideLoading();
    }
}

async function stopWorker() {
    try {
        showLoading();
        const result = await apiRequest('/stop', { method: 'POST' });
        showToast('success', 'Success', result.message);
        await loadWorkerStatus();
    } catch (error) {
        showToast('error', 'Error', 'Failed to stop worker');
    } finally {
        hideLoading();
    }
}

async function loadVoices(provider) {
    try {
        showLoading();
        let voicesData;
        
        switch (provider) {
            case 'elevenlabs':
                voicesData = await apiRequest('/elevenlabs/voices');
                voices.elevenlabs = voicesData.voices || voicesData;
                renderVoices('elevenlabs', voices.elevenlabs);
                break;
            case 'deepgram':
                voicesData = await apiRequest('/deepgram/voices');
                voices.deepgram = voicesData.voices || voicesData;
                renderVoices('deepgram', voices.deepgram);
                break;
            case 'cartesia':
                voicesData = await apiRequest('/cartesia/voices');
                voices.cartesia = voicesData.voices || voicesData;
                renderVoices('cartesia', voices.cartesia);
                break;
        }
        
        showToast('success', 'Success', `Loaded ${provider} voices`);
    } catch (error) {
        showToast('error', 'Error', `Failed to load ${provider} voices`);
    } finally {
        hideLoading();
    }
}

async function generateVoiceSample(provider, voiceId, text) {
    try {
        showLoading();
        
        let endpoint;
        let requestBody;
        
        switch (provider) {
            case 'elevenlabs':
                endpoint = '/elevenlabs/generate-sample';
                requestBody = {
                    voice_id: voiceId,
                    text: text,
                    model_id: currentConfig.tts_elevenlabs_model || 'eleven_multilingual_v2'
                };
                break;
            case 'deepgram':
                endpoint = '/deepgram/generate-sample';
                requestBody = {
                    voice: voiceId,
                    text: text
                };
                break;
            case 'cartesia':
                endpoint = '/cartesia/generate-sample';
                requestBody = {
                    voice_id: voiceId,
                    text: text
                };
                break;
            default:
                throw new Error('Unsupported provider');
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Get the audio blob
        const audioBlob = await response.blob();
        
        // Create object URL for the audio blob
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Update the audio player with proper MIME type handling
        const audioElement = elements.voiceSampleAudio;
        if (audioElement) {
            // Clear any existing source
            audioElement.src = '';
            audioElement.load();
            
            // Set the new source
            audioElement.src = audioUrl;
            
            // Force the audio element to load the new source
            audioElement.load();
            
            // Add event listeners for debugging
            audioElement.addEventListener('loadstart', () => {
                console.log('Audio loading started');
            });
            
            audioElement.addEventListener('canplay', () => {
                console.log('Audio can start playing');
            });
            
            audioElement.addEventListener('error', (e) => {
                console.error('Audio error:', e);
                showToast('error', 'Audio Error', 'Failed to load audio file');
            });
        }
        
        // Enable download button
        elements.downloadSampleBtn.disabled = false;
        elements.downloadSampleBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = audioUrl;
            a.download = `voice_sample_${provider}_${voiceId}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        
        showToast('success', 'Success', 'Voice sample generated successfully');
        
    } catch (error) {
        console.error('Generate voice sample error:', error);
        showToast('error', 'Error', `Failed to generate voice sample: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function updateTTSConfig(data) {
    try {
        showLoading();
        const result = await apiRequest('/tts', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        showToast('success', 'Success', result.message);
        await loadConfig();
    } catch (error) {
        showToast('error', 'Error', 'Failed to update TTS configuration');
    } finally {
        hideLoading();
    }
}

async function updateSTTConfig(data) {
    try {
        showLoading();
        const result = await apiRequest('/stt', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        showToast('success', 'Success', result.message);
        await loadConfig();
    } catch (error) {
        showToast('error', 'Error', 'Failed to update STT configuration');
    } finally {
        hideLoading();
    }
}

async function updateLLMConfig(data) {
    try {
        showLoading();
        const result = await apiRequest('/llm', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        showToast('success', 'Success', result.message);
        await loadConfig();
    } catch (error) {
        showToast('error', 'Error', 'Failed to update LLM configuration');
    } finally {
        hideLoading();
    }
}

async function updateWorkerConfig(data) {
    try {
        showLoading();
        const result = await apiRequest('/worker-mode', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        showToast('success', 'Success', result.message);
        await loadConfig();
        await loadWorkerStatus();
    } catch (error) {
        showToast('error', 'Error', 'Failed to update worker configuration');
    } finally {
        hideLoading();
    }
}

// NEW: Update All Configuration Function
async function updateAllConfig(data) {
    try {
        showLoading();
        const result = await apiRequest('/update_all', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        showToast('success', 'Success', result.message);
        await loadConfig();
        await loadWorkerStatus();
        return result;
    } catch (error) {
        showToast('error', 'Error', 'Failed to update all configuration');
        throw error;
    } finally {
        hideLoading();
    }
}

// UI Update Functions
function updateConfigDisplay() {
    if (elements.currentTtsProvider) elements.currentTtsProvider.textContent = currentConfig.tts_provider || '-';
    if (elements.currentTtsModel) elements.currentTtsModel.textContent = currentConfig.tts_model || '-';
    if (elements.currentSttProvider) elements.currentSttProvider.textContent = currentConfig.stt_provider || '-';
    if (elements.currentLlmProvider) elements.currentLlmProvider.textContent = currentConfig.llm_provider || '-';
    if (elements.currentWorkerMode) elements.currentWorkerMode.textContent = currentConfig.worker_mode || '-';
    
    // Update form values
    if (elements.ttsForm) {
        const ttsProvider = elements.ttsForm.querySelector('#tts-provider');
        const ttsModel = elements.ttsForm.querySelector('#tts-model');
        const ttsLanguage = elements.ttsForm.querySelector('#tts-language');
        const elevenlabsModel = elements.ttsForm.querySelector('#elevenlabs-model');
        
        if (ttsProvider) ttsProvider.value = currentConfig.tts_provider || '';
        if (ttsModel) ttsModel.value = currentConfig.tts_model || '';
        if (ttsLanguage) ttsLanguage.value = currentConfig.tts_language || '';
        if (elevenlabsModel) elevenlabsModel.value = currentConfig.tts_elevenlabs_model || 'eleven_multilingual_v2';
        
        // Show/hide ElevenLabs model group
        if (elements.elevenlabsModelGroup) {
            elements.elevenlabsModelGroup.style.display = 
                currentConfig.tts_provider === 'elevenlabs' ? 'block' : 'none';
        }
    }
    
    if (elements.sttForm) {
        const sttProvider = elements.sttForm.querySelector('#stt-provider');
        const sttModel = elements.sttForm.querySelector('#stt-model');
        const sttLanguage = elements.sttForm.querySelector('#stt-language');
        
        if (sttProvider) sttProvider.value = currentConfig.stt_provider || '';
        if (sttModel) sttModel.value = currentConfig.stt_model || '';
        if (sttLanguage) sttLanguage.value = currentConfig.stt_language || '';
    }
    
    if (elements.llmForm) {
        const llmProvider = elements.llmForm.querySelector('#llm-provider');
        
        if (llmProvider) llmProvider.value = currentConfig.llm_provider || '';
    }
    
    if (elements.workerForm) {
        const workerMode = elements.workerForm.querySelector('#worker-mode');
        const roomName = elements.workerForm.querySelector('#room-name');
        
        if (workerMode) workerMode.value = currentConfig.worker_mode || '';
        if (roomName) roomName.value = currentConfig.room_name || '';
    }

    // Update the update-all form with current values
    if (elements.updateAllForm) {
        const llmProviderField = elements.updateAllForm.querySelector('#update-all-llm-provider');
        const llmApiKeyField = elements.updateAllForm.querySelector('#update-all-llm-api-key');
        const ttsProviderField = elements.updateAllForm.querySelector('#update-all-tts-provider');
        const ttsModelField = elements.updateAllForm.querySelector('#update-all-tts-model');
        const ttsLanguageField = elements.updateAllForm.querySelector('#update-all-tts-language');
        
        if (llmProviderField) llmProviderField.value = currentConfig.llm_provider || '';
        if (llmApiKeyField) llmApiKeyField.value = currentConfig.llm_api_key || '';
        if (ttsProviderField) ttsProviderField.value = currentConfig.tts_provider || '';
        if (ttsModelField) ttsModelField.value = currentConfig.tts_model || '';
        if (ttsLanguageField) ttsLanguageField.value = currentConfig.tts_language || '';
    }
}

function updateWorkerStatusDisplay() {
    const isRunning = workerStatus.status === 'running';
    const status = isRunning ? 'running' : 'stopped';
    
    // Update all status indicators
    updateStatusIndicator(elements.workerStatus, status);
    updateStatusIndicator(elements.workerStatusDisplay, status);
    updateStatusIndicator(elements.workerManagementStatus, status);
    
    // Update PID displays
    if (elements.workerPid) elements.workerPid.textContent = workerStatus.pid || '-';
    if (elements.workerManagementPid) elements.workerManagementPid.textContent = workerStatus.pid || '-';
    
    // Update mode and room displays
    if (elements.workerManagementMode) elements.workerManagementMode.textContent = currentConfig.worker_mode || '-';
    if (elements.workerManagementRoom) elements.workerManagementRoom.textContent = currentConfig.room_name || '-';
}



function renderVoices(provider, voicesData) {
    let grid;
    switch (provider) {
        case 'elevenlabs':
            grid = elements.elevenlabsVoicesGrid;
            break;
        case 'deepgram':
            grid = elements.deepgramVoicesGrid;
            break;
        case 'cartesia':
            grid = elements.cartesiaVoicesGrid;
            break;
        default:
            return;
    }

    if (!grid) return;

    grid.innerHTML = '';

    if (!voicesData || voicesData.length === 0) {
        grid.innerHTML = `
            <div class="loading-placeholder">
                <i class="fas fa-exclamation-triangle"></i>
                <p>No voices available</p>
            </div>
        `;
        return;
    }

    voicesData.forEach(voice => {
        const voiceCard = document.createElement('div');
        voiceCard.className = 'voice-card';

        let voiceId, voiceName, description, language, gender, modelNames, modes;

    if (provider === 'elevenlabs') {
        voiceId = voice.id; // Use 'id' as per your JSON
        voiceName = voice.name;
        description = voice.description || 'No description available.';
        language = voice.language || 'N/A'; // Direct access
        gender = voice.gender || 'N/A';     // Direct access
        modelNames = voice.model_names ? voice.model_names.join(', ') : 'N/A'; // Direct access to model_names
    
        } else if (provider === 'deepgram') {
            voiceId = voice.id;
            voiceName = voice.name;
            description = voice.description || 'No description available.';
            language = voice.language || 'N/A';
            gender = voice.gender || 'N/A';
            modes = voice.modes ? voice.modes.join(', ') : 'N/A'; // Deepgram might have 'modes'
        } else if (provider === 'cartesia') {
            voiceId = voice.id;
            voiceName = voice.name;
            description = voice.description || 'No description available.';
            language = voice.language || 'N/A';
            gender = voice.gender || 'N/A';
            // Cartesia might have other specific fields, add them here if available
        }

        voiceCard.innerHTML = `
            <div class="voice-card-header">
                <h4>${voiceName}</h4>
                <span class="voice-id">${voiceId}</span>
            </div>
            <div class="voice-meta">
                <div class="voice-meta-item">
                    <span class="voice-meta-label">Language:</span>
                    <span class="voice-meta-value">${language}</span>
                </div>
                <div class="voice-meta-item">
                    <span class="voice-meta-label">Gender:</span>
                    <span class="voice-meta-value">${gender}</span>
                </div>
                ${modelNames && modelNames !== 'N/A' ? `
                <div class="voice-meta-item">
                    <span class="voice-meta-label">Models:</span>
                    <span class="voice-meta-value">${modelNames}</span>
                </div>` : ''}
                ${modes && modes !== 'N/A' ? `
                <div class="voice-meta-item">
                    <span class="voice-meta-label">Modes:</span>
                    <span class="voice-meta-value">${modes}</span>
                </div>` : ''}
                <div class="voice-meta-item">
                    <span class="voice-meta-label">Description:</span>
                    <span class="voice-meta-value">${description}</span>
                </div>
            </div>
            <div class="voice-actions">
                <button class="btn btn-primary" onclick="selectVoice('${provider}', '${voiceId}', '${voiceName}')">
                    <i class="fas fa-check"></i>
                    Select
                </button>
                <button class="btn btn-secondary" onclick="previewVoice('${provider}', '${voiceId}', '${voiceName}')">
                    <i class="fas fa-play"></i>
                    Preview
                </button>
            </div>
        `;
        grid.appendChild(voiceCard);
    });
}

function selectVoice(provider, voiceId, voiceName) {
    const ttsProvider = document.getElementById('tts-provider');
    const ttsModel = document.getElementById('tts-model');
    const elevenlabsModel = document.getElementById('elevenlabs-model');

    if (ttsProvider) ttsProvider.value = provider;
    if (ttsModel) ttsModel.value = voiceId;

    let data = {
        provider: provider,
        model: voiceId
    };

    if (provider === 'elevenlabs' && elevenlabsModel) {
        data.elevenlabs_model = elevenlabsModel.value;
    }

    updateTTSConfig(data);
    showToast('success', 'Voice Selected', `Selected ${voiceName} (${voiceId}) for ${provider}`);
}

function previewVoice(provider, voiceId, voiceName) {
    // Open voice sample modal
    if (elements.voiceSampleModal) {
        elements.voiceSampleModal.classList.add('active');
        if (elements.modalVoiceName) elements.modalVoiceName.textContent = voiceName;
        if (elements.modalVoiceId) elements.modalVoiceId.textContent = voiceId;
        if (elements.modalVoiceProvider) elements.modalVoiceProvider.textContent = provider;
        
        // Reset audio player
        if (elements.voiceSampleAudio) {
            elements.voiceSampleAudio.src = '';
            elements.voiceSampleAudio.load();
        }
        
        // Disable download button initially
        if (elements.downloadSampleBtn) {
            elements.downloadSampleBtn.disabled = true;
        }
        
        currentVoiceSample = { provider, voiceId, voiceName };
        
        // Auto-generate sample with default text
        const defaultText = elements.sampleTextInput ? elements.sampleTextInput.value : 'Hello, this is a sample of my voice.';
        generateVoiceSample(provider, voiceId, defaultText);
    }
}

// Navigation Functions
function switchSection(sectionId) {
    // Hide all sections
    elements.contentSections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(`${sectionId}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update navigation
    elements.menuItems.forEach(item => {
        item.classList.remove('active');
    });
    
    const activeMenuItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        voices: 'Voice Library',
        config: 'Configuration',
        worker: 'Worker Management'
    };
    
    const subtitles = {
        dashboard: 'Monitor your voice agent status and configuration',
        voices: 'Browse and select voices from different providers',
        config: 'Configure TTS, STT, LLM, and worker settings',
        worker: 'Manage worker processes and monitor status'
    };
    
    if (elements.pageTitle) elements.pageTitle.textContent = titles[sectionId] || 'Dashboard';
    if (elements.pageSubtitle) elements.pageSubtitle.textContent = subtitles[sectionId] || '';
}

function switchProviderTab(provider) {
    // Update tabs
    elements.providerTabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`[data-provider="${provider}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Update content
    elements.providerContents.forEach(content => {
        content.classList.remove('active');
    });
    
    const activeContent = document.getElementById(`${provider}-voices`);
    if (activeContent) {
        activeContent.classList.add('active');
    }
    // Load voices automatically
    loadVoices(provider);
}

function switchConfigTab(configType) {
    // Update tabs
    elements.configTabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`[data-config="${configType}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Update panels
    elements.configPanels.forEach(panel => {
        panel.classList.remove('active');
    });
    
    const activePanel = document.getElementById(`${configType}-config`);
    if (activePanel) {
        activePanel.classList.add('active');
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Navigation
    elements.menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            switchSection(section);
        // If section is voices, load ElevenLabs by default
        if (section === 'voices') {
            switchProviderTab('elevenlabs');
        }
        });
    });
    
    // Provider tabs
    elements.providerTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const provider = tab.getAttribute('data-provider');
            switchProviderTab(provider);
        });
    });
    
    // Config tabs
    elements.configTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const configType = tab.getAttribute('data-config');
            switchConfigTab(configType);
        });
    });
    
    // Quick actions
    if (elements.startWorkerBtn) {
        elements.startWorkerBtn.addEventListener('click', startWorker);
    }
    
    if (elements.stopWorkerBtn) {
        elements.stopWorkerBtn.addEventListener('click', stopWorker);
    }
    
    if (elements.refreshStatusBtn) {
        elements.refreshStatusBtn.addEventListener('click', () => {
            loadConfig();
            loadWorkerStatus();
        });
    }
    
    // Voice loading buttons
    if (elements.loadElevenlabsVoicesBtn) {
        elements.loadElevenlabsVoicesBtn.addEventListener('click', () => loadVoices('elevenlabs'));
    }
    
    if (elements.loadDeepgramVoicesBtn) {
        elements.loadDeepgramVoicesBtn.addEventListener('click', () => loadVoices('deepgram'));
    }
    
    if (elements.loadCartesiaVoicesBtn) {
        elements.loadCartesiaVoicesBtn.addEventListener('click', () => loadVoices('cartesia'));
    }
    
    // Configuration forms
    if (elements.ttsForm) {
        elements.ttsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            await updateTTSConfig(data);
        });
    }
    
    if (elements.sttForm) {
        elements.sttForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            await updateSTTConfig(data);
        });
    }
    
    if (elements.llmForm) {
        elements.llmForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            await updateLLMConfig(data);
        });
    }
    
    if (elements.workerForm) {
        elements.workerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            await updateWorkerConfig(data);
        });
    }

    // NEW: Update All form
    if (elements.updateAllForm) {
        elements.updateAllForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            // Convert form field names to API field names
            const apiData = {
                llm_provider: data['llm-provider'],
                llm_api_key: data['llm-api-key'],
                provider: data['tts-provider'], // Note: API expects 'provider' for TTS provider
                model: data['tts-model'],
                language: data['tts-language']
            };
            
            await updateAllConfig(apiData);
        });
    }
    
    // Worker management buttons
    if (elements.startWorkerManagementBtn) {
        elements.startWorkerManagementBtn.addEventListener('click', startWorker);
    }
    
    if (elements.stopWorkerManagementBtn) {
        elements.stopWorkerManagementBtn.addEventListener('click', stopWorker);
    }
    
    if (elements.refreshWorkerManagementBtn) {
        elements.refreshWorkerManagementBtn.addEventListener('click', () => {
            loadConfig();
            loadWorkerStatus();
        });
    }
    
    // Voice sample modal
    if (elements.modalCloseBtn) {
        elements.modalCloseBtn.addEventListener('click', () => {
            elements.voiceSampleModal.classList.remove('active');
        });
    }
    
    if (elements.generateSampleBtn) {
        elements.generateSampleBtn.addEventListener('click', () => {
            if (currentVoiceSample && elements.sampleTextInput) {
                const text = elements.sampleTextInput.value || 'Hello, this is a voice sample.';
                generateVoiceSample(currentVoiceSample.provider, currentVoiceSample.voiceId, text);
            }
        });
    }
    
    // TTS provider change handler
    const ttsProviderSelect = document.getElementById('tts-provider');
    if (ttsProviderSelect) {
        ttsProviderSelect.addEventListener('change', (e) => {
            if (elements.elevenlabsModelGroup) {
                elements.elevenlabsModelGroup.style.display = 
                    e.target.value === 'elevenlabs' ? 'block' : 'none';
            }
        });
    }
    
    // Initial load
    loadConfig();
    loadWorkerStatus();
    
    // Auto-refresh status every 30 seconds
    setInterval(() => {
        loadWorkerStatus();
    }, 30000);
});

