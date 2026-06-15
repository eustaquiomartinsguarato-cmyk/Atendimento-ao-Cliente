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
    
    // Use english short weekday format to maps deterministically across any platform ICU implementation
    const enFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short'
    });
    const enWeekday = enFmt.format(now); // 'Sun', 'Mon', 'Tue', ..., 'Sat'
    
    const weekdayMap: Record<string, string> = {
      'Mon': 'seg',
      'Tue': 'ter',
      'Wed': 'qua',
      'Thu': 'qui',
      'Fri': 'sex',
      'Sat': 'sab',
      'Sun': 'dom'
    };
    
    const cleanWeekday = weekdayMap[enWeekday] || 'seg';

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
