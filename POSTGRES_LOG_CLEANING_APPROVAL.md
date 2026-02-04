# PostgreSQL Log Cleaning - Human Approval Requirements

## Overview

The AIOps Brain now requires **explicit human approval** for all database operations, including cleaning PostgreSQL logs. This ensures critical database operations go through a human-in-the-loop approval process.

## How It Works

### 1. **Requesting Log Cleaning**

When a user or AI chatbot suggests cleaning logs, the system:
- Detects keywords like: `clean`, `clear`, `clean logs`, `clean postgres`, `truncate`
- Creates a **pending action** requiring approval
- Sets status to `PENDING_APPROVAL` (for critical actions)

### 2. **Approval Requirements**

**For `clean_postgres_logs` action:**
- ✅ Status: `PENDING_APPROVAL` (not auto-executed)
- 🔴 Classification: **CRITICAL ACTION**
- 📋 Requires: Human verification + approval reason
- ⏱️ Expires: No auto-execution timeout

### 3. **Approval Flow**

```
User/AI suggests cleaning logs
        ↓
System creates PENDING_APPROVAL action
        ↓
Pending action appears in /pending-actions endpoints
        ↓
Human reviews action details
        ↓
Human approves with verified_critical=true + verification_reason
        ↓
Action moves to EXECUTING status
        ↓
Ansible playbook runs with approval context
        ↓
Action completes with COMPLETED status
```

## API Endpoints

### Get All Pending Actions
```bash
curl http://localhost:8000/pending-actions
```

Response includes all `PENDING` and `PENDING_APPROVAL` actions.

### Get Critical Actions (NEW)
```bash
curl http://localhost:8000/pending-actions/critical
```

Returns only critical database operations like `clean_postgres_logs`.

### Get Actions by Type (NEW)
```bash
curl http://localhost:8000/pending-actions/by-type/clean_postgres_logs
```

### Approve a Critical Action
```bash
curl -X POST http://localhost:8000/actions/{action_id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "action_id": "uuid-here",
    "decision": "approve",
    "approved_by": "admin_name",
    "verified_critical": true,
    "verification_reason": "Disk space critical - logs taking 85GB, older than 30 days"
  }'
```

**Required fields for critical actions:**
- `verified_critical`: **Must be `true`**
- `verification_reason`: Explanation of why this critical action is necessary

### Reject an Action
```bash
curl -X POST http://localhost:8000/actions/{action_id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "action_id": "uuid-here",
    "decision": "reject",
    "approved_by": "admin_name",
    "verification_reason": "Not enough time to verify impact"
  }'
```

### Test Endpoint (for development)
```bash
curl -X POST http://localhost:8000/test/clean-postgres-logs
```

This simulates an AI suggestion to clean postgres logs and creates a pending action.

## Testing the Flow

### Step 1: Trigger a Log Cleaning Request

**Via Chat API:**
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you clean the postgres logs to free up disk space?"
  }'
```

**Via Test Endpoint:**
```bash
curl -X POST http://localhost:8000/test/clean-postgres-logs
```

### Step 2: Check Pending Actions

```bash
curl http://localhost:8000/pending-actions
```

You should see the log cleaning action with:
- `"status": "PENDING_APPROVAL"`
- `"is_critical": true`
- `"action_type": "clean_postgres_logs"`

### Step 3: Get Critical Actions Specifically

```bash
curl http://localhost:8000/pending-actions/critical
```

This filters to only show critical database operations.

### Step 4: Approve the Action

Extract the `id` from the pending action and approve:

```bash
curl -X POST http://localhost:8000/actions/{action_id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "action_id": "{action_id}",
    "decision": "approve",
    "approved_by": "john_admin",
    "verified_critical": true,
    "verification_reason": "Disk usage at 92%, logs safely archived before deletion"
  }'
