/**
 * Settings API Service - Phase 7G
 * 
 * Manages application settings and configuration:
 * - System preferences
 * - Notification settings
 * - Autonomous mode configuration
 * - Theme and appearance
 * - Integration settings
 */

const API_BASE = 'http://localhost:8001';
const SETTINGS_STORAGE_KEY = 'aiops_settings';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type ThemeMode = 'dark' | 'light' | 'system';
export type NotificationLevel = 'all' | 'critical' | 'none';

export interface NotificationSettings {
    enabled: boolean;
    level: NotificationLevel;
    sound: boolean;
    desktop: boolean;
    email: boolean;
    emailAddress: string;
    slack: boolean;
    slackWebhook: string;
}

export interface AutonomousSettings {
    enabled: boolean;
    autoRemediate: boolean;
    autoAcknowledge: boolean;
    confidenceThreshold: number;
    requireApproval: boolean;
    approvalTimeout: number;
    excludedCategories: string[];
    excludedSeverities: string[];
}

export interface DisplaySettings {
    theme: ThemeMode;
    compactMode: boolean;
    showAnimations: boolean;
    refreshInterval: number;
    dateFormat: string;
    timeFormat: '12h' | '24h';
}

export interface IntegrationSettings {
    webhookUrl: string;
    slackEnabled: boolean;
    slackWorkspace: string;
    pagerDutyEnabled: boolean;
    pagerDutyKey: string;
    opsGenieEnabled: boolean;
    opsGenieKey: string;
}

export interface SystemSettings {
    instanceName: string;
    environment: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    retentionDays: number;
    maxExecutions: number;
}

