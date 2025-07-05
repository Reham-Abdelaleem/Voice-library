import os
from flask import request, jsonify, Response
import requests
from config_manager import load_config, save_config, load_deepgram_models, load_cartesia_voices, load_elevenlabs_voices
from worker_manager import restart_worker, start_worker, stop_worker, get_worker_status
from agent_generator import generate_agent_code

# --- API Key Retrieval Functions ---
# It's highly recommended to use environment variables for API keys
def get_elevenlabs_api_key():
    api_key = os.environ.get("ELEVEN_API_KEY")
    # --- START ADDED DEBUGGING ---
    print(f"DEBUG: ElevenLabs API Key (first 5 chars): {api_key[:5] if api_key else 'None'}")
    # --- END ADDED DEBUGGING ---
    return api_key

def get_deepgram_api_key():
    return os.environ.get("DEEPGRAM_API_KEY")

def get_cartesia_api_key():
    return os.environ.get("CARTESIA_API_KEY")

# --- TTS Provider API Call Helpers ---
# These functions encapsulate the actual API calls to each provider

def call_elevenlabs_api(voice_id, text, model_id):
    api_key = get_elevenlabs_api_key()
    if not api_key:
        # --- START ADDED DEBUGGING ---
        print("ERROR: ElevenLabs API Key is missing when calling API.")
        # --- END ADDED DEBUGGING ---
        raise ValueError("ELEVENLABS_API_KEY not set")

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key
    }
    json_data = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    response = requests.post(url, json=json_data, headers=headers )
    response.raise_for_status() # Raise an exception for HTTP errors
    return response.content


# MultipleFiles/api_routes.py
def call_deepgram_api(voice, text):
    api_key = get_deepgram_api_key()
    if not api_key:
        raise ValueError("DEEPGRAM_API_KEY not set")
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json"
    }
    json_data = {
        "text": text
    }
    url = f"https://api.deepgram.com/v1/speak?model={voice}&encoding=mp3"
    response = requests.post(url, json=json_data, headers=headers)
    if response.status_code != 200:
        print(f"Deepgram API Error Response (Status {response.status_code}):")
        try:
            print(response.json())
        except requests.exceptions.JSONDecodeError:
            print(response.text)
        response.raise_for_status() # This will raise an exception for non-200 codes
    return response.content

def call_cartesia_api(voice_id, text):
    url = "https://api.cartesia.ai/tts/bytes"  # Replace with the correct Cartesia API endpoint
    headers = {
        "Authorization": f"Bearer {os.getenv('CARTESIA_API_KEY')}",  # Use environment variable
        "Content-Type": "application/json",
        "Cartesia-Version": "2025-04-16"  # Adjust the version as needed
    }
    data = {
        "transcript": text,
        "model_id": "sonic-2",  # Adjust as needed
        "voice": {
            "mode": "id",
            "id": voice_id
        },
        "output_format": {
            "container": "wav",  # Specify the container format
            "encoding": "pcm_f32le",  # Specify the encoding format
            "sample_rate": 44100  # Specify the sample rate
        }
    }
    response = requests.post(url, headers=headers, json=data)

    if response.status_code != 200:
        raise ValueError(f"Error from Cartesia API: {response.text}")
    # Check if the response content is empty
    if not response.content:
        raise ValueError("No audio content returned from Cartesia API.")
    return response.content  # Return the audio content


