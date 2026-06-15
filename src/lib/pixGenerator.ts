/**
 * Utilitário para gerar o código "PIX Copia e Cola" (Padrão EMV do Banco Central do Brasil)
 * contendo a chave PIX, o favorecido, a cidade e o valor exato da cobrança.
 */

/**
 * Calcula o Hash CRC16 CCITT (Polinômio 0x1021, valor inicial 0xFFFF)
 * usado na validação final dos códigos de barra/QR Codes padrão EMV do Banco Central.
 */
function crc16Ccitt(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i);
    crc ^= (charCode << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixOptions {
  key: string;       // Chave PIX (E-mail, Celular, CNPJ, CPF, Chave Aleatória)
  receiver: string;  // Nome do favorecido (máx 25 caracteres)
  city?: string;     // Cidade do favorecido (máx 15 caracteres)
  amount?: number;   // Valor do PIX (opcional, ex: 10.50)
  txid?: string;     // Identificador da transação (opcional, padrão '***')
}

/**
 * Gera a string "Pix Copia e Cola" totalmente válida
 */
export function generatePixCopiaCola({
  key,
  receiver,
  city = 'SAO PAULO',
  amount,
  txid = '***'
}: PixOptions): string {
  // Função auxiliar para estruturar os campos EMV: ID + Tamanho (2 dígitos) + Valor
  const formatField = (id: string, value: string): string => {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  };

  // Limpar acentos e caracteres especiais para compatibilidade estrita do padrão EMV
  const cleanString = (str: string, maxLength: number): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^A-Za-z0-9 ]/g, '')     // Apenas letras, números e espaços
      .substring(0, maxLength)
      .trim()
      .toUpperCase();
  };

  // Limpeza da chave PIX (remover parênteses/hífens de celular/CNPJ se necessário, mantendo apenas formato limpo)
  let cleanKey = key.trim();
  // Se for celular (ex: +55...), vamos normalizar ou apenas manter. 
  // Padrão BACEN aceita formato livre para chaves cadastradas, mas é mais recomendado remover formatação se for telefone/CNPJ.
  if (/^\+?\d+$/.test(cleanKey.replace(/[\s\-\(\)]/g, ''))) {
    cleanKey = cleanKey.replace(/[\s\-\(\)\+]/g, '');
  }

  const cleanReceiverName = cleanString(receiver || 'LS GUARATO LTDA', 25);
  const cleanCityName = cleanString(city || 'SAO PAULO', 15);
  const cleanTxid = cleanString(txid || '***', 25) || '***';

  // Montagem da Merchant Account Information (ID 26) para o Banco Central (PIX)
  const gui = formatField('00', 'br.gov.bcb.pix');
  const keyField = formatField('01', cleanKey);
  const merchantAccountInfo = formatField('26', `${gui}${keyField}`);

  // Início do payload padrão EMV
  let payload = '000201'; // Payload Format Indicator
  payload += merchantAccountInfo;
  payload += formatField('52', '0000'); // Merchant Category Code
  payload += formatField('53', '986'); // Código da moeda BRL (986)

  // Se houver valor acima de zero, inclui o campo de valor (ID 54) com precisão de 2 casas decimais
  if (amount && amount > 0) {
    const amountStr = amount.toFixed(2);
    payload += formatField('54', amountStr);
  }

  payload += formatField('58', 'BR'); // Country Code
  payload += formatField('59', cleanReceiverName); // Nome do Recebedor
  payload += formatField('60', cleanCityName); // Cidade do Recebedor

  // Additional Data Field Template (ID 62)
  const txidField = formatField('05', cleanTxid);
  payload += formatField('62', txidField);

  // CRC16 Checksum (ID 63)
  payload += '6304';
  const crc = crc16Ccitt(payload);
  
  return `${payload}${crc}`;
}
