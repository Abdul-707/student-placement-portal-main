import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { resolvePortalAccess, rolePath, pendingNotice } from '@/lib/portal-access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GraduationCap, ArrowRight, Mail } from 'lucide-react';

const registration = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(128),
  role: z.enum(['student', 'recruiter', 'tutor']),
  roll_number: z.string().trim().max(50),
  branch: z.string().trim().max(100),
  cgpa: z.string(),
}).superRefine((value, ctx) => {
  if (value.role !== 'student') return;
  if (!value.roll_number || !value.branch || !value.cgpa || !Number.isFinite(Number(value.cgpa)) || Number(value.cgpa) < 0 || Number(value.cgpa) > 10) {
    ctx.addIssue({ code: 'custom', message: 'Enter a roll number, branch, and CGPA between 0 and 10.' });
  }
});

export const Route = createFileRoute('/auth')({
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic' | 'forgot'>('signin');
  const [role, setRole] = useState<'student' | 'recruiter' | 'tutor'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [branch, setBranch] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function goHome() {
    try {
      const access = await resolvePortalAccess();
      if (!access.role) return;
      if (access.pending && access.role !== 'super_admin') {
        setMessage(access.user?.user_metadata?.['role'] === 'tutor' || access.role === 'tutor' ? pendingNotice : 'Your access request is pending.');
        return;
      }
      navigate({ to: rolePath(access.role) as any, replace: true });
    } catch {
      setMessage('Unable to check account access. Please try again.');
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));

    if (params.get('type') === 'recovery' || hash.get('type') === 'recovery') {
      window.location.replace('/reset-password' + window.location.search + window.location.hash);
      return;
    }

    const confirmation = params.get('flow') === 'confirm' || hash.get('type') === 'signup';
    if (confirmation) {
      void supabase.auth.getSession().then(async () => {
        await supabase.auth.signOut();
        window.history.replaceState(null, '', '/auth');
        setMode('signin');
        setMessage('Email verified. Sign in to continue.');
      });
      return;
    }

    void goHome();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN') setTimeout(() => { void goHome(); }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      if (mode === 'magic' || mode === 'forgot') {
        const result = z.string().trim().email().max(255).safeParse(email);
        if (!result.success) {
          setMessage('Enter a valid email address.');
        } else if (mode === 'forgot') {
          const { error } = await supabase.auth.resetPasswordForEmail(result.data, {
            redirectTo: window.location.origin + '/reset-password',
          });
          setMessage(error?.message || 'If an account exists, a password reset link is on its way.');
        } else {
          const { error } = await supabase.auth.signInWithOtp({
            email: result.data,
            options: { emailRedirectTo: window.location.origin + '/auth' },
          });
          setMessage(error?.message || 'Check your email for a sign-in link.');
        }
      } else if (mode === 'signup') {
        const result = registration.safeParse({
          email,
          password,
          full_name: name,
          role,
          roll_number: roll,
          branch,
          cgpa,
        });

        if (!result.success) {
          setMessage(result.error.issues[0]?.message || 'Check your registration details.');
        } else {
          const { data, error } = await supabase.auth.signUp({
            email: result.data.email,
            password: result.data.password,
            options: {
              emailRedirectTo: window.location.origin + '/auth?flow=confirm',
              data: {
                full_name: result.data.full_name,
                role: result.data.role,
                roll_number: result.data.roll_number,
                branch: result.data.branch,
                cgpa: result.data.cgpa,
              },
            },
          });

          setMessage(error?.message || (data.session ? 'Account created. Redirecting…' : role === 'student' ? 'Check your email to confirm your account. Then sign in.' : 'Check your email to confirm your account. Then sign in.'));
          if (data.session) await goHome();
          else if (!error) setMode('signin');
        }
      } else {
        const result = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(128) }).safeParse({ email, password });
        if (!result.success) {
          setMessage('Enter a valid email address and password.');
        } else {
          const { error } = await supabase.auth.signInWithPassword(result.data);
          if (error) {
            setMessage(error.message === 'Invalid login credentials' ? 'Invalid email or password. Use Forgot password to set a new one.' : error.message);
          } else {
            await goHome();
          }
        }
      }
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/auth' },
      });
      if (error) setMessage(error.message);
    } catch {
      setMessage('Unable to sign in with Google. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: typeof mode) {
    setMode(next);
    setMessage('');
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-xl bg-primary-foreground/10 p-2"><GraduationCap className="h-6 w-6" /></div>
            <span className="text-xl font-semibold">Student Placement Portal</span>
          </div>
          <h1 className="max-w-md text-5xl font-bold tracking-tight">Career opportunities start here.</h1>
          <p className="mt-6 max-w-md text-base text-primary-foreground/85">Connect students, recruiters, tutors, and admins in one secure hub.</p>
        </div>
        <div className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-6 backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-primary-foreground/70">Trusted access</p>
          <p className="mt-4 text-2xl font-semibold">Secure portal onboarding</p>
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Welcome</p>
              <h2 className="text-3xl font-semibold tracking-tight">{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Continue'}</h2>
            </div>
            <div className="rounded-full bg-primary/10 p-2 text-primary"><Mail className="h-5 w-5" /></div>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <div className="space-y-4">
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input value={roll} onChange={e => setRoll(e.target.value)} placeholder="Roll Number" />
                  <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="Branch" />
                </div>
                <Input value={cgpa} onChange={e => setCgpa(e.target.value)} placeholder="CGPA" />
              </div>
            )}

            {mode !== 'signup' && (
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" />
            )}

            {(mode === 'signin' || mode === 'signup') && (
              <>
                {mode === 'signup' && <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" />}
                <Input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" />
              </>
            )}

            {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Role</label>
                <Select value={role} onValueChange={v => setRole(v as 'student' | 'recruiter' | 'tutor')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="tutor">Tutor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {message && <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{message}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send magic link' : 'Send reset link'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <button type="button" className="w-full text-left" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
            </button>
            <button type="button" className="w-full text-left" onClick={() => switchMode('magic')}>
              Use magic link instead
            </button>
            <button type="button" className="w-full text-left" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
            <Button variant="outline" className="w-full" onClick={google} type="button" disabled={busy}>Continue with Google</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
