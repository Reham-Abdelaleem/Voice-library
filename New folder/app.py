import os
from flask import Flask, send_from_directory
from flask_socketio import SocketIO
from flask_cors import CORS
from config_manager import load_config, load_deepgram_models, load_cartesia_voices, load_elevenlabs_voices
from worker_manager import start_worker
from dotenv import load_dotenv
from agent_generator import generate_agent_code
from api_routes import register_routes

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# Register API routes
register_routes(app, socketio)

# Serve static files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

if __name__ == '__main__':
    # Load or create the model/voice files
    load_deepgram_models()
    load_cartesia_voices()
    load_elevenlabs_voices()

    # Generate initial agent code
    config = load_config()
    generate_agent_code(config)

    # Start worker only in the main Flask process, not the reloader
    # The WERKZEUG_RUN_MAIN check is still useful if you ever re-enable the reloader
    # or for other Flask-internal mechanisms.
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug: # Ensure worker starts if debug is off
        start_worker()

    # Start Flask application with default Flask server
    # Set use_reloader=False to prevent Flask from trying to restart the app itself
    app.run(debug=True, port=5000, use_reloader=False)
