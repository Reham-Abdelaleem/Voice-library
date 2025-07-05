import subprocess
import signal
from config_manager import load_config
from agent_generator import generate_agent_code

# MultipleFiles/worker_manager.py

# ... (imports)

worker_process = None

def start_worker():
    """Start the worker process based on configuration"""
    global worker_process
    config = load_config() # Load the latest config

    try:
        if worker_process and worker_process.poll() is None:
            print(f"Stopping existing worker process with PID {worker_process.pid}")
            worker_process.terminate()
            try:
                worker_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                print("Worker process didn't terminate gracefully, killing it")
                worker_process.kill()
                worker_process.wait()
            worker_process = None
        elif worker_process:
            worker_process = None

        worker_mode = config.get('worker_mode', 'dev')
        print(f"Starting new worker in {worker_mode} mode")
        
        # Ensure agent_worker.py is generated before starting
        # This call is already in api_routes.py before restart_worker, but good to double check
        # generate_agent_code(config) 

        if worker_mode == 'dev':
            worker_process = subprocess.Popen(['python', 'agent_worker.py', 'dev'])
        elif worker_mode == 'connect':
            room_name = config.get('room_name', 'default-room')
            worker_process = subprocess.Popen(['python', 'agent_worker.py', 'connect', '--room', room_name])
        elif worker_mode == 'console':
            worker_process = subprocess.Popen(['python', 'agent_worker.py', 'console'])
        else:
            worker_process = subprocess.Popen(['python', 'agent_worker.py', 'dev'])

        print(f"Worker started with PID {worker_process.pid}")
        return worker_process.pid
    except Exception as e:
        print(f"Error starting worker: {e}")
        worker_process = None
        return None

def restart_worker():
    """Gracefully restart the worker without ending the session"""
    global worker_process
    config = load_config() # Load the latest config here too
    generate_agent_code(config) # Regenerate code before restarting

    if worker_process and worker_process.poll() is None:
        try:
            print(f"Sending SIGUSR1 to worker process {worker_process.pid} for graceful restart...")
            # Note: SIGUSR1 handling is not explicitly shown in agent_worker.py,
            # so a full terminate/start might be more reliable if not implemented.
            # For now, assume it works or fallback to kill.
            worker_process.terminate() # Send SIGTERM
            worker_process.wait(timeout=5) # Wait for the process to exit after signal
            worker_process = None # Clear the old process reference
            print("Old worker process terminated after SIGUSR1 (or SIGTERM).")
            return start_worker() # Start a new worker
        except subprocess.TimeoutExpired:
            print("Old worker process did not terminate, forcing restart.")
            worker_process.kill()
            worker_process.wait()
            worker_process = None
            return start_worker()
        except Exception as e:
            print(f"Error signaling worker for restart: {e}")
            return start_worker() # Fallback to full start if signal fails
    else:
        print("No running worker process found, starting a new one.")
        return start_worker()

def stop_worker():
    """Stop the worker process"""
    global worker_process
    if worker_process and worker_process.poll() is None:
        print(f"Stopping worker process with PID {worker_process.pid}")
        worker_process.terminate() # Send SIGTERM
        try:
            worker_process.wait(timeout=5) # Wait for it to exit
        except subprocess.TimeoutExpired:
            print("Worker process didn't terminate gracefully, killing it")
            worker_process.kill() # Send SIGKILL
        worker_process = None
        print("Worker stopped.")
    else:
        print("No active worker process to stop.")
    return True

def get_worker_status():
    """Get current worker status"""
    global worker_process
    return {
        "status": "running" if worker_process and worker_process.poll() is None else "stopped",
        "pid": worker_process.pid if worker_process and worker_process.poll() is None else None
    }
