"""Turns a raw schema snapshot into schema_objects' per-table shape.

Pure/synchronous: no DB or network access, so it's trivial to unit test and
safe to call speculatively (e.g. for a preview) without side effects.
"""

from ..schema_explorer.schemas import SchemaForeignKey, SchemaTable
from .schemas import NormalizedRelationship, NormalizedTable, RelationshipDirection


def _relationship(
    fk: SchemaForeignKey, *, table: str, direction: RelationshipDirection
) -> NormalizedRelationship:
    return NormalizedRelationship(
        direction=direction,
        constraint_name=fk.constraint_name,
        table=table,
        columns=fk.columns,
        referenced_table=fk.referenced_table,
        referenced_columns=fk.referenced_columns,
        on_update=fk.on_update,
        on_delete=fk.on_delete,
    )


def normalize_tables(tables: list[SchemaTable]) -> list[NormalizedTable]:
    incoming: dict[str, list[NormalizedRelationship]] = {}
    for source in tables:
        for fk in source.foreign_keys:
            incoming.setdefault(fk.referenced_table, []).append(
                _relationship(fk, table=source.name, direction=RelationshipDirection.incoming)
            )

    return [
        NormalizedTable(
            table=source.name,
            columns=source.columns,
            relationships=[
                _relationship(fk, table=source.name, direction=RelationshipDirection.outgoing)
                for fk in source.foreign_keys
            ]
            + incoming.get(source.name, []),
            indexes=source.indexes,
        )
        for source in tables
    ]
