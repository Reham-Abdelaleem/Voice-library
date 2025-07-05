def generate_agent_code(config):
    """Generate agent code based on configuration with hot-reload capability"""
    code = f"""from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import (
    openai, cartesia, deepgram, noise_cancellation, silero, groq, elevenlabs
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel
import lamapbx
import signal
import os
import json
import asyncio
import threading
from flask import Flask, request, jsonify

load_dotenv()

# Global session object for hot-reloading
global_session = None
global_room = None

# Create a Flask app for the worker API
worker_api = Flask(__name__)

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="You are a helpful voice AI assistant called llama, you talk with users with Voice.")

@worker_api.route('/update-tts', methods=['POST'])
def update_tts_endpoint():
    \"\"\"API endpoint to update TTS during runtime\"\"\"
    data = request.json
    provider = data.get('provider')
    model = data.get('model', '')
    language = data.get('language', 'en')
    elevenlabs_model = data.get('elevenlabs_model', 'eleven_multilingual_v2')

    # Schedule the async TTS update
    asyncio.create_task(update_tts(provider, model, language, elevenlabs_model))

    return jsonify({{
        "message": f"TTS update scheduled to {{provider}} with model {{model}}"
    }})

async def update_tts(provider, model, language, elevenlabs_model=None):
    \"\"\"Update TTS in the active session\"\"\"
    global global_session

    if global_session is None:
        print("Session not initialized yet, cannot update TTS")
        return False

    try:
        new_tts = None
        if provider == 'cartesia':
            if model:
                new_tts = cartesia.TTS(voice=model, language=language)
            else:
                new_tts = cartesia.TTS(language=language)
        elif provider == 'deepgram':
            if model:
                new_tts = deepgram.TTS(model=model)
            else:
                new_tts = deepgram.TTS()
        elif provider == 'elevenlabs':
            if model:
                new_tts = elevenlabs.TTS(voice_id=model, model=elevenlabs_model)
            else:
                new_tts = elevenlabs.TTS()

        if new_tts:
            await global_session.update_tts(new_tts)
            print(f"TTS updated to {{provider}} with model {{model}}")
            return True
        else:
            print("Failed to create new TTS provider")
            return False
    except Exception as e:
        print(f"Error updating TTS: {{e}}")
        return False

def run_worker_api():
    \"\"\"Run the worker API in a separate thread\"\"\"
    worker_api.run(host='localhost', port=8080, debug=False)

async def entrypoint(ctx: agents.JobContext):
    global global_session, global_room

    # Start the worker API in a background thread
    api_thread = threading.Thread(target=run_worker_api)
    api_thread.daemon = True
    api_thread.start()

    await ctx.connect()
    global_room = ctx.room

    # STT configuration
"""
    
    # Add STT configuration
    if config['stt_provider'] == 'deepgram':
        code += f"""    stt = deepgram.STT(model="{config['stt_model']}", language="{config['stt_language']}")
"""
    # Add other STT providers as needed

    # Add LLM configuration
    if config["llm_provider"] == "groq":
        code += """    llm = groq.LLM()
"""
    elif config["llm_provider"] == "openai":
        code += """    llm = openai.LLM()
"""
    elif config["llm_provider"] == "lamapbx":
        code += """    llm = lamapbx.LLM(
            base_url="https://api.dify.ai/v1",
            api_key="app-URvw3WP41SrsNoNkLLITJjSr",
            user="koumton1@gmail.com", use_blocking_mode=True)
"""
    # Add other LLM providers as needed


    # Add TTS configuration
    if config['tts_provider'] == 'cartesia':
        voice_id = config.get('tts_model', '')
        language = config.get('tts_language', 'en')
        if voice_id:
            code += f"""    tts = cartesia.TTS(voice="{voice_id}", language="{language}")
"""
        else:
            code += f"""    tts = cartesia.TTS(language="{language}")
"""
    elif config['tts_provider'] == 'deepgram':
        model = config.get('tts_model', '')
        if model:
            code += f"""    tts = deepgram.TTS(model="{model}")
"""
        else:
            code += """    tts = deepgram.TTS()
"""
    elif config['tts_provider'] == 'elevenlabs':
        voice_id = config.get('tts_model', '')
        model = config.get('tts_elevenlabs_model', 'eleven_multilingual_v2') # Ensure this is correctly retrieved
        if voice_id:
            code += f"""    tts = elevenlabs.TTS(voice_id="{voice_id}", model="{model}")
"""
        else:
            # If no specific voice_id is set, it should still use the default model
            code += f"""    tts = elevenlabs.TTS(model="{model}")
"""



    # Add VAD configuration
    if config['vad_provider'] == 'silero':
        code += """    vad = silero.VAD.load()
"""

    # Add room input options based on noise cancellation setting
    code += """
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        turn_detection=MultilingualModel(),
    )

    # Store session globally for later updates
    global_session = session
"""

    if config['use_noise_cancellation']:
        code += """    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )
"""
    else:
        code += """    await session.start(
        room=ctx.room,
        agent=Assistant(),
    )
"""

    code += """
    await session.generate_reply(
        instructions="Greet the user and offer your assistance."
    )

    # Keep the worker running
    try:
        # This will keep the agent running until the room is closed
        await ctx.wait_until_disconnected()
    except Exception as e:
        print(f"Agent disconnected with error: {e}")

if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
"""

    # Write the generated code to a file
    with open('agent_worker.py', 'w') as f:
        f.write(code)
    print("agent_worker.py regenerated.") # Add print for debugging
    return 'agent_worker.py'
