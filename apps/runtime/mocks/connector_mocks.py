"""Mock connector responses for simulation/dry-run mode."""

from __future__ import annotations

import json
import time
from typing import Any


MOCK_RESPONSES: dict[str, dict[str, dict[str, Any]]] = {
    "gmail": {
        "list_emails": {
            "emails": [
                {
                    "id": "mock_email_1",
                    "threadId": "mock_thread_1",
                    "subject": "Test Email 1",
                    "from": "sender@example.com",
                    "received_at": "2026-01-15T10:30:00Z",
                    "preview": "This is a test email preview...",
                    "is_read": False,
                },
                {
                    "id": "mock_email_2",
                    "threadId": "mock_thread_2",
                    "subject": "Test Email 2",
                    "from": "another@example.com",
                    "received_at": "2026-01-15T11:00:00Z",
                    "preview": "Another test email...",
                    "is_read": True,
                },
            ]
        },
        "read_email": {
            "id": "mock_email_1",
            "threadId": "mock_thread_1",
            "subject": "Test Email 1",
            "from": "sender@example.com",
            "to": ["recipient@example.com"],
            "body": "This is the full body of the test email.",
            "body_type": "text",
            "labels": ["INBOX", "UNREAD"],
            "attachments": [],
        },
        "send_email": {
            "id": "mock_sent_1",
            "threadId": "mock_thread_sent",
            "labelIds": ["SENT"],
        },
        "search": {
            "emails": [
                {
                    "id": "mock_search_1",
                    "threadId": "mock_thread_search",
                    "subject": "Search Result Email",
                    "from": "search@example.com",
                    "received_at": "2026-01-15T09:00:00Z",
                    "preview": "Search result preview...",
                    "is_read": False,
                }
            ]
        },
    },
    "slack": {
        "send_message": {"ts": "1705312800.123456", "channel": "C1234567890", "message": {"text": "Message sent successfully"}},
        "list_channels": {
            "channels": [
                {"id": "C1234567890", "name": "general", "is_channel": True},
                {"id": "C0987654321", "name": "random", "is_channel": True},
                {"id": "C1111111111", "name": "dev-team", "is_channel": True},
            ]
        },
        "read_channel": {
            "messages": [
                {
                    "ts": "1705312800.123456",
                    "user": "U1234567890",
                    "text": "Hello team!",
                    "type": "message",
                },
                {
                    "ts": "1705312860.654321",
                    "user": "U0987654321",
                    "text": "Hi there!",
                    "type": "message",
                },
            ]
        },
        "create_channel": {"id": "C9999999999", "name": "new-channel", "is_channel": True, "created": 1705312800},
    },
    "notion": {
        "create_database_entry": {
            "id": "mock_page_1",
            "url": "https://notion.so/mock_page_1",
            "created_time": "2026-01-15T10:30:00.000Z",
            "properties": {},
        },
        "create_page": {
            "id": "mock_page_2",
            "url": "https://notion.so/mock_page_2",
            "created_time": "2026-01-15T10:30:00.000Z",
        },
        "query_database": {
            "results": [
                {
                    "id": "mock_result_1",
                    "properties": {
                        "Title": {"title": [{"text": {"content": "Test Task"}}]},
                        "Status": {"select": {"name": "In Progress"}},
                    },
                }
            ],
            "has_more": False,
        },
        "read_page": {
            "id": "mock_page_1",
            "properties": {
                "Title": {"title": [{"text": {"content": "Test Page"}}]},
                "Content": {"rich_text": [{"text": {"content": "Page content here"}}]},
            },
            "url": "https://notion.so/mock_page_1",
        },
    },
    "github": {
        "create_issue": {
            "number": 42,
            "url": "https://github.com/owner/repo/issues/42",
            "title": "Test Issue",
            "state": "open",
        },
        "comment_on_issue": {"id": 12345, "url": "https://github.com/owner/repo/issues/42#issuecomment-12345", "body": "Test comment"},
        "list_prs": {
            "pull_requests": [
                {
                    "number": 1,
                    "title": "Feature PR",
                    "state": "open",
                    "url": "https://github.com/owner/repo/pull/1",
                }
            ]
        },
        "get_pr_diff": {"diff": "diff --git a/file.py b/file.py\n+added line", "files_changed": 1, "additions": 1, "deletions": 0},
        "push_file": {"content": {"sha": "abc123", "size": 100}, "commit": {"sha": "def456"}},
    },
    "sheets": {
        "read_range": {
            "range": "Sheet1!A1:C3",
            "majorDimension": "ROWS",
            "values": [["Header1", "Header2", "Header3"], ["Row1Col1", "Row1Col2", "Row1Col3"], ["Row2Col1", "Row2Col2", "Row2Col3"]],
        },
        "write_range": {"spreadsheetId": "mock_sheet_id", "updatedRange": "Sheet1!A1", "updatedRows": 1, "updatedColumns": 3, "updatedCells": 3},
        "append_row": {"spreadsheetId": "mock_sheet_id", "updatedRange": "Sheet1!A4:C4", "updatedRows": 1, "updatedColumns": 3, "updatedCells": 3},
        "list_sheets": {"sheets": [{"properties": {"sheetId": 0, "title": "Sheet1"}}, {"properties": {"sheetId": 1, "title": "Sheet2"}}]},
        "create_sheet": {"spreadsheetId": "mock_sheet_id", "replies": [{"addSheet": {"properties": {"sheetId": 2, "title": "NewSheet"}}}]},
        "clear_range": {"spreadsheetId": "mock_sheet_id", "clearedRange": "Sheet1!A1:C3"},
    },
    "airtable": {
        "list_records": {
            "records": [
                {"id": "rec123", "fields": {"Name": "Record 1", "Status": "Active", "Created": "2026-01-15"}},
                {"id": "rec456", "fields": {"Name": "Record 2", "Status": "Pending", "Created": "2026-01-14"}},
            ]
        },
        "get_record": {"id": "rec123", "fields": {"Name": "Record 1", "Status": "Active", "Created": "2026-01-15"}},
        "create_record": {"id": "rec789", "fields": {"Name": "New Record", "Status": "Draft", "Created": "2026-01-15"}},
        "update_record": {"id": "rec123", "fields": {"Name": "Updated Record", "Status": "Complete", "Created": "2026-01-15"}},
        "delete_record": {"id": "rec123", "deleted": True},
    },
    "http_generic": {
        "request": {
            "status_code": 200,
            "headers": {"content-type": "application/json"},
            "data": {"mock": True, "message": "HTTP Generic mock response", "timestamp": "2026-01-15T10:30:00Z"},
        }
    },
    "postgresql": {
        "connect": {"connected": True, "connection_id": "mock_conn_123"},
        "query": {
            "rows": [
                {"id": 1, "name": "Test Row 1", "value": "data1"},
                {"id": 2, "name": "Test Row 2", "value": "data2"},
            ],
            "row_count": 2,
            "columns": ["id", "name", "value"],
        },
        "execute": {"rows_affected": 1, "last_row_id": 3},
        "list_tables": {"tables": ["users", "orders", "products", "categories"]},
        "describe_table": {
            "table_name": "users",
            "columns": [
                {"name": "id", "type": "integer", "nullable": False, "primary_key": True},
                {"name": "name", "type": "text", "nullable": False, "primary_key": False},
                {"name": "email", "type": "text", "nullable": True, "primary_key": False},
                {"name": "created_at", "type": "timestamp", "nullable": False, "primary_key": False},
            ],
        },
    },
    "redis": {
        "get": {"value": "mock_value_123", "exists": True},
        "set": {"ok": True, "key": "mock_key", "value": "mock_value_123"},
        "delete": {"deleted": 1, "key": "mock_key"},
        "exists": {"exists": 1, "key": "mock_key"},
        "incr": {"value": 42, "key": "counter"},
        "lpush": {"length": 3, "key": "mock_list"},
        "rpush": {"length": 3, "key": "mock_list"},
        "lrange": {"values": ["item1", "item2", "item3"], "key": "mock_list"},
    },
    "linear": {
        "list_issues": {
            "issues": [
                {"id": "issue_1", "title": "Bug: Login fails", "state": {"name": "In Progress"}, "priority": 1},
                {"id": "issue_2", "title": "Feature: Dark mode", "state": {"name": "Backlog"}, "priority": 3},
            ]
        },
        "create_issue": {"success": True, "issue": {"id": "issue_3", "title": "New Issue", "url": "https://linear.app/team/issue/issue_3", "state": {"name": "Backlog"}}},
        "update_issue": {"success": True, "issue": {"id": "issue_1", "title": "Bug: Login fails (FIXED)", "url": "https://linear.app/team/issue/issue_1", "state": {"name": "Done"}}},
        "list_projects": {"projects": [{"id": "proj_1", "name": "Website Redesign", "state": "active"}, {"id": "proj_2", "name": "Mobile App", "state": "planned"}]},
        "get_issue": {"issue": {"id": "issue_1", "title": "Bug: Login fails", "description": "Users cannot log in", "url": "https://linear.app/team/issue/issue_1", "state": {"name": "In Progress"}, "priority": 1}},
    },
    "jira": {
        "list_issues": {
            "issues": [
                {"key": "PROJ-123", "fields": {"summary": "Jira Issue 1", "status": {"name": "In Progress"}, "issuetype": {"name": "Bug"}}},
                {"key": "PROJ-124", "fields": {"summary": "Jira Issue 2", "status": {"name": "To Do"}, "issuetype": {"name": "Task"}}},
            ]
        },
        "create_issue": {"id": "PROJ-125", "key": "PROJ-125", "self": "https://jira.example.com/rest/api/2/issue/PROJ-125"},
        "update_issue": {"id": "PROJ-123", "key": "PROJ-123", "self": "https://jira.example.com/rest/api/2/issue/PROJ-123"},
        "get_issue": {"id": "PROJ-123", "key": "PROJ-123", "fields": {"summary": "Jira Issue 1", "status": {"name": "In Progress"}, "description": "Issue description"}},
        "list_projects": {"values": [{"id": "10000", "key": "PROJ", "name": "Project One"}, {"id": "10001", "key": "PROJ2", "name": "Project Two"}]},
        "add_comment": {"id": "10000", "self": "https://jira.example.com/rest/api/2/issue/PROJ-123/comment/10000", "body": "Test comment"},
    },
    "hubspot": {
        "list_contacts": {
            "contacts": [
                {"id": "1", "properties": {"email": "contact1@example.com", "firstname": "John", "lastname": "Doe"}},
                {"id": "2", "properties": {"email": "contact2@example.com", "firstname": "Jane", "lastname": "Smith"}},
            ]
        },
        "get_contact": {"id": "1", "properties": {"email": "contact1@example.com", "firstname": "John", "lastname": "Doe"}},
        "create_contact": {"id": "3", "properties": {"email": "new@example.com", "firstname": "New", "lastname": "Contact"}},
        "update_contact": {"id": "1", "properties": {"email": "updated@example.com", "firstname": "Updated", "lastname": "Name"}},
        "list_deals": {
            "deals": [
                {"id": "deal_1", "properties": {"dealname": "Deal 1", "amount": "10000", "dealstage": "appointmentscheduled"}},
                {"id": "deal_2", "properties": {"dealname": "Deal 2", "amount": "5000", "dealstage": "qualifiedtobuy"}},
            ]
        },
        "create_deal": {"id": "deal_3", "properties": {"dealname": "New Deal", "amount": "7500", "dealstage": "appointmentscheduled"}},
        "update_deal": {"id": "deal_1", "properties": {"dealname": "Updated Deal", "amount": "12000", "dealstage": "presentationscheduled"}},
    },
    "typeform": {
        "list_forms": {"forms": [{"id": "form_1", "title": "Feedback Form", "last_updated_at": "2026-01-15T10:00:00Z"}, {"id": "form_2", "title": "Contact Form", "last_updated_at": "2026-01-14T15:00:00Z"}]},
        "get_form": {"id": "form_1", "title": "Feedback Form", "fields": [{"id": "field_1", "title": "Name", "type": "short_text"}, {"id": "field_2", "title": "Email", "type": "email"}]},
        "get_responses": {"responses": [{"response_id": "resp_1", "submitted_at": "2026-01-15T10:30:00Z", "answers": {"field_1": "John Doe", "field_2": "john@example.com"}}]},
    },
    "calendar": {
        "list_events": {"events": [{"id": "evt_1", "summary": "Team Meeting", "start": {"dateTime": "2026-01-15T10:00:00Z"}, "end": {"dateTime": "2026-01-15T11:00:00Z"}}, {"id": "evt_2", "summary": "Client Call", "start": {"dateTime": "2026-01-15T14:00:00Z"}, "end": {"dateTime": "2026-01-15T15:00:00Z"}}]},
        "create_event": {"id": "evt_3", "htmlLink": "https://calendar.google.com/event?eid=evt_3", "summary": "New Event"},
        "update_event": {"id": "evt_1", "htmlLink": "https://calendar.google.com/event?eid=evt_1", "summary": "Updated Meeting"},
        "delete_event": {"id": "evt_1", "deleted": True},
    },
    "drive": {
        "list_files": {"files": [{"id": "file_1", "name": "Document.pdf", "mimeType": "application/pdf", "size": "1024000", "modifiedTime": "2026-01-15T10:00:00Z"}]},
        "get_file": {"id": "file_1", "name": "Document.pdf", "mimeType": "application/pdf", "size": "1024000", "webViewLink": "https://drive.google.com/file/d/file_1/view"},
        "upload_file": {"id": "file_2", "name": "New Document.pdf", "mimeType": "application/pdf", "webViewLink": "https://drive.google.com/file/d/file_2/view"},
        "create_folder": {"id": "folder_1", "name": "New Folder"},
        "move_file": {"id": "file_1", "name": "Document.pdf", "moved": True, "parents": ["folder_1"]},
        "share_file": {"id": "file_1", "permissionId": "perm_1", "role": "reader", "emailAddress": "shared@example.com"},
        "delete_file": {"id": "file_1", "deleted": True},
    },
    "docs": {
        "read_document": {"documentId": "doc_1", "title": "Test Document", "body": {"content": "Document content here"}},
        "create_document": {"documentId": "doc_2", "title": "New Document"},
        "append_text": {"documentId": "doc_1", "appended": True},
        "replace_text": {"documentId": "doc_1", "occurrencesReplaced": 2},
    },
    "asana": {
        "list_projects": {"projects": [{"gid": "proj_1", "name": "Project 1", "color": "blue"}, {"gid": "proj_2", "name": "Project 2", "color": "green"}]},
        "list_tasks": {"tasks": [{"gid": "task_1", "name": "Task 1", "completed": False, "due_on": "2026-01-20"}, {"gid": "task_2", "name": "Task 2", "completed": True, "due_on": "2026-01-10"}]},
        "create_task": {"gid": "task_3", "name": "New Task", "completed": False},
        "update_task": {"gid": "task_1", "name": "Updated Task 1", "completed": True},
        "complete_task": {"gid": "task_1", "completed": True},
        "get_task": {"gid": "task_1", "name": "Task 1", "completed": False, "notes": "Task details", "due_on": "2026-01-20"},
    },
    "outlook": {
        "list_emails": {"emails": [{"id": "msg_1", "subject": "Outlook Email 1", "from": {"emailAddress": {"address": "sender@example.com"}}, "receivedDateTime": "2026-01-15T10:00:00Z", "isRead": False}]},
        "read_email": {"id": "msg_1", "subject": "Outlook Email 1", "from": {"emailAddress": {"address": "sender@example.com"}}, "body": {"contentType": "Text", "content": "Email body content"}},
        "send_email": {"id": "msg_sent_1", "subject": "Sent Email"},
        "reply_email": {"id": "msg_reply_1", "subject": "Re: Outlook Email 1"},
    },
}

