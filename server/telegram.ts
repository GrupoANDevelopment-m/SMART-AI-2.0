import TelegramBot from 'node-telegram-bot-api';
import { DerivService } from './deriv';

const token = '8311177586:AAFMkFqXCb2AMWPe1PFBWS6vxAqSe_QskfY';
const allowedChatId = 5827043126;

const ASSETS = [
  'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
  'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY',
  'cryBTCUSD', 'cryETHUSD'
];

export class TelegramService {
  private bot: TelegramBot;
  private io: any;
  private deriv: DerivService;

  constructor(io: any, deriv: DerivService) {
    this.io = io;
    this.deriv = deriv;
    
    const isNewInstance = !(global as any).__telegramBot;
    if (isNewInstance) {
      try {
        (global as any).__telegramBot = new TelegramBot(token, { polling: { autoStart: true, params: { timeout: 10 } } });
      } catch (err: any) {
        console.error('Error starting Telegram bot:', err.message);
      }
    } else {
      (global as any).__telegramBot.stopPolling().then(() => {
        return (global as any).__telegramBot.startPolling({ params: { timeout: 10 } });
      }).catch(console.error);
    }
    this.bot = (global as any).__telegramBot;

    if (isNewInstance) {
      this.bot.on('polling_error', (error: any) => {
        if (error.message && (error.message.includes('409 Conflict') || error.message.includes('ETELEGRAM: 409') || error.message.includes('EFATAL') || error.message.includes('ECONNRESET'))) {
            // Ignore benign or transient errors
            return;
        }
        console.error('Telegram polling error:', error.message);
      });

      this.bot.on('error', (error) => {
        console.error('Telegram general error:', error.message);
      });

      this.bot.on('message', async (msg) => {
        try {
          const chatId = msg.chat.id;
          if (chatId !== allowedChatId) {
            this.bot.sendMessage(chatId, "⛔ Acesso negado. Você não está autorizado a usar este bot.");
            return;
          }

          const text = msg.text || '';
          if (text.startsWith('/')) {
            await this.handleCommand(text);
          }
        } catch (err: any) {
          console.error("Error in telegram message handler:", err.message);
        }
      });

      this.bot.on('callback_query', async (query) => {
        try {
          const chatId = query.message?.chat.id;
          if (chatId !== allowedChatId) return;
          
          const data = query.data || '';
          if (data.startsWith('buy_') || data.startsWith('sell_')) {
            const [action, asset] = data.split('_');
            const command = action === 'buy' ? '/comprar' : '/vender';
            this.io.emit('telegram_command', { command, args: [asset, '10'] }); // Default stake 10
            this.bot.answerCallbackQuery(query.id, { text: `Comando ${action.toUpperCase()} enviado para ${asset}` });
          } else if (data.startsWith('analyze_')) {
            const asset = data.split('_')[1];
            this.io.emit('telegram_command', { command: '/analisar', args: [asset] });
            this.bot.answerCallbackQuery(query.id, { text: `Analisando ${asset}...` });
          } else if (data.startsWith('toggle_ind_')) {
            const ind = data.split('_')[2];
            this.io.emit('telegram_command', { command: '/toggle_indicador', args: [ind] });
            this.bot.answerCallbackQuery(query.id, { text: `Indicador ${ind} alternado` });
          } else if (data === 'autopilot_on') {
            this.io.emit('telegram_command', { command: '/autopilot', args: ['on'] });
            this.bot.answerCallbackQuery(query.id, { text: `AutoPilot Ligado` });
          } else if (data === 'autopilot_off') {
            this.io.emit('telegram_command', { command: '/autopilot', args: ['off'] });
            this.bot.answerCallbackQuery(query.id, { text: `AutoPilot Desligado` });
          }
        } catch (err: any) {
          console.error("Error in telegram callback handler:", err.message);
        }
      });

      this.sendMessage("🤖 <b>IA INTELIGENTE</b> iniciada e conectada com sucesso!\n\nEnvie <code>/comecar</code> para ver os comandos disponíveis.");
    }
  }

