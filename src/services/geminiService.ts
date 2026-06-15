import { GoogleGenAI } from '@google/genai';

let geminiClient: any = null;

function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      geminiClient = new GoogleGenAI({ apiKey });
    }
  }
  return geminiClient;
}

export async function generateGeminiReply(
  characterProfile: string,
  chatHistory: { sender: string; text: string }[],
  latestMsg: string
): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    // Elegant fallback simulation response based on character
    return getFallbackSimulationResponse(characterProfile, latestMsg);
  }

  try {
    const systemInstruction = `
      Você é um cliente real interagindo no WhatsApp com o painel de atendimento da empresa "LS GUARATO" (Materiais de Construção, orçamentos, gesso, ferragens, tintas, etc).
      Sua personalidade, objetivos e características são definidos pelo seguinte perfil: "${characterProfile}".
      Se comporte exatamente de acordo com esse perfil. Use gírias locais e escreva com formatação típica do WhatsApp (erros de digitação leves, respostas curtas, em linhas separadas quando apropriado).
      Mantenha a conversa realista. Nunca mencione que você é um modelo de Inteligência Artificial ou um personagem de simulação.
    `;

    const chatContext = chatHistory.map(h => `${h.sender}: ${h.text}`).join('\n');
    const prompt = `
      Diálogo Anterior no WhatsApp:
      ${chatContext}

      Atendente: ${latestMsg}

      Responda ao Atendente mantendo seu personagem/perfil:
    `;

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.9,
        maxOutputTokens: 250
      }
    });

    return response.text?.trim() || "Entendido. Vou aguardar retorno.";
  } catch (err) {
    console.error("Gemini API Error:", err);
    return getFallbackSimulationResponse(characterProfile, latestMsg);
  }
}

function getFallbackSimulationResponse(profile: string, message: string): string {
  const msg = message.toLowerCase();
  
  if (profile.includes("cimento") || profile.includes("pedido")) {
    if (msg.includes("parcela") || msg.includes("pagamento") || msg.includes("como funciona")) {
      return "Prefiro pagar no Pix se tiver desconto! Consegue calcular o valor total das 50 caixas de cimento com frete pro bairro Morumbi?";
    }
    if (msg.includes("oi") || msg.includes("bom dia") || msg.includes("tarde")) {
      return "Olá! Quero fazer uma cotação de 50 sacos de cimento CPII pra entregar rápido. Tem em estoque?";
    }
    return "Consigo pagar no Pix agora se fechar um preço bom com frete incluso, pode gerar a chave pra mim?";
  }

  if (profile.includes("currículo") || profile.includes("vaga") || profile.includes("RH")) {
    if (msg.includes("enviar") || msg.includes("mandar") || msg.includes("currículo")) {
      return "Ótimo! Acabei de carregar meu currículo no formato PDF. Vocês estão contratando para início imediato?";
    }
    return "Olá! Busco oportunidades na área administrativa. Tenho experiência com faturamento e notas fiscais de materiais.";
  }

  return "Perfeito! Fico no aguardo de mais informações pra gente fechar.";
}
