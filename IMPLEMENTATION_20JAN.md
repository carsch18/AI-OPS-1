# 🚀 IMPLEMENTATION_20JAN.md
# Multi-Project Infrastructure Management System
## "My Space" - Enterprise DevOps Command Center

---

## 🎯 Vision Statement

Transform AIOps Command Center from a **single-instance monitoring tool** into a **multi-project, multi-instance infrastructure orchestration platform** where DevOps engineers can:

1. **Manage multiple projects** (Project A, B, C) from a unified dashboard
2. **Connect to multiple cloud instances** (AWS-1, AWS-2, GCP-1, etc.) with secure credential management
3. **Deploy Netdata agents** to remote instances for per-project/per-instance monitoring
4. **Isolate metrics** so each project's health is tracked independently
5. **Execute remote operations** via SSH with audit logging

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AIOps Command Center                                  │
│                         (Central Brain API)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                     │
│  │   My Space   │───│  Projects    │───│  Instances   │                     │
│  │   (User)     │   │  (A, B, C)   │   │  (AWS-1,2)   │                     │
│  └──────────────┘   └──────────────┘   └──────────────┘                     │
│         │                  │                  │                              │
│         ▼                  ▼                  ▼                              │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │                   Credential Vault                            │           │
│  │   • AWS Access Keys (encrypted)                               │           │
│  │   • SSH Private Keys (encrypted)                              │           │
│  │   • API Tokens                                                │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                              │                                               │
│         ┌────────────────────┼────────────────────┐                         │
│         ▼                    ▼                    ▼                          │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                  │
│  │   AWS-1     │      │   AWS-2     │      │   GCP-1     │                  │
│  │  (Netdata)  │      │  (Netdata)  │      │  (Netdata)  │                  │
│  │             │      │             │      │             │                  │
│  │ Project A   │      │ Project B   │      │ Project C   │                  │
│  │ Project B   │      │ Project C   │      │             │                  │
│  └─────────────┘      └─────────────┘      └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security-First Design Principles

| Principle | Implementation |
|:----------|:---------------|
| **Encryption at Rest** | AES-256-GCM for all credentials in PostgreSQL |
| **Encryption in Transit** | TLS 1.3 for all API calls, SSH for remote execution |
| **Least Privilege** | Scoped AWS IAM roles per instance, not root keys |
| **Key Rotation** | Automatic 90-day rotation with alerts |
| **Audit Trail** | Every credential access logged with actor + timestamp |
| **Zero Trust** | Re-authenticate for sensitive operations (SSH exec) |

---

## 📋 Phased Implementation Plan

---

### PHASE 1: Data Model Foundation
**Duration**: 2-3 days | **Priority**: Critical

#### 1.1 Database Schema Extensions

```sql
-- Users already exist, add organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Projects (the logical grouping)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#10a37f',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id, slug)
);

-- Cloud Instances (AWS EC2, GCP VMs, etc.)
CREATE TABLE instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    region VARCHAR(50),
    instance_id VARCHAR(100),
    public_ip INET,
    private_ip INET,
    ssh_port INTEGER DEFAULT 22,
    ssh_user VARCHAR(100) DEFAULT 'ec2-user',
    status VARCHAR(20) DEFAULT 'unknown',
    last_seen TIMESTAMP,
    netdata_url VARCHAR(255),
    netdata_status VARCHAR(20) DEFAULT 'not_installed',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id, instance_id)
);

-- Project <-> Instance mapping (many-to-many)
CREATE TABLE project_instances (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'compute',
    PRIMARY KEY (project_id, instance_id)
);

-- Encrypted Credentials Vault
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    credential_type VARCHAR(50) NOT NULL,
    encrypted_data BYTEA NOT NULL,
    metadata JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP,
    expires_at TIMESTAMP
);

-- Instance <-> Credential mapping
CREATE TABLE instance_credentials (
    instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
    credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
    purpose VARCHAR(50) NOT NULL,
    PRIMARY KEY (instance_id, credential_id, purpose)
);
```

#### 1.2 Brain API Endpoints

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/api/projects` | List all projects in org |
| `POST` | `/api/projects` | Create new project |
| `GET` | `/api/projects/:id` | Get project details + instances |
| `PUT` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Archive project |
| `GET` | `/api/instances` | List all instances in org |
| `POST` | `/api/instances` | Register new instance |
| `POST` | `/api/instances/:id/test-connection` | Test SSH connectivity |
| `POST` | `/api/instances/:id/install-netdata` | Deploy Netdata agent |
| `GET` | `/api/instances/:id/metrics` | Proxy Netdata metrics |
| `POST` | `/api/credentials` | Store encrypted credential |
| `GET` | `/api/credentials` | List credentials (metadata only) |
| `DELETE` | `/api/credentials/:id` | Revoke credential |

---

### PHASE 2: Credential Vault Implementation
**Duration**: 3-4 days | **Priority**: Critical

#### 2.1 Encryption Service

```python
# apps/brain/services/vault.py
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, json, base64

class CredentialVault:
    def __init__(self):
        master_key_b64 = os.getenv("VAULT_MASTER_KEY")
        self.master_key = base64.b64decode(master_key_b64)
        self.aesgcm = AESGCM(self.master_key)
    
    def encrypt(self, data: dict) -> bytes:
        nonce = os.urandom(12)
        plaintext = json.dumps(data).encode()
        ciphertext = self.aesgcm.encrypt(nonce, plaintext, None)
        return nonce + ciphertext
    
    def decrypt(self, encrypted: bytes) -> dict:
        nonce, ciphertext = encrypted[:12], encrypted[12:]
        plaintext = self.aesgcm.decrypt(nonce, ciphertext, None)
        return json.loads(plaintext.decode())
