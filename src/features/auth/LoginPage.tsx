import {
  IonButton,
  IonContent,
  IonInput,
  IonNote,
  IonPage,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { supabase } from '../../lib/supabase';
import { friendlyAuthError } from './authErrors';
import { homePathFor } from './roles';
import { useAuth } from './useAuth';
import './LoginPage.css';
import { useT } from '../../i18n/i18n';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export function LoginPage() {
  const tx = useT();
  const { status, profile } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (status === 'ready' && profile) {
    return <Navigate to={homePathFor(profile)} replace />;
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (err) {
      setError(friendlyAuthError(err));
      return;
    }
    setEmail(clean);
    setCode('');
    setStep('code');
    setResendIn(RESEND_SECONDS);
  }

  async function verifyCode(token: string) {
    if (token.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (err) {
      setError(friendlyAuthError(err));
      setCode('');
    }
    // On success AuthProvider picks up the session and this page redirects.
  }

  function onCodeInput(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verifyCode(digits);
  }

  return (
    <IonPage>
      <IonContent className="ion-padding login-content">
        <div className="login-box">
          <img src="/icon.svg" alt="" className="login-logo" />
          <h1 className="login-title">{tx('FitCoach')}</h1>

          {step === 'email' ? (
            <form onSubmit={sendCode} noValidate>
              <p className="login-hint">
                {tx("Enter your email and we'll send you a 6-digit login code.")}
              </p>
              <IonInput
                className="login-input"
                fill="outline"
                label={tx('Email')}
                labelPlacement="floating"
                type="email"
                inputmode="email"
                autocomplete="email"
                value={email}
                onIonInput={(e) => setEmail(String(e.detail.value ?? ''))}
                disabled={busy}
              />
              <IonButton type="submit" expand="block" size="large" disabled={busy || !email}>
                {busy ? <IonSpinner name="dots" /> : tx('Send code')}
              </IonButton>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verifyCode(code);
              }}
              noValidate
            >
              <p className="login-hint">
                {tx('We sent a code to')} <strong>{email}</strong>
                {tx('. It works for 10 minutes.')}
              </p>
              <IonInput
                className="login-input login-code"
                fill="outline"
                label={tx('6-digit code')}
                labelPlacement="floating"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength={CODE_LENGTH}
                value={code}
                onIonInput={(e) => onCodeInput(String(e.detail.value ?? ''))}
                disabled={busy}
              />
              <IonButton
                type="submit"
                expand="block"
                size="large"
                disabled={busy || code.length !== CODE_LENGTH}
              >
                {busy ? <IonSpinner name="dots" /> : tx('Log in')}
              </IonButton>
              <div className="login-links">
                <IonButton
                  fill="clear"
                  size="small"
                  disabled={busy || resendIn > 0}
                  onClick={() => void sendCode()}
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : tx('Resend code')}
                </IonButton>
                <IonButton
                  fill="clear"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    setStep('email');
                    setError(null);
                  }}
                >
                  {tx('Use a different email')}
                </IonButton>
              </div>
            </form>
          )}

          {error && (
            <IonText color="danger" role="alert">
              <p className="login-error">{error}</p>
            </IonText>
          )}

          <IonNote className="login-footer">
            {tx('No account? Ask your trainer or admin to add you.')}
          </IonNote>
        </div>
      </IonContent>
    </IonPage>
  );
}
