# AIOps Automation Layer
# Event-Driven Ansible + Remediation Playbooks

This directory contains the automation components for the AIOps platform:

## Structure

```
automation/
├── playbooks/           # Remediation playbooks
│   ├── restart_service.yml
│   ├── kill_process.yml
│   ├── clear_cache.yml
│   ├── scale_resources.yml
│   └── health_check.yml
├── rules/               # EDA rulebooks
│   └── aiops_rulebook.yml
├── inventory/           # Ansible inventory
│   └── hosts.yml
└── requirements.txt     # Python dependencies
```

## Running Event-Driven Ansible

```bash
# Install ansible-rulebook
pip install ansible-rulebook

# Run the EDA controller
ansible-rulebook --rulebook rules/aiops_rulebook.yml -i inventory/hosts.yml --verbose
```

## Integration with AIOps Brain

The Brain sends approved actions to EDA via webhook on port 5000.
EDA executes the appropriate playbook and sends results back to Brain.
