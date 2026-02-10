/**
 * Enterprise Icon System - Lucide React Icons
 * 
 * Centralized icon exports with consistent sizing and semantic naming.
 * All icons use 18px default size for inline use, 20px for headers.
 */

import {
    // Navigation & Layout
    LayoutDashboard,
    Terminal,
    Workflow,
    Settings,
    ChevronRight,
    ChevronDown,
    Menu,
    X,

    // Status & Alerts
    AlertCircle,
    AlertTriangle,
    AlertOctagon,
    CheckCircle,
    XCircle,
    Info,
    HelpCircle,

    // Actions
    Play,
    Pause,
    Square,
    RotateCw,
    RefreshCw,
    Copy,
    Trash2,
    Edit,
    Plus,
    Minus,
    Save,
    Download,
    Upload,
    ExternalLink,
    Loader2,
    Inbox,
    Plug,

    // Categories & Types
    Wrench,
    FileText,
    User,
    Users,
    Bot,
    Key,
    Container,
    Globe,
    Database,
    Server,
    HardDrive,
    Cpu,
    MemoryStick,
    Wifi,
    Shield,
    Lock,
    FolderOpen,

    // Data & Analytics
    BarChart3,
    LineChart,
    PieChart,
    TrendingUp,
    TrendingDown,
    Activity,
    Zap,
    Flame,

    // Time & History
    Clock,
    History,
    Calendar,
    Timer,

    // Communication
    Radio,
    Bell,
    MessageSquare,
    Send,

    // Search & Filter
    Search,
    Filter,
    SlidersHorizontal,

    // Misc
    Eye,
    EyeOff,
    Link,
    Unlink,
    Hash,
    Tag,
    Bookmark,
    Star,
    Heart,
    ThumbsUp,
    ThumbsDown,
    ArrowRight,
    ArrowLeft,
    Moon,
    Power,
    Radar,
    PartyPopper,
    Monitor,
    Lightbulb,
} from 'lucide-react';

// Re-export all icons
export {
    // Navigation & Layout
    LayoutDashboard,
    Terminal,
    Workflow,
    Settings,
    ChevronRight,
    ChevronDown,
    Menu,
    X,

    // Status & Alerts
    AlertCircle,
    AlertTriangle,
    AlertOctagon,
    CheckCircle,
    XCircle,
    Info,
    HelpCircle,

    // Actions
    Play,
    Pause,
    Square,
    RotateCw,
    RefreshCw,
    Copy,
    Trash2,
    Edit,
    Plus,
    Minus,
    Save,
    Download,
    Upload,
    ExternalLink,
    Loader2,
    Inbox,
    Plug,

    // Categories & Types
    Wrench,
    FileText,
    User,
    Users,
    Bot,
    Key,
    Container,
    Globe,
    Database,
    Server,
    HardDrive,
    Cpu,
    MemoryStick,
    Wifi,
    Shield,
    Lock,
    FolderOpen,

    // Data & Analytics
    BarChart3,
    LineChart,
    PieChart,
    TrendingUp,
    TrendingDown,
    Activity,
    Zap,
    Flame,

    // Time & History
    Clock,
    History,
    Calendar,
    Timer,

    // Communication
    Radio,
    Bell,
    MessageSquare,
    Send,

    // Search & Filter
    Search,
    Filter,
    SlidersHorizontal,

    // Misc
    Eye,
    EyeOff,
    Link,
    Unlink,
    Hash,
    Tag,
    Bookmark,
    Star,
    Heart,
    ThumbsUp,
    ThumbsDown,
    ArrowRight,
    ArrowLeft,
    Moon,
    Power,
    Radar,
    PartyPopper,
    Monitor,
    Lightbulb,
};

// ═══════════════════════════════════════════════════════════════════════════
// ICON SIZE PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export const ICON_SIZE = {
    xs: 14,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 24,
    '2xl': 32,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC ICON MAPPINGS (for category/status icons)
// ═══════════════════════════════════════════════════════════════════════════

// Workflow Category Icons
export const CategoryIcons = {
    general: FileText,
    memory: MemoryStick,
    disk: HardDrive,
    cpu: Cpu,
    network: Wifi,
    container: Container,
    database: Database,
    security: Shield,
    kubernetes: Container,
    application: Workflow,
} as const;

// Execution Status Icons
export const ExecutionStatusIcons = {
    pending: Clock,
    running: RefreshCw,
    completed: CheckCircle,
    failed: XCircle,
    cancelled: XCircle,
    paused: Pause,
} as const;

// Executor Type Icons
export const ExecutorTypeIcons = {
    ssh: Key,
    docker: Container,
    api: Globe,
} as const;

// Health Status Icons
export const HealthStatusIcons = {
    healthy: CheckCircle,
    degraded: AlertTriangle,
    unhealthy: XCircle,
    unknown: HelpCircle,
} as const;

// Container Status Icons
export const ContainerStatusIcons = {
    running: Activity,
    exited: Square,
    paused: Pause,
    restarting: RefreshCw,
    created: Plus,
    removing: Trash2,
    dead: XCircle,
} as const;

// Severity Icons
export const SeverityIcons = {
    critical: AlertOctagon,
    high: AlertTriangle,
    medium: AlertCircle,
    low: Info,
    P0_CRITICAL: AlertOctagon,
    P1_HIGH: AlertTriangle,
    P2_MEDIUM: AlertCircle,
    P3_LOW: Info,
} as const;
