import json
from pathlib import Path
# At the top of the file
from voice_models import (
    DEFAULT_DEEPGRAM_MODELS,
    DEFAULT_CARTESIA_VOICES,
    DEFAULT_ELEVENLABS_VOICES
)
# Configuration file paths
CONFIG_FILE = 'agent_config.json'
DEEPGRAM_MODELS_FILE = 'deepgram.json'
CARTESIA_VOICES_FILE = 'cartesia_voices.json'
ELEVENLABS_VOICES_FILE = 'elevenlabs_voices.json'

# Default configuration
DEFAULT_CONFIG = {
    "stt_provider": "deepgram",
    "stt_model": "nova-3",
    "stt_language": "multi",
    "llm_provider": "lamapbx",
    "tts_provider": "cartesia",
    "tts_model": "",
    "tts_language": "en",
    "vad_provider": "silero",
    "use_noise_cancellation": True,
    "worker_mode": "dev",
    "room_name": "default-room"
}

def load_config():
    """Load configuration from file or create default if not exists"""
    config_path = Path(CONFIG_FILE)
    if config_path.exists():
        with open(config_path, 'r') as f:
            return json.load(f)
    else:
        with open(config_path, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        return DEFAULT_CONFIG


def save_config(config):
    """Save configuration to file"""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        print(f"Configuration saved to {CONFIG_FILE}") # Add print for debugging
    except Exception as e:
        print(f"Error saving configuration to {CONFIG_FILE}: {e}")

def load_deepgram_models():
    """Load Deepgram voice models from file or create default if not exists"""
    models_path = Path(DEEPGRAM_MODELS_FILE)
    if models_path.exists():
        with open(models_path, 'r') as f:
            return json.load(f)
    else:
        from voice_models import DEFAULT_DEEPGRAM_MODELS
        with open(models_path, 'w') as f:
            json.dump(DEFAULT_DEEPGRAM_MODELS, f, indent=2)
        return DEFAULT_DEEPGRAM_MODELS

def load_cartesia_voices():
    """Load Cartesia voices from file or create default if not exists"""
    voices_path = Path(CARTESIA_VOICES_FILE)
    if voices_path.exists():
        with open(voices_path, 'r') as f:
            return json.load(f)
    else:
        from voice_models import DEFAULT_CARTESIA_VOICES
        with open(voices_path, 'w') as f:
            json.dump(DEFAULT_CARTESIA_VOICES, f, indent=2)
        return DEFAULT_CARTESIA_VOICES

def load_elevenlabs_voices():
    """Load ElevenLabs voices from file or create default if not exists"""
    voices_path = Path(ELEVENLABS_VOICES_FILE)
    if voices_path.exists():
        with open(voices_path, 'r') as f:
            return json.load(f)
    else:
        from voice_models import DEFAULT_ELEVENLABS_VOICES
        with open(voices_path, 'w') as f:
            json.dump(DEFAULT_ELEVENLABS_VOICES, f, indent=2)
        return DEFAULT_ELEVENLABS_VOICES
