"""
Convert a semantic view YAML definition to Snowflake CREATE SEMANTIC VIEW DDL.

Usage:
    python semantic_views/generate_ddl.py semantic_views/category_intelligence_view.yaml

Outputs the DDL to stdout (pipe to a file or use in CI for deployment).
"""

import sys
import yaml


def yaml_to_ddl(yaml_path: str) -> str:
    with open(yaml_path) as f:
        sv = yaml.safe_load(f)

    fqn = sv["fqn"]
    lines = [f"CREATE OR REPLACE SEMANTIC VIEW {fqn}"]

    # Tables
    table_lines = []
    for t in sv["tables"]:
        table_lines.append(f"    {t['alias']} AS {t['source']}")
    lines.append("  TABLES (")
    lines.append(",\n".join(table_lines))
    lines.append("  )")

    # Dimensions
    dim_lines = []
    for d in sv["dimensions"]:
        comment = d["comment"].replace("'", "''")
        dim_lines.append(f"    {d['table']}.{d['column']} AS {d['column']} COMMENT='{comment}'")
    lines.append("  DIMENSIONS (")
    lines.append(",\n".join(dim_lines))
    lines.append("  )")

    # Verified queries
    if sv.get("verified_queries"):
        vq_lines = []
        for vq in sv["verified_queries"]:
            question = vq["question"].replace("'", "''")
            sql = vq["sql"].strip().replace("'", "''")
            verified_by = vq.get("verified_by", "Unknown")
            verified_at = vq.get("verified_at", 0)
            onboarding = str(vq.get("onboarding_question", False)).upper()
            vq_block = (
                f'    "{vq["question"]}" AS (\n'
                f"      QUESTION '{question}'\n"
                f"      VERIFIED_AT {verified_at}\n"
                f"      VERIFIED_BY '{verified_by}'\n"
                f"      ONBOARDING_QUESTION {onboarding}\n"
                f"      SQL '{sql}'\n"
                f"    )"
            )
            vq_lines.append(vq_block)
        lines.append("  AI_VERIFIED_QUERIES (")
        lines.append(",\n".join(vq_lines))
        lines.append("  )")

    return "\n".join(lines) + ";\n"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_ddl.py <path_to_yaml>", file=sys.stderr)
        sys.exit(1)

    ddl = yaml_to_ddl(sys.argv[1])
    print(ddl)
