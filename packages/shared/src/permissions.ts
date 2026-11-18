/** Permisos atómicos y roles (doc 06 §2). Los roles son agrupaciones editables; el código solo conoce permisos. */
export const PERMISSIONS = [
  'admin.settings',
  'catalog.manage',
  'user.manage',
  'site.manage',
  'vehicle.view',
  'vehicle.edit',
  'vehicle.change_status',
  'meter.record',
  'pm_plan.manage',
  'inspection.perform',
  'work_request.create',
  'work_request.review',
  'work_order.view',
  'work_order.plan',
  'work_order.execute',
  'work_order.close',
  'cost.view',
  'kpi.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = [
  'admin',
  'maintenance_manager',
  'planner',
  'workshop_supervisor',
  'technician',
  'driver',
  'management',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const DEFAULT_ROLES: Record<RoleCode, { name: string; global: boolean; permissions: Permission[] }> = {
  admin: {
    name: 'Administrador',
    global: true,
    permissions: ['admin.settings', 'catalog.manage', 'user.manage', 'site.manage', 'vehicle.view', 'vehicle.edit',
      'meter.record', 'work_request.create', 'work_order.view', 'cost.view', 'kpi.view'],
  },
  maintenance_manager: {
    name: 'Jefe de mantenimiento',
    global: true,
    permissions: ['catalog.manage', 'vehicle.view', 'vehicle.edit', 'vehicle.change_status', 'meter.record',
      'pm_plan.manage', 'work_request.create', 'work_request.review', 'work_order.view', 'work_order.plan',
      'work_order.execute', 'work_order.close', 'cost.view', 'kpi.view'],
  },
  planner: {
    name: 'Planificador',
    global: true,
    permissions: ['vehicle.view', 'vehicle.change_status', 'meter.record', 'pm_plan.manage', 'work_request.create',
      'work_request.review', 'work_order.view', 'work_order.plan', 'cost.view', 'kpi.view'],
  },
  workshop_supervisor: {
    name: 'Supervisor de taller',
    global: false,
    permissions: ['vehicle.view', 'vehicle.change_status', 'meter.record', 'inspection.perform', 'work_request.create',
      'work_request.review', 'work_order.view', 'work_order.plan', 'work_order.execute', 'work_order.close',
      'cost.view', 'kpi.view'],
  },
  technician: {
    name: 'Técnico',
    global: false,
    permissions: ['vehicle.view', 'meter.record', 'work_request.create', 'work_order.view', 'work_order.execute'],
  },
  driver: {
    name: 'Conductor',
    global: false,
    permissions: ['vehicle.view', 'meter.record', 'inspection.perform', 'work_request.create'],
  },
  management: {
    name: 'Gerencia (lectura)',
    global: true,
    permissions: ['vehicle.view', 'work_order.view', 'cost.view', 'kpi.view'],
  },
};
