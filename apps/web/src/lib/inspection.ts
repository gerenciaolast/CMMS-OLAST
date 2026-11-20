export type InspectionResultKind = 'fit' | 'fit_with_observations' | 'unfit';
export type Answer = 'ok' | 'defect' | 'na';

export const RESULT_LABEL: Record<InspectionResultKind, string> = { fit: 'APTO', fit_with_observations: 'APTO CON OBSERVACIONES', unfit: 'NO APTO' };
export const RESULT_TONE: Record<InspectionResultKind, string> = {
  fit: 'border-ok/40 bg-ok/10 text-ok',
  fit_with_observations: 'border-warn/40 bg-warn/10 text-warn',
  unfit: 'border-danger bg-danger text-white',
};

export interface ChecklistItem { id: string; sequence: number; text: string; componentCode: string | null; isCritical: boolean; requiresPhotoOnFail: boolean }
export interface OpenDefect { itemId: string; comment: string | null; workRequest: { id: string; number: string; status: string; workOrder: { number: string } | null } | null }
export interface StartData {
  vehicle: { id: string; plate: string; status: string; currentOdometer: number | null; model: string };
  template: { id: string; name: string; items: ChecklistItem[] };
  openDefects: OpenDefect[];
}
export interface MyVehicle {
  id: string; plate: string; status: string; currentOdometer: number | null; site: { name: string };
  vehicleModel: { model: string; vehicleType: { code: string } };
  inspections: { id: string; result: InspectionResultKind; performedAt: string }[];
}
export interface SubmitResult { id: string; result: InspectionResultKind; resultLabel: string; createdRequests: string[]; linkedRequests: string[] }
export interface InspectionSummary { id: string; performedAt: string; result: InspectionResultKind; odometer: number; signatureName: string; results: { item: { text: string } }[] }
export interface DailyReport {
  day: string; expected: number; done: number; compliance: number | null;
  vehicles: { id: string; plate: string; status: string; site: { name: string }; inspections: { id: string; result: InspectionResultKind; performedAt: string; signatureName: string; odometer: number; results: { id: string }[] }[] }[];
}
export interface InspectionDetail {
  id: string; performedAt: string; result: InspectionResultKind; odometer: number; signatureName: string; durationSeconds: number | null;
  vehicle: { id: string; plate: string }; driver: { fullName: string } | null;
  results: { id: string; answer: Answer; comment: string | null; alreadyReported: boolean; item: ChecklistItem; photos: { id: string }[]; workRequest: { id: string; number: string; status: string; photos: { id: string }[] } | null }[];
}

export const time = (s: string) => new Date(s).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
