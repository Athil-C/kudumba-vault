-- Kudumba Vault — Migration 0001: Multi-Tenant Row-Level Security (RLS) Policies
-- Ensures strict tenant isolation across all household and NRI tables in PostgreSQL / Supabase

ALTER TABLE "TenantMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PersonProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RenewalHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkerContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NriDocumentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KuriTracker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConstructionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DomesticHelper" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HelperSalaryEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WorkerContact" FORCE ROW LEVEL SECURITY;
ALTER TABLE "NriDocumentRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "KuriTracker" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ConstructionItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DomesticHelper" FORCE ROW LEVEL SECURITY;

-- Primary Tenant Isolation Policy
CREATE POLICY tenant_isolation_documents ON "Document"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- Private Document Visibility Enforcement (Shared vs Private)
CREATE POLICY document_visibility_policy ON "Document"
  USING (
    "visibility" = 'SHARED'
    OR "createdByUserId" = current_setting('app.current_user_id', true)
    OR current_setting('app.current_member_role', true) = 'OWNER'
  );

-- Apply Tenant Isolation Across Household Tables
CREATE POLICY tenant_isolation_people ON "PersonProfile"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_workers ON "WorkerContact"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_work_records ON "WorkRecord"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_nri_requests ON "NriDocumentRequest"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_kuri ON "KuriTracker"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_construction ON "ConstructionItem"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_helpers ON "DomesticHelper"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_helper_salary ON "HelperSalaryEntry"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_reminders ON "ReminderLog"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_audit ON "AuditLog"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));
