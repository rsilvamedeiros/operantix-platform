"""DynamoDB key design for execution events: one partition per execution, ordered by sequence."""


def event_item_keys(organization_id: str, execution_id: str, sequence: int) -> dict[str, str]:
    # Zero-padded so lexicographic order equals numeric order.
    return {"pk": f"T#{organization_id}#E#{execution_id}", "sk": f"{sequence:012d}"}


def timeline_query_keys(organization_id: str, execution_id: str) -> dict[str, str]:
    return {"pk": f"T#{organization_id}#E#{execution_id}"}
