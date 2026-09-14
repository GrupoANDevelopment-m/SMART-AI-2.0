import React, { useEffect, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

function base64URLEncode(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return hash;
}

export function DerivOAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if returning from OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const returnedState = urlParams.get('state');
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
       setError(urlParams.get('error_description') || errorParam);
       return;
    }

    if (code && returnedState) {
      handleOAuthCallback(code, returnedState);
    }
  }, []);

  const handleOAuthCallback = async (code: string, returnedState: string) => {
    try {
      setLoading(true);
      const savedState = sessionStorage.getItem('oauth_state');
      const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

      if (!savedState || returnedState !== savedState) {
        throw new Error('Falha na validação de segurança (Estado CSRF inválido).');
      }

      if (!codeVerifier) {
        throw new Error('Falha na validação de segurança (Code Verifier ausente).');
      }

      // Cleanup
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('pkce_code_verifier');

      // Remove code from URL silently
      window.history.replaceState({}, document.title, window.location.pathname);

      const redirectUri = `${window.location.origin}/`;

      const response = await fetch('/api/auth/deriv/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao conectar com a corretora Deriv.');
      }

      // Save token in user's profile
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Usuário não autenticado. Faça login primeiro.');
      }

      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        derivToken: data.access_token,
        derivConnectedAt: new Date().toISOString()
      }, { merge: true });

      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Um erro ocorreu durante a conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch client info from backend
      const res = await fetch('/api/auth/deriv/client-id');
      const { client_id, affiliate_token } = await res.json();

      if (!client_id) {
         throw new Error("Client ID da Deriv não configurado no servidor (Variável DERIV_CLIENT_ID). Configure no painel Secrets.");
      }

      // 1. Generate code_verifier
      const array = new Uint8Array(64);
      crypto.getRandomValues(array);
      const codeVerifier = Array.from(array)
        .map(v => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[v % 66])
        .join('');

      // 2. Generate code_challenge
      const hash = await sha256(codeVerifier);
      const codeChallenge = base64URLEncode(hash);

      // 3. Generate state
      const stateArray = new Uint8Array(16);
      crypto.getRandomValues(stateArray);
      const state = Array.from(stateArray).map(b => b.toString(16).padStart(2, '0')).join('');

      // 4. Store in session
      sessionStorage.setItem('pkce_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      // 5. Redirect
      const redirectUri = `${window.location.origin}/`;
      
      let authUrl = `https://auth.deriv.com/oauth2/auth?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=trade+account_manage&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      
      if (affiliate_token) {
         authUrl += `&prompt=registration&t=${affiliate_token}&utm_medium=affiliate`;
      }

      window.location.href = authUrl;

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-2xl p-6">
        <p className="text-emerald-400 font-bold flex items-center gap-2">
          <Zap className="w-5 h-5" /> Conta Deriv conectada com sucesso!
        </p>
        <p className="text-sm text-emerald-500/70 mt-2">O token foi gerado via OAuth e salvo de forma segura no seu perfil.</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        <Zap className="text-emerald-400 w-5 h-5" /> 
        Conectar Corretora (Deriv OAuth 2.0)
      </h3>
      <p className="text-sm text-zinc-400">
        Autorize o S.M.A.R.T. AI a operar na sua conta. Seu acesso será gerado de forma segura, sem compartilhar sua senha.
      </p>
      {error && <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg text-red-400 text-sm font-medium">{error}</div>}
      <button 
        onClick={handleConnect} 
        disabled={loading}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
        {loading ? 'Conectando...' : 'Autenticar com a Deriv'}
      </button>
    </div>
  );
}
