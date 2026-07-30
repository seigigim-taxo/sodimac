export interface Evento {
    id: number;
    agendaId: number | null;
    sucursalId: number;
    nombre: string;
    fechaProgramada: string;
    fechaEjecucion: string | null;
    estado: 'ABIERTO' | 'CERRADO' | 'EN_PROCESO' | 'CANCELADO' | 'EN_ANALISIS' | 'RECONTEO';
    fechaRegistro: string;
}
