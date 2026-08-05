export interface Evento {
    id: number;
    agendaId: number | null;
    sucursalId: number;
    nombre: string;
    fechaProgramada: string;
    fechaEjecucion: string | null;
    estado: 'ABIERTO' | 'EN_ANALISIS' | 'RECONTEO' | 'CERRADO';
    fechaRegistro: string;
}