def register_routes(app, socketio):
    """Register all API routes with the Flask application"""
    
    @app.route("/api/config", methods=["GET"])
    def get_config():
        """Get current configuration"""
        return jsonify(load_config())

    @app.route("/api/config", methods=["POST"])
    def update_config():
        """Update configuration"""
        current_config = load_config()
        new_config = request.json

        # Update configuration
        for key, value in new_config.items():
            if key in current_config:
                current_config[key] = value

        # Save updated configuration
        save_config(current_config)

        # Generate new agent code
        generate_agent_code(current_config)

        # Restart worker
        pid = restart_worker()

        return jsonify({
            "message": "Configuration updated and worker restarted",
            "config": current_config,
            "worker_pid": pid
        })

    @app.route("/api/tts", methods=["POST"])
    def update_tts():
        """Update TTS provider and model/voice"""
        data = request.json
        provider = data.get("provider")
        model = data.get("model", "") # This is the voice_id or model name
        language = data.get("language", "en") # Default to 'en' if not provided
        elevenlabs_model = data.get("elevenlabs_model", "eleven_multilingual_v2")

        if provider not in ["cartesia", "deepgram", "elevenlabs"]:
            return jsonify({"error": "Invalid TTS provider"}), 400

        config = load_config()
        config["tts_provider"] = provider
        config["tts_model"] = model # Ensure this is updated with the new model/voice ID
        config["tts_language"] = language # Ensure language is saved

        voice_name = "" # Initialize for response message

        # Provider-specific validation and settings
        if provider == "deepgram":
            deepgram_models = load_deepgram_models()
            if not any(v["id"] == model for v in deepgram_models):
                return jsonify({"error": f"Invalid Deepgram voice model. Available models: {[v['id'] for v in deepgram_models]}"}), 400
            found_voice = next((v for v in deepgram_models if v["id"] == model), None)
            voice_name = found_voice.get("name", model) if found_voice else model

        elif provider == "cartesia":
            cartesia_voices = load_cartesia_voices()
            found_voice = next((v for v in cartesia_voices if v["id"] == model), None)
            if not found_voice:
                return jsonify({"error": f"Invalid Cartesia voice ID: {model}"}), 400
            voice_name = found_voice.get("name", model)

        elif provider == "elevenlabs":
            elevenlabs_voices = load_elevenlabs_voices()
            found_voice = next((v for v in elevenlabs_voices if v.get("id") == model), None) # Use 'id' for ElevenLabs voices
            if not found_voice:
                return jsonify({"error": f"Invalid ElevenLabs voice ID: {model}"}), 400
            
            valid_models = found_voice.get("model_names", [])
            if elevenlabs_model not in valid_models:
                # Fallback to a valid model if the requested one is not compatible
                elevenlabs_model = valid_models[0] if valid_models else "eleven_multilingual_v2"  
                print(f"WARNING: Requested ElevenLabs model '{data.get('elevenlabs_model')}' not valid for voice '{model}'. Falling back to '{elevenlabs_model}'.")

            config["tts_elevenlabs_model"] = elevenlabs_model # Crucial for ElevenLabs

            voice_name = found_voice.get("name", model)

        save_config(config) # Save the updated configuration
        generate_agent_code(config) # Regenerate agent_worker.py with the new config
        restart_worker() # Restart the worker to apply changes

        return jsonify({
            "message": f"TTS provider updated to {provider} with model {model} and voice {voice_name}",
            "current_session_updated": True
        })



    @app.route("/api/deepgram/voices", methods=["GET"])
    def get_deepgram_voices():
        """Get available Deepgram voice models"""
        voices = load_deepgram_models()
        # Return the full list of voices directly
        return jsonify({
            "voices": voices
        })

    @app.route("/api/deepgram/voice", methods=["POST"])
    def update_deepgram_voice():
        """Update Deepgram voice model"""
        model = request.json.get("model")
        if not model:
            return jsonify({"error": "Model parameter is required"}), 400

        deepgram_models = load_deepgram_models()
        # Check if the model ID exists in the loaded models
        if not any(v["id"] == model for v in deepgram_models):
            return jsonify({"error": f"Invalid Deepgram voice model. Available models: {[v['id'] for v in deepgram_models]}"}), 400

        config = load_config()
        # Only update if provider is already deepgram or being set to deepgram
        if config["tts_provider"] == "deepgram" or request.json.get("provider") == "deepgram":
            config["tts_provider"] = "deepgram"
            config["tts_model"] = model
            save_config(config)

            # Generate new agent code
            generate_agent_code(config)

            # Restart worker
            pid = restart_worker()

            # Extract name for response
            found_voice = next((v for v in deepgram_models if v["id"] == model), None)
            voice_name = found_voice.get("name", model) if found_voice else model

            return jsonify({
                "message": f"Deepgram voice updated to \'{voice_name}\' (model: {model}) and worker restarted",
                "worker_pid": pid
            })
        else:
            return jsonify({
                "error": f"Current TTS provider is {config['tts_provider']}. Set provider to \'deepgram\' first or include provider in request."
            }), 400

    @app.route("/api/cartesia/voices", methods=["GET"])
    def get_cartesia_voices():
        print("Received request for /api/cartesia/voices")
        try:
            voices = load_cartesia_voices()
            print(f"Loaded {len(voices)} voices from config_manager.")
            # Return the full list of voices directly
            return jsonify({
                "voices": voices
            })
        except Exception as e:
            print(f"Error in get_cartesia_voices: {e}")
            return jsonify({"error": "Internal server error fetching voices"}), 500
            
    @app.route("/api/cartesia/voice", methods=["POST"])
    def update_cartesia_voice():
        """Update Cartesia voice"""
        voice_id = request.json.get("voice_id")
        language = request.json.get("language")

        if not voice_id:
            return jsonify({"error": "voice_id parameter is required"}), 400

        # Validate voice ID
        cartesia_voices = load_cartesia_voices()
        found_voice = next((v for v in cartesia_voices if v["id"] == voice_id), None)

        if not found_voice:
            return jsonify({"error": f"Invalid Cartesia voice ID"}), 400

        # Find the correct language for this voice ID if not provided
        if not language:
            language = found_voice.get("language")

        config = load_config()
        # Only update if provider is already cartesia or being set to cartesia
        if config["tts_provider"] == "cartesia" or request.json.get("provider") == "cartesia":
            config["tts_provider"] = "cartesia"
            config["tts_model"] = voice_id
            config["tts_language"] = language
            save_config(config)

            # Generate new agent code
            generate_agent_code(config)

            # Restart worker
            pid = restart_worker()

            voice_name = found_voice.get("name", voice_id)

            return jsonify({
                "message": f"Cartesia voice updated to \'{voice_name}\' (ID: {voice_id}) with language {language} and worker restarted",
                "worker_pid": pid
            })
        else:
            return jsonify({
                "error": f"Current TTS provider is {config['tts_provider']}. Set provider to \'cartesia\' first or include provider in request."
            }), 400

    @app.route("/api/elevenlabs/voices", methods=["GET"])
    def get_elevenlabs_voices():
        """Get available ElevenLabs voices"""
        voices = load_elevenlabs_voices()
        # Return the full list of voices directly
        return jsonify({
            "voices": voices
        })

    @app.route("/api/elevenlabs/voice", methods=["POST"])
    def update_elevenlabs_voice():
        """Update ElevenLabs voice"""
        voice_id = request.json.get("voice_id")
        model = request.json.get("model", "eleven_multilingual_v2")  # Default model

        if not voice_id:
            return jsonify({"error": "voice_id parameter is required"}), 400

        # Validate voice ID
        elevenlabs_voices = load_elevenlabs_voices()
        found_voice = next((v for v in elevenlabs_voices if v["voice_id"] == voice_id), None)

        if not found_voice:
            return jsonify({"error": f"Invalid ElevenLabs voice ID"}), 400

        # Validate model for this voice
        valid_models = found_voice.get("model_names", [])
        voice_name = found_voice.get("name", voice_id)

        if model not in valid_models:
            return jsonify({
                "error": f"Invalid model for this voice. Available models: {valid_models}"
            }), 400

        config = load_config()
        # Only update if provider is already elevenlabs or being set to elevenlabs
        if config["tts_provider"] == "elevenlabs" or request.json.get("provider") == "elevenlabs":
            config["tts_provider"] = "elevenlabs"
            config["tts_model"] = voice_id
            config["tts_elevenlabs_model"] = model
            save_config(config)

            # Generate new agent code
            generate_agent_code(config)

            # Restart worker
            pid = restart_worker()

            return jsonify({
                "message": f"ElevenLabs voice updated to \'{voice_name}\' (ID: {voice_id}) with model {model} and worker restarted",
                "worker_pid": pid
            })
        else:
            return jsonify({
                "error": f"Current TTS provider is {config['tts_provider']}. Set provider to \'elevenlabs\' first or include provider in request."
            }), 400

    @app.route("/api/stt", methods=["POST"])
    def update_stt():
        """Update STT configuration"""
        provider = request.json.get("provider")
        model = request.json.get("model")
        language = request.json.get("language")

        config = load_config()
        if provider:
            config["stt_provider"] = provider
        if model:
            config["stt_model"] = model
        if language:
            config["stt_language"] = language

        save_config(config)

        # Generate new agent code
        generate_agent_code(config)

        # Restart worker
        pid = restart_worker()

        return jsonify({
            "message": "STT configuration updated and worker restarted",
            "worker_pid": pid
        })

    @app.route("/api/llm", methods=["POST"])
    def update_llm():
        """Update LLM provider"""
        provider = request.json.get("provider")
        api_key = request.json.get("api_key")
        if provider not in ["groq", "openai", "lamapbx"]:
            return jsonify({"error": "Invalid LLM provider"}), 400

        config = load_config()
        config["llm_provider"] = provider
        if api_key:
            config["llm_api_key"] = api_key
        save_config(config)

        # Generate new agent code
        generate_agent_code(config)

        # Restart worker
        pid = restart_worker()

        return jsonify({
            "message": f"LLM provider updated to {provider} and worker restarted",
            "worker_pid": pid
        })

    @app.route("/api/worker-mode", methods=["POST"])
    def update_worker_mode():
        """Update worker mode and room name"""
        mode = request.json.get("mode")
        room = request.json.get("room")

        if mode not in ["dev", "connect", "console"]:
            return jsonify({"error": "Invalid worker mode"}), 400

        config = load_config()
        config["worker_mode"] = mode
        if room:
            config["room_name"] = room

        save_config(config)

        # Generate new agent code
        generate_agent_code(config)

        # Restart worker
        pid = restart_worker()

        return jsonify({
            "message": f"Worker mode updated to {mode} and worker restarted",
            "worker_pid": pid
        })

    @app.route("/api/status", methods=["GET"])
    def get_status():
        """Get worker status"""
        status = get_worker_status()
        return jsonify(status)

    @app.route("/api/start", methods=["POST"])
    def start():
        """Start worker"""
        config = load_config()
        generate_agent_code(config)
        pid = start_worker()

        return jsonify({
            "message": "Worker started",
            "worker_pid": pid
        })

    @app.route("/api/stop", methods=["POST"])
    def stop():
        """Stop worker"""
        stop_worker()
        return jsonify({
            "message": "Worker stopped"
        })

    @app.route("/api/update_all", methods=["POST"])
    def update_all_config():
        """Update all configuration settings"""
        data = request.json
        llm_provider = data.get("llm_provider")
        llm_api_key = data.get("llm_api_key")
        tts_provider = data.get("provider") # Note: API expects 'provider' for TTS provider
        tts_model = data.get("model")
        tts_language = data.get("language")

        config = load_config()

        if llm_provider:
            config["llm_provider"] = llm_provider
        if llm_api_key:
            config["llm_api_key"] = llm_api_key
        
        if tts_provider:
            config["tts_provider"] = tts_provider
        if tts_model:
            config["tts_model"] = tts_model
        if tts_language:
            config["tts_language"] = tts_language
        
        # Handle elevenlabs_model specifically for ElevenLabs provider
        if tts_provider == "elevenlabs":
            elevenlabs_model = data.get("elevenlabs_model")
            if elevenlabs_model:
                config["tts_elevenlabs_model"] = elevenlabs_model

        save_config(config)
        generate_agent_code(config)
        restart_worker()

        return jsonify({"message": "All configuration updated successfully!"})

    # --- Voice Sample Generation Routes ---

    @app.route("/api/elevenlabs/generate-sample", methods=["POST"])
    def generate_elevenlabs_sample():
        data = request.json
        voice_id = data.get("voice_id")
        text = data.get("text")
        model_id = data.get("model_id", "eleven_multilingual_v2") # Default model

        if not voice_id or not text:
            return jsonify({"error": "voice_id and text are required"}), 400

        try:
            audio_content = call_elevenlabs_api(voice_id, text, model_id)
            return Response(audio_content, mimetype="audio/mpeg")

        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except requests.exceptions.RequestException as e:
            return jsonify({"error": f"ElevenLabs API error: {str(e)}"}), 500
        except Exception as e:
            return jsonify({"error": f"Failed to generate ElevenLabs sample: {str(e)}"}), 500

    @app.route("/api/deepgram/generate-sample", methods=["POST"])
    def generate_deepgram_sample():
        data = request.json
        voice = data.get("voice")
        text = data.get("text")
        if not voice or not text:
            return jsonify({"error": "voice and text are required"}), 400
        try:
            audio_content = call_deepgram_api(voice, text)
            print(f"DEBUG: Length of audio_content received from Deepgram: {len(audio_content)} bytes")
            # --- MODIFIED PART: Add Content-Length header ---
            response = Response(audio_content, mimetype="audio/mpeg")
            response.headers["Content-Length"] = len(audio_content)
            return response
            # --- END MODIFIED PART ---
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except requests.exceptions.RequestException as e:
            return jsonify({"error": f"Deepgram API error: {str(e)}"}), 500
        except Exception as e:
            return jsonify({"error": f"Failed to generate Deepgram sample: {str(e)}"}), 500
            
    @app.route("/api/cartesia/generate-sample", methods=["POST"])
    def generate_cartesia_sample():
        data = request.json
        voice_id = data.get("voice_id")
        text = data.get("text")
        if not voice_id or not text:
            return jsonify({"error": "voice_id and text are required"}), 400
        try:
            audio_content = call_cartesia_api(voice_id, text)
            # Save the audio content to a file for testing
            with open("output_audio.wav", "wb") as audio_file:
                audio_file.write(audio_content)
            return Response(audio_content, mimetype="audio/mpeg")
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except requests.exceptions.RequestException as e:
            return jsonify({"error": f"Cartesia API error: {str(e)}"}), 500
        except Exception as e:
            return jsonify({"error": f"Failed to generate Cartesia sample: {str(e)}"}), 500
