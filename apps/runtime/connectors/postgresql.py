"""PostgreSQL native connector with connection pooling and SSL support."""

from __future__ import annotations

import ssl
from typing import Any

import asyncpg
from .base import IConnector, ConnectorError


class PostgreSQLConnector(IConnector):
    provider = "postgresql"
    supported_operations = [
        "connect",
        "query",
        "execute",
        "list_tables",
        "describe_table",
    ]

    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None
        self._pool_config: dict[str, Any] | None = None

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        # For PostgreSQL, access_token contains the connection string or connection params
        # Format: postgresql://user:password@host:port/database or connection params dict
        
        async def _get_pool() -> asyncpg.Pool:
            if self._pool is None or self._pool_config != params.get("connection"):
                await self._close_pool()
                self._pool_config = params.get("connection", {})
                
                # Support both connection string and params dict
                conn_config = self._pool_config
                if isinstance(conn_config, str):
                    # Parse connection string
                    self._pool = await asyncpg.create_pool(
                        conn_config,
                        min_size=conn_config.get("min_size", 2),
                        max_size=conn_config.get("max_size", 10),
                        command_timeout=conn_config.get("command_timeout", 60),
                        ssl=conn_config.get("ssl", "prefer"),
                    )
                else:
                    # Parse connection parameters
                    ssl_mode = conn_config.get("ssl", "prefer")
                    ssl_context = None
                    if ssl_mode == "require":
                        ssl_context = ssl.create_default_context()
                        ssl_context.check_hostname = False
                        ssl_context.verify_mode = ssl.CERT_NONE
                    elif ssl_mode == "verify-ca":
                        ssl_context = ssl.create_default_context()
                        ssl_context.check_hostname = True
                        ssl_context.verify_mode = ssl.CERT_REQUIRED
                    elif ssl_mode == "verify-full":
                        ssl_context = ssl.create_default_context()
                        ssl_context.check_hostname = True
                        ssl_context.verify_mode = ssl.CERT_REQUIRED
                    
                    self._pool = await asyncpg.create_pool(
                        host=conn_config.get("host", "localhost"),
                        port=conn_config.get("port", 5432),
                        user=conn_config.get("user"),
                        password=conn_config.get("password"),
                        database=conn_config.get("database"),
                        min_size=conn_config.get("min_size", 2),
                        max_size=conn_config.get("max_size", 10),
                        command_timeout=conn_config.get("command_timeout", 60),
                        ssl=ssl_context,
                    )
            return self._pool

        await _get_pool()
        pool = self._pool
        if pool is None:
            raise ConnectorError("CONNECTION_FAILED", "Failed to create PostgreSQL connection pool")

        match operation:
            case "connect":
                return await self._connect(pool, params)
            case "query":
                return await self._query(pool, params)
            case "execute":
                return await self._execute(pool, params)
            case "list_tables":
                return await self._list_tables(pool, params)
            case "describe_table":
                return await self._describe_table(pool, params)
            case _:
                raise ConnectorError(
                    "UNSUPPORTED_OPERATION",
                    f"PostgreSQL does not support operation '{operation}'",
                )

    async def _close_pool(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None

    async def _connect(self, pool: asyncpg.Pool, params: dict[str, Any]) -> dict[str, Any]:
        """Test the connection by running a simple query."""
        async with pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
            return {
                "connected": True,
                "version": version,
                "pool_size": pool.get_size(),
                "pool_idle": pool.get_idle_size(),
            }

    async def _query(self, pool: asyncpg.Pool, params: dict[str, Any]) -> dict[str, Any]:
        """Execute a SELECT query and return rows."""
        query = params.get("query")
        if not query:
            raise ConnectorError("MISSING_PARAM", "query operation requires 'query' parameter")
        
        params_list = params.get("params", [])
        limit = params.get("limit")
        
        async with pool.acquire() as conn:
            if limit:
                query = f"{query} LIMIT {int(limit)}"
            rows = await conn.fetch(query, *params_list)
            return {
                "rows": [dict(row) for row in rows],
                "row_count": len(rows),
            }

    async def _execute(self, pool: asyncpg.Pool, params: dict[str, Any]) -> dict[str, Any]:
        """Execute an INSERT/UPDATE/DELETE/DDL statement."""
        query = params.get("query")
        if not query:
            raise ConnectorError("MISSING_PARAM", "execute operation requires 'query' parameter")
        
        params_list = params.get("params", [])
        
        async with pool.acquire() as conn:
            result = await conn.execute(query, *params_list)
            # result is like "INSERT 0 1" or "UPDATE 3"
            parts = result.split()
            return {
                "command": parts[0] if parts else "UNKNOWN",
                "row_count": int(parts[-1]) if parts and parts[-1].isdigit() else 0,
                "status": result,
            }

    async def _list_tables(self, pool: asyncpg.Pool, params: dict[str, Any]) -> dict[str, Any]:
        """List all tables in the database/schema."""
        schema = params.get("schema", "public")
        
        query = """
            SELECT 
                table_name,
                table_type,
                table_schema
            FROM information_schema.tables
            WHERE table_schema = $1
            ORDER BY table_name
        """
        
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, schema)
            return {
                "tables": [
                    {
                        "name": row["table_name"],
                        "type": row["table_type"],
                        "schema": row["table_schema"],
                    }
                    for row in rows
                ],
                "count": len(rows),
            }

    async def _describe_table(self, pool: asyncpg.Pool, params: dict[str, Any]) -> dict[str, Any]:
        """Describe a table's columns, types, constraints."""
        table_name = params.get("table_name")
        schema = params.get("schema", "public")
        
        if not table_name:
            raise ConnectorError("MISSING_PARAM", "describe_table requires 'table_name' parameter")
        
        # Get column information
        column_query = """
            SELECT 
                column_name,
                data_type,
                character_maximum_length,
                numeric_precision,
                numeric_scale,
                is_nullable,
                column_default,
                ordinal_position
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
        """
        
        async with pool.acquire() as conn:
            columns = await conn.fetch(column_query, schema, table_name)
            
            # Get primary keys
            pk_query = """
                SELECT column_name
                FROM information_schema.key_column_usage
                WHERE table_schema = $1 AND table_name = $2
                AND constraint_name IN (
                    SELECT constraint_name
                    FROM information_schema.table_constraints
                    WHERE table_schema = $1 AND table_name = $2
                    AND constraint_type = 'PRIMARY KEY'
                )
            """
            pk_rows = await conn.fetch(pk_query, schema, table_name)
            pk_columns = {row["column_name"] for row in pk_rows}
            
            # Get foreign keys
            fk_query = """
                SELECT 
                    kcu.column_name,
                    ccu.table_schema AS foreign_table_schema,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.key_column_usage kcu
                JOIN information_schema.referential_constraints rc
                    ON kcu.constraint_name = rc.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON rc.unique_constraint_name = ccu.constraint_name
                WHERE kcu.table_schema = $1 AND kcu.table_name = $2
            """
            fk_rows = await conn.fetch(fk_query, schema, table_name)
            
            # Get indexes
            index_query = """
                SELECT 
                    indexname,
                    indexdef
                FROM pg_indexes
                WHERE schemaname = $1 AND tablename = $2
            """
            index_rows = await conn.fetch(index_query, schema, table_name)
            
            return {
                "table_name": table_name,
                "schema": schema,
                "columns": [
                    {
                        "name": col["column_name"],
                        "type": col["data_type"],
                        "max_length": col["character_maximum_length"],
                        "precision": col["numeric_precision"],
                        "scale": col["numeric_scale"],
                        "nullable": col["is_nullable"] == "YES",
                        "default": col["column_default"],
                        "is_primary_key": col["column_name"] in pk_columns,
                    }
                    for col in columns
                ],
                "primary_keys": list(pk_columns),
                "foreign_keys": [
                    {
                        "column": row["column_name"],
                        "foreign_table_schema": row["foreign_table_schema"],
                        "foreign_table_name": row["foreign_table_name"],
                        "foreign_column_name": row["foreign_column_name"],
                    }
                    for row in fk_rows
                ],
                "indexes": [
                    {
                        "name": row["indexname"],
                        "definition": row["indexdef"],
                    }
                    for row in index_rows
                ],
            }