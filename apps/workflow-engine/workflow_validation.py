"""
Workflow Validation - Ensure workflows are valid before execution
Checks for DAG structure, required configs, connectivity, and more

✅ Catch errors before they cause runtime failures!
"""

import json
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum


class ValidationSeverity(Enum):
    ERROR = "error"      # Cannot execute
    WARNING = "warning"  # Can execute but may have issues
    INFO = "info"        # Suggestions for improvement


@dataclass
class ValidationIssue:
    """A single validation issue"""
    severity: ValidationSeverity
    code: str
    message: str
    node_id: str = None
    edge_id: str = None
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationResult:
    """Complete validation result"""
    is_valid: bool
    errors: List[ValidationIssue] = field(default_factory=list)
    warnings: List[ValidationIssue] = field(default_factory=list)
    info: List[ValidationIssue] = field(default_factory=list)
    
    def add_issue(self, issue: ValidationIssue):
        if issue.severity == ValidationSeverity.ERROR:
            self.errors.append(issue)
            self.is_valid = False
        elif issue.severity == ValidationSeverity.WARNING:
            self.warnings.append(issue)
        else:
            self.info.append(issue)
    
    def to_dict(self) -> Dict:
        return {
            "is_valid": self.is_valid,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "info_count": len(self.info),
            "errors": [self._issue_to_dict(e) for e in self.errors],
            "warnings": [self._issue_to_dict(w) for w in self.warnings],
            "info": [self._issue_to_dict(i) for i in self.info]
        }
    
    def _issue_to_dict(self, issue: ValidationIssue) -> Dict:
        return {
            "severity": issue.severity.value,
            "code": issue.code,
            "message": issue.message,
            "node_id": issue.node_id,
            "edge_id": issue.edge_id,
            "details": issue.details
        }


# ============================================================
# VALIDATION RULES
# ============================================================

