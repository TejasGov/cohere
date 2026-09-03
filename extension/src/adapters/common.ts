import { cleanText } from '@academic/core';

const months: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

const pad = (value: number): string => String(value).padStart(2, '0');

export function parseAcademicDate(value: string | null | undefined): string | undefined {
  const text = cleanText(value)?.replace(/^(?:due|available until)\s+/i, '');
  if (!text) return undefined;
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i.exec(text);
  if (!match) return undefined;
  const month = months[match[1]?.toLocaleLowerCase() ?? ''];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || !Number.isInteger(day) || day < 1 || day > 31) return undefined;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  if (!match[4]) return date;
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return undefined;
  if (match[6]?.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (match[6]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return `${date}T${pad(hour)}:${pad(minute)}:00`;
}

export function parseClockTime(value: string | null | undefined): string | undefined {
  const text = cleanText(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(text ?? '');
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${pad(hour)}:${pad(minute)}:00` : undefined;
}

export function parsePoints(value: string | null | undefined): number | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const match = /(\d+(?:\.\d+)?)\s*(?:points?|pts?)/i.exec(text);
  const points = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(points) && points >= 0 ? points : undefined;
}

export function directText(element: Element | null, selector: string): string | undefined {
  return cleanText(element?.querySelector(selector)?.textContent);
}
