# __init__.py - Simplified for LiveKit Agents 1.0

from .llm import LLM, LLMStream

__all__ = [
    "LLM", 
    "LLMStream",
]

__version__ = "0.1.0"

def greet():
    return 'hi, im lamapbx'