export interface AllSettings {
    notifications: NotificationSettings;
    autonomous: AutonomousSettings;
    display: DisplaySettings;
    integrations: IntegrationSettings;
    system: SystemSettings;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_SETTINGS: AllSettings = {
    notifications: {
        enabled: true,
        level: 'all',
        sound: true,
        desktop: true,
        email: false,
        emailAddress: '',
        slack: false,
        slackWebhook: '',
    },
    autonomous: {
        enabled: false,
        autoRemediate: false,
        autoAcknowledge: true,
        confidenceThreshold: 80,
        requireApproval: true,
        approvalTimeout: 300,
        excludedCategories: [],
        excludedSeverities: [],
    },
    display: {
        theme: 'dark',
        compactMode: false,
        showAnimations: true,
        refreshInterval: 30,
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
    },
    integrations: {
        webhookUrl: '',
        slackEnabled: false,
        slackWorkspace: '',
        pagerDutyEnabled: false,
        pagerDutyKey: '',
        opsGenieEnabled: false,
        opsGenieKey: '',
    },
    system: {
        instanceName: 'AIOps Platform',
        environment: 'development',
        logLevel: 'info',
        retentionDays: 30,
        maxExecutions: 1000,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<AllSettings> {
    // Try to fetch from backend first
    try {
        const response = await fetch(`${API_BASE}/api/settings`);
        if (response.ok) {
            return response.json();
        }
    } catch {
        // Fall back to local storage
    }

    // Load from local storage
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
        try {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch {
            return DEFAULT_SETTINGS;
        }
    }

    return DEFAULT_SETTINGS;
}

/**
 * Save all settings
 */
export async function saveAllSettings(settings: AllSettings): Promise<void> {
    // Try to save to backend
    try {
        const response = await fetch(`${API_BASE}/api/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
        if (response.ok) return;
    } catch {
        // Fall back to local storage
    }

    // Save to local storage
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Get notification settings
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
    const settings = await getAllSettings();
    return settings.notifications;
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(notifications: Partial<NotificationSettings>): Promise<void> {
    const settings = await getAllSettings();
    settings.notifications = { ...settings.notifications, ...notifications };
    await saveAllSettings(settings);
}

/**
 * Get autonomous settings
 */
export async function getAutonomousSettings(): Promise<AutonomousSettings> {
    const settings = await getAllSettings();
    return settings.autonomous;
}

/**
 * Update autonomous settings
 */
export async function updateAutonomousSettings(autonomous: Partial<AutonomousSettings>): Promise<void> {
    const settings = await getAllSettings();
    settings.autonomous = { ...settings.autonomous, ...autonomous };
    await saveAllSettings(settings);
}

/**
 * Get display settings
 */
export async function getDisplaySettings(): Promise<DisplaySettings> {
    const settings = await getAllSettings();
    return settings.display;
}

/**
 * Update display settings
 */
export async function updateDisplaySettings(display: Partial<DisplaySettings>): Promise<void> {
    const settings = await getAllSettings();
    settings.display = { ...settings.display, ...display };
    await saveAllSettings(settings);
}

/**
 * Get integration settings
 */
export async function getIntegrationSettings(): Promise<IntegrationSettings> {
    const settings = await getAllSettings();
    return settings.integrations;
}

/**
 * Update integration settings
 */
export async function updateIntegrationSettings(integrations: Partial<IntegrationSettings>): Promise<void> {
    const settings = await getAllSettings();
    settings.integrations = { ...settings.integrations, ...integrations };
    await saveAllSettings(settings);
}

/**
 * Reset all settings to defaults
 */
export async function resetAllSettings(): Promise<AllSettings> {
    await saveAllSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
}

/**
 * Export settings as JSON
 */
export async function exportSettings(): Promise<string> {
    const settings = await getAllSettings();
    return JSON.stringify(settings, null, 2);
}

/**
 * Import settings from JSON
 */
export async function importSettings(json: string): Promise<AllSettings> {
    const settings = JSON.parse(json) as AllSettings;
    await saveAllSettings(settings);
    return settings;
}

/**
 * Test notification channel
 */
export async function testNotificationChannel(channel: 'email' | 'slack' | 'desktop'): Promise<{
    success: boolean;
    message: string;
}> {
    if (channel === 'desktop') {
        // Test browser notification
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                new Notification('AIOps Test', { body: 'Desktop notifications are working!' });
                return { success: true, message: 'Desktop notification sent!' };
            }
            return { success: false, message: 'Permission denied for desktop notifications' };
        }
        return { success: false, message: 'Desktop notifications not supported' };
    }

    // Test backend notification channels
    try {
        const response = await fetch(`${API_BASE}/api/settings/test-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
        });
        if (!response.ok) throw new Error('Failed to test');
        return response.json();
    } catch {
        return { success: false, message: `Failed to test ${channel} notification` };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get setting category icon
 */
export function getSettingCategoryIcon(category: keyof AllSettings): string {
    const icons: Record<keyof AllSettings, string> = {
        notifications: '🔔',
        autonomous: '🤖',
        display: '🎨',
        integrations: '🔗',
        system: '⚙️',
    };
    return icons[category];
}

/**
 * Get setting category description
 */
export function getSettingCategoryDescription(category: keyof AllSettings): string {
    const descriptions: Record<keyof AllSettings, string> = {
        notifications: 'Configure how you receive alerts and notifications',
        autonomous: 'Set up autonomous remediation and auto-healing',
        display: 'Customize the look and feel of the dashboard',
        integrations: 'Connect with Slack, PagerDuty, and other services',
        system: 'Manage system-wide settings and preferences',
    };
    return descriptions[category];
}

export default {
    getAllSettings,
    saveAllSettings,
    getNotificationSettings,
    updateNotificationSettings,
    getAutonomousSettings,
    updateAutonomousSettings,
    getDisplaySettings,
    updateDisplaySettings,
    getIntegrationSettings,
    updateIntegrationSettings,
    resetAllSettings,
    exportSettings,
    importSettings,
    testNotificationChannel,
    getSettingCategoryIcon,
    getSettingCategoryDescription,
    DEFAULT_SETTINGS,
};
