import express from 'express';
import fetch from 'node-fetch';

export const authRouter = express.Router();

authRouter.post('/deriv/exchange', async (req, res) => {
  const { code, code_verifier, redirect_uri } = req.body;
  
  if (!code || !code_verifier || !redirect_uri) {
    return res.status(400).json({ error: 'Missing required parameters: code, code_verifier, or redirect_uri' });
  }

  const clientId = process.env.DERIV_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'DERIV_CLIENT_ID not configured on server' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', clientId);
    params.append('code', code);
    params.append('code_verifier', code_verifier);
    params.append('redirect_uri', redirect_uri);

    const response = await fetch('https://auth.deriv.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Deriv token exchange failed:', data);
      return res.status(response.status).json(data);
    }

    // data contains access_token, expires_in, token_type
    res.json(data);
  } catch (error: any) {
    console.error('Error exchanging token:', error);
    res.status(500).json({ error: error.message });
  }
});

authRouter.get('/deriv/client-id', (req, res) => {
  res.json({ 
    client_id: process.env.DERIV_CLIENT_ID || '',
    affiliate_token: process.env.DERIV_AFFILIATE_TOKEN || ''
  });
});
