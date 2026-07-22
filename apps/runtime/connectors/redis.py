"""Redis native connector."""

from __future__ import annotations

from typing import Any

import redis.asyncio as redis
from .base import IConnector, ConnectorError


class RedisConnector(IConnector):
    provider = "redis"
    supported_operations = [
        "get",
        "set",
        "delete",
        "exists",
        "incr",
        "lpush",
        "rpush",
        "lrange",
    ]

    def __init__(self) -> None:
        self._client: redis.Redis | None = None
        self._client_config: dict[str, Any] | None = None

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # For Redis, access_token contains the connection string or connection params
        # Format: redis://[:password@]host:port/db or connection params dict
        
        async def _get_client() -> redis.Redis:
            if self._client is None or self._client_config != params.get("connection"):
                await self._close_client()
                self._client_config = params.get("connection", {})
                
                conn_config = self._client_config
                if isinstance(conn_config, str):
                    # Parse connection string
                    self._client = redis.from_url(
                        conn_config,
                        decode_responses=True,
                        max_connections=10,
                    )
                else:
                    # Parse connection parameters
                    self._client = redis.Redis(
                        host=conn_config.get("host", "localhost"),
                        port=conn_config.get("port", 6379),
                        db=conn_config.get("db", 0),
                        password=conn_config.get("password"),
                        username=conn_config.get("username"),
                        ssl=conn_config.get("ssl", False),
                        ssl_cert_reqs=conn_config.get("ssl_cert_reqs", "required"),
                        decode_responses=True,
                        max_connections=conn_config.get("max_connections", 10),
                    )
            return self._client

        await _get_client()
        client = self._client
        if client is None:
            raise ConnectorError("CONNECTION_FAILED", "Failed to create Redis client")

        match operation:
            case "get":
                return await self._get(client, params)
            case "set":
                return await self._set(client, params)
            case "delete":
                return await self._delete(client, params)
            case "exists":
                return await self._exists(client, params)
            case "incr":
                return await self._incr(client, params)
            case "lpush":
                return await self._lpush(client, params)
            case "rpush":
                return await self._rpush(client, params)
            case "lrange":
                return await self._lrange(client, params)
            case _:
                raise ConnectorError(
                    "UNSUPPORTED_OPERATION",
                    f"Redis does not support operation '{operation}'",
                )

    async def _close_client(self) -> None:
        if self._client:
            await self._client.close()
            self._client = None

    async def _get(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Get a value by key."""
        key = params.get("key")
        if not key:
            raise ConnectorError("MISSING_PARAM", "get operation requires 'key' parameter")
        
        value = await client.get(key)
        return {
            "key": key,
            "value": value,
            "exists": value is not None,
        }

    async def _set(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Set a key-value pair."""
        key = params.get("key")
        if not key:
            raise ConnectorError("MISSING_PARAM", "set operation requires 'key' parameter")
        
        value = params.get("value", "")
        ex = params.get("ex")  # expire time in seconds
        px = params.get("px")  # expire time in milliseconds
        nx = params.get("nx", False)  # only set if not exists
        xx = params.get("xx", False)  # only set if exists
        
        result = await client.set(key, value, ex=ex, px=px, nx=nx, xx=xx)
        return {
            "key": key,
            "value": value,
            "set": result is not None,
        }

    async def _delete(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Delete one or more keys."""
        keys = params.get("keys")
        if not keys:
            raise ConnectorError("MISSING_PARAM", "delete operation requires 'keys' parameter")
        
        if isinstance(keys, str):
            keys = [keys]
        
        deleted = await client.delete(*keys)
        return {
            "keys": keys,
            "deleted_count": deleted,
        }

    async def _exists(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Check if one or more keys exist."""
        keys = params.get("keys")
        if not keys:
            raise ConnectorError("MISSING_PARAM", "exists operation requires 'keys' parameter")
        
        if isinstance(keys, str):
            keys = [keys]
        
        count = await client.exists(*keys)
        return {
            "keys": keys,
            "exists_count": count,
        }

    async def _incr(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Increment a key by amount."""
        key = params.get("key")
        if not key:
            raise ConnectorError("MISSING_PARAM", "incr operation requires 'key' parameter")
        
        amount = params.get("amount", 1)
        
        if amount == 1:
            value = await client.incr(key)
        else:
            value = await client.incrby(key, amount)
        
        return {
            "key": key,
            "value": value,
            "incremented_by": amount,
        }

    async def _lpush(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Push one or more values to the left of a list."""
        key = params.get("key")
        if not key:
            raise ConnectorError("MISSING_PARAM", "lpush operation requires 'key' parameter")
        
        values = params.get("values")
        if not values:
            raise ConnectorError("MISSING_PARAM", "lpush operation requires 'values' parameter")
        
        if isinstance(values, str):
            values = [values]
        
        length = await client.lpush(key, *values)
        return {
            "key": key,
            "values": values,
            "list_length": length,
        }

    async def _rpush(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Push one or more values to the right of a list."""
        key = params.get("key")
        if not key:
            raise ConnectorError("MISSING_PARAM", "rpush operation requires 'key' parameter")
        
        values = params.get("values")
        if not values:
            raise ConnectorError("MISSING_PARAM", "rpush operation requires 'values' parameter")
        
        if isinstance(values, str):
            values = [values]
        
        length = await client.rpush(key, *values)
        return {
            "key": key,
            "values": values,
            "list_length": length,
        }

    async def _lrange(self, client: redis.Redis, params: dict[str, Any]) -> dict[str, Any]:
        """Get a range of elements from a list."""
        key = params.get("key")
        if not key:
            raise ConnectorError("MISSING_PARAM", "lrange operation requires 'key' parameter")
        
        start = params.get("start", 0)
        end = params.get("end", -1)
        
        values = await client.lrange(key, start, end)
        return {
            "key": key,
            "start": start,
            "end": end,
            "values": values,
            "count": len(values),
        }