```

#### 2.2 SSH Execution Service

```python
# apps/brain/services/ssh_executor.py
import asyncssh

class SSHExecutor:
    async def connect(self, host, port, username, private_key_pem):
        key = asyncssh.import_private_key(private_key_pem)
        return await asyncssh.connect(host, port=port, username=username, client_keys=[key])
    
    async def execute(self, conn, command):
        result = await conn.run(command)
        return result.stdout, result.stderr, result.exit_status
    
    async def install_netdata(self, conn, claim_token, claim_url):
        script = f'''
        curl https://get.netdata.cloud/kickstart.sh | sh -s -- --claim-token {claim_token} --claim-url {claim_url}
        '''
        _, _, code = await self.execute(conn, script)
        return code == 0
```

---

### PHASE 3: Instance Discovery & Registration
**Duration**: 2-3 days | **Priority**: High

#### 3.1 AWS Instance Discovery

```python
# apps/brain/services/aws_discovery.py
import boto3

class AWSDiscovery:
    def __init__(self, access_key, secret_key, region):
        self.ec2 = boto3.client('ec2', aws_access_key_id=access_key,
                                aws_secret_access_key=secret_key, region_name=region)
    
    async def discover_instances(self):
        response = self.ec2.describe_instances()
        instances = []
        for r in response['Reservations']:
            for i in r['Instances']:
                instances.append({
                    'instance_id': i['InstanceId'],
                    'state': i['State']['Name'],
                    'public_ip': i.get('PublicIpAddress'),
                    'private_ip': i.get('PrivateIpAddress'),
                    'name': next((t['Value'] for t in i.get('Tags', []) if t['Key'] == 'Name'), i['InstanceId'])
                })
        return instances
```

#### 3.2 Registration Flow

1. User clicks "+ Add Project/Instance"
2. Modal: Select provider (AWS/GCP/Azure/Manual)
3. Enter AWS credentials → encrypted & stored
4. Auto-discover EC2 instances
5. Upload SSH key → encrypted & stored
6. Test SSH connection → show ✅/❌
7. Optional: One-click Netdata install

---

### PHASE 4: Per-Project Metrics Aggregation
**Duration**: 3-4 days | **Priority**: High

```python
# apps/brain/services/metrics_aggregator.py
class MetricsAggregator:
    async def get_project_metrics(self, project_id):
        instances = await db.get_project_instances(project_id)
        metrics = {}
        for inst in instances:
            if inst.netdata_url:
                m = await self.fetch_instance_metrics(inst)
                metrics[inst.id] = {'name': inst.name, 'cpu': m['cpu'], 'memory': m['memory']}
        return {
            'instances': metrics,
            'aggregate': {
                'avg_cpu': sum(m['cpu'] for m in metrics.values()) / len(metrics),
                'total_alerts': sum(len(m.get('alerts', [])) for m in metrics.values())
            }
        }
```

---

### PHASE 5: Frontend "My Space" Dashboard
**Duration**: 4-5 days | **Priority**: High

#### Key UI Components

- **Header**: `+ Add Project` button, project switcher dropdown
- **Instance Grid**: Visual cards with status, metrics, project tags
- **Add Modal**: Multi-step wizard (credentials → discovery → SSH → Netdata)
- **Project Dashboard**: Per-project metrics with instance breakdown
- **Credential Manager**: List/revoke stored credentials
- **SSH Terminal**: Web-based terminal (xterm.js)

---

### PHASE 6: Advanced Features
**Duration**: Ongoing | **Priority**: Medium

- Web-based SSH terminal (xterm.js + WebSocket)
- Automated Netdata deployment via SSH
- Multi-instance alerting aggregation
- Credential rotation workflows
- GCP/Azure provider support

---

## 📁 New Files

```
apps/brain/
├── services/
│   ├── vault.py           # [NEW] Credential encryption
│   ├── ssh_executor.py    # [NEW] SSH command execution
│   ├── aws_discovery.py   # [NEW] AWS EC2 discovery
│   └── metrics_aggregator.py  # [NEW] Multi-instance metrics
├── routes/
│   ├── projects.py        # [NEW] Project CRUD
│   ├── instances.py       # [NEW] Instance management
│   └── credentials.py     # [NEW] Credential vault
```

---

## 🔒 Security Checklist

- [ ] VAULT_MASTER_KEY in AWS Secrets Manager
- [ ] AES-256-GCM encryption for all credentials
- [ ] SSH keys never logged or exposed in API
- [ ] Rate limiting on credential endpoints
- [ ] MFA for sensitive operations
- [ ] Audit log for all credential access

---

## 🎯 Deliverables Summary

| Phase | Deliverable | LOC Estimate |
|:------|:------------|:-------------|
| Phase 1 | DB Schema + API routes | ~500 |
| Phase 2 | Credential Vault | ~400 |
| Phase 3 | AWS Discovery + SSH | ~600 |
| Phase 4 | Metrics Aggregation | ~400 |
| Phase 5 | Frontend UI | ~1200 |
| Phase 6 | SSH Terminal + Alerts | ~800 |
| **TOTAL** | | **~3900 LOC** |

---

## 🚦 Next Steps

1. **Review** this plan and provide feedback
2. **Approve** Phase 1 to begin implementation
3. **Provide** AWS test credentials (or use mock mode)
4. **Confirm** Netdata Cloud claim token for agent deployment

---

*This architecture positions AIOps Command Center as a top-tier DevOps platform.*
