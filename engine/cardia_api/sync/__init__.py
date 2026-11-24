"""Cloud sync (PLAN.md §5). Off until the engine has a Supabase project's URL and anon key
(CARDIA_SUPABASE_URL, CARDIA_SUPABASE_ANON_KEY); `--fake-cloud` syncs with an in-memory cloud instead."""

from .backend import AuthError, Backend, CloudError, Offline, Session, SupabaseBackend
from .memory import MemoryBackend
from .service import NotConfigured, SyncService

__all__ = [
    "AuthError",
    "Backend",
    "CloudError",
    "MemoryBackend",
    "NotConfigured",
    "Offline",
    "Session",
    "SupabaseBackend",
    "SyncService",
]
