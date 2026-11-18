import type { Permission } from '@cmms/shared';
import { Activity, BookOpen, CalendarClock, ClipboardCheck, Gauge, Home, Truck, Wrench, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Sprint en que se habilita (doc 06 §3). null = disponible. */
  sprint: string | null;
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home, sprint: null },
  { href: '/vehiculos', label: 'Flota', icon: Truck, permission: 'vehicle.view', sprint: 'S1' },
  { href: '/ot', label: 'Órdenes de trabajo', icon: Wrench, permission: 'work_order.view', sprint: 'S2' },
  { href: '/preventivo', label: 'Preventivo', icon: CalendarClock, permission: 'pm_plan.manage', sprint: 'S3' },
  { href: '/inspeccion', label: 'Inspección diaria', icon: ClipboardCheck, permission: 'inspection.perform', sprint: 'S4' },
  { href: '/kpi', label: 'Indicadores', icon: Gauge, permission: 'kpi.view', sprint: 'S5' },
  { href: '/catalogos', label: 'Catálogos', icon: BookOpen, sprint: null },
  { href: '/confiabilidad', label: 'Confiabilidad', icon: Activity, permission: 'kpi.view', sprint: 'S5' },
];
