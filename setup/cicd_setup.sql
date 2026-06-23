-- ============================================================================
-- cicd_setup.sql
-- Creates the CI/CD service user, role, and grants for OIDC-based deployments.
--
-- Run once with ACCOUNTADMIN to set up the CI/CD infrastructure.
-- This script sets up BOTH GitHub Actions AND Azure DevOps service users.
--
-- Placeholders:
--   {{GITHUB_REPO}}     — e.g. jar-ry/Snowflake_AgentOps_Framework
--   {{PROD_DATABASE}}   — e.g. BABY_MART_PROD
--   {{DEV_DATABASE}}    — e.g. BABY_MART_DEMO
--   {{SV_SCHEMA}}       — e.g. ANALYTICS
--   {{AGENT_SCHEMA}}    — e.g. AI
--   {{FRAMEWORK_DB}}    — e.g. BABY_MART_DEMO
--   {{FRAMEWORK_SCHEMA}}— e.g. AGENTOPS
--   {{WAREHOUSE}}       — e.g. RETAIL_AI_EVAL_WH
--   {{AZURE_TENANT_ID}} — Azure AD tenant ID (for Azure DevOps only)
--   {{ADO_ORG}}         — Azure DevOps org name (for Azure DevOps only)
--   {{ADO_PROJECT}}     — Azure DevOps project name (for Azure DevOps only)
--   {{ADO_SERVICE_CONN}}— Azure DevOps service connection name
-- ============================================================================

USE ROLE ACCOUNTADMIN;

-- ============================================================================
-- 1. Create the deployment role
-- ============================================================================

CREATE ROLE IF NOT EXISTS CICD_DEPLOY_ROLE
  COMMENT = 'Role for CI/CD pipelines to deploy semantic views and agents';

-- ============================================================================
-- 2. Create prod database (if it doesn't exist)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS {{PROD_DATABASE}};
CREATE SCHEMA IF NOT EXISTS {{PROD_DATABASE}}.{{SV_SCHEMA}};
CREATE SCHEMA IF NOT EXISTS {{PROD_DATABASE}}.{{AGENT_SCHEMA}};

-- ============================================================================
-- 3. Grant permissions to CICD_DEPLOY_ROLE
-- ============================================================================

-- Prod database: full deploy permissions
GRANT USAGE ON DATABASE {{PROD_DATABASE}} TO ROLE CICD_DEPLOY_ROLE;
GRANT USAGE ON SCHEMA {{PROD_DATABASE}}.{{SV_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;
GRANT USAGE ON SCHEMA {{PROD_DATABASE}}.{{AGENT_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;
GRANT CREATE SEMANTIC VIEW ON SCHEMA {{PROD_DATABASE}}.{{SV_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;
GRANT CREATE AGENT ON SCHEMA {{PROD_DATABASE}}.{{AGENT_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;

-- Dev database: read access for evaluations (eval scripts query dev objects)
GRANT USAGE ON DATABASE {{DEV_DATABASE}} TO ROLE CICD_DEPLOY_ROLE;
GRANT USAGE ON SCHEMA {{DEV_DATABASE}}.{{SV_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;
GRANT USAGE ON SCHEMA {{DEV_DATABASE}}.{{AGENT_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;
GRANT USAGE ON AGENT {{DEV_DATABASE}}.{{AGENT_SCHEMA}}.* TO ROLE CICD_DEPLOY_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA {{DEV_DATABASE}}.{{SV_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;

-- Framework schema: record eval results
GRANT USAGE ON DATABASE {{FRAMEWORK_DB}} TO ROLE CICD_DEPLOY_ROLE;
GRANT USAGE ON SCHEMA {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;
GRANT INSERT ON ALL TABLES IN SCHEMA {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}} TO ROLE CICD_DEPLOY_ROLE;

-- Warehouse usage
GRANT USAGE ON WAREHOUSE {{WAREHOUSE}} TO ROLE CICD_DEPLOY_ROLE;
GRANT OPERATE ON WAREHOUSE {{WAREHOUSE}} TO ROLE CICD_DEPLOY_ROLE;

-- Cortex AI functions (needed for evaluations)
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE CICD_DEPLOY_ROLE;

-- ============================================================================
-- 4. GitHub Actions service user (OIDC)
-- ============================================================================

CREATE USER IF NOT EXISTS github_cicd_user
  TYPE = SERVICE
  DEFAULT_ROLE = CICD_DEPLOY_ROLE
  DEFAULT_WAREHOUSE = {{WAREHOUSE}}
  COMMENT = 'CI/CD service user for GitHub Actions (OIDC auth)'
  WORKLOAD_IDENTITY = (
    TYPE = OIDC
    ISSUER = 'https://token.actions.githubusercontent.com'
    -- CD: Only main branch can deploy to prod
    SUBJECT = 'repo:{{GITHUB_REPO}}:ref:refs/heads/main'
  );

GRANT ROLE CICD_DEPLOY_ROLE TO USER github_cicd_user;

-- ============================================================================
-- 5. Azure DevOps service user (OIDC) — OPTIONAL
--    Uncomment if using Azure DevOps.
-- ============================================================================

-- CREATE USER IF NOT EXISTS ado_cicd_user
--   TYPE = SERVICE
--   DEFAULT_ROLE = CICD_DEPLOY_ROLE
--   DEFAULT_WAREHOUSE = {{WAREHOUSE}}
--   COMMENT = 'CI/CD service user for Azure DevOps (OIDC auth)'
--   WORKLOAD_IDENTITY = (
--     TYPE = OIDC
--     ISSUER = 'https://vstoken.dev.azure.com/{{AZURE_TENANT_ID}}'
--     SUBJECT = 'sc://{{ADO_ORG}}/{{ADO_PROJECT}}/{{ADO_SERVICE_CONN}}'
--     OIDC_AUDIENCE_LIST = ('api://AzureADTokenExchange')
--   );
--
-- GRANT ROLE CICD_DEPLOY_ROLE TO USER ado_cicd_user;

-- ============================================================================
-- 6. Verify setup
-- ============================================================================

SHOW GRANTS TO ROLE CICD_DEPLOY_ROLE;
SHOW USERS LIKE 'github_cicd_user';
