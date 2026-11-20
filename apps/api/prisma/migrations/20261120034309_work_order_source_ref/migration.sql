-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "source_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_source_ref_key" ON "work_orders"("source_ref");

