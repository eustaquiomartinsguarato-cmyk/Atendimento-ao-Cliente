/**
 * Utility to format and normalize Brazilian phone numbers.
 * Auto-corrects 8-digit mobile numbers by prepending the 9th digit '9' for visual display matching.
 */
export function formatBrazilianPhone(phone: string): string {
  if (!phone) return "";
  
  // Extract digits and remove domain suffix like @s.whatsapp.net or @lid
  let clean = phone.split('@')[0].replace(/\D/g, '');
  
  // If it starts with 55 (Brazil country code)
  if (clean.startsWith('55') && clean.length >= 10) {
    const ddi = '55';
    const ddd = clean.substring(2, 4);
    let numberPart = clean.substring(4);
    
    // Check if it's a mobile number and is missing the 9th digit (8 digits of line number, e.g. 97283342)
    // Most mobile numbers in Brazil have DDD between 11 and 99, and the first digit of the 8-digit number part is often >= 6 (formerly 7, 8, 9).
    if (numberPart.length === 8) {
      numberPart = '9' + numberPart;
    }
    
    if (numberPart.length === 9) {
      return `+${ddi} (${ddd}) ${numberPart.substring(0, 5)}-${numberPart.substring(5)}`;
    } else if (numberPart.length === 8) {
      return `+${ddi} (${ddd}) ${numberPart.substring(0, 4)}-${numberPart.substring(4)}`;
    }
  }
  
  // Fallback styling for 11 and 10 digit local phone numbers
  if (clean.length === 11) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`;
  } else if (clean.length === 10) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`;
  }
  
  return phone.split('@')[0];
}

/**
 * Decodes and formats a combined customer name that may contain raw credentials or a long LID,
 * returning a highly readable name + phone combination or just the name if the ID is a LID.
 */
export function renderCustomerDisplayName(name: string, phone: string): string {
  if (!name) return "Cliente sem nome";

  let baseName = name;
  let nestedId = "";

  // Check if name contains parentheses with a number inside (e.g., "Eustaquio (5534991234567)" or "Novo (128039750198@lid)")
  const parenMatch = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    baseName = parenMatch[1].trim();
    nestedId = parenMatch[2].trim();
  }

  // Target identifier
  const rawId = nestedId || phone || "";
  const cleanId = rawId.split('@')[0].replace(/\D/g, '');

  const isLid = rawId.includes('lid') || cleanId.length > 12;

  if (isLid) {
    // If it's a LID, don't show the confusing long digit ID next to the name, just show the base name
    return baseName;
  }

  // If we have a phone number, format it nicely
  const formatted = formatBrazilianPhone(cleanId || rawId);
  if (formatted && formatted !== (cleanId || rawId)) {
    return `${baseName} (${formatted})`;
  }

  return baseName;
}
