import crypto from 'crypto';

function base64URLEncode(buffer: Buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer: string) {
  return crypto.createHash('sha256').update(buffer).digest();
}

console.log("=== Teste de Geração PKCE para Deriv OAuth ===");

// 1. Generate code_verifier
const codeVerifier = base64URLEncode(crypto.randomBytes(32));
console.log('\n1. code_verifier (Guarda na sessão):', codeVerifier);

// 2. Generate code_challenge
const codeChallenge = base64URLEncode(sha256(codeVerifier));
console.log('2. code_challenge (Enviado na URL):', codeChallenge);

// 3. Generate state
const state = crypto.randomBytes(16).toString('hex');
console.log('3. state (Proteção CSRF):', state);

// 4. Construct Auth URL
const client_id = 'APP_TEST_123';
const redirect_uri = 'https://nosso-app.com/callback';
const affiliate_token = 'TRACKING_TOKEN_AQUI';

const authUrl = `https://auth.deriv.com/oauth2/auth?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=trade+account_manage&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256&prompt=registration&t=${affiliate_token}&utm_medium=affiliate`;

console.log('\n4. URL de Login/Registro gerada:\n', authUrl);
