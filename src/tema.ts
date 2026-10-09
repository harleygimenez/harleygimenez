export const cores = {
  primaria: '#1E3A5F',
  primariaClara: '#E8EEF6',
  destaque: '#B8892B',
  fundo: '#F4F6F9',
  superficie: '#FFFFFF',
  borda: '#E2E6EC',
  texto: '#18212E',
  textoSuave: '#5B6676',
  textoFraco: '#8A94A3',
  sucesso: '#15803D',
  sucessoClaro: '#E7F5EC',
  perigo: '#B91C1C',
  perigoClaro: '#FDECEC',
  alerta: '#B45309',
  alertaClaro: '#FEF3E2',
} as const;

export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const raio = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const sombra = {
  shadowColor: '#0B1A2E',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
