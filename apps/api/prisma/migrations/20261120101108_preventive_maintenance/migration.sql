-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "maintenance_plan_id" UUID;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "pm_routine_id" UUID;

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basis" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_routines" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interval_distance" INTEGER,
    "interval_hours" INTEGER,
    "interval_days" INTEGER,
    "tolerance_pct" DECIMAL(4,3) NOT NULL DEFAULT 0.10,
    "generate_at_pct" DECIMAL(4,3) NOT NULL DEFAULT 0.90,
    "includes" TEXT[],
    "estimated_hours" DECIMAL(6,2),
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pm_routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_routine_tasks" (
    "id" UUID NOT NULL,
    "routine_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "component_code" TEXT,
    "rationale" TEXT,

    CONSTRAINT "pm_routine_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_pm_schedules" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "routine_id" UUID NOT NULL,
    "last_done_at" TIMESTAMPTZ NOT NULL,
    "last_done_meter" INTEGER NOT NULL,
    "baseline_estimated" BOOLEAN NOT NULL DEFAULT true,
    "next_due_meter" INTEGER,
    "next_due_date" TIMESTAMPTZ,
    "projected_due_date" TIMESTAMPTZ,
    "pct_consumed" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "driving_dimension" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "open_work_order_id" UUID,
    "computed_at" TIMESTAMPTZ,

    CONSTRAINT "vehicle_pm_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_organization_id_code_key" ON "maintenance_plans"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pm_routines_plan_id_code_key" ON "pm_routines"("plan_id", "code");

-- CreateIndex
CREATE INDEX "vehicle_pm_schedules_status_idx" ON "vehicle_pm_schedules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_pm_schedules_vehicle_id_routine_id_key" ON "vehicle_pm_schedules"("vehicle_id", "routine_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_maintenance_plan_id_fkey" FOREIGN KEY ("maintenance_plan_id") REFERENCES "maintenance_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_pm_routine_id_fkey" FOREIGN KEY ("pm_routine_id") REFERENCES "pm_routines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_routines" ADD CONSTRAINT "pm_routines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "maintenance_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_routine_tasks" ADD CONSTRAINT "pm_routine_tasks_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "pm_routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_pm_schedules" ADD CONSTRAINT "vehicle_pm_schedules_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_pm_schedules" ADD CONSTRAINT "vehicle_pm_schedules_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "pm_routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