  public async shutdown() {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        console.log("Telegram bot polling stopped.");
      } catch(e) {}
    }
  }

  public sendMessage(text: string, options?: any) {
    this.bot.sendMessage(allowedChatId, text, { parse_mode: "HTML", ...options }).catch(console.error);
  }

  private async handleCommand(text: string) {
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      if (command === '/start' || command === '/comecar') {
        const helpText = `
<b>🤖 Menu de Comandos IA INTELIGENTE</b>

<b>📊 Monitoramento</b>
/saldo - Ver saldo atual
/posicoes - Ver operações abertas
/historico - Ver últimas operações

<b>🧠 Inteligência Artificial</b>
/ativos - Consultar ativos e análises
/indicadores - Ativar/Desativar indicadores
/autopilot [on/off] - Ligar/Desligar robô autônomo

<b>💰 Execução Manual</b>
/comprar [ativo] [valor] - Comprar (ex: /comprar R_75 5)
/vender [ativo] [valor] - Vender
/fechar [id] - Encerrar operação
        `;
        this.sendMessage(helpText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Ligar AutoPilot", callback_data: "autopilot_on" }, { text: "Desligar AutoPilot", callback_data: "autopilot_off" }]
            ]
          }
        });
      } else if (command === '/ativos') {
        const keyboard = ASSETS.map(asset => ([{
          text: asset,
          callback_data: `analyze_${asset}`
        }]));
        
        this.sendMessage("📊 <b>Lista de Ativos</b>\nSelecione um ativo para ver a análise e opções de trade:", {
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
      } else if (command === '/indicadores') {
        const indicators = ['RSI', 'MACD', 'EMA', 'Bollinger'];
        const keyboard = indicators.map(ind => ([{
          text: `Alternar ${ind}`,
          callback_data: `toggle_ind_${ind}`
        }]));
        
        this.sendMessage("📈 <b>Indicadores</b>\nSelecione um indicador para ativar/desativar:", {
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
      } else if (command === '/saldo') {
        this.sendMessage(`💰 <b>Saldo Atual:</b> $${this.deriv.currentBalance.toFixed(2)}`);
      } else if (command === '/posicoes') {
        const res = await this.deriv.getPortfolio();
        const contracts = res.portfolio?.contracts || [];
        if (contracts.length === 0) {
          this.sendMessage("Nenhuma operação aberta no momento.");
        } else {
          let msg = "<b>📊 Operações Abertas:</b>\n\n";
          contracts.forEach((c: any) => {
            msg += `🔹 <b>ID:</b> \`${c.contract_id}\`\n`;
            msg += `📈 <b>Ativo:</b> ${c.symbol}\n`;
            msg += `💵 <b>Compra:</b> $${c.buy_price}\n`;
            msg += `------------------------\n`;
          });
          this.sendMessage(msg);
        }
      } else if (command === '/historico') {
        const res = await this.deriv.getProfitTable();
        const transactions = res.profit_table?.transactions || [];
        if (transactions.length === 0) {
          this.sendMessage("Nenhum histórico recente.");
        } else {
          let msg = "<b>📜 Últimas Operações:</b>\n\n";
          let totalProfit = 0;
          transactions.forEach((t: any) => {
            const isProfit = t.sell_price > t.buy_price;
            const icon = isProfit ? "✅" : "❌";
            const profit = t.sell_price - t.buy_price;
            totalProfit += profit;
            msg += `${icon} <b>${t.shortcode.split('_')[1] || 'Trade'}</b> | Lucro: $${profit.toFixed(2)}\n`;
          });
          msg += `\n<b>Resultado Total (Últimas 10):</b> $${totalProfit.toFixed(2)}`;
          this.sendMessage(msg);
        }
      } else if (command === '/fechar') {
        if (!args[0]) return this.sendMessage("⚠️ Informe o ID do contrato. Ex: <code>/fechar 123456789</code>");
        const res = await this.deriv.sellContract(Number(args[0]));
        if (res.error) {
          this.sendMessage(`❌ Erro ao fechar: ${res.error.message}`);
        } else {
          this.sendMessage(`✅ Operação fechada com sucesso! Valor de venda: $${res.sell?.sold_for}`);
        }
      } else {
        // Forward to frontend for AI/Trading logic (/analisar, /autopilot, /comprar, /vender)
        this.io.emit('telegram_command', { command, args });
      }
    } catch (e: any) {
      this.sendMessage(`❌ Erro ao executar comando: ${e.message}`);
    }
  }
}
