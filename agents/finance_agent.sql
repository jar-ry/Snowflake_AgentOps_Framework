-- Agent DDL reconstructed from DESCRIBE AGENT output via bootstrap-from-existing
-- Source object: FINANCE_AI_DEV.SEMANTIC.FINANCE_AGENT
-- GET_DDL does not support AGENT; spec below is the agent_spec column rendered as YAML.

CREATE OR REPLACE AGENT FINANCE_AI_DEV.SEMANTIC.FINANCE_AGENT
  COMMENT = ''
  SPEC = $$
models:
  orchestration: auto
orchestration: {}
tools:
- tool_spec:
    type: cortex_analyst_text_to_sql
    name: finance-analytics-assistant
    description: 'You are a finance analytics assistant. Answer questions about customers, accounts, transactions, portfolios, and risk assessments using the provided semantic view.


      Rules:

      - Only answer questions related to the finance data available to you

      - Never execute destructive operations (DROP, DELETE, TRUNCATE, ALTER)

      - If a question is out of scope, politely explain what topics you can help with

      - Format numeric values with appropriate precision (2 decimal places for currency)

      - When showing results, include relevant context and explain what the numbers mean

      '
skills: []
tool_resources:
  finance-analytics-assistant:
    execution_environment:
      type: warehouse
      warehouse: ''
    semantic_view: FINANCE_AI_DEV.SEMANTIC.FINANCE_ANALYTICS_SV
$$;
