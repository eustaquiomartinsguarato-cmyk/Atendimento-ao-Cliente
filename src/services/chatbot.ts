import { dbStore } from '../repositories/dbStore.js';
import { Conversation, Message, Sector } from '../types/index.js';
import { isWithinBusinessHours } from '../lib/schedule.js';

const processingLocks = new Set<string>();
const lastExecutionTimes = new Map<string, number>();

export async function handleIncomingMessageForChatbot(conv: Conversation, text: string): Promise<Message | null> {
  const now = Date.now();
  
  // Prevent parallel processing for the same conversation
  if (processingLocks.has(conv.id)) {
    console.log(`[Chatbot] Already processing conversation ${conv.id}, skipping duplicate request.`);
    return null;
  }

  // Prevent sending multiple bot messages (like out-of-hours) in rapid succession (cooldown 4s)
  const lastTime = lastExecutionTimes.get(conv.id) || 0;
  if (now - lastTime < 4000) {
    console.log(`[Chatbot] Cooldown active for conversation ${conv.id}. Ignoring duplicate triggered message.`);
    return null;
  }

  processingLocks.add(conv.id);
  lastExecutionTimes.set(conv.id, now);

  try {
    const settings = await dbStore.getSettings();
    const sectors = await dbStore.getSectors();
    
    const cleanText = text.trim().toLowerCase();

    // Check if we are outside of business hours (permit simulated conversations to bypass by default so they can be tested anytime)
    const isSimulation = !!conv.character || (conv.customer_phone && conv.customer_phone.includes("(Simulação)"));
    const forceOutOfHoursInSim = isSimulation && conv.character && (conv.character.toLowerCase().includes("fora de horário") || conv.character.toLowerCase().includes("fora do horário"));
    
    // Saturday after 12:00 = All available
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false
    });
    
    // Pega hora e minuto
    const parts = fmt.formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value || "";
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || "0", 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || "0", 10);
    
    const minutesSinceMidnight = hour * 60 + minute;

    // Regras de acesso livre
    const isSaturdayAfter12 = weekday === 'sáb' && minutesSinceMidnight >= 720;
    const isDailyLunch = minutesSinceMidnight >= 690 && minutesSinceMidnight < 780; // 11:30 a 13:00
    
    const isFreeAccess = isSaturdayAfter12 || isDailyLunch;

    const isBusinessHours = (isSimulation && !forceOutOfHoursInSim) || isFreeAccess ? true : isWithinBusinessHours(settings.schedules);
    console.log(`[Chatbot] Business hours check for ${conv.id} (Sim: ${isSimulation}, ForceClosed: ${!!forceOutOfHoursInSim}, FreeAccess: ${isFreeAccess}): ${isBusinessHours}`);

    if (!isBusinessHours) {
      // Re-fetch messages right before deciding, to be absolutely sure in case of race conditions
      const msgs = await dbStore.getMessagesForConversation(conv.id);
      
      // Find the index of the most recent "Atendimento encerrado" message
      const lastClosureIndex = [...msgs].reverse().findIndex(m => 
        m.sender_type === 'system' && m.message.includes("🏁 Atendimento encerrado")
      );
      
      // Important: we only look for the out-of-hours message IN THE CURRENT SESSION (after the last closure)
      const currentSessionMsgs = lastClosureIndex === -1 ? msgs : msgs.slice(msgs.length - lastClosureIndex);

      const hasSentOutOfHours = currentSessionMsgs.some(m => 
          m.sender_type === 'system' && 
          (m.message === settings.out_of_hours_message ||
           m.message.includes("horário de atendimento") || 
           m.message.includes("horário") || 
           m.message.includes("expediente") || 
           m.message.includes("no momento estamos fora"))
        );
      
      if (!hasSentOutOfHours) {
        console.log(`[Chatbot] Sending first out-of-hours message for ${conv.id}`);
        return {
          id: "msg_bot_out_of_hours_" + Date.now(),
          conversation_id: conv.id,
          sender_type: 'system',
          message: settings.out_of_hours_message || "Olá! No momento estamos fora do nosso horário de atendimento. Nosso expediente é de Segunda a Sexta das 08:00 às 18:00.\n\nRetornaremos sua mensagem assim que possível! 🕒",
          created_at: new Date().toISOString()
        };
      }

      // If already warned but closed, we ONLY respond if it's one of the automatic options.
    // We do NOT want to show the welcome menu while closed.
    const matchedOption = settings.bot_options?.find(opt => 
      opt.trigger_key && cleanText.includes(opt.trigger_key.toLowerCase())
    );

    if (matchedOption) {
      return {
        id: "msg_bot_opt_" + Date.now(),
        conversation_id: conv.id,
        sender_type: 'system',
        message: matchedOption.response_text,
        created_at: new Date().toISOString()
      };
    }

    // Otherwise, stay silent while closed
    console.log(`[Chatbot] Closed and already warned. Ignoring non-trigger message: "${text}"`);
    return null;
  }

  // 1. Initial State: No Sector Assigned
  if (!conv.sector_id) {
    const activeSectors = sectors.filter(s => s.status === 'ativo');
    
    // Check if customer typed the exact number of an active sector (1-indexed)
    const optionNumber = parseInt(cleanText, 10);
    let matchedSector: Sector | undefined;
    
    if (!isNaN(optionNumber) && optionNumber >= 1 && optionNumber <= activeSectors.length) {
      matchedSector = activeSectors[optionNumber - 1];
    }
    
    // Fallback: Check if they typed the sector name
    if (!matchedSector) {
      matchedSector = activeSectors.find(s => cleanText === s.name.toLowerCase() || cleanText.includes(s.name.toLowerCase()));
    }
    
    if (matchedSector) {
      conv.sector_id = matchedSector.id;
      await dbStore.saveConversation(conv);
      return createSubmenuMessage(conv.id, matchedSector);
    }
    
    // Check "Falar com atendente" trigger: sequential number right after active sectors, or keywords
    const attendantTriggerNumber = String(activeSectors.length + 1);
    
    if (cleanText === attendantTriggerNumber || cleanText.includes("falar com atendente") || cleanText.includes("falar com operador") || cleanText.includes("humano")) {
      conv.status = 'waiting';
      await dbStore.saveConversation(conv);
      await dbStore.addToQueue(conv.id, null);
      return {
        id: "msg_sys_" + Date.now(),
        conversation_id: conv.id,
        sender_type: 'system',
        message: settings.queue_message || "Transferindo para a Fila de Espera...",
        created_at: new Date().toISOString()
      };
    }

    // Check "Finalizar" trigger from main menu
    if (cleanText === '9' || cleanText.includes("finalizar") || cleanText.includes("encerrar")) {
      conv.status = 'closed';
      await dbStore.saveConversation(conv);
      const closureMsg = settings.closure_message || `🏁 Atendimento finalizado.\nObrigado por falar com a ${settings.company_name || 'LS GUARATO'}!`;
      return {
        id: "msg_bot_close_" + Date.now(),
        conversation_id: conv.id,
        sender_type: 'system',
        message: closureMsg,
        created_at: new Date().toISOString()
      };
    }

    // Check general custom bot options trigger keys
    if (settings.bot_options && settings.bot_options.length > 0) {
      const matchedOpt = settings.bot_options.find(
        opt => cleanText === opt.trigger_key.toLowerCase() || cleanText.includes(opt.trigger_key.toLowerCase())
      );
      if (matchedOpt) {
        return {
          id: "msg_bot_" + Date.now(),
          conversation_id: conv.id,
          sender_type: 'system',
          message: matchedOpt.response_text,
          created_at: new Date().toISOString()
        };
      }
    }

    // Default Greeting & Options Menu if no option matched
    const sectorOptions = activeSectors.map((s, i) => `👉 *Digite "${i + 1}"* para *${s.name.toUpperCase()}*`).join('\n');
    const attendantText = `👉 *Digite "${activeSectors.length + 1}"* para *FALAR COM ATENDENTE*`;
    const finishText = `👉 *Digite "9"* para *FINALIZAR ATENDIMENTO*`;
    
    let customOptsText = "";
    if (settings.bot_options && settings.bot_options.length > 0) {
      // Filter out options that conflict with our main sequential numbering
      const reservedTriggers = [...Array.from({ length: activeSectors.length + 1 }, (_, i) => String(i + 1)), "9"];
      const relevantOpts = settings.bot_options.filter(opt => !reservedTriggers.includes(opt.trigger_key));
      
      if (relevantOpts.length > 0) {
        customOptsText = "\n" + relevantOpts.map(opt => `👉 *Digite "${opt.trigger_key}"* para *${opt.title}*`).join('\n');
      }
    }
    
    return {
      id: "msg_bot_" + Date.now(),
      conversation_id: conv.id,
      sender_type: 'system',
      message: `${settings.welcome_message}\n\nOpções disponíveis:\n${sectorOptions}\n${attendantText}\n${finishText}${customOptsText}`,
      created_at: new Date().toISOString()
    };
  }

  // 2. Sector Specific Sub-menu Interaction
  const activeSector = sectors.find(s => s.id === conv.sector_id);
  if (activeSector) {
    const nameLower = activeSector.name.toLowerCase();
    const idLower = activeSector.id.toLowerCase();
    
    const isRH = nameLower === "rh" || idLower.includes("rh");
    const isTelevendas = nameLower.includes("vendas") || nameLower.includes("televendas") || idLower.includes("televendas") || idLower.includes("vendas");
    const isCobranca = nameLower.includes("cobran") || idLower.includes("cobranca");
    const isEntregas = nameLower.includes("entrega") || idLower.includes("entrega");
    const isPagamentos = nameLower.includes("pagamento") || idLower.includes("pagamento");

    // Standard option check
    if (cleanText === '1' || cleanText.includes("primeira") || cleanText.includes("orçamento") || cleanText.includes("currículo") || cleanText.includes("pedido") || cleanText.includes("entrega")) {
      let reply = "📋 Digite as informações solicitadas para o atendimento seguir.";
      if (isRH) {
        reply = "📎 Por favor, anexe ou nos envie o arquivo do seu currículo em PDF/DOCX para avaliação.";
      } else if (isTelevendas) {
        reply = "📋 Para podermos gerar seu orçamento de materiais, digite os itens desejados e quantidades abaixo.";
      } else if (isCobranca) {
        reply = "🧾 Para emitir a 2ª via do seu boleto ou Nota Fiscal, por favor indique o CNPJ/CPF do cadastro ou o número do pedido.";
      } else if (isEntregas) {
        reply = "🚚 PARA RASTREAR SUA ENTREGA, POR FAVOR INFORME O NÚMERO DO SEU PEDIDO.";
      } else if (isPagamentos) {
        reply = "💳 Por favor, envie o comprovante de pagamento em formato de imagem ou PDF para conciliação financeira.";
      }

      return {
        id: "msg_bot_" + Date.now(),
        conversation_id: conv.id,
        sender_type: 'system',
        message: reply,
        created_at: new Date().toISOString()
      };
    }

    if (cleanText === '2' || cleanText.includes("segunda") || cleanText.includes("vaga") || cleanText.includes("consultar") || cleanText.includes("agendar") || cleanText.includes("acordo")) {
      let reply = "🔍 Para consultar seu cadastro de atendimento, digite seu nome completo ou CNPJ.";
      if (isRH) {
        reply = "💼 Nossas vagas ativas atuais são: Auxiliar Logístico, Vendedor de Ferragens e Motorista Categoria D. Você pode se candidatar enviando seu currículo.";
      } else if (isTelevendas) {
        reply = "🔍 Para consultar um pedido existente, por favor indique o número do Orçamento ou Nota Fiscal.";
      } else if (isCobranca) {
        reply = "🤝 Deseja realizar um acordo de parcelamento ou renegociação de débito? Informe seu melhor telefone de contato para retorno.";
      } else if (isEntregas) {
        reply = "📅 Para agendar ou alterar a data de recebimento, informe o endereço.";
      } else if (isPagamentos) {
        reply = "👤 Caso seja fornecedor e deseja consultar pagamentos agendados, informe a Razão Social da sua empresa.";
      }

      return {
        id: "msg_bot_" + Date.now(),
        conversation_id: conv.id,
        sender_type: 'system',
        message: reply,
        created_at: new Date().toISOString()
      };
    }

    // BACK TO MAIN MENU
    if (cleanText === '0' || cleanText.includes("voltar") || cleanText.includes("menu anterior")) {
      conv.sector_id = null;
      await dbStore.saveConversation(conv);
      return handleIncomingMessageForChatbot(conv, "ola"); // Re-run to show main menu
    }

    // CLOSE ATTENDANCE
    if (cleanText === '9' || cleanText.includes("finalizar") || cleanText.includes("encerrar") || cleanText.includes("tchau")) {
      conv.status = 'closed';
      await dbStore.saveConversation(conv);
      
      const closureMsg = settings.closure_message || `🏁 Atendimento finalizado pelo cliente.\nObrigado por falar com a ${settings.company_name || 'LS GUARATO'}!`;
      
      return {
        id: "msg_bot_close_" + Date.now(),
        conversation_id: conv.id,
        sender_type: 'system',
        message: closureMsg,
        created_at: new Date().toISOString()
      };
    }

    if (cleanText === '3' || cleanText.includes("falar") || cleanText.includes("atendente") || cleanText.includes("vendedor") || cleanText === '4' || cleanText.includes("responsavel") || cleanText.includes("financeiro")) {
      conv.status = 'waiting';
      await dbStore.saveConversation(conv);
      await dbStore.addToQueue(conv.id, conv.sector_id);
      return {
        id: "msg_sys_" + Date.now(),
        conversation_id: conv.id,
        sender_type: 'system',
        message: settings.queue_message || "Aguarde um instante, você está sendo transferido para um operador humano.",
        created_at: new Date().toISOString()
      };
    }

    // Fallback menu for subsector
    return createSubmenuMessage(conv.id, activeSector);
  }

  return null;
  } finally {
    processingLocks.delete(conv.id);
  }
}

