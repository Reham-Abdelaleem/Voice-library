import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Create console handler if no handlers exist
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)