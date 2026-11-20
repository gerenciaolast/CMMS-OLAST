import { Prisma } from '@prisma/client';
import { formatDocumentNumber } from '@cmms/domain';

/** Siguiente número correlativo sin huecos (bloqueo de fila en la misma transacción). */
export async function nextDocumentNumber(tx: Prisma.TransactionClient, organizationId: string, series: 'AV' | 'OT', at = new Date()) {
  const year = at.getUTCFullYear();
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO counters (organization_id, series, year, value) VALUES (${organizationId}::uuid, ${series}, ${year}, 1)
    ON CONFLICT (organization_id, series, year) DO UPDATE SET value = counters.value + 1
    RETURNING value`;
  return formatDocumentNumber(series, year, Number(rows[0]!.value));
}
