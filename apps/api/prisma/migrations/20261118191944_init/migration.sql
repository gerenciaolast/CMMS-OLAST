-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "country_code" CHAR(2) NOT NULL DEFAULT 'CO',
    "currency" CHAR(3) NOT NULL DEFAULT 'COP',
    "distance_unit" TEXT NOT NULL DEFAULT 'km',
    "volume_unit" TEXT NOT NULL DEFAULT 'gal',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sites" (
    "user_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,

    CONSTRAINT "user_sites_pkey" PRIMARY KEY ("user_id","site_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" UUID,
    "user_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "parent_id" UUID,
    "vmrs_code" TEXT,
    "match_pattern" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "component_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_modes" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "failure_modes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "failure_causes" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "failure_causes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "repair_actions" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "repair_actions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "hold_reasons" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hold_reasons_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "work_order_types" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_planned" BOOLEAN NOT NULL,
    "requires_failure_coding" BOOLEAN NOT NULL,
    "description" TEXT,

    CONSTRAINT "work_order_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "priorities" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_response_hours" INTEGER NOT NULL,
    "target_resolution_hours" INTEGER NOT NULL,

    CONSTRAINT "priorities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primary_meter" TEXT NOT NULL DEFAULT 'odometer',
    "max_daily_usage" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_blocking" BOOLEAN NOT NULL DEFAULT false,
    "alert_days" INTEGER[] DEFAULT ARRAY[30, 15, 7]::INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'pre_trip',
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "checklist_template_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "component_code" TEXT,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "requires_photo_on_fail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_organization_id_code_key" ON "sites"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_code_key" ON "roles"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "component_codes_code_key" ON "component_codes"("code");

-- CreateIndex
CREATE INDEX "component_codes_parent_id_idx" ON "component_codes"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_code_key" ON "vehicle_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_vehicle_type_id_kind_version_key" ON "checklist_templates"("vehicle_type_id", "kind", "version");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_codes" ADD CONSTRAINT "component_codes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "component_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_template_id_fkey" FOREIGN KEY ("checklist_template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
