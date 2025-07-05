
from __future__ import annotations

import json
import os
import asyncio
import httpx
import uuid
import time
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, List, Optional, Union, Tuple
from livekit import rtc
from livekit.agents import llm
from livekit.agents.llm import ChatMessage, ChoiceDelta, ToolChoice, ChatChunk
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    APIConnectOptions,
    NotGivenOr,
)
from livekit.agents.utils import is_given
from livekit.rtc.event_emitter import EventEmitter
from livekit.agents.utils import aio
from livekit.agents._exceptions import APIError
from livekit.agents.llm import CompletionUsage

# Basic logger for demonstration purposes. In a real application, use a proper logging setup.
class Logger:
    def debug(self, msg, extra=None):
        print(f"DEBUG: {msg} {extra if extra else ''}")
    def error(self, msg, exc_info=None):
        print(f"ERROR: {msg} {exc_info if exc_info else ''}")

logger = Logger()

@dataclass
class LLMOptions:
    model: str
    user: NotGivenOr[str]
    temperature: NotGivenOr[float]
    max_retries: int
    use_blocking_mode: bool = True

class LLM(llm.LLM, EventEmitter):
    def __init__(
        self,
        *,
        model: str = "lamapbx",
        api_key: str | None = None,
        base_url: str | None = "https://api.dify.ai/v1",
        user: NotGivenOr[str] = NOT_GIVEN,
        client: httpx.AsyncClient | None = None,
        temperature: NotGivenOr[float] = NOT_GIVEN,
        max_retries: int = 3,
        timeout: float = 30.0,
        use_blocking_mode: bool = True,
    ) -> None:
        super().__init__()
        self.api_key = api_key or os.environ.get("lamapbx_API_KEY")
        if not self.api_key:
            raise ValueError("lamapbx_API_KEY is required")
        
        self.base_url = base_url.rstrip("/")
        self.user = user if is_given(user) else "livekit-agent"
        self.timeout = timeout
        self.max_retries = max_retries
        self.use_blocking_mode = use_blocking_mode
        
        self._client = client or httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=10,
                max_keepalive_connections=5,
                keepalive_expiry=30,
            ),
            timeout=httpx.Timeout(
                connect=15.0,
                read=timeout,
                write=15.0,
                pool=5.0
            ),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        
        self._conversation_id = ""
        self._active_streams: set[LLMStream] = set()
        self._closed = False
        self._request_lock = asyncio.Lock()
        # Using a list to store recent queries for more robust debouncing
        self._recent_queries: List[Tuple[str, float]] = [] 
        self._debounce_interval = 1.0  # 1 second debounce window

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: List[llm.FunctionTool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        tool_choice: NotGivenOr[ToolChoice] = NOT_GIVEN,
        temperature: NotGivenOr[float] = NOT_GIVEN,
        n: int | None = None,
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[Dict[str, Any]] = NOT_GIVEN,
    ) -> LLMStream:
        if tools:
            logger.warning("lamapbx API doesn't support tools - ignoring")

        # Find last user message
        query = ""
        for item in reversed(chat_ctx.items):
            if isinstance(item, ChatMessage) and item.role == "user":
                query = item.content[0] if item.content else ""
                break

        if not query:
            query = "Hello"

        request_data = {
            "inputs": {},
            "query": query,
            "response_mode": "blocking",
            "conversation_id": self._conversation_id,
            "user": self.user,
        }

        logger.debug("Entering chat method", extra={
            "query": query,
            "conversation_id": self._conversation_id,
            "recent_queries": self._recent_queries
        })

        current_time = time.time()
        # Clean up old queries from the recent_queries list
        self._recent_queries = [(q, t) for q, t in self._recent_queries if current_time - t < self._debounce_interval]

        is_duplicate = False
        for q, _ in self._recent_queries:
            if q == query: # Simple string comparison for now
                is_duplicate = True
                break

        logger.debug("Debounce check result", extra={
            "is_duplicate": is_duplicate,
            "current_time": current_time
        })

        if is_duplicate:
            logger.debug("Skipping duplicate request (debounced)", 
                        extra={"query": query, "conversation_id": self._conversation_id})
            return self._create_empty_stream(chat_ctx, conn_options)

        # Add the current query to recent queries if it's not a duplicate
        self._recent_queries.append((query, current_time))

        stream_request = self._client.build_request(
            "POST",
            f"{self.base_url}/chat-messages",
            json=request_data,
            headers={
                "Accept": "application/json",
            }
        )

        stream = LLMStream(
            llm=self,
            request=stream_request,
            chat_ctx=chat_ctx,
            conversation_id_callback=self._update_conversation_id,
            conn_options=conn_options,
            use_blocking_mode=True,
        )
        
        self._active_streams.add(stream)
        return stream

    def _create_empty_stream(self, chat_ctx: llm.ChatContext, conn_options: APIConnectOptions) -> LLMStream:
        """Create an empty stream for duplicate/debounced queries"""
        return LLMStream(
            llm=self,
            request=None,
            chat_ctx=chat_ctx,
            conversation_id_callback=lambda _: None,
            conn_options=conn_options,
            use_blocking_mode=True,
            is_empty=True
        )

    def _update_conversation_id(self, new_id: str) -> None:
        if new_id and new_id != self._conversation_id:
            logger.debug("Updating conversation ID", extra={
                "old_id": self._conversation_id[:8] + "...",
                "new_id": new_id[:8] + "..."
            })
            self._conversation_id = new_id

    async def _cleanup_streams(self) -> None:
        if not self._active_streams:
            return
            
        cleanup_tasks = [stream.aclose() for stream in self._active_streams]
        await asyncio.gather(*cleanup_tasks, return_exceptions=True)
        self._active_streams.clear()

    async def close(self) -> None:
        if self._closed:
            return
            
        self._closed = True
        try:
            await self._cleanup_streams()
            await self._client.aclose()
        except Exception as e:
            logger.error("Error during close", exc_info=e)

