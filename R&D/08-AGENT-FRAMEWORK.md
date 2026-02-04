# 🤖 Agent Framework - CEREBRO

## Multi-Agent System Design

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     AGENT ORCHESTRATION                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                         ┌─────────────────────┐                                │
│                         │    USER REQUEST     │                                │
│                         │  "Why is checkout   │                                │
│                         │   slow?"            │                                │
│                         └──────────┬──────────┘                                │
│                                    │                                            │
│                         ┌──────────▼──────────┐                                │
│                         │   ORCHESTRATOR      │                                │
│                         │                     │                                │
│                         │ • Parse intent      │                                │
│                         │ • Route to agents   │                                │
│                         │ • Merge responses   │                                │
│                         └──────────┬──────────┘                                │
│                                    │                                            │
│         ┌──────────────────────────┼──────────────────────────┐                │
│         │                          │                          │                │
│         ▼                          ▼                          ▼                │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐          │
│  │ INVESTIGATOR│           │DIAGNOSTICIAN│           │ REMEDIATOR  │          │
│  │    AGENT    │           │    AGENT    │           │    AGENT    │          │
│  │             │           │             │           │             │          │
│  │ Gather data │──────────▶│ Find cause  │──────────▶│ Plan fix    │          │
│  │ and context │           │             │           │             │          │
│  └─────────────┘           └─────────────┘           └─────────────┘          │
│         │                          │                          │                │
│         │                          │                          │                │
│         ▼                          ▼                          ▼                │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         TOOL LAYER                                      │   │
│  │                                                                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │   │
│  │  │ Metrics │ │  Logs   │ │ Traces  │ │   K8s   │ │   AWS   │          │   │
│  │  │  Tools  │ │  Tools  │ │  Tools  │ │  Tools  │ │  Tools  │          │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Agent Definitions

### 1.1 Orchestrator Agent

```yaml
name: orchestrator
role: Central coordinator for all agent activities
capabilities:
  - Intent classification
  - Agent routing
  - Response synthesis
  - Conversation management
  
triggers:
  - User chat message
  - Alert webhook
  - Scheduled check
  - API call

routing_rules:
  investigation: ["investigator"]
  diagnosis: ["investigator", "diagnostician"]
  remediation: ["investigator", "diagnostician", "remediator"]
  optimization: ["optimizer"]
  security: ["security_analyst"]
```

### 1.2 Investigator Agent

```yaml
name: investigator
role: Data collection and context gathering
capabilities:
  - Query metrics (Prometheus, CloudWatch, Netdata)
  - Search logs (OpenSearch, CloudWatch Logs)
  - Fetch traces (X-Ray, Tempo)
  - Get deployments (ArgoCD, GitHub)
  - Check configurations (K8s, Terraform)

tools:
  - get_cpu_usage
  - get_memory_usage
  - get_network_stats
  - get_disk_io
  - search_logs
  - get_trace
  - get_deployments
  - get_config_changes

output_schema:
  type: object
  properties:
    metrics_snapshot:
      type: object
    relevant_logs:
      type: array
    recent_changes:
      type: array
    affected_services:
      type: array
```

### 1.3 Diagnostician Agent

```yaml
name: diagnostician
role: Root cause analysis and hypothesis testing
capabilities:
  - Correlation analysis
  - Pattern matching
  - Knowledge base search
  - Hypothesis generation
  - Evidence evaluation

reasoning_steps:
  1. Review collected context
  2. Generate hypotheses
  3. Test each hypothesis
  4. Rank by confidence
  5. Provide explanation

output_schema:
  type: object
  properties:
    root_cause:
      type: string
    confidence:
      type: number
    evidence:
      type: array
    alternative_causes:
      type: array
```

### 1.4 Remediator Agent

```yaml
name: remediator
role: Action planning and execution
capabilities:
  - Runbook search
  - Action planning
  - Risk assessment
  - Execution coordination
  - Rollback management

safety_controls:
  - Require HITL for high-risk actions
  - Staged rollout for changes
  - Automatic rollback on failure
  - Blast radius estimation

output_schema:
  type: object
  properties:
    recommended_action:
      type: object
    risk_level:
      type: string
    expected_impact:
      type: string
    rollback_plan:
      type: object
```

---

## 2. Tool Ecosystem

