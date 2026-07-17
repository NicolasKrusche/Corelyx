"""
Distributed locking for credential operations.
Prevents race conditions during OAuth token refresh.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

from db import get_db


class CredentialLock:
    """
    Distributed lock for credential operations using Supabase.

    Prevents multiple concurrent runs from refreshing the same
    OAuth token simultaneously, which can cause invalidation issues.

    Usage:
        async with CredentialLock(connection_id):
            # Critical section - only one run at a time
            token = await refresh_token()
    """

    def __init__(
        self,
        resource_id: str,
        lock_timeout: float = 20.0,
        retry_interval: float = 0.5,
        # max_wait MUST exceed lock_timeout: a waiter has to outlast a crashed
        # holder's lock (which only frees at expires_at) so it can reclaim the
        # expired row instead of giving up while the dead lock still sits there.
        max_wait: float = 25.0,
    ):
        self.resource_id = resource_id
        self.lock_key = f"cred_lock:{resource_id}"
        self.lock_timeout = lock_timeout
        self.retry_interval = retry_interval
        self.max_wait = max_wait
        self._acquired = False
        self._lock_id = f"{time.time()}_{id(self)}"

    async def __aenter__(self) -> "CredentialLock":
        # Fail CLOSED: if the lock could not be acquired within max_wait, raise
        # instead of silently entering the critical section unlocked. Entering
        # without the lock defeats the whole purpose — concurrent refreshes would
        # consume the same (rotating) refresh_token and invalidate the credential.
        if not await self.acquire():
            raise TimeoutError(f"Could not acquire credential lock for {self.resource_id} within {self.max_wait}s")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.release()

    async def acquire(self) -> bool:
        """
        Acquire the lock with timeout.

        Returns True if lock acquired, False if timed out.
        """
        db = get_db()
        start_time = time.time()

        while time.time() - start_time < self.max_wait:
            try:
                # Try to acquire lock using advisory lock or row lock
                # Using a simple table-based locking mechanism
                result = (
                    db.table("credential_locks")
                    .insert(
                        {
                            "lock_key": self.lock_key,
                            "lock_id": self._lock_id,
                            "expires_at": (
                                datetime.now(timezone.utc) + timedelta(seconds=self.lock_timeout)
                            ).isoformat(),
                        }
                    )
                    .execute()
                )

                if result.data:
                    self._acquired = True
                    print(
                        f"[cred-lock] Acquired lock for {self.resource_id}",
                        flush=True,
                    )
                    return True

            except Exception as e:
                err_str = str(e).lower()
                # Unique constraint violation = lock held by someone else
                if "unique" in err_str or "duplicate" in err_str or "23505" in err_str:
                    # Check if existing lock is expired
                    if await self._cleanup_expired_lock():
                        continue
                else:
                    raise

            # Wait before retry
            await asyncio.sleep(self.retry_interval)

        print(
            f"[cred-lock] Timeout waiting for lock on {self.resource_id}",
            flush=True,
        )
        return False

    async def release(self) -> None:
        """Release the lock."""
        if not self._acquired:
            return

        db = get_db()
        try:
            db.table("credential_locks").delete().eq("lock_key", self.lock_key).eq("lock_id", self._lock_id).execute()

            self._acquired = False
            print(
                f"[cred-lock] Released lock for {self.resource_id}",
                flush=True,
            )
        except Exception as e:
            print(
                f"[cred-lock] Failed to release lock for {self.resource_id}: {e}",
                flush=True,
            )

    async def _cleanup_expired_lock(self) -> bool:
        """
        Clean up expired locks. Returns True if a lock was removed.
        """
        db = get_db()
        try:
            result = (
                db.table("credential_locks")
                .delete()
                .eq("lock_key", self.lock_key)
                .lt("expires_at", datetime.now(timezone.utc).isoformat())
                .execute()
            )

            if result.data:
                print(
                    f"[cred-lock] Cleaned up expired lock for {self.resource_id}",
                    flush=True,
                )
                return True
        except Exception:
            pass

        return False


class TokenRefreshManager:
    """
    Manages OAuth token refresh with caching and locking.

    - Caches tokens in memory to reduce DB calls
    - Uses distributed locking to prevent concurrent refreshes
    - Automatically handles token expiration
    """

    def __init__(self):
        self._cache: dict[str, tuple[str, float]] = {}  # connection_id -> (token, expires_at)
        self._cache_ttl = 300  # 5 minutes
        self._lock = asyncio.Lock()

    def get_cached_token(self, connection_id: str) -> Optional[str]:
        """Get token from cache if not expired."""
        if connection_id in self._cache:
            token, expires_at = self._cache[connection_id]
            # Return cached token if valid for at least 60 more seconds
            if expires_at > time.time() + 60:
                return token
            # Token expiring soon, invalidate cache
            del self._cache[connection_id]
        return None

    def cache_token(self, connection_id: str, token: str, expires_in: Optional[int] = None) -> None:
        """Cache a token with expiration."""
        # Default to 1 hour if expires_in not provided
        ttl = expires_in or 3600
        expires_at = time.time() + min(ttl, self._cache_ttl)
        self._cache[connection_id] = (token, expires_at)

    def invalidate_cache(self, connection_id: str) -> None:
        """Invalidate cached token."""
        self._cache.pop(connection_id, None)

    async def refresh_with_lock(
        self,
        connection_id: str,
        refresh_func: callable,
        *args,
        **kwargs,
    ) -> str:
        """
        Refresh token with distributed locking.

        Args:
            connection_id: The connection being refreshed
            refresh_func: Async function to call to refresh token
            *args, **kwargs: Args for refresh_func

        Returns:
            The new access token
        """
        # Check cache first
        cached = self.get_cached_token(connection_id)
        if cached:
            return cached

        # Acquire lock to prevent concurrent refreshes
        async with CredentialLock(connection_id):
            # Double-check cache after acquiring lock
            cached = self.get_cached_token(connection_id)
            if cached:
                return cached

            # Perform refresh
            token = await refresh_func(*args, **kwargs)

            # Cache the result
            self.cache_token(connection_id, token)

            return token


# Global token refresh manager
_token_refresh_manager: Optional[TokenRefreshManager] = None


def get_token_refresh_manager() -> TokenRefreshManager:
    """Get the global token refresh manager."""
    global _token_refresh_manager
    if _token_refresh_manager is None:
        _token_refresh_manager = TokenRefreshManager()
    return _token_refresh_manager
