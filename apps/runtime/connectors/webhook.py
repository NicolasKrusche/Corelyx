"""Generic Webhook Trigger connector for inbound HTTP webhook processing.

This connector handles webhook payloads received via the inbound webhook API
route. It provides operations for:
  - receive: process and validate an inbound webhook payload
  - verify_signature: verify HMAC-SHA256 signatures against a stored secret
  - infer_schema: introspect a JSON payload and produce a JSON Schema summary

This is the runtime-side counterpart of the inbound webhook API route. The
route handles HTTP-level verification and dispatch; this connector provides
workflow-level operations that downstream nodes can use to inspect, validate,
and transform webhook data.

Internal-only operations (not exposed to Genesis):
  - verify_signature is intentionally omitted because HMAC verification
    happens at the API route layer before the runtime is invoked. Exposing
    it as a workflow node would be redundant and confusing.
  - infer_schema is omitted because it is a development/inspection tool,
    not a workflow building block.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from .base import ConnectorError
from .sdk.base import BaseConnector
from .sdk.types import FieldKind, FieldSchema, OperationSchema


class WebhookConnector(BaseConnector):
    provider = "webhook"
    supported_operations = [
        "receive",
        "verify_signature",
        "infer_schema",
    ]

    _operation_schemas = [
        OperationSchema(
            name="receive",
            description="Process and validate an inbound webhook payload",
            input_fields=[
                FieldSchema(name="payload", kind=FieldKind.OBJECT, required=True, description="Parsed JSON body"),
                FieldSchema(name="headers", kind=FieldKind.OBJECT, description="HTTP headers"),
                FieldSchema(name="method", kind=FieldKind.STRING, default="POST"),
                FieldSchema(name="source", kind=FieldKind.STRING, description="Originating service"),
            ],
            output_fields=[
                FieldSchema(name="_webhook", kind=FieldKind.OBJECT, description="Webhook metadata"),
            ],
        ),
        OperationSchema(
            name="verify_signature",
            description="Verify HMAC-SHA256 signature (internal, not exposed to Genesis)",
            input_fields=[
                FieldSchema(name="body", kind=FieldKind.STRING, required=True),
                FieldSchema(name="signature", kind=FieldKind.STRING, required=True),
                FieldSchema(name="secret", kind=FieldKind.STRING, required=True),
            ],
            output_fields=[
                FieldSchema(name="verified", kind=FieldKind.BOOLEAN),
                FieldSchema(name="reason", kind=FieldKind.STRING),
            ],
        ),
        OperationSchema(
            name="infer_schema",
            description="Infer JSON Schema from a webhook payload (internal, not exposed to Genesis)",
            input_fields=[
                FieldSchema(name="payload", kind=FieldKind.OBJECT, required=True),
                FieldSchema(name="depth", kind=FieldKind.INTEGER, default=5),
            ],
            output_fields=[
                FieldSchema(name="schema", kind=FieldKind.OBJECT),
                FieldSchema(name="fields", kind=FieldKind.ARRAY),
            ],
        ),
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        match operation:
            case "receive":
                return await self._receive(params)
            case "verify_signature":
                return await self._verify_signature(params)
            case "infer_schema":
                return await self._infer_schema(params)
            case _:
                raise ConnectorError(
                    "UNSUPPORTED_OPERATION",
                    f"Webhook connector does not support operation '{operation}'",
                )

    async def _receive(self, params: dict[str, Any]) -> dict[str, Any]:
        """Process an inbound webhook payload.

        Expected params:
          - payload (dict): The parsed JSON body of the webhook request.
          - headers (dict, optional): HTTP headers from the inbound request.
          - method (str, optional): HTTP method (GET, POST, PUT, etc.).
          - query_params (dict, optional): URL query parameters.
          - source (str, optional): Identifies the originating service.
          - timestamp (str, optional): ISO-8601 timestamp of receipt.

        Returns the payload along with metadata for downstream nodes.
        """
        payload = params.get("payload", {})
        if not isinstance(payload, dict):
            raise ConnectorError(
                "INVALID_PAYLOAD",
                "Webhook receive requires 'payload' to be a JSON object",
            )

        headers = params.get("headers", {})
        method = params.get("method", "POST").upper()
        query_params = params.get("query_params", {})
        source = params.get("source", "unknown")
        timestamp = params.get("timestamp", "")

        # Flatten the payload so downstream nodes can access top-level fields
        # directly via data['nX']['field_name'] without an extra lookup.
        result: dict[str, Any] = {
            **payload,
            "_webhook": {
                "method": method,
                "source": source,
                "timestamp": timestamp,
                "query_params": query_params,
                "content_type": headers.get("content-type", "application/json"),
                "field_count": len(payload),
            },
        }

        # If the payload contains a nested "data" or "body" key, promote it.
        # Many webhook providers wrap the actual payload in a wrapper object.
        for wrapper_key in ("data", "body", "event", "resource", "object"):
            if wrapper_key in payload and isinstance(payload[wrapper_key], dict):
                result[f"_raw_{wrapper_key}"] = payload[wrapper_key]

        return result

    async def _verify_signature(self, params: dict[str, Any]) -> dict[str, Any]:
        """Verify an HMAC-SHA256 signature against a webhook payload.

        Expected params:
          - body (str): The raw request body string.
          - signature (str): The signature value from the request header.
          - secret (str): The HMAC signing secret.
          - algorithm (str, optional): Defaults to "sha256".
          - signature_prefix (str, optional): Expected prefix before the hex
            digest, e.g. "sha256=" (GitHub), "v1=" (Stripe). Stripped before
            comparison if present. Defaults to "".
          - timestamp (str, optional): Timestamp value if the signature scheme
            includes one (e.g. "t=<ts>,v1=<sig>").
          - tolerance_seconds (int, optional): Maximum allowed age in seconds
            for timestamp-based signatures. Defaults to 300.

        Returns {verified: bool, reason: str}.
        """
        body = params.get("body", "")
        signature = params.get("signature", "")
        secret = params.get("secret", "")
        algorithm = params.get("algorithm", "sha256")
        signature_prefix = params.get("signature_prefix", "")
        timestamp = params.get("timestamp", "")
        tolerance_seconds = int(params.get("tolerance_seconds", 300))

        if not body:
            raise ConnectorError("MISSING_PARAM", "verify_signature requires 'body'")
        if not signature:
            raise ConnectorError("MISSING_PARAM", "verify_signature requires 'signature'")
        if not secret:
            raise ConnectorError("MISSING_PARAM", "verify_signature requires 'secret'")

        # Build the signing input
        if timestamp:
            signing_input = f"{timestamp}.{body}"
        else:
            signing_input = body

        # Compute expected HMAC
        if algorithm == "sha256":
            expected = hmac.new(
                secret.encode("utf-8"),
                signing_input.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
        elif algorithm == "sha1":
            expected = hmac.new(
                secret.encode("utf-8"),
                signing_input.encode("utf-8"),
                hashlib.sha1,
            ).hexdigest()
        else:
            raise ConnectorError(
                "UNSUPPORTED_ALGORITHM",
                f"verify_signature supports sha256 and sha1, got '{algorithm}'",
            )

        # Strip optional prefix from received signature
        received = signature
        if signature_prefix and received.startswith(signature_prefix):
            received = received[len(signature_prefix):]

        # Timing-safe comparison
        verified = hmac.compare_digest(expected, received)

        # Timestamp tolerance check (if applicable)
        reason = "ok" if verified else "signature_mismatch"
        if timestamp and verified:
            try:
                import time

                ts_value = float(timestamp)
                now = time.time()
                if abs(now - ts_value) > tolerance_seconds:
                    verified = False
                    reason = "timestamp_expired"
            except (ValueError, TypeError):
                verified = False
                reason = "invalid_timestamp"

        return {
            "verified": verified,
            "reason": reason,
            "algorithm": algorithm,
        }

    async def _infer_schema(self, params: dict[str, Any]) -> dict[str, Any]:
        """Infer a JSON Schema from a webhook payload.

        Expected params:
          - payload (dict): The JSON payload to introspect.
          - depth (int, optional): Maximum nesting depth. Defaults to 5.

        Returns a JSON Schema (draft-07 style) describing the payload structure.
        """
        payload = params.get("payload", {})
        if not isinstance(payload, dict):
            raise ConnectorError(
                "INVALID_PAYLOAD",
                "infer_schema requires 'payload' to be a JSON object",
            )

        max_depth = int(params.get("depth", 5))

        def _infer(value: Any, current_depth: int = 0) -> dict[str, Any]:
            if current_depth >= max_depth:
                return {"type": "object", "description": "nested object (depth limit)"}

            if value is None:
                return {"type": "null"}
            if isinstance(value, bool):
                return {"type": "boolean"}
            if isinstance(value, int):
                return {"type": "integer"}
            if isinstance(value, float):
                return {"type": "number"}
            if isinstance(value, str):
                # Heuristic: detect common formats
                lower = value.lower()
                if lower.endswith("z") or "+00:00" in value:
                    return {"type": "string", "format": "date-time"}
                if "@" in value and "." in value:
                    return {"type": "string", "format": "email"}
                if value.startswith("http://") or value.startswith("https://"):
                    return {"type": "string", "format": "uri"}
                return {"type": "string"}
            if isinstance(value, list):
                if not value:
                    return {"type": "array", "items": {}}
                # Infer from first few elements
                item_schemas = []
                for item in value[:5]:
                    item_schemas.append(_infer(item, current_depth + 1))
                # Merge: use the first item's schema if all are the same type
                if len(set(s.get("type") for s in item_schemas)) == 1:
                    return {"type": "array", "items": item_schemas[0]}
                return {"type": "array", "items": {"oneOf": item_schemas}}
            if isinstance(value, dict):
                properties = {}
                required = []
                for k, v in value.items():
                    properties[k] = _infer(v, current_depth + 1)
                    # Heuristic: fields named "id", "name", "email" etc. are
                    # likely required
                    required.append(k)
                return {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                }
            return {"type": "string"}

        schema = _infer(payload)
        schema["$schema"] = "https://json-schema.org/draft-07/schema#"

        # Collect all field paths for downstream convenience
        fields: list[str] = []

        def _collect_paths(obj: Any, prefix: str = "") -> None:
            if isinstance(obj, dict):
                if "properties" in obj:
                    for k, v in obj["properties"].items():
                        path = f"{prefix}.{k}" if prefix else k
                        fields.append(path)
                        _collect_paths(v, path)
                elif "items" in obj:
                    _collect_paths(obj["items"], f"{prefix}[]")

        _collect_paths(schema)

        return {
            "schema": schema,
            "fields": fields,
            "field_count": len(fields),
        }