function createSubmenuMessage(convId: string, sector: Sector): Message {
  let subText = "";
  const nameLower = sector.name.toLowerCase();
  const idLower = sector.id.toLowerCase();

  if (nameLower === "rh" || idLower.includes("rh")) {
    subText = "1. Enviar currículo\n2. Consultar vagas\n3. Falar com responsável do RH";
  } else if (nameLower.includes("vendas") || nameLower.includes("televendas") || idLower.includes("televendas") || idLower.includes("vendas")) {
    subText = "1. Fazer novo pedido / Orçamento\n2. Consultar pedido\n3. Promoções da semana\n4. Falar com vendedor";
  } else if (nameLower.includes("cobrança") || nameLower.includes("cobranca") || idLower.includes("cobranca")) {
    subText = "1. Obter 2ª via de Boleto / Nota Fiscal\n2. Acordo Financeiro\n3. Falar com setor Financeiro";
  } else if (nameLower.includes("entregas") || nameLower.includes("entrega") || idLower.includes("entrega")) {
    subText = "1. Acompanhar Entregas\n2. Agendar Recebimento / Descarregamento\n3. Falar com SAC Entregas";
  } else if (nameLower.includes("pagamentos") || nameLower.includes("pagamento") || idLower.includes("pagamento")) {
    subText = "1. Enviar Comprovante de Pagamento\n2. Consultar Contas a Pagar / Fornecedor\n3. Falar com responsável Financeiro";
  } else {
    // Elegant dynamic fallback for any other customized sector
    subText = "1. Solicitar serviço deste setor\n2. Tirar uma dúvida\n3. Falar com atendente deste setor";
  }

  const footer = "\n\n0. Voltar ao menu anterior\n9. Finalizar atendimento\n\n_Dica: Digite o número da opção desejada._";

  return {
    id: "msg_bot_" + Date.now(),
    conversation_id: convId,
    sender_type: 'system',
    message: `Selecione uma das opções do setor *${sector.name.toUpperCase()}*:\n\n${subText}${footer}`,
    created_at: new Date().toISOString()
  };
}
