-- Semantic view DDL pulled from Snowflake via bootstrap-from-existing
-- Source object: FINANCE_AI_DEV.SEMANTIC.FINANCE_ANALYTICS_SV
-- Note: GET_DDL emits an unqualified name; create within FINANCE_AI_DEV.SEMANTIC.

create or replace semantic view FINANCE_ANALYTICS_SV
	tables (
		FINANCE_AI_DEV.ANALYTICS.ACCOUNTS primary key (ACCOUNT_ID) comment='The table contains records of individual bank accounts linked to customers. Each record captures account classification, financial details such as balance, credit limit, and interest rate, as well as the account''s lifecycle status and the channel through which it was opened.',
		FINANCE_AI_DEV.ANALYTICS.CUSTOMERS primary key (CUSTOMER_ID) comment='The table contains records of individual customers, including their personal and financial profiles. Each record captures identifying information, geographic location, and financial attributes such as credit score and annual income, along with customer segmentation and account status.',
		FINANCE_AI_DEV.ANALYTICS.PORTFOLIOS primary key (PORTFOLIO_ID) comment='The table contains records of investment portfolios associated with individual customers. Each record captures the portfolio''s strategy, asset class, and financial performance metrics including total value, cost basis, unrealized profit and loss, and year-to-date returns, as well as risk tolerance and status details.',
		FINANCE_AI_DEV.ANALYTICS.RISK_ASSESSMENTS primary key (ASSESSMENT_ID) comment='The table contains records of risk assessments conducted on customers and their accounts. Each record captures a specific risk finding, categorized by type (such as credit, market, fraud, or compliance) and includes scoring, severity level, and recommended actions. Records also reflect the assessment methodology used and the lifecycle status of each finding, from assessment through resolution.',
		FINANCE_AI_DEV.ANALYTICS.TRANSACTIONS primary key (TRANSACTION_ID) comment='The table contains records of financial transactions associated with accounts. Each record captures details about the transaction type, direction, amount, currency, and timing, along with categorization, the channel through which it was made, and whether it has been flagged for review.'
	)
	relationships (
		ACCOUNTS_TO_CUSTOMERS as ACCOUNTS(CUSTOMER_ID) references CUSTOMERS(CUSTOMER_ID),
		PORTFOLIOS_TO_CUSTOMERS as PORTFOLIOS(CUSTOMER_ID) references CUSTOMERS(CUSTOMER_ID),
		RISK_ASSESSMENTS_TO_ACCOUNTS as RISK_ASSESSMENTS(ACCOUNT_ID) references ACCOUNTS(ACCOUNT_ID),
		RISK_ASSESSMENTS_TO_CUSTOMERS as RISK_ASSESSMENTS(CUSTOMER_ID) references CUSTOMERS(CUSTOMER_ID),
		TRANSACTIONS_TO_ACCOUNTS as TRANSACTIONS(ACCOUNT_ID) references ACCOUNTS(ACCOUNT_ID)
	)
	facts (
		ACCOUNTS.BALANCE as BALANCE comment='The current monetary balance associated with an account.' sample_values ('95421.78', '4026.26', '48916.14'),
		ACCOUNTS.CREDIT_LIMIT as CREDIT_LIMIT comment='The maximum amount of credit extended to an account holder.' sample_values ('313291.96', '451385.65', '75457.17'),
		ACCOUNTS.INTEREST_RATE as INTEREST_RATE comment='The interest rate associated with the account expressed as a percentage.' sample_values ('1.04', '6.42', '6.36'),
		CUSTOMERS.ANNUAL_INCOME as ANNUAL_INCOME comment='The annual income of a customer measured in monetary units.' sample_values ('22714.00', '15278.33', '36881.13'),
		PORTFOLIOS.COST_BASIS as COST_BASIS comment='The total original cost basis of a portfolio, used to calculate gains or losses.' sample_values ('81208.53', '70322.93', '5180.41'),
		PORTFOLIOS.TOTAL_VALUE as TOTAL_VALUE comment='The total monetary value of a portfolio.' sample_values ('649208.49', '15388.41', '561094.43'),
		PORTFOLIOS.UNREALIZED_PNL as UNREALIZED_PNL comment='The unrealized profit and loss for each portfolio position reflecting gains or losses that have not yet been realized through a transaction.' sample_values ('288173.74', '462183.47', '-40001.87'),
		PORTFOLIOS.YTD_RETURN_PCT as YTD_RETURN_PCT comment='The year-to-date return percentage for each portfolio.' sample_values ('5.66', '-5.54', '5.65'),
		RISK_ASSESSMENTS.RISK_SCORE as RISK_SCORE comment='A numerical score representing the level of risk assessed.' sample_values ('52.41', '55.02', '43.75'),
		TRANSACTIONS.AMOUNT as AMOUNT comment='The monetary amount associated with a transaction.' sample_values ('37045.15', '33519.65', '49923.42')
	)
	dimensions (
		ACCOUNTS.ACCOUNT_ID as ACCOUNT_ID comment='Unique numeric identifier for an account.' sample_values ('64', '156', '179'),
		ACCOUNTS.ACCOUNT_NUMBER as ACCOUNT_NUMBER comment='Unique identifier assigned to each account.' sample_values ('ACC-00000069', 'ACC-00000013', 'ACC-00000001'),
		ACCOUNTS.ACCOUNT_STATUS as ACCOUNT_STATUS comment='The current status of an account.' sample_values ('Open', 'Dormant', 'Closed'),
		ACCOUNTS.ACCOUNT_TYPE as ACCOUNT_TYPE comment='The type of financial account.' sample_values ('Savings', 'Retirement', 'Investment'),
		ACCOUNTS.CHANNEL as CHANNEL comment='The channel through which an account was opened or is managed.' sample_values ('Downtown Branch', 'Online', 'Mobile'),
		ACCOUNTS.CURRENCY as CURRENCY comment='The currency associated with the account.' sample_values ('EUR', 'GBP', 'USD'),
		ACCOUNTS.CUSTOMER_ID as CUSTOMER_ID comment='Unique numerical identifier assigned to each customer.' sample_values ('1407', '1728', '201'),
		ACCOUNTS.CLOSED_DATE as CLOSED_DATE comment='The date on which an account was closed.' sample_values ('2026-05-01', '2025-10-13', '2025-07-15'),
		ACCOUNTS.OPENED_DATE as OPENED_DATE comment='The date on which the account was opened.' sample_values ('2020-06-11', '2023-07-05', '2024-04-18'),
		CUSTOMERS.CITY as CITY comment='The city associated with the customer.' sample_values ('London', 'Singapore', 'Hong Kong'),
		CUSTOMERS.COUNTRY_CODE as COUNTRY_CODE comment='Two-letter country codes identifying the country associated with each customer.' sample_values ('UK', 'DE', 'CA'),
		CUSTOMERS.CREDIT_SCORE as CREDIT_SCORE comment='The credit score associated with a customer.' sample_values ('699', '693', '742'),
		CUSTOMERS.CUSTOMER_CODE as CUSTOMER_CODE comment='Unique identifier code assigned to each customer.' sample_values ('CUST-000094', 'CUST-000137', 'CUST-000150'),
		CUSTOMERS.CUSTOMER_ID as CUSTOMER_ID comment='Unique identifier assigned to each customer.' sample_values ('3', '57', '94'),
		CUSTOMERS.CUSTOMER_SEGMENT as CUSTOMER_SEGMENT comment='The classification of customers into distinct segments based on their profile or relationship type.' sample_values ('High Net Worth', 'Corporate', 'Institutional'),
		CUSTOMERS.EMAIL as EMAIL comment='Email address associated with the customer.' sample_values ('elizabeth.moore131@example.com', 'maria.davis1@example.com', 'jessica.lee35@example.com'),
		CUSTOMERS.FIRST_NAME as FIRST_NAME comment='The first name of a customer.' sample_values ('Maria', 'Robert', 'Linda'),
		CUSTOMERS.LAST_NAME as LAST_NAME comment='The last name of the customer.' sample_values ('Williams', 'Anderson', 'Perez'),
		CUSTOMERS.STATUS as STATUS comment='The current activity status of a customer.' sample_values ('Inactive', 'Active'),
		CUSTOMERS.ONBOARDING_DATE as ONBOARDING_DATE comment='The date on which a customer was onboarded.' sample_values ('2024-05-26', '2025-08-21', '2020-05-09'),
		PORTFOLIOS.ASSET_CLASS as ASSET_CLASS comment='The broad category of asset class associated with a portfolio.' sample_values ('Alternatives', 'Fixed Income', 'Mixed'),
		PORTFOLIOS.CUSTOMER_ID as CUSTOMER_ID comment='Unique identifier assigned to each customer.' sample_values ('120', '644', '503'),
		PORTFOLIOS.PORTFOLIO_CODE as PORTFOLIO_CODE comment='Unique identifier code assigned to each portfolio.' sample_values ('PF-000001', 'PF-000101', 'PF-000103'),
		PORTFOLIOS.PORTFOLIO_ID as PORTFOLIO_ID comment='Unique numeric identifier for a portfolio.' sample_values ('3', '34', '2'),
		PORTFOLIOS.RISK_TOLERANCE as RISK_TOLERANCE comment='The level of risk tolerance associated with a portfolio.' sample_values ('High', 'Low', 'Medium'),
		PORTFOLIOS.STATUS as STATUS comment='The current operational state of a portfolio.' sample_values ('Rebalancing', 'Active'),
		PORTFOLIOS.STRATEGY as STRATEGY comment='The investment strategy classification assigned to a portfolio.' sample_values ('Balanced', 'Income', 'Aggressive'),
		PORTFOLIOS.INCEPTION_DATE as INCEPTION_DATE comment='The date on which a portfolio was officially established or initiated.' sample_values ('2022-12-22', '2025-09-16', '2026-05-10'),
		PORTFOLIOS.LAST_REBALANCE_DATE as LAST_REBALANCE_DATE comment='The date on which a portfolio was last rebalanced.' sample_values ('2026-05-23', '2026-05-30', '2026-06-03'),
		RISK_ASSESSMENTS.ACCOUNT_ID as ACCOUNT_ID comment='The unique identifier assigned to each account in the risk assessment records.' sample_values ('3760', '691', '2499'),
		RISK_ASSESSMENTS.ASSESSMENT_ID as ASSESSMENT_ID comment='Unique identifier for each risk assessment record.' sample_values ('92', '2', '172'),
		RISK_ASSESSMENTS.ASSESSMENT_METHOD as ASSESSMENT_METHOD comment='The method used to perform the risk assessment.' sample_values ('ML Model', 'Analyst Review', 'Automated'),
		RISK_ASSESSMENTS.CUSTOMER_ID as CUSTOMER_ID comment='Unique identifier assigned to each customer in a risk assessment.' sample_values ('1222', '797', '74'),
		RISK_ASSESSMENTS.FINDING as FINDING comment='A brief description of a specific risk-related observation or anomaly identified during the assessment process.' sample_values ('Credit limit utilization exceeded threshold', 'Cross-border transaction volume anomaly', 'Multiple failed authentication attempts'),
		RISK_ASSESSMENTS.RECOMMENDED_ACTION as RECOMMENDED_ACTION comment='The recommended action to be taken in response to a risk assessment outcome.' sample_values ('Escalate to compliance', 'Require additional verification', 'Restrict account activity'),
		RISK_ASSESSMENTS.RISK_LEVEL as RISK_LEVEL comment='The assessed level of risk associated with a given assessment record.' sample_values ('Critical', 'High', 'Low'),
		RISK_ASSESSMENTS.RISK_TYPE as RISK_TYPE comment='The category of risk being assessed.' sample_values ('Market Risk', 'Fraud Risk', 'Operational Risk'),
		RISK_ASSESSMENTS.STATUS as STATUS comment='The current status of the risk assessment.' sample_values ('Under Review', 'Closed', 'Mitigated'),
		RISK_ASSESSMENTS.ASSESSMENT_DATE as ASSESSMENT_DATE comment='The date on which a risk assessment was conducted.' sample_values ('2025-08-24', '2025-10-20', '2026-02-07'),
		RISK_ASSESSMENTS.RESOLUTION_DATE as RESOLUTION_DATE comment='The date by which a risk assessment is expected to be or has been resolved.' sample_values ('2026-04-15', '2026-05-18'),
		TRANSACTIONS.ACCOUNT_ID as ACCOUNT_ID comment='The unique identifier associated with an account involved in a transaction.' sample_values ('2671', '2910', '3014'),
		TRANSACTIONS.CATEGORY as CATEGORY comment='The category or classification of a financial transaction.' sample_values ('Rent/Mortgage', 'Groceries', 'Miscellaneous'),
		TRANSACTIONS.CHANNEL as CHANNEL comment='The channel or medium through which a financial transaction was initiated or processed.' sample_values ('Branch', 'Mobile App', 'ATM'),
		TRANSACTIONS.CURRENCY as CURRENCY comment='The currency associated with the transaction.' sample_values ('GBP', 'EUR', 'USD'),
		TRANSACTIONS.DIRECTION as DIRECTION comment='The direction of a financial transaction indicating whether money is moving into or out of an account.' sample_values ('Debit', 'Credit'),
		TRANSACTIONS.IS_FLAGGED as IS_FLAGGED comment='Indicates whether a transaction has been flagged.' sample_values ('TRUE', 'FALSE'),
		TRANSACTIONS.STATUS as STATUS comment='The current status of a transaction.' sample_values ('Reversed', 'Failed', 'Pending'),
		TRANSACTIONS.TRANSACTION_ID as TRANSACTION_ID comment='Unique identifier assigned to each financial transaction.' sample_values ('3', '9', '28'),
		TRANSACTIONS.TRANSACTION_REF as TRANSACTION_REF comment='Unique reference identifier assigned to each transaction.' sample_values ('TXN-0000000069', 'TXN-0000000017', 'TXN-0000000197'),
		TRANSACTIONS.TRANSACTION_TYPE as TRANSACTION_TYPE comment='The category or classification of a financial transaction.' sample_values ('Withdrawal', 'Payment', 'Transfer'),
		TRANSACTIONS.TRANSACTION_TIMESTAMP as TRANSACTION_TIMESTAMP comment='The date and time at which a transaction occurred.' sample_values ('2026-05-29T15:08:54.517Z', '2026-04-09T09:31:46.517Z', '2025-09-21T17:28:03.517Z')
	)
	with extension (CA='{"tables":[{"name":"ACCOUNTS","dimensions":[{"name":"ACCOUNT_ID"},{"name":"ACCOUNT_NUMBER"},{"name":"ACCOUNT_STATUS"},{"name":"ACCOUNT_TYPE"},{"name":"CHANNEL"},{"name":"CURRENCY"},{"name":"CUSTOMER_ID"}],"facts":[{"name":"BALANCE"},{"name":"CREDIT_LIMIT"},{"name":"INTEREST_RATE"}],"time_dimensions":[{"name":"CLOSED_DATE"},{"name":"OPENED_DATE"}],"foreign_keys":[{"fkey_columns":["CUSTOMER_ID"],"pkey_table":{"database":"FINANCE_AI_DEV","schema":"ANALYTICS","table":"CUSTOMERS"},"pkey_columns":["CUSTOMER_ID"]}]},{"name":"CUSTOMERS","dimensions":[{"name":"CITY"},{"name":"COUNTRY_CODE"},{"name":"CREDIT_SCORE"},{"name":"CUSTOMER_CODE"},{"name":"CUSTOMER_ID"},{"name":"CUSTOMER_SEGMENT"},{"name":"EMAIL"},{"name":"FIRST_NAME"},{"name":"LAST_NAME"},{"name":"STATUS"}],"facts":[{"name":"ANNUAL_INCOME"}],"time_dimensions":[{"name":"ONBOARDING_DATE"}]},{"name":"PORTFOLIOS","dimensions":[{"name":"ASSET_CLASS"},{"name":"CUSTOMER_ID"},{"name":"PORTFOLIO_CODE"},{"name":"PORTFOLIO_ID"},{"name":"RISK_TOLERANCE"},{"name":"STATUS"},{"name":"STRATEGY"}],"facts":[{"name":"COST_BASIS"},{"name":"TOTAL_VALUE"},{"name":"UNREALIZED_PNL"},{"name":"YTD_RETURN_PCT"}],"time_dimensions":[{"name":"INCEPTION_DATE"},{"name":"LAST_REBALANCE_DATE"}],"foreign_keys":[{"fkey_columns":["CUSTOMER_ID"],"pkey_table":{"database":"FINANCE_AI_DEV","schema":"ANALYTICS","table":"CUSTOMERS"},"pkey_columns":["CUSTOMER_ID"]}]},{"name":"RISK_ASSESSMENTS","dimensions":[{"name":"ACCOUNT_ID"},{"name":"ASSESSMENT_ID"},{"name":"ASSESSMENT_METHOD"},{"name":"CUSTOMER_ID"},{"name":"FINDING"},{"name":"RECOMMENDED_ACTION"},{"name":"RISK_LEVEL"},{"name":"RISK_TYPE"},{"name":"STATUS"}],"facts":[{"name":"RISK_SCORE"}],"time_dimensions":[{"name":"ASSESSMENT_DATE"},{"name":"RESOLUTION_DATE"}],"foreign_keys":[{"fkey_columns":["ACCOUNT_ID"],"pkey_table":{"database":"FINANCE_AI_DEV","schema":"ANALYTICS","table":"ACCOUNTS"},"pkey_columns":["ACCOUNT_ID"]},{"fkey_columns":["CUSTOMER_ID"],"pkey_table":{"database":"FINANCE_AI_DEV","schema":"ANALYTICS","table":"CUSTOMERS"},"pkey_columns":["CUSTOMER_ID"]}]},{"name":"TRANSACTIONS","dimensions":[{"name":"ACCOUNT_ID"},{"name":"CATEGORY"},{"name":"CHANNEL"},{"name":"CURRENCY"},{"name":"DIRECTION"},{"name":"IS_FLAGGED"},{"name":"STATUS"},{"name":"TRANSACTION_ID"},{"name":"TRANSACTION_REF"},{"name":"TRANSACTION_TYPE"}],"facts":[{"name":"AMOUNT"}],"time_dimensions":[{"name":"TRANSACTION_TIMESTAMP"}],"foreign_keys":[{"fkey_columns":["ACCOUNT_ID"],"pkey_table":{"database":"FINANCE_AI_DEV","schema":"ANALYTICS","table":"ACCOUNTS"},"pkey_columns":["ACCOUNT_ID"]}]}],"relationships":[{"name":"ACCOUNTS_TO_CUSTOMERS","relationship_type":"many_to_one","join_type":"inner"},{"name":"PORTFOLIOS_TO_CUSTOMERS","relationship_type":"many_to_one","join_type":"inner"},{"name":"RISK_ASSESSMENTS_TO_ACCOUNTS","relationship_type":"many_to_one","join_type":"inner"},{"name":"RISK_ASSESSMENTS_TO_CUSTOMERS","relationship_type":"many_to_one","join_type":"inner"},{"name":"TRANSACTIONS_TO_ACCOUNTS","relationship_type":"many_to_one","join_type":"inner"}]}');