### 2.1 MCP Tool Categories

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        MCP TOOL CATALOG                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  OBSERVABILITY TOOLS (30+)                                                     │
│  ├── Metrics                                                                   │
│  │   ├── get_cpu_usage(host, time_range)                                      │
│  │   ├── get_memory_usage(host, time_range)                                   │
│  │   ├── get_disk_io(host, time_range)                                        │
│  │   ├── get_network_stats(host, interface)                                   │
│  │   ├── get_container_metrics(pod, namespace)                                │
│  │   ├── get_application_metrics(service, metric_name)                        │
│  │   └── query_prometheus(promql_query)                                       │
│  │                                                                             │
│  ├── Logs                                                                      │
│  │   ├── search_logs(query, time_range, service)                              │
│  │   ├── get_error_logs(service, severity, limit)                             │
│  │   ├── tail_logs(service, lines)                                            │
│  │   └── get_log_patterns(service, time_range)                                │
│  │                                                                             │
│  └── Traces                                                                    │
│      ├── get_trace(trace_id)                                                  │
│      ├── search_traces(service, operation, min_duration)                      │
│      └── get_service_map(time_range)                                          │
│                                                                                 │
│  KUBERNETES TOOLS (25+)                                                        │
│  ├── Workloads                                                                 │
│  │   ├── list_pods(namespace, labels)                                         │
│  │   ├── get_pod_status(pod, namespace)                                       │
│  │   ├── get_pod_logs(pod, namespace, container)                              │
│  │   ├── describe_deployment(name, namespace)                                 │
│  │   └── get_events(namespace, resource)                                      │
│  │                                                                             │
│  ├── Actions                                                                   │
│  │   ├── restart_deployment(name, namespace)                                  │
│  │   ├── scale_deployment(name, namespace, replicas)                          │
│  │   ├── rollback_deployment(name, namespace, revision)                       │
│  │   └── delete_pod(pod, namespace)                                           │
│  │                                                                             │
│  └── Config                                                                    │
│      ├── get_configmap(name, namespace)                                       │
│      ├── get_secret_keys(name, namespace)                                     │
│      └── get_hpa_status(name, namespace)                                      │
│                                                                                 │
│  AWS TOOLS (40+)                                                               │
│  ├── EC2                                                                       │
│  │   ├── list_instances(filters)                                              │
│  │   ├── get_instance_status(instance_id)                                     │
│  │   ├── reboot_instance(instance_id)                                         │
│  │   └── get_instance_metrics(instance_id)                                    │
│  │                                                                             │
│  ├── RDS                                                                       │
│  │   ├── get_db_status(db_identifier)                                         │
│  │   ├── get_db_metrics(db_identifier, metric)                                │
│  │   ├── get_slow_queries(db_identifier, limit)                               │
│  │   └── failover_db(db_identifier)                                           │
│  │                                                                             │
│  ├── ElastiCache                                                              │
│  │   ├── get_cache_status(cluster_id)                                         │
│  │   ├── get_cache_metrics(cluster_id)                                        │
│  │   └── flush_cache(cluster_id)                                              │
│  │                                                                             │
│  └── Lambda                                                                    │
│      ├── get_function_status(function_name)                                   │
│      ├── get_function_logs(function_name, time_range)                         │
│      └── invoke_function(function_name, payload)                              │
│                                                                                 │
│  KNOWLEDGE TOOLS (10+)                                                         │
│  ├── search_runbooks(query)                                                   │
│  ├── search_incidents(query, time_range)                                      │
│  ├── get_service_documentation(service)                                       │
│  └── search_knowledge_base(query)                                             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Tool Schema Example

```json
{
  "name": "get_cpu_usage",
  "description": "Get CPU usage metrics for a specific host",
  "parameters": {
    "type": "object",
    "properties": {
      "host": {
        "type": "string",
        "description": "Hostname or IP address"
      },
      "time_range": {
        "type": "string",
        "description": "Time range (e.g., '1h', '30m', '24h')",
        "default": "1h"
      },
      "aggregation": {
        "type": "string",
        "enum": ["avg", "max", "min", "p95", "p99"],
        "default": "avg"
      }
    },
    "required": ["host"]
  },
  "returns": {
    "type": "object",
    "properties": {
      "current": {"type": "number"},
      "average": {"type": "number"},
      "max": {"type": "number"},
      "timeseries": {"type": "array"}
    }
  }
}
```

