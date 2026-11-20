-- CreateEnum
CREATE TYPE "WorkRequestStatus" AS ENUM ('new', 'in_review', 'approved', 'rejected', 'merged');

-- CreateEnum
CREATE TYPE "CanOperate" AS ENUM ('yes', 'restricted', 'no');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('planned', 'scheduled', 'in_progress', 'on_hold', 'completed', 'closed', 'cancelled');

-- CreateTable
CREATE TABLE "counters" (
    "organization_id" UUID NOT NULL,
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("organization_id","series","year")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'workshop',
    "city" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "site_id" UUID,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'N2',
    "hourly_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UND',
    "reference_cost" DECIMAL(14,2),
    "component_code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'driver',
    "description" TEXT NOT NULL,
    "system_code" TEXT,
    "can_operate" "CanOperate" NOT NULL DEFAULT 'yes',
    "consequence" TEXT,
    "priority" TEXT,
    "status" "WorkRequestStatus" NOT NULL DEFAULT 'new',
    "rejection_reason" TEXT,
    "odometer" INTEGER,
    "work_order_id" UUID,
    "reported_by_id" UUID,
    "reported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,

    CONSTRAINT "work_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'P3',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'planned',
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "description" TEXT NOT NULL,
    "workshop_type" TEXT NOT NULL DEFAULT 'external',
    "supplier_id" UUID,
    "odometer_in" INTEGER,
    "odometer_out" INTEGER,
    "planned_start" TIMESTAMPTZ,
    "planned_end" TIMESTAMPTZ,
    "estimated_hours" DECIMAL(8,2),
    "actual_start" TIMESTAMPTZ,
    "actual_end" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "closed_by_id" UUID,
    "created_by_id" UUID,
    "is_rework" BOOLEAN NOT NULL DEFAULT false,
    "rework_of_id" UUID,
    "labor_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "parts_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "external_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cancel_reason" TEXT,
    "completion_notes" TEXT,
    "is_historical" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_tasks" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "not_done_reason" TEXT,
    "comment" TEXT,

    CONSTRAINT "work_order_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_labor" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "hourly_cost" DECIMAL(14,2) NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "comment" TEXT,

    CONSTRAINT "work_order_labor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_parts" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "part_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "total_cost" DECIMAL(14,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'direct_purchase',

    CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_external_services" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "supplier_id" UUID,
    "description" TEXT NOT NULL,
    "invoice_number" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "work_order_external_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_holds" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "work_order_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_records" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "component_code" TEXT NOT NULL,
    "failure_mode" TEXT,
    "cause" TEXT,
    "action" TEXT,
    "comment" TEXT,

    CONSTRAINT "failure_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_events" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "comment" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "work_request_id" UUID,
    "work_order_id" UUID,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_name_key" ON "suppliers"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_user_id_key" ON "technicians"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parts_organization_id_code_key" ON "parts"("organization_id", "code");

-- CreateIndex
CREATE INDEX "work_requests_status_reported_at_idx" ON "work_requests"("status", "reported_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_requests_organization_id_number_key" ON "work_requests"("organization_id", "number");

-- CreateIndex
CREATE INDEX "work_orders_vehicle_id_status_idx" ON "work_orders"("vehicle_id", "status");

-- CreateIndex
CREATE INDEX "work_orders_status_priority_idx" ON "work_orders"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_organization_id_number_key" ON "work_orders"("organization_id", "number");

-- CreateIndex
CREATE INDEX "failure_records_component_code_idx" ON "failure_records"("component_code");

-- CreateIndex
CREATE INDEX "work_order_events_work_order_id_created_at_idx" ON "work_order_events"("work_order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- AddForeignKey
ALTER TABLE "tire_changes" ADD CONSTRAINT "tire_changes_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_rework_of_id_fkey" FOREIGN KEY ("rework_of_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_labor" ADD CONSTRAINT "work_order_labor_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_labor" ADD CONSTRAINT "work_order_labor_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_external_services" ADD CONSTRAINT "work_order_external_services_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_external_services" ADD CONSTRAINT "work_order_external_services_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_holds" ADD CONSTRAINT "work_order_holds_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_records" ADD CONSTRAINT "failure_records_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_request_id_fkey" FOREIGN KEY ("work_request_id") REFERENCES "work_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
