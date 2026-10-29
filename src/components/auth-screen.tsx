'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertCircle, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ThemeToggle } from '@/components/theme-toggle';

interface AuthScreenProps {
  onSuccess: (user: { id: string; name: string; email: string; role: 'member' | 'admin'; avatar?: string }) => void;
}

type Mode = 'signin' | 'signup';

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    let result;
    if (mode === 'signin') {
      result = await signIn(email.trim(), password);
    } else {
      result = await signUp(email.trim(), password, name.trim());
    }
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    toast.success(mode === 'signin' ? 'Welcome back!' : 'Account created!');
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 glass">
        {/* Brand */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="size-12 rounded-xl flex items-center justify-center font-extrabold text-xl shrink-0"
              style={{ background: 'linear-gradient(135deg, #f5a623, #e94e6a)', color: '#0a0e1a' }}
            >
              H
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Holler</h1>
              <p className="text-xs text-muted-foreground">Real-time messenger</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-muted/40 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors
              ${mode === 'signin' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors
              ${mode === 'signup' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {mode === 'signup' && (
            <div>
              <Label htmlFor="name">Name</Label>
              <div className="relative">
                <UserIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className="pl-9"
                  maxLength={32}
                />
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="pl-9"
                autoComplete="email"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="pl-9"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs flex items-center gap-1 font-medium text-destructive">
              <AlertCircle className="size-3.5" />
              {error}
            </p>
          )}

          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? 'Please wait…' : (
              <>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
                <ArrowRight className="size-4 ml-1" />
              </>
            )}
          </Button>
        </div>

        {/* Switch mode link */}
        <p className="text-xs text-center text-muted-foreground mt-4">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
            className="text-primary hover:underline font-medium"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {/* Info note */}
        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground leading-relaxed">
          Accounts are stored locally in this browser. To use on another device, sign up there too — messages still sync in real-time across all your devices.
        </div>
      </Card>
    </div>
  );
}
