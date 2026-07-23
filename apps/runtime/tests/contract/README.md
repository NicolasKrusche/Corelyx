# Connector Contract Tests

Custom Pact-like contract testing framework for Corelyx connectors. Validates that connector implementations satisfy expected operation contracts (input schemas, output schemas, required fields) defined in JSON files.

## Quick Start

```bash
cd apps/runtime

# Run all contract tests
python -m pytest tests/contract/ -v

# Run the standalone contract runner (human-readable output)
python -m tests.contract.test_contracts

# Run tests for a specific connector
python -m pytest tests/contract/test_connectors.py -k gmail -v

# Run tests for a specific operation
python -m pytest tests/contract/test_connectors.py -k send_email -v

# Run contract JSON validation only
python -m pytest tests/contract/test_connectors.py::test_contract_json_valid -v
```

## Architecture

```
tests/contract/
├── __init__.py          # Package marker
├── base.py              # Contract framework: loading, validation, reporting
├── test_contracts.py    # Standalone runner with human-readable reports
├── test_connectors.py   # Parametrized pytest tests (one per operation)
├── README.md            # This file
└── contracts/           # Contract JSON definitions
    ├── gmail.json
    ├── slack.json
    ├── notion.json
    ├── github.json
    ├── sheets.json
    ├── postgresql.json
    ├── redis.json
    └── http_generic.json
```

## Contract JSON Format

Each contract file defines the expected shape of a connector's operations:

```json
{
  "provider": "gmail",
  "description": "Gmail connector contract",
  "operations": [
    {
      "name": "send_email",
      "input_fields": [
        {"name": "to", "type": "string", "required": true},
        {"name": "subject", "type": "string", "required": false},
        {"name": "body", "type": "string", "required": false}
      ],
      "output_fields": [
        {"name": "message_id", "type": "string", "required": false},
        {"name": "thread_id", "type": "string", "required": false}
      ],
      "required_input_fields": ["to"],
      "optional_input_fields": ["subject", "body"]
    }
  ]
}
```

### Field Types

| Type     | Description                |
|----------|----------------------------|
| `string` | Text values                |
| `integer`| Whole numbers              |
| `float`  | Decimal numbers            |
| `boolean`| True/false                 |
| `object` | Nested dictionaries        |
| `array`  | Lists                      |
| `file`   | File uploads/references    |

## What Gets Validated

For each operation in each contract:

1. **Operation existence** — The operation exists in the connector's `_operation_schemas`
2. **Input field presence** — All contract input fields exist in the connector schema
3. **Output field presence** — All contract output fields exist in the connector schema
4. **Type matching** — Field types match between contract and connector
5. **Required flags** — Required/optional field flags match
6. **Schema completeness** — Operations in contracts have schema entries in connectors

## CI Integration

### GitHub Actions

Add this to your CI workflow (`.github/workflows/ci.yml`):

```yaml
- name: Run connector contract tests
  run: |
    cd apps/runtime
    source venv/bin/activate
    python -m pytest tests/contract/ -v --tb=short
```

### Exit Codes

- `0` — All contracts pass
- `1` — One or more contract violations detected

### Example Output

```
======================================================================
  Provider: gmail  |  Connector: GmailConnector  |  ✅ PASS
  Operations: 9/9 passed
======================================================================
  ✅ list_emails
  ✅ list_threads
  ✅ search
  ✅ read_email
  ✅ send_email
  ✅ delete_email
  ✅ get_attachment
  ✅ archive_email
  ✅ label_email

======================================================================
  SUMMARY: 50/50 operations passed  |  All passed ✅
  Exit code: 0
======================================================================
```

## Adding New Connectors

1. Create a contract JSON file in `contracts/<provider>.json`
2. Implement the connector in `connectors/<provider>.py` with `_operation_schemas`
3. Run `pytest tests/contract/ -k <provider> -v` to validate

## Design Decisions

- **No external Pact dependency** — Custom JSON-based format avoids `pact-python` installation
- **Schema-based validation** — Uses `_operation_schemas` (OperationSchema) from the connector SDK
- **Graceful degradation** — Connectors without schemas still get operation-existence checks
- **Warning vs Error** — Type mismatches produce warnings; missing fields produce errors
- **CI-friendly** — Exit code 1 on failure, pytest-compatible output