```

### Step 5: Check Audit Log

```bash
curl http://localhost:8000/audit-log
```

You should see:
- `CRITICAL_ACTION_APPROVED` event
- Approval reason captured
- Approver name recorded

## Key Features

### ✅ High-Risk Actions Require Approval

The following actions are flagged as high-risk and require approval:

| Action Type | Risk Level | Requires Verification |
|------------|-----------|----------------------|
| `clean_postgres_logs` | 🔴 CRITICAL | YES |
| `clear_cache` | 🟡 HIGH | NO |
| `kill_process` | 🟡 HIGH | NO |
| `restart_service` | 🟡 HIGH | NO |
| `restart_container` | 🟡 HIGH | NO |
| `scale_up` | 🟡 HIGH | NO |
| `scale_down` | 🟡 HIGH | NO |

### 🔴 Critical Actions (Extra Protection)

```python
CRITICAL_ACTIONS = {
    "clean_postgres_logs",
    "truncate_database",
    "purge_data"
}
```

These actions:
- Require `verified_critical=true` in approval request
- Require `verification_reason` explaining the necessity
- Get special audit logging
- Return `requires_verification: true` if not properly verified

### 📊 Status Tracking

Action statuses:
- `PENDING_APPROVAL` - Awaiting human approval (high-risk actions)
- `EXECUTING` - Currently running
- `COMPLETED` - Successfully executed
- `FAILED` - Execution failed
- `REJECTED` - Human rejected the action

## Configuration

### Adding New Critical Actions

Edit `main.py`:

```python
CRITICAL_ACTIONS = {
    "clean_postgres_logs",
    "truncate_database",
    "purge_data",
    # Add new critical actions here
}
```

### Adding to High-Risk Actions

```python
HIGH_RISK_ACTIONS = {
    "clean_postgres_logs",
    "clear_cache",
    "kill_process",
    # Add new high-risk actions here
}
```

## Audit Trail

All log cleaning operations are fully audited:

```bash
curl http://localhost:8000/audit-log
```

Events recorded:
- `ACTION_PROPOSED` - Log cleaning suggested
- `ACTION_APPROVAL_BLOCKED` - Critical action blocked (waiting for verification)
- `CRITICAL_ACTION_APPROVED` - Human approved with reason
- `ACTION_APPROVED` - Standard action approved
- `AUTOMATION_TRIGGERED` - Playbook started
- `AUTOMATION_COMPLETED` - Playbook finished
- `AUTOMATION_FAILED` - Playbook failed

## WebSocket Real-time Updates

Connect to `/ws` for real-time updates when:
- New pending actions created
- Actions approved/rejected
- Automation starts/completes

```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'pending_action') {
    console.log('New action awaiting approval:', data.action);
  }
  if (data.type === 'action_resolved') {
    console.log('Action approved/rejected:', data.action_id, data.decision);
  }
};
```

## Troubleshooting

### Pending action not appearing

1. **Check status query:**
   ```bash
   curl "http://localhost:8000/pending-actions?status=PENDING_APPROVAL"
   ```

2. **Verify database:**
   ```sql
   SELECT * FROM pending_actions WHERE action_type = 'clean_postgres_logs';
   ```

3. **Check logs:**
   - Look for `ACTION_PROPOSED` audit events
   - Check if `propose_remediation` tool was called

### Action blocked for verification

If you get a 403-like response with `"requires_verification": true`:

```bash
# Re-submit with verification
curl -X POST http://localhost:8000/actions/{action_id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "action_id": "{action_id}",
    "decision": "approve",
    "approved_by": "admin",
    "verified_critical": true,
    "verification_reason": "Verified safe to execute - logs backed up"
  }'
```

### Playbook not executing

1. Verify approval was successful (status should be `EXECUTING`)
2. Check if `clean_postgres_logs.yml` exists in playbooks directory
3. Review automation callback logs

## Security Best Practices

✅ **DO:**
- Always require human approval for database operations
- Document the reason for each approval
- Review audit logs regularly
- Archive logs before deletion
- Test in non-production first

❌ **DON'T:**
- Set `verified_critical=true` without human review
- Approve without understanding the impact
- Skip the verification_reason field
- Run critical actions during peak hours without planning

