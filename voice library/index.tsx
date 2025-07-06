import type { FC, FormEvent, ChangeEvent, useMemo  } from 'react'
import { useTranslation } from 'react-i18next'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import classNames from '@/utils/classnames'
import './styles.css'


// Types
interface WorkerStatus {
  status: 'running' | 'stopped'
  pid?: string
}

interface Config {
  tts_provider?: string
  tts_model?: string
  tts_language?: string
  tts_elevenlabs_model?: string
  stt_provider?: string
  stt_model?: string
  stt_language?: string
  llm_provider?: string
  llm_api_key?: string
  worker_mode?: string
  room_name?: string
}

interface Voice {
  id: string
  name: string
  description?: string
  language?: string
  gender?: string
  model_names?: string[]
  modes?: string[]
}

interface VoiceData {
  elevenlabs: Voice[]
  deepgram: Voice[]
  cartesia: Voice[]
}

interface ToastData {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
}

interface CurrentVoiceSample {
  provider: string
  voiceId: string
  voiceName: string
}

type SectionType = 'dashboard' | 'voices' | 'config' | 'worker'
type ProviderType = 'elevenlabs' | 'deepgram' | 'cartesia'
type ConfigType = 'tts' | 'stt' | 'llm' | 'worker' | 'update-all'

// Configuration
const API_BASE_URL = 'http://127.0.0.1:5000/api'