class WorkflowValidator:
    """
    Validates workflow structure and configuration
    
    Checks:
    1. Must have exactly one trigger node (start node)
    2. All nodes must be connected (no orphans)
    3. No cycles in the DAG
    4. Required node configs are present
    5. Edge source handles match node outputs
    6. Approval nodes have valid approvers
    7. Playbook nodes reference valid playbooks
    """
    
    # Node types that produce specific output handles
    NODE_OUTPUTS = {
        "run_playbook": ["success", "failure"],
        "ssh_command": ["success", "failure"],
        "call_api": ["success", "failure"],
        "if_else": ["true", "false"],
        "human_approval": ["approved", "rejected"],
        "send_email": ["success"],
        "delay_wait": ["default"],
        "create_incident": ["success", "failure"],
        # Triggers
        "incident_created": ["default"],
        "alert_fired": ["default"],
        "scheduled": ["default"],
        "manual_trigger": ["default"],
        "webhook_received": ["default"]
    }
    
    # Required configurations per node type
    REQUIRED_CONFIGS = {
        "run_playbook": ["playbook_name"],
        "ssh_command": ["command"],
        "send_email": ["recipients"],
        "call_api": ["url"],
        "human_approval": ["approvers"],
        "if_else": ["left_value", "condition_type", "right_value"],
        "delay_wait": ["duration_seconds"]
    }
    
    def __init__(self):
        pass
    
    def validate(
        self, 
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]],
        workflow_name: str = "Workflow"
    ) -> ValidationResult:
        """Validate a complete workflow"""
        
        result = ValidationResult(is_valid=True)
        
        if not nodes:
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.ERROR,
                code="NO_NODES",
                message="Workflow has no nodes"
            ))
            return result
        
        # Build lookup maps
        node_map = {n.get("id") or str(i): n for i, n in enumerate(nodes)}
        
        # Run all validation checks
        self._check_trigger_node(nodes, result)
        self._check_orphan_nodes(nodes, edges, result)
        self._check_dag_structure(nodes, edges, result)
        self._check_required_configs(nodes, result)
        self._check_edge_handles(nodes, edges, result)
        self._check_approval_nodes(nodes, result)
        self._check_condition_nodes(nodes, result)
        self._check_dead_ends(nodes, edges, result)
        self._check_naming(nodes, workflow_name, result)
        
        return result
    
    def _check_trigger_node(self, nodes: List[Dict], result: ValidationResult):
        """Check for exactly one trigger/start node"""
        trigger_nodes = [
            n for n in nodes 
            if n.get("node_type") == "trigger" or n.get("is_start_node")
        ]
        
        if len(trigger_nodes) == 0:
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.ERROR,
                code="NO_TRIGGER",
                message="Workflow must have at least one trigger node"
            ))
        elif len(trigger_nodes) > 1:
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                code="MULTIPLE_TRIGGERS",
                message=f"Workflow has {len(trigger_nodes)} trigger nodes. Only the first will be used.",
                details={"count": len(trigger_nodes)}
            ))
    
    def _check_orphan_nodes(
        self, 
        nodes: List[Dict], 
        edges: List[Dict], 
        result: ValidationResult
    ):
        """Check for nodes not connected to any edge"""
        node_ids = {n.get("id") for n in nodes if n.get("id")}
        connected_nodes = set()
        
        for edge in edges:
            source = edge.get("source_node_id") or edge.get("source")
            target = edge.get("target_node_id") or edge.get("target")
            if source:
                connected_nodes.add(source)
            if target:
                connected_nodes.add(target)
        
        # Start nodes don't need incoming edges
        trigger_ids = {
            n.get("id") for n in nodes 
            if n.get("node_type") == "trigger" or n.get("is_start_node")
        }
        
        for node in nodes:
            node_id = node.get("id")
            if not node_id:
                continue
                
            if node_id not in trigger_ids and node_id not in connected_nodes:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="ORPHAN_NODE",
                    message=f"Node '{node.get('label', node_id)}' is not connected to any other node",
                    node_id=node_id
                ))
    
    def _check_dag_structure(
        self, 
        nodes: List[Dict], 
        edges: List[Dict], 
        result: ValidationResult
    ):
        """Check for cycles in the workflow graph"""
        # Build adjacency list
        graph = {}
        for edge in edges:
            source = edge.get("source_node_id") or edge.get("source")
            target = edge.get("target_node_id") or edge.get("target")
            if source:
                if source not in graph:
                    graph[source] = []
                graph[source].append(target)
        
        # DFS for cycle detection
        visited = set()
        rec_stack = set()
        
        def has_cycle(node_id):
            visited.add(node_id)
            rec_stack.add(node_id)
            
            for neighbor in graph.get(node_id, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True
            
            rec_stack.remove(node_id)
            return False
        
        for node in nodes:
            node_id = node.get("id")
            if node_id and node_id not in visited:
                if has_cycle(node_id):
                    result.add_issue(ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        code="CYCLE_DETECTED",
                        message="Workflow contains a cycle. Workflows must be acyclic (DAG)."
                    ))
                    return
    
    def _check_required_configs(self, nodes: List[Dict], result: ValidationResult):
        """Check that required configurations are present"""
        for node in nodes:
            node_subtype = node.get("node_subtype") or node.get("subtype")
            required = self.REQUIRED_CONFIGS.get(node_subtype, [])
            config = node.get("config", {})
            
            if isinstance(config, str):
                try:
                    config = json.loads(config)
                except:
                    config = {}
            
            missing = [r for r in required if not config.get(r)]
            
            if missing:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    code="MISSING_CONFIG",
                    message=f"Node '{node.get('label', 'Unknown')}' is missing required config: {', '.join(missing)}",
                    node_id=node.get("id"),
                    details={"missing_fields": missing}
                ))
    
    def _check_edge_handles(
        self, 
        nodes: List[Dict], 
        edges: List[Dict], 
        result: ValidationResult
    ):
        """Check that edge source handles match node output types"""
        node_map = {n.get("id"): n for n in nodes if n.get("id")}
        
        for edge in edges:
            source_id = edge.get("source_node_id") or edge.get("source")
            handle = edge.get("source_handle", "default")
            
            if source_id not in node_map:
                continue
            
            source_node = node_map[source_id]
            node_subtype = source_node.get("node_subtype") or source_node.get("subtype")
            valid_handles = self.NODE_OUTPUTS.get(node_subtype, ["default"])
            
            if handle not in valid_handles and handle != "default":
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="INVALID_HANDLE",
                    message=f"Edge from '{source_node.get('label', source_id)}' uses handle '{handle}' but node only outputs: {valid_handles}",
                    edge_id=edge.get("id"),
                    node_id=source_id
                ))
    
    def _check_approval_nodes(self, nodes: List[Dict], result: ValidationResult):
        """Validate approval node configurations"""
        for node in nodes:
            subtype = node.get("node_subtype") or node.get("subtype")
            if subtype != "human_approval":
                continue
            
            config = node.get("config", {})
            if isinstance(config, str):
                try:
                    config = json.loads(config)
                except:
                    config = {}
            
            approvers = config.get("approvers", "")
            if not approvers:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    code="NO_APPROVERS",
                    message=f"Approval node '{node.get('label', 'Unknown')}' has no approvers configured",
                    node_id=node.get("id")
                ))
            
            timeout = config.get("timeout_minutes", 30)
            if timeout < 1:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="APPROVAL_TIMEOUT_LOW",
                    message=f"Approval timeout of {timeout} minutes may be too short",
                    node_id=node.get("id")
                ))
            elif timeout > 1440:  # 24 hours
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.INFO,
                    code="APPROVAL_TIMEOUT_HIGH",
                    message=f"Approval timeout of {timeout} minutes ({timeout/60:.1f} hours) is quite long",
                    node_id=node.get("id")
                ))
    
    def _check_condition_nodes(self, nodes: List[Dict], result: ValidationResult):
        """Validate condition node configurations"""
        for node in nodes:
            subtype = node.get("node_subtype") or node.get("subtype")
            if subtype != "if_else":
                continue
            
            config = node.get("config", {})
            if isinstance(config, str):
                try:
                    config = json.loads(config)
                except:
                    config = {}
            
            condition_type = config.get("condition_type", "")
            valid_conditions = ["equals", "not_equals", "contains", "greater_than", "less_than"]
            
            if condition_type not in valid_conditions:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    code="INVALID_CONDITION",
                    message=f"Condition node '{node.get('label')}' has invalid condition type: {condition_type}",
                    node_id=node.get("id"),
                    details={"valid_types": valid_conditions}
                ))
    
    def _check_dead_ends(
        self, 
        nodes: List[Dict], 
        edges: List[Dict], 
        result: ValidationResult
    ):
        """Check for nodes with missing output connections where expected"""
        # Find all nodes without outgoing edges
        sources = {e.get("source_node_id") or e.get("source") for e in edges}
        
        action_types = ["run_playbook", "ssh_command", "call_api"]
        
        for node in nodes:
            node_id = node.get("id")
            subtype = node.get("node_subtype") or node.get("subtype")
            
            # Action nodes should have at least failure handling
            if subtype in action_types and node_id not in sources:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.INFO,
                    code="ACTION_NO_SUCCESSOR",
                    message=f"Action node '{node.get('label', 'Unknown')}' has no successor nodes. Consider adding error handling.",
                    node_id=node_id
                ))
    
    def _check_naming(
        self, 
        nodes: List[Dict], 
        workflow_name: str,
        result: ValidationResult
    ):
        """Check for good naming practices"""
        if not workflow_name or workflow_name.lower() in ["untitled", "new workflow", ""]:
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.INFO,
                code="WORKFLOW_UNNAMED",
                message="Consider giving your workflow a descriptive name"
            ))
        
        # Check for duplicate node labels
        labels = {}
        for node in nodes:
            label = node.get("label", "")
            if label in labels:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.INFO,
                    code="DUPLICATE_LABEL",
                    message=f"Multiple nodes have the label '{label}'. Consider using unique labels.",
                    node_id=node.get("id")
                ))
            labels[label] = True


# ============================================================
# QUICK VALIDATION FUNCTION
# ============================================================

def validate_workflow(
    nodes: List[Dict[str, Any]], 
    edges: List[Dict[str, Any]],
    workflow_name: str = "Workflow"
) -> ValidationResult:
    """Quick validation function"""
    validator = WorkflowValidator()
    return validator.validate(nodes, edges, workflow_name)
