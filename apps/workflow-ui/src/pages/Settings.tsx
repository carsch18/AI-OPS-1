/**
 * Settings Page - MAANG-Grade Configuration UI
 * 
 * Features:
 * - Organized settings categories
 * - Real-time preview of changes
 * - Import/Export configuration
 * - Notification channel testing
 * - Reset to defaults
 */

import { useState, useEffect, useCallback } from 'react';
import {
    getAllSettings,
    saveAllSettings,
    resetAllSettings,
    exportSettings,
    importSettings,
    testNotificationChannel,
    getSettingCategoryIcon,
    getSettingCategoryDescription,
    DEFAULT_SETTINGS,
} from '../services/settingsApi';
import type {
    AllSettings,
    NotificationSettings,
    AutonomousSettings,
    DisplaySettings,
    IntegrationSettings,
    ThemeMode,
} from '../services/settingsApi';
import './Settings.css';

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface ToggleSwitchProps {
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}

function ToggleSwitch({ value, onChange, disabled }: ToggleSwitchProps) {
    return (
        <button
            className={`toggle-switch ${value ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => !disabled && onChange(!value)}
            disabled={disabled}
        >
            <span className="toggle-thumb" />
        </button>
    );
}

interface SliderProps {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    label?: string;
}

function Slider({ value, min, max, step = 1, onChange, label }: SliderProps) {
    return (
        <div className="slider-container">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="slider"
            />
            <span className="slider-value">{value}{label}</span>
        </div>
    );
}

interface SettingRowProps {
    label: string;
    description?: string;
    children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
    return (
        <div className="setting-row">
            <div className="setting-info">
                <span className="setting-label">{label}</span>
                {description && <span className="setting-description">{description}</span>}
            </div>
            <div className="setting-control">{children}</div>
        </div>
    );
}

interface CategorySectionProps {
    title: string;
    icon: string;
    description: string;
    children: React.ReactNode;
}

function CategorySection({ title, icon, description, children }: CategorySectionProps) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className={`category-section ${expanded ? 'expanded' : ''}`}>
            <div className="category-header" onClick={() => setExpanded(!expanded)}>
                <span className="category-icon">{icon}</span>
                <div className="category-info">
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
                <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
            </div>
            {expanded && <div className="category-content">{children}</div>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS PANELS
// ═══════════════════════════════════════════════════════════════════════════

interface NotificationsPanelProps {
    settings: NotificationSettings;
    onChange: (settings: Partial<NotificationSettings>) => void;
    onTest: (channel: 'email' | 'slack' | 'desktop') => void;
}

function NotificationsPanel({ settings, onChange, onTest }: NotificationsPanelProps) {
    return (
        <CategorySection
            title="Notifications"
            icon={getSettingCategoryIcon('notifications')}
            description={getSettingCategoryDescription('notifications')}
        >
            <SettingRow label="Enable Notifications" description="Master switch for all notifications">
                <ToggleSwitch value={settings.enabled} onChange={v => onChange({ enabled: v })} />
            </SettingRow>

            <SettingRow label="Notification Level">
                <select
                    value={settings.level}
                    onChange={e => onChange({ level: e.target.value as NotificationSettings['level'] })}
                    className="select-input"
                >
                    <option value="all">All Events</option>
                    <option value="critical">Critical Only</option>
                    <option value="none">None</option>
                </select>
            </SettingRow>

            <SettingRow label="Sound Effects" description="Play sounds for notifications">
                <ToggleSwitch value={settings.sound} onChange={v => onChange({ sound: v })} />
            </SettingRow>

            <SettingRow label="Desktop Notifications">
                <div className="setting-with-button">
                    <ToggleSwitch value={settings.desktop} onChange={v => onChange({ desktop: v })} />
                    <button className="btn-test" onClick={() => onTest('desktop')}>Test</button>
                </div>
            </SettingRow>

            <SettingRow label="Email Notifications">
                <ToggleSwitch value={settings.email} onChange={v => onChange({ email: v })} />
            </SettingRow>

            {settings.email && (
                <SettingRow label="Email Address">
                    <input
                        type="email"
                        value={settings.emailAddress}
                        onChange={e => onChange({ emailAddress: e.target.value })}
                        placeholder="you@example.com"
                        className="text-input"
                    />
                </SettingRow>
            )}

            <SettingRow label="Slack Notifications">
                <ToggleSwitch value={settings.slack} onChange={v => onChange({ slack: v })} />
            </SettingRow>

            {settings.slack && (
                <SettingRow label="Slack Webhook URL">
                    <input
                        type="text"
                        value={settings.slackWebhook}
                        onChange={e => onChange({ slackWebhook: e.target.value })}
                        placeholder="https://hooks.slack.com/..."
                        className="text-input"
                    />
                </SettingRow>
            )}
        </CategorySection>
    );
}

interface AutonomousPanelProps {
    settings: AutonomousSettings;
    onChange: (settings: Partial<AutonomousSettings>) => void;
}

function AutonomousPanel({ settings, onChange }: AutonomousPanelProps) {
    return (
        <CategorySection
            title="Autonomous Mode"
            icon={getSettingCategoryIcon('autonomous')}
            description={getSettingCategoryDescription('autonomous')}
        >
            <SettingRow label="Enable Autonomous Mode" description="Allow system to take actions automatically">
                <ToggleSwitch value={settings.enabled} onChange={v => onChange({ enabled: v })} />
            </SettingRow>

            <SettingRow label="Auto-Remediate Issues" description="Automatically fix detected issues">
                <ToggleSwitch
                    value={settings.autoRemediate}
                    onChange={v => onChange({ autoRemediate: v })}
                    disabled={!settings.enabled}
                />
            </SettingRow>

            <SettingRow label="Auto-Acknowledge Issues">
                <ToggleSwitch
                    value={settings.autoAcknowledge}
                    onChange={v => onChange({ autoAcknowledge: v })}
                    disabled={!settings.enabled}
                />
            </SettingRow>

            <SettingRow label="Confidence Threshold" description="Minimum confidence to auto-remediate">
                <Slider
                    value={settings.confidenceThreshold}
                    min={50}
                    max={100}
                    onChange={v => onChange({ confidenceThreshold: v })}
                    label="%"
                />
            </SettingRow>

            <SettingRow label="Require Approval" description="Get human approval before critical actions">
                <ToggleSwitch value={settings.requireApproval} onChange={v => onChange({ requireApproval: v })} />
            </SettingRow>

            {settings.requireApproval && (
                <SettingRow label="Approval Timeout" description="Seconds before auto-proceeding">
                    <Slider
                        value={settings.approvalTimeout}
                        min={60}
                        max={600}
                        step={30}
                        onChange={v => onChange({ approvalTimeout: v })}
                        label="s"
                    />
                </SettingRow>
            )}
        </CategorySection>
    );
}

interface DisplayPanelProps {
    settings: DisplaySettings;
    onChange: (settings: Partial<DisplaySettings>) => void;
}

function DisplayPanel({ settings, onChange }: DisplayPanelProps) {
    return (
        <CategorySection
            title="Display"
            icon={getSettingCategoryIcon('display')}
            description={getSettingCategoryDescription('display')}
        >
            <SettingRow label="Theme">
                <select
                    value={settings.theme}
                    onChange={e => onChange({ theme: e.target.value as ThemeMode })}
                    className="select-input"
                >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                </select>
            </SettingRow>

            <SettingRow label="Compact Mode" description="Reduce spacing for more content">
                <ToggleSwitch value={settings.compactMode} onChange={v => onChange({ compactMode: v })} />
            </SettingRow>

            <SettingRow label="Show Animations" description="Enable smooth transitions">
                <ToggleSwitch value={settings.showAnimations} onChange={v => onChange({ showAnimations: v })} />
            </SettingRow>

            <SettingRow label="Auto-Refresh Interval" description="Dashboard refresh rate">
                <Slider
                    value={settings.refreshInterval}
                    min={10}
                    max={120}
                    step={10}
                    onChange={v => onChange({ refreshInterval: v })}
                    label="s"
                />
            </SettingRow>

            <SettingRow label="Time Format">
                <select
                    value={settings.timeFormat}
                    onChange={e => onChange({ timeFormat: e.target.value as '12h' | '24h' })}
                    className="select-input"
                >
                    <option value="12h">12-hour (AM/PM)</option>
                    <option value="24h">24-hour</option>
                </select>
            </SettingRow>
        </CategorySection>
    );
}

interface IntegrationsPanelProps {
    settings: IntegrationSettings;
    onChange: (settings: Partial<IntegrationSettings>) => void;
}

function IntegrationsPanel({ settings, onChange }: IntegrationsPanelProps) {
    return (
        <CategorySection
            title="Integrations"
            icon={getSettingCategoryIcon('integrations')}
            description={getSettingCategoryDescription('integrations')}
        >
            <SettingRow label="Webhook URL" description="General webhook for events">
                <input
                    type="text"
                    value={settings.webhookUrl}
                    onChange={e => onChange({ webhookUrl: e.target.value })}
                    placeholder="https://your-webhook.com/..."
                    className="text-input"
                />
            </SettingRow>

            <SettingRow label="Slack Integration">
                <ToggleSwitch value={settings.slackEnabled} onChange={v => onChange({ slackEnabled: v })} />
            </SettingRow>

            <SettingRow label="PagerDuty">
                <ToggleSwitch value={settings.pagerDutyEnabled} onChange={v => onChange({ pagerDutyEnabled: v })} />
            </SettingRow>

            {settings.pagerDutyEnabled && (
                <SettingRow label="PagerDuty API Key">
                    <input
                        type="password"
                        value={settings.pagerDutyKey}
                        onChange={e => onChange({ pagerDutyKey: e.target.value })}
                        placeholder="Integration key"
                        className="text-input"
                    />
                </SettingRow>
            )}

            <SettingRow label="OpsGenie">
                <ToggleSwitch value={settings.opsGenieEnabled} onChange={v => onChange({ opsGenieEnabled: v })} />
            </SettingRow>
        </CategorySection>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
    const [settings, setSettings] = useState<AllSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Load settings
    useEffect(() => {
        (async () => {
            try {
                const loaded = await getAllSettings();
                setSettings(loaded);
            } catch (err) {
                setMessage({ type: 'error', text: 'Failed to load settings' });
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Update handlers
    const updateNotifications = useCallback((partial: Partial<NotificationSettings>) => {
        setSettings(s => ({ ...s, notifications: { ...s.notifications, ...partial } }));
        setHasChanges(true);
    }, []);

    const updateAutonomous = useCallback((partial: Partial<AutonomousSettings>) => {
        setSettings(s => ({ ...s, autonomous: { ...s.autonomous, ...partial } }));
        setHasChanges(true);
    }, []);

    const updateDisplay = useCallback((partial: Partial<DisplaySettings>) => {
        setSettings(s => ({ ...s, display: { ...s.display, ...partial } }));
        setHasChanges(true);
    }, []);

    const updateIntegrations = useCallback((partial: Partial<IntegrationSettings>) => {
        setSettings(s => ({ ...s, integrations: { ...s.integrations, ...partial } }));
        setHasChanges(true);
    }, []);

    // Actions
    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await saveAllSettings(settings);
            setHasChanges(false);
            setMessage({ type: 'success', text: 'Settings saved successfully!' });
        } catch {
            setMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    }, [settings]);

    const handleReset = useCallback(async () => {
        if (!confirm('Reset all settings to defaults?')) return;

        try {
            const defaults = await resetAllSettings();
            setSettings(defaults);
            setHasChanges(false);
            setMessage({ type: 'success', text: 'Settings reset to defaults' });
        } catch {
            setMessage({ type: 'error', text: 'Failed to reset settings' });
        }
    }, []);

    const handleExport = useCallback(async () => {
        const json = await exportSettings();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'aiops-settings.json';
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    const handleImport = useCallback(async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const imported = await importSettings(text);
                setSettings(imported);
                setHasChanges(false);
                setMessage({ type: 'success', text: 'Settings imported successfully!' });
            } catch {
                setMessage({ type: 'error', text: 'Failed to import settings' });
            }
        };
        input.click();
    }, []);

    const handleTestNotification = useCallback(async (channel: 'email' | 'slack' | 'desktop') => {
        const result = await testNotificationChannel(channel);
        setMessage({ type: result.success ? 'success' : 'error', text: result.message });
    }, []);

    // Clear message after 3 seconds
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    if (loading) {
        return (
            <div className="settings-page loading">
                <div className="loading-content">
                    <div className="loading-spinner large" />
                    <p>Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-page">
            {/* Header */}
            <header className="settings-header">
                <div className="header-left">
                    <h1>⚙️ Settings</h1>
                </div>
                <div className="header-right">
                    <button className="btn-secondary" onClick={handleExport}>
                        📤 Export
                    </button>
                    <button className="btn-secondary" onClick={handleImport}>
                        📥 Import
                    </button>
                    <button className="btn-secondary" onClick={handleReset}>
                        🔄 Reset
                    </button>
                    <button
                        className={`btn-primary ${hasChanges ? '' : 'disabled'}`}
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                    >
                        {saving ? '⏳' : '💾'} Save Changes
                    </button>
                </div>
            </header>

            {/* Message Toast */}
            {message && (
                <div className={`settings-toast ${message.type}`}>
                    {message.type === 'success' ? '✅' : '❌'} {message.text}
                </div>
            )}

            {/* Settings Panels */}
            <div className="settings-content">
                <NotificationsPanel
                    settings={settings.notifications}
                    onChange={updateNotifications}
                    onTest={handleTestNotification}
                />

                <AutonomousPanel
                    settings={settings.autonomous}
                    onChange={updateAutonomous}
                />

                <DisplayPanel
                    settings={settings.display}
                    onChange={updateDisplay}
                />

                <IntegrationsPanel
                    settings={settings.integrations}
                    onChange={updateIntegrations}
                />
            </div>
        </div>
    );
}