class LLMStream(llm.LLMStream):
    def __init__(
        self,
        *,
        llm: LLM,
        request: httpx.Request | None,
        chat_ctx: llm.ChatContext,
        conversation_id_callback: callable,
        conn_options: APIConnectOptions,
        use_blocking_mode: bool = True,
        is_empty: bool = False,
    ) -> None:
        super().__init__(
            llm=llm,
            chat_ctx=chat_ctx,
            tools=[],
            conn_options=conn_options
        )
        self.llm = llm
        self._request = request
        self._conversation_id_callback = conversation_id_callback
        self._response: Optional[httpx.AsyncResponse] = None
        self._closed = False
        self._use_blocking_mode = use_blocking_mode
        self._is_empty = is_empty
        
        if not is_empty:
            self._task = asyncio.create_task(self._run())
        else:
            # For empty streams, immediately send an empty response
            self._task = asyncio.create_task(self._send_empty_response())

    async def _send_empty_response(self) -> None:
        """Handle empty streams (duplicate/debounced queries)"""
        try:
            await self._event_ch.send(ChatChunk(
                id=str(uuid.uuid4()),
                delta=ChoiceDelta(
                    content="",
                    role="assistant"
                ),
                usage=CompletionUsage(
                    completion_tokens=0,
                    prompt_tokens=0,
                    total_tokens=0
                )
            ))
        except aio.ChanClosed:
            logger.debug("Channel closed before empty response could be sent")
        finally:
            await self.aclose()

    async def _run(self) -> None:
        try:
            if self._closed or self._request is None:
                return

            async with self.llm._request_lock:  # Ensure only one request at a time
                self._response = await self.llm._client.send(self._request)
                
                if self._response.status_code != 200:
                    error = await self._response.aread()
                    error_body = error.decode()[:100] + "..." if error else None
                    logger.error("lamapbx API error", extra={
                        "status": self._response.status_code,
                        "error": error_body
                    })
                    raise APIError(
                        message=f"lamapbx API returned status {self._response.status_code}",
                        body=error_body,
                        retryable=self._response.status_code in (408, 429, 500, 502, 503, 504)
                    )

                response_data = self._response.json()
                if "conversation_id" in response_data:
                    self._conversation_id_callback(response_data["conversation_id"])
                
                try:
                    await self._event_ch.send(ChatChunk(
                        id=str(uuid.uuid4()),
                        delta=ChoiceDelta(
                            content=response_data.get("answer", ""),
                            role="assistant"
                        ),
                        usage=CompletionUsage(
                            completion_tokens=response_data.get("metadata", {}).get("usage", {}).get("completion_tokens", 0),
                            prompt_tokens=response_data.get("metadata", {}).get("usage", {}).get("prompt_tokens", 0),
                            total_tokens=response_data.get("metadata", {}).get("usage", {}).get("total_tokens", 0)
                        )
                    ))
                except aio.ChanClosed:
                    logger.debug("Channel closed before response could be sent. Performing clean aclose.")
                    await self.aclose() # Explicitly close the stream
                    return # Exit _run as channel is closed

        except Exception as e:
            logger.error("Error in LLM stream", exc_info=e)
            if not isinstance(e, APIError):
                e = APIError(
                    message=str(e),
                    body=str(e),
                    retryable=True
                )
            raise e
        finally:
            # Ensure aclose is called even if an exception occurs or _run returns early
            if not self._closed:
                await self.aclose()

    async def aclose(self) -> None:
        if self._closed:
            return
            
        self._closed = True
        try:
            # Cancel the main task first to stop further processing
            if self._task and not self._task.done():
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass # Expected if task was cancelled

            if self._response:
                await self._response.aclose()
        except Exception as e:
            logger.error("Error during stream close", exc_info=e)
        finally:
            if hasattr(self.llm, '_active_streams') and self in self.llm._active_streams:
                self.llm._active_streams.remove(self)




