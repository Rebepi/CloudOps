export const usd = (valor: number) =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: valor > 0 && valor < 0.01 ? 6 : 2,
  }).format(valor);

export const numero = (valor: number) =>
  new Intl.NumberFormat('es-PE').format(valor);

export const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(iso));
