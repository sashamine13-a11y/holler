'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertCircle, Mail, Lock, User as UserIcon, ArrowRight, KeyRound, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/lib/i18n';
import { ThemeToggle } from '@/components/theme-toggle';

interface AuthScreenProps {
  onSuccess: (user: { id: string; name: string; email: string; role: 'member' | 'admin'; avatar?: string }) => void;
}

type Mode = 'signin' | 'signup' | 'forgot';

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const { signIn, signUp, getSecretQuestion, resetPassword } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('signin');

  // Common
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sign up
  const [name, setName] = useState('');
  const [secretQuestion, setSecretQuestion] = useState('');
  const [secretAnswer, setSecretAnswer] = useState('');

  // Forgot password
  const [forgotStep, setForgotStep] = useState<'email' | 'answer' | 'reset'>('email');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [secretAnswerInput, setSecretAnswerInput] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Please enter your name');
        return;
      }
      if (!secretQuestion.trim() || !secretAnswer.trim()) {
        setError('Please fill in secret question and answer');
        return;
      }
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
      result = await signUp(email.trim(), password, name.trim(), secretQuestion.trim(), secretAnswer.trim());
    }

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Success — auth state listener in useAuth (in ClientApp) will fire
    // and re-render with the new user, automatically swapping AuthScreen
    // for the main app. We keep loading=true so the button stays in its
    // "working" state during the brief transition.
    toast.success(mode === 'signin' ? 'Welcome back!' : 'Account created!');
    // Safety net: if the auth state listener doesn't fire within 5s
    // (e.g. network hiccup), reload the page to recover.
    setTimeout(() => window.location.reload(), 5000);
  };

  const submitForgotEmail = async () => {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    const q = await getSecretQuestion(email);
    setLoading(false);
    if (!q) {
      setError('User not found or no secret question set.');
      return;
    }
    setCurrentQuestion(q);
    setForgotStep('answer');
  };

  const submitForgotAnswer = async () => {
    setError('');
    if (!secretAnswerInput.trim()) {
      setError('Please enter your answer');
      return;
    }
    setForgotStep('reset');
  };

  const submitResetPassword = async () => {
    setError('');
    if (!newPassword) {
      setError('Please enter new password');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const result = await resetPassword(email, secretAnswerInput, newPassword);
    setLoading(false);

    if (result.error && result.error.includes('email sent')) {
      // Informational, not an error
      toast.success(result.error);
      setMode('signin');
      setPassword('');
      setSecretAnswerInput('');
      setNewPassword('');
      setForgotStep('email');
      return;
    }

    if (result.error) {
      setError(result.error);
      return;
    }

    toast.success('Password reset! Please sign in.');
    setMode('signin');
    setPassword('');
    setSecretAnswerInput('');
    setNewPassword('');
    setForgotStep('email');
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Aurora glow behind the card */}
      <div className="aurora-blob absolute size-[420px] rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: 'var(--grad-brand)' }} aria-hidden />
      <Card className="w-full max-w-md p-6 glass relative">
        {/* Brand */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="brand-mark size-12 rounded-2xl flex items-center justify-center font-extrabold text-xl shrink-0">
              H
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight">Holler</h1>
              <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {mode === 'forgot' ? (
          // ====================================================================
          // FORGOT PASSWORD FLOW
          // ====================================================================
          <>
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">Reset password</h2>
            </div>

            {forgotStep === 'email' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Enter your email to find your secret question.
                </p>
                <div>
                  <Label htmlFor="forgot-email">Email</Label>
                  <div className="relative">
                    <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitForgotEmail()}
                      className="pl-9"
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-xs flex items-center gap-1 font-medium text-destructive">
                    <AlertCircle className="size-3.5" />
                    {error}
                  </p>
                )}
                <Button className="w-full" onClick={submitForgotEmail}>
                  Continue
                </Button>
              </div>
            )}

            {forgotStep === 'answer' && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Your secret question:</p>
                  <p className="text-sm font-medium">{currentQuestion}</p>
                </div>
                <div>
                  <Label htmlFor="forgot-answer">Your answer</Label>
                  <div className="relative">
                    <HelpCircle className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="forgot-answer"
                      placeholder="Enter your answer"
                      value={secretAnswerInput}
                      onChange={(e) => setSecretAnswerInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitForgotAnswer()}
                      className="pl-9"
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-xs flex items-center gap-1 font-medium text-destructive">
                    <AlertCircle className="size-3.5" />
                    {error}
                  </p>
                )}
                <Button className="w-full" onClick={submitForgotAnswer}>
                  Continue
                </Button>
              </div>
            )}

            {forgotStep === 'reset' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Enter your new password.
                </p>
                <div>
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitResetPassword()}
                      className="pl-9"
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-xs flex items-center gap-1 font-medium text-destructive">
                    <AlertCircle className="size-3.5" />
                    {error}
                  </p>
                )}
                <Button className="w-full" onClick={submitResetPassword} disabled={loading}>
                  {loading ? 'Please wait…' : 'Reset password'}
                </Button>
              </div>
            )}

            <p className="text-xs text-center text-muted-foreground mt-4">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); setForgotStep('email'); }}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </>
        ) : (
          // ====================================================================
          // SIGN IN / SIGN UP
          // ====================================================================
          <>
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-muted/50 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors
                  ${mode === 'signin' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('auth.signin')}
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors
                  ${mode === 'signup' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('auth.signup')}
              </button>
            </div>

            {/* Form */}
            <div className="space-y-3">
              {mode === 'signup' && (
                <div>
                  <Label htmlFor="name">{t('auth.name')}</Label>
                  <div className="relative">
                    <UserIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder={t('auth.name')}
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
                <Label htmlFor="email">{t('auth.email')}</Label>
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
                <Label htmlFor="password">{t('auth.password')}</Label>
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

              {mode === 'signup' && (
                <>
                  <div className="pt-2 pb-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <HelpCircle className="size-3" />
                      Password recovery
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="secret-q">Secret question</Label>
                    <Input
                      id="secret-q"
                      placeholder="e.g. What is your pet's name?"
                      value={secretQuestion}
                      onChange={(e) => setSecretQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <Label htmlFor="secret-a">Answer</Label>
                    <Input
                      id="secret-a"
                      placeholder="Your answer"
                      value={secretAnswer}
                      onChange={(e) => setSecretAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      maxLength={50}
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-xs flex items-center gap-1 font-medium text-destructive">
                  <AlertCircle className="size-3.5" />
                  {error}
                </p>
              )}

              <Button className="w-full" onClick={submit} disabled={loading}>
                {loading ? '…' : (
                  <>
                    {mode === 'signin' ? t('auth.signin') : t('auth.createAccount')}
                    <ArrowRight className="size-4 ml-1" />
                  </>
                )}
              </Button>
            </div>

            {/* Links */}
            <div className="flex justify-between items-center mt-4 text-xs">
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setForgotStep('email'); }}
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                {t('auth.forgot')}
              </button>
              <p className="text-muted-foreground">
                {mode === 'signin' ? `${t('auth.noAccount')} ` : `${t('auth.haveAccount')} `}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
                  className="text-primary hover:underline font-medium"
                >
                  {mode === 'signin' ? t('auth.signup') : t('auth.signin')}
                </button>
              </p>
            </div>

            {/* Info note */}
            <div className="mt-4 p-3 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground leading-relaxed">
              {t('auth.accountInfo')}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