const VoiceLibraryDashboard: FC = () => {
  // State
  const [currentConfig, setCurrentConfig] = useState<Config>({})
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({ status: 'stopped' })
  const [voices, setVoices] = useState<VoiceData>({
    elevenlabs: [],
    deepgram: [],
    cartesia: []
  })
  const [currentVoiceSample, setCurrentVoiceSample] = useState<CurrentVoiceSample | null>(null)
  const [activeSection, setActiveSection] = useState<SectionType>('dashboard')
  const [activeProvider, setActiveProvider] = useState<ProviderType>('elevenlabs')
  const [activeConfig, setActiveConfig] = useState<ConfigType>('tts')
  const [isLoading, setIsLoading] = useState(false)
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false)
  const [sampleText, setSampleText] = useState('Hello, this is a sample of my voice.')
  const [isDownloadEnabled, setIsDownloadEnabled] = useState(false)

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null)
  const downloadUrlRef = useRef<string>('')

  // Utility Functions
  const showLoading = useCallback(() => setIsLoading(true), [])
  const hideLoading = useCallback(() => setIsLoading(false), [])

  const showToast = useCallback((type: ToastData['type'], title: string, message: string) => {
    const id = Date.now().toString()
    const newToast: ToastData = { id, type, title, message }
    setToasts(prev => [...prev, newToast])
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 5000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  // API Functions
  const apiRequest = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('API Request failed:', error)
      throw error
    }
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const config = await apiRequest('/config')
      setCurrentConfig(config)
      return config
    } catch (error) {
      showToast('error', 'Error', 'Failed to load configuration')
      throw error
    }
  }, [apiRequest, showToast])

  const loadWorkerStatus = useCallback(async () => {
    try {
      const status = await apiRequest('/status')
      setWorkerStatus(status)
      return status
    } catch (error) {
      showToast('error', 'Error', 'Failed to load worker status')
      setWorkerStatus({ status: 'stopped' })
      throw error
    }
  }, [apiRequest, showToast])

  const startWorker = useCallback(async () => {
    try {
      showLoading()
      const result = await apiRequest('/start', { method: 'POST' })
      showToast('success', 'Success', result.message)
      await loadWorkerStatus()
    } catch (error) {
      showToast('error', 'Error', 'Failed to start worker')
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading, loadWorkerStatus])

  const stopWorker = useCallback(async () => {
    try {
      showLoading()
      const result = await apiRequest('/stop', { method: 'POST' })
      showToast('success', 'Success', result.message)
      await loadWorkerStatus()
    } catch (error) {
      showToast('error', 'Error', 'Failed to stop worker')
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading, loadWorkerStatus])

  const loadVoices = useCallback(async (provider: ProviderType) => {
    try {
      showLoading()
      const voicesData = await apiRequest(`/${provider}/voices`)
      const voicesList = voicesData.voices || voicesData
      
      setVoices(prev => ({
        ...prev,
        [provider]: voicesList
      }))
      
      showToast('success', 'Success', `Loaded ${provider} voices`)
    } catch (error) {
      showToast('error', 'Error', `Failed to load ${provider} voices`)
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading])

  const generateVoiceSample = useCallback(async (provider: string, voiceId: string, text: string) => {
    try {
      showLoading()
      
      let endpoint: string
      let requestBody: any
      
      switch (provider) {
        case 'elevenlabs':
          endpoint = '/elevenlabs/generate-sample'
          requestBody = {
            voice_id: voiceId,
            text: text,
            model_id: currentConfig.tts_elevenlabs_model || 'eleven_multilingual_v2'
          }
          break
        case 'deepgram':
          endpoint = '/deepgram/generate-sample'
          requestBody = {
            voice: voiceId,
            text: text
          }
          break
        case 'cartesia':
          endpoint = '/cartesia/generate-sample'
          requestBody = {
            voice_id: voiceId,
            text: text
          }
          break
        default:
          throw new Error('Unsupported provider')
      }
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.load()
      }
      
      downloadUrlRef.current = audioUrl
      setIsDownloadEnabled(true)
      
      showToast('success', 'Success', 'Voice sample generated successfully')
      
    } catch (error) {
      console.error('Generate voice sample error:', error)
      showToast('error', 'Error', `Failed to generate voice sample: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      hideLoading()
    }
  }, [currentConfig.tts_elevenlabs_model, showLoading, hideLoading, showToast])

  const updateTTSConfig = useCallback(async (data: any) => {
    try {
      showLoading()
      const result = await apiRequest('/tts', {
        method: 'POST',
        body: JSON.stringify(data)
      })
      showToast('success', 'Success', result.message)
      await loadConfig()
    } catch (error) {
      showToast('error', 'Error', 'Failed to update TTS configuration')
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading, loadConfig])

  const updateSTTConfig = useCallback(async (data: any) => {
    try {
      showLoading()
      const result = await apiRequest('/stt', {
        method: 'POST',
        body: JSON.stringify(data)
      })
      showToast('success', 'Success', result.message)
      await loadConfig()
    } catch (error) {
      showToast('error', 'Error', 'Failed to update STT configuration')
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading, loadConfig])

  const updateLLMConfig = useCallback(async (data: any) => {
    try {
      showLoading()
      const result = await apiRequest('/llm', {
        method: 'POST',
        body: JSON.stringify(data)
      })
      showToast('success', 'Success', result.message)
      await loadConfig()
    } catch (error) {
      showToast('error', 'Error', 'Failed to update LLM configuration')
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading, loadConfig])

  const updateWorkerConfig = useCallback(async (data: any) => {
    try {
      showLoading()
      const result = await apiRequest('/worker-mode', {
        method: 'POST',
        body: JSON.stringify(data)
      })
      showToast('success', 'Success', result.message)
      await loadConfig()
      await loadWorkerStatus()
    } catch (error) {
      showToast('error', 'Error', 'Failed to update worker configuration')
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading, loadConfig, loadWorkerStatus])

  const updateAllConfig = useCallback(async (data: any) => {
    try {
      showLoading()
      const result = await apiRequest('/update_all', {
        method: 'POST',
        body: JSON.stringify(data)
      })
      showToast('success', 'Success', result.message)
      await loadConfig()
      await loadWorkerStatus()
      return result
    } catch (error) {
      showToast('error', 'Error', 'Failed to update all configuration')
      throw error
    } finally {
      hideLoading()
    }
  }, [apiRequest, showToast, showLoading, hideLoading, loadConfig, loadWorkerStatus])

  // Voice Functions
  const selectVoice = useCallback((provider: string, voiceId: string, voiceName: string) => {
    const data = {
      provider: provider,
      model: voiceId,
      ...(provider === 'elevenlabs' && { elevenlabs_model: currentConfig.tts_elevenlabs_model || 'eleven_multilingual_v2' })
    }

    updateTTSConfig(data)
    showToast('success', 'Voice Selected', `Selected ${voiceName} (${voiceId}) for ${provider}`)
  }, [currentConfig.tts_elevenlabs_model, updateTTSConfig, showToast])

  const previewVoice = useCallback((provider: string, voiceId: string, voiceName: string) => {
    setCurrentVoiceSample({ provider, voiceId, voiceName })
    setIsVoiceModalOpen(true)
    setIsDownloadEnabled(false)
    
    if (audioRef.current) {
      audioRef.current.src = ''
      audioRef.current.load()
    }
    
    generateVoiceSample(provider, voiceId, sampleText)
  }, [sampleText, generateVoiceSample])

  const downloadSample = useCallback(() => {
    if (downloadUrlRef.current && currentVoiceSample) {
      const a = document.createElement('a')
      a.href = downloadUrlRef.current
      a.download = `voice_sample_${currentVoiceSample.provider}_${currentVoiceSample.voiceId}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }, [currentVoiceSample])

  // Form Handlers
  const handleTTSSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    updateTTSConfig(data)
  }, [updateTTSConfig])

  const handleSTTSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    updateSTTConfig(data)
  }, [updateSTTConfig])

  const handleLLMSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    updateLLMConfig(data)
  }, [updateLLMConfig])

  const handleWorkerSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    updateWorkerConfig(data)
  }, [updateWorkerConfig])

  const handleUpdateAllSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const formEntries = Object.fromEntries(formData.entries())
    
    const apiData = {
      llm_provider: formEntries['llm-provider'],
      llm_api_key: formEntries['llm-api-key'],
      provider: formEntries['tts-provider'],
      model: formEntries['tts-model'],
      language: formEntries['tts-language']
    }
    
    updateAllConfig(apiData)
  }, [updateAllConfig])

  const handleTTSProviderChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    // This will be handled by the form state if needed
  }, [])

  // Navigation Functions
  const switchSection = useCallback((sectionId: SectionType) => {
    setActiveSection(sectionId)
    if (sectionId === 'voices') {
      setActiveProvider('elevenlabs')
      loadVoices('elevenlabs')
    }
  }, [loadVoices])

  const switchProviderTab = useCallback((provider: ProviderType) => {
    setActiveProvider(provider)
    loadVoices(provider)
  }, [loadVoices])

  const switchConfigTab = useCallback((configType: ConfigType) => {
    setActiveConfig(configType)
  }, [])

  const refreshData = useCallback(() => {
    loadConfig()
    loadWorkerStatus()
  }, [loadConfig, loadWorkerStatus])

  // Effects
  useEffect(() => {
    loadConfig()
    loadWorkerStatus()
    
    const interval = setInterval(() => {
      loadWorkerStatus()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [loadConfig, loadWorkerStatus])

  // Helper Functions
  const getStatusClass = (status: string) => {
    return classNames('status-indicator', {
      'running': status === 'running',
      'stopped': status === 'stopped',
      'loading': status === 'loading',
      'error': status === 'error'
    })
  }

  const getStatusText = (status: string) => {
    const statusMap = {
      running: 'Running',
      stopped: 'Stopped',
      loading: 'Loading...',
      error: 'Error'
    }
    return statusMap[status as keyof typeof statusMap] || 'Unknown'
  }

  const getToastIcon = (type: ToastData['type']) => {
    const iconMap = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    }
    return iconMap[type]
  }

  const getSectionTitle = (section: SectionType) => {
    const titles = {
      dashboard: 'Dashboard',
      voices: 'Voice Library',
      config: 'Configuration',
      worker: 'Worker Management'
    }
    return titles[section]
  }

  const getSectionSubtitle = (section: SectionType) => {
    const subtitles = {
      dashboard: 'Monitor your voice agent status and configuration',
      voices: 'Browse and select voices from different providers',
      config: 'Configure TTS, STT, LLM, and worker settings',
      worker: 'Manage worker processes and monitor status'
    }
    return subtitles[section]
  }

  const renderVoiceCard = (voice: Voice, provider: ProviderType) => {
    const { id: voiceId, name: voiceName, description, language, gender, model_names, modes } = voice
    
    return (
      <div key={voiceId} className="voice-card">
        <div className="voice-card-header">
          <h4>{voiceName}</h4>
          <span className="voice-id">{voiceId}</span>
        </div>
        <div className="voice-meta">
          <div className="voice-meta-item">
            <span className="voice-meta-label">Language:</span>
            <span className="voice-meta-value">{language || 'N/A'}</span>
          </div>
          <div className="voice-meta-item">
            <span className="voice-meta-label">Gender:</span>
            <span className="voice-meta-value">{gender || 'N/A'}</span>
          </div>
          {model_names && model_names.length > 0 && (
            <div className="voice-meta-item">
              <span className="voice-meta-label">Models:</span>
              <span className="voice-meta-value">{model_names.join(', ')}</span>
            </div>
          )}
          {modes && modes.length > 0 && (
            <div className="voice-meta-item">
              <span className="voice-meta-label">Modes:</span>
              <span className="voice-meta-value">{modes.join(', ')}</span>
            </div>
          )}
          <div className="voice-meta-item">
            <span className="voice-meta-label">Description:</span>
            <span className="voice-meta-value">{description || 'No description available.'}</span>
          </div>
        </div>
        <div className="voice-actions">
          <button 
            className="btn btn-primary" 
            onClick={() => selectVoice(provider, voiceId, voiceName)}
          >
            <i className="fas fa-check"></i>
            Select
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => previewVoice(provider, voiceId, voiceName)}
          >
            <i className="fas fa-play"></i>
            Preview
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <i className="fas fa-microphone"></i>
            <span>Voice Library</span>
          </div>
        </div>
        <div className="sidebar-menu">
          <a 
            href="#" 
            className={classNames('menu-item', { active: activeSection === 'dashboard' })}
            onClick={(e) => {
              e.preventDefault()
              switchSection('dashboard')
            }}
          >
            <i className="fas fa-chart-line"></i>
            <span>Voice Library Dashboard</span>
          </a>
          <a 
            href="#" 
            className={classNames('menu-item', { active: activeSection === 'voices' })}
            onClick={(e) => {
              e.preventDefault()
              switchSection('voices')
            }}
          >
            <i className="fas fa-volume-up"></i>
            <span>Voice Library</span>
          </a>
          <a 
            href="#" 
            className={classNames('menu-item', { active: activeSection === 'config' })}
            onClick={(e) => {
              e.preventDefault()
              switchSection('config')
            }}
          >
            <i className="fas fa-cog"></i>
            <span>Configuration</span>
          </a>
          <a 
            href="#" 
            className={classNames('menu-item', { active: activeSection === 'worker' })}
            onClick={(e) => {
              e.preventDefault()
              switchSection('worker')
            }}
          >
            <i className="fas fa-server"></i>
            <span>Worker Management</span>
          </a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <h1>{getSectionTitle(activeSection)}</h1>
            <p>{getSectionSubtitle(activeSection)}</p>
          </div>
          <div className="header-right">
            <div className={getStatusClass(workerStatus.status)}>
              <div className="status-dot"></div>
              <span>{getStatusText(workerStatus.status)}</span>
            </div>
          </div>
        </header>

        {/* Dashboard Section */}
        {activeSection === 'dashboard' && (
          <section className="content-section active">
            <div className="dashboard-grid">
              <div className="card">
                <div className="card-header">
                  <h3>Worker Status</h3>
                  <i className="fas fa-server"></i>
                </div>
                <div className="card-content status-card">
                  <div className={classNames(getStatusClass(workerStatus.status), 'large')}>
                    <div className="status-dot"></div>
                    <span>{getStatusText(workerStatus.status)}</span>
                  </div>
                  <div className="status-details">
                    <p><strong>PID:</strong> <span>{workerStatus.pid || '-'}</span></p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Current Configuration</h3>
                  <i className="fas fa-cog"></i>
                </div>
                <div className="card-content config-overview">
                  <div className="config-item">
                    <span className="label">TTS Provider:</span>
                    <span className="value">{currentConfig.tts_provider || '-'}</span>
                  </div>
                  <div className="config-item">
                    <span className="label">TTS Model:</span>
                    <span className="value">{currentConfig.tts_model || '-'}</span>
                  </div>
                  <div className="config-item">
                    <span className="label">STT Provider:</span>
                    <span className="value">{currentConfig.stt_provider || '-'}</span>
                  </div>
                  <div className="config-item">
                    <span className="label">LLM Provider:</span>
                    <span className="value">{currentConfig.llm_provider || '-'}</span>
                  </div>
                  <div className="config-item">
                    <span className="label">Worker Mode:</span>
                    <span className="value">{currentConfig.worker_mode || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Quick Actions</h3>
                  <i className="fas fa-bolt"></i>
                </div>
                <div className="card-content quick-actions">
                  <button className="btn btn-primary btn-large" onClick={startWorker}>
                    <i className="fas fa-play"></i>
                    Start Worker
                  </button>
                  <button className="btn btn-danger btn-large" onClick={stopWorker}>
                    <i className="fas fa-stop"></i>
                    Stop Worker
                  </button>
                  <button className="btn btn-secondary btn-large" onClick={refreshData}>
                    <i className="fas fa-sync-alt"></i>
                    Refresh Status
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Voice Library Section */}
        {activeSection === 'voices' && (
          <section className="content-section active">
            <div className="provider-tabs">
              <button 
                className={classNames('tab-btn', { active: activeProvider === 'elevenlabs' })}
                onClick={() => switchProviderTab('elevenlabs')}
              >
                <i className="fas fa-microphone"></i>
                ElevenLabs
              </button>
              <button 
                className={classNames('tab-btn', { active: activeProvider === 'deepgram' })}
                onClick={() => switchProviderTab('deepgram')}
              >
                <i className="fas fa-headphones"></i>
                Deepgram
              </button>
              <button 
                className={classNames('tab-btn', { active: activeProvider === 'cartesia' })}
                onClick={() => switchProviderTab('cartesia')}
              >
                <i className="fas fa-volume-up"></i>
                Cartesia
              </button>
            </div>

            <div className={classNames('provider-content', { active: activeProvider === 'elevenlabs' })}>
              <div className="voices-grid">
                {voices.elevenlabs.length === 0 ? (
                  <div className="loading-placeholder">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>No voices available</p>
                  </div>
                ) : (
                  voices.elevenlabs.map(voice => renderVoiceCard(voice, 'elevenlabs'))
                )}
              </div>
            </div>

            <div className={classNames('provider-content', { active: activeProvider === 'deepgram' })}>
              <div className="voices-grid">
                {voices.deepgram.length === 0 ? (
                  <div className="loading-placeholder">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>No voices available</p>
                  </div>
                ) : (
                  voices.deepgram.map(voice => renderVoiceCard(voice, 'deepgram'))
                )}
              </div>
            </div>

            <div className={classNames('provider-content', { active: activeProvider === 'cartesia' })}>
              <div className="voices-grid">
                {voices.cartesia.length === 0 ? (
                  <div className="loading-placeholder">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>No voices available</p>
                  </div>
                ) : (
                  voices.cartesia.map(voice => renderVoiceCard(voice, 'cartesia'))
                )}
              </div>
            </div>
          </section>
        )}

        {/* Configuration Section */}
        {activeSection === 'config' && (
          <section className="content-section active">
            <div className="config-tabs">
              <button 
                className={classNames('tab-btn', { active: activeConfig === 'tts' })}
                onClick={() => switchConfigTab('tts')}
              >
                <i className="fas fa-microphone"></i>
                Text-to-Speech
              </button>
              <button 
                className={classNames('tab-btn', { active: activeConfig === 'stt' })}
                onClick={() => switchConfigTab('stt')}
              >
                <i className="fas fa-headphones"></i>
                Speech-to-Text
              </button>
              <button 
                className={classNames('tab-btn', { active: activeConfig === 'llm' })}
                onClick={() => switchConfigTab('llm')}
              >
                <i className="fas fa-brain"></i>
                Language Model
              </button>
              <button 
                className={classNames('tab-btn', { active: activeConfig === 'worker' })}
                onClick={() => switchConfigTab('worker')}
              >
                <i className="fas fa-server"></i>
                Worker Settings
              </button>
              <button 
                className={classNames('tab-btn', { active: activeConfig === 'update-all' })}
                onClick={() => switchConfigTab('update-all')}
              >
                <i className="fas fa-sync"></i>
                Update All
              </button>
            </div>

            {/* TTS Configuration */}
            {activeConfig === 'tts' && (
              <div className="config-panel active">
                <div className="card">
                  <div className="card-header">
                    <h3>Text-to-Speech Configuration</h3>
                  </div>
                  <div className="card-content">
                    <form onSubmit={handleTTSSubmit}>
                      <div className="form-group">
                        <label htmlFor="tts-provider">Provider</label>
                        <select 
                          id="tts-provider" 
                          name="provider" 
                          required 
                          value={currentConfig.tts_provider || ''}
                          onChange={handleTTSProviderChange}
                        >
                          <option value="elevenlabs">ElevenLabs</option>
                          <option value="deepgram">Deepgram</option>
                          <option value="cartesia">Cartesia</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="tts-model">Voice/Model</label>
                        <input 
                          type="text" 
                          id="tts-model" 
                          name="model" 
                          placeholder="Voice ID or Model Name" 
                          required 
                          value={currentConfig.tts_model || ''}
                          onChange={() => {}}
                        />
                      </div>
                      {currentConfig.tts_provider === 'elevenlabs' && (
                        <div className="form-group">
                          <label htmlFor="elevenlabs-model">ElevenLabs Model</label>
                          <select 
                            id="elevenlabs-model" 
                            name="elevenlabs_model"
                            value={currentConfig.tts_elevenlabs_model || 'eleven_multilingual_v2'}
                            onChange={() => {}}
                          >
                            <option value="eleven_multilingual_v2">Eleven Multilingual V2</option>
                            <option value="eleven_english_v1">Eleven English V1</option>
                            <option value="eleven_turbo_v2">Eleven Turbo V2</option>
                          </select>
                        </div>
                      )}
                      <div className="form-group">
                        <label htmlFor="tts-language">Language</label>
                        <input 
                          type="text" 
                          id="tts-language" 
                          name="language" 
                          placeholder="e.g., en, es, fr"
                          value={currentConfig.tts_language || ''}
                          onChange={() => {}}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary">
                        <i className="fas fa-save"></i>
                        Update TTS Configuration
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* STT Configuration */}
            {activeConfig === 'stt' && (
              <div className="config-panel active">
                <div className="card">
                  <div className="card-header">
                    <h3>Speech-to-Text Configuration</h3>
                  </div>
                  <div className="card-content">
                    <form onSubmit={handleSTTSubmit}>
                      <div className="form-group">
                        <label htmlFor="stt-provider">Provider</label>
                        <select 
                          id="stt-provider" 
                          name="provider" 
                          required
                          value={currentConfig.stt_provider || ''}
                          onChange={() => {}}
                        >
                          <option value="deepgram">Deepgram</option>
                          <option value="groq">Groq</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="stt-model">Model</label>
                        <input 
                          type="text" 
                          id="stt-model" 
                          name="model" 
                          placeholder="Model Name" 
                          required
                          value={currentConfig.stt_model || ''}
                          onChange={() => {}}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="stt-language">Language</label>
                        <input 
                          type="text" 
                          id="stt-language" 
                          name="language" 
                          placeholder="e.g., en, es, fr"
                          value={currentConfig.stt_language || ''}
                          onChange={() => {}}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary">
                        <i className="fas fa-save"></i>
                        Update STT Configuration
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* LLM Configuration */}
            {activeConfig === 'llm' && (
              <div className="config-panel active">
                <div className="card">
                  <div className="card-header">
                    <h3>Language Model Configuration</h3>
                  </div>
                  <div className="card-content">
                    <form onSubmit={handleLLMSubmit}>
                      <div className="form-group">
                        <label htmlFor="llm-provider">Provider</label>
                        <select 
                          id="llm-provider" 
                          name="provider" 
                          required
                          value={currentConfig.llm_provider || ''}
                          onChange={() => {}}
                        >
                          <option value="groq">Groq</option>
                          <option value="openai">OpenAI</option>
                          <option value="lamapbx">LamaPBX</option>
                        </select>
                      </div>
                      <button type="submit" className="btn btn-primary">
                        <i className="fas fa-save"></i>
                        Update LLM Configuration
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* Worker Configuration */}
            {activeConfig === 'worker' && (
              <div className="config-panel active">
                <div className="card">
                  <div className="card-header">
                    <h3>Worker Settings</h3>
                  </div>
                  <div className="card-content">
                    <form onSubmit={handleWorkerSubmit}>
                      <div className="form-group">
                        <label htmlFor="worker-mode">Worker Mode</label>
                        <select 
                          id="worker-mode" 
                          name="mode" 
                          required
                          value={currentConfig.worker_mode || ''}
                          onChange={() => {}}
                        >
                          <option value="dev">Development</option>
                          <option value="prod">Production</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="room-name">Room Name</label>
                        <input 
                          type="text" 
                          id="room-name" 
                          name="room_name" 
                          placeholder="Room Name"
                          value={currentConfig.room_name || ''}
                          onChange={() => {}}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary">
                        <i className="fas fa-save"></i>
                        Update Worker Configuration
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* Update All Configuration */}
            {activeConfig === 'update-all' && (
              <div className="config-panel active">
                <div className="card">
                  <div className="card-header">
                    <h3>Update All Configuration</h3>
                    <p className="card-description">Update LLM and TTS settings in a single request</p>
                  </div>
                  <div className="card-content">
                    <form onSubmit={handleUpdateAllSubmit}>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="update-all-llm-provider">LLM Provider</label>
                          <select 
                            id="update-all-llm-provider" 
                            name="llm-provider" 
                            required
                            defaultValue={currentConfig.llm_provider || ''}
                          >
                            <option value="groq">Groq</option>
                            <option value="openai">OpenAI</option>
                            <option value="lamapbx">LamaPBX</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="update-all-llm-api-key">LLM API Key</label>
                          <input 
                            type="password" 
                            id="update-all-llm-api-key" 
                            name="llm-api-key" 
                            placeholder="API Key" 
                            required
                            defaultValue={currentConfig.llm_api_key || ''}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="update-all-tts-provider">TTS Provider</label>
                          <select 
                            id="update-all-tts-provider" 
                            name="tts-provider" 
                            required
                            defaultValue={currentConfig.tts_provider || ''}
                          >
                            <option value="elevenlabs">ElevenLabs</option>
                            <option value="deepgram">Deepgram</option>
                            <option value="cartesia">Cartesia</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="update-all-tts-model">TTS Model/Voice ID</label>
                          <input 
                            type="text" 
                            id="update-all-tts-model" 
                            name="tts-model" 
                            placeholder="Voice ID or Model Name" 
                            required
                            defaultValue={currentConfig.tts_model || ''}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label htmlFor="update-all-tts-language">Language</label>
                        <input 
                          type="text" 
                          id="update-all-tts-language" 
                          name="tts-language" 
                          placeholder="e.g., en, es, fr" 
                          defaultValue={currentConfig.tts_language || 'en'}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary btn-large">
                        <i className="fas fa-sync"></i>
                        Update All Configuration
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Worker Management Section */}
        {activeSection === 'worker' && (
          <section className="content-section active">
            <div className="worker-container">
              <div className="card">
                <div className="card-header">
                  <h3>Worker Management</h3>
                  <i className="fas fa-server"></i>
                </div>
                <div className="card-content">
                  <div className="worker-status-display">
                    <div className={classNames(getStatusClass(workerStatus.status), 'large')}>
                      <div className="status-dot"></div>
                      <span>{getStatusText(workerStatus.status)}</span>
                    </div>
                    <div className="worker-info">
                      <p><strong>PID:</strong> <span>{workerStatus.pid || '-'}</span></p>
                      <p><strong>Mode:</strong> <span>{currentConfig.worker_mode || '-'}</span></p>
                      <p><strong>Room:</strong> <span>{currentConfig.room_name || '-'}</span></p>
                    </div>
                  </div>
                  <div className="worker-actions">
                    <button className="btn btn-primary btn-large" onClick={startWorker}>
                      <i className="fas fa-play"></i>
                      Start Worker
                    </button>
                    <button className="btn btn-danger btn-large" onClick={stopWorker}>
                      <i className="fas fa-stop"></i>
                      Stop Worker
                    </button>
                    <button className="btn btn-secondary btn-large" onClick={refreshData}>
                      <i className="fas fa-sync-alt"></i>
                      Refresh Status
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay active">
          <div className="loading-spinner">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Loading...</p>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <i className={`toast-icon ${getToastIcon(toast.type)}`}></i>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>
              <i className="fas fa-times"></i>
            </button>
          </div>
        ))}
      </div>

      {/* Voice Sample Modal */}
      {isVoiceModalOpen && currentVoiceSample && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header">
              <h3>{currentVoiceSample.voiceName}</h3>
              <button className="modal-close" onClick={() => setIsVoiceModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-content">
              <div className="voice-sample-player">
                <div className="sample-info">
                  <p><strong>Voice ID:</strong> <span>{currentVoiceSample.voiceId}</span></p>
                  <p><strong>Provider:</strong> <span>{currentVoiceSample.provider}</span></p>
                </div>
                
                <div className="sample-input">
                  <label htmlFor="sample-text-input">Sample Text:</label>
                  <textarea 
                    id="sample-text-input" 
                    placeholder="Enter text to generate voice sample..." 
                    rows={3}
                    value={sampleText}
                    onChange={(e) => setSampleText(e.target.value)}
                  />
                  <div className="generate-sample-container">
                    <button 
                      className="btn btn-primary"
                      onClick={() => generateVoiceSample(currentVoiceSample.provider, currentVoiceSample.voiceId, sampleText)}
                    >
                      <i className="fas fa-microphone"></i>
                      Generate Sample
                    </button>
                  </div>
                </div>
                
                <div className="audio-player">
                  <audio ref={audioRef} controls>
                    Your browser does not support the audio element.
                  </audio>
                </div>
                
                <div className="sample-actions">
                  <button 
                    className="btn btn-primary" 
                    disabled={!isDownloadEnabled}
                    onClick={downloadSample}
                  >
                    <i className="fas fa-download"></i>
                    Download Sample
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceLibraryDashboard

