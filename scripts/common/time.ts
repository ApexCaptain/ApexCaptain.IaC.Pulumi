/**
 * KST(Asia/Seoul) 기준 `YYYY-MM-DD` 날짜 문자열.
 */
export const formatKstDate = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
