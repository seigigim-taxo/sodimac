export interface Evento {
    id: number;
    agendaId: number | null;
    sucursalId: number;
    operadorId: number;
    folio: string | null;
    fechaProgramada: string;
    fechaEjecucion: string | null;
    estado: 'ABIERTO' | 'CERRADO' | 'EN_PROCESO' | 'CANCELADO';
    fechaRegistro: string;
}