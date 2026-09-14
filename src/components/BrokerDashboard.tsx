import React, { useState, useEffect } from 'react';
import { 
  Building2, CreditCard, Wallet, Users, ArrowRightLeft, 
  ArrowDownToLine, ArrowUpFromLine, Search, Loader2, Zap,
  CheckCircle2, XCircle, Activity, Trash2
} from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export function BrokerDashboard() {
  const [activeSubTab, setActiveSubTab] = useState<'agents' | 'transfer' | 'withdraw' | 'subscriptions'>('agents');
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    loadUserToken();
  }, []);

  const loadUserToken = async () => {
    const user = auth.currentUser;
    if (user) {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().derivToken) {
        setToken(docSnap.data().derivToken);
      }
    }
  };

  useEffect(() => {
    if (token && activeSubTab === 'agents') {
      fetchAgents();
    }
  }, [token, activeSubTab, currency]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/payment-agents/agents?currency=${currency}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.paymentagent_list?.list) {
        setAgents(data.paymentagent_list.list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-8 text-center">
        <Wallet className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Conecte sua conta Deriv</h3>
        <p className="text-zinc-400 mb-6">Para acessar a área da corretora, depósitos e saques, primeiro vincule sua conta.</p>
        <p className="text-sm text-emerald-500">Vá para a aba de Configurações para realizar a conexão.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-zinc-800/50 pb-4">
        <button 
          onClick={() => setActiveSubTab('agents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeSubTab === 'agents' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          <Users className="w-4 h-4" /> Agentes de Pagamento
        </button>
        <button 
          onClick={() => setActiveSubTab('transfer')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeSubTab === 'transfer' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          <ArrowDownToLine className="w-4 h-4" /> Depósito (Transferência)
        </button>
        <button 
          onClick={() => setActiveSubTab('withdraw')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeSubTab === 'withdraw' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          <ArrowUpFromLine className="w-4 h-4" /> Saque
        </button>
        <button 
          onClick={() => setActiveSubTab('subscriptions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeSubTab === 'subscriptions' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
        >
          <Activity className="w-4 h-4" /> Assinaturas (WebSocket)
        </button>
      </div>

      {activeSubTab === 'agents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Agentes Disponíveis ({currency})</h3>
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="BRL">BRL</option>
            </select>
          </div>
          
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent, idx) => (
                <div key={idx} className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-emerald-400">{agent.name}</h4>
                      <p className="text-xs text-zinc-400 mt-1">ID: {agent.paymentagent_loginid}</p>
                    </div>
                    <Building2 className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div className="space-y-2 mt-4 text-sm">
                    {agent.email && <p className="text-zinc-300">Email: {agent.email}</p>}
                    {agent.telephone && <p className="text-zinc-300">Tel: {agent.telephone}</p>}
                    {agent.urls?.[0] && (
                      <a href={agent.urls[0].url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1 mt-1">
                        Acessar Site <ArrowRightLeft className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {agents.length === 0 && !loading && (
                <div className="col-span-full py-8 text-center text-zinc-500">
                  Nenhum agente de pagamento encontrado para esta moeda.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'transfer' && (
        <TransferForm token={token} />
      )}

      {activeSubTab === 'withdraw' && (
        <WithdrawForm token={token} />
      )}

      {activeSubTab === 'subscriptions' && (
        <SubscriptionsManager />
      )}
    </div>
  );
}

function TransferForm({ token }: { token: string }) {
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/payment-agents/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transfer: 1,
          transfer_to: targetId,
          amount: parseFloat(amount),
          currency,
        })
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: { message: err.message } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <ArrowDownToLine className="w-5 h-5 text-emerald-400" /> Realizar Transferência (Depósito)
      </h3>
      <p className="text-sm text-zinc-400 mb-6">
        Se você é um agente de pagamento, use este formulário para enviar fundos para o ID de um cliente.
      </p>

      {result?.error ? (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {result.error.message}
        </div>
      ) : result?.paymentagent_transfer === 1 ? (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          Transferência concluída com sucesso!
        </div>
      ) : null}

      <form onSubmit={handleTransfer} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">ID do Cliente (CR)</label>
          <input 
            type="text" 
            required
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
            placeholder="Ex: CR1234567"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Valor</label>
            <input 
              type="number" 
              required
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Moeda</label>
            <input 
              type="text" 
              required
              value={currency}
              onChange={e => setCurrency(e.target.value.toUpperCase())}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-3 mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Transferir Fundos'}
        </button>
      </form>
    </div>
  );
}

function WithdrawForm({ token }: { token: string }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [verificationCode, setVerificationCode] = useState('');
  const [result, setResult] = useState<any>(null);

  const requestVerification = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/payment-agents/withdraw/verification_code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          verification_code: 1, // trigger sending email
        })
      });
      const data = await res.json();
      if (data.error) {
        setResult(data);
      } else {
        setStep(2);
      }
    } catch (err: any) {
      setResult({ error: { message: err.message } });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/payment-agents/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          paymentagent_withdraw: 1,
          paymentagent_loginid: agentId,
          amount: parseFloat(amount),
          currency,
          verification_code: verificationCode
        })
      });
      const data = await res.json();
      setResult(data);
      if (data.paymentagent_withdraw === 1) {
        // Success
      }
    } catch (err: any) {
      setResult({ error: { message: err.message } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <ArrowUpFromLine className="w-5 h-5 text-emerald-400" /> Sacar via Agente
      </h3>
      
      {result?.error ? (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {result.error.message}
        </div>
      ) : result?.paymentagent_withdraw === 1 ? (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          Solicitação de saque enviada com sucesso! 
          {result.transaction_id ? ` ID: ${result.transaction_id}` : ''}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400 mb-6">
            Para realizar um saque através de um Agente de Pagamento, precisamos verificar sua identidade enviando um código para o seu email registrado na Deriv.
          </p>
          <button 
            onClick={requestVerification}
            disabled={loading}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar Código de Verificação'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleWithdraw} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Código de Verificação</label>
            <input 
              type="text" 
              required
              value={verificationCode}
              onChange={e => setVerificationCode(e.target.value)}
              placeholder="Recebido no email"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono tracking-widest"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">ID do Agente (CR)</label>
            <input 
              type="text" 
              required
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              placeholder="Ex: CR1234567"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Valor</label>
              <input 
                type="number" 
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Moeda</label>
              <input 
                type="text" 
                required
                value={currency}
                onChange={e => setCurrency(e.target.value.toUpperCase())}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Saque'}
          </button>
        </form>
      )}
    </div>
  );
}

function SubscriptionsManager() {
  const [loadingTicks, setLoadingTicks] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [result, setResult] = useState<{message: string, type: 'success'|'error'} | null>(null);

  const handleForgetTicks = async () => {
    setLoadingTicks(true);
    setResult(null);
    try {
      const res = await fetch('/api/deriv/forget-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: ['ticks'] })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult({ message: 'Todas as assinaturas de gráficos (ticks) foram canceladas. Memória liberada.', type: 'success' });
    } catch (err: any) {
      setResult({ message: err.message, type: 'error' });
    } finally {
      setLoadingTicks(false);
    }
  };

  const handleForgetAll = async () => {
    setLoadingAll(true);
    setResult(null);
    try {
      const res = await fetch('/api/deriv/forget-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: ['ticks', 'proposal', 'balance', 'transaction'] })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult({ message: 'Todas as assinaturas do servidor foram limpas. Evitando sobrecarga de websocket.', type: 'success' });
    } catch (err: any) {
      setResult({ message: err.message, type: 'error' });
    } finally {
      setLoadingAll(false);
    }
  };

  return (
    <div className="max-w-2xl bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-emerald-400" /> Gestão de Assinaturas (WebSocket)
      </h3>
      <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
        O sistema de trading abre canais de dados em tempo real (WebSockets) com a corretora para cotações, 
        balanços e operações. Limpar esses canais quando não estão em uso economiza recursos e evita travamentos.
      </p>

      {result && (
        <div className={`mb-6 p-4 rounded-lg text-sm flex items-start gap-2 ${result.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'}`}>
          {result.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {result.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h4 className="font-bold text-white mb-2">Assinaturas de Gráficos</h4>
          <p className="text-xs text-zinc-500 mb-4">
            Cancela recebimento contínuo de cotações de todos os ativos que você abriu. Útil ao mudar o foco para outro ativo.
          </p>
          <button 
            onClick={handleForgetTicks}
            disabled={loadingTicks}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {loadingTicks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-emerald-400" />}
            Limpar Ticks (Gráficos)
          </button>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h4 className="font-bold text-rose-400 mb-2">Reset Total (Tudo)</h4>
          <p className="text-xs text-zinc-500 mb-4">
            Desliga gráficos, saldos em tempo real e notificações de contratos do backend. Use em caso de lentidão ou sobrecarga de requisições.
          </p>
          <button 
            onClick={handleForgetAll}
            disabled={loadingAll}
            className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {loadingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Forçar Limpeza Total
          </button>
        </div>
      </div>
    </div>
  );
}