DEFAULT_MOCK_RESPONSE = {
    "status": "mocked",
    "message": "This is a simulated response from the connector.",
    "timestamp": "2026-01-15T10:30:00Z",
    "data": {},
}


def get_mock_response(provider: str, operation: str, input_params: dict | None = None) -> dict[str, Any]:
    """Get a mock response for a connector operation."""
    provider_lower = provider.lower()
    operation_lower = operation.lower()

    # Special handling for HTTP generic - can simulate based on input
    if provider_lower == "http_generic" and operation_lower == "request":
        params = input_params or {}
        mock = DEFAULT_MOCK_RESPONSE.copy()
        mock["status_code"] = 200
        mock["headers"] = {"content-type": "application/json"}
        mock["data"] = {"mock": True, "method": params.get("method", "GET"), "url": params.get("url", "")}
        return mock

    if provider_lower in MOCK_RESPONSES and operation_lower in MOCK_RESPONSES[provider_lower]:
        return MOCK_RESPONSES[provider_lower][operation_lower]

    return DEFAULT_MOCK_RESPONSE.copy()


def get_supported_operations(provider: str) -> list[str]:
    """Get list of supported mock operations for a provider."""
    provider_lower = provider.lower()
    if provider_lower in MOCK_RESPONSES:
        return list(MOCK_RESPONSES[provider_lower].keys())
    return []