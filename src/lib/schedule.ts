/**
 * Timezone-aware check to see if current time is within official business/schedule hours.
 * Uses America/Sao_Paulo (Brazil GMT-3) as base timezone for calculations.
 */
export function isWithinBusinessHours(schedules: { start: string; end: string; days?: string[] }): boolean {
  if (!schedules || !schedules.start || !schedules.end) return true;

  try {
    const now = new Date();
    // Use a very specific formatter to get Brazil components
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false
    });
    
    const parts = fmt.formatToParts(now);
    const getValue = (name: string) => parts.find(p => p.type === name)?.value || "";
    
    const hour = parseInt(getValue('hour'), 10);
    const minute = parseInt(getValue('minute'), 10);
    const brWeekday = getValue('weekday').toLowerCase().replace('.', ''); // seg, ter, etc.
    
    // Normalize weekday (pt-BR format from Intl can vary slightly)
    const weekdayMap: Record<string, string> = {
      'seg': 'seg', 'segunda': 'seg', 'segunda-feira': 'seg',
      'ter': 'ter', 'terça': 'ter', 'terça-feira': 'ter',
      'qua': 'qua', 'quarta': 'qua', 'quarta-feira': 'qua',
      'qui': 'qui', 'quinta': 'qui', 'quinta-feira': 'qui',
      'sex': 'sex', 'sexta': 'sex', 'sexta-feira': 'sex',
      'sáb': 'sab', 'sab': 'sab', 'sábado': 'sab',
      'dom': 'dom', 'domingo': 'dom'
    };
    
    const cleanWeekday = weekdayMap[brWeekday] || brWeekday;

    const activeDays = schedules.days || ['seg', 'ter', 'qua', 'qui', 'sex'];
    if (!activeDays.includes(cleanWeekday)) {
      console.log(`[Schedule Check] Closed by day: ${cleanWeekday}. Allowed: ${activeDays.join(',')}`);
      return false;
    }

    const [startHour, startMin] = schedules.start.split(':').map(Number);
    const [endHour, endMin] = schedules.end.split(':').map(Number);

    const currentMinutes = hour * 60 + minute;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    const result = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    if (!result) {
      console.log(`[Schedule Check] Outside hours. Now: ${hour}:${minute} (${cleanWeekday}). Range: ${schedules.start}-${schedules.end}`);
    }
    return result;
  } catch (e) {
    console.error("Error evaluating business hours calculation:", e);
    return true; // Fallback
  }
}
