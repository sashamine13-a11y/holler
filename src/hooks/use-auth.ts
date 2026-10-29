'use client';

// Re-export from use-auth-local for backward compatibility.
// Browser-based auth (localStorage) — works without any external service.
// No Supabase needed, no registration needed.

export { useAuth } from './use-auth-local';
export type { AuthUser } from './use-auth-local';
