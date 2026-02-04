/**
 * Node Type Definitions
 * Matches the backend node_registry.py
 */

export interface ConfigFieldOption {
    value: string;
    label: string;
}

export interface ConfigField {
    name: string;
    label: string;
    type: 'text' | 'select' | 'number' | 'boolean' | 'json' | 'code';
    required?: boolean;
    default?: any;
    options?: ConfigFieldOption[];
    placeholder?: string;
    description?: string;
}

export interface NodeTypeDefinition {
    type: string;
    subtype: string;
    category: 'trigger' | 'action' | 'flow';
    label: string;
    description: string;
    icon: string;
    color: string;
    inputs: { name: string; label: string; type: string }[];
    outputs: { name: string; label: string; type: string }[];
    config_fields: ConfigField[];
}

// Default node types (will be fetched from API in production)
export const NODE_TYPES: NodeTypeDefinition[] = [
    // ========================================
    // TRIGGERS
    // ========================================
    {
        type: 'trigger',
        subtype: 'incident_created',
        category: 'trigger',
        label: 'Incident Created',
        description: 'Triggers when a new incident is created',
        icon: '🔥',
        color: '#8b5cf6',
        inputs: [],
        outputs: [{ name: 'default', label: 'On Trigger', type: 'default' }],
        config_fields: [
            {
                name: 'severity_filter',
                label: 'Severity Filter',
                type: 'select',
                options: [
                    { value: 'any', label: 'Any Severity' },
                    { value: 'P0', label: 'P0 - Critical' },
                    { value: 'P1', label: 'P1 - High' },
                    { value: 'P2', label: 'P2 - Medium' },
                    { value: 'P3', label: 'P3 - Low' },
                ],
                default: 'any',
            },
            {
                name: 'type_filter',
                label: 'Incident Type',
                type: 'select',
                options: [
                    { value: 'any', label: 'Any Type' },
                    { value: 'site_downtime', label: 'Site Downtime' },
                    { value: 'http_5xx_spike', label: 'HTTP 5xx Spike' },
                    { value: 'ddos_attack', label: 'DDoS Attack' },
                    { value: 'resource_spike', label: 'Resource Spike' },
                ],
                default: 'any',
            },
        ],
    },
    {
        type: 'trigger',
        subtype: 'alert_fired',
        category: 'trigger',
        label: 'Alert Fired',
        description: 'Triggers when an alert is fired',
        icon: '🚨',
        color: '#8b5cf6',
        inputs: [],
        outputs: [{ name: 'default', label: 'On Alert', type: 'default' }],
        config_fields: [
            {
                name: 'category',
                label: 'Alert Category',
                type: 'select',
                options: [
                    { value: 'any', label: 'Any Category' },
                    { value: 'availability', label: 'Availability' },
                    { value: 'performance', label: 'Performance' },
                    { value: 'infrastructure', label: 'Infrastructure' },
                ],
                default: 'any',
            },
        ],
    },
    {
        type: 'trigger',
        subtype: 'scheduled',
        category: 'trigger',
        label: 'Scheduled',
        description: 'Triggers on a schedule (cron)',
        icon: '⏰',
        color: '#8b5cf6',
        inputs: [],
        outputs: [{ name: 'default', label: 'On Schedule', type: 'default' }],
        config_fields: [
            {
                name: 'cron_expression',
                label: 'Cron Expression',
                type: 'text',
                required: true,
                placeholder: '0 0 * * *',
                description: 'Standard cron format',
            },
        ],
    },
    {
        type: 'trigger',
        subtype: 'manual_trigger',
        category: 'trigger',
        label: 'Manual Trigger',
        description: 'Triggers manually from the UI',
        icon: '👆',
        color: '#8b5cf6',
        inputs: [],
        outputs: [{ name: 'default', label: 'On Trigger', type: 'default' }],
        config_fields: [],
    },
    {
        type: 'trigger',
        subtype: 'webhook_received',
        category: 'trigger',
        label: 'Webhook',
        description: 'Triggers on incoming webhook',
        icon: '🔗',
        color: '#8b5cf6',
        inputs: [],
        outputs: [{ name: 'default', label: 'On Request', type: 'default' }],
        config_fields: [
            {
                name: 'path',
                label: 'Webhook Path',
                type: 'text',
                placeholder: '/my-hook',
            },
        ],
    },

    // ========================================
    // ACTIONS
    // ========================================
    {
        type: 'action',
        subtype: 'run_playbook',
        category: 'action',
        label: 'Run Playbook',
        description: 'Execute an Ansible playbook',
        icon: '📋',
        color: '#10b981',
        inputs: [{ name: 'default', label: 'Input', type: 'default' }],
        outputs: [
            { name: 'success', label: 'Success', type: 'success' },
            { name: 'failure', label: 'Failure', type: 'failure' },
        ],
        config_fields: [
            {
                name: 'playbook_name',
                label: 'Playbook',
                type: 'select',
                required: true,
                options: [
                    { value: 'ddev_restart.yml', label: 'DDEV Restart' },
                    { value: 'ddev_health_check.yml', label: 'DDEV Health Check' },
                    { value: 'ddos_mitigation.yml', label: 'DDoS Mitigation' },
                    { value: 'resource_spike.yml', label: 'Resource Spike' },
                    { value: 'db_latency.yml', label: 'DB Latency Fix' },
                    { value: 'netdata_restart.yml', label: 'Netdata Restart' },
                    { value: 'clear_cache.yml', label: 'Clear Cache' },
                    { value: 'health_check.yml', label: 'Health Check' },
                ],
            },
            {
                name: 'timeout_seconds',
                label: 'Timeout (seconds)',
                type: 'number',
                default: 300,
            },
        ],
    },
    {
        type: 'action',
        subtype: 'ssh_command',
        category: 'action',
        label: 'SSH Command',
        description: 'Execute a command via SSH',
        icon: '💻',
        color: '#10b981',
        inputs: [{ name: 'default', label: 'Input', type: 'default' }],
        outputs: [
            { name: 'success', label: 'Success', type: 'success' },
            { name: 'failure', label: 'Failure', type: 'failure' },
        ],
        config_fields: [
            {
                name: 'host',
                label: 'Host',
                type: 'select',
                options: [
                    { value: 'ddev', label: 'DDEV Server (10.10.2.21)' },
                    { value: 'localhost', label: 'Local' },
                ],
                default: 'ddev',
            },
            {
                name: 'command',
                label: 'Command',
                type: 'code',
                required: true,
                placeholder: 'cd ~/d1/regenics && ddev status',
            },
        ],
    },
    {
        type: 'action',
        subtype: 'send_email',
        category: 'action',
        label: 'Send Email',
        description: 'Send an email notification',
        icon: '📧',
        color: '#10b981',
        inputs: [{ name: 'default', label: 'Input', type: 'default' }],
        outputs: [
            { name: 'success', label: 'Success', type: 'success' },
            { name: 'failure', label: 'Failure', type: 'failure' },
        ],
        config_fields: [
            {
                name: 'recipients',
                label: 'Recipients',
                type: 'text',
                required: true,
                placeholder: 'team@example.com',
            },
            {
                name: 'subject',
                label: 'Subject',
                type: 'text',
                required: true,
                placeholder: '[AIOps] {{incident.title}}',
            },
        ],
    },
    {
        type: 'action',
        subtype: 'call_api',
        category: 'action',
        label: 'HTTP Request',
        description: 'Make an HTTP request',
        icon: '🌐',
        color: '#10b981',
        inputs: [{ name: 'default', label: 'Input', type: 'default' }],
        outputs: [
            { name: 'success', label: 'Success', type: 'success' },
            { name: 'failure', label: 'Failure', type: 'failure' },
        ],
        config_fields: [
            {
                name: 'url',
                label: 'URL',
                type: 'text',
                required: true,
                placeholder: 'https://api.example.com/endpoint',
            },
            {
                name: 'method',
                label: 'Method',
                type: 'select',
                options: [
                    { value: 'GET', label: 'GET' },
                    { value: 'POST', label: 'POST' },
                    { value: 'PUT', label: 'PUT' },
                    { value: 'DELETE', label: 'DELETE' },
                ],
                default: 'POST',
            },
        ],
    },

    // ========================================
    // FLOW CONTROL
    // ========================================
    {
        type: 'approval',
        subtype: 'human_approval',
        category: 'flow',
        label: 'Human Approval',
        description: 'Pause and wait for human approval',
        icon: '👤',
        color: '#f59e0b',
        inputs: [{ name: 'default', label: 'Input', type: 'default' }],
        outputs: [
            { name: 'approved', label: 'Approved', type: 'success' },
            { name: 'rejected', label: 'Rejected', type: 'failure' },
            { name: 'timeout', label: 'Timeout', type: 'default' },
        ],
        config_fields: [
            {
                name: 'approvers',
                label: 'Approvers',
                type: 'text',
                placeholder: 'admin, oncall',
            },
            {
                name: 'timeout_minutes',
                label: 'Timeout (minutes)',
                type: 'number',
                default: 30,
            },
            {
                name: 'auto_action',
                label: 'On Timeout',
                type: 'select',
                options: [
                    { value: 'reject', label: 'Auto-Reject' },
                    { value: 'approve', label: 'Auto-Approve' },
                    { value: 'none', label: 'Keep Waiting' },
                ],
                default: 'reject',
            },
        ],
    },
    {
        type: 'condition',
        subtype: 'if_else',
        category: 'flow',
        label: 'If/Else',
        description: 'Branch based on a condition',
        icon: '🔀',
        color: '#3b82f6',
        inputs: [{ name: 'default', label: 'Input', type: 'default' }],
        outputs: [
            { name: 'true', label: 'True', type: 'success' },
            { name: 'false', label: 'False', type: 'failure' },
        ],
        config_fields: [
            {
                name: 'condition_type',
                label: 'Condition Type',
                type: 'select',
                options: [
                    { value: 'equals', label: 'Equals' },
                    { value: 'not_equals', label: 'Not Equals' },
                    { value: 'contains', label: 'Contains' },
                    { value: 'greater_than', label: 'Greater Than' },
                    { value: 'less_than', label: 'Less Than' },
                ],
                default: 'equals',
            },
            {
                name: 'left_value',
                label: 'Left Value',
                type: 'text',
                required: true,
                placeholder: '{{trigger.severity}}',
            },
            {
                name: 'right_value',
                label: 'Right Value',
                type: 'text',
                required: true,
                placeholder: 'P0',
            },
        ],
    },
    {
        type: 'delay',
        subtype: 'delay_wait',
        category: 'flow',
        label: 'Delay',
        description: 'Wait for a specified time',
        icon: '⏳',
        color: '#06b6d4',
        inputs: [{ name: 'default', label: 'Input', type: 'default' }],
        outputs: [{ name: 'default', label: 'Continue', type: 'default' }],
        config_fields: [
            {
                name: 'duration_seconds',
                label: 'Duration (seconds)',
                type: 'number',
                default: 10,
                required: true,
            },
            {
                name: 'reason',
                label: 'Reason (for logs)',
                type: 'text',
                placeholder: 'Waiting for service restart...',
            },
        ],
    },
];

export const getNodesByCategory = (category: 'trigger' | 'action' | 'flow'): NodeTypeDefinition[] => {
    return NODE_TYPES.filter((node) => node.category === category);
};

export const getNodeDefinition = (subtype: string): NodeTypeDefinition | undefined => {
    return NODE_TYPES.find((node) => node.subtype === subtype);
};

export const getCategoryIcon = (category: string): string => {
    switch (category) {
        case 'trigger':
            return '🎯';
        case 'action':
            return '⚡';
        case 'flow':
            return '🔀';
        default:
            return '📦';
    }
};
