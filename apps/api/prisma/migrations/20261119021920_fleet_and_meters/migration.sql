-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('operational', 'operational_restricted', 'out_of_service_maintenance', 'out_of_service_parts', 'out_of_service_accident', 'out_of_service_administrative', 'reserve', 'retired');

-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('own', 'leasing', 'rental', 'third_party');

-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('odometer', 'hourmeter');

-- CreateEnum
CREATE TYPE "MeterSource" AS ENUM ('inspection', 'work_order', 'fuel', 'gps', 'manual', 'import');

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "fuel_type" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "document_id" TEXT,
    "phone" TEXT,
    "license_number" TEXT,
    "license_category" TEXT,
    "license_expiry" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "vehicle_model_id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "internal_code" TEXT,
    "vin" TEXT,
    "engine_number" TEXT,
    "year" INTEGER,
    "color" TEXT,
    "service_type" TEXT,
    "registration_city" TEXT,
    "ownership" "Ownership" NOT NULL DEFAULT 'own',
    "title_holder" TEXT,
    "load_capacity_kg" INTEGER,
    "criticality" CHAR(1),
    "criticality_score" JSONB,
    "status" "VehicleStatus" NOT NULL DEFAULT 'operational',
    "status_reason" TEXT,
    "current_odometer" INTEGER,
    "current_hourmeter" INTEGER,
    "odometer_offset" INTEGER NOT NULL DEFAULT 0,
    "last_reading_at" TIMESTAMPTZ,
    "acquisition_date" DATE,
    "acquisition_cost" DECIMAL(14,2),
    "in_service_date" DATE,
    "assigned_driver_id" UUID,
    "cost_center" TEXT,
    "notes" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "retired_at" DATE,
    "retirement_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_status_log" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "status" "VehicleStatus" NOT NULL,
    "reason" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "work_order_id" UUID,
    "user_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "vehicle_status_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "meter_type" "MeterType" NOT NULL DEFAULT 'odometer',
    "value" INTEGER NOT NULL,
    "accumulated_value" INTEGER NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL,
    "source" "MeterSource" NOT NULL DEFAULT 'manual',
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_replacements" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "meter_type" "MeterType" NOT NULL DEFAULT 'odometer',
    "old_final_value" INTEGER NOT NULL,
    "new_initial_value" INTEGER NOT NULL,
    "replaced_at" TIMESTAMPTZ NOT NULL,
    "reason" TEXT NOT NULL,
    "user_id" UUID,

    CONSTRAINT "meter_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_documents" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "document_type_id" UUID NOT NULL,
    "number" TEXT,
    "issuer" TEXT,
    "issued_at" DATE,
    "expires_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_make_model_key" ON "vehicle_models"("make", "model");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE INDEX "vehicles_site_id_status_idx" ON "vehicles"("site_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organization_id_plate_key" ON "vehicles"("organization_id", "plate");

-- CreateIndex
CREATE INDEX "vehicle_status_log_vehicle_id_started_at_idx" ON "vehicle_status_log"("vehicle_id", "started_at");

-- CreateIndex
CREATE INDEX "meter_readings_vehicle_id_meter_type_read_at_idx" ON "meter_readings"("vehicle_id", "meter_type", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_documents_vehicle_id_document_type_id_key" ON "vehicle_documents"("vehicle_id", "document_type_id");

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_model_id_fkey" FOREIGN KEY ("vehicle_model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_log" ADD CONSTRAINT "vehicle_status_log_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_replacements" ADD CONSTRAINT "meter_replacements_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
