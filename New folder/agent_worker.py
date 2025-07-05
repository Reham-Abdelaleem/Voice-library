from dotenv import load_dotenv
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
    """API endpoint to update TTS during runtime"""
    data = request.json
    provider = data.get('provider')
    model = data.get('model', '')
    language = data.get('language', 'en')
    elevenlabs_model = data.get('elevenlabs_model', 'eleven_multilingual_v2')

    # Schedule the async TTS update
    asyncio.create_task(update_tts(provider, model, language, elevenlabs_model))

    return jsonify({
        "message": f"TTS update scheduled to {provider} with model {model}"
    })

async def update_tts(provider, model, language, elevenlabs_model=None):
    """Update TTS in the active session"""
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
            print(f"TTS updated to {provider} with model {model}")
            return True
        else:
            print("Failed to create new TTS provider")
            return False
    except Exception as e:
        print(f"Error updating TTS: {e}")
        return False

def run_worker_api():
    """Run the worker API in a separate thread"""
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
    stt = deepgram.STT(model="nova-3", language="multi")
    llm = lamapbx.LLM(
            base_url="https://api.dify.ai/v1",
            api_key="app-URvw3WP41SrsNoNkLLITJjSr",
            user="koumton1@gmail.com", use_blocking_mode=True)
    tts = elevenlabs.TTS(voice_id="JBFqnCBsd6RMkjVDRZzb", model="eleven_multilingual_v2")
    vad = silero.VAD.load()

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        turn_detection=MultilingualModel(),
    )

    # Store session globally for later updates
    global_session = session
    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

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