---

## 3. Reasoning Framework

### 3.1 Chain of Thought

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    REASONING CHAIN                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  INPUT: "The checkout service is slow"                                         │
│                                                                                 │
│  STEP 1: UNDERSTAND                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • Service: checkout                                                    │   │
│  │  • Symptom: slow (latency)                                              │   │
│  │  • Timeframe: now (implicit)                                            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  STEP 2: GATHER                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Tool: get_application_metrics("checkout", "latency_p99")              │   │
│  │  Result: P99 latency = 2.5s (normal: 200ms) ⚠️                         │   │
│  │                                                                         │   │
│  │  Tool: get_container_metrics("checkout", "default")                    │   │
│  │  Result: CPU = 85%, Memory = 70%                                       │   │
│  │                                                                         │   │
│  │  Tool: get_deployments("checkout", "24h")                              │   │
│  │  Result: Deploy at 10:30 (2h ago)                                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  STEP 3: HYPOTHESIZE                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  H1: Recent deployment introduced regression (confidence: 0.7)         │   │
│  │  H2: Database bottleneck (confidence: 0.2)                             │   │
│  │  H3: Resource exhaustion (confidence: 0.1)                             │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  STEP 4: TEST                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Tool: search_traces("checkout", min_duration="1s")                    │   │
│  │  Result: 80% of slow traces show db.query span = 2s                    │   │
│  │                                                                         │   │
│  │  Tool: get_slow_queries("checkout-db")                                 │   │
│  │  Result: New query from latest deploy, missing index                   │   │
│  │                                                                         │   │
│  │  → H1 CONFIRMED with additional detail                                 │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  STEP 5: CONCLUDE                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Root Cause: Recent deployment added unoptimized query                 │   │
│  │  Confidence: 0.92                                                      │   │
│  │  Evidence: Trace analysis, slow query log                              │   │
│  │  Recommendation: Add index or rollback                                 │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Memory & Learning

### 4.1 Memory Types

| Type | Storage | Purpose |
|------|---------|---------|
| **Short-term** | Redis | Current conversation context |
| **Episodic** | PostgreSQL | Past incidents, resolutions |
| **Semantic** | Vector DB | Knowledge embeddings |
| **Procedural** | Runbook DB | How-to knowledge |

### 4.2 Learning Loop

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    CONTINUOUS LEARNING                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│     INCIDENT                FEEDBACK                 LEARNING                   │
│     ────────                ────────                 ────────                   │
│                                                                                 │
│  ┌───────────┐          ┌───────────┐          ┌───────────┐                  │
│  │  AI       │          │  Human    │          │  Model    │                  │
│  │  Response │─────────▶│  Review   │─────────▶│  Update   │                  │
│  └───────────┘          └───────────┘          └───────────┘                  │
│       │                      │                      │                          │
│       │                      │                      │                          │
│       ▼                      ▼                      ▼                          │
│  ┌───────────┐          ┌───────────┐          ┌───────────┐                  │
│  │ Was the   │          │ Correct?  │          │ Fine-tune │                  │
│  │ diagnosis │          │ Fast?     │          │ prompts   │                  │
│  │ correct?  │          │ Helpful?  │          │ and       │                  │
│  │           │          │           │          │ examples  │                  │
│  └───────────┘          └───────────┘          └───────────┘                  │
│                                                                                 │
│  METRICS TRACKED:                                                              │
│  ├── Diagnosis accuracy                                                        │
│  ├── Time to resolution                                                        │
│  ├── User satisfaction (thumbs up/down)                                        │
│  ├── Action success rate                                                       │
│  └── False positive rate                                                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Slash Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/investigate` | Start investigation | `/investigate high cpu on api-server` |
| `/status` | Get service status | `/status checkout-service` |
| `/compare` | Compare metrics | `/compare latency today vs yesterday` |
| `/incidents` | List incidents | `/incidents last 24h` |
| `/runbook` | Find runbook | `/runbook restart postgres` |
| `/action` | Execute action | `/action restart payment-api` |
| `/approve` | Approve pending | `/approve action-123` |
| `/reject` | Reject pending | `/reject action-123 too risky` |
| `/cost` | Check costs | `/cost eks-cluster this month` |

---

*Next: [09-AUTOMATION-ENGINE.md](./09-AUTOMATION-ENGINE.md) - Remediation systems*
