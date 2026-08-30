from ..schema_ingest.schemas import NormalizedRelationship, NormalizedTable, RelationshipDirection
from .schemas import BusinessTerm

_TYPE_DISPLAY = {
    "character varying": "VARCHAR",
    "timestamp without time zone": "TIMESTAMP",
    "timestamp with time zone": "TIMESTAMPTZ",
    "numeric": "DECIMAL",
    "double precision": "DOUBLE",
}


def type_display(data_type: str) -> str:
    base = data_type.split("(", 1)[0].strip().lower()
    if base in _TYPE_DISPLAY:
        return _TYPE_DISPLAY[base]
    return base.split(" ")[0].upper()


def _format_columns(columns: list[str]) -> str:
    if len(columns) == 1:
        return columns[0]
    return f"({', '.join(columns)})"


def _fk_line(rel: NormalizedRelationship, *, prefixed: bool) -> str:
    left = f"{rel.table}.{_format_columns(rel.columns)}" if prefixed else _format_columns(rel.columns)
    return f"{left} → {rel.referenced_table}.{_format_columns(rel.referenced_columns)}"


def _outgoing_fk_targets(table: NormalizedTable) -> dict[str, tuple[str, str]]:
    targets: dict[str, tuple[str, str]] = {}
    for rel in table.relationships:
        if rel.direction != RelationshipDirection.outgoing:
            continue
        for column, ref_column in zip(rel.columns, rel.referenced_columns, strict=True):
            targets[column] = (rel.referenced_table, ref_column)
    return targets


def render_columns_block(table: NormalizedTable) -> str:
    if not table.columns:
        return ""
    fk_targets = _outgoing_fk_targets(table)
    name_width = max(len(c.name) for c in table.columns) + 3
    type_width = max(len(type_display(c.data_type)) for c in table.columns) + 2

    lines = []
    for column in table.columns:
        if column.is_primary_key:
            annotation = "primary key"
        elif column.name in fk_targets:
            ref_table, ref_column = fk_targets[column.name]
            annotation = f"→ {ref_table}.{ref_column}"
        elif column.enum_values:
            annotation = " | ".join(column.enum_values)
        else:
            annotation = ""
        name = column.name.ljust(name_width)
        data_type = type_display(column.data_type).ljust(type_width)
        lines.append(f"{name}{data_type}{annotation}".rstrip())
    return "\n".join(lines)


def render_relationships_block(table: NormalizedTable) -> str:
    return "\n".join(_fk_line(rel, prefixed=True) for rel in table.relationships)


def render_constraints_block(table: NormalizedTable) -> str:
    lines = []
    primary_index = next((i for i in table.indexes if i.is_primary), None)
    pk_columns = (
        primary_index.columns
        if primary_index is not None
        else [
            c.name
            for c in sorted((c for c in table.columns if c.is_primary_key), key=lambda c: c.ordinal_position)
        ]
    )
    if pk_columns:
        lines.append(f"PK: {', '.join(pk_columns)}")

    for rel in table.relationships:
        if rel.direction != RelationshipDirection.outgoing:
            continue
        lines.append(f"FK: {_fk_line(rel, prefixed=False)}")
    return "\n".join(lines)


def render_indexes_block(table: NormalizedTable) -> str:
    return "\n".join(index.name for index in table.indexes if not index.is_primary)


def render_document(
    table: NormalizedTable,
    *,
    description: str,
    business_terms: list[BusinessTerm],
    example_questions: list[str],
) -> str:
    business_terms_block = "\n".join(" = ".join([term.term, *term.synonyms]) for term in business_terms)
    example_questions_block = "\n".join(f"- {q}" for q in example_questions)

    sections = [
        f"TABLE: {table.table}",
        f"DESCRIPTION:\n{description.strip()}",
        f"COLUMNS:\n{render_columns_block(table)}",
        f"RELATIONSHIPS:\n{render_relationships_block(table)}",
        f"BUSINESS TERMS:\n{business_terms_block}",
        f"CONSTRAINTS:\n{render_constraints_block(table)}",
        f"INDEXES:\n{render_indexes_block(table)}",
        f"EXAMPLE QUESTIONS:\n{example_questions_block}",
    ]
    return "\n\n".join(sections)
