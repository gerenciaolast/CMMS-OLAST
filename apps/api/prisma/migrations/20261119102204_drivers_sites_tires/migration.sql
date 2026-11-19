-- CreateEnum
CREATE TYPE "TireAxle" AS ENUM ('front', 'rear', 'spare');

-- CreateEnum
CREATE TYPE "TireChangeReason" AS ENUM ('wear', 'road_damage', 'theft', 'rotation', 'other', 'unknown');

-- CreateTable
CREATE TABLE "vehicle_drivers" (
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_drivers_pkey" PRIMARY KEY ("vehicle_id","driver_id")
);

-- CreateTable
CREATE TABLE "vehicle_site_log" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "reason" TEXT,
    "user_id" UUID,

    CONSTRAINT "vehicle_site_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_changes" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL,
    "odometer" INTEGER,
    "axle" "TireAxle" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "positions" TEXT[],
    "reason" "TireChangeReason" NOT NULL,
    "tire_size" TEXT,
    "tire_brand" TEXT,
    "unit_cost" DECIMAL(14,2),
    "total_cost" DECIMAL(14,2),
    "supplier" TEXT,
    "notes" TEXT,
    "work_order_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_drivers_driver_id_idx" ON "vehicle_drivers"("driver_id");

-- CreateIndex
CREATE INDEX "vehicle_site_log_vehicle_id_started_at_idx" ON "vehicle_site_log"("vehicle_id", "started_at");

-- CreateIndex
CREATE INDEX "tire_changes_vehicle_id_changed_at_idx" ON "tire_changes"("vehicle_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_organization_id_document_id_key" ON "drivers"("organization_id", "document_id");

-- AddForeignKey
ALTER TABLE "vehicle_drivers" ADD CONSTRAINT "vehicle_drivers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_drivers" ADD CONSTRAINT "vehicle_drivers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_site_log" ADD CONSTRAINT "vehicle_site_log_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_site_log" ADD CONSTRAINT "vehicle_site_log_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_changes" ADD CONSTRAINT "tire_changes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Migración de datos: conductor asignado → vehicle_drivers (como principal)
INSERT INTO "vehicle_drivers" ("vehicle_id", "driver_id", "is_primary")
SELECT "id", "assigned_driver_id", true FROM "vehicles" WHERE "assigned_driver_id" IS NOT NULL;

-- Migración de datos: sede actual como primer registro del historial de sedes
INSERT INTO "vehicle_site_log" ("id", "vehicle_id", "site_id", "started_at", "reason")
SELECT gen_random_uuid(), "id", "site_id", "created_at", 'Sede inicial' FROM "vehicles";

-- DropForeignKey
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_assigned_driver_id_fkey";
-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "assigned_driver_id";

