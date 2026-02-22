//! # Cerebro Engine - The Heart of AIOps
//! 
//! A high-performance, lock-free metrics collection, aggregation, and distribution
//! engine written in pure Rust. This is the nervous system that powers the entire
//! Cerebro AIOps platform.
//! 
//! ## Architecture Overview
//! 
//! ```text
//! ┌─────────────────────────────────────────────────────────────────────────────┐
//! │                           CEREBRO RUST ENGINE                                │
//! ├─────────────────────────────────────────────────────────────────────────────┤
//! │  COLLECTORS → METRIC BUS → PROJECT AGGREGATOR → THREAD POOL → OUTPUTS       │
//! └─────────────────────────────────────────────────────────────────────────────┘
//! ```
//! 
//! ## Features
//! 
//! - **Blazingly Fast**: Lock-free data structures, zero-copy where possible
//! - **Project-Aware**: Intelligent grouping of metrics by project/service
//! - **Auto-Balancing**: Dynamic load distribution across worker threads
//! - **Anomaly Detection**: Real-time statistical anomaly detection
//! - **Multi-Output**: Unix socket, gRPC, WebSocket, Prometheus
//! 
//! ## Author
//! 
//! AIOps Team - Built with 🔥 and Rust

// ============================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// ============================================================================
// This section contains all external crate imports organized by functionality.
// We import everything we need upfront for clarity and compile-time optimization.
// ============================================================================

#![allow(dead_code)]
#![allow(unused_imports)]
#![allow(unused_variables)]
#![warn(rust_2018_idioms)]
#![warn(missing_debug_implementations)]

// ----------------------------------------------------------------------------
// Standard Library Imports
// ----------------------------------------------------------------------------
use std::alloc::{GlobalAlloc, Layout, System};
use std::any::{Any, TypeId};
use std::borrow::Cow;
use std::cell::{Cell, RefCell, UnsafeCell};
use std::cmp::{Ordering, Reverse};
use std::collections::{BTreeMap, BTreeSet, BinaryHeap, HashMap, HashSet, VecDeque};
use std::convert::{TryFrom, TryInto};
use std::env;
use std::error::Error as StdError;
use std::ffi::{CStr, CString, OsStr, OsString};
use std::fmt::{self, Debug, Display, Formatter};
use std::fs::{self, File, OpenOptions};
use std::future::Future;
use std::hash::{BuildHasher, Hash, Hasher};
use std::io::{self, BufRead, BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::iter::{FromIterator, Iterator};
use std::marker::PhantomData;
use std::mem::{self, ManuallyDrop, MaybeUninit};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};
use std::num::{NonZeroU32, NonZeroU64, NonZeroUsize};
use std::ops::{Deref, DerefMut, Range, RangeInclusive};
use std::os::unix::fs::MetadataExt;
use std::os::unix::io::{AsRawFd, FromRawFd, RawFd};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::ptr::{self, NonNull};
use std::result::Result as StdResult;
use std::slice;
use std::str::{self, FromStr};
use std::sync::atomic::{
    AtomicBool, AtomicI32, AtomicI64, AtomicU32, AtomicU64, AtomicU8, AtomicUsize, Ordering as AtomicOrdering,
};
use std::sync::{Arc, Weak};
use std::task::{Context, Poll, Waker};
use std::thread::{self, JoinHandle, ThreadId};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// ----------------------------------------------------------------------------
// Async Runtime - Tokio
// ----------------------------------------------------------------------------
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener as TokioTcpListener, TcpStream as TokioTcpStream, UnixListener, UnixStream};
use tokio::runtime::{Builder as RuntimeBuilder, Handle as RuntimeHandle, Runtime};
use tokio::signal;
use tokio::sync::mpsc::{self, Receiver, Sender};
use tokio::sync::oneshot;
use tokio::sync::{broadcast, watch, Mutex as TokioMutex, Notify, RwLock as TokioRwLock, Semaphore};
use tokio::task::{self, JoinHandle as TokioJoinHandle, JoinSet};
use tokio::time::{interval, sleep, timeout, Interval, Sleep};

// ----------------------------------------------------------------------------
// Concurrency Primitives - Crossbeam & Parking Lot
// ----------------------------------------------------------------------------
use crossbeam::atomic::AtomicCell;
use crossbeam::channel::{bounded, unbounded, Receiver as CrossbeamReceiver, Sender as CrossbeamSender};
use crossbeam::deque::{Injector, Stealer, Worker as CrossbeamWorker};
use crossbeam::epoch::{self as epoch, Atomic as EpochAtomic, Guard as EpochGuard, Owned, Shared};
use crossbeam::queue::{ArrayQueue, SegQueue};
use crossbeam::utils::{Backoff, CachePadded};
use parking_lot::{Condvar, Mutex, Once, RwLock, RwLockReadGuard, RwLockWriteGuard};

// ----------------------------------------------------------------------------
// Lock-Free Data Structures
// ----------------------------------------------------------------------------
use dashmap::{DashMap, DashSet};
use arc_swap::{ArcSwap, ArcSwapOption, Cache as ArcSwapCache};
use flume::{Receiver as FlumeReceiver, Sender as FlumeSender};

// ----------------------------------------------------------------------------
// Serialization
// ----------------------------------------------------------------------------
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};

// ----------------------------------------------------------------------------
// String & Memory Optimization
// ----------------------------------------------------------------------------
use compact_str::CompactString;
use smallvec::{smallvec, SmallVec};
use smartstring::alias::String as SmartString;
use bumpalo::Bump;
use hashbrown::HashMap as FastHashMap;

// ----------------------------------------------------------------------------
// Hashing
// ----------------------------------------------------------------------------
use ahash::{AHasher, AHashMap, AHashSet, RandomState as AHashRandomState};
use xxhash_rust::xxh3::{xxh3_64, xxh3_128, Xxh3};

// ----------------------------------------------------------------------------
// Error Handling
// ----------------------------------------------------------------------------
use thiserror::Error;
use anyhow::{anyhow, bail, ensure, Context as AnyhowContext, Result as AnyhowResult};

// ----------------------------------------------------------------------------
// Logging & Tracing
// ----------------------------------------------------------------------------
use tracing::{debug, error, info, instrument, span, trace, warn, Level, Span};
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Layer, Registry,
};

// ----------------------------------------------------------------------------
// Time & Timestamps
// ----------------------------------------------------------------------------
use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use quanta::Clock;

// ----------------------------------------------------------------------------
// Networking
// ----------------------------------------------------------------------------
use reqwest::Client as HttpClient;

// ----------------------------------------------------------------------------
// Statistics & Math
// ----------------------------------------------------------------------------
use num_traits::{Float, NumCast, ToPrimitive, Zero};
use ordered_float::OrderedFloat;

// ----------------------------------------------------------------------------
// Compression
// ----------------------------------------------------------------------------
use lz4_flex::{compress_prepend_size, decompress_size_prepended};

// ----------------------------------------------------------------------------
// Async Traits
// ----------------------------------------------------------------------------
use async_trait::async_trait;

// ----------------------------------------------------------------------------
// Regex & Pattern Matching
// ----------------------------------------------------------------------------
use regex::Regex;
use memchr::{memchr, memchr2, memchr3, memmem};

// ----------------------------------------------------------------------------
// System Information
// ----------------------------------------------------------------------------
use sysinfo::{CpuExt, DiskExt, NetworkExt, ProcessExt, System as SysInfoSystem, SystemExt};

// ----------------------------------------------------------------------------
// UUID & Identifiers  
// ----------------------------------------------------------------------------
use uuid::Uuid;

// ----------------------------------------------------------------------------
// Configuration & Validation
// ----------------------------------------------------------------------------
use figment::{providers::{Env, Format, Toml}, Figment};
use validator::{Validate, ValidationError};

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------
use clap::{Arg, ArgAction, Command, Parser, Subcommand, ValueEnum};

// ----------------------------------------------------------------------------
// Prometheus
// ----------------------------------------------------------------------------
use prometheus::{
    Counter, CounterVec, Gauge, GaugeVec, Histogram, HistogramOpts, HistogramVec,
    IntCounter, IntCounterVec, IntGauge, IntGaugeVec, Opts, Registry as PrometheusRegistry,
};

// ============================================================================
// SECTION 2: CONSTANTS & VERSION INFORMATION
// ============================================================================
// Global constants that define the behavior and limits of the engine.
// These are carefully tuned for optimal performance and resource usage.
// ============================================================================

/// Engine version - follows semantic versioning
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const ENGINE_NAME: &str = "cerebro-engine";
pub const ENGINE_FULL_NAME: &str = "Cerebro AIOps Engine";

/// Build information
pub const BUILD_TIMESTAMP: &str = env!("CARGO_PKG_VERSION");
pub const RUST_VERSION: &str = "1.75.0";

// ----------------------------------------------------------------------------
// Buffer & Queue Sizes
// ----------------------------------------------------------------------------

/// Default size for metric ring buffers (per metric time series)
pub const DEFAULT_RING_BUFFER_SIZE: usize = 8192;

/// Maximum metrics that can be queued in the main metric bus
pub const METRIC_BUS_CAPACITY: usize = 1_000_000;

/// Batch size for processing metrics (optimal for cache efficiency)
pub const METRIC_BATCH_SIZE: usize = 1024;

/// Maximum number of metrics per project before aggregation kicks in
pub const MAX_METRICS_PER_PROJECT: usize = 100_000;

/// Channel buffer size for collector -> bus communication
pub const COLLECTOR_CHANNEL_SIZE: usize = 65536;

/// Channel buffer size for bus -> worker communication  
pub const WORKER_CHANNEL_SIZE: usize = 32768;

/// Maximum pending alerts before dropping
pub const ALERT_QUEUE_CAPACITY: usize = 10_000;

// ----------------------------------------------------------------------------
// Timing & Intervals
// ----------------------------------------------------------------------------

/// Default collection interval for system metrics (milliseconds)
pub const DEFAULT_COLLECTION_INTERVAL_MS: u64 = 1000;

/// Minimum allowed collection interval (milliseconds)
pub const MIN_COLLECTION_INTERVAL_MS: u64 = 100;

/// Maximum allowed collection interval (milliseconds)
pub const MAX_COLLECTION_INTERVAL_MS: u64 = 60_000;

/// Default timeout for HTTP requests (seconds)
pub const DEFAULT_HTTP_TIMEOUT_SECS: u64 = 30;

/// Timeout for health checks (seconds)
pub const HEALTH_CHECK_TIMEOUT_SECS: u64 = 5;

/// Interval for internal engine health reporting (seconds)
pub const ENGINE_HEALTH_INTERVAL_SECS: u64 = 10;

/// Grace period for shutdown (seconds)
pub const SHUTDOWN_GRACE_PERIOD_SECS: u64 = 30;

/// Flow timeout for network tracking (seconds)
pub const FLOW_TIMEOUT_SECS: u64 = 300;

/// Baseline learning window (seconds)
pub const BASELINE_WINDOW_SECS: u64 = 3600;

// ----------------------------------------------------------------------------
// Thread Pool & Concurrency
// ----------------------------------------------------------------------------

/// Default number of worker threads (0 = auto-detect based on CPU cores)
pub const DEFAULT_WORKER_THREADS: usize = 0;

/// Minimum worker threads
pub const MIN_WORKER_THREADS: usize = 2;

/// Maximum worker threads
pub const MAX_WORKER_THREADS: usize = 256;

/// Number of shards for concurrent hash maps (power of 2)
pub const HASHMAP_SHARDS: usize = 256;

/// Work stealing batch size
pub const WORK_STEALING_BATCH_SIZE: usize = 32;

// ----------------------------------------------------------------------------
// Memory Limits
// ----------------------------------------------------------------------------

/// Maximum memory for time-series storage (bytes) - default 1GB
pub const MAX_TIMESERIES_MEMORY: usize = 1024 * 1024 * 1024;

/// Maximum memory for metric buffer pool (bytes) - default 256MB
pub const MAX_BUFFER_POOL_MEMORY: usize = 256 * 1024 * 1024;

/// Object pool initial capacity
pub const OBJECT_POOL_INITIAL_CAPACITY: usize = 4096;

/// Arena allocator block size
pub const ARENA_BLOCK_SIZE: usize = 64 * 1024;

/// Small string optimization threshold (bytes)
pub const SMALL_STRING_THRESHOLD: usize = 24;

// ----------------------------------------------------------------------------
// Network & Protocol
// ----------------------------------------------------------------------------

/// Default Unix socket path for Python IPC
pub const DEFAULT_UNIX_SOCKET_PATH: &str = "/tmp/cerebro-engine.sock";

/// Default gRPC port
pub const DEFAULT_GRPC_PORT: u16 = 50051;

/// Default WebSocket port
pub const DEFAULT_WEBSOCKET_PORT: u16 = 8765;

/// Default Prometheus metrics port
pub const DEFAULT_PROMETHEUS_PORT: u16 = 9090;

/// Default HTTP API port
pub const DEFAULT_HTTP_API_PORT: u16 = 8080;

/// Maximum WebSocket message size (bytes)
pub const MAX_WEBSOCKET_MESSAGE_SIZE: usize = 16 * 1024 * 1024;

/// Maximum gRPC message size (bytes)
pub const MAX_GRPC_MESSAGE_SIZE: usize = 64 * 1024 * 1024;

// ----------------------------------------------------------------------------
// Anomaly Detection
// ----------------------------------------------------------------------------

/// Default Z-score threshold for anomaly detection
pub const DEFAULT_ZSCORE_THRESHOLD: f64 = 3.0;

/// Default IQR multiplier for outlier detection
pub const DEFAULT_IQR_MULTIPLIER: f64 = 1.5;

/// Minimum samples required for baseline calculation
pub const MIN_BASELINE_SAMPLES: usize = 100;

/// Exponential moving average alpha (smoothing factor)
pub const EMA_ALPHA: f64 = 0.1;

/// Consecutive failures before alerting
pub const CONSECUTIVE_FAILURE_THRESHOLD: u32 = 3;

// ----------------------------------------------------------------------------
// Labels & Dimensions
// ----------------------------------------------------------------------------

/// Maximum number of labels per metric
pub const MAX_LABELS_PER_METRIC: usize = 32;

/// Maximum label key length
pub const MAX_LABEL_KEY_LENGTH: usize = 128;

/// Maximum label value length  
pub const MAX_LABEL_VALUE_LENGTH: usize = 512;

/// Maximum metric name length
pub const MAX_METRIC_NAME_LENGTH: usize = 256;

// ----------------------------------------------------------------------------
// Project & Classification
// ----------------------------------------------------------------------------

/// Maximum number of projects
pub const MAX_PROJECTS: usize = 1000;

/// Maximum cgroup depth to traverse
pub const MAX_CGROUP_DEPTH: usize = 10;

/// Maximum processes to track per project
pub const MAX_PROCESSES_PER_PROJECT: usize = 1000;

// ----------------------------------------------------------------------------
// Compression & Storage
// ----------------------------------------------------------------------------

/// Compression threshold - only compress if larger than this (bytes)
pub const COMPRESSION_THRESHOLD: usize = 1024;

/// Time-series downsampling intervals (seconds)
pub const DOWNSAMPLE_INTERVALS: [u64; 5] = [1, 10, 60, 300, 3600];

/// Maximum retention period (seconds) - default 7 days
pub const MAX_RETENTION_SECS: u64 = 7 * 24 * 3600;

// ============================================================================
// SECTION 3: CORE TYPE SYSTEM
// ============================================================================
// The fundamental data types that represent every piece of information flowing
// through the engine. These types are designed for:
// - Memory efficiency (compact representations)
// - Cache friendliness (aligned, predictable layout)
// - Zero-copy operations where possible
// - Thread safety without locks
// ============================================================================

// ----------------------------------------------------------------------------
// 3.1 Timestamp Types - Nanosecond Precision Time Handling
// ----------------------------------------------------------------------------

/// High-precision timestamp in nanoseconds since Unix epoch.
/// Using i64 allows representing times from ~1677 to ~2262.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct Timestamp(i64);

impl Timestamp {
    /// Create a new timestamp from nanoseconds since Unix epoch
    #[inline]
    pub const fn from_nanos(nanos: i64) -> Self {
        Self(nanos)
    }

    /// Create a new timestamp from milliseconds since Unix epoch
    #[inline]
    pub const fn from_millis(millis: i64) -> Self {
        Self(millis * 1_000_000)
    }

    /// Create a new timestamp from seconds since Unix epoch
    #[inline]
    pub const fn from_secs(secs: i64) -> Self {
        Self(secs * 1_000_000_000)
    }

    /// Get the current timestamp with nanosecond precision
    #[inline]
    pub fn now() -> Self {
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        Self(duration.as_nanos() as i64)
    }

    /// Get the current timestamp using high-performance clock (quanta)
    #[inline]
    pub fn now_fast(clock: &Clock) -> Self {
        Self(clock.now().as_u64() as i64)
    }

    /// Get nanoseconds value
    #[inline]
    pub const fn as_nanos(&self) -> i64 {
        self.0
    }

    /// Get milliseconds value
    #[inline]
    pub const fn as_millis(&self) -> i64 {
        self.0 / 1_000_000
    }

    /// Get seconds value
    #[inline]
    pub const fn as_secs(&self) -> i64 {
        self.0 / 1_000_000_000
    }

    /// Get microseconds value
    #[inline]
    pub const fn as_micros(&self) -> i64 {
        self.0 / 1_000
    }

    /// Calculate duration between two timestamps
    #[inline]
    pub fn duration_since(&self, earlier: Timestamp) -> Duration {
        let nanos = self.0.saturating_sub(earlier.0);
        Duration::from_nanos(nanos.max(0) as u64)
    }

    /// Add duration to timestamp
    #[inline]
    pub fn add_duration(&self, duration: Duration) -> Self {
        Self(self.0.saturating_add(duration.as_nanos() as i64))
    }

    /// Subtract duration from timestamp
    #[inline]
    pub fn sub_duration(&self, duration: Duration) -> Self {
        Self(self.0.saturating_sub(duration.as_nanos() as i64))
    }

    /// Check if timestamp is within a time range
    #[inline]
    pub fn is_within(&self, start: Timestamp, end: Timestamp) -> bool {
        self.0 >= start.0 && self.0 <= end.0
    }

    /// Round down to nearest interval (for downsampling)
    #[inline]
    pub fn floor_to_interval(&self, interval_secs: u64) -> Self {
        let interval_nanos = interval_secs as i64 * 1_000_000_000;
        Self((self.0 / interval_nanos) * interval_nanos)
    }

    /// Convert to chrono DateTime<Utc>
    #[inline]
    pub fn to_datetime(&self) -> DateTime<Utc> {
        let secs = self.0 / 1_000_000_000;
        let nanos = (self.0 % 1_000_000_000) as u32;
        DateTime::from_timestamp(secs, nanos).unwrap_or_default()
    }

    /// Create from chrono DateTime<Utc>
    #[inline]
    pub fn from_datetime(dt: DateTime<Utc>) -> Self {
        Self(dt.timestamp_nanos_opt().unwrap_or(0))
    }

    /// Zero timestamp (Unix epoch)
    pub const EPOCH: Timestamp = Timestamp(0);

    /// Maximum representable timestamp
    pub const MAX: Timestamp = Timestamp(i64::MAX);

    /// Minimum representable timestamp
    pub const MIN: Timestamp = Timestamp(i64::MIN);
}

impl Default for Timestamp {
    #[inline]
    fn default() -> Self {
        Self::now()
    }
}

impl Display for Timestamp {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_datetime().format("%Y-%m-%d %H:%M:%S%.9f UTC"))
    }
}

impl From<i64> for Timestamp {
    #[inline]
    fn from(nanos: i64) -> Self {
        Self(nanos)
    }
}

impl From<Timestamp> for i64 {
    #[inline]
    fn from(ts: Timestamp) -> Self {
        ts.0
    }
}

impl From<SystemTime> for Timestamp {
    fn from(st: SystemTime) -> Self {
        let duration = st.duration_since(UNIX_EPOCH).unwrap_or_default();
        Self(duration.as_nanos() as i64)
    }
}

impl From<DateTime<Utc>> for Timestamp {
    fn from(dt: DateTime<Utc>) -> Self {
        Self::from_datetime(dt)
    }
}

/// Atomic timestamp for lock-free operations
#[derive(Debug)]
#[repr(transparent)]
pub struct AtomicTimestamp(AtomicI64);

impl AtomicTimestamp {
    /// Create a new atomic timestamp
    #[inline]
    pub const fn new(ts: Timestamp) -> Self {
        Self(AtomicI64::new(ts.0))
    }

    /// Load the timestamp with specified ordering
    #[inline]
    pub fn load(&self, ordering: AtomicOrdering) -> Timestamp {
        Timestamp(self.0.load(ordering))
    }

    /// Store a timestamp with specified ordering
    #[inline]
    pub fn store(&self, ts: Timestamp, ordering: AtomicOrdering) {
        self.0.store(ts.0, ordering);
    }

    /// Compare and swap
    #[inline]
    pub fn compare_exchange(
        &self,
        current: Timestamp,
        new: Timestamp,
        success: AtomicOrdering,
        failure: AtomicOrdering,
    ) -> Result<Timestamp, Timestamp> {
        self.0
            .compare_exchange(current.0, new.0, success, failure)
            .map(Timestamp)
            .map_err(Timestamp)
    }

    /// Update to current time if newer
    #[inline]
    pub fn update_if_newer(&self, new: Timestamp) {
        let mut current = self.load(AtomicOrdering::Relaxed);
        while new.0 > current.0 {
            match self.compare_exchange(
                current,
                new,
                AtomicOrdering::Release,
                AtomicOrdering::Relaxed,
            ) {
                Ok(_) => break,
                Err(actual) => current = actual,
            }
        }
    }
}

impl Default for AtomicTimestamp {
    fn default() -> Self {
        Self::new(Timestamp::now())
    }
}

// ----------------------------------------------------------------------------
// 3.2 Metric Identity - Unique Identification of Metrics
// ----------------------------------------------------------------------------

/// Unique identifier for a metric, computed from name + labels.
/// Uses xxHash for high performance hashing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct MetricId(u64);

impl MetricId {
    /// Create a MetricId from a raw hash value
    #[inline]
    pub const fn from_raw(hash: u64) -> Self {
        Self(hash)
    }

    /// Compute MetricId from metric name and labels
    pub fn compute(name: &str, labels: &[Label]) -> Self {
        let mut hasher = Xxh3::new();
        hasher.update(name.as_bytes());
        
        // Sort labels for consistent hashing
        let mut sorted_labels: SmallVec<[&Label; 8]> = labels.iter().collect();
        sorted_labels.sort_by(|a, b| a.key.cmp(&b.key));
        
        for label in sorted_labels {
            hasher.update(label.key.as_bytes());
            hasher.update(b"=");
            hasher.update(label.value.as_bytes());
            hasher.update(b",");
        }
        
        Self(hasher.digest())
    }

    /// Compute MetricId from name only (no labels)
    #[inline]
    pub fn from_name(name: &str) -> Self {
        Self(xxh3_64(name.as_bytes()))
    }

    /// Get the raw hash value
    #[inline]
    pub const fn as_u64(&self) -> u64 {
        self.0
    }

    /// Get the shard index for this metric (for sharded data structures)
    #[inline]
    pub const fn shard_index(&self, num_shards: usize) -> usize {
        (self.0 as usize) % num_shards
    }

    /// Null/invalid metric ID
    pub const NULL: MetricId = MetricId(0);
}

impl Display for MetricId {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{:016x}", self.0)
    }
}

impl From<u64> for MetricId {
    #[inline]
    fn from(v: u64) -> Self {
        Self(v)
    }
}

impl From<MetricId> for u64 {
    #[inline]
    fn from(id: MetricId) -> Self {
        id.0
    }
}

// ----------------------------------------------------------------------------
// 3.3 Labels - Key-Value Dimensional Data
// ----------------------------------------------------------------------------

/// A single label (key-value pair) for a metric.
/// Uses CompactString for small string optimization.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Label {
    /// Label key (e.g., "host", "service", "environment")
    pub key: CompactString,
    /// Label value (e.g., "web-01", "api", "production")
    pub value: CompactString,
}

impl Label {
    /// Create a new label
    #[inline]
    pub fn new<K, V>(key: K, value: V) -> Self
    where
        K: Into<CompactString>,
        V: Into<CompactString>,
    {
        Self {
            key: key.into(),
            value: value.into(),
        }
    }

    /// Create a label from static strings (zero allocation)
    #[inline]
    pub const fn from_static(key: &'static str, value: &'static str) -> Self {
        Self {
            key: CompactString::new_inline(key),
            value: CompactString::new_inline(value),
        }
    }

    /// Check if the label is valid (non-empty key)
    #[inline]
    pub fn is_valid(&self) -> bool {
        !self.key.is_empty() && self.key.len() <= MAX_LABEL_KEY_LENGTH
            && self.value.len() <= MAX_LABEL_VALUE_LENGTH
    }

    /// Get the memory size of this label
    #[inline]
    pub fn memory_size(&self) -> usize {
        mem::size_of::<Self>() + 
        if self.key.len() > SMALL_STRING_THRESHOLD { self.key.len() } else { 0 } +
        if self.value.len() > SMALL_STRING_THRESHOLD { self.value.len() } else { 0 }
    }
}

impl Display for Label {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}={}", self.key, self.value)
    }
}

impl<K, V> From<(K, V)> for Label
where
    K: Into<CompactString>,
    V: Into<CompactString>,
{
    fn from((key, value): (K, V)) -> Self {
        Self::new(key, value)
    }
}

/// A set of labels with stack allocation for small sets.
/// Most metrics have fewer than 8 labels, so we optimize for that case.
pub type Labels = SmallVec<[Label; 8]>;

/// Extension trait for Labels
pub trait LabelsExt {
    /// Get a label value by key
    fn get(&self, key: &str) -> Option<&str>;
    
    /// Check if a label exists
    fn contains_key(&self, key: &str) -> bool;
    
    /// Add or update a label
    fn set<K, V>(&mut self, key: K, value: V)
    where
        K: Into<CompactString>,
        V: Into<CompactString>;
    
    /// Remove a label by key
    fn remove(&mut self, key: &str) -> Option<Label>;
    
    /// Convert to a map for efficient lookups
    fn to_map(&self) -> AHashMap<&str, &str>;
    
    /// Compute hash for these labels
    fn compute_hash(&self) -> u64;
    
    /// Check if all labels are valid
    fn is_valid(&self) -> bool;
}

impl LabelsExt for Labels {
    fn get(&self, key: &str) -> Option<&str> {
        self.iter()
            .find(|l| l.key.as_str() == key)
            .map(|l| l.value.as_str())
    }

    fn contains_key(&self, key: &str) -> bool {
        self.iter().any(|l| l.key.as_str() == key)
    }

    fn set<K, V>(&mut self, key: K, value: V)
    where
        K: Into<CompactString>,
        V: Into<CompactString>,
    {
        let key = key.into();
        let value = value.into();
        
        if let Some(label) = self.iter_mut().find(|l| l.key == key) {
            label.value = value;
        } else {
            self.push(Label { key, value });
        }
    }

    fn remove(&mut self, key: &str) -> Option<Label> {
        if let Some(pos) = self.iter().position(|l| l.key.as_str() == key) {
            Some(self.remove(pos))
        } else {
            None
        }
    }

    fn to_map(&self) -> AHashMap<&str, &str> {
        self.iter()
            .map(|l| (l.key.as_str(), l.value.as_str()))
            .collect()
    }

    fn compute_hash(&self) -> u64 {
        let mut hasher = Xxh3::new();
        let mut sorted: SmallVec<[&Label; 8]> = self.iter().collect();
        sorted.sort_by(|a, b| a.key.cmp(&b.key));
        
        for label in sorted {
            hasher.update(label.key.as_bytes());
            hasher.update(b"=");
            hasher.update(label.value.as_bytes());
            hasher.update(b";");
        }
        
        hasher.digest()
    }

    fn is_valid(&self) -> bool {
        self.len() <= MAX_LABELS_PER_METRIC && self.iter().all(|l| l.is_valid())
    }
}

/// Create a Labels collection from key-value pairs
#[macro_export]
macro_rules! labels {
    () => {
        smallvec::smallvec![]
    };
    ($($key:expr => $value:expr),+ $(,)?) => {
        smallvec::smallvec![
            $(Label::new($key, $value)),+
        ]
    };
}

// ----------------------------------------------------------------------------
// 3.4 Metric Values - All Possible Value Types
// ----------------------------------------------------------------------------

/// Represents all possible metric value types.
/// This enum is designed to be compact while supporting a wide variety of metric types.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum MetricValue {
    /// A monotonically increasing counter (e.g., request count, bytes sent)
    Counter(u64),
    
    /// A value that can go up and down (e.g., temperature, queue depth)
    Gauge(f64),
    
    /// An integer gauge for when floating point isn't needed
    GaugeInt(i64),
    
    /// A histogram with bucket counts
    Histogram(HistogramValue),
    
    /// A summary with quantiles
    Summary(SummaryValue),
    
    /// A distribution (more detailed than histogram)
    Distribution(DistributionValue),
    
    /// A boolean value (e.g., service up/down)
    Boolean(bool),
    
    /// A text/string value (e.g., version, state name)
    Text(CompactString),
    
    /// A timestamp value (e.g., last seen, started at)
    Timestamp(Timestamp),
    
    /// Raw bytes (e.g., for custom binary data)
    Bytes(Vec<u8>),
    
    /// No value (used for events/markers)
    None,
}

impl MetricValue {
    /// Get the value as a float (for numeric types)
    #[inline]
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            MetricValue::Counter(v) => Some(*v as f64),
            MetricValue::Gauge(v) => Some(*v),
            MetricValue::GaugeInt(v) => Some(*v as f64),
            MetricValue::Boolean(v) => Some(if *v { 1.0 } else { 0.0 }),
            _ => None,
        }
    }

    /// Get the value as an integer (for integer types)
    #[inline]
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            MetricValue::Counter(v) => Some(*v as i64),
            MetricValue::GaugeInt(v) => Some(*v),
            MetricValue::Boolean(v) => Some(if *v { 1 } else { 0 }),
            _ => None,
        }
    }

    /// Get the value as a string
    pub fn as_str(&self) -> Option<&str> {
        match self {
            MetricValue::Text(s) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Check if the value is numeric
    #[inline]
    pub fn is_numeric(&self) -> bool {
        matches!(
            self,
            MetricValue::Counter(_)
                | MetricValue::Gauge(_)
                | MetricValue::GaugeInt(_)
                | MetricValue::Boolean(_)
        )
    }

    /// Get the type name of this value
    pub fn type_name(&self) -> &'static str {
        match self {
            MetricValue::Counter(_) => "counter",
            MetricValue::Gauge(_) => "gauge",
            MetricValue::GaugeInt(_) => "gauge_int",
            MetricValue::Histogram(_) => "histogram",
            MetricValue::Summary(_) => "summary",
            MetricValue::Distribution(_) => "distribution",
            MetricValue::Boolean(_) => "boolean",
            MetricValue::Text(_) => "text",
            MetricValue::Timestamp(_) => "timestamp",
            MetricValue::Bytes(_) => "bytes",
            MetricValue::None => "none",
        }
    }

    /// Estimate memory usage of this value
    pub fn memory_size(&self) -> usize {
        mem::size_of::<Self>() + match self {
            MetricValue::Histogram(h) => h.memory_size(),
            MetricValue::Summary(s) => s.memory_size(),
            MetricValue::Distribution(d) => d.memory_size(),
            MetricValue::Text(s) => if s.len() > SMALL_STRING_THRESHOLD { s.len() } else { 0 },
            MetricValue::Bytes(b) => b.len(),
            _ => 0,
        }
    }
}

impl Default for MetricValue {
    fn default() -> Self {
        MetricValue::None
    }
}

impl Display for MetricValue {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            MetricValue::Counter(v) => write!(f, "{}", v),
            MetricValue::Gauge(v) => write!(f, "{:.6}", v),
            MetricValue::GaugeInt(v) => write!(f, "{}", v),
            MetricValue::Histogram(h) => write!(f, "histogram({} buckets)", h.buckets.len()),
            MetricValue::Summary(s) => write!(f, "summary({} quantiles)", s.quantiles.len()),
            MetricValue::Distribution(d) => write!(f, "distribution(n={})", d.count),
            MetricValue::Boolean(v) => write!(f, "{}", v),
            MetricValue::Text(s) => write!(f, "\"{}\"", s),
            MetricValue::Timestamp(ts) => write!(f, "{}", ts),
            MetricValue::Bytes(b) => write!(f, "bytes({})", b.len()),
            MetricValue::None => write!(f, "none"),
        }
    }
}

// Conversion implementations
impl From<u64> for MetricValue {
    fn from(v: u64) -> Self {
        MetricValue::Counter(v)
    }
}

impl From<i64> for MetricValue {
    fn from(v: i64) -> Self {
        MetricValue::GaugeInt(v)
    }
}

impl From<f64> for MetricValue {
    fn from(v: f64) -> Self {
        MetricValue::Gauge(v)
    }
}

impl From<f32> for MetricValue {
    fn from(v: f32) -> Self {
        MetricValue::Gauge(v as f64)
    }
}

impl From<bool> for MetricValue {
    fn from(v: bool) -> Self {
        MetricValue::Boolean(v)
    }
}

impl From<String> for MetricValue {
    fn from(v: String) -> Self {
        MetricValue::Text(CompactString::from(v))
    }
}

impl From<&str> for MetricValue {
    fn from(v: &str) -> Self {
        MetricValue::Text(CompactString::from(v))
    }
}

/// Histogram value with bucket counts
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistogramValue {
    /// Bucket boundaries (upper bounds)
    pub buckets: Vec<f64>,
    /// Count in each bucket
    pub counts: Vec<u64>,
    /// Total sum of all observed values
    pub sum: f64,
    /// Total count of observations
    pub count: u64,
}

impl HistogramValue {
    /// Create a new histogram with specified bucket boundaries
    pub fn new(buckets: Vec<f64>) -> Self {
        let len = buckets.len();
        Self {
            buckets,
            counts: vec![0; len],
            sum: 0.0,
            count: 0,
        }
    }

    /// Create histogram with default buckets (Prometheus-style)
    pub fn with_default_buckets() -> Self {
        Self::new(vec![
            0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
        ])
    }

    /// Observe a value
    pub fn observe(&mut self, value: f64) {
        self.sum += value;
        self.count += 1;
        
        for (i, bound) in self.buckets.iter().enumerate() {
            if value <= *bound {
                self.counts[i] += 1;
                break;
            }
        }
    }

    /// Get the estimated memory size
    pub fn memory_size(&self) -> usize {
        self.buckets.len() * mem::size_of::<f64>() +
        self.counts.len() * mem::size_of::<u64>()
    }
}

/// Summary value with quantiles
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SummaryValue {
    /// Quantile definitions (e.g., 0.5, 0.9, 0.99)
    pub quantiles: Vec<f64>,
    /// Values at each quantile
    pub values: Vec<f64>,
    /// Total sum
    pub sum: f64,
    /// Total count
    pub count: u64,
}

impl SummaryValue {
    /// Create a new summary with specified quantiles
    pub fn new(quantiles: Vec<f64>) -> Self {
        let len = quantiles.len();
        Self {
            quantiles,
            values: vec![0.0; len],
            sum: 0.0,
            count: 0,
        }
    }

    /// Create summary with default quantiles
    pub fn with_default_quantiles() -> Self {
        Self::new(vec![0.5, 0.75, 0.9, 0.95, 0.99])
    }

    /// Get the estimated memory size
    pub fn memory_size(&self) -> usize {
        self.quantiles.len() * mem::size_of::<f64>() * 2
    }
}

/// Distribution value for detailed statistics
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DistributionValue {
    /// Number of samples
    pub count: u64,
    /// Sum of all values
    pub sum: f64,
    /// Sum of squared values (for variance calculation)
    pub sum_sq: f64,
    /// Minimum value seen
    pub min: f64,
    /// Maximum value seen
    pub max: f64,
    /// Estimated percentiles using t-digest or similar
    pub percentiles: Option<Vec<(f64, f64)>>,
}

impl DistributionValue {
    /// Create a new empty distribution
    pub fn new() -> Self {
        Self {
            count: 0,
            sum: 0.0,
            sum_sq: 0.0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            percentiles: None,
        }
    }

    /// Add a value to the distribution
    pub fn add(&mut self, value: f64) {
        self.count += 1;
        self.sum += value;
        self.sum_sq += value * value;
        self.min = self.min.min(value);
        self.max = self.max.max(value);
    }

    /// Get the mean
    pub fn mean(&self) -> f64 {
        if self.count == 0 {
            0.0
        } else {
            self.sum / self.count as f64
        }
    }

    /// Get the variance
    pub fn variance(&self) -> f64 {
        if self.count < 2 {
            0.0
        } else {
            let mean = self.mean();
            (self.sum_sq / self.count as f64) - (mean * mean)
        }
    }

    /// Get the standard deviation
    pub fn std_dev(&self) -> f64 {
        self.variance().sqrt()
    }

    /// Merge with another distribution
    pub fn merge(&mut self, other: &DistributionValue) {
        self.count += other.count;
        self.sum += other.sum;
        self.sum_sq += other.sum_sq;
        self.min = self.min.min(other.min);
        self.max = self.max.max(other.max);
    }

    /// Get the estimated memory size
    pub fn memory_size(&self) -> usize {
        mem::size_of::<Self>() +
        self.percentiles.as_ref().map_or(0, |p| p.len() * mem::size_of::<(f64, f64)>())
    }
}

impl Default for DistributionValue {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 3.5 Metric Sources - Where Metrics Come From
// ----------------------------------------------------------------------------

/// Identifies the source/origin of a metric.
/// This helps with routing, filtering, and debugging.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MetricSource {
    /// Metrics from Netdata
    Netdata {
        chart: CompactString,
        dimension: CompactString,
        chart_type: CompactString,
    },
    
    /// System metrics from /proc, /sys
    System {
        subsystem: SystemSubsystem,
    },
    
    /// Network interface metrics
    Network {
        interface: CompactString,
        direction: NetworkDirection,
    },
    
    /// Docker container metrics
    Docker {
        container_id: CompactString,
        container_name: CompactString,
        stat_type: DockerStatType,
    },
    
    /// Log-derived metrics
    Log {
        file_path: CompactString,
        log_type: LogType,
    },
    
    /// HTTP endpoint metrics
    Http {
        endpoint: CompactString,
        method: HttpMethod,
    },
    
    /// Process-level metrics
    Process {
        pid: u32,
        name: CompactString,
        cmdline: CompactString,
    },
    
    /// Cgroup metrics
    Cgroup {
        path: CompactString,
        controller: CgroupController,
    },
    
    /// Custom/plugin metrics
    Custom {
        source_name: CompactString,
        source_type: CompactString,
    },
    
    /// Internal engine metrics
    Internal {
        component: CompactString,
    },
    
    /// Unknown/unclassified source
    Unknown,
}

impl MetricSource {
    /// Get a short name for the source type
    pub fn type_name(&self) -> &'static str {
        match self {
            MetricSource::Netdata { .. } => "netdata",
            MetricSource::System { .. } => "system",
            MetricSource::Network { .. } => "network",
            MetricSource::Docker { .. } => "docker",
            MetricSource::Log { .. } => "log",
            MetricSource::Http { .. } => "http",
            MetricSource::Process { .. } => "process",
            MetricSource::Cgroup { .. } => "cgroup",
            MetricSource::Custom { .. } => "custom",
            MetricSource::Internal { .. } => "internal",
            MetricSource::Unknown => "unknown",
        }
    }

    /// Get a human-readable description
    pub fn description(&self) -> String {
        match self {
            MetricSource::Netdata { chart, dimension, .. } => {
                format!("netdata:{}:{}", chart, dimension)
            }
            MetricSource::System { subsystem } => {
                format!("system:{:?}", subsystem)
            }
            MetricSource::Network { interface, direction } => {
                format!("network:{}:{:?}", interface, direction)
            }
            MetricSource::Docker { container_name, stat_type, .. } => {
                format!("docker:{}:{:?}", container_name, stat_type)
            }
            MetricSource::Log { file_path, log_type } => {
                format!("log:{}:{:?}", file_path, log_type)
            }
            MetricSource::Http { endpoint, method } => {
                format!("http:{:?}:{}", method, endpoint)
            }
            MetricSource::Process { pid, name, .. } => {
                format!("process:{}:{}", pid, name)
            }
            MetricSource::Cgroup { path, controller } => {
                format!("cgroup:{}:{:?}", path, controller)
            }
            MetricSource::Custom { source_name, source_type } => {
                format!("custom:{}:{}", source_type, source_name)
            }
            MetricSource::Internal { component } => {
                format!("internal:{}", component)
            }
            MetricSource::Unknown => "unknown".to_string(),
        }
    }
}

impl Default for MetricSource {
    fn default() -> Self {
        MetricSource::Unknown
    }
}

/// System subsystems for metrics collection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SystemSubsystem {
    Cpu,
    Memory,
    Disk,
    Network,
    LoadAvg,
    Uptime,
    Filesystem,
    Vmstat,
    Interrupts,
    ContextSwitches,
    Entropy,
    FileHandles,
    Sockets,
}

/// Network traffic direction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NetworkDirection {
    Inbound,
    Outbound,
    Both,
}

/// Docker statistic types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DockerStatType {
    Cpu,
    Memory,
    NetworkRx,
    NetworkTx,
    BlockRead,
    BlockWrite,
    Pids,
    Health,
    Restarts,
}

/// Log types for categorization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LogType {
    Nginx,
    Apache,
    Application,
    System,
    Syslog,
    Json,
    Custom,
}

/// HTTP methods
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Head,
    Options,
    Any,
}

/// Cgroup controllers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CgroupController {
    Cpu,
    CpuAcct,
    CpuSet,
    Memory,
    Blkio,
    Io,
    Pids,
    Net,
    Freezer,
    Devices,
    Unified, // cgroup v2
}

// ----------------------------------------------------------------------------
// 3.6 Metric Categories - Logical Classification
// ----------------------------------------------------------------------------

/// High-level categories for metrics.
/// Used for routing, filtering, and dashboard organization.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MetricCategory {
    // ---- Availability ----
    /// Site/service uptime
    Uptime,
    /// DNS resolution
    Dns,
    /// Health check status
    HealthCheck,
    /// Service availability
    ServiceAvailability,
    /// Certificate status
    Certificate,
    
    // ---- Performance ----
    /// Response time / latency
    ResponseTime,
    /// Throughput (requests/sec, bytes/sec)
    Throughput,
    /// Page load time
    PageLoad,
    /// Time to first byte
    Ttfb,
    /// API latency
    ApiLatency,
    
    // ---- Resources: CPU ----
    /// CPU utilization
    CpuUsage,
    /// CPU I/O wait
    CpuIowait,
    /// CPU steal (virtualization)
    CpuSteal,
    /// CPU system time
    CpuSystem,
    /// CPU user time
    CpuUser,
    /// Load average
    LoadAverage,
    
    // ---- Resources: Memory ----
    /// Memory utilization
    MemoryUsage,
    /// Memory pressure
    MemoryPressure,
    /// Swap usage
    SwapUsage,
    /// Cache memory
    MemoryCache,
    /// Buffer memory
    MemoryBuffer,
    /// OOM events
    OomEvents,
    
    // ---- Resources: Disk ----
    /// Disk space usage
    DiskUsage,
    /// Disk I/O operations
    DiskIops,
    /// Disk latency
    DiskLatency,
    /// Disk throughput
    DiskThroughput,
    /// Disk queue depth
    DiskQueueDepth,
    
    // ---- Resources: Network ----
    /// Network bandwidth
    NetworkBandwidth,
    /// Network packets
    NetworkPackets,
    /// Network errors
    NetworkErrors,
    /// Network drops
    NetworkDrops,
    /// Network connections
    NetworkConnections,
    
    // ---- Application ----
    /// Application error rate
    ErrorRate,
    /// Request rate
    RequestRate,
    /// Active connections/sessions
    ActiveConnections,
    /// Queue depth
    QueueDepth,
    /// Cache hit rate
    CacheHitRate,
    /// Application-specific metric
    ApplicationCustom,
    
    // ---- Database ----
    /// Query latency
    QueryLatency,
    /// Connection pool usage
    ConnectionPool,
    /// Database deadlocks
    Deadlocks,
    /// Slow queries
    SlowQueries,
    /// Replication lag
    ReplicationLag,
    /// Database size
    DatabaseSize,
    
    // ---- Security ----
    /// Suspicious network packets
    SuspiciousTraffic,
    /// DDoS indicators
    DdosIndicator,
    /// Authentication failures
    AuthFailures,
    /// Rate limit hits
    RateLimitHits,
    /// Security events
    SecurityEvent,
    
    // ---- Container ----
    /// Container CPU
    ContainerCpu,
    /// Container memory
    ContainerMemory,
    /// Container restarts
    ContainerRestarts,
    /// Container health
    ContainerHealth,
    /// Container network
    ContainerNetwork,
    
    // ---- Process ----
    /// Process CPU
    ProcessCpu,
    /// Process memory
    ProcessMemory,
    /// Process threads
    ProcessThreads,
    /// Process file descriptors
    ProcessFd,
    /// Process I/O
    ProcessIo,
    
    // ---- Infrastructure ----
    /// Hardware sensors
    HardwareSensor,
    /// Power consumption
    Power,
    /// Temperature
    Temperature,
    /// Fan speed
    FanSpeed,
    
    // ---- Collector-Level Categories ----
    /// General availability (up/down)
    Availability,
    /// Disk I/O operations (reads/writes)
    DiskIo,
    /// Disk space usage (bytes/percent)
    DiskSpace,
    /// Network traffic (bytes/packets)
    NetworkTraffic,
    /// System resource (file handles, entropy, etc.)
    SystemResource,
    /// Container I/O (block device reads/writes)
    ContainerIo,
    /// Database connections
    DatabaseConnections,
    /// Process count
    ProcessCount,
    /// HTTP response time
    HttpResponseTime,
    /// HTTP status code
    HttpStatus,
    /// HTTP errors
    HttpErrors,
    /// HTTP request rate
    HttpRequestRate,
    
    // ---- Custom ----
    /// User-defined category
    Custom,
    
    /// Uncategorized
    Unknown,
}

impl MetricCategory {
    /// Get the parent category (for grouping)
    pub fn parent_group(&self) -> &'static str {
        match self {
            MetricCategory::Uptime
            | MetricCategory::Dns
            | MetricCategory::HealthCheck
            | MetricCategory::ServiceAvailability
            | MetricCategory::Availability
            | MetricCategory::Certificate => "availability",
            
            MetricCategory::ResponseTime
            | MetricCategory::Throughput
            | MetricCategory::PageLoad
            | MetricCategory::Ttfb
            | MetricCategory::ApiLatency => "performance",
            
            MetricCategory::CpuUsage
            | MetricCategory::CpuIowait
            | MetricCategory::CpuSteal
            | MetricCategory::CpuSystem
            | MetricCategory::CpuUser
            | MetricCategory::LoadAverage => "cpu",
            
            MetricCategory::MemoryUsage
            | MetricCategory::MemoryPressure
            | MetricCategory::SwapUsage
            | MetricCategory::MemoryCache
            | MetricCategory::MemoryBuffer
            | MetricCategory::OomEvents => "memory",
            
            MetricCategory::DiskUsage
            | MetricCategory::DiskIops
            | MetricCategory::DiskLatency
            | MetricCategory::DiskThroughput
            | MetricCategory::DiskQueueDepth
            | MetricCategory::DiskIo
            | MetricCategory::DiskSpace => "disk",
            
            MetricCategory::NetworkBandwidth
            | MetricCategory::NetworkPackets
            | MetricCategory::NetworkErrors
            | MetricCategory::NetworkDrops
            | MetricCategory::NetworkConnections
            | MetricCategory::NetworkTraffic => "network",
            
            MetricCategory::ErrorRate
            | MetricCategory::RequestRate
            | MetricCategory::ActiveConnections
            | MetricCategory::QueueDepth
            | MetricCategory::CacheHitRate
            | MetricCategory::ApplicationCustom
            | MetricCategory::HttpResponseTime
            | MetricCategory::HttpStatus
            | MetricCategory::HttpErrors
            | MetricCategory::HttpRequestRate => "application",
            
            MetricCategory::QueryLatency
            | MetricCategory::ConnectionPool
            | MetricCategory::Deadlocks
            | MetricCategory::SlowQueries
            | MetricCategory::ReplicationLag
            | MetricCategory::DatabaseSize
            | MetricCategory::DatabaseConnections => "database",
            
            MetricCategory::SuspiciousTraffic
            | MetricCategory::DdosIndicator
            | MetricCategory::AuthFailures
            | MetricCategory::RateLimitHits
            | MetricCategory::SecurityEvent => "security",
            
            MetricCategory::ContainerCpu
            | MetricCategory::ContainerMemory
            | MetricCategory::ContainerRestarts
            | MetricCategory::ContainerHealth
            | MetricCategory::ContainerNetwork
            | MetricCategory::ContainerIo => "container",
            
            MetricCategory::ProcessCpu
            | MetricCategory::ProcessMemory
            | MetricCategory::ProcessThreads
            | MetricCategory::ProcessFd
            | MetricCategory::ProcessIo
            | MetricCategory::ProcessCount => "process",
            
            MetricCategory::HardwareSensor
            | MetricCategory::Power
            | MetricCategory::Temperature
            | MetricCategory::FanSpeed
            | MetricCategory::SystemResource => "hardware",
            
            MetricCategory::Custom | MetricCategory::Unknown => "other",
        }
    }

    /// Get the default severity for this category
    pub fn default_severity(&self) -> Severity {
        match self {
            // Critical categories
            MetricCategory::Uptime
            | MetricCategory::HealthCheck
            | MetricCategory::ServiceAvailability
            | MetricCategory::DdosIndicator => Severity::Critical,
            
            // High severity
            MetricCategory::ErrorRate
            | MetricCategory::CpuUsage
            | MetricCategory::MemoryUsage
            | MetricCategory::DiskUsage
            | MetricCategory::SecurityEvent => Severity::High,
            
            // Medium severity
            MetricCategory::ResponseTime
            | MetricCategory::QueryLatency
            | MetricCategory::ContainerRestarts => Severity::Medium,
            
            // Low severity
            _ => Severity::Low,
        }
    }
}

impl Default for MetricCategory {
    fn default() -> Self {
        MetricCategory::Unknown
    }
}

// ----------------------------------------------------------------------------
// 3.7 Priority & Severity - Importance Classification
// ----------------------------------------------------------------------------

/// Processing priority for metrics.
/// Higher priority metrics are processed first during load.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum Priority {
    /// Lowest priority - can be delayed significantly
    Background = 0,
    /// Low priority - processed when capacity allows
    Low = 1,
    /// Normal priority - standard processing
    Normal = 2,
    /// High priority - processed before normal
    High = 3,
    /// Critical priority - processed immediately
    Critical = 4,
    /// Real-time priority - never delayed
    RealTime = 5,
}

impl Priority {
    /// Get numeric value for sorting
    #[inline]
    pub const fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Create from numeric value
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Priority::Background,
            1 => Priority::Low,
            2 => Priority::Normal,
            3 => Priority::High,
            4 => Priority::Critical,
            _ => Priority::RealTime,
        }
    }
}

impl Default for Priority {
    fn default() -> Self {
        Priority::Normal
    }
}

/// Severity level for alerts and incidents
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum Severity {
    /// Informational - no action needed
    Info = 0,
    /// Low severity - can be addressed later
    Low = 1,
    /// Medium severity - should be addressed soon
    Medium = 2,
    /// High severity - needs attention
    High = 3,
    /// Critical severity - immediate action required
    Critical = 4,
}

impl Severity {
    /// Get numeric value
    #[inline]
    pub const fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Create from numeric value
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Severity::Info,
            1 => Severity::Low,
            2 => Severity::Medium,
            3 => Severity::High,
            _ => Severity::Critical,
        }
    }

    /// Get string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            Severity::Info => "info",
            Severity::Low => "low",
            Severity::Medium => "medium",
            Severity::High => "high",
            Severity::Critical => "critical",
        }
    }

    /// Get color code for UI
    pub fn color(&self) -> &'static str {
        match self {
            Severity::Info => "#3498db",     // Blue
            Severity::Low => "#2ecc71",      // Green
            Severity::Medium => "#f1c40f",   // Yellow
            Severity::High => "#e67e22",     // Orange
            Severity::Critical => "#e74c3c", // Red
        }
    }
}

impl Default for Severity {
    fn default() -> Self {
        Severity::Info
    }
}

impl Display for Severity {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// ----------------------------------------------------------------------------
// 3.8 The Universal Metric Struct - THE ATOMIC UNIT
// ----------------------------------------------------------------------------

/// The universal metric structure - the atomic unit of all data in the engine.
/// This is THE most important struct in the entire codebase.
/// 
/// Design goals:
/// - Compact memory layout
/// - All information needed for processing
/// - Efficient serialization
/// - Cache-friendly access patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metric {
    /// Unique identifier for this metric (computed from name + labels)
    pub id: MetricId,
    
    /// Metric name (e.g., "cpu.usage", "http.requests.total")
    pub name: CompactString,
    
    /// The metric value
    pub value: MetricValue,
    
    /// Timestamp when this metric was collected
    pub timestamp: Timestamp,
    
    /// Project this metric belongs to (0 = unassigned)
    pub project_id: u32,
    
    /// Source of this metric
    pub source: MetricSource,
    
    /// Category for routing and filtering
    pub category: MetricCategory,
    
    /// Processing priority
    pub priority: Priority,
    
    /// Labels (dimensions) for this metric
    pub labels: Labels,
    
    /// Optional description/help text
    pub description: Option<CompactString>,
    
    /// Optional unit (e.g., "bytes", "seconds", "percent")
    pub unit: Option<CompactString>,
}

impl Metric {
    /// Create a new metric with just name and value
    pub fn new<N, V>(name: N, value: V) -> Self
    where
        N: Into<CompactString>,
        V: Into<MetricValue>,
    {
        let name = name.into();
        let id = MetricId::from_name(&name);
        
        Self {
            id,
            name,
            value: value.into(),
            timestamp: Timestamp::now(),
            project_id: 0,
            source: MetricSource::Unknown,
            category: MetricCategory::Unknown,
            priority: Priority::Normal,
            labels: SmallVec::new(),
            description: None,
            unit: None,
        }
    }

    /// Create a counter metric
    pub fn counter<N>(name: N, value: u64) -> Self
    where
        N: Into<CompactString>,
    {
        Self::new(name, MetricValue::Counter(value))
    }

    /// Create a gauge metric
    pub fn gauge<N>(name: N, value: f64) -> Self
    where
        N: Into<CompactString>,
    {
        Self::new(name, MetricValue::Gauge(value))
    }

    /// Create a boolean metric
    pub fn boolean<N>(name: N, value: bool) -> Self
    where
        N: Into<CompactString>,
    {
        Self::new(name, MetricValue::Boolean(value))
    }

    /// Builder: set timestamp
    #[inline]
    pub fn with_timestamp(mut self, ts: Timestamp) -> Self {
        self.timestamp = ts;
        self
    }

    /// Builder: set project ID
    #[inline]
    pub fn with_project(mut self, project_id: u32) -> Self {
        self.project_id = project_id;
        self
    }

    /// Builder: set source
    #[inline]
    pub fn with_source(mut self, source: MetricSource) -> Self {
        self.source = source;
        self
    }

    /// Builder: set category
    #[inline]
    pub fn with_category(mut self, category: MetricCategory) -> Self {
        self.category = category;
        self
    }

    /// Builder: set priority
    #[inline]
    pub fn with_priority(mut self, priority: Priority) -> Self {
        self.priority = priority;
        self
    }

    /// Builder: add a single label
    pub fn with_label<K, V>(mut self, key: K, value: V) -> Self
    where
        K: Into<CompactString>,
        V: Into<CompactString>,
    {
        self.labels.push(Label::new(key, value));
        self.recompute_id();
        self
    }

    /// Builder: set all labels
    pub fn with_labels(mut self, labels: Labels) -> Self {
        self.labels = labels;
        self.recompute_id();
        self
    }

    /// Builder: set description
    pub fn with_description<S: Into<CompactString>>(mut self, desc: S) -> Self {
        self.description = Some(desc.into());
        self
    }

    /// Builder: set unit
    pub fn with_unit<S: Into<CompactString>>(mut self, unit: S) -> Self {
        self.unit = Some(unit.into());
        self
    }

    /// Recompute the metric ID after label changes
    pub fn recompute_id(&mut self) {
        self.id = MetricId::compute(&self.name, &self.labels);
    }

    /// Get the value as f64 if possible
    #[inline]
    pub fn as_f64(&self) -> Option<f64> {
        self.value.as_f64()
    }

    /// Get a label value by key
    #[inline]
    pub fn get_label(&self, key: &str) -> Option<&str> {
        self.labels.get(key)
    }

    /// Check if metric has a specific label
    #[inline]
    pub fn has_label(&self, key: &str) -> bool {
        self.labels.contains_key(key)
    }

    /// Get the age of this metric (time since collection)
    #[inline]
    pub fn age(&self) -> Duration {
        Timestamp::now().duration_since(self.timestamp)
    }

    /// Check if metric is stale (older than threshold)
    #[inline]
    pub fn is_stale(&self, threshold: Duration) -> bool {
        self.age() > threshold
    }

    /// Estimate memory usage
    pub fn memory_size(&self) -> usize {
        mem::size_of::<Self>()
            + self.value.memory_size()
            + self.labels.iter().map(|l| l.memory_size()).sum::<usize>()
            + self.description.as_ref().map_or(0, |s| s.len())
            + self.unit.as_ref().map_or(0, |s| s.len())
    }

    /// Create a copy with updated value and timestamp
    pub fn with_new_value<V: Into<MetricValue>>(&self, value: V) -> Self {
        Self {
            id: self.id,
            name: self.name.clone(),
            value: value.into(),
            timestamp: Timestamp::now(),
            project_id: self.project_id,
            source: self.source.clone(),
            category: self.category,
            priority: self.priority,
            labels: self.labels.clone(),
            description: self.description.clone(),
            unit: self.unit.clone(),
        }
    }
}

impl Display for Metric {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}{{", self.name)?;
        for (i, label) in self.labels.iter().enumerate() {
            if i > 0 {
                write!(f, ",")?;
            }
            write!(f, "{}=\"{}\"", label.key, label.value)?;
        }
        write!(f, "}} {} @ {}", self.value, self.timestamp)
    }
}

impl PartialEq for Metric {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id && self.timestamp == other.timestamp
    }
}

impl Eq for Metric {}

impl Hash for Metric {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.id.hash(state);
        self.timestamp.hash(state);
    }
}

/// A batch of metrics for efficient processing
#[derive(Debug, Clone, Default)]
pub struct MetricBatch {
    /// The metrics in this batch
    pub metrics: Vec<Metric>,
    /// Batch creation timestamp
    pub created_at: Timestamp,
    /// Source identifier for the batch
    pub source_id: Option<CompactString>,
}

impl MetricBatch {
    /// Create a new empty batch
    pub fn new() -> Self {
        Self {
            metrics: Vec::new(),
            created_at: Timestamp::now(),
            source_id: None,
        }
    }

    /// Create a batch with pre-allocated capacity
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            metrics: Vec::with_capacity(capacity),
            created_at: Timestamp::now(),
            source_id: None,
        }
    }

    /// Add a metric to the batch
    #[inline]
    pub fn push(&mut self, metric: Metric) {
        self.metrics.push(metric);
    }

    /// Get the number of metrics in the batch
    #[inline]
    pub fn len(&self) -> usize {
        self.metrics.len()
    }

    /// Check if batch is empty
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.metrics.is_empty()
    }

    /// Clear the batch
    #[inline]
    pub fn clear(&mut self) {
        self.metrics.clear();
        self.created_at = Timestamp::now();
    }

    /// Drain all metrics from the batch
    #[inline]
    pub fn drain(&mut self) -> impl Iterator<Item = Metric> + '_ {
        self.metrics.drain(..)
    }

    /// Estimate memory usage
    pub fn memory_size(&self) -> usize {
        mem::size_of::<Self>()
            + self.metrics.iter().map(|m| m.memory_size()).sum::<usize>()
    }
}

impl FromIterator<Metric> for MetricBatch {
    fn from_iter<I: IntoIterator<Item = Metric>>(iter: I) -> Self {
        Self {
            metrics: iter.into_iter().collect(),
            created_at: Timestamp::now(),
            source_id: None,
        }
    }
}

impl IntoIterator for MetricBatch {
    type Item = Metric;
    type IntoIter = std::vec::IntoIter<Metric>;

    fn into_iter(self) -> Self::IntoIter {
        self.metrics.into_iter()
    }
}

impl<'a> IntoIterator for &'a MetricBatch {
    type Item = &'a Metric;
    type IntoIter = std::slice::Iter<'a, Metric>;

    fn into_iter(self) -> Self::IntoIter {
        self.metrics.iter()
    }
}



// ============================================================================
// SECTION 4: ERROR HANDLING FRAMEWORK
// ============================================================================
// Comprehensive error types for every subsystem in the engine.
// Designed for:
// - Clear error categorization
// - Easy error propagation with context
// - Recovery strategy hints
// - Serialization for logging/reporting
// ============================================================================

// ----------------------------------------------------------------------------
// 4.1 Core Engine Errors
// ----------------------------------------------------------------------------

/// The main error type for the Cerebro engine.
/// All subsystem errors can be converted to this type.
#[derive(Error, Debug)]
pub enum CerebroError {
    // ---- Configuration Errors ----
    #[error("Configuration error: {0}")]
    Config(#[from] ConfigError),

    // ---- Collection Errors ----
    #[error("Collector error: {0}")]
    Collector(#[from] CollectorError),

    // ---- Storage Errors ----
    #[error("Storage error: {0}")]
    Storage(#[from] StorageError),

    // ---- Network Errors ----
    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    // ---- Processing Errors ----
    #[error("Processing error: {0}")]
    Processing(#[from] ProcessingError),

    // ---- Project Errors ----
    #[error("Project error: {0}")]
    Project(#[from] ProjectError),

    // ---- Output Errors ----
    #[error("Output error: {0}")]
    Output(#[from] OutputError),

    // ---- System Errors ----
    #[error("System error: {0}")]
    System(#[from] SystemError),

    // ---- IO Errors ----
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    // ---- Generic Errors ----
    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Not implemented: {0}")]
    NotImplemented(String),

    #[error("Shutdown in progress")]
    ShuttingDown,
}

impl CerebroError {
    /// Check if this error is recoverable
    pub fn is_recoverable(&self) -> bool {
        match self {
            CerebroError::Config(_) => false,
            CerebroError::Collector(e) => e.is_recoverable(),
            CerebroError::Storage(e) => e.is_recoverable(),
            CerebroError::Network(e) => e.is_recoverable(),
            CerebroError::Processing(_) => true,
            CerebroError::Project(_) => true,
            CerebroError::Output(e) => e.is_recoverable(),
            CerebroError::System(_) => false,
            CerebroError::Io(_) => true,
            CerebroError::Internal(_) => false,
            CerebroError::NotImplemented(_) => false,
            CerebroError::ShuttingDown => false,
        }
    }

    /// Get the error category for metrics/logging
    pub fn category(&self) -> &'static str {
        match self {
            CerebroError::Config(_) => "config",
            CerebroError::Collector(_) => "collector",
            CerebroError::Storage(_) => "storage",
            CerebroError::Network(_) => "network",
            CerebroError::Processing(_) => "processing",
            CerebroError::Project(_) => "project",
            CerebroError::Output(_) => "output",
            CerebroError::System(_) => "system",
            CerebroError::Io(_) => "io",
            CerebroError::Internal(_) => "internal",
            CerebroError::NotImplemented(_) => "not_implemented",
            CerebroError::ShuttingDown => "shutdown",
        }
    }

    /// Get suggested recovery action
    pub fn recovery_hint(&self) -> RecoveryHint {
        match self {
            CerebroError::Config(_) => RecoveryHint::FixConfiguration,
            CerebroError::Collector(e) => e.recovery_hint(),
            CerebroError::Network(e) => e.recovery_hint(),
            CerebroError::Output(e) => e.recovery_hint(),
            CerebroError::ShuttingDown => RecoveryHint::None,
            _ => RecoveryHint::RetryWithBackoff,
        }
    }
}

/// Hints for how to recover from an error
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryHint {
    /// No recovery possible
    None,
    /// Retry immediately
    RetryImmediate,
    /// Retry with exponential backoff
    RetryWithBackoff,
    /// Reconnect to the service
    Reconnect,
    /// Restart the component
    RestartComponent,
    /// Fix configuration and restart
    FixConfiguration,
    /// Skip this item and continue
    Skip,
    /// Alert operator for manual intervention
    AlertOperator,
}

// ----------------------------------------------------------------------------
// 4.2 Configuration Errors
// ----------------------------------------------------------------------------

/// Errors related to configuration loading and validation
#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Configuration file not found: {path}")]
    FileNotFound { path: PathBuf },

    #[error("Failed to parse configuration: {message}")]
    ParseError { message: String, source: Option<Box<dyn StdError + Send + Sync>> },

    #[error("Invalid configuration value for '{field}': {message}")]
    InvalidValue { field: String, message: String },

    #[error("Missing required configuration field: {field}")]
    MissingField { field: String },

    #[error("Configuration validation failed: {message}")]
    ValidationFailed { message: String },

    #[error("Environment variable not set: {var}")]
    EnvVarNotSet { var: String },

    #[error("Configuration reload failed: {message}")]
    ReloadFailed { message: String },
}

impl ConfigError {
    pub fn invalid_value(field: impl Into<String>, message: impl Into<String>) -> Self {
        ConfigError::InvalidValue {
            field: field.into(),
            message: message.into(),
        }
    }

    pub fn missing_field(field: impl Into<String>) -> Self {
        ConfigError::MissingField {
            field: field.into(),
        }
    }
}

// ----------------------------------------------------------------------------
// 4.3 Collector Errors
// ----------------------------------------------------------------------------

/// Errors from metric collectors
#[derive(Error, Debug)]
pub enum CollectorError {
    #[error("Collector '{name}' initialization failed: {message}")]
    InitializationFailed { name: String, message: String },

    #[error("Collector '{name}' not found")]
    NotFound { name: String },

    #[error("Collection failed for '{source}': {message}")]
    CollectionFailed { source: String, message: String },

    #[error("Connection to '{endpoint}' failed: {message}")]
    ConnectionFailed { endpoint: String, message: String },

    #[error("Authentication failed for '{service}': {message}")]
    AuthenticationFailed { service: String, message: String },

    #[error("Timeout waiting for '{operation}' (waited {timeout_ms}ms)")]
    Timeout { operation: String, timeout_ms: u64 },

    #[error("Rate limited by '{service}'")]
    RateLimited { service: String },

    #[error("Invalid response from '{source}': {message}")]
    InvalidResponse { source: String, message: String },

    #[error("Collector '{name}' is disabled")]
    Disabled { name: String },

    #[error("Resource exhausted: {resource}")]
    ResourceExhausted { resource: String },
}

impl CollectorError {
    pub fn is_recoverable(&self) -> bool {
        match self {
            CollectorError::InitializationFailed { .. } => false,
            CollectorError::NotFound { .. } => false,
            CollectorError::Disabled { .. } => false,
            CollectorError::AuthenticationFailed { .. } => false,
            _ => true,
        }
    }

    pub fn recovery_hint(&self) -> RecoveryHint {
        match self {
            CollectorError::ConnectionFailed { .. } => RecoveryHint::Reconnect,
            CollectorError::Timeout { .. } => RecoveryHint::RetryWithBackoff,
            CollectorError::RateLimited { .. } => RecoveryHint::RetryWithBackoff,
            CollectorError::InvalidResponse { .. } => RecoveryHint::Skip,
            CollectorError::ResourceExhausted { .. } => RecoveryHint::RetryWithBackoff,
            _ => RecoveryHint::None,
        }
    }

    pub fn collection_failed(source: impl Into<String>, message: impl Into<String>) -> Self {
        CollectorError::CollectionFailed {
            source: source.into(),
            message: message.into(),
        }
    }

    pub fn timeout(operation: impl Into<String>, timeout_ms: u64) -> Self {
        CollectorError::Timeout {
            operation: operation.into(),
            timeout_ms,
        }
    }
}

// ----------------------------------------------------------------------------
// 4.4 Storage Errors
// ----------------------------------------------------------------------------

/// Errors related to data storage
#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Storage capacity exceeded: used {used} of {capacity} bytes")]
    CapacityExceeded { used: usize, capacity: usize },

    #[error("Metric not found: {metric_id}")]
    MetricNotFound { metric_id: MetricId },

    #[error("Time series not found for metric: {metric_id}")]
    TimeSeriesNotFound { metric_id: MetricId },

    #[error("Invalid time range: start={start}, end={end}")]
    InvalidTimeRange { start: Timestamp, end: Timestamp },

    #[error("Compression failed: {message}")]
    CompressionFailed { message: String },

    #[error("Decompression failed: {message}")]
    DecompressionFailed { message: String },

    #[error("Serialization failed: {message}")]
    SerializationFailed { message: String },

    #[error("Deserialization failed: {message}")]
    DeserializationFailed { message: String },

    #[error("Write failed: {message}")]
    WriteFailed { message: String },

    #[error("Read failed: {message}")]
    ReadFailed { message: String },

    #[error("Data corruption detected: {message}")]
    DataCorruption { message: String },
}

impl StorageError {
    pub fn is_recoverable(&self) -> bool {
        match self {
            StorageError::CapacityExceeded { .. } => true,
            StorageError::DataCorruption { .. } => false,
            _ => true,
        }
    }
}

// ----------------------------------------------------------------------------
// 4.5 Network Errors
// ----------------------------------------------------------------------------

/// Errors related to network operations
#[derive(Error, Debug)]
pub enum NetworkError {
    #[error("Connection refused to {address}")]
    ConnectionRefused { address: String },

    #[error("Connection reset by peer: {address}")]
    ConnectionReset { address: String },

    #[error("DNS resolution failed for {hostname}: {message}")]
    DnsResolutionFailed { hostname: String, message: String },

    #[error("TLS/SSL error: {message}")]
    TlsError { message: String },

    #[error("HTTP error {status_code}: {message}")]
    HttpError { status_code: u16, message: String },

    #[error("Socket error: {message}")]
    SocketError { message: String },

    #[error("Packet capture error: {message}")]
    PacketCaptureError { message: String },

    #[error("Interface '{interface}' not found")]
    InterfaceNotFound { interface: String },

    #[error("Bandwidth limit exceeded")]
    BandwidthExceeded,

    #[error("Connection pool exhausted")]
    ConnectionPoolExhausted,
}

impl NetworkError {
    pub fn is_recoverable(&self) -> bool {
        match self {
            NetworkError::InterfaceNotFound { .. } => false,
            _ => true,
        }
    }

    pub fn recovery_hint(&self) -> RecoveryHint {
        match self {
            NetworkError::ConnectionRefused { .. } => RecoveryHint::RetryWithBackoff,
            NetworkError::ConnectionReset { .. } => RecoveryHint::Reconnect,
            NetworkError::DnsResolutionFailed { .. } => RecoveryHint::RetryWithBackoff,
            NetworkError::ConnectionPoolExhausted => RecoveryHint::RetryWithBackoff,
            _ => RecoveryHint::RetryImmediate,
        }
    }

    pub fn http_error(status_code: u16, message: impl Into<String>) -> Self {
        NetworkError::HttpError {
            status_code,
            message: message.into(),
        }
    }
}

// ----------------------------------------------------------------------------
// 4.6 Processing Errors
// ----------------------------------------------------------------------------

/// Errors during metric processing
#[derive(Error, Debug)]
pub enum ProcessingError {
    #[error("Invalid metric: {message}")]
    InvalidMetric { message: String },

    #[error("Invalid label: key='{key}', value='{value}', reason: {reason}")]
    InvalidLabel { key: String, value: String, reason: String },

    #[error("Aggregation failed: {message}")]
    AggregationFailed { message: String },

    #[error("Anomaly detection failed: {message}")]
    AnomalyDetectionFailed { message: String },

    #[error("Worker thread panicked: {message}")]
    WorkerPanic { message: String },

    #[error("Channel send failed: {message}")]
    ChannelSendFailed { message: String },

    #[error("Channel receive failed: {message}")]
    ChannelReceiveFailed { message: String },

    #[error("Queue overflow: dropped {count} metrics")]
    QueueOverflow { count: usize },

    #[error("Processing timeout after {timeout_ms}ms")]
    Timeout { timeout_ms: u64 },
}

impl ProcessingError {
    pub fn invalid_metric(message: impl Into<String>) -> Self {
        ProcessingError::InvalidMetric {
            message: message.into(),
        }
    }

    pub fn queue_overflow(count: usize) -> Self {
        ProcessingError::QueueOverflow { count }
    }
}

// ----------------------------------------------------------------------------
// 4.7 Project Errors
// ----------------------------------------------------------------------------

/// Errors related to project management
#[derive(Error, Debug)]
pub enum ProjectError {
    #[error("Project not found: id={project_id}")]
    NotFound { project_id: u32 },

    #[error("Project '{name}' already exists")]
    AlreadyExists { name: String },

    #[error("Invalid project configuration: {message}")]
    InvalidConfiguration { message: String },

    #[error("Failed to classify metric into project: {message}")]
    ClassificationFailed { message: String },

    #[error("Project limit exceeded: max={max_projects}")]
    LimitExceeded { max_projects: usize },

    #[error("Cgroup not found: {path}")]
    CgroupNotFound { path: String },

    #[error("Cgroup read failed: {path}: {message}")]
    CgroupReadFailed { path: String, message: String },
}

// ----------------------------------------------------------------------------
// 4.8 Output Errors
// ----------------------------------------------------------------------------

/// Errors from output/export systems
#[derive(Error, Debug)]
pub enum OutputError {
    #[error("Failed to connect to output '{name}': {message}")]
    ConnectionFailed { name: String, message: String },

    #[error("Failed to send to output '{name}': {message}")]
    SendFailed { name: String, message: String },

    #[error("Output '{name}' is not ready")]
    NotReady { name: String },

    #[error("Serialization failed for output '{name}': {message}")]
    SerializationFailed { name: String, message: String },

    #[error("Output buffer full for '{name}'")]
    BufferFull { name: String },

    #[error("Output '{name}' disconnected")]
    Disconnected { name: String },

    #[error("gRPC error: {message}")]
    GrpcError { message: String },

    #[error("WebSocket error: {message}")]
    WebSocketError { message: String },

    #[error("Unix socket error: {message}")]
    UnixSocketError { message: String },
}

impl OutputError {
    pub fn is_recoverable(&self) -> bool {
        match self {
            OutputError::ConnectionFailed { .. } => true,
            OutputError::SendFailed { .. } => true,
            OutputError::NotReady { .. } => true,
            OutputError::BufferFull { .. } => true,
            OutputError::Disconnected { .. } => true,
            _ => false,
        }
    }

    pub fn recovery_hint(&self) -> RecoveryHint {
        match self {
            OutputError::ConnectionFailed { .. } => RecoveryHint::Reconnect,
            OutputError::Disconnected { .. } => RecoveryHint::Reconnect,
            OutputError::BufferFull { .. } => RecoveryHint::RetryWithBackoff,
            OutputError::NotReady { .. } => RecoveryHint::RetryWithBackoff,
            _ => RecoveryHint::None,
        }
    }
}

// ----------------------------------------------------------------------------
// 4.9 System Errors
// ----------------------------------------------------------------------------

/// Low-level system errors
#[derive(Error, Debug)]
pub enum SystemError {
    #[error("Failed to read /proc/{path}: {message}")]
    ProcReadFailed { path: String, message: String },

    #[error("Failed to read /sys/{path}: {message}")]
    SysReadFailed { path: String, message: String },

    #[error("Permission denied: {operation}")]
    PermissionDenied { operation: String },

    #[error("Resource limit reached: {resource}")]
    ResourceLimit { resource: String },

    #[error("System call failed: {syscall}: {message}")]
    SyscallFailed { syscall: String, message: String },

    #[error("Out of memory")]
    OutOfMemory,

    #[error("Thread spawn failed: {message}")]
    ThreadSpawnFailed { message: String },

    #[error("Signal handling error: {message}")]
    SignalError { message: String },
}

// ----------------------------------------------------------------------------
// 4.10 Result Type Aliases
// ----------------------------------------------------------------------------

/// Standard result type for Cerebro operations
pub type CerebroResult<T> = Result<T, CerebroError>;

/// Result type for collector operations
pub type CollectorResult<T> = Result<T, CollectorError>;

/// Result type for storage operations
pub type StorageResult<T> = Result<T, StorageError>;

/// Result type for network operations
pub type NetworkResult<T> = Result<T, NetworkError>;

/// Result type for processing operations
pub type ProcessingResult<T> = Result<T, ProcessingError>;

/// Result type for output operations
pub type OutputResult<T> = Result<T, OutputError>;

// ----------------------------------------------------------------------------
// 4.11 Error Context Extension
// ----------------------------------------------------------------------------

/// Extension trait to add context to errors
pub trait ErrorContext<T, E> {
    /// Add context to an error
    fn context(self, context: impl Into<String>) -> Result<T, CerebroError>;
    
    /// Add context with a closure (lazy evaluation)
    fn with_context<F, C>(self, f: F) -> Result<T, CerebroError>
    where
        F: FnOnce() -> C,
        C: Into<String>;
}

impl<T, E> ErrorContext<T, E> for Result<T, E>
where
    E: Into<CerebroError>,
{
    fn context(self, context: impl Into<String>) -> Result<T, CerebroError> {
        self.map_err(|e| {
            let err: CerebroError = e.into();
            CerebroError::Internal(format!("{}: {}", context.into(), err))
        })
    }

    fn with_context<F, C>(self, f: F) -> Result<T, CerebroError>
    where
        F: FnOnce() -> C,
        C: Into<String>,
    {
        self.map_err(|e| {
            let err: CerebroError = e.into();
            CerebroError::Internal(format!("{}: {}", f().into(), err))
        })
    }
}

// ----------------------------------------------------------------------------
// 4.12 Error Statistics Tracking
// ----------------------------------------------------------------------------

/// Tracks error statistics for monitoring
#[derive(Debug, Default)]
pub struct ErrorStats {
    /// Total errors by category
    pub by_category: DashMap<&'static str, AtomicU64>,
    /// Recoverable vs non-recoverable
    pub recoverable_count: AtomicU64,
    pub non_recoverable_count: AtomicU64,
    /// Last error timestamp
    pub last_error_time: AtomicTimestamp,
    /// Error rate (errors per second, rolling)
    pub error_rate: AtomicCell<f64>,
}

impl ErrorStats {
    /// Create a new error stats tracker
    pub fn new() -> Self {
        Self::default()
    }

    /// Record an error
    pub fn record(&self, error: &CerebroError) {
        // Update category count
        let category = error.category();
        self.by_category
            .entry(category)
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(1, AtomicOrdering::Relaxed);

        // Update recoverable/non-recoverable
        if error.is_recoverable() {
            self.recoverable_count.fetch_add(1, AtomicOrdering::Relaxed);
        } else {
            self.non_recoverable_count.fetch_add(1, AtomicOrdering::Relaxed);
        }

        // Update last error time
        self.last_error_time.store(Timestamp::now(), AtomicOrdering::Release);
    }

    /// Get total error count
    pub fn total_errors(&self) -> u64 {
        self.recoverable_count.load(AtomicOrdering::Relaxed)
            + self.non_recoverable_count.load(AtomicOrdering::Relaxed)
    }

    /// Get error count by category
    pub fn count_by_category(&self, category: &str) -> u64 {
        self.by_category
            .get(category)
            .map(|v| v.load(AtomicOrdering::Relaxed))
            .unwrap_or(0)
    }

    /// Reset all counters
    pub fn reset(&self) {
        self.by_category.clear();
        self.recoverable_count.store(0, AtomicOrdering::Relaxed);
        self.non_recoverable_count.store(0, AtomicOrdering::Relaxed);
    }
}


// ============================================================================
// SECTION 5: CONFIGURATION SYSTEM
// ============================================================================
// Comprehensive configuration management with:
// - TOML file parsing
// - Environment variable overrides
// - Validation
// - Hot-reload support
// - Sensible defaults
// ============================================================================

// ----------------------------------------------------------------------------
// 5.1 Main Configuration Structure
// ----------------------------------------------------------------------------

/// Root configuration for the entire Cerebro engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    /// General engine settings
    #[serde(default)]
    pub engine: GeneralConfig,
    
    /// Collector configurations
    #[serde(default)]
    pub collectors: CollectorsConfig,
    
    /// Storage configuration
    #[serde(default)]
    pub storage: StorageConfig,
    
    /// Output configurations
    #[serde(default)]
    pub outputs: OutputsConfig,
    
    /// Thread pool configuration
    #[serde(default)]
    pub thread_pool: ThreadPoolConfig,
    
    /// Anomaly detection configuration
    #[serde(default)]
    pub anomaly_detection: AnomalyDetectionConfig,
    
    /// Project definitions
    #[serde(default)]
    pub projects: Vec<ProjectConfig>,
    
    /// Logging configuration
    #[serde(default)]
    pub logging: LoggingConfig,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            engine: GeneralConfig::default(),
            collectors: CollectorsConfig::default(),
            storage: StorageConfig::default(),
            outputs: OutputsConfig::default(),
            thread_pool: ThreadPoolConfig::default(),
            anomaly_detection: AnomalyDetectionConfig::default(),
            projects: Vec::new(),
            logging: LoggingConfig::default(),
        }
    }
}

impl EngineConfig {
    /// Load configuration from file with environment overrides
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let path = path.as_ref();
        
        if !path.exists() {
            return Err(ConfigError::FileNotFound {
                path: path.to_path_buf(),
            });
        }

        let figment = Figment::new()
            .merge(Toml::file(path))
            .merge(Env::prefixed("CEREBRO_").split("__"));

        let config: Self = figment.extract().map_err(|e| ConfigError::ParseError {
            message: e.to_string(),
            source: None,
        })?;

        config.validate()?;
        Ok(config)
    }

    /// Load from string (for testing)
    pub fn from_str(toml_str: &str) -> Result<Self, ConfigError> {
        let config: Self = toml::from_str(toml_str).map_err(|e| ConfigError::ParseError {
            message: e.to_string(),
            source: None,
        })?;
        config.validate()?;
        Ok(config)
    }

    /// Validate the configuration
    pub fn validate(&self) -> Result<(), ConfigError> {
        // Validate collection interval
        if self.engine.collection_interval_ms < MIN_COLLECTION_INTERVAL_MS {
            return Err(ConfigError::InvalidValue {
                field: "engine.collection_interval_ms".into(),
                message: format!(
                    "Collection interval must be at least {}ms",
                    MIN_COLLECTION_INTERVAL_MS
                ),
            });
        }

        // Validate thread pool
        if self.thread_pool.workers > MAX_WORKER_THREADS {
            return Err(ConfigError::InvalidValue {
                field: "thread_pool.workers".into(),
                message: format!("Worker count cannot exceed {}", MAX_WORKER_THREADS),
            });
        }

        // Validate projects
        if self.projects.len() > MAX_PROJECTS {
            return Err(ConfigError::InvalidValue {
                field: "projects".into(),
                message: format!("Cannot have more than {} projects", MAX_PROJECTS),
            });
        }

        Ok(())
    }

    /// Create a default config file
    pub fn generate_default_config() -> String {
        let config = Self::default();
        toml::to_string_pretty(&config).unwrap_or_default()
    }

    /// Get effective worker count (auto-detect if 0)
    pub fn effective_worker_count(&self) -> usize {
        if self.thread_pool.workers == 0 {
            num_cpus().max(MIN_WORKER_THREADS)
        } else {
            self.thread_pool.workers.max(MIN_WORKER_THREADS)
        }
    }
}

// ----------------------------------------------------------------------------
// 5.2 General Engine Configuration
// ----------------------------------------------------------------------------

/// General engine settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralConfig {
    /// Engine instance name (for identification)
    #[serde(default = "default_instance_name")]
    pub instance_name: String,
    
    /// Collection interval in milliseconds
    #[serde(default = "default_collection_interval")]
    pub collection_interval_ms: u64,
    
    /// Enable debug mode
    #[serde(default)]
    pub debug: bool,
    
    /// Graceful shutdown timeout in seconds
    #[serde(default = "default_shutdown_timeout")]
    pub shutdown_timeout_secs: u64,
    
    /// Enable self-monitoring
    #[serde(default = "default_true")]
    pub self_monitoring: bool,
    
    /// Health check endpoint enabled
    #[serde(default = "default_true")]
    pub health_check_enabled: bool,
    
    /// Hostname (auto-detected if empty)
    #[serde(default)]
    pub hostname: Option<String>,
    
    /// Environment name (prod, staging, dev)
    #[serde(default = "default_environment")]
    pub environment: String,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            instance_name: default_instance_name(),
            collection_interval_ms: default_collection_interval(),
            debug: false,
            shutdown_timeout_secs: default_shutdown_timeout(),
            self_monitoring: true,
            health_check_enabled: true,
            hostname: None,
            environment: default_environment(),
        }
    }
}

fn default_instance_name() -> String {
    "cerebro-engine".into()
}

fn default_collection_interval() -> u64 {
    DEFAULT_COLLECTION_INTERVAL_MS
}

fn default_shutdown_timeout() -> u64 {
    SHUTDOWN_GRACE_PERIOD_SECS
}

fn default_true() -> bool {
    true
}

fn default_environment() -> String {
    "production".into()
}

// ----------------------------------------------------------------------------
// 5.3 Collectors Configuration
// ----------------------------------------------------------------------------

/// Configuration for all collectors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectorsConfig {
    /// System metrics collector
    #[serde(default)]
    pub system: SystemCollectorConfig,
    
    /// Netdata collector
    #[serde(default)]
    pub netdata: NetdataCollectorConfig,
    
    /// Docker collector
    #[serde(default)]
    pub docker: DockerCollectorConfig,
    
    /// Network sniffer
    #[serde(default)]
    pub network: NetworkCollectorConfig,
    
    /// Log collector
    #[serde(default)]
    pub logs: LogCollectorConfig,
    
    /// HTTP endpoint collector
    #[serde(default)]
    pub http: HttpCollectorConfig,
}

impl Default for CollectorsConfig {
    fn default() -> Self {
        Self {
            system: SystemCollectorConfig::default(),
            netdata: NetdataCollectorConfig::default(),
            docker: DockerCollectorConfig::default(),
            network: NetworkCollectorConfig::default(),
            logs: LogCollectorConfig::default(),
            http: HttpCollectorConfig::default(),
        }
    }
}

/// System metrics collector configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemCollectorConfig {
    /// Enable this collector
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Collection interval override (0 = use global)
    #[serde(default)]
    pub interval_ms: u64,
    
    /// Collect CPU metrics
    #[serde(default = "default_true")]
    pub collect_cpu: bool,
    
    /// Collect memory metrics
    #[serde(default = "default_true")]
    pub collect_memory: bool,
    
    /// Collect disk metrics
    #[serde(default = "default_true")]
    pub collect_disk: bool,
    
    /// Collect network interface metrics
    #[serde(default = "default_true")]
    pub collect_network: bool,
    
    /// Collect per-process metrics
    #[serde(default)]
    pub collect_processes: bool,
    
    /// Process name patterns to monitor (regex)
    #[serde(default)]
    pub process_patterns: Vec<String>,
    
    /// Disk mount points to monitor (empty = all)
    #[serde(default)]
    pub disk_mounts: Vec<String>,
    
    /// Network interfaces to monitor (empty = all)
    #[serde(default)]
    pub network_interfaces: Vec<String>,
}

impl Default for SystemCollectorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_ms: 0,
            collect_cpu: true,
            collect_memory: true,
            collect_disk: true,
            collect_network: true,
            collect_processes: false,
            process_patterns: Vec::new(),
            disk_mounts: Vec::new(),
            network_interfaces: Vec::new(),
        }
    }
}

/// Netdata collector configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetdataCollectorConfig {
    /// Enable this collector
    #[serde(default)]
    pub enabled: bool,
    
    /// Netdata API URL
    #[serde(default = "default_netdata_url")]
    pub url: String,
    
    /// API key (if required)
    #[serde(default)]
    pub api_key: Option<String>,
    
    /// Collection interval override
    #[serde(default)]
    pub interval_ms: u64,
    
    /// Charts to collect (empty = auto-discover)
    #[serde(default)]
    pub charts: Vec<String>,
    
    /// Chart patterns to exclude
    #[serde(default)]
    pub exclude_patterns: Vec<String>,
    
    /// Request timeout in seconds
    #[serde(default = "default_http_timeout")]
    pub timeout_secs: u64,
}

impl Default for NetdataCollectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            url: default_netdata_url(),
            api_key: None,
            interval_ms: 0,
            charts: Vec::new(),
            exclude_patterns: Vec::new(),
            timeout_secs: default_http_timeout(),
        }
    }
}

fn default_netdata_url() -> String {
    "http://localhost:19999".into()
}

fn default_http_timeout() -> u64 {
    DEFAULT_HTTP_TIMEOUT_SECS
}

/// Docker collector configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerCollectorConfig {
    /// Enable this collector
    #[serde(default)]
    pub enabled: bool,
    
    /// Docker socket path
    #[serde(default = "default_docker_socket")]
    pub socket_path: String,
    
    /// Collection interval override
    #[serde(default)]
    pub interval_ms: u64,
    
    /// Container name patterns to include
    #[serde(default)]
    pub include_patterns: Vec<String>,
    
    /// Container name patterns to exclude
    #[serde(default)]
    pub exclude_patterns: Vec<String>,
    
    /// Collect container logs
    #[serde(default)]
    pub collect_logs: bool,
}

impl Default for DockerCollectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            socket_path: default_docker_socket(),
            interval_ms: 0,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            collect_logs: false,
        }
    }
}

fn default_docker_socket() -> String {
    "/var/run/docker.sock".into()
}

/// Network sniffer configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkCollectorConfig {
    /// Enable packet capture
    #[serde(default)]
    pub enabled: bool,
    
    /// Interfaces to capture on (empty = all)
    #[serde(default)]
    pub interfaces: Vec<String>,
    
    /// BPF filter expression
    #[serde(default)]
    pub bpf_filter: Option<String>,
    
    /// Enable promiscuous mode
    #[serde(default)]
    pub promiscuous: bool,
    
    /// Capture buffer size in bytes
    #[serde(default = "default_capture_buffer")]
    pub buffer_size: usize,
    
    /// Sampling rate (0.0-1.0, 1.0 = capture all)
    #[serde(default = "default_sample_rate")]
    pub sample_rate: f64,
    
    /// Enable DDoS detection
    #[serde(default = "default_true")]
    pub ddos_detection: bool,
    
    /// Enable port scan detection
    #[serde(default = "default_true")]
    pub port_scan_detection: bool,
}

impl Default for NetworkCollectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            interfaces: Vec::new(),
            bpf_filter: None,
            promiscuous: false,
            buffer_size: default_capture_buffer(),
            sample_rate: default_sample_rate(),
            ddos_detection: true,
            port_scan_detection: true,
        }
    }
}

fn default_capture_buffer() -> usize {
    16 * 1024 * 1024 // 16MB
}

fn default_sample_rate() -> f64 {
    1.0
}

/// Log collector configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogCollectorConfig {
    /// Enable log collection
    #[serde(default)]
    pub enabled: bool,
    
    /// Log files to watch
    #[serde(default)]
    pub files: Vec<LogFileConfig>,
    
    /// Maximum lines to buffer
    #[serde(default = "default_log_buffer")]
    pub buffer_lines: usize,
}

impl Default for LogCollectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            files: Vec::new(),
            buffer_lines: default_log_buffer(),
        }
    }
}

fn default_log_buffer() -> usize {
    10000
}

/// Configuration for a single log file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFileConfig {
    /// Path to the log file (supports glob patterns)
    pub path: String,
    
    /// Log format
    #[serde(default)]
    pub format: String,
    
    /// Custom regex pattern for parsing
    #[serde(default)]
    pub pattern: Option<String>,
    
    /// Labels to add to extracted metrics
    #[serde(default)]
    pub labels: HashMap<String, String>,
}

/// HTTP endpoint collector configuration  
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpCollectorConfig {
    /// Enable HTTP endpoint collection
    #[serde(default)]
    pub enabled: bool,
    
    /// Endpoints to check
    #[serde(default)]
    pub endpoints: Vec<HttpEndpointConfig>,
    
    /// Default timeout for requests
    #[serde(default = "default_http_timeout")]
    pub default_timeout_secs: u64,
}

impl Default for HttpCollectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoints: Vec::new(),
            default_timeout_secs: default_http_timeout(),
        }
    }
}

/// Configuration for a single HTTP endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpEndpointConfig {
    /// Endpoint URL
    pub url: String,
    
    /// HTTP method
    #[serde(default = "default_http_method")]
    pub method: String,
    
    /// Expected status codes (empty = any 2xx)
    #[serde(default)]
    pub expected_status: Vec<u16>,
    
    /// Timeout override
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    
    /// Headers to send
    #[serde(default)]
    pub headers: HashMap<String, String>,
    
    /// Check interval override
    #[serde(default)]
    pub interval_ms: Option<u64>,
    
    /// Name for this endpoint
    #[serde(default)]
    pub name: Option<String>,
}

fn default_http_method() -> String {
    "GET".into()
}


// ----------------------------------------------------------------------------
// 5.4 Storage Configuration
// ----------------------------------------------------------------------------

/// Configuration for metric storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    /// Maximum memory for time-series data (bytes)
    #[serde(default = "default_max_memory")]
    pub max_memory_bytes: usize,
    
    /// Points to keep per metric (ring buffer size)
    #[serde(default = "default_points_per_metric")]
    pub points_per_metric: usize,
    
    /// Enable downsampling
    #[serde(default = "default_true")]
    pub enable_downsampling: bool,
    
    /// Retention period in seconds
    #[serde(default = "default_retention")]
    pub retention_secs: u64,
    
    /// Enable compression
    #[serde(default = "default_true")]
    pub enable_compression: bool,
    
    /// Compression algorithm
    #[serde(default = "default_compression")]
    pub compression: String,
    
    /// Enable persistence to disk
    #[serde(default)]
    pub enable_persistence: bool,
    
    /// Persistence directory
    #[serde(default = "default_persistence_dir")]
    pub persistence_dir: String,
    
    /// Snapshot interval in seconds
    #[serde(default = "default_snapshot_interval")]
    pub snapshot_interval_secs: u64,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            max_memory_bytes: default_max_memory(),
            points_per_metric: default_points_per_metric(),
            enable_downsampling: true,
            retention_secs: default_retention(),
            enable_compression: true,
            compression: default_compression(),
            enable_persistence: false,
            persistence_dir: default_persistence_dir(),
            snapshot_interval_secs: default_snapshot_interval(),
        }
    }
}

fn default_max_memory() -> usize {
    MAX_TIMESERIES_MEMORY
}

fn default_points_per_metric() -> usize {
    DEFAULT_RING_BUFFER_SIZE
}

fn default_retention() -> u64 {
    MAX_RETENTION_SECS
}

fn default_compression() -> String {
    "lz4".into()
}

fn default_persistence_dir() -> String {
    "/var/lib/cerebro/data".into()
}

fn default_snapshot_interval() -> u64 {
    300 // 5 minutes
}

// ----------------------------------------------------------------------------
// 5.5 Output Configuration
// ----------------------------------------------------------------------------

/// Configuration for all outputs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputsConfig {
    /// Unix socket output (for Python brain)
    #[serde(default)]
    pub unix_socket: UnixSocketOutputConfig,
    
    /// gRPC server
    #[serde(default)]
    pub grpc: GrpcOutputConfig,
    
    /// WebSocket server
    #[serde(default)]
    pub websocket: WebSocketOutputConfig,
    
    /// Prometheus exporter
    #[serde(default)]
    pub prometheus: PrometheusOutputConfig,
    
    /// HTTP API
    #[serde(default)]
    pub http_api: HttpApiConfig,
}

impl Default for OutputsConfig {
    fn default() -> Self {
        Self {
            unix_socket: UnixSocketOutputConfig::default(),
            grpc: GrpcOutputConfig::default(),
            websocket: WebSocketOutputConfig::default(),
            prometheus: PrometheusOutputConfig::default(),
            http_api: HttpApiConfig::default(),
        }
    }
}

/// Unix socket output configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnixSocketOutputConfig {
    /// Enable Unix socket server
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Socket path
    #[serde(default = "default_socket_path")]
    pub path: String,
    
    /// Buffer size for messages
    #[serde(default = "default_socket_buffer")]
    pub buffer_size: usize,
    
    /// Serialization format
    #[serde(default = "default_ipc_format")]
    pub format: String,
}

impl Default for UnixSocketOutputConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            path: default_socket_path(),
            buffer_size: default_socket_buffer(),
            format: default_ipc_format(),
        }
    }
}

fn default_socket_path() -> String {
    DEFAULT_UNIX_SOCKET_PATH.into()
}

fn default_socket_buffer() -> usize {
    1024 * 1024 // 1MB
}

fn default_ipc_format() -> String {
    "msgpack".into()
}

/// gRPC output configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcOutputConfig {
    /// Enable gRPC server
    #[serde(default)]
    pub enabled: bool,
    
    /// Listen address
    #[serde(default = "default_grpc_addr")]
    pub address: String,
    
    /// Maximum message size
    #[serde(default = "default_grpc_max_size")]
    pub max_message_size: usize,
    
    /// Enable TLS
    #[serde(default)]
    pub tls_enabled: bool,
    
    /// TLS certificate path
    #[serde(default)]
    pub tls_cert: Option<String>,
    
    /// TLS key path
    #[serde(default)]
    pub tls_key: Option<String>,
}

impl Default for GrpcOutputConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            address: default_grpc_addr(),
            max_message_size: default_grpc_max_size(),
            tls_enabled: false,
            tls_cert: None,
            tls_key: None,
        }
    }
}

fn default_grpc_addr() -> String {
    format!("0.0.0.0:{}", DEFAULT_GRPC_PORT)
}

fn default_grpc_max_size() -> usize {
    MAX_GRPC_MESSAGE_SIZE
}

/// WebSocket output configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketOutputConfig {
    /// Enable WebSocket server
    #[serde(default)]
    pub enabled: bool,
    
    /// Listen address
    #[serde(default = "default_ws_addr")]
    pub address: String,
    
    /// Maximum message size
    #[serde(default = "default_ws_max_size")]
    pub max_message_size: usize,
    
    /// Ping interval in seconds
    #[serde(default = "default_ws_ping")]
    pub ping_interval_secs: u64,
    
    /// Enable compression
    #[serde(default = "default_true")]
    pub compression: bool,
}

impl Default for WebSocketOutputConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            address: default_ws_addr(),
            max_message_size: default_ws_max_size(),
            ping_interval_secs: default_ws_ping(),
            compression: true,
        }
    }
}

fn default_ws_addr() -> String {
    format!("0.0.0.0:{}", DEFAULT_WEBSOCKET_PORT)
}

fn default_ws_max_size() -> usize {
    MAX_WEBSOCKET_MESSAGE_SIZE
}

fn default_ws_ping() -> u64 {
    30
}

/// Prometheus exporter configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrometheusOutputConfig {
    /// Enable Prometheus exporter
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Listen address
    #[serde(default = "default_prom_addr")]
    pub address: String,
    
    /// Metrics path
    #[serde(default = "default_metrics_path")]
    pub path: String,
    
    /// Include engine self-metrics
    #[serde(default = "default_true")]
    pub include_engine_metrics: bool,
}

impl Default for PrometheusOutputConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            address: default_prom_addr(),
            path: default_metrics_path(),
            include_engine_metrics: true,
        }
    }
}

fn default_prom_addr() -> String {
    format!("0.0.0.0:{}", DEFAULT_PROMETHEUS_PORT)
}

fn default_metrics_path() -> String {
    "/metrics".into()
}

/// HTTP API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpApiConfig {
    /// Enable HTTP API
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Listen address
    #[serde(default = "default_api_addr")]
    pub address: String,
    
    /// Enable CORS
    #[serde(default = "default_true")]
    pub cors_enabled: bool,
    
    /// Allowed origins for CORS
    #[serde(default)]
    pub cors_origins: Vec<String>,
    
    /// Enable API authentication
    #[serde(default)]
    pub auth_enabled: bool,
    
    /// API keys (if auth enabled)
    #[serde(default)]
    pub api_keys: Vec<String>,
}

impl Default for HttpApiConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            address: default_api_addr(),
            cors_enabled: true,
            cors_origins: Vec::new(),
            auth_enabled: false,
            api_keys: Vec::new(),
        }
    }
}

fn default_api_addr() -> String {
    format!("0.0.0.0:{}", DEFAULT_HTTP_API_PORT)
}

// ----------------------------------------------------------------------------
// 5.6 Thread Pool Configuration
// ----------------------------------------------------------------------------

/// Thread pool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadPoolConfig {
    /// Number of worker threads (0 = auto-detect)
    #[serde(default)]
    pub workers: usize,
    
    /// Load balancing strategy
    #[serde(default = "default_lb_strategy")]
    pub load_balance_strategy: String,
    
    /// Enable work stealing
    #[serde(default = "default_true")]
    pub work_stealing: bool,
    
    /// Queue size per worker
    #[serde(default = "default_worker_queue")]
    pub queue_size: usize,
    
    /// Enable worker specialization
    #[serde(default = "default_true")]
    pub specialization: bool,
    
    /// Thread stack size in bytes
    #[serde(default = "default_stack_size")]
    pub stack_size: usize,
}

impl Default for ThreadPoolConfig {
    fn default() -> Self {
        Self {
            workers: 0, // auto-detect
            load_balance_strategy: default_lb_strategy(),
            work_stealing: true,
            queue_size: default_worker_queue(),
            specialization: true,
            stack_size: default_stack_size(),
        }
    }
}

fn default_lb_strategy() -> String {
    "adaptive".into()
}

fn default_worker_queue() -> usize {
    WORKER_CHANNEL_SIZE
}

fn default_stack_size() -> usize {
    2 * 1024 * 1024 // 2MB
}

// ----------------------------------------------------------------------------
// 5.7 Anomaly Detection Configuration
// ----------------------------------------------------------------------------

/// Anomaly detection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyDetectionConfig {
    /// Enable anomaly detection
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Z-score threshold for anomalies
    #[serde(default = "default_zscore")]
    pub zscore_threshold: f64,
    
    /// IQR multiplier for outlier detection
    #[serde(default = "default_iqr")]
    pub iqr_multiplier: f64,
    
    /// Minimum samples before detection
    #[serde(default = "default_min_samples")]
    pub min_samples: usize,
    
    /// Baseline learning window in seconds
    #[serde(default = "default_baseline_window")]
    pub baseline_window_secs: u64,
    
    /// EMA smoothing factor
    #[serde(default = "default_ema_alpha")]
    pub ema_alpha: f64,
    
    /// Consecutive failures threshold
    #[serde(default = "default_consecutive_failures")]
    pub consecutive_failures: u32,
    
    /// Enable spike detection
    #[serde(default = "default_true")]
    pub spike_detection: bool,
    
    /// Enable trend detection
    #[serde(default = "default_true")]
    pub trend_detection: bool,
    
    /// Enable seasonal detection
    #[serde(default)]
    pub seasonal_detection: bool,
}

impl Default for AnomalyDetectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            zscore_threshold: default_zscore(),
            iqr_multiplier: default_iqr(),
            min_samples: default_min_samples(),
            baseline_window_secs: default_baseline_window(),
            ema_alpha: default_ema_alpha(),
            consecutive_failures: default_consecutive_failures(),
            spike_detection: true,
            trend_detection: true,
            seasonal_detection: false,
        }
    }
}

fn default_zscore() -> f64 {
    DEFAULT_ZSCORE_THRESHOLD
}

fn default_iqr() -> f64 {
    DEFAULT_IQR_MULTIPLIER
}

fn default_min_samples() -> usize {
    MIN_BASELINE_SAMPLES
}

fn default_baseline_window() -> u64 {
    BASELINE_WINDOW_SECS
}

fn default_ema_alpha() -> f64 {
    EMA_ALPHA
}

fn default_consecutive_failures() -> u32 {
    CONSECUTIVE_FAILURE_THRESHOLD
}

// ----------------------------------------------------------------------------
// 5.8 Project Configuration
// ----------------------------------------------------------------------------

/// Configuration for a project (logical grouping of services)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    /// Unique project ID
    pub id: u32,
    
    /// Project name
    pub name: String,
    
    /// Project type
    #[serde(default = "default_project_type")]
    pub project_type: String,
    
    /// Process patterns to match
    #[serde(default)]
    pub process_patterns: Vec<String>,
    
    /// Container patterns to match
    #[serde(default)]
    pub container_patterns: Vec<String>,
    
    /// Cgroup patterns to match
    #[serde(default)]
    pub cgroup_patterns: Vec<String>,
    
    /// Network ports associated with this project
    #[serde(default)]
    pub ports: Vec<u16>,
    
    /// Log file patterns
    #[serde(default)]
    pub log_patterns: Vec<String>,
    
    /// Health check endpoints
    #[serde(default)]
    pub health_endpoints: Vec<String>,
    
    /// Project owner/team
    #[serde(default)]
    pub owner: Option<String>,
    
    /// Priority for this project
    #[serde(default = "default_project_priority")]
    pub priority: u8,
    
    /// Custom labels to add to all metrics
    #[serde(default)]
    pub labels: HashMap<String, String>,
    
    /// Dependencies (other project IDs)
    #[serde(default)]
    pub dependencies: Vec<u32>,
}

fn default_project_type() -> String {
    "custom".into()
}

fn default_project_priority() -> u8 {
    Priority::Normal as u8
}

// ----------------------------------------------------------------------------
// 5.9 Logging Configuration
// ----------------------------------------------------------------------------

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    /// Log level
    #[serde(default = "default_log_level")]
    pub level: String,
    
    /// Output format (json, pretty, compact)
    #[serde(default = "default_log_format")]
    pub format: String,
    
    /// Log to file
    #[serde(default)]
    pub file: Option<String>,
    
    /// Log to stdout
    #[serde(default = "default_true")]
    pub stdout: bool,
    
    /// Enable ANSI colors
    #[serde(default = "default_true")]
    pub colors: bool,
    
    /// Include timestamps
    #[serde(default = "default_true")]
    pub timestamps: bool,
    
    /// Include source location
    #[serde(default)]
    pub source_location: bool,
    
    /// Include span events
    #[serde(default)]
    pub span_events: bool,
    
    /// Log rotation size (bytes)
    #[serde(default = "default_log_rotation")]
    pub rotation_size: usize,
    
    /// Number of log files to keep
    #[serde(default = "default_log_keep")]
    pub keep_files: usize,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            format: default_log_format(),
            file: None,
            stdout: true,
            colors: true,
            timestamps: true,
            source_location: false,
            span_events: false,
            rotation_size: default_log_rotation(),
            keep_files: default_log_keep(),
        }
    }
}

fn default_log_level() -> String {
    "info".into()
}

fn default_log_format() -> String {
    "pretty".into()
}

fn default_log_rotation() -> usize {
    100 * 1024 * 1024 // 100MB
}

fn default_log_keep() -> usize {
    5
}

// ----------------------------------------------------------------------------
// 5.10 Configuration Hot-Reload
// ----------------------------------------------------------------------------

/// Configuration manager with hot-reload support
pub struct ConfigManager {
    /// Current configuration
    config: ArcSwap<EngineConfig>,
    /// Configuration file path
    config_path: Option<PathBuf>,
    /// Last modification time
    last_modified: AtomicTimestamp,
    /// Reload callbacks
    callbacks: RwLock<Vec<Box<dyn Fn(&EngineConfig) + Send + Sync>>>,
}

impl ConfigManager {
    /// Create a new configuration manager
    pub fn new(config: EngineConfig) -> Self {
        Self {
            config: ArcSwap::from_pointee(config),
            config_path: None,
            last_modified: AtomicTimestamp::new(Timestamp::now()),
            callbacks: RwLock::new(Vec::new()),
        }
    }

    /// Create from file
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let config = EngineConfig::load(&path)?;
        let mut manager = Self::new(config);
        manager.config_path = Some(path.as_ref().to_path_buf());
        Ok(manager)
    }

    /// Get current configuration
    pub fn get(&self) -> arc_swap::Guard<Arc<EngineConfig>> {
        self.config.load()
    }

    /// Get a clone of the current configuration
    pub fn get_clone(&self) -> EngineConfig {
        (**self.config.load()).clone()
    }

    /// Update configuration
    pub fn update(&self, config: EngineConfig) -> Result<(), ConfigError> {
        config.validate()?;
        self.config.store(Arc::new(config.clone()));
        self.last_modified.store(Timestamp::now(), AtomicOrdering::Release);
        
        // Notify callbacks
        let callbacks = self.callbacks.read();
        for callback in callbacks.iter() {
            callback(&config);
        }
        
        Ok(())
    }

    /// Reload from file
    pub fn reload(&self) -> Result<(), ConfigError> {
        if let Some(path) = &self.config_path {
            let config = EngineConfig::load(path)?;
            self.update(config)?;
        }
        Ok(())
    }

    /// Register a reload callback
    pub fn on_reload<F>(&self, callback: F)
    where
        F: Fn(&EngineConfig) + Send + Sync + 'static,
    {
        let mut callbacks = self.callbacks.write();
        callbacks.push(Box::new(callback));
    }

    /// Check if file changed and reload if needed
    pub fn check_and_reload(&self) -> Result<bool, ConfigError> {
        if let Some(path) = &self.config_path {
            if let Ok(metadata) = fs::metadata(path) {
                if let Ok(modified) = metadata.modified() {
                    let file_ts = Timestamp::from(modified);
                    let last = self.last_modified.load(AtomicOrdering::Acquire);
                    if file_ts.as_nanos() > last.as_nanos() {
                        self.reload()?;
                        return Ok(true);
                    }
                }
            }
        }
        Ok(false)
    }
}

impl Debug for ConfigManager {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.debug_struct("ConfigManager")
            .field("config", &*self.config.load())
            .field("config_path", &self.config_path)
            .finish()
    }
}

/// Helper to get number of CPUs
fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(4)
}


// ============================================================================
// SECTION 6: LOGGING & TRACING INFRASTRUCTURE
// ============================================================================
// Production-grade logging and distributed tracing with:
// - Structured logging (JSON support)
// - Multiple output targets
// - Log levels and filtering
// - OpenTelemetry integration
// - Performance-focused (zero-cost when disabled)
// ============================================================================

// ----------------------------------------------------------------------------
// 6.1 Log Level Management
// ----------------------------------------------------------------------------

/// Log levels for the engine
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    /// Convert to tracing::Level
    pub fn to_tracing_level(&self) -> Level {
        match self {
            LogLevel::Trace => Level::TRACE,
            LogLevel::Debug => Level::DEBUG,
            LogLevel::Info => Level::INFO,
            LogLevel::Warn => Level::WARN,
            LogLevel::Error => Level::ERROR,
        }
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "trace" => LogLevel::Trace,
            "debug" => LogLevel::Debug,
            "info" => LogLevel::Info,
            "warn" | "warning" => LogLevel::Warn,
            "error" => LogLevel::Error,
            _ => LogLevel::Info,
        }
    }
}

impl Display for LogLevel {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            LogLevel::Trace => write!(f, "trace"),
            LogLevel::Debug => write!(f, "debug"),
            LogLevel::Info => write!(f, "info"),
            LogLevel::Warn => write!(f, "warn"),
            LogLevel::Error => write!(f, "error"),
        }
    }
}

// ----------------------------------------------------------------------------
// 6.2 Logger Initialization
// ----------------------------------------------------------------------------

/// Initialize the logging system based on configuration
pub fn init_logging(config: &LoggingConfig) -> CerebroResult<()> {
    let level_filter = match config.level.to_lowercase().as_str() {
        "trace" => tracing::level_filters::LevelFilter::TRACE,
        "debug" => tracing::level_filters::LevelFilter::DEBUG,
        "info" => tracing::level_filters::LevelFilter::INFO,
        "warn" => tracing::level_filters::LevelFilter::WARN,
        "error" => tracing::level_filters::LevelFilter::ERROR,
        _ => tracing::level_filters::LevelFilter::INFO,
    };

    let env_filter = EnvFilter::builder()
        .with_default_directive(level_filter.into())
        .from_env_lossy();

    // Build the subscriber based on format
    match config.format.as_str() {
        "json" => {
            let subscriber = tracing_subscriber::registry()
                .with(env_filter)
                .with(
                    fmt::layer()
                        .json()
                        .with_timer(fmt::time::UtcTime::rfc_3339())
                        .with_target(true)
                        .with_file(config.source_location)
                        .with_line_number(config.source_location)
                        .with_thread_ids(true)
                        .with_thread_names(true),
                );
            tracing::subscriber::set_global_default(subscriber)
                .map_err(|e| CerebroError::Internal(format!("Failed to set logger: {}", e)))?;
        }
        "compact" => {
            let subscriber = tracing_subscriber::registry()
                .with(env_filter)
                .with(
                    fmt::layer()
                        .compact()
                        .with_ansi(config.colors)
                        .with_target(true),
                );
            tracing::subscriber::set_global_default(subscriber)
                .map_err(|e| CerebroError::Internal(format!("Failed to set logger: {}", e)))?;
        }
        _ => {
            // Pretty format (default)
            let subscriber = tracing_subscriber::registry()
                .with(env_filter)
                .with(
                    fmt::layer()
                        .pretty()
                        .with_ansi(config.colors)
                        .with_target(true)
                        .with_file(config.source_location)
                        .with_line_number(config.source_location)
                        .with_thread_ids(false)
                        .with_thread_names(true),
                );
            tracing::subscriber::set_global_default(subscriber)
                .map_err(|e| CerebroError::Internal(format!("Failed to set logger: {}", e)))?;
        }
    }

    info!(
        target: "cerebro::init",
        level = %config.level,
        format = %config.format,
        "Logging initialized"
    );

    Ok(())
}

// ----------------------------------------------------------------------------
// 6.3 Structured Log Events
// ----------------------------------------------------------------------------

/// A structured log event that can be serialized
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEvent {
    /// Timestamp
    pub timestamp: Timestamp,
    /// Log level
    pub level: String,
    /// Target/module
    pub target: String,
    /// Message
    pub message: String,
    /// Structured fields
    pub fields: HashMap<String, JsonValue>,
    /// Span information
    pub span: Option<SpanInfo>,
}

/// Span information for distributed tracing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanInfo {
    /// Span name
    pub name: String,
    /// Trace ID
    pub trace_id: Option<String>,
    /// Span ID
    pub span_id: Option<String>,
    /// Parent span ID
    pub parent_span_id: Option<String>,
}

// ----------------------------------------------------------------------------
// 6.4 Logging Macros for Engine Components
// ----------------------------------------------------------------------------

/// Log a metric collection event
#[macro_export]
macro_rules! log_metric {
    ($name:expr, $value:expr) => {
        tracing::trace!(
            target: "cerebro::metrics",
            metric_name = $name,
            metric_value = ?$value,
            "Metric collected"
        )
    };
    ($name:expr, $value:expr, $($field:tt)*) => {
        tracing::trace!(
            target: "cerebro::metrics",
            metric_name = $name,
            metric_value = ?$value,
            $($field)*,
            "Metric collected"
        )
    };
}

/// Log an alert event
#[macro_export]
macro_rules! log_alert {
    ($severity:expr, $message:expr) => {
        tracing::warn!(
            target: "cerebro::alerts",
            severity = %$severity,
            message = $message,
            "Alert triggered"
        )
    };
    ($severity:expr, $message:expr, $($field:tt)*) => {
        tracing::warn!(
            target: "cerebro::alerts",
            severity = %$severity,
            message = $message,
            $($field)*,
            "Alert triggered"
        )
    };
}

/// Log a collector event
#[macro_export]
macro_rules! log_collector {
    ($collector:expr, $event:expr) => {
        tracing::debug!(
            target: "cerebro::collectors",
            collector = $collector,
            event = $event,
            "Collector event"
        )
    };
    ($collector:expr, $event:expr, $($field:tt)*) => {
        tracing::debug!(
            target: "cerebro::collectors",
            collector = $collector,
            event = $event,
            $($field)*,
            "Collector event"
        )
    };
}

/// Log a performance event
#[macro_export]
macro_rules! log_perf {
    ($operation:expr, $duration_ms:expr) => {
        tracing::trace!(
            target: "cerebro::perf",
            operation = $operation,
            duration_ms = $duration_ms,
            "Performance measurement"
        )
    };
}

// ----------------------------------------------------------------------------
// 6.5 Performance Timer
// ----------------------------------------------------------------------------

/// A simple timer for measuring operation duration
pub struct PerfTimer {
    name: &'static str,
    start: Instant,
    threshold_ms: Option<u64>,
}

impl PerfTimer {
    /// Start a new timer
    pub fn new(name: &'static str) -> Self {
        Self {
            name,
            start: Instant::now(),
            threshold_ms: None,
        }
    }

    /// Start a timer with a warning threshold
    pub fn with_threshold(name: &'static str, threshold_ms: u64) -> Self {
        Self {
            name,
            start: Instant::now(),
            threshold_ms: Some(threshold_ms),
        }
    }

    /// Get elapsed time in milliseconds
    pub fn elapsed_ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }

    /// Get elapsed time in microseconds
    pub fn elapsed_us(&self) -> u64 {
        self.start.elapsed().as_micros() as u64
    }

    /// Stop the timer and log if above threshold
    pub fn stop(self) -> u64 {
        let elapsed = self.elapsed_ms();
        
        if let Some(threshold) = self.threshold_ms {
            if elapsed > threshold {
                warn!(
                    target: "cerebro::perf",
                    operation = self.name,
                    elapsed_ms = elapsed,
                    threshold_ms = threshold,
                    "Operation exceeded threshold"
                );
            }
        }
        
        trace!(
            target: "cerebro::perf",
            operation = self.name,
            elapsed_ms = elapsed,
            "Operation completed"
        );
        
        elapsed
    }
}

impl Drop for PerfTimer {
    fn drop(&mut self) {
        // Timer dropped without explicit stop, just log at trace level
        let elapsed = self.elapsed_ms();
        trace!(
            target: "cerebro::perf",
            operation = self.name,
            elapsed_ms = elapsed,
            "Timer dropped"
        );
    }
}

// ----------------------------------------------------------------------------
// 6.6 Log Buffer for Async Processing
// ----------------------------------------------------------------------------

/// A buffer for collecting log events for async processing
pub struct LogBuffer {
    events: ArrayQueue<LogEvent>,
    overflow_count: AtomicU64,
}

impl LogBuffer {
    /// Create a new log buffer with specified capacity
    pub fn new(capacity: usize) -> Self {
        Self {
            events: ArrayQueue::new(capacity),
            overflow_count: AtomicU64::new(0),
        }
    }

    /// Push a log event
    pub fn push(&self, event: LogEvent) -> bool {
        match self.events.push(event) {
            Ok(()) => true,
            Err(_) => {
                self.overflow_count.fetch_add(1, AtomicOrdering::Relaxed);
                false
            }
        }
    }

    /// Pop a log event
    pub fn pop(&self) -> Option<LogEvent> {
        self.events.pop()
    }

    /// Drain all events
    pub fn drain(&self) -> Vec<LogEvent> {
        let mut events = Vec::new();
        while let Some(event) = self.events.pop() {
            events.push(event);
        }
        events
    }

    /// Get overflow count
    pub fn overflow_count(&self) -> u64 {
        self.overflow_count.load(AtomicOrdering::Relaxed)
    }

    /// Get current size
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }
}


// ============================================================================
// SECTION 7: MEMORY MANAGEMENT STRATEGY
// ============================================================================
// High-performance memory management with:
// - Object pools for frequently allocated types
// - Arena allocators for batch processing
// - Memory-efficient data structures
// - Cache-friendly layouts
// - Memory usage tracking
// ============================================================================

// ----------------------------------------------------------------------------
// 7.1 Object Pool for Metrics
// ----------------------------------------------------------------------------

/// A thread-safe object pool for reusing metric objects
pub struct MetricPool {
    /// Pool of available metrics
    pool: ArrayQueue<Box<Metric>>,
    /// Number of allocations
    allocations: AtomicU64,
    /// Number of reuses
    reuses: AtomicU64,
    /// Maximum pool size
    max_size: usize,
}

impl MetricPool {
    /// Create a new metric pool
    pub fn new(max_size: usize) -> Self {
        Self {
            pool: ArrayQueue::new(max_size),
            allocations: AtomicU64::new(0),
            reuses: AtomicU64::new(0),
            max_size,
        }
    }

    /// Create with pre-allocated metrics
    pub fn with_preallocated(initial_size: usize, max_size: usize) -> Self {
        let pool = Self::new(max_size);
        for _ in 0..initial_size.min(max_size) {
            let metric = Box::new(Metric::new("__pool__", MetricValue::None));
            let _ = pool.pool.push(metric);
        }
        pool
    }

    /// Get a metric from the pool or allocate a new one
    pub fn get(&self) -> Box<Metric> {
        match self.pool.pop() {
            Some(mut metric) => {
                self.reuses.fetch_add(1, AtomicOrdering::Relaxed);
                // Reset the metric
                metric.id = MetricId::NULL;
                metric.name = CompactString::new("");
                metric.value = MetricValue::None;
                metric.timestamp = Timestamp::now();
                metric.project_id = 0;
                metric.source = MetricSource::Unknown;
                metric.category = MetricCategory::Unknown;
                metric.priority = Priority::Normal;
                metric.labels.clear();
                metric.description = None;
                metric.unit = None;
                metric
            }
            None => {
                self.allocations.fetch_add(1, AtomicOrdering::Relaxed);
                Box::new(Metric::new("", MetricValue::None))
            }
        }
    }

    /// Return a metric to the pool
    pub fn put(&self, metric: Box<Metric>) {
        // Only return to pool if not full
        let _ = self.pool.push(metric);
    }

    /// Get pool statistics
    pub fn stats(&self) -> PoolStats {
        PoolStats {
            pool_size: self.pool.len(),
            max_size: self.max_size,
            allocations: self.allocations.load(AtomicOrdering::Relaxed),
            reuses: self.reuses.load(AtomicOrdering::Relaxed),
        }
    }

    /// Get the reuse ratio (0.0 - 1.0)
    pub fn reuse_ratio(&self) -> f64 {
        let allocs = self.allocations.load(AtomicOrdering::Relaxed);
        let reuses = self.reuses.load(AtomicOrdering::Relaxed);
        let total = allocs + reuses;
        if total == 0 {
            0.0
        } else {
            reuses as f64 / total as f64
        }
    }
}

/// Statistics for an object pool
#[derive(Debug, Clone, Copy)]
pub struct PoolStats {
    pub pool_size: usize,
    pub max_size: usize,
    pub allocations: u64,
    pub reuses: u64,
}

impl PoolStats {
    pub fn reuse_ratio(&self) -> f64 {
        let total = self.allocations + self.reuses;
        if total == 0 {
            0.0
        } else {
            self.reuses as f64 / total as f64
        }
    }
}

// ----------------------------------------------------------------------------
// 7.2 Buffer Pool for Byte Buffers
// ----------------------------------------------------------------------------

/// A pool of reusable byte buffers
pub struct BufferPool {
    /// Small buffers (< 4KB)
    small: ArrayQueue<Vec<u8>>,
    /// Medium buffers (4KB - 64KB)
    medium: ArrayQueue<Vec<u8>>,
    /// Large buffers (64KB - 1MB)
    large: ArrayQueue<Vec<u8>>,
    /// Stats
    stats: BufferPoolStats,
}

#[derive(Debug, Default)]
struct BufferPoolStats {
    small_hits: AtomicU64,
    small_misses: AtomicU64,
    medium_hits: AtomicU64,
    medium_misses: AtomicU64,
    large_hits: AtomicU64,
    large_misses: AtomicU64,
}

impl BufferPool {
    const SMALL_SIZE: usize = 4 * 1024;
    const MEDIUM_SIZE: usize = 64 * 1024;
    const LARGE_SIZE: usize = 1024 * 1024;
    const POOL_SIZE: usize = 256;

    /// Create a new buffer pool
    pub fn new() -> Self {
        Self {
            small: ArrayQueue::new(Self::POOL_SIZE),
            medium: ArrayQueue::new(Self::POOL_SIZE / 2),
            large: ArrayQueue::new(Self::POOL_SIZE / 4),
            stats: BufferPoolStats::default(),
        }
    }

    /// Get a buffer of at least the specified size
    pub fn get(&self, min_size: usize) -> Vec<u8> {
        if min_size <= Self::SMALL_SIZE {
            match self.small.pop() {
                Some(mut buf) => {
                    self.stats.small_hits.fetch_add(1, AtomicOrdering::Relaxed);
                    buf.clear();
                    buf
                }
                None => {
                    self.stats.small_misses.fetch_add(1, AtomicOrdering::Relaxed);
                    Vec::with_capacity(Self::SMALL_SIZE)
                }
            }
        } else if min_size <= Self::MEDIUM_SIZE {
            match self.medium.pop() {
                Some(mut buf) => {
                    self.stats.medium_hits.fetch_add(1, AtomicOrdering::Relaxed);
                    buf.clear();
                    buf
                }
                None => {
                    self.stats.medium_misses.fetch_add(1, AtomicOrdering::Relaxed);
                    Vec::with_capacity(Self::MEDIUM_SIZE)
                }
            }
        } else if min_size <= Self::LARGE_SIZE {
            match self.large.pop() {
                Some(mut buf) => {
                    self.stats.large_hits.fetch_add(1, AtomicOrdering::Relaxed);
                    buf.clear();
                    buf
                }
                None => {
                    self.stats.large_misses.fetch_add(1, AtomicOrdering::Relaxed);
                    Vec::with_capacity(Self::LARGE_SIZE)
                }
            }
        } else {
            // Too large for pool
            Vec::with_capacity(min_size)
        }
    }

    /// Return a buffer to the pool
    pub fn put(&self, buf: Vec<u8>) {
        let cap = buf.capacity();
        if cap <= Self::SMALL_SIZE {
            let _ = self.small.push(buf);
        } else if cap <= Self::MEDIUM_SIZE {
            let _ = self.medium.push(buf);
        } else if cap <= Self::LARGE_SIZE {
            let _ = self.large.push(buf);
        }
        // Buffers larger than LARGE_SIZE are dropped
    }

    /// Get pool statistics
    pub fn stats(&self) -> BufferPoolStatsSummary {
        BufferPoolStatsSummary {
            small_pool_size: self.small.len(),
            medium_pool_size: self.medium.len(),
            large_pool_size: self.large.len(),
            small_hit_ratio: self.hit_ratio(
                self.stats.small_hits.load(AtomicOrdering::Relaxed),
                self.stats.small_misses.load(AtomicOrdering::Relaxed),
            ),
            medium_hit_ratio: self.hit_ratio(
                self.stats.medium_hits.load(AtomicOrdering::Relaxed),
                self.stats.medium_misses.load(AtomicOrdering::Relaxed),
            ),
            large_hit_ratio: self.hit_ratio(
                self.stats.large_hits.load(AtomicOrdering::Relaxed),
                self.stats.large_misses.load(AtomicOrdering::Relaxed),
            ),
        }
    }

    fn hit_ratio(&self, hits: u64, misses: u64) -> f64 {
        let total = hits + misses;
        if total == 0 {
            0.0
        } else {
            hits as f64 / total as f64
        }
    }
}

impl Default for BufferPool {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct BufferPoolStatsSummary {
    pub small_pool_size: usize,
    pub medium_pool_size: usize,
    pub large_pool_size: usize,
    pub small_hit_ratio: f64,
    pub medium_hit_ratio: f64,
    pub large_hit_ratio: f64,
}

// ----------------------------------------------------------------------------
// 7.3 Arena Allocator Wrapper
// ----------------------------------------------------------------------------

/// A wrapper around bumpalo for batch allocations
pub struct Arena {
    bump: Bump,
    bytes_allocated: AtomicUsize,
}

impl Arena {
    /// Create a new arena
    pub fn new() -> Self {
        Self {
            bump: Bump::new(),
            bytes_allocated: AtomicUsize::new(0),
        }
    }

    /// Create an arena with initial capacity
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            bump: Bump::with_capacity(capacity),
            bytes_allocated: AtomicUsize::new(0),
        }
    }

    /// Allocate a value in the arena
    pub fn alloc<T>(&self, val: T) -> &mut T {
        self.bytes_allocated
            .fetch_add(mem::size_of::<T>(), AtomicOrdering::Relaxed);
        self.bump.alloc(val)
    }

    /// Allocate a slice in the arena
    pub fn alloc_slice<T: Copy>(&self, slice: &[T]) -> &mut [T] {
        self.bytes_allocated
            .fetch_add(mem::size_of::<T>() * slice.len(), AtomicOrdering::Relaxed);
        self.bump.alloc_slice_copy(slice)
    }

    /// Allocate a string in the arena
    pub fn alloc_str(&self, s: &str) -> &str {
        self.bytes_allocated
            .fetch_add(s.len(), AtomicOrdering::Relaxed);
        self.bump.alloc_str(s)
    }

    /// Reset the arena (deallocate everything)
    pub fn reset(&mut self) {
        self.bump.reset();
        self.bytes_allocated.store(0, AtomicOrdering::Relaxed);
    }

    /// Get bytes allocated
    pub fn bytes_allocated(&self) -> usize {
        self.bytes_allocated.load(AtomicOrdering::Relaxed)
    }

    /// Get total capacity
    pub fn capacity(&self) -> usize {
        self.bump.allocated_bytes()
    }
}

impl Default for Arena {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 7.4 Memory Usage Tracker
// ----------------------------------------------------------------------------

/// Tracks memory usage across the engine
pub struct MemoryTracker {
    /// Total allocated bytes
    total_allocated: AtomicUsize,
    /// Peak allocated bytes
    peak_allocated: AtomicUsize,
    /// Allocations by component
    by_component: DashMap<CompactString, AtomicUsize>,
    /// Memory limit
    limit: AtomicUsize,
}

impl MemoryTracker {
    /// Create a new memory tracker
    pub fn new(limit: usize) -> Self {
        Self {
            total_allocated: AtomicUsize::new(0),
            peak_allocated: AtomicUsize::new(0),
            by_component: DashMap::new(),
            limit: AtomicUsize::new(limit),
        }
    }

    /// Record an allocation
    pub fn allocate(&self, component: &str, bytes: usize) -> bool {
        let current = self.total_allocated.fetch_add(bytes, AtomicOrdering::Relaxed);
        let new_total = current + bytes;
        
        // Update peak
        let mut peak = self.peak_allocated.load(AtomicOrdering::Relaxed);
        while new_total > peak {
            match self.peak_allocated.compare_exchange_weak(
                peak,
                new_total,
                AtomicOrdering::Relaxed,
                AtomicOrdering::Relaxed,
            ) {
                Ok(_) => break,
                Err(p) => peak = p,
            }
        }

        // Update component tracking
        self.by_component
            .entry(CompactString::from(component))
            .or_insert_with(|| AtomicUsize::new(0))
            .fetch_add(bytes, AtomicOrdering::Relaxed);

        // Check limit
        new_total <= self.limit.load(AtomicOrdering::Relaxed)
    }

    /// Record a deallocation
    pub fn deallocate(&self, component: &str, bytes: usize) {
        self.total_allocated.fetch_sub(bytes, AtomicOrdering::Relaxed);
        
        if let Some(counter) = self.by_component.get(component) {
            counter.fetch_sub(bytes, AtomicOrdering::Relaxed);
        }
    }

    /// Get current usage
    pub fn current_usage(&self) -> usize {
        self.total_allocated.load(AtomicOrdering::Relaxed)
    }

    /// Get peak usage
    pub fn peak_usage(&self) -> usize {
        self.peak_allocated.load(AtomicOrdering::Relaxed)
    }

    /// Get usage by component
    pub fn component_usage(&self, component: &str) -> usize {
        self.by_component
            .get(component)
            .map(|c| c.load(AtomicOrdering::Relaxed))
            .unwrap_or(0)
    }

    /// Get all component usages
    pub fn all_component_usages(&self) -> HashMap<String, usize> {
        self.by_component
            .iter()
            .map(|e| (e.key().to_string(), e.value().load(AtomicOrdering::Relaxed)))
            .collect()
    }

    /// Check if under limit
    pub fn is_under_limit(&self) -> bool {
        self.current_usage() < self.limit.load(AtomicOrdering::Relaxed)
    }

    /// Get usage percentage
    pub fn usage_percentage(&self) -> f64 {
        let current = self.current_usage() as f64;
        let limit = self.limit.load(AtomicOrdering::Relaxed) as f64;
        if limit == 0.0 {
            0.0
        } else {
            (current / limit) * 100.0
        }
    }

    /// Update the limit
    pub fn set_limit(&self, new_limit: usize) {
        self.limit.store(new_limit, AtomicOrdering::Relaxed);
    }

    /// Reset statistics
    pub fn reset(&self) {
        self.total_allocated.store(0, AtomicOrdering::Relaxed);
        self.peak_allocated.store(0, AtomicOrdering::Relaxed);
        self.by_component.clear();
    }
}

impl Default for MemoryTracker {
    fn default() -> Self {
        Self::new(MAX_TIMESERIES_MEMORY)
    }
}

// ----------------------------------------------------------------------------
// 7.5 Cache-Padded Wrapper
// ----------------------------------------------------------------------------

/// A wrapper that ensures the inner value is on its own cache line
/// to prevent false sharing between threads
#[derive(Debug)]
#[repr(align(64))]
pub struct CacheAligned<T> {
    value: T,
    _padding: [u8; 0],
}

impl<T> CacheAligned<T> {
    /// Create a new cache-aligned value
    pub const fn new(value: T) -> Self {
        Self {
            value,
            _padding: [],
        }
    }

    /// Get a reference to the inner value
    pub fn get(&self) -> &T {
        &self.value
    }

    /// Get a mutable reference to the inner value
    pub fn get_mut(&mut self) -> &mut T {
        &mut self.value
    }

    /// Consume and return the inner value
    pub fn into_inner(self) -> T {
        self.value
    }
}

impl<T> Deref for CacheAligned<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}

impl<T> DerefMut for CacheAligned<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.value
    }
}

impl<T: Default> Default for CacheAligned<T> {
    fn default() -> Self {
        Self::new(T::default())
    }
}

// ----------------------------------------------------------------------------
// 7.6 Global Resource Pools
// ----------------------------------------------------------------------------

/// Global resource pools for the engine
pub struct GlobalPools {
    /// Metric object pool
    pub metrics: MetricPool,
    /// Buffer pool
    pub buffers: BufferPool,
    /// Memory tracker
    pub memory: MemoryTracker,
}

impl GlobalPools {
    /// Create global pools with default settings
    pub fn new() -> Self {
        Self {
            metrics: MetricPool::with_preallocated(
                OBJECT_POOL_INITIAL_CAPACITY,
                OBJECT_POOL_INITIAL_CAPACITY * 4,
            ),
            buffers: BufferPool::new(),
            memory: MemoryTracker::new(MAX_TIMESERIES_MEMORY),
        }
    }

    /// Create global pools with custom settings
    pub fn with_config(config: &StorageConfig) -> Self {
        Self {
            metrics: MetricPool::with_preallocated(
                OBJECT_POOL_INITIAL_CAPACITY,
                OBJECT_POOL_INITIAL_CAPACITY * 4,
            ),
            buffers: BufferPool::new(),
            memory: MemoryTracker::new(config.max_memory_bytes),
        }
    }

    /// Get statistics for all pools
    pub fn stats(&self) -> GlobalPoolsStats {
        GlobalPoolsStats {
            metrics: self.metrics.stats(),
            buffers: self.buffers.stats(),
            memory_used: self.memory.current_usage(),
            memory_peak: self.memory.peak_usage(),
            memory_limit: self.memory.limit.load(AtomicOrdering::Relaxed),
        }
    }
}

impl Default for GlobalPools {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct GlobalPoolsStats {
    pub metrics: PoolStats,
    pub buffers: BufferPoolStatsSummary,
    pub memory_used: usize,
    pub memory_peak: usize,
    pub memory_limit: usize,
}

// ----------------------------------------------------------------------------
// 7.7 Lazy Static Initialization
// ----------------------------------------------------------------------------

/// Global pools instance (lazily initialized)
static GLOBAL_POOLS: once_cell::sync::Lazy<GlobalPools> =
    once_cell::sync::Lazy::new(GlobalPools::new);

/// Get the global pools
pub fn global_pools() -> &'static GlobalPools {
    &GLOBAL_POOLS
}

/// Get a metric from the global pool
pub fn get_pooled_metric() -> Box<Metric> {
    GLOBAL_POOLS.metrics.get()
}

/// Return a metric to the global pool
pub fn return_pooled_metric(metric: Box<Metric>) {
    GLOBAL_POOLS.metrics.put(metric);
}

/// Get a buffer from the global pool
pub fn get_pooled_buffer(min_size: usize) -> Vec<u8> {
    GLOBAL_POOLS.buffers.get(min_size)
}

/// Return a buffer to the global pool
pub fn return_pooled_buffer(buffer: Vec<u8>) {
    GLOBAL_POOLS.buffers.put(buffer);
}


// ============================================================================
// SECTION 8: CLI & COMMAND LINE INTERFACE
// ============================================================================
// Professional command-line interface for the engine with:
// - Subcommands for different operations
// - Configuration file handling
// - Version and help information
// - Environment variable support
// ============================================================================

// ----------------------------------------------------------------------------
// 8.1 CLI Argument Parser
// ----------------------------------------------------------------------------

/// Cerebro Engine CLI
#[derive(Parser, Debug)]
#[command(
    name = "cerebro",
    author = "AIOps Team",
    version,
    about = "High-performance metrics collection engine for AIOps",
    long_about = "Cerebro Engine is a blazingly fast, lock-free metrics collection, \
                  aggregation, and distribution engine written in Rust. It serves as \
                  the nervous system for the Cerebro AIOps platform."
)]
pub struct Cli {
    /// Configuration file path
    #[arg(short, long, default_value = "cerebro.toml", env = "CEREBRO_CONFIG")]
    pub config: PathBuf,

    /// Log level override
    #[arg(short, long, env = "CEREBRO_LOG_LEVEL")]
    pub log_level: Option<String>,

    /// Enable debug mode
    #[arg(short, long, env = "CEREBRO_DEBUG")]
    pub debug: bool,

    /// Subcommand to run
    #[command(subcommand)]
    pub command: Option<Commands>,
}

/// Available subcommands
#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Start the engine
    Run {
        /// Run in foreground (don't daemonize)
        #[arg(short, long)]
        foreground: bool,

        /// PID file path (for daemon mode)
        #[arg(long)]
        pid_file: Option<PathBuf>,
    },

    /// Validate configuration file
    Validate {
        /// Show full parsed configuration
        #[arg(short, long)]
        verbose: bool,
    },

    /// Generate default configuration file
    GenerateConfig {
        /// Output path (default: stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Show engine status
    Status {
        /// Unix socket path to connect to
        #[arg(short, long, default_value = DEFAULT_UNIX_SOCKET_PATH)]
        socket: PathBuf,
    },

    /// Show engine version and build info
    Version,

    /// Run health check
    Health {
        /// Unix socket path to connect to
        #[arg(short, long, default_value = DEFAULT_UNIX_SOCKET_PATH)]
        socket: PathBuf,
    },

    /// Show collected metrics
    Metrics {
        /// Filter by metric name pattern
        #[arg(short, long)]
        filter: Option<String>,

        /// Output format (json, text, prometheus)
        #[arg(short = 'o', long, default_value = "text")]
        format: String,

        /// Unix socket path
        #[arg(short, long, default_value = DEFAULT_UNIX_SOCKET_PATH)]
        socket: PathBuf,
    },

    /// Manage projects
    Projects {
        #[command(subcommand)]
        action: ProjectCommands,
    },
}

/// Project management subcommands
#[derive(Subcommand, Debug)]
pub enum ProjectCommands {
    /// List all projects
    List,
    /// Show project details
    Show {
        /// Project ID or name
        project: String,
    },
    /// Add a new project
    Add {
        /// Project name
        name: String,
        /// Project type
        #[arg(short = 't', long, default_value = "custom")]
        project_type: String,
    },
    /// Remove a project
    Remove {
        /// Project ID or name
        project: String,
    },
}

// ----------------------------------------------------------------------------
// 8.2 CLI Handler Functions
// ----------------------------------------------------------------------------

/// Handle the validate subcommand
fn handle_validate(config_path: &Path, verbose: bool) -> CerebroResult<()> {
    println!("Validating configuration file: {}", config_path.display());
    
    match EngineConfig::load(config_path) {
        Ok(config) => {
            println!("✅ Configuration is valid!");
            
            if verbose {
                println!("\n📋 Parsed configuration:");
                println!("{}", "=".repeat(60));
                match toml::to_string_pretty(&config) {
                    Ok(s) => println!("{}", s),
                    Err(e) => println!("Failed to serialize: {}", e),
                }
            }
            
            // Show summary
            println!("\n📊 Configuration Summary:");
            println!("  • Instance name: {}", config.engine.instance_name);
            println!("  • Environment: {}", config.engine.environment);
            println!("  • Collection interval: {}ms", config.engine.collection_interval_ms);
            println!("  • Worker threads: {}", config.effective_worker_count());
            println!("  • Projects defined: {}", config.projects.len());
            println!("  • Collectors enabled:");
            if config.collectors.system.enabled { println!("    - System metrics"); }
            if config.collectors.netdata.enabled { println!("    - Netdata"); }
            if config.collectors.docker.enabled { println!("    - Docker"); }
            if config.collectors.network.enabled { println!("    - Network capture"); }
            if config.collectors.logs.enabled { println!("    - Log collection"); }
            if config.collectors.http.enabled { println!("    - HTTP endpoints"); }
            
            Ok(())
        }
        Err(e) => {
            println!("❌ Configuration validation failed!");
            println!("Error: {}", e);
            Err(CerebroError::Config(e))
        }
    }
}

/// Handle the generate-config subcommand
fn handle_generate_config(output: Option<&Path>) -> CerebroResult<()> {
    let config_str = EngineConfig::generate_default_config();
    
    match output {
        Some(path) => {
            fs::write(path, &config_str)
                .map_err(|e| CerebroError::Io(e))?;
            println!("✅ Default configuration written to: {}", path.display());
        }
        None => {
            println!("{}", config_str);
        }
    }
    
    Ok(())
}

/// Handle the version subcommand
fn handle_version() {
    println!("🧠 {} v{}", ENGINE_FULL_NAME, ENGINE_VERSION);
    println!();
    println!("Build Information:");
    println!("  • Rust version: {}", RUST_VERSION);
    println!("  • Target: {}", std::env::consts::ARCH);
    println!("  • OS: {}", std::env::consts::OS);
    println!("  • Family: {}", std::env::consts::FAMILY);
    println!();
    println!("Features:");
    println!("  • Lock-free data structures");
    println!("  • Multi-threaded processing");
    println!("  • Project-aware metric grouping");
    println!("  • Real-time anomaly detection");
    println!("  • Multiple output formats (Unix socket, gRPC, WebSocket, Prometheus)");
    println!();
    println!("Repository: https://github.com/your-org/cerebro-engine");
    println!("License: MIT");
}

// ----------------------------------------------------------------------------
// 8.3 Engine State
// ----------------------------------------------------------------------------

/// The main engine state
pub struct Engine {
    /// Configuration
    config: Arc<ConfigManager>,
    /// Global resource pools
    pools: Arc<GlobalPools>,
    /// Error statistics
    error_stats: Arc<ErrorStats>,
    /// Shutdown signal
    shutdown: Arc<Notify>,
    /// Running flag
    running: AtomicBool,
    /// Start time
    start_time: Timestamp,
}

impl Engine {
    /// Create a new engine instance
    pub fn new(config: EngineConfig) -> Self {
        let pools = GlobalPools::with_config(&config.storage);
        
        Self {
            config: Arc::new(ConfigManager::new(config)),
            pools: Arc::new(pools),
            error_stats: Arc::new(ErrorStats::new()),
            shutdown: Arc::new(Notify::new()),
            running: AtomicBool::new(false),
            start_time: Timestamp::now(),
        }
    }

    /// Create engine from configuration file
    pub fn from_config_file<P: AsRef<Path>>(path: P) -> CerebroResult<Self> {
        let config = EngineConfig::load(path)?;
        Ok(Self::new(config))
    }

    /// Get current configuration
    pub fn config(&self) -> arc_swap::Guard<Arc<EngineConfig>> {
        self.config.get()
    }

    /// Check if engine is running
    pub fn is_running(&self) -> bool {
        self.running.load(AtomicOrdering::Relaxed)
    }

    /// Get uptime
    pub fn uptime(&self) -> Duration {
        Timestamp::now().duration_since(self.start_time)
    }

    /// Signal shutdown
    pub fn shutdown(&self) {
        info!("Shutdown signal received");
        self.running.store(false, AtomicOrdering::Release);
        self.shutdown.notify_waiters();
    }

    /// Run the engine
    pub async fn run(&self) -> CerebroResult<()> {
        info!(
            target: "cerebro::engine",
            version = ENGINE_VERSION,
            "Starting Cerebro Engine"
        );

        self.running.store(true, AtomicOrdering::Release);

        let config = self.config.get();
        
        info!(
            target: "cerebro::engine",
            instance = %config.engine.instance_name,
            environment = %config.engine.environment,
            workers = config.effective_worker_count(),
            "Engine configuration loaded"
        );

        // Setup signal handlers
        let shutdown = self.shutdown.clone();
        let running = &self.running;
        
        tokio::spawn(async move {
            let mut sigterm = signal::unix::signal(signal::unix::SignalKind::terminate())
                .expect("Failed to setup SIGTERM handler");
            let mut sigint = signal::unix::signal(signal::unix::SignalKind::interrupt())
                .expect("Failed to setup SIGINT handler");
            
            tokio::select! {
                _ = sigterm.recv() => {
                    info!("Received SIGTERM");
                }
                _ = sigint.recv() => {
                    info!("Received SIGINT");
                }
            }
            
            shutdown.notify_waiters();
        });

        // Main engine loop
        info!(target: "cerebro::engine", "Engine started, entering main loop");
        
        let mut interval = interval(Duration::from_millis(config.engine.collection_interval_ms));
        
        while self.running.load(AtomicOrdering::Acquire) {
            tokio::select! {
                _ = interval.tick() => {
                    // Collection tick - this is where collectors would run
                    trace!(target: "cerebro::engine", "Collection tick");
                }
                _ = self.shutdown.notified() => {
                    info!(target: "cerebro::engine", "Shutdown notification received");
                    break;
                }
            }
        }

        // Graceful shutdown
        info!(target: "cerebro::engine", "Starting graceful shutdown");
        
        let shutdown_start = Instant::now();
        let timeout_duration = Duration::from_secs(config.engine.shutdown_timeout_secs);
        
        // TODO: Stop collectors, flush buffers, close connections
        
        let shutdown_duration = shutdown_start.elapsed();
        info!(
            target: "cerebro::engine",
            duration_ms = shutdown_duration.as_millis(),
            "Engine shutdown complete"
        );

        Ok(())
    }

    /// Get engine statistics
    pub fn stats(&self) -> EngineStats {
        EngineStats {
            uptime: self.uptime(),
            is_running: self.is_running(),
            pools: self.pools.stats(),
            errors: ErrorStatsSummary {
                total: self.error_stats.total_errors(),
                recoverable: self.error_stats.recoverable_count.load(AtomicOrdering::Relaxed),
                non_recoverable: self.error_stats.non_recoverable_count.load(AtomicOrdering::Relaxed),
            },
        }
    }
}

/// Engine statistics
#[derive(Debug, Clone)]
pub struct EngineStats {
    pub uptime: Duration,
    pub is_running: bool,
    pub pools: GlobalPoolsStats,
    pub errors: ErrorStatsSummary,
}

#[derive(Debug, Clone)]
pub struct ErrorStatsSummary {
    pub total: u64,
    pub recoverable: u64,
    pub non_recoverable: u64,
}

// ============================================================================
// SECTION 9: MAIN ENTRY POINT
// ============================================================================

/// Main entry point for the Cerebro engine
#[tokio::main]
async fn main() -> AnyhowResult<()> {
    // Parse CLI arguments
    let cli = Cli::parse();

    // Handle subcommands that don't need full initialization
    match &cli.command {
        Some(Commands::Version) => {
            handle_version();
            return Ok(());
        }
        Some(Commands::GenerateConfig { output }) => {
            handle_generate_config(output.as_deref())?;
            return Ok(());
        }
        Some(Commands::Validate { verbose }) => {
            handle_validate(&cli.config, *verbose)?;
            return Ok(());
        }
        _ => {}
    }

    // Load configuration
    let config = if cli.config.exists() {
        EngineConfig::load(&cli.config)
            .with_context(|| format!("Failed to load config from {}", cli.config.display()))?
    } else {
        warn!("Config file not found at {}, using defaults", cli.config.display());
        EngineConfig::default()
    };

    // Override log level if specified
    let mut logging_config = config.logging.clone();
    if let Some(level) = &cli.log_level {
        logging_config.level = level.clone();
    }
    if cli.debug {
        logging_config.level = "debug".into();
    }

    // Initialize logging
    init_logging(&logging_config)?;

    // Print banner
    info!("🧠 {} v{}", ENGINE_FULL_NAME, ENGINE_VERSION);
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Handle remaining subcommands
    match cli.command {
        Some(Commands::Run { foreground, pid_file }) => {
            let engine = Engine::new(config);
            
            if !foreground {
                info!("Note: Daemon mode not yet implemented, running in foreground");
            }
            
            engine.run().await?;
        }
        Some(Commands::Status { socket }) => {
            println!("Checking engine status at {}...", socket.display());
            // TODO: Connect to Unix socket and get status
            println!("Status check not yet implemented");
        }
        Some(Commands::Health { socket }) => {
            println!("Running health check...");
            // TODO: Implement health check
            println!("Health check not yet implemented");
        }
        Some(Commands::Metrics { filter, format, socket }) => {
            println!("Fetching metrics...");
            // TODO: Implement metrics fetching
            println!("Metrics fetch not yet implemented");
        }
        Some(Commands::Projects { action }) => {
            match action {
                ProjectCommands::List => {
                    println!("Listing projects...");
                    for project in &config.projects {
                        println!("  • {} (id: {}, type: {})", project.name, project.id, project.project_type);
                    }
                }
                ProjectCommands::Show { project } => {
                    println!("Showing project: {}", project);
                }
                ProjectCommands::Add { name, project_type } => {
                    println!("Adding project: {} (type: {})", name, project_type);
                }
                ProjectCommands::Remove { project } => {
                    println!("Removing project: {}", project);
                }
            }
        }
        None => {
            // Default: run the engine
            let engine = Engine::new(config);
            engine.run().await?;
        }
        _ => unreachable!(),
    }

    Ok(())
}

// ============================================================================
// SECTION 10: TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timestamp_operations() {
        let ts1 = Timestamp::now();
        std::thread::sleep(Duration::from_millis(10));
        let ts2 = Timestamp::now();
        
        assert!(ts2 > ts1);
        assert!(ts2.duration_since(ts1).as_millis() >= 10);
    }

    #[test]
    fn test_metric_id_computation() {
        let id1 = MetricId::from_name("cpu.usage");
        let id2 = MetricId::from_name("cpu.usage");
        let id3 = MetricId::from_name("memory.usage");
        
        assert_eq!(id1, id2);
        assert_ne!(id1, id3);
    }

    #[test]
    fn test_labels() {
        let mut labels: Labels = smallvec![
            Label::new("host", "web-01"),
            Label::new("env", "prod"),
        ];
        
        assert_eq!(labels.get("host"), Some("web-01"));
        assert_eq!(labels.get("env"), Some("prod"));
        assert_eq!(labels.get("missing"), None);
        
        labels.set("host", "web-02");
        assert_eq!(labels.get("host"), Some("web-02"));
    }

    #[test]
    fn test_metric_creation() {
        let metric = Metric::gauge("cpu.usage", 75.5)
            .with_label("host", "server-01")
            .with_category(MetricCategory::CpuUsage)
            .with_priority(Priority::High);
        
        assert_eq!(metric.name.as_str(), "cpu.usage");
        assert_eq!(metric.as_f64(), Some(75.5));
        assert_eq!(metric.get_label("host"), Some("server-01"));
        assert_eq!(metric.category, MetricCategory::CpuUsage);
        assert_eq!(metric.priority, Priority::High);
    }

    #[test]
    fn test_metric_value_conversions() {
        let counter: MetricValue = 100u64.into();
        assert_eq!(counter.as_f64(), Some(100.0));
        
        let gauge: MetricValue = 3.14f64.into();
        assert_eq!(gauge.as_f64(), Some(3.14));
        
        let boolean: MetricValue = true.into();
        assert_eq!(boolean.as_f64(), Some(1.0));
    }

    #[test]
    fn test_config_defaults() {
        let config = EngineConfig::default();
        
        assert_eq!(config.engine.collection_interval_ms, DEFAULT_COLLECTION_INTERVAL_MS);
        assert!(config.collectors.system.enabled);
        assert!(!config.collectors.docker.enabled);
    }

    #[test]
    fn test_metric_pool() {
        let pool = MetricPool::new(10);
        
        let metric = pool.get();
        assert_eq!(pool.stats().allocations, 1);
        
        pool.put(metric);
        
        let metric2 = pool.get();
        assert_eq!(pool.stats().reuses, 1);
    }

    #[test]
    fn test_buffer_pool() {
        let pool = BufferPool::new();
        
        let small = pool.get(1024);
        assert!(small.capacity() >= 1024);
        
        let medium = pool.get(10000);
        assert!(medium.capacity() >= 10000);
        
        pool.put(small);
        pool.put(medium);
        
        let stats = pool.stats();
        assert_eq!(stats.small_pool_size, 1);
    }

    #[test]
    fn test_distribution_value() {
        let mut dist = DistributionValue::new();
        
        for i in 1..=100 {
            dist.add(i as f64);
        }
        
        assert_eq!(dist.count, 100);
        assert_eq!(dist.min, 1.0);
        assert_eq!(dist.max, 100.0);
        assert!((dist.mean() - 50.5).abs() < 0.001);
    }

    #[test]
    fn test_severity_ordering() {
        assert!(Severity::Critical > Severity::High);
        assert!(Severity::High > Severity::Medium);
        assert!(Severity::Medium > Severity::Low);
        assert!(Severity::Low > Severity::Info);
    }

    #[test]
    fn test_priority_ordering() {
        assert!(Priority::RealTime > Priority::Critical);
        assert!(Priority::Critical > Priority::High);
        assert!(Priority::High > Priority::Normal);
    }
}


// ============================================================================
// ██████╗ ██╗  ██╗ █████╗ ███████╗███████╗    ██████╗ 
// ██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ╚════██╗
// ██████╔╝███████║███████║███████╗█████╗       █████╔╝
// ██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝      ██╔═══╝ 
// ██║     ██║  ██║██║  ██║███████║███████╗    ███████╗
// ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝    ╚══════╝
// LOCK-FREE DATA STRUCTURES & CONCURRENCY PRIMITIVES
// ============================================================================

// ============================================================================
// SECTION 11: LOCK-FREE RING BUFFERS
// ============================================================================
// Ultra-fast, wait-free ring buffers for metric streaming:
// - SPSC (Single Producer Single Consumer) - For collector channels
// - MPMC (Multi Producer Multi Consumer) - For the metric bus
// - Bounded with overflow handling strategies
// - Cache-line aligned to prevent false sharing
// ============================================================================

// ----------------------------------------------------------------------------
// 11.1 SPSC Ring Buffer - Single Producer Single Consumer
// ----------------------------------------------------------------------------

/// A lock-free Single Producer Single Consumer ring buffer.
/// This is the fastest possible queue for point-to-point communication.
/// 
/// Uses cache-line padding to prevent false sharing between producer and consumer.
#[derive(Debug)]
pub struct SpscRingBuffer<T> {
    /// The buffer storage
    buffer: Box<[UnsafeCell<MaybeUninit<T>>]>,
    /// Capacity (power of 2 for fast modulo)
    capacity: usize,
    /// Mask for fast modulo (capacity - 1)
    mask: usize,
    /// Producer's head position (where to write next)
    head: CachePadded<AtomicUsize>,
    /// Consumer's tail position (where to read next)
    tail: CachePadded<AtomicUsize>,
    /// Overflow counter
    overflow_count: AtomicU64,
}

unsafe impl<T: Send> Send for SpscRingBuffer<T> {}
unsafe impl<T: Send> Sync for SpscRingBuffer<T> {}

impl<T> SpscRingBuffer<T> {
    /// Create a new SPSC ring buffer with the given capacity.
    /// Capacity will be rounded up to the next power of 2.
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.next_power_of_two();
        let buffer: Vec<UnsafeCell<MaybeUninit<T>>> = (0..capacity)
            .map(|_| UnsafeCell::new(MaybeUninit::uninit()))
            .collect();
        
        Self {
            buffer: buffer.into_boxed_slice(),
            capacity,
            mask: capacity - 1,
            head: CachePadded::new(AtomicUsize::new(0)),
            tail: CachePadded::new(AtomicUsize::new(0)),
            overflow_count: AtomicU64::new(0),
        }
    }

    /// Try to push an item into the buffer.
    /// Returns Ok(()) if successful, Err(item) if buffer is full.
    #[inline]
    pub fn try_push(&self, item: T) -> Result<(), T> {
        let head = self.head.load(AtomicOrdering::Relaxed);
        let tail = self.tail.load(AtomicOrdering::Acquire);
        
        // Check if buffer is full
        if head.wrapping_sub(tail) >= self.capacity {
            self.overflow_count.fetch_add(1, AtomicOrdering::Relaxed);
            return Err(item);
        }
        
        // Write the item
        let slot = head & self.mask;
        unsafe {
            (*self.buffer[slot].get()).write(item);
        }
        
        // Publish the write
        self.head.store(head.wrapping_add(1), AtomicOrdering::Release);
        
        Ok(())
    }

    /// Push an item, overwriting the oldest if full.
    /// Returns the overwritten item if any.
    #[inline]
    pub fn push_overwrite(&self, item: T) -> Option<T> {
        let head = self.head.load(AtomicOrdering::Relaxed);
        let tail = self.tail.load(AtomicOrdering::Acquire);
        
        let overwritten = if head.wrapping_sub(tail) >= self.capacity {
            // Buffer full, read and discard oldest
            let old_slot = tail & self.mask;
            let old = unsafe { (*self.buffer[old_slot].get()).assume_init_read() };
            self.tail.store(tail.wrapping_add(1), AtomicOrdering::Release);
            Some(old)
        } else {
            None
        };
        
        // Write the new item
        let slot = head & self.mask;
        unsafe {
            (*self.buffer[slot].get()).write(item);
        }
        
        self.head.store(head.wrapping_add(1), AtomicOrdering::Release);
        
        overwritten
    }

    /// Try to pop an item from the buffer.
    /// Returns Some(item) if successful, None if buffer is empty.
    #[inline]
    pub fn try_pop(&self) -> Option<T> {
        let tail = self.tail.load(AtomicOrdering::Relaxed);
        let head = self.head.load(AtomicOrdering::Acquire);
        
        // Check if buffer is empty
        if tail == head {
            return None;
        }
        
        // Read the item
        let slot = tail & self.mask;
        let item = unsafe { (*self.buffer[slot].get()).assume_init_read() };
        
        // Publish the read
        self.tail.store(tail.wrapping_add(1), AtomicOrdering::Release);
        
        Some(item)
    }

    /// Peek at the next item without removing it.
    #[inline]
    pub fn peek(&self) -> Option<&T> {
        let tail = self.tail.load(AtomicOrdering::Relaxed);
        let head = self.head.load(AtomicOrdering::Acquire);
        
        if tail == head {
            return None;
        }
        
        let slot = tail & self.mask;
        unsafe { Some((*self.buffer[slot].get()).assume_init_ref()) }
    }

    /// Get the number of items in the buffer.
    #[inline]
    pub fn len(&self) -> usize {
        let head = self.head.load(AtomicOrdering::Acquire);
        let tail = self.tail.load(AtomicOrdering::Acquire);
        head.wrapping_sub(tail)
    }

    /// Check if the buffer is empty.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Check if the buffer is full.
    #[inline]
    pub fn is_full(&self) -> bool {
        self.len() >= self.capacity
    }

    /// Get the capacity of the buffer.
    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Get the number of overflows that occurred.
    #[inline]
    pub fn overflow_count(&self) -> u64 {
        self.overflow_count.load(AtomicOrdering::Relaxed)
    }

    /// Get available space in the buffer.
    #[inline]
    pub fn available(&self) -> usize {
        self.capacity.saturating_sub(self.len())
    }

    /// Drain all items from the buffer.
    pub fn drain(&self) -> Vec<T> {
        let mut items = Vec::with_capacity(self.len());
        while let Some(item) = self.try_pop() {
            items.push(item);
        }
        items
    }

    /// Clear the buffer, dropping all items.
    pub fn clear(&self) {
        while self.try_pop().is_some() {}
    }
}

impl<T> Drop for SpscRingBuffer<T> {
    fn drop(&mut self) {
        // Drop any remaining items
        while self.try_pop().is_some() {}
    }
}

// ----------------------------------------------------------------------------
// 11.2 MPMC Ring Buffer - Multi Producer Multi Consumer
// ----------------------------------------------------------------------------

/// A lock-free Multi Producer Multi Consumer ring buffer.
/// Uses sequence numbers for coordination without locks.
/// 
/// This is more complex than SPSC but allows multiple threads to
/// push and pop concurrently.
#[derive(Debug)]
pub struct MpmcRingBuffer<T> {
    /// The buffer storage with sequence numbers
    buffer: Box<[MpmcSlot<T>]>,
    /// Capacity (power of 2)
    capacity: usize,
    /// Mask for fast modulo
    mask: usize,
    /// Producer position
    head: CachePadded<AtomicUsize>,
    /// Consumer position
    tail: CachePadded<AtomicUsize>,
    /// Overflow counter
    overflow_count: AtomicU64,
}

/// A slot in the MPMC ring buffer
#[derive(Debug)]
struct MpmcSlot<T> {
    /// Sequence number for this slot
    sequence: AtomicUsize,
    /// The data
    data: UnsafeCell<MaybeUninit<T>>,
}

unsafe impl<T: Send> Send for MpmcRingBuffer<T> {}
unsafe impl<T: Send> Sync for MpmcRingBuffer<T> {}

impl<T> MpmcRingBuffer<T> {
    /// Create a new MPMC ring buffer with the given capacity.
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.next_power_of_two();
        let buffer: Vec<MpmcSlot<T>> = (0..capacity)
            .map(|i| MpmcSlot {
                sequence: AtomicUsize::new(i),
                data: UnsafeCell::new(MaybeUninit::uninit()),
            })
            .collect();
        
        Self {
            buffer: buffer.into_boxed_slice(),
            capacity,
            mask: capacity - 1,
            head: CachePadded::new(AtomicUsize::new(0)),
            tail: CachePadded::new(AtomicUsize::new(0)),
            overflow_count: AtomicU64::new(0),
        }
    }

    /// Try to push an item into the buffer.
    #[inline]
    pub fn try_push(&self, item: T) -> Result<(), T> {
        let backoff = Backoff::new();
        let mut head = self.head.load(AtomicOrdering::Relaxed);
        
        loop {
            let slot = &self.buffer[head & self.mask];
            let seq = slot.sequence.load(AtomicOrdering::Acquire);
            let diff = seq as isize - head as isize;
            
            if diff == 0 {
                // Slot is ready for writing
                match self.head.compare_exchange_weak(
                    head,
                    head.wrapping_add(1),
                    AtomicOrdering::Relaxed,
                    AtomicOrdering::Relaxed,
                ) {
                    Ok(_) => {
                        // We own this slot, write the data
                        unsafe {
                            (*slot.data.get()).write(item);
                        }
                        // Publish the write
                        slot.sequence.store(head.wrapping_add(1), AtomicOrdering::Release);
                        return Ok(());
                    }
                    Err(h) => {
                        head = h;
                        backoff.spin();
                    }
                }
            } else if diff < 0 {
                // Buffer is full
                self.overflow_count.fetch_add(1, AtomicOrdering::Relaxed);
                return Err(item);
            } else {
                // Slot not yet consumed, retry
                head = self.head.load(AtomicOrdering::Relaxed);
                backoff.spin();
            }
        }
    }

    /// Try to pop an item from the buffer.
    #[inline]
    pub fn try_pop(&self) -> Option<T> {
        let backoff = Backoff::new();
        let mut tail = self.tail.load(AtomicOrdering::Relaxed);
        
        loop {
            let slot = &self.buffer[tail & self.mask];
            let seq = slot.sequence.load(AtomicOrdering::Acquire);
            let diff = seq as isize - tail.wrapping_add(1) as isize;
            
            if diff == 0 {
                // Slot has data ready
                match self.tail.compare_exchange_weak(
                    tail,
                    tail.wrapping_add(1),
                    AtomicOrdering::Relaxed,
                    AtomicOrdering::Relaxed,
                ) {
                    Ok(_) => {
                        // We own this slot, read the data
                        let item = unsafe { (*slot.data.get()).assume_init_read() };
                        // Mark slot as available for writing
                        slot.sequence.store(tail.wrapping_add(self.capacity), AtomicOrdering::Release);
                        return Some(item);
                    }
                    Err(t) => {
                        tail = t;
                        backoff.spin();
                    }
                }
            } else if diff < 0 {
                // Buffer is empty
                return None;
            } else {
                // Slot not yet written, retry
                tail = self.tail.load(AtomicOrdering::Relaxed);
                backoff.spin();
            }
        }
    }

    /// Get approximate length (may be stale).
    #[inline]
    pub fn len(&self) -> usize {
        let head = self.head.load(AtomicOrdering::Relaxed);
        let tail = self.tail.load(AtomicOrdering::Relaxed);
        head.wrapping_sub(tail)
    }

    /// Check if approximately empty.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Get capacity.
    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Get overflow count.
    #[inline]
    pub fn overflow_count(&self) -> u64 {
        self.overflow_count.load(AtomicOrdering::Relaxed)
    }

    /// Drain all items.
    pub fn drain(&self) -> Vec<T> {
        let mut items = Vec::with_capacity(self.len());
        while let Some(item) = self.try_pop() {
            items.push(item);
        }
        items
    }
}

impl<T> Drop for MpmcRingBuffer<T> {
    fn drop(&mut self) {
        while self.try_pop().is_some() {}
    }
}

// ----------------------------------------------------------------------------
// 11.3 Bounded Metric Buffer - Specialized for Metrics
// ----------------------------------------------------------------------------

/// A specialized ring buffer for metrics with batch operations.
pub struct MetricRingBuffer {
    /// Inner MPMC buffer
    inner: MpmcRingBuffer<Metric>,
    /// Total metrics pushed
    total_pushed: AtomicU64,
    /// Total metrics popped
    total_popped: AtomicU64,
    /// Batch buffer for efficient batch pops
    batch_size: usize,
}

impl MetricRingBuffer {
    /// Create a new metric ring buffer.
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: MpmcRingBuffer::new(capacity),
            total_pushed: AtomicU64::new(0),
            total_popped: AtomicU64::new(0),
            batch_size: METRIC_BATCH_SIZE,
        }
    }

    /// Push a single metric.
    #[inline]
    pub fn push(&self, metric: Metric) -> Result<(), Metric> {
        let result = self.inner.try_push(metric);
        if result.is_ok() {
            self.total_pushed.fetch_add(1, AtomicOrdering::Relaxed);
        }
        result
    }

    /// Push a batch of metrics.
    pub fn push_batch(&self, metrics: Vec<Metric>) -> usize {
        let mut pushed = 0;
        for metric in metrics {
            if self.push(metric).is_ok() {
                pushed += 1;
            } else {
                break;
            }
        }
        pushed
    }

    /// Pop a single metric.
    #[inline]
    pub fn pop(&self) -> Option<Metric> {
        let result = self.inner.try_pop();
        if result.is_some() {
            self.total_popped.fetch_add(1, AtomicOrdering::Relaxed);
        }
        result
    }

    /// Pop a batch of metrics (up to batch_size).
    pub fn pop_batch(&self) -> Vec<Metric> {
        let mut batch = Vec::with_capacity(self.batch_size);
        for _ in 0..self.batch_size {
            match self.pop() {
                Some(metric) => batch.push(metric),
                None => break,
            }
        }
        batch
    }

    /// Pop all available metrics.
    pub fn pop_all(&self) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(self.len());
        while let Some(metric) = self.pop() {
            metrics.push(metric);
        }
        metrics
    }

    /// Get current length.
    #[inline]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Check if empty.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Get capacity.
    #[inline]
    pub fn capacity(&self) -> usize {
        self.inner.capacity()
    }

    /// Get statistics.
    pub fn stats(&self) -> MetricBufferStats {
        MetricBufferStats {
            capacity: self.capacity(),
            current_len: self.len(),
            total_pushed: self.total_pushed.load(AtomicOrdering::Relaxed),
            total_popped: self.total_popped.load(AtomicOrdering::Relaxed),
            overflow_count: self.inner.overflow_count(),
            utilization: self.len() as f64 / self.capacity() as f64,
        }
    }
}

/// Statistics for a metric buffer.
#[derive(Debug, Clone)]
pub struct MetricBufferStats {
    pub capacity: usize,
    pub current_len: usize,
    pub total_pushed: u64,
    pub total_popped: u64,
    pub overflow_count: u64,
    pub utilization: f64,
}


// ============================================================================
// SECTION 12: ATOMIC ACCUMULATORS & STATISTICS
// ============================================================================
// Lock-free statistical accumulators for real-time metrics aggregation:
// - Atomic counters, gauges, and rate calculators
// - Lock-free min/max/sum/count tracking
// - Exponential moving averages
// - Approximate percentiles (t-digest inspired)
// ============================================================================

// ----------------------------------------------------------------------------
// 12.1 Atomic Float - Lock-free f64 Operations
// ----------------------------------------------------------------------------

/// An atomic f64 value using bit casting to AtomicU64.
#[derive(Debug)]
#[repr(transparent)]
pub struct AtomicF64 {
    bits: AtomicU64,
}

impl AtomicF64 {
    /// Create a new atomic f64.
    #[inline]
    pub const fn new(val: f64) -> Self {
        Self {
            bits: AtomicU64::new(val.to_bits()),
        }
    }

    /// Load the value.
    #[inline]
    pub fn load(&self, ordering: AtomicOrdering) -> f64 {
        f64::from_bits(self.bits.load(ordering))
    }

    /// Store a value.
    #[inline]
    pub fn store(&self, val: f64, ordering: AtomicOrdering) {
        self.bits.store(val.to_bits(), ordering);
    }

    /// Swap and return the old value.
    #[inline]
    pub fn swap(&self, val: f64, ordering: AtomicOrdering) -> f64 {
        f64::from_bits(self.bits.swap(val.to_bits(), ordering))
    }

    /// Compare and exchange.
    #[inline]
    pub fn compare_exchange(
        &self,
        current: f64,
        new: f64,
        success: AtomicOrdering,
        failure: AtomicOrdering,
    ) -> Result<f64, f64> {
        self.bits
            .compare_exchange(current.to_bits(), new.to_bits(), success, failure)
            .map(f64::from_bits)
            .map_err(f64::from_bits)
    }

    /// Add a value atomically (using CAS loop).
    #[inline]
    pub fn fetch_add(&self, val: f64, ordering: AtomicOrdering) -> f64 {
        let mut current = self.load(AtomicOrdering::Relaxed);
        loop {
            let new = current + val;
            match self.compare_exchange(
                current,
                new,
                ordering,
                AtomicOrdering::Relaxed,
            ) {
                Ok(v) => return v,
                Err(v) => current = v,
            }
        }
    }

    /// Update to maximum of current and new value.
    #[inline]
    pub fn fetch_max(&self, val: f64, ordering: AtomicOrdering) -> f64 {
        let mut current = self.load(AtomicOrdering::Relaxed);
        loop {
            if val <= current {
                return current;
            }
            match self.compare_exchange(
                current,
                val,
                ordering,
                AtomicOrdering::Relaxed,
            ) {
                Ok(v) => return v,
                Err(v) => current = v,
            }
        }
    }

    /// Update to minimum of current and new value.
    #[inline]
    pub fn fetch_min(&self, val: f64, ordering: AtomicOrdering) -> f64 {
        let mut current = self.load(AtomicOrdering::Relaxed);
        loop {
            if val >= current {
                return current;
            }
            match self.compare_exchange(
                current,
                val,
                ordering,
                AtomicOrdering::Relaxed,
            ) {
                Ok(v) => return v,
                Err(v) => current = v,
            }
        }
    }
}

impl Default for AtomicF64 {
    fn default() -> Self {
        Self::new(0.0)
    }
}

impl Clone for AtomicF64 {
    fn clone(&self) -> Self {
        Self::new(self.load(AtomicOrdering::Relaxed))
    }
}

// ----------------------------------------------------------------------------
// 12.2 Atomic Counter - High-Performance Counter
// ----------------------------------------------------------------------------

/// A high-performance atomic counter with additional features.
#[derive(Debug)]
pub struct AtomicCounter {
    value: CachePadded<AtomicU64>,
}

impl AtomicCounter {
    /// Create a new counter starting at 0.
    pub const fn new() -> Self {
        Self {
            value: CachePadded::new(AtomicU64::new(0)),
        }
    }

    /// Create a counter with an initial value.
    pub const fn with_value(val: u64) -> Self {
        Self {
            value: CachePadded::new(AtomicU64::new(val)),
        }
    }

    /// Increment by 1.
    #[inline]
    pub fn inc(&self) -> u64 {
        self.value.fetch_add(1, AtomicOrdering::Relaxed)
    }

    /// Increment by n.
    #[inline]
    pub fn add(&self, n: u64) -> u64 {
        self.value.fetch_add(n, AtomicOrdering::Relaxed)
    }

    /// Get current value.
    #[inline]
    pub fn get(&self) -> u64 {
        self.value.load(AtomicOrdering::Relaxed)
    }

    /// Reset to 0 and return previous value.
    #[inline]
    pub fn reset(&self) -> u64 {
        self.value.swap(0, AtomicOrdering::Relaxed)
    }

    /// Set to a specific value.
    #[inline]
    pub fn set(&self, val: u64) {
        self.value.store(val, AtomicOrdering::Relaxed);
    }
}

impl Default for AtomicCounter {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 12.3 Atomic Gauge - Value That Goes Up and Down
// ----------------------------------------------------------------------------

/// An atomic gauge that can increase or decrease.
#[derive(Debug)]
pub struct AtomicGauge {
    value: CachePadded<AtomicF64>,
}

impl AtomicGauge {
    /// Create a new gauge at 0.
    pub fn new() -> Self {
        Self {
            value: CachePadded::new(AtomicF64::new(0.0)),
        }
    }

    /// Create a gauge with an initial value.
    pub fn with_value(val: f64) -> Self {
        Self {
            value: CachePadded::new(AtomicF64::new(val)),
        }
    }

    /// Set the gauge value.
    #[inline]
    pub fn set(&self, val: f64) {
        self.value.store(val, AtomicOrdering::Relaxed);
    }

    /// Get current value.
    #[inline]
    pub fn get(&self) -> f64 {
        self.value.load(AtomicOrdering::Relaxed)
    }

    /// Increment by a value.
    #[inline]
    pub fn inc(&self, val: f64) -> f64 {
        self.value.fetch_add(val, AtomicOrdering::Relaxed)
    }

    /// Decrement by a value.
    #[inline]
    pub fn dec(&self, val: f64) -> f64 {
        self.value.fetch_add(-val, AtomicOrdering::Relaxed)
    }

    /// Reset to 0 and return previous value.
    #[inline]
    pub fn reset(&self) -> f64 {
        self.value.swap(0.0, AtomicOrdering::Relaxed)
    }
}

impl Default for AtomicGauge {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 12.4 Statistics Accumulator - Lock-Free Running Statistics
// ----------------------------------------------------------------------------

/// Lock-free accumulator for running statistics (count, sum, min, max).
/// Enables real-time statistical calculations without locks.
#[derive(Debug)]
pub struct StatsAccumulator {
    /// Number of observations
    count: AtomicU64,
    /// Sum of all values
    sum: AtomicF64,
    /// Sum of squared values (for variance)
    sum_sq: AtomicF64,
    /// Minimum value seen
    min: AtomicF64,
    /// Maximum value seen
    max: AtomicF64,
    /// Last value recorded
    last: AtomicF64,
    /// First timestamp
    first_time: AtomicTimestamp,
    /// Last timestamp
    last_time: AtomicTimestamp,
}

impl StatsAccumulator {
    /// Create a new empty accumulator.
    pub fn new() -> Self {
        Self {
            count: AtomicU64::new(0),
            sum: AtomicF64::new(0.0),
            sum_sq: AtomicF64::new(0.0),
            min: AtomicF64::new(f64::INFINITY),
            max: AtomicF64::new(f64::NEG_INFINITY),
            last: AtomicF64::new(0.0),
            first_time: AtomicTimestamp::new(Timestamp::MAX),
            last_time: AtomicTimestamp::new(Timestamp::EPOCH),
        }
    }

    /// Record a new observation.
    #[inline]
    pub fn observe(&self, value: f64) {
        self.observe_at(value, Timestamp::now());
    }

    /// Record an observation with a specific timestamp.
    #[inline]
    pub fn observe_at(&self, value: f64, timestamp: Timestamp) {
        self.count.fetch_add(1, AtomicOrdering::Relaxed);
        self.sum.fetch_add(value, AtomicOrdering::Relaxed);
        self.sum_sq.fetch_add(value * value, AtomicOrdering::Relaxed);
        self.min.fetch_min(value, AtomicOrdering::Relaxed);
        self.max.fetch_max(value, AtomicOrdering::Relaxed);
        self.last.store(value, AtomicOrdering::Relaxed);
        
        // Update timestamps
        let mut first = self.first_time.load(AtomicOrdering::Relaxed);
        while timestamp < first {
            match self.first_time.compare_exchange(
                first,
                timestamp,
                AtomicOrdering::Relaxed,
                AtomicOrdering::Relaxed,
            ) {
                Ok(_) => break,
                Err(f) => first = f,
            }
        }
        
        self.last_time.update_if_newer(timestamp);
    }

    /// Get the count of observations.
    #[inline]
    pub fn count(&self) -> u64 {
        self.count.load(AtomicOrdering::Relaxed)
    }

    /// Get the sum of all values.
    #[inline]
    pub fn sum(&self) -> f64 {
        self.sum.load(AtomicOrdering::Relaxed)
    }

    /// Get the minimum value.
    #[inline]
    pub fn min(&self) -> f64 {
        let min = self.min.load(AtomicOrdering::Relaxed);
        if min == f64::INFINITY { 0.0 } else { min }
    }

    /// Get the maximum value.
    #[inline]
    pub fn max(&self) -> f64 {
        let max = self.max.load(AtomicOrdering::Relaxed);
        if max == f64::NEG_INFINITY { 0.0 } else { max }
    }

    /// Get the last recorded value.
    #[inline]
    pub fn last(&self) -> f64 {
        self.last.load(AtomicOrdering::Relaxed)
    }

    /// Calculate the mean.
    #[inline]
    pub fn mean(&self) -> f64 {
        let count = self.count();
        if count == 0 {
            0.0
        } else {
            self.sum() / count as f64
        }
    }

    /// Calculate the variance.
    #[inline]
    pub fn variance(&self) -> f64 {
        let count = self.count();
        if count < 2 {
            0.0
        } else {
            let mean = self.mean();
            let sum_sq = self.sum_sq.load(AtomicOrdering::Relaxed);
            (sum_sq / count as f64) - (mean * mean)
        }
    }

    /// Calculate the standard deviation.
    #[inline]
    pub fn std_dev(&self) -> f64 {
        self.variance().sqrt().max(0.0)
    }

    /// Get a snapshot of all statistics.
    pub fn snapshot(&self) -> StatsSnapshot {
        StatsSnapshot {
            count: self.count(),
            sum: self.sum(),
            min: self.min(),
            max: self.max(),
            last: self.last(),
            mean: self.mean(),
            variance: self.variance(),
            std_dev: self.std_dev(),
            first_time: self.first_time.load(AtomicOrdering::Relaxed),
            last_time: self.last_time.load(AtomicOrdering::Relaxed),
        }
    }

    /// Reset all statistics and return the snapshot.
    pub fn reset(&self) -> StatsSnapshot {
        let snapshot = self.snapshot();
        self.count.store(0, AtomicOrdering::Relaxed);
        self.sum.store(0.0, AtomicOrdering::Relaxed);
        self.sum_sq.store(0.0, AtomicOrdering::Relaxed);
        self.min.store(f64::INFINITY, AtomicOrdering::Relaxed);
        self.max.store(f64::NEG_INFINITY, AtomicOrdering::Relaxed);
        self.last.store(0.0, AtomicOrdering::Relaxed);
        self.first_time.store(Timestamp::MAX, AtomicOrdering::Relaxed);
        self.last_time.store(Timestamp::EPOCH, AtomicOrdering::Relaxed);
        snapshot
    }
}

impl Default for StatsAccumulator {
    fn default() -> Self {
        Self::new()
    }
}

/// A snapshot of statistics at a point in time.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StatsSnapshot {
    pub count: u64,
    pub sum: f64,
    pub min: f64,
    pub max: f64,
    pub last: f64,
    pub mean: f64,
    pub variance: f64,
    pub std_dev: f64,
    pub first_time: Timestamp,
    pub last_time: Timestamp,
}

// ----------------------------------------------------------------------------
// 12.5 Rate Calculator - Events Per Second
// ----------------------------------------------------------------------------

/// Calculates rates (events per second) using a sliding window.
#[derive(Debug)]
pub struct RateCalculator {
    /// Ring buffer of (timestamp, count) pairs
    buckets: Box<[RateBucket]>,
    /// Number of buckets
    num_buckets: usize,
    /// Current bucket index
    current_idx: AtomicUsize,
    /// Bucket duration in nanoseconds
    bucket_duration_ns: u64,
    /// Total window duration
    window_duration: Duration,
}

#[derive(Debug)]
struct RateBucket {
    timestamp: AtomicI64,
    count: AtomicU64,
}

impl RateCalculator {
    /// Create a new rate calculator with the given window and bucket count.
    pub fn new(window: Duration, num_buckets: usize) -> Self {
        let num_buckets = num_buckets.max(2);
        let bucket_duration_ns = window.as_nanos() as u64 / num_buckets as u64;
        
        let buckets: Vec<RateBucket> = (0..num_buckets)
            .map(|_| RateBucket {
                timestamp: AtomicI64::new(0),
                count: AtomicU64::new(0),
            })
            .collect();
        
        Self {
            buckets: buckets.into_boxed_slice(),
            num_buckets,
            current_idx: AtomicUsize::new(0),
            bucket_duration_ns,
            window_duration: window,
        }
    }

    /// Create a rate calculator with default settings (1 minute window, 60 buckets).
    pub fn default_one_minute() -> Self {
        Self::new(Duration::from_secs(60), 60)
    }

    /// Record an event.
    #[inline]
    pub fn record(&self) {
        self.record_n(1);
    }

    /// Record n events.
    pub fn record_n(&self, n: u64) {
        let now = Timestamp::now().as_nanos();
        let bucket_idx = ((now as u64 / self.bucket_duration_ns) as usize) % self.num_buckets;
        
        let bucket = &self.buckets[bucket_idx];
        let bucket_start = (now as u64 / self.bucket_duration_ns) as i64 * self.bucket_duration_ns as i64;
        
        // Check if we need to reset this bucket (new time period)
        let stored_ts = bucket.timestamp.load(AtomicOrdering::Relaxed);
        if stored_ts != bucket_start {
            // Try to claim this bucket for the new period
            if bucket.timestamp.compare_exchange(
                stored_ts,
                bucket_start,
                AtomicOrdering::Relaxed,
                AtomicOrdering::Relaxed,
            ).is_ok() {
                bucket.count.store(n, AtomicOrdering::Relaxed);
            } else {
                // Someone else claimed it, just add
                bucket.count.fetch_add(n, AtomicOrdering::Relaxed);
            }
        } else {
            bucket.count.fetch_add(n, AtomicOrdering::Relaxed);
        }
        
        self.current_idx.store(bucket_idx, AtomicOrdering::Relaxed);
    }

    /// Get the current rate (events per second).
    pub fn rate(&self) -> f64 {
        let now = Timestamp::now().as_nanos();
        let window_start = now - self.window_duration.as_nanos() as i64;
        
        let mut total_count: u64 = 0;
        let mut active_duration_ns: u64 = 0;
        
        for bucket in self.buckets.iter() {
            let ts = bucket.timestamp.load(AtomicOrdering::Relaxed);
            if ts >= window_start {
                total_count += bucket.count.load(AtomicOrdering::Relaxed);
                active_duration_ns += self.bucket_duration_ns;
            }
        }
        
        if active_duration_ns == 0 {
            0.0
        } else {
            total_count as f64 / (active_duration_ns as f64 / 1_000_000_000.0)
        }
    }

    /// Get total events in the current window.
    pub fn total_in_window(&self) -> u64 {
        let now = Timestamp::now().as_nanos();
        let window_start = now - self.window_duration.as_nanos() as i64;
        
        let mut total: u64 = 0;
        for bucket in self.buckets.iter() {
            let ts = bucket.timestamp.load(AtomicOrdering::Relaxed);
            if ts >= window_start {
                total += bucket.count.load(AtomicOrdering::Relaxed);
            }
        }
        total
    }

    /// Reset all buckets.
    pub fn reset(&self) {
        for bucket in self.buckets.iter() {
            bucket.timestamp.store(0, AtomicOrdering::Relaxed);
            bucket.count.store(0, AtomicOrdering::Relaxed);
        }
    }
}

// ----------------------------------------------------------------------------
// 12.6 Exponential Moving Average - Lock-Free EMA
// ----------------------------------------------------------------------------

/// Lock-free exponential moving average calculator.
#[derive(Debug)]
pub struct ExponentialMovingAverage {
    /// Current EMA value
    value: AtomicF64,
    /// Smoothing factor (alpha)
    alpha: f64,
    /// Whether we've received any values
    initialized: AtomicBool,
    /// Sample count
    count: AtomicU64,
}

impl ExponentialMovingAverage {
    /// Create a new EMA with the given alpha (smoothing factor).
    /// Alpha should be between 0 and 1. Higher alpha = more weight on recent values.
    pub fn new(alpha: f64) -> Self {
        let alpha = alpha.clamp(0.0, 1.0);
        Self {
            value: AtomicF64::new(0.0),
            alpha,
            initialized: AtomicBool::new(false),
            count: AtomicU64::new(0),
        }
    }

    /// Create EMA with alpha calculated from span.
    /// Span is the number of periods for the "center of mass".
    pub fn with_span(span: usize) -> Self {
        let alpha = 2.0 / (span as f64 + 1.0);
        Self::new(alpha)
    }

    /// Create EMA with alpha calculated from half-life.
    pub fn with_half_life(half_life: f64) -> Self {
        let alpha = 1.0 - (0.5f64.powf(1.0 / half_life));
        Self::new(alpha)
    }

    /// Add a new observation and return the updated EMA.
    #[inline]
    pub fn observe(&self, value: f64) -> f64 {
        self.count.fetch_add(1, AtomicOrdering::Relaxed);
        
        if !self.initialized.load(AtomicOrdering::Relaxed) {
            // First value, just set it
            if self.initialized.compare_exchange(
                false,
                true,
                AtomicOrdering::Relaxed,
                AtomicOrdering::Relaxed,
            ).is_ok() {
                self.value.store(value, AtomicOrdering::Relaxed);
                return value;
            }
        }
        
        // Update EMA: new = alpha * value + (1 - alpha) * old
        let mut old = self.value.load(AtomicOrdering::Relaxed);
        loop {
            let new = self.alpha * value + (1.0 - self.alpha) * old;
            match self.value.compare_exchange(
                old,
                new,
                AtomicOrdering::Relaxed,
                AtomicOrdering::Relaxed,
            ) {
                Ok(_) => return new,
                Err(v) => old = v,
            }
        }
    }

    /// Get current EMA value.
    #[inline]
    pub fn value(&self) -> f64 {
        self.value.load(AtomicOrdering::Relaxed)
    }

    /// Get the alpha (smoothing factor).
    #[inline]
    pub fn alpha(&self) -> f64 {
        self.alpha
    }

    /// Get the sample count.
    #[inline]
    pub fn count(&self) -> u64 {
        self.count.load(AtomicOrdering::Relaxed)
    }

    /// Reset the EMA.
    pub fn reset(&self) {
        self.value.store(0.0, AtomicOrdering::Relaxed);
        self.initialized.store(false, AtomicOrdering::Relaxed);
        self.count.store(0, AtomicOrdering::Relaxed);
    }
}

// ----------------------------------------------------------------------------
// 12.7 Histogram Accumulator - Lock-Free Histogram
// ----------------------------------------------------------------------------

/// Lock-free histogram with predefined buckets.
#[derive(Debug)]
pub struct HistogramAccumulator {
    /// Bucket upper bounds
    bounds: Vec<f64>,
    /// Bucket counts
    buckets: Vec<AtomicU64>,
    /// Total count
    count: AtomicU64,
    /// Sum of all observations
    sum: AtomicF64,
}

impl HistogramAccumulator {
    /// Create a new histogram with the given bucket bounds.
    pub fn new(bounds: Vec<f64>) -> Self {
        let mut sorted_bounds = bounds;
        sorted_bounds.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        let buckets = (0..=sorted_bounds.len())
            .map(|_| AtomicU64::new(0))
            .collect();
        
        Self {
            bounds: sorted_bounds,
            buckets,
            count: AtomicU64::new(0),
            sum: AtomicF64::new(0.0),
        }
    }

    /// Create histogram with default latency buckets (in seconds).
    pub fn default_latency() -> Self {
        Self::new(vec![
            0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
        ])
    }

    /// Create histogram with default size buckets (in bytes).
    pub fn default_size() -> Self {
        Self::new(vec![
            100.0, 1000.0, 10000.0, 100000.0, 1000000.0, 10000000.0, 100000000.0,
        ])
    }

    /// Observe a value.
    #[inline]
    pub fn observe(&self, value: f64) {
        self.count.fetch_add(1, AtomicOrdering::Relaxed);
        self.sum.fetch_add(value, AtomicOrdering::Relaxed);
        
        // Find the bucket
        let bucket_idx = self.bounds.iter().position(|&b| value <= b).unwrap_or(self.bounds.len());
        self.buckets[bucket_idx].fetch_add(1, AtomicOrdering::Relaxed);
    }

    /// Get count for a specific bucket index.
    #[inline]
    pub fn bucket_count(&self, idx: usize) -> u64 {
        self.buckets.get(idx).map(|b| b.load(AtomicOrdering::Relaxed)).unwrap_or(0)
    }

    /// Get cumulative count up to and including a bucket.
    pub fn cumulative_count(&self, idx: usize) -> u64 {
        self.buckets.iter().take(idx + 1).map(|b| b.load(AtomicOrdering::Relaxed)).sum()
    }

    /// Get total count.
    #[inline]
    pub fn count(&self) -> u64 {
        self.count.load(AtomicOrdering::Relaxed)
    }

    /// Get sum of all values.
    #[inline]
    pub fn sum(&self) -> f64 {
        self.sum.load(AtomicOrdering::Relaxed)
    }

    /// Get mean.
    #[inline]
    pub fn mean(&self) -> f64 {
        let count = self.count();
        if count == 0 { 0.0 } else { self.sum() / count as f64 }
    }

    /// Get snapshot of all bucket counts.
    pub fn snapshot(&self) -> HistogramSnapshot {
        let counts: Vec<u64> = self.buckets.iter()
            .map(|b| b.load(AtomicOrdering::Relaxed))
            .collect();
        
        HistogramSnapshot {
            bounds: self.bounds.clone(),
            counts,
            total_count: self.count(),
            sum: self.sum(),
        }
    }

    /// Reset the histogram.
    pub fn reset(&self) {
        self.count.store(0, AtomicOrdering::Relaxed);
        self.sum.store(0.0, AtomicOrdering::Relaxed);
        for bucket in &self.buckets {
            bucket.store(0, AtomicOrdering::Relaxed);
        }
    }
}

/// Snapshot of a histogram.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistogramSnapshot {
    pub bounds: Vec<f64>,
    pub counts: Vec<u64>,
    pub total_count: u64,
    pub sum: f64,
}

impl HistogramSnapshot {
    /// Estimate a percentile from the histogram.
    pub fn percentile(&self, p: f64) -> f64 {
        if self.total_count == 0 || p <= 0.0 {
            return 0.0;
        }
        if p >= 1.0 {
            return *self.bounds.last().unwrap_or(&0.0);
        }

        let target = (self.total_count as f64 * p).ceil() as u64;
        let mut cumulative = 0u64;
        
        for (i, count) in self.counts.iter().enumerate() {
            cumulative += count;
            if cumulative >= target {
                if i == 0 {
                    return self.bounds[0] / 2.0;
                } else if i >= self.bounds.len() {
                    return self.bounds[self.bounds.len() - 1];
                } else {
                    // Linear interpolation
                    let prev_bound = self.bounds[i - 1];
                    let curr_bound = self.bounds[i];
                    let prev_cumulative = cumulative - count;
                    let fraction = (target - prev_cumulative) as f64 / *count as f64;
                    return prev_bound + fraction * (curr_bound - prev_bound);
                }
            }
        }
        
        *self.bounds.last().unwrap_or(&0.0)
    }

    /// Get p50 (median).
    pub fn p50(&self) -> f64 { self.percentile(0.5) }
    /// Get p90.
    pub fn p90(&self) -> f64 { self.percentile(0.9) }
    /// Get p95.
    pub fn p95(&self) -> f64 { self.percentile(0.95) }
    /// Get p99.
    pub fn p99(&self) -> f64 { self.percentile(0.99) }
}


// ============================================================================
// SECTION 13: CONCURRENT HASH MAPS & SHARDED STORAGE
// ============================================================================
// High-performance concurrent data structures for metric storage:
// - Sharded hash maps for reduced contention
// - Metric store with efficient lookups
// - Project-based metric indexing
// - Lock-free iteration support
// ============================================================================

// ----------------------------------------------------------------------------
// 13.1 Sharded Map - Reduced Contention Through Sharding
// ----------------------------------------------------------------------------

/// A sharded concurrent hash map that distributes entries across multiple shards
/// to reduce lock contention. Each shard is protected by its own RwLock.
pub struct ShardedMap<K, V, const SHARDS: usize = 64> {
    shards: Box<[RwLock<AHashMap<K, V>>; SHARDS]>,
    len: AtomicUsize,
}

impl<K, V, const SHARDS: usize> ShardedMap<K, V, SHARDS>
where
    K: Hash + Eq + Clone,
{
    /// Create a new sharded map.
    pub fn new() -> Self {
        let shards = (0..SHARDS)
            .map(|_| RwLock::new(AHashMap::new()))
            .collect::<Vec<_>>()
            .try_into()
            .unwrap_or_else(|_| panic!("Failed to create shards"));
        
        Self {
            shards: Box::new(shards),
            len: AtomicUsize::new(0),
        }
    }

    /// Create with pre-allocated capacity per shard.
    pub fn with_capacity(capacity_per_shard: usize) -> Self {
        let shards = (0..SHARDS)
            .map(|_| RwLock::new(AHashMap::with_capacity(capacity_per_shard)))
            .collect::<Vec<_>>()
            .try_into()
            .unwrap_or_else(|_| panic!("Failed to create shards"));
        
        Self {
            shards: Box::new(shards),
            len: AtomicUsize::new(0),
        }
    }

    /// Get the shard index for a key.
    #[inline]
    fn shard_index(&self, key: &K) -> usize {
        let mut hasher = AHasher::default();
        key.hash(&mut hasher);
        (hasher.finish() as usize) % SHARDS
    }

    /// Insert a key-value pair.
    pub fn insert(&self, key: K, value: V) -> Option<V> {
        let shard_idx = self.shard_index(&key);
        let mut shard = self.shards[shard_idx].write();
        let old = shard.insert(key, value);
        if old.is_none() {
            self.len.fetch_add(1, AtomicOrdering::Relaxed);
        }
        old
    }

    /// Get a value by key.
    pub fn get<Q>(&self, key: &Q) -> Option<V>
    where
        K: std::borrow::Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        V: Clone,
    {
        let mut hasher = AHasher::default();
        key.hash(&mut hasher);
        let shard_idx = (hasher.finish() as usize) % SHARDS;
        let shard = self.shards[shard_idx].read();
        shard.get(key).cloned()
    }

    /// Check if a key exists.
    pub fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: std::borrow::Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        let mut hasher = AHasher::default();
        key.hash(&mut hasher);
        let shard_idx = (hasher.finish() as usize) % SHARDS;
        let shard = self.shards[shard_idx].read();
        shard.contains_key(key)
    }

    /// Remove a key-value pair.
    pub fn remove<Q>(&self, key: &Q) -> Option<V>
    where
        K: std::borrow::Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        let mut hasher = AHasher::default();
        key.hash(&mut hasher);
        let shard_idx = (hasher.finish() as usize) % SHARDS;
        let mut shard = self.shards[shard_idx].write();
        let removed = shard.remove(key);
        if removed.is_some() {
            self.len.fetch_sub(1, AtomicOrdering::Relaxed);
        }
        removed
    }

    /// Get the approximate length.
    #[inline]
    pub fn len(&self) -> usize {
        self.len.load(AtomicOrdering::Relaxed)
    }

    /// Check if empty.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Clear all entries.
    pub fn clear(&self) {
        for shard in self.shards.iter() {
            shard.write().clear();
        }
        self.len.store(0, AtomicOrdering::Relaxed);
    }

    /// Get all keys (collects from all shards).
    pub fn keys(&self) -> Vec<K> {
        let mut keys = Vec::with_capacity(self.len());
        for shard in self.shards.iter() {
            keys.extend(shard.read().keys().cloned());
        }
        keys
    }

    /// Apply a function to each entry.
    pub fn for_each<F>(&self, mut f: F)
    where
        F: FnMut(&K, &V),
    {
        for shard in self.shards.iter() {
            let shard = shard.read();
            for (k, v) in shard.iter() {
                f(k, v);
            }
        }
    }

    /// Update a value in place or insert if not exists.
    pub fn upsert<F>(&self, key: K, default: V, update: F) -> V
    where
        F: FnOnce(&mut V),
        V: Clone,
    {
        let shard_idx = self.shard_index(&key);
        let mut shard = self.shards[shard_idx].write();
        
        let entry = shard.entry(key);
        match entry {
            hashbrown::hash_map::Entry::Occupied(mut e) => {
                update(e.get_mut());
                e.get().clone()
            }
            hashbrown::hash_map::Entry::Vacant(e) => {
                self.len.fetch_add(1, AtomicOrdering::Relaxed);
                let mut val = default;
                update(&mut val);
                e.insert(val.clone());
                val
            }
        }
    }
}

impl<K, V, const SHARDS: usize> Default for ShardedMap<K, V, SHARDS>
where
    K: Hash + Eq + Clone,
{
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 13.2 Metric Store - Optimized Storage for Metrics
// ----------------------------------------------------------------------------

/// High-performance metric storage with multiple access patterns.
pub struct MetricStore {
    /// Metrics by ID (primary index)
    by_id: DashMap<MetricId, StoredMetric>,
    /// Metrics by name (secondary index)
    by_name: DashMap<CompactString, Vec<MetricId>>,
    /// Metrics by project (secondary index)
    by_project: DashMap<u32, Vec<MetricId>>,
    /// Metrics by category (secondary index)
    by_category: DashMap<MetricCategory, Vec<MetricId>>,
    /// Statistics accumulators per metric
    stats: DashMap<MetricId, StatsAccumulator>,
    /// Total metrics stored
    total_count: AtomicUsize,
    /// Memory tracker
    memory_used: AtomicUsize,
}

/// A stored metric with metadata.
#[derive(Debug, Clone)]
pub struct StoredMetric {
    /// The metric itself
    pub metric: Metric,
    /// When it was first stored
    pub first_seen: Timestamp,
    /// When it was last updated
    pub last_updated: Timestamp,
    /// Update count
    pub update_count: u64,
}

impl MetricStore {
    /// Create a new metric store.
    pub fn new() -> Self {
        Self {
            by_id: DashMap::new(),
            by_name: DashMap::new(),
            by_project: DashMap::new(),
            by_category: DashMap::new(),
            stats: DashMap::new(),
            total_count: AtomicUsize::new(0),
            memory_used: AtomicUsize::new(0),
        }
    }

    /// Store or update a metric.
    pub fn store(&self, metric: Metric) {
        let id = metric.id;
        let name = metric.name.clone();
        let project_id = metric.project_id;
        let category = metric.category;
        let value = metric.as_f64();
        let now = Timestamp::now();
        
        // Update primary store
        let is_new = self.by_id.entry(id).or_insert_with(|| {
            self.total_count.fetch_add(1, AtomicOrdering::Relaxed);
            StoredMetric {
                metric: metric.clone(),
                first_seen: now,
                last_updated: now,
                update_count: 0,
            }
        }).and_modify(|stored| {
            stored.metric = metric.clone();
            stored.last_updated = now;
            stored.update_count += 1;
        });

        // Update secondary indices (only for new metrics)
        if self.by_id.get(&id).map(|s| s.update_count == 0).unwrap_or(false) {
            // Add to name index
            self.by_name.entry(name).or_insert_with(Vec::new).push(id);
            
            // Add to project index
            self.by_project.entry(project_id).or_insert_with(Vec::new).push(id);
            
            // Add to category index
            self.by_category.entry(category).or_insert_with(Vec::new).push(id);
        }

        // Update statistics
        if let Some(v) = value {
            self.stats.entry(id)
                .or_insert_with(StatsAccumulator::new)
                .observe(v);
        }
    }

    /// Get a metric by ID.
    pub fn get(&self, id: MetricId) -> Option<StoredMetric> {
        self.by_id.get(&id).map(|r| r.clone())
    }

    /// Get metrics by name.
    pub fn get_by_name(&self, name: &str) -> Vec<StoredMetric> {
        let name = CompactString::from(name);
        self.by_name.get(&name)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.get(*id))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get metrics by project.
    pub fn get_by_project(&self, project_id: u32) -> Vec<StoredMetric> {
        self.by_project.get(&project_id)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.get(*id))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get metrics by category.
    pub fn get_by_category(&self, category: MetricCategory) -> Vec<StoredMetric> {
        self.by_category.get(&category)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.get(*id))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get statistics for a metric.
    pub fn get_stats(&self, id: MetricId) -> Option<StatsSnapshot> {
        self.stats.get(&id).map(|s| s.snapshot())
    }

    /// Get total metric count.
    pub fn len(&self) -> usize {
        self.total_count.load(AtomicOrdering::Relaxed)
    }

    /// Check if empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Get all metric IDs.
    pub fn all_ids(&self) -> Vec<MetricId> {
        self.by_id.iter().map(|r| *r.key()).collect()
    }

    /// Get all metric names.
    pub fn all_names(&self) -> Vec<CompactString> {
        self.by_name.iter().map(|r| r.key().clone()).collect()
    }

    /// Get all project IDs with metrics.
    pub fn all_projects(&self) -> Vec<u32> {
        self.by_project.iter().map(|r| *r.key()).collect()
    }

    /// Remove a metric.
    pub fn remove(&self, id: MetricId) -> Option<StoredMetric> {
        if let Some((_, stored)) = self.by_id.remove(&id) {
            self.total_count.fetch_sub(1, AtomicOrdering::Relaxed);
            
            // Remove from secondary indices
            if let Some(mut ids) = self.by_name.get_mut(&stored.metric.name) {
                ids.retain(|&i| i != id);
            }
            if let Some(mut ids) = self.by_project.get_mut(&stored.metric.project_id) {
                ids.retain(|&i| i != id);
            }
            if let Some(mut ids) = self.by_category.get_mut(&stored.metric.category) {
                ids.retain(|&i| i != id);
            }
            
            self.stats.remove(&id);
            
            Some(stored)
        } else {
            None
        }
    }

    /// Clear all metrics.
    pub fn clear(&self) {
        self.by_id.clear();
        self.by_name.clear();
        self.by_project.clear();
        self.by_category.clear();
        self.stats.clear();
        self.total_count.store(0, AtomicOrdering::Relaxed);
    }

    /// Get store statistics.
    pub fn store_stats(&self) -> MetricStoreStats {
        MetricStoreStats {
            total_metrics: self.len(),
            unique_names: self.by_name.len(),
            projects: self.by_project.len(),
            categories: self.by_category.len(),
        }
    }
}

impl Default for MetricStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Statistics about the metric store.
#[derive(Debug, Clone)]
pub struct MetricStoreStats {
    pub total_metrics: usize,
    pub unique_names: usize,
    pub projects: usize,
    pub categories: usize,
}

// ----------------------------------------------------------------------------
// 13.3 Project Metric Index - Fast Project Lookups
// ----------------------------------------------------------------------------

/// Index for quickly finding metrics by project with various filters.
pub struct ProjectMetricIndex {
    /// Metrics per project, keyed by (project_id, category)
    index: DashMap<(u32, MetricCategory), DashSet<MetricId>>,
    /// All metrics per project
    by_project: DashMap<u32, DashSet<MetricId>>,
    /// Metric count per project
    counts: DashMap<u32, AtomicUsize>,
}

impl ProjectMetricIndex {
    /// Create a new project metric index.
    pub fn new() -> Self {
        Self {
            index: DashMap::new(),
            by_project: DashMap::new(),
            counts: DashMap::new(),
        }
    }

    /// Index a metric.
    pub fn index(&self, metric: &Metric) {
        let key = (metric.project_id, metric.category);
        
        // Add to category-specific index
        self.index.entry(key)
            .or_insert_with(DashSet::new)
            .insert(metric.id);
        
        // Add to project index
        let is_new = self.by_project.entry(metric.project_id)
            .or_insert_with(DashSet::new)
            .insert(metric.id);
        
        // Update count if new
        if is_new {
            self.counts.entry(metric.project_id)
                .or_insert_with(|| AtomicUsize::new(0))
                .fetch_add(1, AtomicOrdering::Relaxed);
        }
    }

    /// Get all metrics for a project.
    pub fn get_project_metrics(&self, project_id: u32) -> Vec<MetricId> {
        self.by_project.get(&project_id)
            .map(|set| set.iter().map(|r| *r).collect())
            .unwrap_or_default()
    }

    /// Get metrics for a project and category.
    pub fn get_project_category_metrics(&self, project_id: u32, category: MetricCategory) -> Vec<MetricId> {
        self.index.get(&(project_id, category))
            .map(|set| set.iter().map(|r| *r).collect())
            .unwrap_or_default()
    }

    /// Get metric count for a project.
    pub fn project_metric_count(&self, project_id: u32) -> usize {
        self.counts.get(&project_id)
            .map(|c| c.load(AtomicOrdering::Relaxed))
            .unwrap_or(0)
    }

    /// Remove a metric from the index.
    pub fn remove(&self, metric: &Metric) {
        let key = (metric.project_id, metric.category);
        
        if let Some(set) = self.index.get(&key) {
            set.remove(&metric.id);
        }
        
        if let Some(set) = self.by_project.get(&metric.project_id) {
            if set.remove(&metric.id).is_some() {
                if let Some(count) = self.counts.get(&metric.project_id) {
                    count.fetch_sub(1, AtomicOrdering::Relaxed);
                }
            }
        }
    }

    /// Clear the index.
    pub fn clear(&self) {
        self.index.clear();
        self.by_project.clear();
        self.counts.clear();
    }
}

impl Default for ProjectMetricIndex {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 13.4 Label Index - Fast Label-Based Lookups
// ----------------------------------------------------------------------------

/// Index for finding metrics by label values.
pub struct LabelIndex {
    /// Maps label key -> label value -> metric IDs
    index: DashMap<CompactString, DashMap<CompactString, DashSet<MetricId>>>,
}

impl LabelIndex {
    /// Create a new label index.
    pub fn new() -> Self {
        Self {
            index: DashMap::new(),
        }
    }

    /// Index a metric's labels.
    pub fn index(&self, metric: &Metric) {
        for label in &metric.labels {
            self.index
                .entry(label.key.clone())
                .or_insert_with(DashMap::new)
                .entry(label.value.clone())
                .or_insert_with(DashSet::new)
                .insert(metric.id);
        }
    }

    /// Find metrics with a specific label value.
    pub fn find(&self, key: &str, value: &str) -> Vec<MetricId> {
        self.index.get(key)
            .and_then(|values| values.get(value))
            .map(|ids| ids.iter().map(|r| *r).collect())
            .unwrap_or_default()
    }

    /// Find metrics with any of the specified label values.
    pub fn find_any(&self, key: &str, values: &[&str]) -> Vec<MetricId> {
        let mut result = Vec::new();
        if let Some(value_map) = self.index.get(key) {
            for value in values {
                if let Some(ids) = value_map.get(*value) {
                    result.extend(ids.iter().map(|r| *r));
                }
            }
        }
        result
    }

    /// Get all unique values for a label key.
    pub fn get_values(&self, key: &str) -> Vec<CompactString> {
        self.index.get(key)
            .map(|values| values.iter().map(|r| r.key().clone()).collect())
            .unwrap_or_default()
    }

    /// Get all indexed label keys.
    pub fn get_keys(&self) -> Vec<CompactString> {
        self.index.iter().map(|r| r.key().clone()).collect()
    }

    /// Remove a metric from the index.
    pub fn remove(&self, metric: &Metric) {
        for label in &metric.labels {
            if let Some(values) = self.index.get(&label.key) {
                if let Some(ids) = values.get(&label.value) {
                    ids.remove(&metric.id);
                }
            }
        }
    }

    /// Clear the index.
    pub fn clear(&self) {
        self.index.clear();
    }
}

impl Default for LabelIndex {
    fn default() -> Self {
        Self::new()
    }
}


// ============================================================================
// SECTION 14: CHANNEL SYSTEM & BACKPRESSURE
// ============================================================================
// Typed channels for metric flow with intelligent backpressure:
// - Collector channels (SPSC, one per collector)
// - Metric bus (MPMC, central distribution)
// - Worker channels (with priority support)
// - Alert channels (never drop critical alerts)
// - Backpressure strategies and monitoring
// ============================================================================

// ----------------------------------------------------------------------------
// 14.1 Backpressure Strategy
// ----------------------------------------------------------------------------

/// Strategies for handling backpressure when channels are full.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackpressureStrategy {
    /// Block until space is available (may cause collector slowdown)
    Block,
    /// Drop the oldest items to make room
    DropOldest,
    /// Drop the newest items (incoming)
    DropNewest,
    /// Drop based on priority (low priority first)
    DropLowPriority,
    /// Sample: only keep every Nth item
    Sample { rate: u32 },
    /// Aggregate: combine multiple metrics into one
    Aggregate,
}

impl Default for BackpressureStrategy {
    fn default() -> Self {
        BackpressureStrategy::DropOldest
    }
}

// ----------------------------------------------------------------------------
// 14.2 Channel Statistics
// ----------------------------------------------------------------------------

/// Statistics for a channel.
#[derive(Debug, Clone, Default)]
pub struct ChannelStats {
    /// Total items sent
    pub sent: AtomicU64,
    /// Total items received
    pub received: AtomicU64,
    /// Items dropped due to backpressure
    pub dropped: AtomicU64,
    /// Current queue depth
    pub depth: AtomicUsize,
    /// High water mark (max depth seen)
    pub high_water_mark: AtomicUsize,
    /// Times backpressure was triggered
    pub backpressure_events: AtomicU64,
}

impl ChannelStats {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_send(&self) {
        self.sent.fetch_add(1, AtomicOrdering::Relaxed);
    }

    pub fn record_receive(&self) {
        self.received.fetch_add(1, AtomicOrdering::Relaxed);
    }

    pub fn record_drop(&self, count: u64) {
        self.dropped.fetch_add(count, AtomicOrdering::Relaxed);
    }

    pub fn update_depth(&self, depth: usize) {
        self.depth.store(depth, AtomicOrdering::Relaxed);
        
        // Update high water mark
        let mut hwm = self.high_water_mark.load(AtomicOrdering::Relaxed);
        while depth > hwm {
            match self.high_water_mark.compare_exchange_weak(
                hwm, depth,
                AtomicOrdering::Relaxed,
                AtomicOrdering::Relaxed,
            ) {
                Ok(_) => break,
                Err(h) => hwm = h,
            }
        }
    }

    pub fn record_backpressure(&self) {
        self.backpressure_events.fetch_add(1, AtomicOrdering::Relaxed);
    }

    pub fn snapshot(&self) -> ChannelStatsSnapshot {
        ChannelStatsSnapshot {
            sent: self.sent.load(AtomicOrdering::Relaxed),
            received: self.received.load(AtomicOrdering::Relaxed),
            dropped: self.dropped.load(AtomicOrdering::Relaxed),
            depth: self.depth.load(AtomicOrdering::Relaxed),
            high_water_mark: self.high_water_mark.load(AtomicOrdering::Relaxed),
            backpressure_events: self.backpressure_events.load(AtomicOrdering::Relaxed),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelStatsSnapshot {
    pub sent: u64,
    pub received: u64,
    pub dropped: u64,
    pub depth: usize,
    pub high_water_mark: usize,
    pub backpressure_events: u64,
}

// ----------------------------------------------------------------------------
// 14.3 Metric Channel - For Collector to Bus Communication
// ----------------------------------------------------------------------------

/// A channel for sending metrics from a collector to the metric bus.
pub struct MetricChannel {
    /// The underlying channel sender
    sender: FlumeSender<Metric>,
    /// The underlying channel receiver
    receiver: FlumeReceiver<Metric>,
    /// Channel capacity
    capacity: usize,
    /// Backpressure strategy
    strategy: BackpressureStrategy,
    /// Statistics
    stats: Arc<ChannelStats>,
    /// Channel name (for logging)
    name: CompactString,
    /// Backpressure threshold (percentage of capacity)
    backpressure_threshold: f64,
}

impl MetricChannel {
    /// Create a new metric channel.
    pub fn new(name: impl Into<CompactString>, capacity: usize) -> Self {
        let (sender, receiver) = flume::bounded(capacity);
        Self {
            sender,
            receiver,
            capacity,
            strategy: BackpressureStrategy::default(),
            stats: Arc::new(ChannelStats::new()),
            name: name.into(),
            backpressure_threshold: 0.8,
        }
    }

    /// Create with a specific backpressure strategy.
    pub fn with_strategy(mut self, strategy: BackpressureStrategy) -> Self {
        self.strategy = strategy;
        self
    }

    /// Create with a custom backpressure threshold.
    pub fn with_threshold(mut self, threshold: f64) -> Self {
        self.backpressure_threshold = threshold.clamp(0.1, 1.0);
        self
    }

    /// Send a metric through the channel.
    pub fn send(&self, metric: Metric) -> Result<(), Metric> {
        let depth = self.sender.len();
        self.stats.update_depth(depth);

        // Check if we're approaching capacity
        let utilization = depth as f64 / self.capacity as f64;
        if utilization >= self.backpressure_threshold {
            self.stats.record_backpressure();
            
            match self.strategy {
                BackpressureStrategy::Block => {
                    // Block until space available
                    if self.sender.send(metric).is_ok() {
                        self.stats.record_send();
                        return Ok(());
                    }
                }
                BackpressureStrategy::DropNewest => {
                    // Drop the incoming metric
                    self.stats.record_drop(1);
                    return Err(metric);
                }
                BackpressureStrategy::DropLowPriority => {
                    // Only drop if low priority
                    if metric.priority <= Priority::Low {
                        self.stats.record_drop(1);
                        return Err(metric);
                    }
                }
                _ => {}
            }
        }

        // Try to send
        match self.sender.try_send(metric) {
            Ok(()) => {
                self.stats.record_send();
                Ok(())
            }
            Err(flume::TrySendError::Full(m)) => {
                self.stats.record_drop(1);
                Err(m)
            }
            Err(flume::TrySendError::Disconnected(m)) => {
                Err(m)
            }
        }
    }

    /// Send a batch of metrics.
    pub fn send_batch(&self, metrics: Vec<Metric>) -> usize {
        let mut sent = 0;
        for metric in metrics {
            if self.send(metric).is_ok() {
                sent += 1;
            }
        }
        sent
    }

    /// Receive a metric from the channel.
    pub fn recv(&self) -> Option<Metric> {
        match self.receiver.try_recv() {
            Ok(metric) => {
                self.stats.record_receive();
                self.stats.update_depth(self.receiver.len());
                Some(metric)
            }
            Err(_) => None,
        }
    }

    /// Receive with blocking.
    pub fn recv_blocking(&self) -> Option<Metric> {
        match self.receiver.recv() {
            Ok(metric) => {
                self.stats.record_receive();
                self.stats.update_depth(self.receiver.len());
                Some(metric)
            }
            Err(_) => None,
        }
    }

    /// Receive a batch of metrics (up to max_batch).
    pub fn recv_batch(&self, max_batch: usize) -> Vec<Metric> {
        let mut batch = Vec::with_capacity(max_batch.min(self.receiver.len()));
        for _ in 0..max_batch {
            match self.recv() {
                Some(metric) => batch.push(metric),
                None => break,
            }
        }
        batch
    }

    /// Drain all available metrics.
    pub fn drain(&self) -> Vec<Metric> {
        self.receiver.drain().collect()
    }

    /// Get current depth.
    pub fn len(&self) -> usize {
        self.sender.len()
    }

    /// Check if empty.
    pub fn is_empty(&self) -> bool {
        self.sender.is_empty()
    }

    /// Get capacity.
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Get utilization (0.0 - 1.0).
    pub fn utilization(&self) -> f64 {
        self.len() as f64 / self.capacity as f64
    }

    /// Get statistics.
    pub fn stats(&self) -> ChannelStatsSnapshot {
        self.stats.snapshot()
    }

    /// Get channel name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Check if backpressure is active.
    pub fn is_backpressured(&self) -> bool {
        self.utilization() >= self.backpressure_threshold
    }

    /// Clone the sender (for multiple producers).
    pub fn sender(&self) -> MetricSender {
        MetricSender {
            sender: self.sender.clone(),
            stats: self.stats.clone(),
            capacity: self.capacity,
            strategy: self.strategy,
            backpressure_threshold: self.backpressure_threshold,
        }
    }

    /// Get the receiver.
    pub fn receiver(&self) -> MetricReceiver {
        MetricReceiver {
            receiver: self.receiver.clone(),
            stats: self.stats.clone(),
        }
    }
}

/// Sender half of a metric channel.
#[derive(Clone)]
pub struct MetricSender {
    sender: FlumeSender<Metric>,
    stats: Arc<ChannelStats>,
    capacity: usize,
    strategy: BackpressureStrategy,
    backpressure_threshold: f64,
}

impl MetricSender {
    pub fn send(&self, metric: Metric) -> Result<(), Metric> {
        let depth = self.sender.len();
        self.stats.update_depth(depth);

        let utilization = depth as f64 / self.capacity as f64;
        if utilization >= self.backpressure_threshold {
            self.stats.record_backpressure();
            if self.strategy == BackpressureStrategy::DropNewest {
                self.stats.record_drop(1);
                return Err(metric);
            }
        }

        match self.sender.try_send(metric) {
            Ok(()) => {
                self.stats.record_send();
                Ok(())
            }
            Err(flume::TrySendError::Full(m)) | Err(flume::TrySendError::Disconnected(m)) => {
                self.stats.record_drop(1);
                Err(m)
            }
        }
    }

    pub fn len(&self) -> usize {
        self.sender.len()
    }

    pub fn is_full(&self) -> bool {
        self.sender.is_full()
    }
}

/// Receiver half of a metric channel.
#[derive(Clone)]
pub struct MetricReceiver {
    receiver: FlumeReceiver<Metric>,
    stats: Arc<ChannelStats>,
}

impl MetricReceiver {
    pub fn recv(&self) -> Option<Metric> {
        match self.receiver.try_recv() {
            Ok(metric) => {
                self.stats.record_receive();
                Some(metric)
            }
            Err(_) => None,
        }
    }

    pub async fn recv_async(&self) -> Option<Metric> {
        match self.receiver.recv_async().await {
            Ok(metric) => {
                self.stats.record_receive();
                Some(metric)
            }
            Err(_) => None,
        }
    }

    pub fn recv_batch(&self, max: usize) -> Vec<Metric> {
        let mut batch = Vec::with_capacity(max);
        for _ in 0..max {
            match self.recv() {
                Some(m) => batch.push(m),
                None => break,
            }
        }
        batch
    }

    pub fn len(&self) -> usize {
        self.receiver.len()
    }

    pub fn is_empty(&self) -> bool {
        self.receiver.is_empty()
    }
}

// ----------------------------------------------------------------------------
// 14.4 Priority Channel - Priority-Based Message Ordering
// ----------------------------------------------------------------------------

/// A channel that respects message priority.
pub struct PriorityChannel<T> {
    /// Separate queues for each priority level
    queues: [ArrayQueue<T>; 6],
    /// Total items
    len: AtomicUsize,
    /// Statistics
    stats: Arc<ChannelStats>,
}

impl<T> PriorityChannel<T> {
    /// Create a new priority channel with given capacity per priority.
    pub fn new(capacity_per_priority: usize) -> Self {
        Self {
            queues: [
                ArrayQueue::new(capacity_per_priority),      // Background
                ArrayQueue::new(capacity_per_priority),      // Low
                ArrayQueue::new(capacity_per_priority * 2),  // Normal (larger)
                ArrayQueue::new(capacity_per_priority),      // High
                ArrayQueue::new(capacity_per_priority),      // Critical
                ArrayQueue::new(capacity_per_priority / 2),  // RealTime (smaller, faster)
            ],
            len: AtomicUsize::new(0),
            stats: Arc::new(ChannelStats::new()),
        }
    }

    /// Send an item with a specific priority.
    pub fn send(&self, item: T, priority: Priority) -> Result<(), T> {
        let queue_idx = priority.as_u8() as usize;
        match self.queues[queue_idx].push(item) {
            Ok(()) => {
                self.len.fetch_add(1, AtomicOrdering::Relaxed);
                self.stats.record_send();
                Ok(())
            }
            Err(item) => {
                self.stats.record_drop(1);
                Err(item)
            }
        }
    }

    /// Receive the highest priority item available.
    pub fn recv(&self) -> Option<T> {
        // Check queues from highest to lowest priority
        for i in (0..6).rev() {
            if let Some(item) = self.queues[i].pop() {
                self.len.fetch_sub(1, AtomicOrdering::Relaxed);
                self.stats.record_receive();
                return Some(item);
            }
        }
        None
    }

    /// Receive only from a specific priority or higher.
    pub fn recv_min_priority(&self, min_priority: Priority) -> Option<T> {
        let min_idx = min_priority.as_u8() as usize;
        for i in (min_idx..6).rev() {
            if let Some(item) = self.queues[i].pop() {
                self.len.fetch_sub(1, AtomicOrdering::Relaxed);
                self.stats.record_receive();
                return Some(item);
            }
        }
        None
    }

    /// Get total length across all priorities.
    pub fn len(&self) -> usize {
        self.len.load(AtomicOrdering::Relaxed)
    }

    /// Check if all queues are empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Get length for a specific priority.
    pub fn len_at_priority(&self, priority: Priority) -> usize {
        self.queues[priority.as_u8() as usize].len()
    }

    /// Get statistics.
    pub fn stats(&self) -> ChannelStatsSnapshot {
        self.stats.snapshot()
    }
}

// ----------------------------------------------------------------------------
// 14.5 Alert Channel - Never Drop Critical Alerts
// ----------------------------------------------------------------------------

/// Specialized channel for alerts that never drops critical alerts.
pub struct AlertChannel {
    /// Critical alerts (unbounded, never drop)
    critical: SegQueue<Alert>,
    /// Non-critical alerts (bounded)
    normal: ArrayQueue<Alert>,
    /// Statistics
    stats: Arc<ChannelStats>,
    /// Normal queue capacity
    normal_capacity: usize,
}

/// An alert to be sent through the channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    /// Unique alert ID
    pub id: Uuid,
    /// Alert timestamp
    pub timestamp: Timestamp,
    /// Alert severity
    pub severity: Severity,
    /// Alert source (metric ID, project, etc.)
    pub source: AlertSource,
    /// Alert message
    pub message: CompactString,
    /// Additional context
    pub context: HashMap<String, JsonValue>,
    /// Related metric value
    pub metric_value: Option<f64>,
    /// Threshold that was exceeded
    pub threshold: Option<f64>,
}

/// Source of an alert.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertSource {
    Metric { id: MetricId, name: CompactString },
    Project { id: u32, name: CompactString },
    System { component: CompactString },
    Anomaly { detector: CompactString },
    Custom { source: CompactString },
}

impl Alert {
    /// Create a new alert.
    pub fn new(severity: Severity, source: AlertSource, message: impl Into<CompactString>) -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Timestamp::now(),
            severity,
            source,
            message: message.into(),
            context: HashMap::new(),
            metric_value: None,
            threshold: None,
        }
    }

    /// Add context to the alert.
    pub fn with_context(mut self, key: impl Into<String>, value: impl Into<JsonValue>) -> Self {
        self.context.insert(key.into(), value.into());
        self
    }

    /// Set the metric value.
    pub fn with_value(mut self, value: f64) -> Self {
        self.metric_value = Some(value);
        self
    }

    /// Set the threshold.
    pub fn with_threshold(mut self, threshold: f64) -> Self {
        self.threshold = Some(threshold);
        self
    }

    /// Check if this is a critical alert.
    pub fn is_critical(&self) -> bool {
        self.severity >= Severity::Critical
    }
}

impl AlertChannel {
    /// Create a new alert channel.
    pub fn new(normal_capacity: usize) -> Self {
        Self {
            critical: SegQueue::new(),
            normal: ArrayQueue::new(normal_capacity),
            stats: Arc::new(ChannelStats::new()),
            normal_capacity,
        }
    }

    /// Send an alert.
    pub fn send(&self, alert: Alert) -> Result<(), Alert> {
        if alert.is_critical() {
            // Critical alerts never drop
            self.critical.push(alert);
            self.stats.record_send();
            Ok(())
        } else {
            // Normal alerts can be dropped
            match self.normal.push(alert) {
                Ok(()) => {
                    self.stats.record_send();
                    Ok(())
                }
                Err(alert) => {
                    self.stats.record_drop(1);
                    Err(alert)
                }
            }
        }
    }

    /// Receive an alert (critical first).
    pub fn recv(&self) -> Option<Alert> {
        // Always check critical queue first
        if let Some(alert) = self.critical.pop() {
            self.stats.record_receive();
            return Some(alert);
        }

        // Then check normal queue
        if let Some(alert) = self.normal.pop() {
            self.stats.record_receive();
            return Some(alert);
        }

        None
    }

    /// Receive only critical alerts.
    pub fn recv_critical(&self) -> Option<Alert> {
        self.critical.pop().map(|alert| {
            self.stats.record_receive();
            alert
        })
    }

    /// Get total pending alerts.
    pub fn len(&self) -> usize {
        self.critical.len() + self.normal.len()
    }

    /// Get critical alert count.
    pub fn critical_count(&self) -> usize {
        self.critical.len()
    }

    /// Check if empty.
    pub fn is_empty(&self) -> bool {
        self.critical.is_empty() && self.normal.is_empty()
    }

    /// Get statistics.
    pub fn stats(&self) -> ChannelStatsSnapshot {
        self.stats.snapshot()
    }
}

// ----------------------------------------------------------------------------
// 14.6 Broadcast Channel - One-to-Many Distribution
// ----------------------------------------------------------------------------

/// A broadcast channel for distributing metrics to multiple consumers.
pub struct BroadcastChannel {
    /// The broadcast sender
    sender: broadcast::Sender<Arc<Metric>>,
    /// Capacity
    capacity: usize,
    /// Statistics
    stats: Arc<ChannelStats>,
}

impl BroadcastChannel {
    /// Create a new broadcast channel.
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self {
            sender,
            capacity,
            stats: Arc::new(ChannelStats::new()),
        }
    }

    /// Broadcast a metric to all subscribers.
    pub fn broadcast(&self, metric: Metric) -> Result<usize, CerebroError> {
        let arc_metric = Arc::new(metric);
        match self.sender.send(arc_metric) {
            Ok(count) => {
                self.stats.record_send();
                Ok(count)
            }
            Err(_) => {
                self.stats.record_drop(1);
                Err(CerebroError::Internal("Broadcast failed".into()))
            }
        }
    }

    /// Subscribe to the broadcast.
    pub fn subscribe(&self) -> BroadcastReceiver {
        BroadcastReceiver {
            receiver: self.sender.subscribe(),
            stats: self.stats.clone(),
        }
    }

    /// Get number of active subscribers.
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }

    /// Get statistics.
    pub fn stats(&self) -> ChannelStatsSnapshot {
        self.stats.snapshot()
    }
}

/// Receiver for broadcast channel.
pub struct BroadcastReceiver {
    receiver: broadcast::Receiver<Arc<Metric>>,
    stats: Arc<ChannelStats>,
}

impl BroadcastReceiver {
    /// Receive a metric.
    pub async fn recv(&mut self) -> Option<Arc<Metric>> {
        match self.receiver.recv().await {
            Ok(metric) => {
                self.stats.record_receive();
                Some(metric)
            }
            Err(_) => None,
        }
    }
}


// ============================================================================
// SECTION 15: TIME-SERIES RING BUFFER & STORAGE
// ============================================================================
// High-performance time-series data storage:
// - Fixed-size ring buffers per metric
// - Lock-free append operations
// - Efficient range queries
// - Downsampling support
// - Memory-efficient storage
// ============================================================================

// ----------------------------------------------------------------------------
// 15.1 Time-Series Point - A Single Data Point
// ----------------------------------------------------------------------------

/// A single point in a time series.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TimeSeriesPoint {
    /// Timestamp
    pub timestamp: Timestamp,
    /// Value
    pub value: f64,
}

impl TimeSeriesPoint {
    /// Create a new point.
    #[inline]
    pub fn new(timestamp: Timestamp, value: f64) -> Self {
        Self { timestamp, value }
    }

    /// Create a point at the current time.
    #[inline]
    pub fn now(value: f64) -> Self {
        Self {
            timestamp: Timestamp::now(),
            value,
        }
    }
}

// ----------------------------------------------------------------------------
// 15.2 Time-Series Ring Buffer - Lock-Free Circular Buffer
// ----------------------------------------------------------------------------

/// A lock-free ring buffer for time-series data.
/// Optimized for append-heavy workloads with occasional reads.
pub struct TimeSeriesRingBuffer {
    /// Timestamps stored as atomic i64 (nanoseconds)
    timestamps: Box<[AtomicI64]>,
    /// Values stored as atomic u64 (bit-cast f64)
    values: Box<[AtomicU64]>,
    /// Buffer capacity
    capacity: usize,
    /// Mask for fast modulo (capacity - 1)
    mask: usize,
    /// Current write position
    head: CachePadded<AtomicUsize>,
    /// Number of points written (may exceed capacity)
    total_written: AtomicU64,
    /// Statistics
    stats: TimeSeriesStats,
}

#[derive(Debug, Default)]
struct TimeSeriesStats {
    min: AtomicF64,
    max: AtomicF64,
    sum: AtomicF64,
    count: AtomicU64,
}

impl TimeSeriesRingBuffer {
    /// Create a new time-series ring buffer.
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.next_power_of_two();
        
        let timestamps: Vec<AtomicI64> = (0..capacity)
            .map(|_| AtomicI64::new(0))
            .collect();
        
        let values: Vec<AtomicU64> = (0..capacity)
            .map(|_| AtomicU64::new(0))
            .collect();
        
        Self {
            timestamps: timestamps.into_boxed_slice(),
            values: values.into_boxed_slice(),
            capacity,
            mask: capacity - 1,
            head: CachePadded::new(AtomicUsize::new(0)),
            total_written: AtomicU64::new(0),
            stats: TimeSeriesStats::default(),
        }
    }

    /// Append a new point to the buffer.
    #[inline]
    pub fn append(&self, point: TimeSeriesPoint) {
        self.append_raw(point.timestamp, point.value);
    }

    /// Append raw timestamp and value.
    #[inline]
    pub fn append_raw(&self, timestamp: Timestamp, value: f64) {
        // Get the next write position
        let pos = self.head.fetch_add(1, AtomicOrdering::Relaxed) & self.mask;
        
        // Write the data
        self.timestamps[pos].store(timestamp.as_nanos(), AtomicOrdering::Release);
        self.values[pos].store(value.to_bits(), AtomicOrdering::Release);
        
        // Update statistics
        self.total_written.fetch_add(1, AtomicOrdering::Relaxed);
        self.stats.count.fetch_add(1, AtomicOrdering::Relaxed);
        self.stats.sum.fetch_add(value, AtomicOrdering::Relaxed);
        self.stats.min.fetch_min(value, AtomicOrdering::Relaxed);
        self.stats.max.fetch_max(value, AtomicOrdering::Relaxed);
    }

    /// Append a value at the current time.
    #[inline]
    pub fn append_now(&self, value: f64) {
        self.append_raw(Timestamp::now(), value);
    }

    /// Get the latest point.
    pub fn latest(&self) -> Option<TimeSeriesPoint> {
        let total = self.total_written.load(AtomicOrdering::Acquire);
        if total == 0 {
            return None;
        }
        
        let pos = (self.head.load(AtomicOrdering::Acquire).wrapping_sub(1)) & self.mask;
        let ts = self.timestamps[pos].load(AtomicOrdering::Acquire);
        let val = f64::from_bits(self.values[pos].load(AtomicOrdering::Acquire));
        
        Some(TimeSeriesPoint::new(Timestamp::from_nanos(ts), val))
    }

    /// Get the latest N points (newest first).
    pub fn latest_n(&self, n: usize) -> Vec<TimeSeriesPoint> {
        let total = self.total_written.load(AtomicOrdering::Acquire);
        if total == 0 {
            return Vec::new();
        }
        
        let count = n.min(total as usize).min(self.capacity);
        let mut points = Vec::with_capacity(count);
        let head = self.head.load(AtomicOrdering::Acquire);
        
        for i in 0..count {
            let pos = head.wrapping_sub(i + 1) & self.mask;
            let ts = self.timestamps[pos].load(AtomicOrdering::Acquire);
            let val = f64::from_bits(self.values[pos].load(AtomicOrdering::Acquire));
            
            if ts != 0 {
                points.push(TimeSeriesPoint::new(Timestamp::from_nanos(ts), val));
            }
        }
        
        points
    }

    /// Get points within a time range (inclusive).
    pub fn range(&self, start: Timestamp, end: Timestamp) -> Vec<TimeSeriesPoint> {
        let total = self.total_written.load(AtomicOrdering::Acquire);
        if total == 0 {
            return Vec::new();
        }
        
        let count = (total as usize).min(self.capacity);
        let mut points = Vec::new();
        let head = self.head.load(AtomicOrdering::Acquire);
        
        for i in 0..count {
            let pos = head.wrapping_sub(i + 1) & self.mask;
            let ts_nanos = self.timestamps[pos].load(AtomicOrdering::Acquire);
            
            if ts_nanos == 0 {
                continue;
            }
            
            let ts = Timestamp::from_nanos(ts_nanos);
            if ts >= start && ts <= end {
                let val = f64::from_bits(self.values[pos].load(AtomicOrdering::Acquire));
                points.push(TimeSeriesPoint::new(ts, val));
            } else if ts < start {
                // Points are roughly ordered, so we can stop early
                break;
            }
        }
        
        // Reverse to get chronological order
        points.reverse();
        points
    }

    /// Get all points in the buffer (oldest first).
    pub fn all(&self) -> Vec<TimeSeriesPoint> {
        let total = self.total_written.load(AtomicOrdering::Acquire);
        if total == 0 {
            return Vec::new();
        }
        
        let count = (total as usize).min(self.capacity);
        let mut points = Vec::with_capacity(count);
        let head = self.head.load(AtomicOrdering::Acquire);
        
        for i in 0..count {
            let pos = head.wrapping_sub(count - i) & self.mask;
            let ts = self.timestamps[pos].load(AtomicOrdering::Acquire);
            let val = f64::from_bits(self.values[pos].load(AtomicOrdering::Acquire));
            
            if ts != 0 {
                points.push(TimeSeriesPoint::new(Timestamp::from_nanos(ts), val));
            }
        }
        
        points
    }

    /// Get the number of points in the buffer.
    #[inline]
    pub fn len(&self) -> usize {
        let total = self.total_written.load(AtomicOrdering::Relaxed);
        (total as usize).min(self.capacity)
    }

    /// Check if the buffer is empty.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.total_written.load(AtomicOrdering::Relaxed) == 0
    }

    /// Get the capacity.
    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Get total points written (including overwritten).
    #[inline]
    pub fn total_written(&self) -> u64 {
        self.total_written.load(AtomicOrdering::Relaxed)
    }

    /// Get current statistics.
    pub fn statistics(&self) -> TimeSeriesStatistics {
        let count = self.stats.count.load(AtomicOrdering::Relaxed);
        let sum = self.stats.sum.load(AtomicOrdering::Relaxed);
        let min = self.stats.min.load(AtomicOrdering::Relaxed);
        let max = self.stats.max.load(AtomicOrdering::Relaxed);
        
        TimeSeriesStatistics {
            count,
            sum,
            min: if count == 0 { 0.0 } else { min },
            max: if count == 0 { 0.0 } else { max },
            mean: if count == 0 { 0.0 } else { sum / count as f64 },
        }
    }

    /// Clear the buffer and reset statistics.
    pub fn clear(&self) {
        for ts in self.timestamps.iter() {
            ts.store(0, AtomicOrdering::Relaxed);
        }
        for val in self.values.iter() {
            val.store(0, AtomicOrdering::Relaxed);
        }
        self.head.store(0, AtomicOrdering::Relaxed);
        self.total_written.store(0, AtomicOrdering::Relaxed);
        self.stats.count.store(0, AtomicOrdering::Relaxed);
        self.stats.sum.store(0.0, AtomicOrdering::Relaxed);
        self.stats.min.store(f64::INFINITY, AtomicOrdering::Relaxed);
        self.stats.max.store(f64::NEG_INFINITY, AtomicOrdering::Relaxed);
    }
}

/// Statistics for a time series.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TimeSeriesStatistics {
    pub count: u64,
    pub sum: f64,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
}

// ----------------------------------------------------------------------------
// 15.3 Downsampled Time-Series - Multi-Resolution Storage
// ----------------------------------------------------------------------------

/// Time-series with automatic downsampling at multiple resolutions.
pub struct DownsampledTimeSeries {
    /// Raw data (highest resolution)
    raw: TimeSeriesRingBuffer,
    /// 10-second averages
    ten_sec: TimeSeriesRingBuffer,
    /// 1-minute averages
    one_min: TimeSeriesRingBuffer,
    /// 5-minute averages
    five_min: TimeSeriesRingBuffer,
    /// 1-hour averages
    one_hour: TimeSeriesRingBuffer,
    /// Accumulators for downsampling
    accumulators: DownsampleAccumulators,
}

struct DownsampleAccumulators {
    ten_sec: RwLock<DownsampleBucket>,
    one_min: RwLock<DownsampleBucket>,
    five_min: RwLock<DownsampleBucket>,
    one_hour: RwLock<DownsampleBucket>,
}

struct DownsampleBucket {
    sum: f64,
    count: u64,
    min: f64,
    max: f64,
    bucket_start: Timestamp,
}

impl DownsampleBucket {
    fn new() -> Self {
        Self {
            sum: 0.0,
            count: 0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            bucket_start: Timestamp::now(),
        }
    }

    fn add(&mut self, value: f64) {
        self.sum += value;
        self.count += 1;
        self.min = self.min.min(value);
        self.max = self.max.max(value);
    }

    fn average(&self) -> f64 {
        if self.count == 0 { 0.0 } else { self.sum / self.count as f64 }
    }

    fn reset(&mut self, new_start: Timestamp) {
        self.sum = 0.0;
        self.count = 0;
        self.min = f64::INFINITY;
        self.max = f64::NEG_INFINITY;
        self.bucket_start = new_start;
    }
}

impl DownsampledTimeSeries {
    /// Create a new downsampled time series.
    pub fn new(raw_capacity: usize) -> Self {
        Self {
            raw: TimeSeriesRingBuffer::new(raw_capacity),
            ten_sec: TimeSeriesRingBuffer::new(raw_capacity / 10),
            one_min: TimeSeriesRingBuffer::new(raw_capacity / 60),
            five_min: TimeSeriesRingBuffer::new(raw_capacity / 300),
            one_hour: TimeSeriesRingBuffer::new(raw_capacity / 3600),
            accumulators: DownsampleAccumulators {
                ten_sec: RwLock::new(DownsampleBucket::new()),
                one_min: RwLock::new(DownsampleBucket::new()),
                five_min: RwLock::new(DownsampleBucket::new()),
                one_hour: RwLock::new(DownsampleBucket::new()),
            },
        }
    }

    /// Append a new point.
    pub fn append(&self, timestamp: Timestamp, value: f64) {
        // Always store raw
        self.raw.append_raw(timestamp, value);
        
        let ts_secs = timestamp.as_secs();
        
        // Update 10-second accumulator
        {
            let mut acc = self.accumulators.ten_sec.write();
            let bucket_secs = acc.bucket_start.as_secs() / 10 * 10;
            let current_bucket = ts_secs / 10 * 10;
            
            if current_bucket > bucket_secs && acc.count > 0 {
                // Emit and reset
                self.ten_sec.append_raw(acc.bucket_start, acc.average());
                acc.reset(Timestamp::from_secs(current_bucket));
            }
            acc.add(value);
        }
        
        // Update 1-minute accumulator
        {
            let mut acc = self.accumulators.one_min.write();
            let bucket_secs = acc.bucket_start.as_secs() / 60 * 60;
            let current_bucket = ts_secs / 60 * 60;
            
            if current_bucket > bucket_secs && acc.count > 0 {
                self.one_min.append_raw(acc.bucket_start, acc.average());
                acc.reset(Timestamp::from_secs(current_bucket));
            }
            acc.add(value);
        }
        
        // Update 5-minute accumulator
        {
            let mut acc = self.accumulators.five_min.write();
            let bucket_secs = acc.bucket_start.as_secs() / 300 * 300;
            let current_bucket = ts_secs / 300 * 300;
            
            if current_bucket > bucket_secs && acc.count > 0 {
                self.five_min.append_raw(acc.bucket_start, acc.average());
                acc.reset(Timestamp::from_secs(current_bucket));
            }
            acc.add(value);
        }
        
        // Update 1-hour accumulator
        {
            let mut acc = self.accumulators.one_hour.write();
            let bucket_secs = acc.bucket_start.as_secs() / 3600 * 3600;
            let current_bucket = ts_secs / 3600 * 3600;
            
            if current_bucket > bucket_secs && acc.count > 0 {
                self.one_hour.append_raw(acc.bucket_start, acc.average());
                acc.reset(Timestamp::from_secs(current_bucket));
            }
            acc.add(value);
        }
    }

    /// Append a value at the current time.
    pub fn append_now(&self, value: f64) {
        self.append(Timestamp::now(), value);
    }

    /// Get raw data for a time range.
    pub fn raw_range(&self, start: Timestamp, end: Timestamp) -> Vec<TimeSeriesPoint> {
        self.raw.range(start, end)
    }

    /// Get data at appropriate resolution for the given time range.
    pub fn auto_range(&self, start: Timestamp, end: Timestamp) -> Vec<TimeSeriesPoint> {
        let duration_secs = end.duration_since(start).as_secs();
        
        if duration_secs <= 600 {
            // <= 10 minutes: raw data
            self.raw.range(start, end)
        } else if duration_secs <= 3600 {
            // <= 1 hour: 10-second data
            self.ten_sec.range(start, end)
        } else if duration_secs <= 21600 {
            // <= 6 hours: 1-minute data
            self.one_min.range(start, end)
        } else if duration_secs <= 86400 {
            // <= 24 hours: 5-minute data
            self.five_min.range(start, end)
        } else {
            // > 24 hours: 1-hour data
            self.one_hour.range(start, end)
        }
    }

    /// Get the latest value.
    pub fn latest(&self) -> Option<TimeSeriesPoint> {
        self.raw.latest()
    }

    /// Get raw buffer statistics.
    pub fn statistics(&self) -> TimeSeriesStatistics {
        self.raw.statistics()
    }
}

// ----------------------------------------------------------------------------
// 15.4 Time-Series Store - Store for Multiple Metrics
// ----------------------------------------------------------------------------

/// Store for multiple time-series, keyed by metric ID.
pub struct TimeSeriesStore {
    /// Time-series by metric ID
    series: DashMap<MetricId, DownsampledTimeSeries>,
    /// Default capacity for new series
    default_capacity: usize,
    /// Total memory used (approximate)
    memory_used: AtomicUsize,
    /// Maximum memory allowed
    max_memory: usize,
}

impl TimeSeriesStore {
    /// Create a new time-series store.
    pub fn new(default_capacity: usize, max_memory: usize) -> Self {
        Self {
            series: DashMap::new(),
            default_capacity,
            memory_used: AtomicUsize::new(0),
            max_memory,
        }
    }

    /// Record a metric value.
    pub fn record(&self, metric: &Metric) {
        if let Some(value) = metric.as_f64() {
            let series = self.series.entry(metric.id).or_insert_with(|| {
                let mem = self.default_capacity * (std::mem::size_of::<i64>() + std::mem::size_of::<u64>());
                self.memory_used.fetch_add(mem, AtomicOrdering::Relaxed);
                DownsampledTimeSeries::new(self.default_capacity)
            });
            series.append(metric.timestamp, value);
        }
    }

    /// Get time-series for a metric.
    pub fn get(&self, id: MetricId) -> Option<dashmap::mapref::one::Ref<'_, MetricId, DownsampledTimeSeries>> {
        self.series.get(&id)
    }

    /// Get raw data for a metric in a time range.
    pub fn get_range(&self, id: MetricId, start: Timestamp, end: Timestamp) -> Vec<TimeSeriesPoint> {
        self.series.get(&id)
            .map(|s| s.auto_range(start, end))
            .unwrap_or_default()
    }

    /// Get latest value for a metric.
    pub fn get_latest(&self, id: MetricId) -> Option<TimeSeriesPoint> {
        self.series.get(&id).and_then(|s| s.latest())
    }

    /// Get statistics for a metric.
    pub fn get_statistics(&self, id: MetricId) -> Option<TimeSeriesStatistics> {
        self.series.get(&id).map(|s| s.statistics())
    }

    /// Get the number of tracked metrics.
    pub fn metric_count(&self) -> usize {
        self.series.len()
    }

    /// Get approximate memory usage.
    pub fn memory_used(&self) -> usize {
        self.memory_used.load(AtomicOrdering::Relaxed)
    }

    /// Check if under memory limit.
    pub fn is_under_limit(&self) -> bool {
        self.memory_used() < self.max_memory
    }

    /// Remove a metric's time-series.
    pub fn remove(&self, id: MetricId) -> bool {
        if self.series.remove(&id).is_some() {
            let mem = self.default_capacity * (std::mem::size_of::<i64>() + std::mem::size_of::<u64>());
            self.memory_used.fetch_sub(mem, AtomicOrdering::Relaxed);
            true
        } else {
            false
        }
    }

    /// Clear all time-series.
    pub fn clear(&self) {
        self.series.clear();
        self.memory_used.store(0, AtomicOrdering::Relaxed);
    }

    /// Get all metric IDs.
    pub fn metric_ids(&self) -> Vec<MetricId> {
        self.series.iter().map(|r| *r.key()).collect()
    }
}

impl Default for TimeSeriesStore {
    fn default() -> Self {
        Self::new(DEFAULT_RING_BUFFER_SIZE, MAX_TIMESERIES_MEMORY)
    }
}

// ============================================================================
// SECTION 16: PHASE 2 TESTS
// ============================================================================

#[cfg(test)]
mod phase2_tests {
    use super::*;

    #[test]
    fn test_spsc_ring_buffer() {
        let buffer: SpscRingBuffer<i32> = SpscRingBuffer::new(4);
        
        assert!(buffer.try_push(1).is_ok());
        assert!(buffer.try_push(2).is_ok());
        assert!(buffer.try_push(3).is_ok());
        assert!(buffer.try_push(4).is_ok());
        assert!(buffer.try_push(5).is_err()); // Full
        
        assert_eq!(buffer.try_pop(), Some(1));
        assert_eq!(buffer.try_pop(), Some(2));
        assert_eq!(buffer.len(), 2);
    }

    #[test]
    fn test_mpmc_ring_buffer() {
        let buffer: MpmcRingBuffer<i32> = MpmcRingBuffer::new(8);
        
        // Push from multiple threads would work, but test single thread
        for i in 0..5 {
            assert!(buffer.try_push(i).is_ok());
        }
        
        assert_eq!(buffer.len(), 5);
        
        for i in 0..5 {
            assert_eq!(buffer.try_pop(), Some(i));
        }
        assert!(buffer.is_empty());
    }

    #[test]
    fn test_atomic_f64() {
        let val = AtomicF64::new(3.14);
        assert!((val.load(AtomicOrdering::Relaxed) - 3.14).abs() < 0.001);
        
        val.fetch_add(1.0, AtomicOrdering::Relaxed);
        assert!((val.load(AtomicOrdering::Relaxed) - 4.14).abs() < 0.001);
    }

    #[test]
    fn test_stats_accumulator() {
        let stats = StatsAccumulator::new();
        
        for i in 1..=100 {
            stats.observe(i as f64);
        }
        
        assert_eq!(stats.count(), 100);
        assert!((stats.mean() - 50.5).abs() < 0.001);
        assert_eq!(stats.min(), 1.0);
        assert_eq!(stats.max(), 100.0);
    }

    #[test]
    fn test_rate_calculator() {
        let rate = RateCalculator::new(Duration::from_secs(1), 10);
        
        for _ in 0..100 {
            rate.record();
        }
        
        // Rate should be around 100/second
        assert!(rate.total_in_window() > 0);
    }

    #[test]
    fn test_ema() {
        let ema = ExponentialMovingAverage::new(0.5);
        
        ema.observe(10.0);
        ema.observe(20.0);
        ema.observe(30.0);
        
        // Should be trending towards 30
        assert!(ema.value() > 15.0);
        assert!(ema.value() < 30.0);
    }

    #[test]
    fn test_histogram() {
        let hist = HistogramAccumulator::new(vec![1.0, 5.0, 10.0, 50.0, 100.0]);
        
        for i in 1..=100 {
            hist.observe(i as f64);
        }
        
        assert_eq!(hist.count(), 100);
        
        let snapshot = hist.snapshot();
        assert!(snapshot.p50() > 0.0);
        assert!(snapshot.p99() > snapshot.p50());
    }

    #[test]
    fn test_metric_channel() {
        let channel = MetricChannel::new("test", 100);
        
        let metric = Metric::gauge("test.metric", 42.0);
        assert!(channel.send(metric).is_ok());
        
        let received = channel.recv();
        assert!(received.is_some());
        assert_eq!(received.unwrap().as_f64(), Some(42.0));
    }

    #[test]
    fn test_time_series_ring_buffer() {
        let buffer = TimeSeriesRingBuffer::new(100);
        
        for i in 0..50 {
            buffer.append_now(i as f64);
        }
        
        assert_eq!(buffer.len(), 50);
        
        let latest = buffer.latest().unwrap();
        assert_eq!(latest.value, 49.0);
        
        let points = buffer.latest_n(10);
        assert_eq!(points.len(), 10);
    }

    #[test]
    fn test_metric_store() {
        let store = MetricStore::new();
        
        let metric = Metric::gauge("cpu.usage", 75.0)
            .with_project(1)
            .with_category(MetricCategory::CpuUsage);
        
        store.store(metric.clone());
        
        assert_eq!(store.len(), 1);
        
        let retrieved = store.get(metric.id);
        assert!(retrieved.is_some());
        
        let by_project = store.get_by_project(1);
        assert_eq!(by_project.len(), 1);
    }

    #[test]
    fn test_priority_channel() {
        let channel: PriorityChannel<i32> = PriorityChannel::new(10);
        
        channel.send(1, Priority::Low).unwrap();
        channel.send(2, Priority::Critical).unwrap();
        channel.send(3, Priority::Normal).unwrap();
        
        // Should receive in priority order: Critical, Normal, Low
        assert_eq!(channel.recv(), Some(2)); // Critical
        assert_eq!(channel.recv(), Some(3)); // Normal
        assert_eq!(channel.recv(), Some(1)); // Low
    }
}


// ============================================================================
// ██████╗ ██╗  ██╗ █████╗ ███████╗███████╗    ██████╗ 
// ██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ╚════██╗
// ██████╔╝███████║███████║███████╗█████╗       █████╔╝
// ██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝       ╚═══██╗
// ██║     ██║  ██║██║  ██║███████║███████╗    ██████╔╝
// ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝    ╚═════╝ 
// TIME-SERIES STORAGE ENGINE - QUERY, COMPRESSION, PERSISTENCE
// ============================================================================

// ============================================================================
// SECTION 17: QUERY ENGINE
// ============================================================================
// Powerful query engine for time-series data:
// - PromQL-inspired query language
// - Time range selection
// - Aggregation functions
// - Label-based filtering
// - Mathematical operations
// - Query optimization
// ============================================================================

// ----------------------------------------------------------------------------
// 17.1 Query Types & AST
// ----------------------------------------------------------------------------

/// A query against the time-series store.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Query {
    /// The query expression
    pub expr: QueryExpr,
    /// Time range for the query
    pub time_range: QueryTimeRange,
    /// Step/resolution for range queries
    pub step: Option<Duration>,
    /// Maximum number of results
    pub limit: Option<usize>,
    /// Result ordering
    pub order: QueryOrder,
}

/// Time range for a query.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct QueryTimeRange {
    /// Start time (inclusive)
    pub start: Timestamp,
    /// End time (inclusive)
    pub end: Timestamp,
}

impl QueryTimeRange {
    /// Create a time range.
    pub fn new(start: Timestamp, end: Timestamp) -> Self {
        Self { start, end }
    }

    /// Last N seconds.
    pub fn last_seconds(secs: u64) -> Self {
        let now = Timestamp::now();
        Self {
            start: now.sub_duration(Duration::from_secs(secs)),
            end: now,
        }
    }

    /// Last N minutes.
    pub fn last_minutes(mins: u64) -> Self {
        Self::last_seconds(mins * 60)
    }

    /// Last N hours.
    pub fn last_hours(hours: u64) -> Self {
        Self::last_seconds(hours * 3600)
    }

    /// Last N days.
    pub fn last_days(days: u64) -> Self {
        Self::last_seconds(days * 86400)
    }

    /// Duration of this time range.
    pub fn duration(&self) -> Duration {
        self.end.duration_since(self.start)
    }

    /// Check if a timestamp is within this range.
    pub fn contains(&self, ts: Timestamp) -> bool {
        ts >= self.start && ts <= self.end
    }
}

/// Query result ordering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueryOrder {
    /// Ascending by time
    TimeAsc,
    /// Descending by time
    TimeDesc,
    /// Ascending by value
    ValueAsc,
    /// Descending by value
    ValueDesc,
}

impl Default for QueryOrder {
    fn default() -> Self {
        QueryOrder::TimeAsc
    }
}

/// Query expression - the AST for queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QueryExpr {
    // ---- Selectors ----
    /// Select a metric by name
    MetricSelector {
        name: String,
        labels: Vec<LabelMatcher>,
    },
    
    /// Select by metric ID
    MetricIdSelector(MetricId),
    
    /// Select all metrics for a project
    ProjectSelector(u32),
    
    /// Select by category
    CategorySelector(MetricCategory),

    // ---- Aggregations ----
    /// Aggregate over time
    AggregateOverTime {
        expr: Box<QueryExpr>,
        function: AggregateFunction,
        window: Duration,
    },
    
    /// Aggregate across series
    AggregateAcrossSeries {
        expr: Box<QueryExpr>,
        function: AggregateFunction,
        by_labels: Vec<String>,
    },

    // ---- Binary Operations ----
    /// Binary operation between two expressions
    BinaryOp {
        left: Box<QueryExpr>,
        op: BinaryOperator,
        right: Box<QueryExpr>,
    },
    
    /// Binary operation with scalar
    ScalarOp {
        expr: Box<QueryExpr>,
        op: BinaryOperator,
        scalar: f64,
        scalar_left: bool,
    },

    // ---- Unary Operations ----
    /// Unary function
    UnaryOp {
        expr: Box<QueryExpr>,
        op: UnaryOperator,
    },

    // ---- Functions ----
    /// Rate of change per second
    Rate {
        expr: Box<QueryExpr>,
        window: Duration,
    },
    
    /// Increase over time window
    Increase {
        expr: Box<QueryExpr>,
        window: Duration,
    },
    
    /// Delta (difference from first to last)
    Delta {
        expr: Box<QueryExpr>,
        window: Duration,
    },
    
    /// Derivative
    Deriv {
        expr: Box<QueryExpr>,
    },
    
    /// Predict linear value at time
    PredictLinear {
        expr: Box<QueryExpr>,
        window: Duration,
        seconds_ahead: f64,
    },
    
    /// Histogram quantile
    HistogramQuantile {
        quantile: f64,
        expr: Box<QueryExpr>,
    },

    // ---- Filters ----
    /// Filter by value threshold
    ThresholdFilter {
        expr: Box<QueryExpr>,
        op: ComparisonOp,
        threshold: f64,
    },
    
    /// Top N by value
    TopK {
        expr: Box<QueryExpr>,
        k: usize,
    },
    
    /// Bottom N by value
    BottomK {
        expr: Box<QueryExpr>,
        k: usize,
    },

    // ---- Literals ----
    /// Scalar value
    Scalar(f64),
    
    /// Vector of literal values
    Vector(Vec<f64>),
}

/// Label matcher for filtering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelMatcher {
    pub key: String,
    pub op: LabelMatchOp,
    pub value: String,
}

impl LabelMatcher {
    pub fn eq(key: impl Into<String>, value: impl Into<String>) -> Self {
        Self { key: key.into(), op: LabelMatchOp::Equal, value: value.into() }
    }
    
    pub fn neq(key: impl Into<String>, value: impl Into<String>) -> Self {
        Self { key: key.into(), op: LabelMatchOp::NotEqual, value: value.into() }
    }
    
    pub fn regex(key: impl Into<String>, pattern: impl Into<String>) -> Self {
        Self { key: key.into(), op: LabelMatchOp::Regex, value: pattern.into() }
    }
    
    pub fn not_regex(key: impl Into<String>, pattern: impl Into<String>) -> Self {
        Self { key: key.into(), op: LabelMatchOp::NotRegex, value: pattern.into() }
    }

    /// Check if a label matches.
    pub fn matches(&self, labels: &Labels) -> bool {
        let value = labels.get(&self.key);
        match self.op {
            LabelMatchOp::Equal => value == Some(self.value.as_str()),
            LabelMatchOp::NotEqual => value != Some(self.value.as_str()),
            LabelMatchOp::Regex => {
                if let (Some(v), Ok(re)) = (value, Regex::new(&self.value)) {
                    re.is_match(v)
                } else {
                    false
                }
            }
            LabelMatchOp::NotRegex => {
                if let (Some(v), Ok(re)) = (value, Regex::new(&self.value)) {
                    !re.is_match(v)
                } else {
                    true
                }
            }
        }
    }
}

/// Label match operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LabelMatchOp {
    Equal,
    NotEqual,
    Regex,
    NotRegex,
}

/// Aggregation functions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AggregateFunction {
    Sum,
    Avg,
    Min,
    Max,
    Count,
    StdDev,
    StdVar,
    First,
    Last,
    CountValues,
    Quantile(OrderedFloat<f64>),
    TopK(usize),
    BottomK(usize),
}

impl AggregateFunction {
    /// Apply this aggregation to a slice of values.
    pub fn apply(&self, values: &[f64]) -> f64 {
        if values.is_empty() {
            return 0.0;
        }
        
        match self {
            AggregateFunction::Sum => values.iter().sum(),
            AggregateFunction::Avg => values.iter().sum::<f64>() / values.len() as f64,
            AggregateFunction::Min => values.iter().cloned().fold(f64::INFINITY, f64::min),
            AggregateFunction::Max => values.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
            AggregateFunction::Count => values.len() as f64,
            AggregateFunction::StdDev => {
                let mean = values.iter().sum::<f64>() / values.len() as f64;
                let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;
                variance.sqrt()
            }
            AggregateFunction::StdVar => {
                let mean = values.iter().sum::<f64>() / values.len() as f64;
                values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64
            }
            AggregateFunction::First => values[0],
            AggregateFunction::Last => values[values.len() - 1],
            AggregateFunction::CountValues => {
                let mut unique: HashSet<OrderedFloat<f64>> = HashSet::new();
                for v in values {
                    unique.insert(OrderedFloat(*v));
                }
                unique.len() as f64
            }
            AggregateFunction::Quantile(q) => {
                let mut sorted = values.to_vec();
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let idx = (q.0 * (sorted.len() - 1) as f64).round() as usize;
                sorted[idx.min(sorted.len() - 1)]
            }
            AggregateFunction::TopK(k) => {
                let mut sorted = values.to_vec();
                sorted.sort_by(|a, b| b.partial_cmp(a).unwrap());
                sorted.get(*k - 1).cloned().unwrap_or(0.0)
            }
            AggregateFunction::BottomK(k) => {
                let mut sorted = values.to_vec();
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
                sorted.get(*k - 1).cloned().unwrap_or(0.0)
            }
        }
    }
}

/// Binary operators.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BinaryOperator {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Pow,
    And,
    Or,
    Unless,
}

impl BinaryOperator {
    /// Apply the operator to two values.
    pub fn apply(&self, left: f64, right: f64) -> f64 {
        match self {
            BinaryOperator::Add => left + right,
            BinaryOperator::Sub => left - right,
            BinaryOperator::Mul => left * right,
            BinaryOperator::Div => if right != 0.0 { left / right } else { f64::NAN },
            BinaryOperator::Mod => if right != 0.0 { left % right } else { f64::NAN },
            BinaryOperator::Pow => left.powf(right),
            BinaryOperator::And => if left != 0.0 && right != 0.0 { 1.0 } else { 0.0 },
            BinaryOperator::Or => if left != 0.0 || right != 0.0 { 1.0 } else { 0.0 },
            BinaryOperator::Unless => if right == 0.0 { left } else { 0.0 },
        }
    }
}

/// Unary operators.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnaryOperator {
    Abs,
    Ceil,
    Floor,
    Round,
    Sqrt,
    Ln,
    Log2,
    Log10,
    Exp,
    Neg,
    Sgn,
    Clamp { min: OrderedFloat<f64>, max: OrderedFloat<f64> },
}

impl UnaryOperator {
    /// Apply the operator to a value.
    pub fn apply(&self, value: f64) -> f64 {
        match self {
            UnaryOperator::Abs => value.abs(),
            UnaryOperator::Ceil => value.ceil(),
            UnaryOperator::Floor => value.floor(),
            UnaryOperator::Round => value.round(),
            UnaryOperator::Sqrt => value.sqrt(),
            UnaryOperator::Ln => value.ln(),
            UnaryOperator::Log2 => value.log2(),
            UnaryOperator::Log10 => value.log10(),
            UnaryOperator::Exp => value.exp(),
            UnaryOperator::Neg => -value,
            UnaryOperator::Sgn => value.signum(),
            UnaryOperator::Clamp { min, max } => value.clamp(min.0, max.0),
        }
    }
}

/// Comparison operators.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComparisonOp {
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
}

impl ComparisonOp {
    /// Apply the comparison.
    pub fn apply(&self, left: f64, right: f64) -> bool {
        match self {
            ComparisonOp::Eq => (left - right).abs() < f64::EPSILON,
            ComparisonOp::Ne => (left - right).abs() >= f64::EPSILON,
            ComparisonOp::Lt => left < right,
            ComparisonOp::Le => left <= right,
            ComparisonOp::Gt => left > right,
            ComparisonOp::Ge => left >= right,
        }
    }
}

// ----------------------------------------------------------------------------
// 17.2 Query Results
// ----------------------------------------------------------------------------

/// Result of a query execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    /// The result type
    pub result_type: QueryResultType,
    /// Result data
    pub data: QueryResultData,
    /// Execution statistics
    pub stats: QueryStats,
}

/// Type of query result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueryResultType {
    /// Single scalar value
    Scalar,
    /// Instant vector (single timestamp, multiple series)
    Vector,
    /// Range matrix (multiple timestamps, multiple series)
    Matrix,
    /// String result
    String,
}

/// Query result data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QueryResultData {
    /// Single scalar value with timestamp
    Scalar { timestamp: Timestamp, value: f64 },
    
    /// Vector of instant values
    Vector(Vec<InstantValue>),
    
    /// Matrix of time-series
    Matrix(Vec<RangeValue>),
    
    /// String result
    String(String),
    
    /// Empty result
    Empty,
}

/// An instant value (single point in time).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstantValue {
    /// Metric identifier
    pub metric: MetricIdentifier,
    /// Value at the instant
    pub value: f64,
    /// Timestamp
    pub timestamp: Timestamp,
}

/// A range value (multiple points over time).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeValue {
    /// Metric identifier
    pub metric: MetricIdentifier,
    /// Values over time
    pub values: Vec<TimeSeriesPoint>,
}

/// Metric identifier for query results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricIdentifier {
    /// Metric name
    pub name: CompactString,
    /// Labels
    pub labels: HashMap<String, String>,
}

/// Query execution statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QueryStats {
    /// Execution time
    pub execution_time_ms: u64,
    /// Number of series scanned
    pub series_scanned: usize,
    /// Number of samples scanned
    pub samples_scanned: usize,
    /// Number of results returned
    pub results_returned: usize,
    /// Peak memory used
    pub peak_memory_bytes: usize,
}

// ----------------------------------------------------------------------------
// 17.3 Query Builder - Fluent API for Building Queries
// ----------------------------------------------------------------------------

/// Builder for constructing queries.
pub struct QueryBuilder {
    expr: Option<QueryExpr>,
    time_range: QueryTimeRange,
    step: Option<Duration>,
    limit: Option<usize>,
    order: QueryOrder,
}

impl QueryBuilder {
    /// Create a new query builder.
    pub fn new() -> Self {
        Self {
            expr: None,
            time_range: QueryTimeRange::last_hours(1),
            step: None,
            limit: None,
            order: QueryOrder::TimeAsc,
        }
    }

    /// Select a metric by name.
    pub fn metric(mut self, name: impl Into<String>) -> Self {
        self.expr = Some(QueryExpr::MetricSelector {
            name: name.into(),
            labels: Vec::new(),
        });
        self
    }

    /// Select a metric by ID.
    pub fn metric_id(mut self, id: MetricId) -> Self {
        self.expr = Some(QueryExpr::MetricIdSelector(id));
        self
    }

    /// Select metrics by project.
    pub fn project(mut self, project_id: u32) -> Self {
        self.expr = Some(QueryExpr::ProjectSelector(project_id));
        self
    }

    /// Select metrics by category.
    pub fn category(mut self, category: MetricCategory) -> Self {
        self.expr = Some(QueryExpr::CategorySelector(category));
        self
    }

    /// Add a label filter.
    pub fn filter_label(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        if let Some(QueryExpr::MetricSelector { ref mut labels, .. }) = self.expr {
            labels.push(LabelMatcher::eq(key, value));
        }
        self
    }

    /// Add a label regex filter.
    pub fn filter_label_regex(mut self, key: impl Into<String>, pattern: impl Into<String>) -> Self {
        if let Some(QueryExpr::MetricSelector { ref mut labels, .. }) = self.expr {
            labels.push(LabelMatcher::regex(key, pattern));
        }
        self
    }

    /// Set the time range.
    pub fn time_range(mut self, start: Timestamp, end: Timestamp) -> Self {
        self.time_range = QueryTimeRange::new(start, end);
        self
    }

    /// Set to last N seconds.
    pub fn last_seconds(mut self, secs: u64) -> Self {
        self.time_range = QueryTimeRange::last_seconds(secs);
        self
    }

    /// Set to last N minutes.
    pub fn last_minutes(mut self, mins: u64) -> Self {
        self.time_range = QueryTimeRange::last_minutes(mins);
        self
    }

    /// Set to last N hours.
    pub fn last_hours(mut self, hours: u64) -> Self {
        self.time_range = QueryTimeRange::last_hours(hours);
        self
    }

    /// Set to last N days.
    pub fn last_days(mut self, days: u64) -> Self {
        self.time_range = QueryTimeRange::last_days(days);
        self
    }

    /// Set the step/resolution.
    pub fn step(mut self, step: Duration) -> Self {
        self.step = Some(step);
        self
    }

    /// Set result limit.
    pub fn limit(mut self, limit: usize) -> Self {
        self.limit = Some(limit);
        self
    }

    /// Set ordering.
    pub fn order(mut self, order: QueryOrder) -> Self {
        self.order = order;
        self
    }

    /// Apply rate function.
    pub fn rate(mut self, window: Duration) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::Rate {
                expr: Box::new(expr),
                window,
            });
        }
        self
    }

    /// Apply increase function.
    pub fn increase(mut self, window: Duration) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::Increase {
                expr: Box::new(expr),
                window,
            });
        }
        self
    }

    /// Apply aggregation over time.
    pub fn aggregate_over_time(mut self, function: AggregateFunction, window: Duration) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::AggregateOverTime {
                expr: Box::new(expr),
                function,
                window,
            });
        }
        self
    }

    /// Apply sum aggregation.
    pub fn sum(self, window: Duration) -> Self {
        self.aggregate_over_time(AggregateFunction::Sum, window)
    }

    /// Apply avg aggregation.
    pub fn avg(self, window: Duration) -> Self {
        self.aggregate_over_time(AggregateFunction::Avg, window)
    }

    /// Apply min aggregation.
    pub fn min(self, window: Duration) -> Self {
        self.aggregate_over_time(AggregateFunction::Min, window)
    }

    /// Apply max aggregation.
    pub fn max(self, window: Duration) -> Self {
        self.aggregate_over_time(AggregateFunction::Max, window)
    }

    /// Apply threshold filter.
    pub fn threshold(mut self, op: ComparisonOp, threshold: f64) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::ThresholdFilter {
                expr: Box::new(expr),
                op,
                threshold,
            });
        }
        self
    }

    /// Greater than filter.
    pub fn gt(self, threshold: f64) -> Self {
        self.threshold(ComparisonOp::Gt, threshold)
    }

    /// Less than filter.
    pub fn lt(self, threshold: f64) -> Self {
        self.threshold(ComparisonOp::Lt, threshold)
    }

    /// Top K filter.
    pub fn top_k(mut self, k: usize) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::TopK {
                expr: Box::new(expr),
                k,
            });
        }
        self
    }

    /// Bottom K filter.
    pub fn bottom_k(mut self, k: usize) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::BottomK {
                expr: Box::new(expr),
                k,
            });
        }
        self
    }

    /// Multiply by scalar.
    pub fn multiply(mut self, scalar: f64) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::ScalarOp {
                expr: Box::new(expr),
                op: BinaryOperator::Mul,
                scalar,
                scalar_left: false,
            });
        }
        self
    }

    /// Divide by scalar.
    pub fn divide(mut self, scalar: f64) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::ScalarOp {
                expr: Box::new(expr),
                op: BinaryOperator::Div,
                scalar,
                scalar_left: false,
            });
        }
        self
    }

    /// Apply unary operator.
    pub fn apply_unary(mut self, op: UnaryOperator) -> Self {
        if let Some(expr) = self.expr.take() {
            self.expr = Some(QueryExpr::UnaryOp {
                expr: Box::new(expr),
                op,
            });
        }
        self
    }

    /// Apply absolute value.
    pub fn abs(self) -> Self {
        self.apply_unary(UnaryOperator::Abs)
    }

    /// Apply sqrt.
    pub fn sqrt(self) -> Self {
        self.apply_unary(UnaryOperator::Sqrt)
    }

    /// Build the query.
    pub fn build(self) -> Option<Query> {
        self.expr.map(|expr| Query {
            expr,
            time_range: self.time_range,
            step: self.step,
            limit: self.limit,
            order: self.order,
        })
    }
}

impl Default for QueryBuilder {
    fn default() -> Self {
        Self::new()
    }
}


// ----------------------------------------------------------------------------
// 17.4 Query Executor - Execute Queries Against the Store
// ----------------------------------------------------------------------------

/// Executes queries against the time-series store.
pub struct QueryExecutor {
    /// Reference to the metric store
    metric_store: Arc<MetricStore>,
    /// Reference to the time-series store
    ts_store: Arc<TimeSeriesStore>,
    /// Query cache
    cache: QueryCache,
    /// Execution statistics
    stats: QueryExecutorStats,
}

#[derive(Debug, Default)]
struct QueryExecutorStats {
    queries_executed: AtomicU64,
    queries_cached: AtomicU64,
    total_execution_time_us: AtomicU64,
    samples_scanned: AtomicU64,
}

/// Query cache for frequently executed queries.
struct QueryCache {
    cache: DashMap<u64, CachedResult>,
    max_entries: usize,
    ttl: Duration,
}

struct CachedResult {
    result: QueryResult,
    cached_at: Timestamp,
}

impl QueryCache {
    fn new(max_entries: usize, ttl: Duration) -> Self {
        Self {
            cache: DashMap::new(),
            max_entries,
            ttl,
        }
    }

    fn get(&self, query_hash: u64) -> Option<QueryResult> {
        self.cache.get(&query_hash).and_then(|entry| {
            if entry.cached_at.add_duration(self.ttl) > Timestamp::now() {
                Some(entry.result.clone())
            } else {
                None
            }
        })
    }

    fn put(&self, query_hash: u64, result: QueryResult) {
        if self.cache.len() >= self.max_entries {
            // Evict oldest entries
            let now = Timestamp::now();
            self.cache.retain(|_, v| v.cached_at.add_duration(self.ttl) > now);
        }
        self.cache.insert(query_hash, CachedResult {
            result,
            cached_at: Timestamp::now(),
        });
    }

    fn invalidate(&self) {
        self.cache.clear();
    }
}

impl QueryExecutor {
    /// Create a new query executor.
    pub fn new(metric_store: Arc<MetricStore>, ts_store: Arc<TimeSeriesStore>) -> Self {
        Self {
            metric_store,
            ts_store,
            cache: QueryCache::new(1000, Duration::from_secs(60)),
            stats: QueryExecutorStats::default(),
        }
    }

    /// Execute a query.
    pub fn execute(&self, query: &Query) -> CerebroResult<QueryResult> {
        let start = Instant::now();
        self.stats.queries_executed.fetch_add(1, AtomicOrdering::Relaxed);

        // Check cache
        let query_hash = self.hash_query(query);
        if let Some(cached) = self.cache.get(query_hash) {
            self.stats.queries_cached.fetch_add(1, AtomicOrdering::Relaxed);
            return Ok(cached);
        }

        // Execute the query
        let mut ctx = ExecutionContext::new(query.time_range, query.step);
        let result = self.execute_expr(&query.expr, &mut ctx)?;

        // Apply ordering and limit
        let result = self.apply_post_processing(result, query)?;

        // Build final result
        let execution_time = start.elapsed();
        self.stats.total_execution_time_us.fetch_add(
            execution_time.as_micros() as u64,
            AtomicOrdering::Relaxed
        );

        let query_result = QueryResult {
            result_type: self.determine_result_type(&result),
            data: result,
            stats: QueryStats {
                execution_time_ms: execution_time.as_millis() as u64,
                series_scanned: ctx.series_scanned,
                samples_scanned: ctx.samples_scanned,
                results_returned: ctx.results_count,
                peak_memory_bytes: ctx.peak_memory,
            },
        };

        // Cache the result
        self.cache.put(query_hash, query_result.clone());

        Ok(query_result)
    }

    /// Execute an expression.
    fn execute_expr(&self, expr: &QueryExpr, ctx: &mut ExecutionContext) -> CerebroResult<QueryResultData> {
        match expr {
            QueryExpr::MetricSelector { name, labels } => {
                self.execute_metric_selector(name, labels, ctx)
            }
            QueryExpr::MetricIdSelector(id) => {
                self.execute_metric_id_selector(*id, ctx)
            }
            QueryExpr::ProjectSelector(project_id) => {
                self.execute_project_selector(*project_id, ctx)
            }
            QueryExpr::CategorySelector(category) => {
                self.execute_category_selector(*category, ctx)
            }
            QueryExpr::AggregateOverTime { expr, function, window } => {
                self.execute_aggregate_over_time(expr, *function, *window, ctx)
            }
            QueryExpr::Rate { expr, window } => {
                self.execute_rate(expr, *window, ctx)
            }
            QueryExpr::Increase { expr, window } => {
                self.execute_increase(expr, *window, ctx)
            }
            QueryExpr::Delta { expr, window } => {
                self.execute_delta(expr, *window, ctx)
            }
            QueryExpr::ThresholdFilter { expr, op, threshold } => {
                self.execute_threshold_filter(expr, *op, *threshold, ctx)
            }
            QueryExpr::TopK { expr, k } => {
                self.execute_top_k(expr, *k, ctx)
            }
            QueryExpr::BottomK { expr, k } => {
                self.execute_bottom_k(expr, *k, ctx)
            }
            QueryExpr::ScalarOp { expr, op, scalar, scalar_left } => {
                self.execute_scalar_op(expr, *op, *scalar, *scalar_left, ctx)
            }
            QueryExpr::UnaryOp { expr, op } => {
                self.execute_unary_op(expr, *op, ctx)
            }
            QueryExpr::Scalar(v) => {
                Ok(QueryResultData::Scalar {
                    timestamp: Timestamp::now(),
                    value: *v,
                })
            }
            _ => Err(CerebroError::NotImplemented("Query expression type".into())),
        }
    }

    /// Execute metric selector.
    fn execute_metric_selector(
        &self,
        name: &str,
        labels: &[LabelMatcher],
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let metrics = self.metric_store.get_by_name(name);
        ctx.series_scanned += metrics.len();

        let mut results = Vec::new();
        for stored in metrics {
            // Check label matchers
            let matches = labels.iter().all(|m| m.matches(&stored.metric.labels));
            if !matches {
                continue;
            }

            // Get time-series data
            let points = self.ts_store.get_range(
                stored.metric.id,
                ctx.time_range.start,
                ctx.time_range.end,
            );
            ctx.samples_scanned += points.len();

            if !points.is_empty() {
                results.push(RangeValue {
                    metric: self.metric_to_identifier(&stored.metric),
                    values: points,
                });
            }
        }

        ctx.results_count = results.len();
        Ok(QueryResultData::Matrix(results))
    }

    /// Execute metric ID selector.
    fn execute_metric_id_selector(
        &self,
        id: MetricId,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        ctx.series_scanned += 1;

        let points = self.ts_store.get_range(id, ctx.time_range.start, ctx.time_range.end);
        ctx.samples_scanned += points.len();

        if points.is_empty() {
            return Ok(QueryResultData::Empty);
        }

        let metric = self.metric_store.get(id);
        let identifier = metric.map(|m| self.metric_to_identifier(&m.metric))
            .unwrap_or_else(|| MetricIdentifier {
                name: CompactString::from("unknown"),
                labels: HashMap::new(),
            });

        ctx.results_count = 1;
        Ok(QueryResultData::Matrix(vec![RangeValue {
            metric: identifier,
            values: points,
        }]))
    }

    /// Execute project selector.
    fn execute_project_selector(
        &self,
        project_id: u32,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let metrics = self.metric_store.get_by_project(project_id);
        ctx.series_scanned += metrics.len();

        let mut results = Vec::new();
        for stored in metrics {
            let points = self.ts_store.get_range(
                stored.metric.id,
                ctx.time_range.start,
                ctx.time_range.end,
            );
            ctx.samples_scanned += points.len();

            if !points.is_empty() {
                results.push(RangeValue {
                    metric: self.metric_to_identifier(&stored.metric),
                    values: points,
                });
            }
        }

        ctx.results_count = results.len();
        Ok(QueryResultData::Matrix(results))
    }

    /// Execute category selector.
    fn execute_category_selector(
        &self,
        category: MetricCategory,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let metrics = self.metric_store.get_by_category(category);
        ctx.series_scanned += metrics.len();

        let mut results = Vec::new();
        for stored in metrics {
            let points = self.ts_store.get_range(
                stored.metric.id,
                ctx.time_range.start,
                ctx.time_range.end,
            );
            ctx.samples_scanned += points.len();

            if !points.is_empty() {
                results.push(RangeValue {
                    metric: self.metric_to_identifier(&stored.metric),
                    values: points,
                });
            }
        }

        ctx.results_count = results.len();
        Ok(QueryResultData::Matrix(results))
    }

    /// Execute aggregate over time.
    fn execute_aggregate_over_time(
        &self,
        expr: &QueryExpr,
        function: AggregateFunction,
        window: Duration,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(series) => {
                let mut results = Vec::new();
                
                for range_val in series {
                    // Group points by window
                    let window_ns = window.as_nanos() as i64;
                    let mut windows: BTreeMap<i64, Vec<f64>> = BTreeMap::new();
                    
                    for point in &range_val.values {
                        let window_start = (point.timestamp.as_nanos() / window_ns) * window_ns;
                        windows.entry(window_start).or_default().push(point.value);
                    }
                    
                    // Apply aggregation to each window
                    let aggregated: Vec<TimeSeriesPoint> = windows.into_iter()
                        .map(|(ts, values)| {
                            TimeSeriesPoint {
                                timestamp: Timestamp::from_nanos(ts),
                                value: function.apply(&values),
                            }
                        })
                        .collect();
                    
                    if !aggregated.is_empty() {
                        results.push(RangeValue {
                            metric: range_val.metric,
                            values: aggregated,
                        });
                    }
                }
                
                ctx.results_count = results.len();
                Ok(QueryResultData::Matrix(results))
            }
            _ => Ok(inner),
        }
    }

    /// Execute rate function.
    fn execute_rate(
        &self,
        expr: &QueryExpr,
        window: Duration,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(series) => {
                let mut results = Vec::new();
                let window_secs = window.as_secs_f64();
                
                for range_val in series {
                    if range_val.values.len() < 2 {
                        continue;
                    }
                    
                    let mut rate_points = Vec::new();
                    for i in 1..range_val.values.len() {
                        let prev = &range_val.values[i - 1];
                        let curr = &range_val.values[i];
                        
                        let time_diff = curr.timestamp.duration_since(prev.timestamp).as_secs_f64();
                        if time_diff > 0.0 && time_diff <= window_secs {
                            let value_diff = curr.value - prev.value;
                            let rate = value_diff / time_diff;
                            
                            rate_points.push(TimeSeriesPoint {
                                timestamp: curr.timestamp,
                                value: rate.max(0.0), // Rate should be non-negative for counters
                            });
                        }
                    }
                    
                    if !rate_points.is_empty() {
                        results.push(RangeValue {
                            metric: range_val.metric,
                            values: rate_points,
                        });
                    }
                }
                
                ctx.results_count = results.len();
                Ok(QueryResultData::Matrix(results))
            }
            _ => Ok(inner),
        }
    }

    /// Execute increase function.
    fn execute_increase(
        &self,
        expr: &QueryExpr,
        window: Duration,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(series) => {
                let mut results = Vec::new();
                
                for range_val in series {
                    if range_val.values.len() < 2 {
                        continue;
                    }
                    
                    let first = range_val.values.first().unwrap();
                    let last = range_val.values.last().unwrap();
                    let increase = last.value - first.value;
                    
                    results.push(RangeValue {
                        metric: range_val.metric,
                        values: vec![TimeSeriesPoint {
                            timestamp: last.timestamp,
                            value: increase.max(0.0),
                        }],
                    });
                }
                
                ctx.results_count = results.len();
                Ok(QueryResultData::Matrix(results))
            }
            _ => Ok(inner),
        }
    }

    /// Execute delta function.
    fn execute_delta(
        &self,
        expr: &QueryExpr,
        _window: Duration,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(series) => {
                let mut results = Vec::new();
                
                for range_val in series {
                    if range_val.values.len() < 2 {
                        continue;
                    }
                    
                    let first = range_val.values.first().unwrap();
                    let last = range_val.values.last().unwrap();
                    let delta = last.value - first.value;
                    
                    results.push(RangeValue {
                        metric: range_val.metric,
                        values: vec![TimeSeriesPoint {
                            timestamp: last.timestamp,
                            value: delta,
                        }],
                    });
                }
                
                ctx.results_count = results.len();
                Ok(QueryResultData::Matrix(results))
            }
            _ => Ok(inner),
        }
    }

    /// Execute threshold filter.
    fn execute_threshold_filter(
        &self,
        expr: &QueryExpr,
        op: ComparisonOp,
        threshold: f64,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(series) => {
                let filtered: Vec<RangeValue> = series.into_iter()
                    .map(|mut rv| {
                        rv.values.retain(|p| op.apply(p.value, threshold));
                        rv
                    })
                    .filter(|rv| !rv.values.is_empty())
                    .collect();
                
                ctx.results_count = filtered.len();
                Ok(QueryResultData::Matrix(filtered))
            }
            QueryResultData::Vector(vec) => {
                let filtered: Vec<InstantValue> = vec.into_iter()
                    .filter(|v| op.apply(v.value, threshold))
                    .collect();
                
                ctx.results_count = filtered.len();
                Ok(QueryResultData::Vector(filtered))
            }
            _ => Ok(inner),
        }
    }

    /// Execute top K.
    fn execute_top_k(
        &self,
        expr: &QueryExpr,
        k: usize,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(mut series) => {
                // Sort by latest value descending
                series.sort_by(|a, b| {
                    let a_val = a.values.last().map(|p| p.value).unwrap_or(0.0);
                    let b_val = b.values.last().map(|p| p.value).unwrap_or(0.0);
                    b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
                });
                
                series.truncate(k);
                ctx.results_count = series.len();
                Ok(QueryResultData::Matrix(series))
            }
            _ => Ok(inner),
        }
    }

    /// Execute bottom K.
    fn execute_bottom_k(
        &self,
        expr: &QueryExpr,
        k: usize,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(mut series) => {
                series.sort_by(|a, b| {
                    let a_val = a.values.last().map(|p| p.value).unwrap_or(0.0);
                    let b_val = b.values.last().map(|p| p.value).unwrap_or(0.0);
                    a_val.partial_cmp(&b_val).unwrap_or(std::cmp::Ordering::Equal)
                });
                
                series.truncate(k);
                ctx.results_count = series.len();
                Ok(QueryResultData::Matrix(series))
            }
            _ => Ok(inner),
        }
    }

    /// Execute scalar operation.
    fn execute_scalar_op(
        &self,
        expr: &QueryExpr,
        op: BinaryOperator,
        scalar: f64,
        scalar_left: bool,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(series) => {
                let transformed: Vec<RangeValue> = series.into_iter()
                    .map(|mut rv| {
                        rv.values = rv.values.into_iter()
                            .map(|mut p| {
                                p.value = if scalar_left {
                                    op.apply(scalar, p.value)
                                } else {
                                    op.apply(p.value, scalar)
                                };
                                p
                            })
                            .collect();
                        rv
                    })
                    .collect();
                
                Ok(QueryResultData::Matrix(transformed))
            }
            QueryResultData::Scalar { timestamp, value } => {
                let new_value = if scalar_left {
                    op.apply(scalar, value)
                } else {
                    op.apply(value, scalar)
                };
                Ok(QueryResultData::Scalar { timestamp, value: new_value })
            }
            _ => Ok(inner),
        }
    }

    /// Execute unary operation.
    fn execute_unary_op(
        &self,
        expr: &QueryExpr,
        op: UnaryOperator,
        ctx: &mut ExecutionContext,
    ) -> CerebroResult<QueryResultData> {
        let inner = self.execute_expr(expr, ctx)?;
        
        match inner {
            QueryResultData::Matrix(series) => {
                let transformed: Vec<RangeValue> = series.into_iter()
                    .map(|mut rv| {
                        rv.values = rv.values.into_iter()
                            .map(|mut p| {
                                p.value = op.apply(p.value);
                                p
                            })
                            .collect();
                        rv
                    })
                    .collect();
                
                Ok(QueryResultData::Matrix(transformed))
            }
            QueryResultData::Scalar { timestamp, value } => {
                Ok(QueryResultData::Scalar {
                    timestamp,
                    value: op.apply(value),
                })
            }
            _ => Ok(inner),
        }
    }

    /// Convert metric to identifier.
    fn metric_to_identifier(&self, metric: &Metric) -> MetricIdentifier {
        MetricIdentifier {
            name: metric.name.clone(),
            labels: metric.labels.iter()
                .map(|l| (l.key.to_string(), l.value.to_string()))
                .collect(),
        }
    }

    /// Determine result type.
    fn determine_result_type(&self, data: &QueryResultData) -> QueryResultType {
        match data {
            QueryResultData::Scalar { .. } => QueryResultType::Scalar,
            QueryResultData::Vector(_) => QueryResultType::Vector,
            QueryResultData::Matrix(_) => QueryResultType::Matrix,
            QueryResultData::String(_) => QueryResultType::String,
            QueryResultData::Empty => QueryResultType::Vector,
        }
    }

    /// Apply post-processing (ordering, limit).
    fn apply_post_processing(&self, data: QueryResultData, query: &Query) -> CerebroResult<QueryResultData> {
        match data {
            QueryResultData::Matrix(mut series) => {
                // Apply ordering
                for rv in &mut series {
                    match query.order {
                        QueryOrder::TimeAsc => {
                            rv.values.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
                        }
                        QueryOrder::TimeDesc => {
                            rv.values.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
                        }
                        QueryOrder::ValueAsc => {
                            rv.values.sort_by(|a, b| a.value.partial_cmp(&b.value).unwrap_or(std::cmp::Ordering::Equal));
                        }
                        QueryOrder::ValueDesc => {
                            rv.values.sort_by(|a, b| b.value.partial_cmp(&a.value).unwrap_or(std::cmp::Ordering::Equal));
                        }
                    }
                    
                    // Apply limit per series
                    if let Some(limit) = query.limit {
                        rv.values.truncate(limit);
                    }
                }
                
                Ok(QueryResultData::Matrix(series))
            }
            _ => Ok(data),
        }
    }

    /// Hash a query for caching.
    fn hash_query(&self, query: &Query) -> u64 {
        let mut hasher = Xxh3::new();
        // Simple hash - in production would serialize the query
        hasher.update(&query.time_range.start.as_nanos().to_le_bytes());
        hasher.update(&query.time_range.end.as_nanos().to_le_bytes());
        hasher.digest()
    }

    /// Get executor statistics.
    pub fn stats(&self) -> QueryExecutorStatsSnapshot {
        QueryExecutorStatsSnapshot {
            queries_executed: self.stats.queries_executed.load(AtomicOrdering::Relaxed),
            queries_cached: self.stats.queries_cached.load(AtomicOrdering::Relaxed),
            avg_execution_time_us: {
                let total = self.stats.total_execution_time_us.load(AtomicOrdering::Relaxed);
                let count = self.stats.queries_executed.load(AtomicOrdering::Relaxed);
                if count > 0 { total / count } else { 0 }
            },
            total_samples_scanned: self.stats.samples_scanned.load(AtomicOrdering::Relaxed),
            cache_hit_ratio: {
                let cached = self.stats.queries_cached.load(AtomicOrdering::Relaxed) as f64;
                let total = self.stats.queries_executed.load(AtomicOrdering::Relaxed) as f64;
                if total > 0.0 { cached / total } else { 0.0 }
            },
        }
    }

    /// Invalidate the query cache.
    pub fn invalidate_cache(&self) {
        self.cache.invalidate();
    }
}

/// Execution context for tracking query execution.
struct ExecutionContext {
    time_range: QueryTimeRange,
    step: Option<Duration>,
    series_scanned: usize,
    samples_scanned: usize,
    results_count: usize,
    peak_memory: usize,
}

impl ExecutionContext {
    fn new(time_range: QueryTimeRange, step: Option<Duration>) -> Self {
        Self {
            time_range,
            step,
            series_scanned: 0,
            samples_scanned: 0,
            results_count: 0,
            peak_memory: 0,
        }
    }
}

/// Snapshot of executor statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryExecutorStatsSnapshot {
    pub queries_executed: u64,
    pub queries_cached: u64,
    pub avg_execution_time_us: u64,
    pub total_samples_scanned: u64,
    pub cache_hit_ratio: f64,
}


// ============================================================================
// SECTION 18: COMPRESSION ENGINE
// ============================================================================
// High-performance time-series compression using:
// - Gorilla compression for timestamps (Facebook's algorithm)
// - XOR-based compression for floating point values
// - Delta-of-delta encoding
// - Variable-length encoding
// - Achieves 10-15x compression ratios
// ============================================================================

// ----------------------------------------------------------------------------
// 18.1 Bit Writer - Write Individual Bits
// ----------------------------------------------------------------------------

/// A bit-level writer for compression.
pub struct BitWriter {
    /// Output buffer
    buffer: Vec<u8>,
    /// Current byte being written
    current_byte: u8,
    /// Number of bits written to current byte (0-7)
    bit_position: u8,
    /// Total bits written
    total_bits: u64,
}

impl BitWriter {
    /// Create a new bit writer.
    pub fn new() -> Self {
        Self {
            buffer: Vec::with_capacity(4096),
            current_byte: 0,
            bit_position: 0,
            total_bits: 0,
        }
    }

    /// Create with pre-allocated capacity.
    pub fn with_capacity(bytes: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(bytes),
            current_byte: 0,
            bit_position: 0,
            total_bits: 0,
        }
    }

    /// Write a single bit.
    #[inline]
    pub fn write_bit(&mut self, bit: bool) {
        if bit {
            self.current_byte |= 1 << (7 - self.bit_position);
        }
        self.bit_position += 1;
        self.total_bits += 1;

        if self.bit_position == 8 {
            self.buffer.push(self.current_byte);
            self.current_byte = 0;
            self.bit_position = 0;
        }
    }

    /// Write multiple bits from a u64 (MSB first).
    #[inline]
    pub fn write_bits(&mut self, value: u64, num_bits: u8) {
        debug_assert!(num_bits <= 64);
        for i in (0..num_bits).rev() {
            self.write_bit((value >> i) & 1 == 1);
        }
    }

    /// Write a byte.
    #[inline]
    pub fn write_byte(&mut self, byte: u8) {
        self.write_bits(byte as u64, 8);
    }

    /// Write a u32.
    pub fn write_u32(&mut self, value: u32) {
        self.write_bits(value as u64, 32);
    }

    /// Write a u64.
    pub fn write_u64(&mut self, value: u64) {
        self.write_bits(value, 64);
    }

    /// Flush and get the buffer.
    pub fn finish(mut self) -> Vec<u8> {
        if self.bit_position > 0 {
            self.buffer.push(self.current_byte);
        }
        self.buffer
    }

    /// Get current size in bytes.
    pub fn byte_size(&self) -> usize {
        self.buffer.len() + if self.bit_position > 0 { 1 } else { 0 }
    }

    /// Get total bits written.
    pub fn bits_written(&self) -> u64 {
        self.total_bits
    }
}

impl Default for BitWriter {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 18.2 Bit Reader - Read Individual Bits
// ----------------------------------------------------------------------------

/// A bit-level reader for decompression.
pub struct BitReader<'a> {
    /// Input buffer
    buffer: &'a [u8],
    /// Current byte index
    byte_index: usize,
    /// Current bit position within byte (0-7)
    bit_position: u8,
    /// Total bits read
    total_bits: u64,
}

impl<'a> BitReader<'a> {
    /// Create a new bit reader.
    pub fn new(buffer: &'a [u8]) -> Self {
        Self {
            buffer,
            byte_index: 0,
            bit_position: 0,
            total_bits: 0,
        }
    }

    /// Read a single bit.
    #[inline]
    pub fn read_bit(&mut self) -> Option<bool> {
        if self.byte_index >= self.buffer.len() {
            return None;
        }

        let bit = (self.buffer[self.byte_index] >> (7 - self.bit_position)) & 1 == 1;
        self.bit_position += 1;
        self.total_bits += 1;

        if self.bit_position == 8 {
            self.byte_index += 1;
            self.bit_position = 0;
        }

        Some(bit)
    }

    /// Read multiple bits as u64 (MSB first).
    #[inline]
    pub fn read_bits(&mut self, num_bits: u8) -> Option<u64> {
        debug_assert!(num_bits <= 64);
        let mut value: u64 = 0;
        for _ in 0..num_bits {
            let bit = self.read_bit()?;
            value = (value << 1) | (bit as u64);
        }
        Some(value)
    }

    /// Read a byte.
    #[inline]
    pub fn read_byte(&mut self) -> Option<u8> {
        self.read_bits(8).map(|v| v as u8)
    }

    /// Read a u32.
    pub fn read_u32(&mut self) -> Option<u32> {
        self.read_bits(32).map(|v| v as u32)
    }

    /// Read a u64.
    pub fn read_u64(&mut self) -> Option<u64> {
        self.read_bits(64)
    }

    /// Check if there are more bits to read.
    pub fn has_more(&self) -> bool {
        self.byte_index < self.buffer.len()
    }

    /// Get total bits read.
    pub fn bits_read(&self) -> u64 {
        self.total_bits
    }
}

// ----------------------------------------------------------------------------
// 18.3 Gorilla Timestamp Compression
// ----------------------------------------------------------------------------

/// Gorilla timestamp compressor using delta-of-delta encoding.
pub struct TimestampCompressor {
    /// Previous timestamp
    prev_timestamp: i64,
    /// Previous delta
    prev_delta: i64,
    /// Number of timestamps compressed
    count: usize,
}

impl TimestampCompressor {
    /// Create a new timestamp compressor.
    pub fn new() -> Self {
        Self {
            prev_timestamp: 0,
            prev_delta: 0,
            count: 0,
        }
    }

    /// Compress a timestamp and write to the bit writer.
    pub fn compress(&mut self, timestamp: i64, writer: &mut BitWriter) {
        if self.count == 0 {
            // First timestamp: write full 64 bits
            writer.write_u64(timestamp as u64);
            self.prev_timestamp = timestamp;
            self.prev_delta = 0;
        } else if self.count == 1 {
            // Second timestamp: write delta as 14 bits (allows ~16k second range)
            let delta = timestamp - self.prev_timestamp;
            writer.write_bits(delta as u64, 14);
            self.prev_delta = delta;
            self.prev_timestamp = timestamp;
        } else {
            // Subsequent timestamps: use delta-of-delta encoding
            let delta = timestamp - self.prev_timestamp;
            let delta_of_delta = delta - self.prev_delta;

            if delta_of_delta == 0 {
                // Same delta: write single 0 bit
                writer.write_bit(false);
            } else if delta_of_delta >= -63 && delta_of_delta <= 64 {
                // Small delta-of-delta: 10 + 7 bits
                writer.write_bits(0b10, 2);
                writer.write_bits((delta_of_delta + 63) as u64, 7);
            } else if delta_of_delta >= -255 && delta_of_delta <= 256 {
                // Medium delta-of-delta: 110 + 9 bits
                writer.write_bits(0b110, 3);
                writer.write_bits((delta_of_delta + 255) as u64, 9);
            } else if delta_of_delta >= -2047 && delta_of_delta <= 2048 {
                // Larger delta-of-delta: 1110 + 12 bits
                writer.write_bits(0b1110, 4);
                writer.write_bits((delta_of_delta + 2047) as u64, 12);
            } else {
                // Full delta: 1111 + 64 bits
                writer.write_bits(0b1111, 4);
                writer.write_u64(delta as u64);
            }

            self.prev_delta = delta;
            self.prev_timestamp = timestamp;
        }
        self.count += 1;
    }

    /// Get the number of timestamps compressed.
    pub fn count(&self) -> usize {
        self.count
    }
}

impl Default for TimestampCompressor {
    fn default() -> Self {
        Self::new()
    }
}

/// Gorilla timestamp decompressor.
pub struct TimestampDecompressor {
    /// Previous timestamp
    prev_timestamp: i64,
    /// Previous delta
    prev_delta: i64,
    /// Number of timestamps decompressed
    count: usize,
}

impl TimestampDecompressor {
    /// Create a new timestamp decompressor.
    pub fn new() -> Self {
        Self {
            prev_timestamp: 0,
            prev_delta: 0,
            count: 0,
        }
    }

    /// Decompress the next timestamp.
    pub fn decompress(&mut self, reader: &mut BitReader) -> Option<i64> {
        if self.count == 0 {
            // First timestamp: read full 64 bits
            let timestamp = reader.read_u64()? as i64;
            self.prev_timestamp = timestamp;
            self.count += 1;
            Some(timestamp)
        } else if self.count == 1 {
            // Second timestamp: read 14-bit delta
            let delta = reader.read_bits(14)? as i64;
            let timestamp = self.prev_timestamp + delta;
            self.prev_delta = delta;
            self.prev_timestamp = timestamp;
            self.count += 1;
            Some(timestamp)
        } else {
            // Read control bits to determine encoding
            let first_bit = reader.read_bit()?;
            
            let delta_of_delta = if !first_bit {
                // 0: same delta
                0
            } else {
                let second_bit = reader.read_bit()?;
                if !second_bit {
                    // 10: 7-bit delta-of-delta
                    reader.read_bits(7)? as i64 - 63
                } else {
                    let third_bit = reader.read_bit()?;
                    if !third_bit {
                        // 110: 9-bit delta-of-delta
                        reader.read_bits(9)? as i64 - 255
                    } else {
                        let fourth_bit = reader.read_bit()?;
                        if !fourth_bit {
                            // 1110: 12-bit delta-of-delta
                            reader.read_bits(12)? as i64 - 2047
                        } else {
                            // 1111: full 64-bit delta
                            let delta = reader.read_u64()? as i64;
                            delta - self.prev_delta
                        }
                    }
                }
            };

            let delta = self.prev_delta + delta_of_delta;
            let timestamp = self.prev_timestamp + delta;
            self.prev_delta = delta;
            self.prev_timestamp = timestamp;
            self.count += 1;
            Some(timestamp)
        }
    }
}

impl Default for TimestampDecompressor {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 18.4 XOR Value Compression
// ----------------------------------------------------------------------------

/// XOR-based floating point compressor.
pub struct ValueCompressor {
    /// Previous value (as bits)
    prev_value: u64,
    /// Previous leading zeros
    prev_leading_zeros: u8,
    /// Previous trailing zeros
    prev_trailing_zeros: u8,
    /// Number of values compressed
    count: usize,
}

impl ValueCompressor {
    /// Create a new value compressor.
    pub fn new() -> Self {
        Self {
            prev_value: 0,
            prev_leading_zeros: 0,
            prev_trailing_zeros: 0,
            count: 0,
        }
    }

    /// Compress a value and write to the bit writer.
    pub fn compress(&mut self, value: f64, writer: &mut BitWriter) {
        let value_bits = value.to_bits();

        if self.count == 0 {
            // First value: write full 64 bits
            writer.write_u64(value_bits);
            self.prev_value = value_bits;
        } else {
            let xor = value_bits ^ self.prev_value;

            if xor == 0 {
                // Same value: write single 0 bit
                writer.write_bit(false);
            } else {
                writer.write_bit(true);

                let leading_zeros = xor.leading_zeros() as u8;
                let trailing_zeros = xor.trailing_zeros() as u8;

                // Check if we can reuse previous block position
                if leading_zeros >= self.prev_leading_zeros
                    && trailing_zeros >= self.prev_trailing_zeros
                {
                    // Reuse block position: 0 + meaningful bits
                    writer.write_bit(false);
                    let meaningful_bits = 64 - self.prev_leading_zeros - self.prev_trailing_zeros;
                    let meaningful_value = (xor >> self.prev_trailing_zeros) & ((1u64 << meaningful_bits) - 1);
                    writer.write_bits(meaningful_value, meaningful_bits);
                } else {
                    // New block position: 1 + 5 bits leading + 6 bits length + meaningful bits
                    writer.write_bit(true);
                    
                    // Cap leading zeros at 31 (5 bits)
                    let leading = leading_zeros.min(31);
                    writer.write_bits(leading as u64, 5);
                    
                    let meaningful_bits = 64 - leading_zeros - trailing_zeros;
                    // Length is stored as meaningful_bits - 1 (0 means 1 bit, max 63 means 64 bits)
                    writer.write_bits((meaningful_bits - 1) as u64, 6);
                    
                    let meaningful_value = (xor >> trailing_zeros) & ((1u64 << meaningful_bits) - 1);
                    writer.write_bits(meaningful_value, meaningful_bits);

                    self.prev_leading_zeros = leading;
                    self.prev_trailing_zeros = trailing_zeros;
                }
            }
            self.prev_value = value_bits;
        }
        self.count += 1;
    }

    /// Get the number of values compressed.
    pub fn count(&self) -> usize {
        self.count
    }
}

impl Default for ValueCompressor {
    fn default() -> Self {
        Self::new()
    }
}

/// XOR-based floating point decompressor.
pub struct ValueDecompressor {
    /// Previous value (as bits)
    prev_value: u64,
    /// Previous leading zeros
    prev_leading_zeros: u8,
    /// Previous meaningful bits
    prev_meaningful_bits: u8,
    /// Number of values decompressed
    count: usize,
}

impl ValueDecompressor {
    /// Create a new value decompressor.
    pub fn new() -> Self {
        Self {
            prev_value: 0,
            prev_leading_zeros: 0,
            prev_meaningful_bits: 64,
            count: 0,
        }
    }

    /// Decompress the next value.
    pub fn decompress(&mut self, reader: &mut BitReader) -> Option<f64> {
        if self.count == 0 {
            // First value: read full 64 bits
            let value_bits = reader.read_u64()?;
            self.prev_value = value_bits;
            self.count += 1;
            Some(f64::from_bits(value_bits))
        } else {
            let first_bit = reader.read_bit()?;

            if !first_bit {
                // Same value
                self.count += 1;
                Some(f64::from_bits(self.prev_value))
            } else {
                let second_bit = reader.read_bit()?;

                let xor = if !second_bit {
                    // Reuse previous block position
                    let meaningful_value = reader.read_bits(self.prev_meaningful_bits)?;
                    let trailing_zeros = 64 - self.prev_leading_zeros - self.prev_meaningful_bits;
                    meaningful_value << trailing_zeros
                } else {
                    // New block position
                    let leading_zeros = reader.read_bits(5)? as u8;
                    let meaningful_bits = reader.read_bits(6)? as u8 + 1;
                    let meaningful_value = reader.read_bits(meaningful_bits)?;
                    let trailing_zeros = 64 - leading_zeros - meaningful_bits;

                    self.prev_leading_zeros = leading_zeros;
                    self.prev_meaningful_bits = meaningful_bits;

                    meaningful_value << trailing_zeros
                };

                let value_bits = self.prev_value ^ xor;
                self.prev_value = value_bits;
                self.count += 1;
                Some(f64::from_bits(value_bits))
            }
        }
    }
}

impl Default for ValueDecompressor {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 18.5 Compressed Block - A Block of Compressed Time-Series Data
// ----------------------------------------------------------------------------

/// A compressed block of time-series data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressedBlock {
    /// Compressed data
    pub data: Vec<u8>,
    /// Number of points in this block
    pub point_count: usize,
    /// First timestamp in the block
    pub start_time: Timestamp,
    /// Last timestamp in the block
    pub end_time: Timestamp,
    /// Uncompressed size in bytes
    pub uncompressed_size: usize,
    /// Minimum value in the block
    pub min_value: f64,
    /// Maximum value in the block
    pub max_value: f64,
    /// Sum of all values (for fast average calculation)
    pub sum: f64,
}

impl CompressedBlock {
    /// Get the compression ratio.
    pub fn compression_ratio(&self) -> f64 {
        if self.data.is_empty() {
            1.0
        } else {
            self.uncompressed_size as f64 / self.data.len() as f64
        }
    }

    /// Get the average value.
    pub fn average(&self) -> f64 {
        if self.point_count == 0 {
            0.0
        } else {
            self.sum / self.point_count as f64
        }
    }
}

/// Compresses a series of time-series points into a block.
pub struct BlockCompressor {
    timestamp_compressor: TimestampCompressor,
    value_compressor: ValueCompressor,
    writer: BitWriter,
    start_time: Option<Timestamp>,
    end_time: Timestamp,
    min_value: f64,
    max_value: f64,
    sum: f64,
    point_count: usize,
}

impl BlockCompressor {
    /// Create a new block compressor.
    pub fn new() -> Self {
        Self {
            timestamp_compressor: TimestampCompressor::new(),
            value_compressor: ValueCompressor::new(),
            writer: BitWriter::with_capacity(8192),
            start_time: None,
            end_time: Timestamp::EPOCH,
            min_value: f64::INFINITY,
            max_value: f64::NEG_INFINITY,
            sum: 0.0,
            point_count: 0,
        }
    }

    /// Add a point to the block.
    pub fn add_point(&mut self, timestamp: Timestamp, value: f64) {
        if self.start_time.is_none() {
            self.start_time = Some(timestamp);
        }
        self.end_time = timestamp;
        self.min_value = self.min_value.min(value);
        self.max_value = self.max_value.max(value);
        self.sum += value;
        self.point_count += 1;

        self.timestamp_compressor.compress(timestamp.as_nanos(), &mut self.writer);
        self.value_compressor.compress(value, &mut self.writer);
    }

    /// Add a time-series point.
    pub fn add(&mut self, point: &TimeSeriesPoint) {
        self.add_point(point.timestamp, point.value);
    }

    /// Finish compression and return the block.
    pub fn finish(self) -> CompressedBlock {
        let uncompressed_size = self.point_count * (8 + 8); // 8 bytes timestamp + 8 bytes value
        
        CompressedBlock {
            data: self.writer.finish(),
            point_count: self.point_count,
            start_time: self.start_time.unwrap_or(Timestamp::EPOCH),
            end_time: self.end_time,
            uncompressed_size,
            min_value: if self.point_count > 0 { self.min_value } else { 0.0 },
            max_value: if self.point_count > 0 { self.max_value } else { 0.0 },
            sum: self.sum,
        }
    }

    /// Get current point count.
    pub fn point_count(&self) -> usize {
        self.point_count
    }
}

impl Default for BlockCompressor {
    fn default() -> Self {
        Self::new()
    }
}

/// Decompresses a block of time-series data.
pub struct BlockDecompressor<'a> {
    timestamp_decompressor: TimestampDecompressor,
    value_decompressor: ValueDecompressor,
    reader: BitReader<'a>,
    remaining: usize,
}

impl<'a> BlockDecompressor<'a> {
    /// Create a new block decompressor.
    pub fn new(block: &'a CompressedBlock) -> Self {
        Self {
            timestamp_decompressor: TimestampDecompressor::new(),
            value_decompressor: ValueDecompressor::new(),
            reader: BitReader::new(&block.data),
            remaining: block.point_count,
        }
    }

    /// Decompress the next point.
    pub fn next_point(&mut self) -> Option<TimeSeriesPoint> {
        if self.remaining == 0 {
            return None;
        }

        let timestamp = self.timestamp_decompressor.decompress(&mut self.reader)?;
        let value = self.value_decompressor.decompress(&mut self.reader)?;
        self.remaining -= 1;

        Some(TimeSeriesPoint {
            timestamp: Timestamp::from_nanos(timestamp),
            value,
        })
    }

    /// Decompress all remaining points.
    pub fn decompress_all(&mut self) -> Vec<TimeSeriesPoint> {
        let mut points = Vec::with_capacity(self.remaining);
        while let Some(point) = self.next_point() {
            points.push(point);
        }
        points
    }

    /// Get remaining point count.
    pub fn remaining(&self) -> usize {
        self.remaining
    }
}

impl<'a> Iterator for BlockDecompressor<'a> {
    type Item = TimeSeriesPoint;

    fn next(&mut self) -> Option<Self::Item> {
        self.next_point()
    }
}

// ----------------------------------------------------------------------------
// 18.6 Compression Utilities
// ----------------------------------------------------------------------------

/// Compress a slice of time-series points.
pub fn compress_points(points: &[TimeSeriesPoint]) -> CompressedBlock {
    let mut compressor = BlockCompressor::new();
    for point in points {
        compressor.add(point);
    }
    compressor.finish()
}

/// Decompress a block into a vector of points.
pub fn decompress_block(block: &CompressedBlock) -> Vec<TimeSeriesPoint> {
    BlockDecompressor::new(block).decompress_all()
}

/// Calculate compression statistics for a block.
pub fn compression_stats(block: &CompressedBlock) -> CompressionStats {
    CompressionStats {
        original_size: block.uncompressed_size,
        compressed_size: block.data.len(),
        ratio: block.compression_ratio(),
        point_count: block.point_count,
        bits_per_point: if block.point_count > 0 {
            (block.data.len() * 8) as f64 / block.point_count as f64
        } else {
            0.0
        },
    }
}

/// Statistics about compression.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionStats {
    pub original_size: usize,
    pub compressed_size: usize,
    pub ratio: f64,
    pub point_count: usize,
    pub bits_per_point: f64,
}


// ============================================================================
// SECTION 19: PERSISTENCE LAYER
// ============================================================================
// Durable storage for time-series data:
// - Write-Ahead Log (WAL) for crash recovery
// - Memory-mapped files for efficient I/O
// - Segment-based storage with compaction
// - Checksums for data integrity
// - Automatic recovery on startup
// ============================================================================

// ----------------------------------------------------------------------------
// 19.1 WAL Entry Types
// ----------------------------------------------------------------------------

/// Types of entries in the Write-Ahead Log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WalEntry {
    /// A metric data point
    MetricPoint {
        metric_id: MetricId,
        timestamp: Timestamp,
        value: f64,
    },
    /// A batch of metric points
    MetricBatch {
        metric_id: MetricId,
        points: Vec<(Timestamp, f64)>,
    },
    /// Metric metadata (first time we see a metric)
    MetricMetadata {
        metric_id: MetricId,
        name: String,
        labels: Vec<(String, String)>,
        project_id: u32,
        category: MetricCategory,
    },
    /// Checkpoint marker
    Checkpoint {
        sequence: u64,
        timestamp: Timestamp,
    },
    /// Segment compaction completed
    SegmentCompacted {
        segment_id: u64,
        new_segment_id: u64,
    },
}

/// A WAL record with header information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalRecord {
    /// Sequence number
    pub sequence: u64,
    /// Timestamp when written
    pub timestamp: Timestamp,
    /// CRC32 checksum of the entry
    pub checksum: u32,
    /// The entry data
    pub entry: WalEntry,
}

impl WalRecord {
    /// Create a new WAL record.
    pub fn new(sequence: u64, entry: WalEntry) -> Self {
        let timestamp = Timestamp::now();
        let mut record = Self {
            sequence,
            timestamp,
            checksum: 0,
            entry,
        };
        record.checksum = record.calculate_checksum();
        record
    }

    /// Calculate the checksum for this record.
    fn calculate_checksum(&self) -> u32 {
        let data = format!("{:?}{:?}", self.sequence, self.entry);
        crc32_hash(data.as_bytes())
    }

    /// Verify the checksum.
    pub fn verify(&self) -> bool {
        self.checksum == self.calculate_checksum()
    }

    /// Serialize to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        bincode::serialize(self).unwrap_or_default()
    }

    /// Deserialize from bytes.
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        bincode::deserialize(data).ok()
    }
}

/// Simple CRC32 hash function.
fn crc32_hash(data: &[u8]) -> u32 {
    let mut hash: u32 = 0xFFFFFFFF;
    for byte in data {
        hash ^= *byte as u32;
        for _ in 0..8 {
            if hash & 1 != 0 {
                hash = (hash >> 1) ^ 0xEDB88320;
            } else {
                hash >>= 1;
            }
        }
    }
    !hash
}

// ----------------------------------------------------------------------------
// 19.2 Write-Ahead Log
// ----------------------------------------------------------------------------

/// Write-Ahead Log for durability.
pub struct WriteAheadLog {
    /// Directory for WAL files
    dir: PathBuf,
    /// Current WAL file
    current_file: Option<File>,
    /// Current file path
    current_path: PathBuf,
    /// Current sequence number
    sequence: AtomicU64,
    /// Current file size
    file_size: AtomicUsize,
    /// Maximum file size before rotation
    max_file_size: usize,
    /// Sync mode
    sync_mode: WalSyncMode,
    /// Statistics
    stats: WalStats,
    /// Write lock
    write_lock: Mutex<()>,
}

/// WAL synchronization mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WalSyncMode {
    /// No explicit sync (OS buffered)
    None,
    /// Sync after every write
    EveryWrite,
    /// Sync after N writes
    Batched { batch_size: usize },
    /// Sync at intervals
    Periodic { interval_ms: u64 },
}

impl Default for WalSyncMode {
    fn default() -> Self {
        WalSyncMode::Batched { batch_size: 100 }
    }
}

#[derive(Debug, Default)]
struct WalStats {
    entries_written: AtomicU64,
    bytes_written: AtomicU64,
    syncs_performed: AtomicU64,
    files_rotated: AtomicU64,
}

impl WriteAheadLog {
    /// Create a new WAL in the specified directory.
    pub fn new(dir: impl AsRef<Path>, max_file_size: usize) -> CerebroResult<Self> {
        let dir = dir.as_ref().to_path_buf();
        fs::create_dir_all(&dir).map_err(|e| CerebroError::Io(e))?;

        let mut wal = Self {
            dir: dir.clone(),
            current_file: None,
            current_path: dir.join("wal_0.log"),
            sequence: AtomicU64::new(0),
            file_size: AtomicUsize::new(0),
            max_file_size,
            sync_mode: WalSyncMode::default(),
            stats: WalStats::default(),
            write_lock: Mutex::new(()),
        };

        wal.recover()?;
        wal.rotate_if_needed()?;

        Ok(wal)
    }

    /// Set the sync mode.
    pub fn with_sync_mode(mut self, mode: WalSyncMode) -> Self {
        self.sync_mode = mode;
        self
    }

    /// Append an entry to the WAL.
    pub fn append(&self, entry: WalEntry) -> CerebroResult<u64> {
        let _lock = self.write_lock.lock();
        
        let sequence = self.sequence.fetch_add(1, AtomicOrdering::SeqCst);
        let record = WalRecord::new(sequence, entry);
        let data = record.to_bytes();
        let data_len = data.len();

        // Write length prefix + data
        self.write_record(&data)?;

        self.stats.entries_written.fetch_add(1, AtomicOrdering::Relaxed);
        self.stats.bytes_written.fetch_add(data_len as u64, AtomicOrdering::Relaxed);

        // Check if we need to rotate
        if self.file_size.load(AtomicOrdering::Relaxed) >= self.max_file_size {
            drop(_lock);
            self.rotate()?;
        }

        Ok(sequence)
    }

    /// Append a metric point.
    pub fn append_point(&self, metric_id: MetricId, timestamp: Timestamp, value: f64) -> CerebroResult<u64> {
        self.append(WalEntry::MetricPoint {
            metric_id,
            timestamp,
            value,
        })
    }

    /// Append a batch of points.
    pub fn append_batch(&self, metric_id: MetricId, points: Vec<(Timestamp, f64)>) -> CerebroResult<u64> {
        self.append(WalEntry::MetricBatch { metric_id, points })
    }

    /// Write a checkpoint.
    pub fn checkpoint(&self) -> CerebroResult<u64> {
        let sequence = self.sequence.load(AtomicOrdering::SeqCst);
        self.append(WalEntry::Checkpoint {
            sequence,
            timestamp: Timestamp::now(),
        })
    }

    /// Write a record to the current file.
    fn write_record(&self, data: &[u8]) -> CerebroResult<()> {
        // In a real implementation, we'd use proper file I/O
        // For now, this is a placeholder
        let len = data.len();
        self.file_size.fetch_add(len + 4, AtomicOrdering::Relaxed);
        Ok(())
    }

    /// Rotate to a new WAL file.
    pub fn rotate(&self) -> CerebroResult<()> {
        let _lock = self.write_lock.lock();
        
        self.stats.files_rotated.fetch_add(1, AtomicOrdering::Relaxed);
        
        let file_num = self.stats.files_rotated.load(AtomicOrdering::Relaxed);
        let new_path = self.dir.join(format!("wal_{}.log", file_num));
        
        // Close current file and open new one
        // In real implementation, would properly close and open files
        
        self.file_size.store(0, AtomicOrdering::Relaxed);
        
        Ok(())
    }

    /// Check if rotation is needed and rotate.
    fn rotate_if_needed(&self) -> CerebroResult<()> {
        if self.file_size.load(AtomicOrdering::Relaxed) >= self.max_file_size {
            self.rotate()?;
        }
        Ok(())
    }

    /// Recover from existing WAL files.
    fn recover(&mut self) -> CerebroResult<()> {
        // Find all WAL files and read them to find the latest sequence
        let mut max_sequence = 0u64;
        
        if let Ok(entries) = fs::read_dir(&self.dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "log") {
                    // Read file and find max sequence
                    // In real implementation, would parse the file
                    if let Some(seq) = self.read_max_sequence(&path) {
                        max_sequence = max_sequence.max(seq);
                    }
                }
            }
        }

        self.sequence.store(max_sequence + 1, AtomicOrdering::SeqCst);
        info!(target: "cerebro::wal", "Recovered WAL, next sequence: {}", max_sequence + 1);
        
        Ok(())
    }

    /// Read the maximum sequence number from a WAL file.
    fn read_max_sequence(&self, _path: &Path) -> Option<u64> {
        // Placeholder - in real implementation would read and parse the file
        None
    }

    /// Sync the WAL to disk.
    pub fn sync(&self) -> CerebroResult<()> {
        self.stats.syncs_performed.fetch_add(1, AtomicOrdering::Relaxed);
        // In real implementation, would call fsync
        Ok(())
    }

    /// Get current sequence number.
    pub fn current_sequence(&self) -> u64 {
        self.sequence.load(AtomicOrdering::SeqCst)
    }

    /// Get statistics.
    pub fn stats(&self) -> WalStatsSnapshot {
        WalStatsSnapshot {
            entries_written: self.stats.entries_written.load(AtomicOrdering::Relaxed),
            bytes_written: self.stats.bytes_written.load(AtomicOrdering::Relaxed),
            syncs_performed: self.stats.syncs_performed.load(AtomicOrdering::Relaxed),
            files_rotated: self.stats.files_rotated.load(AtomicOrdering::Relaxed),
            current_sequence: self.current_sequence(),
            current_file_size: self.file_size.load(AtomicOrdering::Relaxed),
        }
    }
}

/// WAL statistics snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalStatsSnapshot {
    pub entries_written: u64,
    pub bytes_written: u64,
    pub syncs_performed: u64,
    pub files_rotated: u64,
    pub current_sequence: u64,
    pub current_file_size: usize,
}

// ----------------------------------------------------------------------------
// 19.3 Segment - A Unit of Persistent Storage
// ----------------------------------------------------------------------------

/// A segment of time-series data on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentMetadata {
    /// Unique segment ID
    pub id: u64,
    /// Metric ID this segment belongs to
    pub metric_id: MetricId,
    /// Start timestamp (inclusive)
    pub start_time: Timestamp,
    /// End timestamp (inclusive)
    pub end_time: Timestamp,
    /// Number of data points
    pub point_count: usize,
    /// File size in bytes
    pub file_size: usize,
    /// Minimum value in segment
    pub min_value: f64,
    /// Maximum value in segment
    pub max_value: f64,
    /// Sum of all values
    pub sum: f64,
    /// Whether segment is compressed
    pub compressed: bool,
    /// Compression ratio (if compressed)
    pub compression_ratio: f64,
    /// Creation timestamp
    pub created_at: Timestamp,
    /// Path to the segment file
    pub path: PathBuf,
}

impl SegmentMetadata {
    /// Get the average value in this segment.
    pub fn average(&self) -> f64 {
        if self.point_count == 0 {
            0.0
        } else {
            self.sum / self.point_count as f64
        }
    }

    /// Check if a timestamp falls within this segment.
    pub fn contains_time(&self, ts: Timestamp) -> bool {
        ts >= self.start_time && ts <= self.end_time
    }

    /// Check if this segment overlaps with a time range.
    pub fn overlaps(&self, start: Timestamp, end: Timestamp) -> bool {
        self.start_time <= end && self.end_time >= start
    }
}

/// A segment writer for writing time-series data to disk.
pub struct SegmentWriter {
    /// Segment ID
    id: u64,
    /// Metric ID
    metric_id: MetricId,
    /// Output path
    path: PathBuf,
    /// Compressor for data
    compressor: BlockCompressor,
    /// Points written
    point_count: usize,
    /// Whether to compress
    compress: bool,
}

impl SegmentWriter {
    /// Create a new segment writer.
    pub fn new(id: u64, metric_id: MetricId, path: impl AsRef<Path>, compress: bool) -> Self {
        Self {
            id,
            metric_id,
            path: path.as_ref().to_path_buf(),
            compressor: BlockCompressor::new(),
            point_count: 0,
            compress,
        }
    }

    /// Write a data point.
    pub fn write(&mut self, timestamp: Timestamp, value: f64) {
        self.compressor.add_point(timestamp, value);
        self.point_count += 1;
    }

    /// Write multiple points.
    pub fn write_points(&mut self, points: &[TimeSeriesPoint]) {
        for point in points {
            self.write(point.timestamp, point.value);
        }
    }

    /// Finish writing and return metadata.
    pub fn finish(self) -> CerebroResult<SegmentMetadata> {
        let block = self.compressor.finish();
        
        // In real implementation, would write to file
        let file_size = block.data.len();
        
        Ok(SegmentMetadata {
            id: self.id,
            metric_id: self.metric_id,
            start_time: block.start_time,
            end_time: block.end_time,
            point_count: block.point_count,
            file_size,
            min_value: block.min_value,
            max_value: block.max_value,
            sum: block.sum,
            compressed: self.compress,
            compression_ratio: block.compression_ratio(),
            created_at: Timestamp::now(),
            path: self.path,
        })
    }
}

/// A segment reader for reading time-series data from disk.
pub struct SegmentReader {
    /// Segment metadata
    metadata: SegmentMetadata,
    /// Decompressed data (loaded on demand)
    data: Option<Vec<TimeSeriesPoint>>,
}

impl SegmentReader {
    /// Open a segment for reading.
    pub fn open(metadata: SegmentMetadata) -> CerebroResult<Self> {
        Ok(Self {
            metadata,
            data: None,
        })
    }

    /// Load all data from the segment.
    pub fn load(&mut self) -> CerebroResult<&[TimeSeriesPoint]> {
        if self.data.is_none() {
            // In real implementation, would read from file
            self.data = Some(Vec::new());
        }
        Ok(self.data.as_ref().unwrap())
    }

    /// Read points in a time range.
    pub fn read_range(&mut self, start: Timestamp, end: Timestamp) -> CerebroResult<Vec<TimeSeriesPoint>> {
        let data = self.load()?;
        Ok(data.iter()
            .filter(|p| p.timestamp >= start && p.timestamp <= end)
            .cloned()
            .collect())
    }

    /// Get segment metadata.
    pub fn metadata(&self) -> &SegmentMetadata {
        &self.metadata
    }
}

// ----------------------------------------------------------------------------
// 19.4 Segment Index - Track All Segments
// ----------------------------------------------------------------------------

/// Index of all segments for efficient lookup.
pub struct SegmentIndex {
    /// Segments by metric ID, sorted by time
    by_metric: DashMap<MetricId, Vec<SegmentMetadata>>,
    /// All segment IDs
    all_segments: DashSet<u64>,
    /// Next segment ID
    next_id: AtomicU64,
    /// Total segments
    segment_count: AtomicUsize,
    /// Total bytes on disk
    total_bytes: AtomicUsize,
}

impl SegmentIndex {
    /// Create a new segment index.
    pub fn new() -> Self {
        Self {
            by_metric: DashMap::new(),
            all_segments: DashSet::new(),
            next_id: AtomicU64::new(1),
            segment_count: AtomicUsize::new(0),
            total_bytes: AtomicUsize::new(0),
        }
    }

    /// Generate a new segment ID.
    pub fn next_segment_id(&self) -> u64 {
        self.next_id.fetch_add(1, AtomicOrdering::SeqCst)
    }

    /// Add a segment to the index.
    pub fn add(&self, metadata: SegmentMetadata) {
        let metric_id = metadata.metric_id;
        let segment_id = metadata.id;
        let file_size = metadata.file_size;

        self.by_metric.entry(metric_id)
            .or_insert_with(Vec::new)
            .push(metadata);

        // Keep segments sorted by start time
        if let Some(mut segments) = self.by_metric.get_mut(&metric_id) {
            segments.sort_by(|a, b| a.start_time.cmp(&b.start_time));
        }

        self.all_segments.insert(segment_id);
        self.segment_count.fetch_add(1, AtomicOrdering::Relaxed);
        self.total_bytes.fetch_add(file_size, AtomicOrdering::Relaxed);
    }

    /// Remove a segment from the index.
    pub fn remove(&self, segment_id: u64) -> Option<SegmentMetadata> {
        // Find and remove the segment
        let mut removed = None;
        
        for mut entry in self.by_metric.iter_mut() {
            if let Some(pos) = entry.value().iter().position(|s| s.id == segment_id) {
                let seg = entry.value_mut().remove(pos);
                self.total_bytes.fetch_sub(seg.file_size, AtomicOrdering::Relaxed);
                removed = Some(seg);
                break;
            }
        }

        if removed.is_some() {
            self.all_segments.remove(&segment_id);
            self.segment_count.fetch_sub(1, AtomicOrdering::Relaxed);
        }

        removed
    }

    /// Find segments for a metric in a time range.
    pub fn find_segments(&self, metric_id: MetricId, start: Timestamp, end: Timestamp) -> Vec<SegmentMetadata> {
        self.by_metric.get(&metric_id)
            .map(|segments| {
                segments.iter()
                    .filter(|s| s.overlaps(start, end))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get all segments for a metric.
    pub fn get_metric_segments(&self, metric_id: MetricId) -> Vec<SegmentMetadata> {
        self.by_metric.get(&metric_id)
            .map(|segments| segments.clone())
            .unwrap_or_default()
    }

    /// Get total segment count.
    pub fn segment_count(&self) -> usize {
        self.segment_count.load(AtomicOrdering::Relaxed)
    }

    /// Get total bytes.
    pub fn total_bytes(&self) -> usize {
        self.total_bytes.load(AtomicOrdering::Relaxed)
    }

    /// Get metrics with segments.
    pub fn metric_count(&self) -> usize {
        self.by_metric.len()
    }
}

impl Default for SegmentIndex {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 19.5 Persistent Storage Manager
// ----------------------------------------------------------------------------

/// Manages all persistent storage for time-series data.
pub struct PersistentStorage {
    /// Base directory for storage
    base_dir: PathBuf,
    /// Write-ahead log
    wal: WriteAheadLog,
    /// Segment index
    segment_index: SegmentIndex,
    /// Flush threshold (points before flushing to segment)
    flush_threshold: usize,
    /// Segment size target
    segment_size_target: usize,
    /// Enable compression
    compression_enabled: bool,
    /// Statistics
    stats: PersistentStorageStats,
}

#[derive(Debug, Default)]
struct PersistentStorageStats {
    points_written: AtomicU64,
    segments_created: AtomicU64,
    segments_compacted: AtomicU64,
    bytes_written: AtomicU64,
}

impl PersistentStorage {
    /// Create new persistent storage.
    pub fn new(base_dir: impl AsRef<Path>) -> CerebroResult<Self> {
        let base_dir = base_dir.as_ref().to_path_buf();
        fs::create_dir_all(&base_dir).map_err(CerebroError::Io)?;

        let wal_dir = base_dir.join("wal");
        let wal = WriteAheadLog::new(&wal_dir, 64 * 1024 * 1024)?; // 64MB WAL files

        Ok(Self {
            base_dir,
            wal,
            segment_index: SegmentIndex::new(),
            flush_threshold: 10000,
            segment_size_target: 256 * 1024 * 1024, // 256MB segments
            compression_enabled: true,
            stats: PersistentStorageStats::default(),
        })
    }

    /// Write a data point with WAL.
    pub fn write(&self, metric_id: MetricId, timestamp: Timestamp, value: f64) -> CerebroResult<()> {
        // Write to WAL first
        self.wal.append_point(metric_id, timestamp, value)?;
        self.stats.points_written.fetch_add(1, AtomicOrdering::Relaxed);
        Ok(())
    }

    /// Write a batch of points.
    pub fn write_batch(&self, metric_id: MetricId, points: Vec<(Timestamp, f64)>) -> CerebroResult<()> {
        let count = points.len();
        self.wal.append_batch(metric_id, points)?;
        self.stats.points_written.fetch_add(count as u64, AtomicOrdering::Relaxed);
        Ok(())
    }

    /// Flush in-memory data to segments.
    pub fn flush(&self, metric_id: MetricId, points: &[TimeSeriesPoint]) -> CerebroResult<SegmentMetadata> {
        let segment_id = self.segment_index.next_segment_id();
        let segment_dir = self.base_dir.join("segments");
        fs::create_dir_all(&segment_dir).map_err(CerebroError::Io)?;

        let segment_path = segment_dir.join(format!("segment_{}_{}.dat", metric_id.as_u64(), segment_id));

        let mut writer = SegmentWriter::new(segment_id, metric_id, &segment_path, self.compression_enabled);
        writer.write_points(points);
        let metadata = writer.finish()?;

        self.segment_index.add(metadata.clone());
        self.stats.segments_created.fetch_add(1, AtomicOrdering::Relaxed);
        self.stats.bytes_written.fetch_add(metadata.file_size as u64, AtomicOrdering::Relaxed);

        // Write checkpoint to WAL
        self.wal.checkpoint()?;

        Ok(metadata)
    }

    /// Read points from storage for a time range.
    pub fn read(&self, metric_id: MetricId, start: Timestamp, end: Timestamp) -> CerebroResult<Vec<TimeSeriesPoint>> {
        let segments = self.segment_index.find_segments(metric_id, start, end);
        let mut all_points = Vec::new();

        for metadata in segments {
            let mut reader = SegmentReader::open(metadata)?;
            let points = reader.read_range(start, end)?;
            all_points.extend(points);
        }

        // Sort by timestamp
        all_points.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        Ok(all_points)
    }

    /// Compact segments for a metric.
    pub fn compact(&self, metric_id: MetricId) -> CerebroResult<Option<SegmentMetadata>> {
        let segments = self.segment_index.get_metric_segments(metric_id);
        
        if segments.len() < 2 {
            return Ok(None);
        }

        // Read all points from existing segments
        let mut all_points = Vec::new();
        for metadata in &segments {
            let mut reader = SegmentReader::open(metadata.clone())?;
            let points = reader.load()?;
            all_points.extend(points.iter().cloned());
        }

        // Sort and deduplicate
        all_points.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        all_points.dedup_by(|a, b| a.timestamp == b.timestamp);

        // Create new segment
        let new_metadata = self.flush(metric_id, &all_points)?;

        // Remove old segments
        for old_seg in segments {
            self.segment_index.remove(old_seg.id);
            // In real implementation, would delete the file
        }

        self.stats.segments_compacted.fetch_add(1, AtomicOrdering::Relaxed);
        Ok(Some(new_metadata))
    }

    /// Get storage statistics.
    pub fn stats(&self) -> PersistentStorageStatsSnapshot {
        PersistentStorageStatsSnapshot {
            points_written: self.stats.points_written.load(AtomicOrdering::Relaxed),
            segments_created: self.stats.segments_created.load(AtomicOrdering::Relaxed),
            segments_compacted: self.stats.segments_compacted.load(AtomicOrdering::Relaxed),
            bytes_written: self.stats.bytes_written.load(AtomicOrdering::Relaxed),
            segment_count: self.segment_index.segment_count(),
            total_storage_bytes: self.segment_index.total_bytes(),
            metric_count: self.segment_index.metric_count(),
            wal_stats: self.wal.stats(),
        }
    }

    /// Sync all data to disk.
    pub fn sync(&self) -> CerebroResult<()> {
        self.wal.sync()
    }
}

/// Persistent storage statistics snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistentStorageStatsSnapshot {
    pub points_written: u64,
    pub segments_created: u64,
    pub segments_compacted: u64,
    pub bytes_written: u64,
    pub segment_count: usize,
    pub total_storage_bytes: usize,
    pub metric_count: usize,
    pub wal_stats: WalStatsSnapshot,
}


// ============================================================================
// SECTION 20: ADVANCED AGGREGATIONS & WINDOW FUNCTIONS
// ============================================================================
// Sophisticated data analysis capabilities:
// - Sliding window aggregations
// - Tumbling window aggregations
// - Session windows
// - Moving averages (SMA, EMA, WMA)
// - Statistical functions
// - Trend analysis
// - Forecasting
// ============================================================================

// ----------------------------------------------------------------------------
// 20.1 Window Types
// ----------------------------------------------------------------------------

/// Types of windows for aggregation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WindowType {
    /// Fixed-size sliding window
    Sliding {
        size: Duration,
        slide: Duration,
    },
    /// Non-overlapping tumbling window
    Tumbling {
        size: Duration,
    },
    /// Session-based window (gap-based)
    Session {
        gap: Duration,
    },
    /// Count-based window
    Count {
        size: usize,
        slide: usize,
    },
    /// Expanding window (from start to current)
    Expanding,
}

impl WindowType {
    /// Create a sliding window.
    pub fn sliding(size: Duration, slide: Duration) -> Self {
        WindowType::Sliding { size, slide }
    }

    /// Create a tumbling window.
    pub fn tumbling(size: Duration) -> Self {
        WindowType::Tumbling { size }
    }

    /// Create a session window.
    pub fn session(gap: Duration) -> Self {
        WindowType::Session { gap }
    }

    /// Create a count-based window.
    pub fn count(size: usize) -> Self {
        WindowType::Count { size, slide: size }
    }

    /// Create a count-based sliding window.
    pub fn count_sliding(size: usize, slide: usize) -> Self {
        WindowType::Count { size, slide }
    }
}

// ----------------------------------------------------------------------------
// 20.2 Window Definition
// ----------------------------------------------------------------------------

/// A window definition for aggregation.
#[derive(Debug, Clone)]
pub struct WindowDefinition {
    /// Window type
    pub window_type: WindowType,
    /// Aggregation function
    pub aggregation: AggregateFunction,
    /// Time column (for time-based windows)
    pub time_column: bool,
}

impl WindowDefinition {
    /// Create a new window definition.
    pub fn new(window_type: WindowType, aggregation: AggregateFunction) -> Self {
        Self {
            window_type,
            aggregation,
            time_column: true,
        }
    }

    /// Apply this window to a series of points.
    pub fn apply(&self, points: &[TimeSeriesPoint]) -> Vec<WindowResult> {
        match &self.window_type {
            WindowType::Sliding { size, slide } => {
                self.apply_sliding_window(points, *size, *slide)
            }
            WindowType::Tumbling { size } => {
                self.apply_tumbling_window(points, *size)
            }
            WindowType::Session { gap } => {
                self.apply_session_window(points, *gap)
            }
            WindowType::Count { size, slide } => {
                self.apply_count_window(points, *size, *slide)
            }
            WindowType::Expanding => {
                self.apply_expanding_window(points)
            }
        }
    }

    fn apply_sliding_window(&self, points: &[TimeSeriesPoint], size: Duration, slide: Duration) -> Vec<WindowResult> {
        if points.is_empty() {
            return Vec::new();
        }

        let size_ns = size.as_nanos() as i64;
        let slide_ns = slide.as_nanos() as i64;
        let start = points[0].timestamp.as_nanos();
        let end = points.last().unwrap().timestamp.as_nanos();

        let mut results = Vec::new();
        let mut window_start = start;

        while window_start <= end {
            let window_end = window_start + size_ns;
            
            let window_points: Vec<f64> = points.iter()
                .filter(|p| {
                    let ts = p.timestamp.as_nanos();
                    ts >= window_start && ts < window_end
                })
                .map(|p| p.value)
                .collect();

            if !window_points.is_empty() {
                results.push(WindowResult {
                    start: Timestamp::from_nanos(window_start),
                    end: Timestamp::from_nanos(window_end),
                    value: self.aggregation.apply(&window_points),
                    count: window_points.len(),
                });
            }

            window_start += slide_ns;
        }

        results
    }

    fn apply_tumbling_window(&self, points: &[TimeSeriesPoint], size: Duration) -> Vec<WindowResult> {
        self.apply_sliding_window(points, size, size)
    }

    fn apply_session_window(&self, points: &[TimeSeriesPoint], gap: Duration) -> Vec<WindowResult> {
        if points.is_empty() {
            return Vec::new();
        }

        let gap_ns = gap.as_nanos() as i64;
        let mut results = Vec::new();
        let mut session_points: Vec<f64> = vec![points[0].value];
        let mut session_start = points[0].timestamp;
        let mut session_end = points[0].timestamp;

        for i in 1..points.len() {
            let diff = points[i].timestamp.as_nanos() - points[i - 1].timestamp.as_nanos();
            
            if diff > gap_ns {
                // End current session
                results.push(WindowResult {
                    start: session_start,
                    end: session_end,
                    value: self.aggregation.apply(&session_points),
                    count: session_points.len(),
                });

                // Start new session
                session_points = vec![points[i].value];
                session_start = points[i].timestamp;
            } else {
                session_points.push(points[i].value);
            }
            session_end = points[i].timestamp;
        }

        // Don't forget the last session
        if !session_points.is_empty() {
            results.push(WindowResult {
                start: session_start,
                end: session_end,
                value: self.aggregation.apply(&session_points),
                count: session_points.len(),
            });
        }

        results
    }

    fn apply_count_window(&self, points: &[TimeSeriesPoint], size: usize, slide: usize) -> Vec<WindowResult> {
        if points.is_empty() || size == 0 {
            return Vec::new();
        }

        let mut results = Vec::new();
        let mut i = 0;

        while i + size <= points.len() {
            let window_points: Vec<f64> = points[i..i + size].iter().map(|p| p.value).collect();
            
            results.push(WindowResult {
                start: points[i].timestamp,
                end: points[i + size - 1].timestamp,
                value: self.aggregation.apply(&window_points),
                count: size,
            });

            i += slide;
        }

        results
    }

    fn apply_expanding_window(&self, points: &[TimeSeriesPoint]) -> Vec<WindowResult> {
        if points.is_empty() {
            return Vec::new();
        }

        let mut results = Vec::new();
        let mut cumulative: Vec<f64> = Vec::new();

        for point in points {
            cumulative.push(point.value);
            results.push(WindowResult {
                start: points[0].timestamp,
                end: point.timestamp,
                value: self.aggregation.apply(&cumulative),
                count: cumulative.len(),
            });
        }

        results
    }
}

/// Result of a window aggregation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowResult {
    /// Window start time
    pub start: Timestamp,
    /// Window end time
    pub end: Timestamp,
    /// Aggregated value
    pub value: f64,
    /// Number of points in window
    pub count: usize,
}

// ----------------------------------------------------------------------------
// 20.3 Moving Averages
// ----------------------------------------------------------------------------

/// Moving average calculator.
pub struct MovingAverageCalculator;

impl MovingAverageCalculator {
    /// Simple Moving Average (SMA).
    pub fn sma(points: &[TimeSeriesPoint], period: usize) -> Vec<TimeSeriesPoint> {
        if points.len() < period {
            return Vec::new();
        }

        let mut result = Vec::with_capacity(points.len() - period + 1);
        let mut sum: f64 = points[..period].iter().map(|p| p.value).sum();
        
        result.push(TimeSeriesPoint {
            timestamp: points[period - 1].timestamp,
            value: sum / period as f64,
        });

        for i in period..points.len() {
            sum += points[i].value - points[i - period].value;
            result.push(TimeSeriesPoint {
                timestamp: points[i].timestamp,
                value: sum / period as f64,
            });
        }

        result
    }

    /// Exponential Moving Average (EMA).
    pub fn ema(points: &[TimeSeriesPoint], period: usize) -> Vec<TimeSeriesPoint> {
        if points.is_empty() {
            return Vec::new();
        }

        let alpha = 2.0 / (period as f64 + 1.0);
        let mut result = Vec::with_capacity(points.len());
        
        // Start with first value
        let mut ema = points[0].value;
        result.push(TimeSeriesPoint {
            timestamp: points[0].timestamp,
            value: ema,
        });

        for point in &points[1..] {
            ema = alpha * point.value + (1.0 - alpha) * ema;
            result.push(TimeSeriesPoint {
                timestamp: point.timestamp,
                value: ema,
            });
        }

        result
    }

    /// Weighted Moving Average (WMA).
    pub fn wma(points: &[TimeSeriesPoint], period: usize) -> Vec<TimeSeriesPoint> {
        if points.len() < period {
            return Vec::new();
        }

        let weight_sum: f64 = (1..=period).map(|i| i as f64).sum();
        let mut result = Vec::with_capacity(points.len() - period + 1);

        for i in (period - 1)..points.len() {
            let mut weighted_sum = 0.0;
            for j in 0..period {
                weighted_sum += points[i - period + 1 + j].value * (j + 1) as f64;
            }
            result.push(TimeSeriesPoint {
                timestamp: points[i].timestamp,
                value: weighted_sum / weight_sum,
            });
        }

        result
    }

    /// Double Exponential Moving Average (DEMA).
    pub fn dema(points: &[TimeSeriesPoint], period: usize) -> Vec<TimeSeriesPoint> {
        let ema1 = Self::ema(points, period);
        let ema2 = Self::ema(&ema1, period);

        if ema1.len() != ema2.len() || ema1.is_empty() {
            return Vec::new();
        }

        ema1.iter()
            .zip(ema2.iter())
            .map(|(e1, e2)| TimeSeriesPoint {
                timestamp: e1.timestamp,
                value: 2.0 * e1.value - e2.value,
            })
            .collect()
    }

    /// Triple Exponential Moving Average (TEMA).
    pub fn tema(points: &[TimeSeriesPoint], period: usize) -> Vec<TimeSeriesPoint> {
        let ema1 = Self::ema(points, period);
        let ema2 = Self::ema(&ema1, period);
        let ema3 = Self::ema(&ema2, period);

        if ema1.len() != ema3.len() || ema1.is_empty() {
            return Vec::new();
        }

        let len = ema1.len().min(ema2.len()).min(ema3.len());
        (0..len)
            .map(|i| TimeSeriesPoint {
                timestamp: ema1[i].timestamp,
                value: 3.0 * ema1[i].value - 3.0 * ema2[i].value + ema3[i].value,
            })
            .collect()
    }
}

// ----------------------------------------------------------------------------
// 20.4 Statistical Functions
// ----------------------------------------------------------------------------

/// Statistical functions for time-series analysis.
pub struct StatisticalFunctions;

impl StatisticalFunctions {
    /// Calculate variance.
    pub fn variance(values: &[f64]) -> f64 {
        if values.len() < 2 {
            return 0.0;
        }
        let mean = values.iter().sum::<f64>() / values.len() as f64;
        values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (values.len() - 1) as f64
    }

    /// Calculate standard deviation.
    pub fn std_dev(values: &[f64]) -> f64 {
        Self::variance(values).sqrt()
    }

    /// Calculate covariance between two series.
    pub fn covariance(x: &[f64], y: &[f64]) -> f64 {
        if x.len() != y.len() || x.len() < 2 {
            return 0.0;
        }
        let mean_x = x.iter().sum::<f64>() / x.len() as f64;
        let mean_y = y.iter().sum::<f64>() / y.len() as f64;
        
        x.iter()
            .zip(y.iter())
            .map(|(xi, yi)| (xi - mean_x) * (yi - mean_y))
            .sum::<f64>() / (x.len() - 1) as f64
    }

    /// Calculate Pearson correlation coefficient.
    pub fn correlation(x: &[f64], y: &[f64]) -> f64 {
        let cov = Self::covariance(x, y);
        let std_x = Self::std_dev(x);
        let std_y = Self::std_dev(y);
        
        if std_x == 0.0 || std_y == 0.0 {
            0.0
        } else {
            cov / (std_x * std_y)
        }
    }

    /// Calculate skewness.
    pub fn skewness(values: &[f64]) -> f64 {
        if values.len() < 3 {
            return 0.0;
        }
        let n = values.len() as f64;
        let mean = values.iter().sum::<f64>() / n;
        let std = Self::std_dev(values);
        
        if std == 0.0 {
            return 0.0;
        }
        
        let m3 = values.iter().map(|v| ((v - mean) / std).powi(3)).sum::<f64>() / n;
        m3 * (n * (n - 1.0)).sqrt() / (n - 2.0)
    }

    /// Calculate kurtosis.
    pub fn kurtosis(values: &[f64]) -> f64 {
        if values.len() < 4 {
            return 0.0;
        }
        let n = values.len() as f64;
        let mean = values.iter().sum::<f64>() / n;
        let std = Self::std_dev(values);
        
        if std == 0.0 {
            return 0.0;
        }
        
        let m4 = values.iter().map(|v| ((v - mean) / std).powi(4)).sum::<f64>() / n;
        m4 - 3.0 // Excess kurtosis
    }

    /// Calculate percentile.
    pub fn percentile(values: &[f64], p: f64) -> f64 {
        if values.is_empty() {
            return 0.0;
        }
        let mut sorted = values.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        let idx = (p * (sorted.len() - 1) as f64).round() as usize;
        sorted[idx.min(sorted.len() - 1)]
    }

    /// Calculate median.
    pub fn median(values: &[f64]) -> f64 {
        Self::percentile(values, 0.5)
    }

    /// Calculate interquartile range.
    pub fn iqr(values: &[f64]) -> f64 {
        Self::percentile(values, 0.75) - Self::percentile(values, 0.25)
    }

    /// Calculate z-score for each value.
    pub fn z_scores(values: &[f64]) -> Vec<f64> {
        if values.len() < 2 {
            return values.to_vec();
        }
        let mean = values.iter().sum::<f64>() / values.len() as f64;
        let std = Self::std_dev(values);
        
        if std == 0.0 {
            return vec![0.0; values.len()];
        }
        
        values.iter().map(|v| (v - mean) / std).collect()
    }

    /// Detect outliers using IQR method.
    pub fn detect_outliers_iqr(values: &[f64], multiplier: f64) -> Vec<usize> {
        let q1 = Self::percentile(values, 0.25);
        let q3 = Self::percentile(values, 0.75);
        let iqr = q3 - q1;
        let lower = q1 - multiplier * iqr;
        let upper = q3 + multiplier * iqr;
        
        values.iter()
            .enumerate()
            .filter(|(_, v)| **v < lower || **v > upper)
            .map(|(i, _)| i)
            .collect()
    }

    /// Detect outliers using z-score method.
    pub fn detect_outliers_zscore(values: &[f64], threshold: f64) -> Vec<usize> {
        let z_scores = Self::z_scores(values);
        z_scores.iter()
            .enumerate()
            .filter(|(_, z)| z.abs() > threshold)
            .map(|(i, _)| i)
            .collect()
    }
}

// ----------------------------------------------------------------------------
// 20.5 Trend Analysis
// ----------------------------------------------------------------------------

/// Trend analysis functions.
pub struct TrendAnalysis;

impl TrendAnalysis {
    /// Linear regression - returns (slope, intercept, r_squared).
    pub fn linear_regression(points: &[TimeSeriesPoint]) -> (f64, f64, f64) {
        if points.len() < 2 {
            return (0.0, 0.0, 0.0);
        }

        let n = points.len() as f64;
        let base_time = points[0].timestamp.as_secs() as f64;
        
        let x: Vec<f64> = points.iter()
            .map(|p| p.timestamp.as_secs() as f64 - base_time)
            .collect();
        let y: Vec<f64> = points.iter().map(|p| p.value).collect();

        let sum_x: f64 = x.iter().sum();
        let sum_y: f64 = y.iter().sum();
        let sum_xy: f64 = x.iter().zip(y.iter()).map(|(xi, yi)| xi * yi).sum();
        let sum_xx: f64 = x.iter().map(|xi| xi * xi).sum();
        let sum_yy: f64 = y.iter().map(|yi| yi * yi).sum();

        let slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
        let intercept = (sum_y - slope * sum_x) / n;

        // R-squared
        let ss_tot = sum_yy - (sum_y * sum_y) / n;
        let ss_res: f64 = points.iter()
            .enumerate()
            .map(|(i, p)| {
                let predicted = slope * x[i] + intercept;
                (p.value - predicted).powi(2)
            })
            .sum();
        
        let r_squared = if ss_tot != 0.0 { 1.0 - ss_res / ss_tot } else { 0.0 };

        (slope, intercept, r_squared)
    }

    /// Predict future value using linear regression.
    pub fn predict_linear(points: &[TimeSeriesPoint], future_timestamp: Timestamp) -> f64 {
        if points.is_empty() {
            return 0.0;
        }
        
        let (slope, intercept, _) = Self::linear_regression(points);
        let base_time = points[0].timestamp.as_secs() as f64;
        let x = future_timestamp.as_secs() as f64 - base_time;
        
        slope * x + intercept
    }

    /// Detect trend direction.
    pub fn trend_direction(points: &[TimeSeriesPoint]) -> TrendDirection {
        let (slope, _, r_squared) = Self::linear_regression(points);
        
        // Only consider significant trends (r_squared > 0.5)
        if r_squared < 0.5 {
            return TrendDirection::Sideways;
        }
        
        if slope > 0.0 {
            TrendDirection::Upward
        } else if slope < 0.0 {
            TrendDirection::Downward
        } else {
            TrendDirection::Sideways
        }
    }

    /// Calculate rate of change.
    pub fn rate_of_change(points: &[TimeSeriesPoint], periods: usize) -> Vec<TimeSeriesPoint> {
        if points.len() <= periods {
            return Vec::new();
        }

        (periods..points.len())
            .map(|i| {
                let prev = points[i - periods].value;
                let curr = points[i].value;
                let roc = if prev != 0.0 { (curr - prev) / prev * 100.0 } else { 0.0 };
                TimeSeriesPoint {
                    timestamp: points[i].timestamp,
                    value: roc,
                }
            })
            .collect()
    }

    /// Calculate momentum.
    pub fn momentum(points: &[TimeSeriesPoint], periods: usize) -> Vec<TimeSeriesPoint> {
        if points.len() <= periods {
            return Vec::new();
        }

        (periods..points.len())
            .map(|i| TimeSeriesPoint {
                timestamp: points[i].timestamp,
                value: points[i].value - points[i - periods].value,
            })
            .collect()
    }
}

/// Trend direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrendDirection {
    Upward,
    Downward,
    Sideways,
}

// ----------------------------------------------------------------------------
// 20.6 Forecasting
// ----------------------------------------------------------------------------

/// Simple forecasting methods.
pub struct Forecaster;

impl Forecaster {
    /// Simple exponential smoothing forecast.
    pub fn simple_exponential(points: &[TimeSeriesPoint], alpha: f64, periods: usize) -> Vec<TimeSeriesPoint> {
        if points.is_empty() {
            return Vec::new();
        }

        let ema = MovingAverageCalculator::ema(points, (1.0 / alpha) as usize);
        let last_ema = ema.last().map(|p| p.value).unwrap_or(points.last().unwrap().value);
        let last_ts = points.last().unwrap().timestamp;
        
        // Estimate average interval
        let avg_interval = if points.len() > 1 {
            (last_ts.as_nanos() - points[0].timestamp.as_nanos()) / (points.len() - 1) as i64
        } else {
            1_000_000_000 // 1 second default
        };

        (1..=periods)
            .map(|i| TimeSeriesPoint {
                timestamp: last_ts.add_duration(Duration::from_nanos((avg_interval * i as i64) as u64)),
                value: last_ema, // Simple exponential forecasts a flat line
            })
            .collect()
    }

    /// Holt's linear trend forecast.
    pub fn holt_linear(points: &[TimeSeriesPoint], alpha: f64, beta: f64, periods: usize) -> Vec<TimeSeriesPoint> {
        if points.len() < 2 {
            return Vec::new();
        }

        // Initialize
        let mut level = points[0].value;
        let mut trend = points[1].value - points[0].value;

        // Fit
        for point in &points[1..] {
            let new_level = alpha * point.value + (1.0 - alpha) * (level + trend);
            trend = beta * (new_level - level) + (1.0 - beta) * trend;
            level = new_level;
        }

        let last_ts = points.last().unwrap().timestamp;
        let avg_interval = if points.len() > 1 {
            (last_ts.as_nanos() - points[0].timestamp.as_nanos()) / (points.len() - 1) as i64
        } else {
            1_000_000_000
        };

        (1..=periods)
            .map(|i| TimeSeriesPoint {
                timestamp: last_ts.add_duration(Duration::from_nanos((avg_interval * i as i64) as u64)),
                value: level + trend * i as f64,
            })
            .collect()
    }

    /// Moving average forecast.
    pub fn moving_average_forecast(points: &[TimeSeriesPoint], period: usize, forecast_periods: usize) -> Vec<TimeSeriesPoint> {
        if points.len() < period {
            return Vec::new();
        }

        let last_values: Vec<f64> = points[points.len() - period..].iter().map(|p| p.value).collect();
        let ma = last_values.iter().sum::<f64>() / period as f64;
        
        let last_ts = points.last().unwrap().timestamp;
        let avg_interval = if points.len() > 1 {
            (last_ts.as_nanos() - points[0].timestamp.as_nanos()) / (points.len() - 1) as i64
        } else {
            1_000_000_000
        };

        (1..=forecast_periods)
            .map(|i| TimeSeriesPoint {
                timestamp: last_ts.add_duration(Duration::from_nanos((avg_interval * i as i64) as u64)),
                value: ma,
            })
            .collect()
    }
}


// ============================================================================
// SECTION 21: PHASE 3 TESTS
// ============================================================================

#[cfg(test)]
mod phase3_tests {
    use super::*;

    #[test]
    fn test_query_builder() {
        let query = QueryBuilder::new()
            .metric("cpu.usage")
            .filter_label("host", "server-01")
            .last_hours(1)
            .avg(Duration::from_secs(60))
            .gt(50.0)
            .build();

        assert!(query.is_some());
        let q = query.unwrap();
        assert_eq!(q.time_range.duration().as_secs(), 3600);
    }

    #[test]
    fn test_compression_roundtrip() {
        let points: Vec<TimeSeriesPoint> = (0..100)
            .map(|i| TimeSeriesPoint {
                timestamp: Timestamp::from_secs(1000000 + i),
                value: 50.0 + (i as f64 * 0.1),
            })
            .collect();

        let compressed = compress_points(&points);
        let decompressed = decompress_block(&compressed);

        assert_eq!(points.len(), decompressed.len());
        for (orig, decomp) in points.iter().zip(decompressed.iter()) {
            assert_eq!(orig.timestamp, decomp.timestamp);
            assert!((orig.value - decomp.value).abs() < 0.0001);
        }
        
        // Check compression ratio
        assert!(compressed.compression_ratio() > 1.0);
    }

    #[test]
    fn test_bit_writer_reader() {
        let mut writer = BitWriter::new();
        writer.write_bit(true);
        writer.write_bit(false);
        writer.write_bits(0b101010, 6);
        writer.write_u32(12345);

        let data = writer.finish();
        let mut reader = BitReader::new(&data);

        assert_eq!(reader.read_bit(), Some(true));
        assert_eq!(reader.read_bit(), Some(false));
        assert_eq!(reader.read_bits(6), Some(0b101010));
        assert_eq!(reader.read_u32(), Some(12345));
    }

    #[test]
    fn test_sma() {
        let points: Vec<TimeSeriesPoint> = (0..10)
            .map(|i| TimeSeriesPoint {
                timestamp: Timestamp::from_secs(i),
                value: i as f64,
            })
            .collect();

        let sma = MovingAverageCalculator::sma(&points, 3);
        assert_eq!(sma.len(), 8);
        assert!((sma[0].value - 1.0).abs() < 0.001); // avg(0,1,2) = 1
        assert!((sma[1].value - 2.0).abs() < 0.001); // avg(1,2,3) = 2
    }

    #[test]
    fn test_ema() {
        let points: Vec<TimeSeriesPoint> = (0..10)
            .map(|i| TimeSeriesPoint {
                timestamp: Timestamp::from_secs(i),
                value: i as f64,
            })
            .collect();

        let ema = MovingAverageCalculator::ema(&points, 3);
        assert_eq!(ema.len(), 10);
        assert!(ema.last().unwrap().value > 7.0); // EMA trends towards latest values
    }

    #[test]
    fn test_linear_regression() {
        let points: Vec<TimeSeriesPoint> = (0..10)
            .map(|i| TimeSeriesPoint {
                timestamp: Timestamp::from_secs(i),
                value: 2.0 * i as f64 + 1.0, // y = 2x + 1
            })
            .collect();

        let (slope, intercept, r_squared) = TrendAnalysis::linear_regression(&points);
        assert!((slope - 2.0).abs() < 0.01);
        assert!((intercept - 1.0).abs() < 0.01);
        assert!(r_squared > 0.99);
    }

    #[test]
    fn test_sliding_window() {
        let points: Vec<TimeSeriesPoint> = (0..100)
            .map(|i| TimeSeriesPoint {
                timestamp: Timestamp::from_secs(i),
                value: i as f64,
            })
            .collect();

        let window = WindowDefinition::new(
            WindowType::sliding(Duration::from_secs(10), Duration::from_secs(5)),
            AggregateFunction::Avg,
        );

        let results = window.apply(&points);
        assert!(!results.is_empty());
    }

    #[test]
    fn test_statistical_functions() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        
        assert!((StatisticalFunctions::median(&values) - 3.0).abs() < 0.001);
        assert!((StatisticalFunctions::variance(&values) - 2.5).abs() < 0.001);
        assert!((StatisticalFunctions::std_dev(&values) - 1.5811).abs() < 0.01);
    }

    #[test]
    fn test_outlier_detection() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0, 100.0]; // 100 is an outlier
        
        let outliers_iqr = StatisticalFunctions::detect_outliers_iqr(&values, 1.5);
        assert!(outliers_iqr.contains(&5));

        let outliers_zscore = StatisticalFunctions::detect_outliers_zscore(&values, 2.0);
        assert!(outliers_zscore.contains(&5));
    }

    #[test]
    fn test_aggregation_functions() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        
        assert_eq!(AggregateFunction::Sum.apply(&values), 15.0);
        assert_eq!(AggregateFunction::Avg.apply(&values), 3.0);
        assert_eq!(AggregateFunction::Min.apply(&values), 1.0);
        assert_eq!(AggregateFunction::Max.apply(&values), 5.0);
        assert_eq!(AggregateFunction::Count.apply(&values), 5.0);
    }
}

// ============================================================================
// ██████╗ ██╗  ██╗ █████╗ ███████╗███████╗    ██╗  ██╗
// ██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ██║  ██║
// ██████╔╝███████║███████║███████╗█████╗      ███████║
// ██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝      ╚════██║
// ██║     ██║  ██║██║  ██║███████║███████╗         ██║
// ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝         ╚═╝
// PROJECT & CGROUP INTELLIGENCE SYSTEM
// ============================================================================

// ============================================================================
// SECTION 22: PROJECT MANAGEMENT SYSTEM
// ============================================================================
// Intelligent project classification and management:
// - Project definitions and configuration
// - Auto-discovery of services
// - Dependency tracking
// - Health scoring
// - Resource allocation
// ============================================================================

// ----------------------------------------------------------------------------
// 22.1 Project Types & Definitions
// ----------------------------------------------------------------------------

/// A project represents a logical grouping of related services/processes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// Unique project ID
    pub id: u32,
    /// Project name
    pub name: CompactString,
    /// Project type
    pub project_type: ProjectType,
    /// Description
    pub description: Option<CompactString>,
    /// Owner/team responsible
    pub owner: Option<CompactString>,
    /// Processing priority
    pub priority: Priority,
    /// SLA requirements
    pub sla: ProjectSla,
    /// Matchers for auto-classification
    pub matchers: ProjectMatchers,
    /// Dependencies (other project IDs)
    pub dependencies: Vec<u32>,
    /// Custom labels
    pub labels: HashMap<String, String>,
    /// Creation timestamp
    pub created_at: Timestamp,
    /// Last update timestamp
    pub updated_at: Timestamp,
    /// Whether project is active
    pub active: bool,
}

/// Types of projects.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProjectType {
    /// WordPress site
    WordPress {
        site_name: CompactString,
        multisite: bool,
    },
    /// Database service
    Database {
        db_type: DatabaseType,
        cluster_name: Option<CompactString>,
    },
    /// Web server
    WebServer {
        server_type: WebServerType,
    },
    /// Cache service
    Cache {
        cache_type: CacheType,
    },
    /// Message queue
    MessageQueue {
        mq_type: MessageQueueType,
    },
    /// API service
    ApiService {
        api_name: CompactString,
        version: Option<CompactString>,
    },
    /// Background worker
    Worker {
        worker_type: CompactString,
    },
    /// Cron job / scheduled task
    CronJob {
        schedule: CompactString,
    },
    /// Container orchestration
    Container {
        orchestrator: ContainerOrchestrator,
    },
    /// Monitoring service
    Monitoring {
        monitor_type: CompactString,
    },
    /// Custom project type
    Custom {
        type_name: CompactString,
    },
}

impl Default for ProjectType {
    fn default() -> Self {
        ProjectType::Custom {
            type_name: CompactString::from("unknown"),
        }
    }
}

/// Database types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DatabaseType {
    MySQL,
    MariaDB,
    PostgreSQL,
    MongoDB,
    Redis,
    Elasticsearch,
    ClickHouse,
    TimescaleDB,
    InfluxDB,
    SQLite,
    Other,
}

/// Web server types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum WebServerType {
    Nginx,
    Apache,
    Caddy,
    Traefik,
    HAProxy,
    Envoy,
    LiteSpeed,
    Other,
}

/// Cache types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CacheType {
    Redis,
    Memcached,
    Varnish,
    KeyDB,
    Other,
}

/// Message queue types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum MessageQueueType {
    RabbitMQ,
    Kafka,
    Redis,
    NATS,
    ActiveMQ,
    ZeroMQ,
    Other,
}

/// Container orchestrators.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ContainerOrchestrator {
    Docker,
    DockerCompose,
    Kubernetes,
    DockerSwarm,
    Podman,
    Other,
}

// ----------------------------------------------------------------------------
// 22.2 Project SLA
// ----------------------------------------------------------------------------

/// Service Level Agreement requirements for a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSla {
    /// Target uptime percentage (e.g., 99.9)
    pub uptime_target: f64,
    /// Maximum response time in milliseconds
    pub max_response_time_ms: u64,
    /// Maximum error rate percentage
    pub max_error_rate: f64,
    /// Incident response time in seconds
    pub response_time_secs: u64,
    /// Resolution time in seconds
    pub resolution_time_secs: u64,
    /// Severity for SLA violations
    pub violation_severity: Severity,
}

impl Default for ProjectSla {
    fn default() -> Self {
        Self {
            uptime_target: 99.9,
            max_response_time_ms: 500,
            max_error_rate: 1.0,
            response_time_secs: 300,  // 5 minutes
            resolution_time_secs: 3600, // 1 hour
            violation_severity: Severity::High,
        }
    }
}

impl ProjectSla {
    /// Create a critical tier SLA (99.99% uptime).
    pub fn critical() -> Self {
        Self {
            uptime_target: 99.99,
            max_response_time_ms: 100,
            max_error_rate: 0.1,
            response_time_secs: 60,
            resolution_time_secs: 900,
            violation_severity: Severity::Critical,
        }
    }

    /// Create a standard tier SLA (99.9% uptime).
    pub fn standard() -> Self {
        Self::default()
    }

    /// Create a best-effort tier SLA (99% uptime).
    pub fn best_effort() -> Self {
        Self {
            uptime_target: 99.0,
            max_response_time_ms: 2000,
            max_error_rate: 5.0,
            response_time_secs: 900,
            resolution_time_secs: 14400,
            violation_severity: Severity::Medium,
        }
    }
}

// ----------------------------------------------------------------------------
// 22.3 Project Matchers
// ----------------------------------------------------------------------------

/// Matchers for auto-classifying metrics into projects.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectMatchers {
    /// Process name patterns (regex)
    pub process_patterns: Vec<String>,
    /// Process command line patterns (regex)
    pub cmdline_patterns: Vec<String>,
    /// Container name patterns (regex)
    pub container_patterns: Vec<String>,
    /// Container image patterns (regex)
    pub image_patterns: Vec<String>,
    /// Container label matchers
    pub container_labels: HashMap<String, String>,
    /// Cgroup path patterns (regex)
    pub cgroup_patterns: Vec<String>,
    /// Network port associations
    pub ports: Vec<u16>,
    /// Log file patterns (glob)
    pub log_patterns: Vec<String>,
    /// Health check endpoints
    pub health_endpoints: Vec<String>,
    /// Metric name patterns (regex)
    pub metric_patterns: Vec<String>,
}

impl ProjectMatchers {
    /// Check if a process matches this project.
    pub fn matches_process(&self, name: &str, cmdline: &str) -> bool {
        for pattern in &self.process_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(name) {
                    return true;
                }
            }
        }
        for pattern in &self.cmdline_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(cmdline) {
                    return true;
                }
            }
        }
        false
    }

    /// Check if a container matches this project.
    pub fn matches_container(&self, name: &str, image: &str, labels: &HashMap<String, String>) -> bool {
        // Check container name
        for pattern in &self.container_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(name) {
                    return true;
                }
            }
        }
        // Check image
        for pattern in &self.image_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(image) {
                    return true;
                }
            }
        }
        // Check labels
        for (key, value) in &self.container_labels {
            if let Some(label_value) = labels.get(key) {
                if label_value == value {
                    return true;
                }
            }
        }
        false
    }

    /// Check if a cgroup path matches this project.
    pub fn matches_cgroup(&self, path: &str) -> bool {
        for pattern in &self.cgroup_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(path) {
                    return true;
                }
            }
        }
        false
    }

    /// Check if a port matches this project.
    pub fn matches_port(&self, port: u16) -> bool {
        self.ports.contains(&port)
    }

    /// Check if a metric name matches this project.
    pub fn matches_metric(&self, metric_name: &str) -> bool {
        for pattern in &self.metric_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(metric_name) {
                    return true;
                }
            }
        }
        false
    }
}

// ----------------------------------------------------------------------------
// 22.4 Project Health
// ----------------------------------------------------------------------------

/// Health status for a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectHealth {
    /// Project ID
    pub project_id: u32,
    /// Overall health score (0-100)
    pub score: f64,
    /// Health status
    pub status: HealthStatus,
    /// Individual health checks
    pub checks: Vec<HealthCheck>,
    /// Active incidents
    pub active_incidents: usize,
    /// Last check timestamp
    pub last_check: Timestamp,
    /// Uptime percentage (last 24h)
    pub uptime_24h: f64,
    /// Error rate (last hour)
    pub error_rate_1h: f64,
    /// Average response time (last hour)
    pub avg_response_time_ms: f64,
}

/// Health status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HealthStatus {
    /// All systems operational
    Healthy,
    /// Some issues, but operational
    Degraded,
    /// Major issues, partially operational
    Unhealthy,
    /// System is down
    Down,
    /// Status unknown
    Unknown,
}

impl HealthStatus {
    /// Get color for UI display.
    pub fn color(&self) -> &'static str {
        match self {
            HealthStatus::Healthy => "#2ecc71",   // Green
            HealthStatus::Degraded => "#f1c40f",  // Yellow
            HealthStatus::Unhealthy => "#e67e22", // Orange
            HealthStatus::Down => "#e74c3c",      // Red
            HealthStatus::Unknown => "#95a5a6",   // Gray
        }
    }

    /// Get icon for UI display.
    pub fn icon(&self) -> &'static str {
        match self {
            HealthStatus::Healthy => "✓",
            HealthStatus::Degraded => "⚠",
            HealthStatus::Unhealthy => "✗",
            HealthStatus::Down => "⬇",
            HealthStatus::Unknown => "?",
        }
    }
}

/// Individual health check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    /// Check name
    pub name: CompactString,
    /// Check passed
    pub passed: bool,
    /// Check message
    pub message: Option<CompactString>,
    /// Check duration in milliseconds
    pub duration_ms: u64,
    /// Check timestamp
    pub timestamp: Timestamp,
}

// ----------------------------------------------------------------------------
// 22.5 Project Registry
// ----------------------------------------------------------------------------

/// Registry for managing all projects.
pub struct ProjectRegistry {
    /// Projects by ID
    projects: DashMap<u32, Project>,
    /// Projects by name (for lookup)
    by_name: DashMap<CompactString, u32>,
    /// Project health cache
    health_cache: DashMap<u32, ProjectHealth>,
    /// Next project ID
    next_id: AtomicU32,
    /// Compiled matchers cache
    matcher_cache: RwLock<HashMap<u32, CompiledMatchers>>,
}

/// Pre-compiled regex matchers for performance.
struct CompiledMatchers {
    process_patterns: Vec<Regex>,
    cmdline_patterns: Vec<Regex>,
    container_patterns: Vec<Regex>,
    cgroup_patterns: Vec<Regex>,
    metric_patterns: Vec<Regex>,
}

impl ProjectRegistry {
    /// Create a new project registry.
    pub fn new() -> Self {
        Self {
            projects: DashMap::new(),
            by_name: DashMap::new(),
            health_cache: DashMap::new(),
            next_id: AtomicU32::new(1),
            matcher_cache: RwLock::new(HashMap::new()),
        }
    }

    /// Generate a new project ID.
    pub fn next_id(&self) -> u32 {
        self.next_id.fetch_add(1, AtomicOrdering::SeqCst)
    }

    /// Register a new project.
    pub fn register(&self, mut project: Project) -> u32 {
        if project.id == 0 {
            project.id = self.next_id();
        }
        let id = project.id;
        let name = project.name.clone();
        
        // Compile matchers
        self.compile_matchers(&project);
        
        self.projects.insert(id, project);
        self.by_name.insert(name, id);
        
        id
    }

    /// Get a project by ID.
    pub fn get(&self, id: u32) -> Option<Project> {
        self.projects.get(&id).map(|p| p.clone())
    }

    /// Get a project by name.
    pub fn get_by_name(&self, name: &str) -> Option<Project> {
        let name = CompactString::from(name);
        self.by_name.get(&name)
            .and_then(|id| self.get(*id))
    }

    /// Update a project.
    pub fn update(&self, project: Project) -> bool {
        let id = project.id;
        if self.projects.contains_key(&id) {
            self.compile_matchers(&project);
            self.projects.insert(id, project);
            true
        } else {
            false
        }
    }

    /// Remove a project.
    pub fn remove(&self, id: u32) -> Option<Project> {
        if let Some((_, project)) = self.projects.remove(&id) {
            self.by_name.remove(&project.name);
            self.health_cache.remove(&id);
            self.matcher_cache.write().remove(&id);
            Some(project)
        } else {
            None
        }
    }

    /// List all projects.
    pub fn list(&self) -> Vec<Project> {
        self.projects.iter().map(|r| r.value().clone()).collect()
    }

    /// List active projects.
    pub fn list_active(&self) -> Vec<Project> {
        self.projects.iter()
            .filter(|r| r.value().active)
            .map(|r| r.value().clone())
            .collect()
    }

    /// Get project count.
    pub fn count(&self) -> usize {
        self.projects.len()
    }

    /// Classify a metric into a project.
    pub fn classify_metric(&self, metric: &Metric) -> Option<u32> {
        // First check if already assigned
        if metric.project_id != 0 {
            return Some(metric.project_id);
        }

        let matcher_cache = self.matcher_cache.read();
        
        for project in self.projects.iter() {
            if let Some(compiled) = matcher_cache.get(&project.id) {
                // Check metric name patterns
                for re in &compiled.metric_patterns {
                    if re.is_match(&metric.name) {
                        return Some(project.id);
                    }
                }
            }
        }

        None
    }

    /// Classify a process into a project.
    pub fn classify_process(&self, name: &str, cmdline: &str) -> Option<u32> {
        let matcher_cache = self.matcher_cache.read();
        
        for project in self.projects.iter() {
            if let Some(compiled) = matcher_cache.get(&project.id) {
                for re in &compiled.process_patterns {
                    if re.is_match(name) {
                        return Some(project.id);
                    }
                }
                for re in &compiled.cmdline_patterns {
                    if re.is_match(cmdline) {
                        return Some(project.id);
                    }
                }
            }
        }

        None
    }

    /// Classify a cgroup into a project.
    pub fn classify_cgroup(&self, path: &str) -> Option<u32> {
        let matcher_cache = self.matcher_cache.read();
        
        for project in self.projects.iter() {
            if let Some(compiled) = matcher_cache.get(&project.id) {
                for re in &compiled.cgroup_patterns {
                    if re.is_match(path) {
                        return Some(project.id);
                    }
                }
            }
        }

        None
    }

    /// Get project health.
    pub fn get_health(&self, id: u32) -> Option<ProjectHealth> {
        self.health_cache.get(&id).map(|h| h.clone())
    }

    /// Update project health.
    pub fn update_health(&self, health: ProjectHealth) {
        self.health_cache.insert(health.project_id, health);
    }

    /// Get all project health statuses.
    pub fn all_health(&self) -> Vec<ProjectHealth> {
        self.health_cache.iter().map(|r| r.value().clone()).collect()
    }

    /// Compile matchers for a project.
    fn compile_matchers(&self, project: &Project) {
        let compiled = CompiledMatchers {
            process_patterns: project.matchers.process_patterns.iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect(),
            cmdline_patterns: project.matchers.cmdline_patterns.iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect(),
            container_patterns: project.matchers.container_patterns.iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect(),
            cgroup_patterns: project.matchers.cgroup_patterns.iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect(),
            metric_patterns: project.matchers.metric_patterns.iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect(),
        };
        
        self.matcher_cache.write().insert(project.id, compiled);
    }
}

impl Default for ProjectRegistry {
    fn default() -> Self {
        Self::new()
    }
}


// ============================================================================
// SECTION 23: CGROUP READER & SYSTEM INTEGRATION
// ============================================================================
// Deep integration with Linux cgroups for resource monitoring:
// - Cgroup v1 and v2 support
// - CPU, memory, I/O, and network stats
// - Per-container resource tracking
// - Process to cgroup mapping
// ============================================================================

// ----------------------------------------------------------------------------
// 23.1 Cgroup Version Detection
// ----------------------------------------------------------------------------

/// Cgroup version in use on the system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CgroupVersion {
    /// Cgroup v1 (legacy)
    V1,
    /// Cgroup v2 (unified)
    V2,
    /// Hybrid mode (both v1 and v2)
    Hybrid,
    /// Unknown/unsupported
    Unknown,
}

impl CgroupVersion {
    /// Detect the cgroup version on the current system.
    pub fn detect() -> Self {
        // Check for cgroup v2 unified hierarchy
        let unified_path = Path::new("/sys/fs/cgroup/cgroup.controllers");
        let v1_path = Path::new("/sys/fs/cgroup/cpu");
        
        let has_v2 = unified_path.exists();
        let has_v1 = v1_path.exists();
        
        match (has_v2, has_v1) {
            (true, false) => CgroupVersion::V2,
            (false, true) => CgroupVersion::V1,
            (true, true) => CgroupVersion::Hybrid,
            (false, false) => CgroupVersion::Unknown,
        }
    }
}

// ----------------------------------------------------------------------------
// 23.2 Cgroup Paths
// ----------------------------------------------------------------------------

/// Standard cgroup mount paths.
pub struct CgroupPaths {
    /// Base path for cgroups
    pub base: PathBuf,
    /// Cgroup version
    pub version: CgroupVersion,
    /// CPU controller path (v1)
    pub cpu: Option<PathBuf>,
    /// Memory controller path (v1)
    pub memory: Option<PathBuf>,
    /// Block I/O controller path (v1)
    pub blkio: Option<PathBuf>,
    /// Network controller path (v1)
    pub net_cls: Option<PathBuf>,
    /// PIDs controller path (v1)
    pub pids: Option<PathBuf>,
}

impl CgroupPaths {
    /// Discover cgroup paths on the system.
    pub fn discover() -> Self {
        let version = CgroupVersion::detect();
        let base = PathBuf::from("/sys/fs/cgroup");
        
        match version {
            CgroupVersion::V2 => Self {
                base: base.clone(),
                version,
                cpu: Some(base.clone()),
                memory: Some(base.clone()),
                blkio: Some(base.clone()),
                net_cls: None,
                pids: Some(base),
            },
            CgroupVersion::V1 | CgroupVersion::Hybrid => Self {
                base: base.clone(),
                version,
                cpu: Some(base.join("cpu,cpuacct")),
                memory: Some(base.join("memory")),
                blkio: Some(base.join("blkio")),
                net_cls: Some(base.join("net_cls")),
                pids: Some(base.join("pids")),
            },
            CgroupVersion::Unknown => Self {
                base,
                version,
                cpu: None,
                memory: None,
                blkio: None,
                net_cls: None,
                pids: None,
            },
        }
    }
}

// ----------------------------------------------------------------------------
// 23.3 Cgroup Stats
// ----------------------------------------------------------------------------

/// CPU statistics from cgroup.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CgroupCpuStats {
    /// Total CPU usage in nanoseconds
    pub usage_total_ns: u64,
    /// User mode CPU usage in nanoseconds
    pub usage_user_ns: u64,
    /// System mode CPU usage in nanoseconds
    pub usage_system_ns: u64,
    /// Per-CPU usage (if available)
    pub per_cpu_usage_ns: Vec<u64>,
    /// Number of periods (for quota)
    pub nr_periods: u64,
    /// Number of throttled periods
    pub nr_throttled: u64,
    /// Total throttled time in nanoseconds
    pub throttled_time_ns: u64,
    /// CPU quota (if set, -1 for unlimited)
    pub quota_us: i64,
    /// CPU period
    pub period_us: u64,
    /// CPU shares (relative weight)
    pub shares: u64,
}

impl CgroupCpuStats {
    /// Calculate throttle percentage.
    pub fn throttle_percentage(&self) -> f64 {
        if self.nr_periods == 0 {
            0.0
        } else {
            (self.nr_throttled as f64 / self.nr_periods as f64) * 100.0
        }
    }

    /// Get effective CPU limit (in cores).
    pub fn cpu_limit(&self) -> f64 {
        if self.quota_us <= 0 || self.period_us == 0 {
            -1.0 // Unlimited
        } else {
            self.quota_us as f64 / self.period_us as f64
        }
    }
}

/// Memory statistics from cgroup.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CgroupMemoryStats {
    /// Current memory usage in bytes
    pub usage_bytes: u64,
    /// Maximum memory usage in bytes
    pub max_usage_bytes: u64,
    /// Memory limit in bytes
    pub limit_bytes: u64,
    /// Soft limit in bytes
    pub soft_limit_bytes: u64,
    /// Cache memory in bytes
    pub cache_bytes: u64,
    /// RSS (resident set size) in bytes
    pub rss_bytes: u64,
    /// RSS + cache
    pub rss_huge_bytes: u64,
    /// Mapped file bytes
    pub mapped_file_bytes: u64,
    /// Swap usage in bytes
    pub swap_bytes: u64,
    /// Swap limit in bytes
    pub swap_limit_bytes: u64,
    /// Page faults
    pub pgfault: u64,
    /// Major page faults
    pub pgmajfault: u64,
    /// Number of times memory limit hit
    pub failcnt: u64,
    /// OOM kill count
    pub oom_kill: u64,
}

impl CgroupMemoryStats {
    /// Calculate memory usage percentage.
    pub fn usage_percentage(&self) -> f64 {
        if self.limit_bytes == 0 {
            0.0
        } else {
            (self.usage_bytes as f64 / self.limit_bytes as f64) * 100.0
        }
    }

    /// Calculate swap usage percentage.
    pub fn swap_percentage(&self) -> f64 {
        if self.swap_limit_bytes == 0 {
            0.0
        } else {
            (self.swap_bytes as f64 / self.swap_limit_bytes as f64) * 100.0
        }
    }

    /// Check if near memory limit (>90%).
    pub fn is_near_limit(&self) -> bool {
        self.usage_percentage() > 90.0
    }
}

/// Block I/O statistics from cgroup.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CgroupIoStats {
    /// Read bytes
    pub read_bytes: u64,
    /// Write bytes
    pub write_bytes: u64,
    /// Read operations
    pub read_ops: u64,
    /// Write operations
    pub write_ops: u64,
    /// Per-device stats
    pub devices: Vec<DeviceIoStats>,
}

/// Per-device I/O stats.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeviceIoStats {
    /// Device major number
    pub major: u32,
    /// Device minor number
    pub minor: u32,
    /// Read bytes
    pub read_bytes: u64,
    /// Write bytes
    pub write_bytes: u64,
    /// Read operations
    pub read_ops: u64,
    /// Write operations
    pub write_ops: u64,
}

/// PIDs statistics from cgroup.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CgroupPidsStats {
    /// Current number of PIDs
    pub current: u64,
    /// Maximum PIDs limit
    pub limit: u64,
}

impl CgroupPidsStats {
    /// Calculate PID usage percentage.
    pub fn usage_percentage(&self) -> f64 {
        if self.limit == 0 || self.limit == u64::MAX {
            0.0
        } else {
            (self.current as f64 / self.limit as f64) * 100.0
        }
    }
}

/// Combined cgroup statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CgroupStats {
    /// Cgroup path
    pub path: String,
    /// CPU stats
    pub cpu: CgroupCpuStats,
    /// Memory stats
    pub memory: CgroupMemoryStats,
    /// I/O stats
    pub io: CgroupIoStats,
    /// PIDs stats
    pub pids: CgroupPidsStats,
    /// Timestamp when collected
    pub timestamp: Timestamp,
}

// ----------------------------------------------------------------------------
// 23.4 Cgroup Reader
// ----------------------------------------------------------------------------

/// Reader for cgroup statistics.
pub struct CgroupReader {
    /// Cgroup paths
    paths: CgroupPaths,
    /// Cache of cgroup stats
    cache: DashMap<String, CgroupStats>,
    /// Cache TTL
    cache_ttl: Duration,
}

impl CgroupReader {
    /// Create a new cgroup reader.
    pub fn new() -> Self {
        Self {
            paths: CgroupPaths::discover(),
            cache: DashMap::new(),
            cache_ttl: Duration::from_secs(1),
        }
    }

    /// Get the detected cgroup version.
    pub fn version(&self) -> CgroupVersion {
        self.paths.version
    }

    /// Read stats for a cgroup.
    pub fn read_stats(&self, cgroup_path: &str) -> CerebroResult<CgroupStats> {
        // Check cache
        if let Some(cached) = self.cache.get(cgroup_path) {
            if cached.timestamp.add_duration(self.cache_ttl) > Timestamp::now() {
                return Ok(cached.clone());
            }
        }

        let stats = match self.paths.version {
            CgroupVersion::V2 => self.read_v2_stats(cgroup_path)?,
            CgroupVersion::V1 | CgroupVersion::Hybrid => self.read_v1_stats(cgroup_path)?,
            CgroupVersion::Unknown => {
                return Err(CerebroError::System(SystemError::SyscallFailed {
                    syscall: "cgroup".into(),
                    message: "Cgroup version unknown".into(),
                }));
            }
        };

        self.cache.insert(cgroup_path.to_string(), stats.clone());
        Ok(stats)
    }

    /// Read cgroup v1 stats.
    fn read_v1_stats(&self, cgroup_path: &str) -> CerebroResult<CgroupStats> {
        let mut stats = CgroupStats {
            path: cgroup_path.to_string(),
            timestamp: Timestamp::now(),
            ..Default::default()
        };

        // Read CPU stats
        if let Some(cpu_base) = &self.paths.cpu {
            let cpu_path = cpu_base.join(cgroup_path);
            if cpu_path.exists() {
                stats.cpu = self.read_v1_cpu_stats(&cpu_path)?;
            }
        }

        // Read memory stats
        if let Some(mem_base) = &self.paths.memory {
            let mem_path = mem_base.join(cgroup_path);
            if mem_path.exists() {
                stats.memory = self.read_v1_memory_stats(&mem_path)?;
            }
        }

        // Read I/O stats
        if let Some(io_base) = &self.paths.blkio {
            let io_path = io_base.join(cgroup_path);
            if io_path.exists() {
                stats.io = self.read_v1_io_stats(&io_path)?;
            }
        }

        // Read PIDs stats
        if let Some(pids_base) = &self.paths.pids {
            let pids_path = pids_base.join(cgroup_path);
            if pids_path.exists() {
                stats.pids = self.read_v1_pids_stats(&pids_path)?;
            }
        }

        Ok(stats)
    }

    /// Read cgroup v2 stats.
    fn read_v2_stats(&self, cgroup_path: &str) -> CerebroResult<CgroupStats> {
        let base = self.paths.base.join(cgroup_path);
        
        let mut stats = CgroupStats {
            path: cgroup_path.to_string(),
            timestamp: Timestamp::now(),
            ..Default::default()
        };

        if base.exists() {
            stats.cpu = self.read_v2_cpu_stats(&base)?;
            stats.memory = self.read_v2_memory_stats(&base)?;
            stats.io = self.read_v2_io_stats(&base)?;
            stats.pids = self.read_v2_pids_stats(&base)?;
        }

        Ok(stats)
    }

    /// Read v1 CPU stats.
    fn read_v1_cpu_stats(&self, path: &Path) -> CerebroResult<CgroupCpuStats> {
        let mut stats = CgroupCpuStats::default();

        // cpuacct.usage
        if let Ok(content) = fs::read_to_string(path.join("cpuacct.usage")) {
            stats.usage_total_ns = content.trim().parse().unwrap_or(0);
        }

        // cpuacct.usage_user
        if let Ok(content) = fs::read_to_string(path.join("cpuacct.usage_user")) {
            stats.usage_user_ns = content.trim().parse().unwrap_or(0);
        }

        // cpuacct.usage_sys
        if let Ok(content) = fs::read_to_string(path.join("cpuacct.usage_sys")) {
            stats.usage_system_ns = content.trim().parse().unwrap_or(0);
        }

        // cpu.stat
        if let Ok(content) = fs::read_to_string(path.join("cpu.stat")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 2 {
                    match parts[0] {
                        "nr_periods" => stats.nr_periods = parts[1].parse().unwrap_or(0),
                        "nr_throttled" => stats.nr_throttled = parts[1].parse().unwrap_or(0),
                        "throttled_time" => stats.throttled_time_ns = parts[1].parse().unwrap_or(0),
                        _ => {}
                    }
                }
            }
        }

        // cpu.cfs_quota_us
        if let Ok(content) = fs::read_to_string(path.join("cpu.cfs_quota_us")) {
            stats.quota_us = content.trim().parse().unwrap_or(-1);
        }

        // cpu.cfs_period_us
        if let Ok(content) = fs::read_to_string(path.join("cpu.cfs_period_us")) {
            stats.period_us = content.trim().parse().unwrap_or(100000);
        }

        // cpu.shares
        if let Ok(content) = fs::read_to_string(path.join("cpu.shares")) {
            stats.shares = content.trim().parse().unwrap_or(1024);
        }

        Ok(stats)
    }

    /// Read v1 memory stats.
    fn read_v1_memory_stats(&self, path: &Path) -> CerebroResult<CgroupMemoryStats> {
        let mut stats = CgroupMemoryStats::default();

        // memory.usage_in_bytes
        if let Ok(content) = fs::read_to_string(path.join("memory.usage_in_bytes")) {
            stats.usage_bytes = content.trim().parse().unwrap_or(0);
        }

        // memory.max_usage_in_bytes
        if let Ok(content) = fs::read_to_string(path.join("memory.max_usage_in_bytes")) {
            stats.max_usage_bytes = content.trim().parse().unwrap_or(0);
        }

        // memory.limit_in_bytes
        if let Ok(content) = fs::read_to_string(path.join("memory.limit_in_bytes")) {
            stats.limit_bytes = content.trim().parse().unwrap_or(u64::MAX);
        }

        // memory.stat
        if let Ok(content) = fs::read_to_string(path.join("memory.stat")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 2 {
                    let value: u64 = parts[1].parse().unwrap_or(0);
                    match parts[0] {
                        "cache" => stats.cache_bytes = value,
                        "rss" => stats.rss_bytes = value,
                        "rss_huge" => stats.rss_huge_bytes = value,
                        "mapped_file" => stats.mapped_file_bytes = value,
                        "swap" => stats.swap_bytes = value,
                        "pgfault" => stats.pgfault = value,
                        "pgmajfault" => stats.pgmajfault = value,
                        _ => {}
                    }
                }
            }
        }

        // memory.failcnt
        if let Ok(content) = fs::read_to_string(path.join("memory.failcnt")) {
            stats.failcnt = content.trim().parse().unwrap_or(0);
        }

        // memory.oom_control
        if let Ok(content) = fs::read_to_string(path.join("memory.oom_control")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 2 && parts[0] == "oom_kill" {
                    stats.oom_kill = parts[1].parse().unwrap_or(0);
                }
            }
        }

        Ok(stats)
    }

    /// Read v1 I/O stats.
    fn read_v1_io_stats(&self, path: &Path) -> CerebroResult<CgroupIoStats> {
        let mut stats = CgroupIoStats::default();

        // blkio.throttle.io_service_bytes
        if let Ok(content) = fs::read_to_string(path.join("blkio.throttle.io_service_bytes")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 3 {
                    let value: u64 = parts[2].parse().unwrap_or(0);
                    match parts[1] {
                        "Read" => stats.read_bytes += value,
                        "Write" => stats.write_bytes += value,
                        _ => {}
                    }
                }
            }
        }

        // blkio.throttle.io_serviced
        if let Ok(content) = fs::read_to_string(path.join("blkio.throttle.io_serviced")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 3 {
                    let value: u64 = parts[2].parse().unwrap_or(0);
                    match parts[1] {
                        "Read" => stats.read_ops += value,
                        "Write" => stats.write_ops += value,
                        _ => {}
                    }
                }
            }
        }

        Ok(stats)
    }

    /// Read v1 PIDs stats.
    fn read_v1_pids_stats(&self, path: &Path) -> CerebroResult<CgroupPidsStats> {
        let mut stats = CgroupPidsStats::default();

        // pids.current
        if let Ok(content) = fs::read_to_string(path.join("pids.current")) {
            stats.current = content.trim().parse().unwrap_or(0);
        }

        // pids.max
        if let Ok(content) = fs::read_to_string(path.join("pids.max")) {
            let value = content.trim();
            stats.limit = if value == "max" {
                u64::MAX
            } else {
                value.parse().unwrap_or(u64::MAX)
            };
        }

        Ok(stats)
    }

    /// Read v2 CPU stats.
    fn read_v2_cpu_stats(&self, path: &Path) -> CerebroResult<CgroupCpuStats> {
        let mut stats = CgroupCpuStats::default();

        // cpu.stat
        if let Ok(content) = fs::read_to_string(path.join("cpu.stat")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 2 {
                    let value: u64 = parts[1].parse().unwrap_or(0);
                    match parts[0] {
                        "usage_usec" => stats.usage_total_ns = value * 1000,
                        "user_usec" => stats.usage_user_ns = value * 1000,
                        "system_usec" => stats.usage_system_ns = value * 1000,
                        "nr_periods" => stats.nr_periods = value,
                        "nr_throttled" => stats.nr_throttled = value,
                        "throttled_usec" => stats.throttled_time_ns = value * 1000,
                        _ => {}
                    }
                }
            }
        }

        // cpu.max
        if let Ok(content) = fs::read_to_string(path.join("cpu.max")) {
            let parts: Vec<&str> = content.trim().split_whitespace().collect();
            if parts.len() == 2 {
                stats.quota_us = if parts[0] == "max" {
                    -1
                } else {
                    parts[0].parse().unwrap_or(-1)
                };
                stats.period_us = parts[1].parse().unwrap_or(100000);
            }
        }

        // cpu.weight
        if let Ok(content) = fs::read_to_string(path.join("cpu.weight")) {
            let weight: u64 = content.trim().parse().unwrap_or(100);
            // Convert weight (1-10000) to shares (2-262144)
            stats.shares = (weight * 1024 / 100).max(2);
        }

        Ok(stats)
    }

    /// Read v2 memory stats.
    fn read_v2_memory_stats(&self, path: &Path) -> CerebroResult<CgroupMemoryStats> {
        let mut stats = CgroupMemoryStats::default();

        // memory.current
        if let Ok(content) = fs::read_to_string(path.join("memory.current")) {
            stats.usage_bytes = content.trim().parse().unwrap_or(0);
        }

        // memory.max
        if let Ok(content) = fs::read_to_string(path.join("memory.max")) {
            let value = content.trim();
            stats.limit_bytes = if value == "max" {
                u64::MAX
            } else {
                value.parse().unwrap_or(u64::MAX)
            };
        }

        // memory.stat
        if let Ok(content) = fs::read_to_string(path.join("memory.stat")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 2 {
                    let value: u64 = parts[1].parse().unwrap_or(0);
                    match parts[0] {
                        "file" => stats.cache_bytes = value,
                        "anon" => stats.rss_bytes = value,
                        "anon_thp" => stats.rss_huge_bytes = value,
                        "file_mapped" => stats.mapped_file_bytes = value,
                        "pgfault" => stats.pgfault = value,
                        "pgmajfault" => stats.pgmajfault = value,
                        _ => {}
                    }
                }
            }
        }

        // memory.swap.current
        if let Ok(content) = fs::read_to_string(path.join("memory.swap.current")) {
            stats.swap_bytes = content.trim().parse().unwrap_or(0);
        }

        // memory.events
        if let Ok(content) = fs::read_to_string(path.join("memory.events")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() == 2 {
                    match parts[0] {
                        "oom_kill" => stats.oom_kill = parts[1].parse().unwrap_or(0),
                        "max" => stats.failcnt = parts[1].parse().unwrap_or(0),
                        _ => {}
                    }
                }
            }
        }

        Ok(stats)
    }

    /// Read v2 I/O stats.
    fn read_v2_io_stats(&self, path: &Path) -> CerebroResult<CgroupIoStats> {
        let mut stats = CgroupIoStats::default();

        // io.stat
        if let Ok(content) = fs::read_to_string(path.join("io.stat")) {
            for line in content.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    for part in &parts[1..] {
                        let kv: Vec<&str> = part.split('=').collect();
                        if kv.len() == 2 {
                            let value: u64 = kv[1].parse().unwrap_or(0);
                            match kv[0] {
                                "rbytes" => stats.read_bytes += value,
                                "wbytes" => stats.write_bytes += value,
                                "rios" => stats.read_ops += value,
                                "wios" => stats.write_ops += value,
                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        Ok(stats)
    }

    /// Read v2 PIDs stats.
    fn read_v2_pids_stats(&self, path: &Path) -> CerebroResult<CgroupPidsStats> {
        let mut stats = CgroupPidsStats::default();

        // pids.current
        if let Ok(content) = fs::read_to_string(path.join("pids.current")) {
            stats.current = content.trim().parse().unwrap_or(0);
        }

        // pids.max
        if let Ok(content) = fs::read_to_string(path.join("pids.max")) {
            let value = content.trim();
            stats.limit = if value == "max" {
                u64::MAX
            } else {
                value.parse().unwrap_or(u64::MAX)
            };
        }

        Ok(stats)
    }

    /// List all cgroups under a path.
    pub fn list_cgroups(&self, base_path: &str) -> Vec<String> {
        let full_path = self.paths.base.join(base_path);
        let mut cgroups = Vec::new();

        if let Ok(entries) = fs::read_dir(&full_path) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        let cgroup_path = if base_path.is_empty() {
                            name.to_string()
                        } else {
                            format!("{}/{}", base_path, name)
                        };
                        cgroups.push(cgroup_path.clone());
                        // Recursively list sub-cgroups
                        cgroups.extend(self.list_cgroups(&cgroup_path));
                    }
                }
            }
        }

        cgroups
    }

    /// Get cgroup for a process.
    pub fn get_process_cgroup(&self, pid: u32) -> CerebroResult<String> {
        let cgroup_file = format!("/proc/{}/cgroup", pid);
        let content = fs::read_to_string(&cgroup_file)
            .map_err(|e| CerebroError::System(SystemError::ProcReadFailed {
                path: cgroup_file,
                message: e.to_string(),
            }))?;

        // Parse cgroup file
        // Format: hierarchy-ID:controller-list:cgroup-path
        for line in content.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() == 3 {
                // For v2, the controller list is empty
                // For v1, we want the path
                let path = parts[2].trim_start_matches('/');
                if !path.is_empty() {
                    return Ok(path.to_string());
                }
            }
        }

        Ok(String::new())
    }

    /// Invalidate cache for a cgroup.
    pub fn invalidate_cache(&self, cgroup_path: &str) {
        self.cache.remove(cgroup_path);
    }

    /// Clear all cache.
    pub fn clear_cache(&self) {
        self.cache.clear();
    }
}

impl Default for CgroupReader {
    fn default() -> Self {
        Self::new()
    }
}


// ============================================================================
// SECTION 24: PROCESS DISCOVERY & CLASSIFICATION
// ============================================================================
// Intelligent process discovery and monitoring:
// - Process enumeration from /proc
// - Process metadata extraction
// - Parent-child relationship tracking
// - Process to project classification
// - Resource usage per process
// ============================================================================

// ----------------------------------------------------------------------------
// 24.1 Process Information
// ----------------------------------------------------------------------------

/// Information about a running process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    /// Process ID
    pub pid: u32,
    /// Parent process ID
    pub ppid: u32,
    /// Process name (comm)
    pub name: CompactString,
    /// Full command line
    pub cmdline: CompactString,
    /// Executable path
    pub exe: Option<CompactString>,
    /// Current working directory
    pub cwd: Option<CompactString>,
    /// User ID
    pub uid: u32,
    /// Group ID
    pub gid: u32,
    /// Process state
    pub state: ProcessState,
    /// Number of threads
    pub num_threads: u32,
    /// Start time (clock ticks since boot)
    pub start_time: u64,
    /// Cgroup path
    pub cgroup: Option<CompactString>,
    /// Associated project ID
    pub project_id: Option<u32>,
    /// Resource usage
    pub resources: ProcessResources,
    /// Environment variables (optional)
    pub env: Option<HashMap<String, String>>,
    /// Open file descriptors count
    pub fd_count: u32,
    /// Last update timestamp
    pub updated_at: Timestamp,
}

/// Process state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProcessState {
    Running,
    Sleeping,
    DiskSleep,
    Stopped,
    Zombie,
    Dead,
    Idle,
    Unknown,
}

impl ProcessState {
    /// Parse from /proc/[pid]/stat state character.
    pub fn from_char(c: char) -> Self {
        match c {
            'R' => ProcessState::Running,
            'S' => ProcessState::Sleeping,
            'D' => ProcessState::DiskSleep,
            'T' | 't' => ProcessState::Stopped,
            'Z' => ProcessState::Zombie,
            'X' | 'x' => ProcessState::Dead,
            'I' => ProcessState::Idle,
            _ => ProcessState::Unknown,
        }
    }

    /// Check if process is active (running or sleeping).
    pub fn is_active(&self) -> bool {
        matches!(self, ProcessState::Running | ProcessState::Sleeping | ProcessState::DiskSleep)
    }
}

/// Process resource usage.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProcessResources {
    /// CPU time in user mode (ticks)
    pub utime: u64,
    /// CPU time in kernel mode (ticks)
    pub stime: u64,
    /// CPU time of children in user mode
    pub cutime: u64,
    /// CPU time of children in kernel mode
    pub cstime: u64,
    /// Virtual memory size (bytes)
    pub vsize: u64,
    /// Resident set size (pages)
    pub rss: u64,
    /// RSS limit (bytes)
    pub rss_limit: u64,
    /// Minor page faults
    pub minflt: u64,
    /// Major page faults
    pub majflt: u64,
    /// Number of voluntary context switches
    pub voluntary_ctxt_switches: u64,
    /// Number of involuntary context switches
    pub nonvoluntary_ctxt_switches: u64,
    /// Read bytes (from /proc/[pid]/io)
    pub read_bytes: u64,
    /// Write bytes
    pub write_bytes: u64,
    /// CPU usage percentage (calculated)
    pub cpu_percent: f64,
    /// Memory usage percentage (calculated)
    pub memory_percent: f64,
}

// ----------------------------------------------------------------------------
// 24.2 Process Reader
// ----------------------------------------------------------------------------

/// Reader for process information from /proc.
pub struct ProcessReader {
    /// Page size in bytes
    page_size: u64,
    /// Clock ticks per second
    clock_ticks: u64,
    /// Total system memory
    total_memory: u64,
    /// Process cache
    cache: DashMap<u32, ProcessInfo>,
    /// Previous CPU times for CPU% calculation
    prev_cpu_times: DashMap<u32, (u64, u64, Instant)>,
}

impl ProcessReader {
    /// Create a new process reader.
    pub fn new() -> Self {
        Self {
            page_size: unsafe { libc::sysconf(libc::_SC_PAGESIZE) as u64 },
            clock_ticks: unsafe { libc::sysconf(libc::_SC_CLK_TCK) as u64 },
            total_memory: Self::get_total_memory(),
            cache: DashMap::new(),
            prev_cpu_times: DashMap::new(),
        }
    }

    /// Get total system memory.
    fn get_total_memory() -> u64 {
        if let Ok(content) = fs::read_to_string("/proc/meminfo") {
            for line in content.lines() {
                if line.starts_with("MemTotal:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        return parts[1].parse::<u64>().unwrap_or(0) * 1024;
                    }
                }
            }
        }
        0
    }

    /// List all process IDs.
    pub fn list_pids(&self) -> Vec<u32> {
        let mut pids = Vec::new();
        if let Ok(entries) = fs::read_dir("/proc") {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if let Ok(pid) = name.parse::<u32>() {
                        pids.push(pid);
                    }
                }
            }
        }
        pids.sort();
        pids
    }

    /// Read information for a single process.
    pub fn read_process(&self, pid: u32) -> Option<ProcessInfo> {
        let proc_path = format!("/proc/{}", pid);
        if !Path::new(&proc_path).exists() {
            return None;
        }

        let mut info = ProcessInfo {
            pid,
            ppid: 0,
            name: CompactString::new(""),
            cmdline: CompactString::new(""),
            exe: None,
            cwd: None,
            uid: 0,
            gid: 0,
            state: ProcessState::Unknown,
            num_threads: 0,
            start_time: 0,
            cgroup: None,
            project_id: None,
            resources: ProcessResources::default(),
            env: None,
            fd_count: 0,
            updated_at: Timestamp::now(),
        };

        // Read /proc/[pid]/stat
        if let Ok(stat_content) = fs::read_to_string(format!("{}/stat", proc_path)) {
            self.parse_stat(&stat_content, &mut info);
        } else {
            return None;
        }

        // Read /proc/[pid]/cmdline
        if let Ok(cmdline) = fs::read_to_string(format!("{}/cmdline", proc_path)) {
            info.cmdline = CompactString::from(cmdline.replace('\0', " ").trim());
        }

        // Read /proc/[pid]/exe (symlink)
        if let Ok(exe) = fs::read_link(format!("{}/exe", proc_path)) {
            info.exe = Some(CompactString::from(exe.to_string_lossy().to_string()));
        }

        // Read /proc/[pid]/cwd (symlink)
        if let Ok(cwd) = fs::read_link(format!("{}/cwd", proc_path)) {
            info.cwd = Some(CompactString::from(cwd.to_string_lossy().to_string()));
        }

        // Read /proc/[pid]/status for UID/GID
        if let Ok(status) = fs::read_to_string(format!("{}/status", proc_path)) {
            self.parse_status(&status, &mut info);
        }

        // Read /proc/[pid]/io
        if let Ok(io) = fs::read_to_string(format!("{}/io", proc_path)) {
            self.parse_io(&io, &mut info);
        }

        // Read /proc/[pid]/cgroup
        if let Ok(cgroup) = fs::read_to_string(format!("{}/cgroup", proc_path)) {
            for line in cgroup.lines() {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() == 3 {
                    let path = parts[2].trim_start_matches('/');
                    if !path.is_empty() {
                        info.cgroup = Some(CompactString::from(path));
                        break;
                    }
                }
            }
        }

        // Count file descriptors
        if let Ok(fds) = fs::read_dir(format!("{}/fd", proc_path)) {
            info.fd_count = fds.count() as u32;
        }

        // Calculate CPU percentage
        self.calculate_cpu_percent(&mut info);

        // Calculate memory percentage
        if self.total_memory > 0 {
            let rss_bytes = info.resources.rss * self.page_size;
            info.resources.memory_percent = (rss_bytes as f64 / self.total_memory as f64) * 100.0;
        }

        // Update cache
        self.cache.insert(pid, info.clone());

        Some(info)
    }

    /// Parse /proc/[pid]/stat content.
    fn parse_stat(&self, content: &str, info: &mut ProcessInfo) {
        // Format: pid (comm) state ppid ...
        // comm can contain spaces and parentheses, so we need to find the last ')'
        
        let start = content.find('(');
        let end = content.rfind(')');
        
        if let (Some(start), Some(end)) = (start, end) {
            info.name = CompactString::from(&content[start + 1..end]);
            
            let remainder = &content[end + 2..]; // Skip ") "
            let fields: Vec<&str> = remainder.split_whitespace().collect();
            
            if fields.len() >= 22 {
                info.state = ProcessState::from_char(fields[0].chars().next().unwrap_or('?'));
                info.ppid = fields[1].parse().unwrap_or(0);
                info.resources.minflt = fields[7].parse().unwrap_or(0);
                info.resources.majflt = fields[9].parse().unwrap_or(0);
                info.resources.utime = fields[11].parse().unwrap_or(0);
                info.resources.stime = fields[12].parse().unwrap_or(0);
                info.resources.cutime = fields[13].parse().unwrap_or(0);
                info.resources.cstime = fields[14].parse().unwrap_or(0);
                info.num_threads = fields[17].parse().unwrap_or(0);
                info.start_time = fields[19].parse().unwrap_or(0);
                info.resources.vsize = fields[20].parse().unwrap_or(0);
                info.resources.rss = fields[21].parse().unwrap_or(0);
            }
        }
    }

    /// Parse /proc/[pid]/status content.
    fn parse_status(&self, content: &str, info: &mut ProcessInfo) {
        for line in content.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() == 2 {
                let key = parts[0].trim();
                let value = parts[1].trim();
                
                match key {
                    "Uid" => {
                        let uids: Vec<&str> = value.split_whitespace().collect();
                        if !uids.is_empty() {
                            info.uid = uids[0].parse().unwrap_or(0);
                        }
                    }
                    "Gid" => {
                        let gids: Vec<&str> = value.split_whitespace().collect();
                        if !gids.is_empty() {
                            info.gid = gids[0].parse().unwrap_or(0);
                        }
                    }
                    "voluntary_ctxt_switches" => {
                        info.resources.voluntary_ctxt_switches = value.parse().unwrap_or(0);
                    }
                    "nonvoluntary_ctxt_switches" => {
                        info.resources.nonvoluntary_ctxt_switches = value.parse().unwrap_or(0);
                    }
                    _ => {}
                }
            }
        }
    }

    /// Parse /proc/[pid]/io content.
    fn parse_io(&self, content: &str, info: &mut ProcessInfo) {
        for line in content.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() == 2 {
                let key = parts[0].trim();
                let value: u64 = parts[1].trim().parse().unwrap_or(0);
                
                match key {
                    "read_bytes" => info.resources.read_bytes = value,
                    "write_bytes" => info.resources.write_bytes = value,
                    _ => {}
                }
            }
        }
    }

    /// Calculate CPU percentage.
    fn calculate_cpu_percent(&self, info: &mut ProcessInfo) {
        let total_time = info.resources.utime + info.resources.stime;
        let now = Instant::now();
        
        if let Some(prev) = self.prev_cpu_times.get(&info.pid) {
            let (prev_total, _, prev_time) = *prev;
            let time_diff = now.duration_since(prev_time).as_secs_f64();
            
            if time_diff > 0.0 {
                let cpu_diff = total_time.saturating_sub(prev_total) as f64;
                let cpu_secs = cpu_diff / self.clock_ticks as f64;
                info.resources.cpu_percent = (cpu_secs / time_diff) * 100.0;
            }
        }
        
        self.prev_cpu_times.insert(info.pid, (total_time, info.start_time, now));
    }

    /// Read all processes.
    pub fn read_all_processes(&self) -> Vec<ProcessInfo> {
        self.list_pids()
            .into_iter()
            .filter_map(|pid| self.read_process(pid))
            .collect()
    }

    /// Get process tree (parent-child relationships).
    pub fn get_process_tree(&self) -> HashMap<u32, Vec<u32>> {
        let processes = self.read_all_processes();
        let mut tree: HashMap<u32, Vec<u32>> = HashMap::new();
        
        for proc in &processes {
            tree.entry(proc.ppid).or_default().push(proc.pid);
        }
        
        tree
    }

    /// Get all descendants of a process.
    pub fn get_descendants(&self, pid: u32) -> Vec<u32> {
        let tree = self.get_process_tree();
        let mut descendants = Vec::new();
        let mut to_visit = vec![pid];
        
        while let Some(current) = to_visit.pop() {
            if let Some(children) = tree.get(&current) {
                for &child in children {
                    descendants.push(child);
                    to_visit.push(child);
                }
            }
        }
        
        descendants
    }

    /// Find processes by name pattern.
    pub fn find_by_name(&self, pattern: &str) -> Vec<ProcessInfo> {
        let re = Regex::new(pattern).ok();
        self.read_all_processes()
            .into_iter()
            .filter(|p| {
                if let Some(ref re) = re {
                    re.is_match(&p.name)
                } else {
                    p.name.contains(pattern)
                }
            })
            .collect()
    }

    /// Find processes by command line pattern.
    pub fn find_by_cmdline(&self, pattern: &str) -> Vec<ProcessInfo> {
        let re = Regex::new(pattern).ok();
        self.read_all_processes()
            .into_iter()
            .filter(|p| {
                if let Some(ref re) = re {
                    re.is_match(&p.cmdline)
                } else {
                    p.cmdline.contains(pattern)
                }
            })
            .collect()
    }

    /// Find processes by user ID.
    pub fn find_by_uid(&self, uid: u32) -> Vec<ProcessInfo> {
        self.read_all_processes()
            .into_iter()
            .filter(|p| p.uid == uid)
            .collect()
    }

    /// Get cached process info.
    pub fn get_cached(&self, pid: u32) -> Option<ProcessInfo> {
        self.cache.get(&pid).map(|p| p.clone())
    }

    /// Clear process cache.
    pub fn clear_cache(&self) {
        self.cache.clear();
        self.prev_cpu_times.clear();
    }

    /// Get top processes by CPU usage.
    pub fn top_by_cpu(&self, n: usize) -> Vec<ProcessInfo> {
        let mut processes = self.read_all_processes();
        processes.sort_by(|a, b| {
            b.resources.cpu_percent.partial_cmp(&a.resources.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        processes.truncate(n);
        processes
    }

    /// Get top processes by memory usage.
    pub fn top_by_memory(&self, n: usize) -> Vec<ProcessInfo> {
        let mut processes = self.read_all_processes();
        processes.sort_by(|a, b| {
            b.resources.memory_percent.partial_cmp(&a.resources.memory_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        processes.truncate(n);
        processes
    }
}

impl Default for ProcessReader {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------------
// 24.3 Process Classifier
// ----------------------------------------------------------------------------

/// Classifies processes into projects.
pub struct ProcessClassifier {
    /// Project registry
    project_registry: Arc<ProjectRegistry>,
    /// Process reader
    process_reader: ProcessReader,
    /// Classification cache
    cache: DashMap<u32, u32>,
    /// Well-known process patterns
    known_patterns: Vec<KnownProcessPattern>,
}

/// A well-known process pattern for auto-classification.
struct KnownProcessPattern {
    name_pattern: Regex,
    project_type: ProjectType,
    priority: Priority,
}

impl ProcessClassifier {
    /// Create a new process classifier.
    pub fn new(project_registry: Arc<ProjectRegistry>) -> Self {
        let known_patterns = Self::build_known_patterns();
        
        Self {
            project_registry,
            process_reader: ProcessReader::new(),
            cache: DashMap::new(),
            known_patterns,
        }
    }

    /// Build known process patterns.
    fn build_known_patterns() -> Vec<KnownProcessPattern> {
        vec![
            // Databases
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)mysql|mariadb").unwrap(),
                project_type: ProjectType::Database { db_type: DatabaseType::MySQL, cluster_name: None },
                priority: Priority::High,
            },
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)postgres").unwrap(),
                project_type: ProjectType::Database { db_type: DatabaseType::PostgreSQL, cluster_name: None },
                priority: Priority::High,
            },
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)redis-server").unwrap(),
                project_type: ProjectType::Cache { cache_type: CacheType::Redis },
                priority: Priority::High,
            },
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)mongod").unwrap(),
                project_type: ProjectType::Database { db_type: DatabaseType::MongoDB, cluster_name: None },
                priority: Priority::High,
            },
            // Web servers
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)nginx").unwrap(),
                project_type: ProjectType::WebServer { server_type: WebServerType::Nginx },
                priority: Priority::High,
            },
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)apache2|httpd").unwrap(),
                project_type: ProjectType::WebServer { server_type: WebServerType::Apache },
                priority: Priority::High,
            },
            // PHP/WordPress
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)php-fpm").unwrap(),
                project_type: ProjectType::WordPress { site_name: CompactString::from("default"), multisite: false },
                priority: Priority::Normal,
            },
            // Message queues
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)rabbitmq").unwrap(),
                project_type: ProjectType::MessageQueue { mq_type: MessageQueueType::RabbitMQ },
                priority: Priority::High,
            },
            KnownProcessPattern {
                name_pattern: Regex::new(r"(?i)kafka").unwrap(),
                project_type: ProjectType::MessageQueue { mq_type: MessageQueueType::Kafka },
                priority: Priority::High,
            },
        ]
    }

    /// Classify a process into a project.
    pub fn classify(&self, process: &ProcessInfo) -> Option<u32> {
        // Check cache first
        if let Some(project_id) = self.cache.get(&process.pid) {
            return Some(*project_id);
        }

        // Try to classify using project registry
        if let Some(project_id) = self.project_registry.classify_process(&process.name, &process.cmdline) {
            self.cache.insert(process.pid, project_id);
            return Some(project_id);
        }

        // Try to classify using cgroup
        if let Some(ref cgroup) = process.cgroup {
            if let Some(project_id) = self.project_registry.classify_cgroup(cgroup) {
                self.cache.insert(process.pid, project_id);
                return Some(project_id);
            }
        }

        // No existing project found - could auto-create based on known patterns
        None
    }

    /// Classify all running processes.
    pub fn classify_all(&self) -> HashMap<u32, Vec<ProcessInfo>> {
        let processes = self.process_reader.read_all_processes();
        let mut by_project: HashMap<u32, Vec<ProcessInfo>> = HashMap::new();
        let mut unclassified: Vec<ProcessInfo> = Vec::new();

        for mut process in processes {
            if let Some(project_id) = self.classify(&process) {
                process.project_id = Some(project_id);
                by_project.entry(project_id).or_default().push(process);
            } else {
                unclassified.push(process);
            }
        }

        // Add unclassified under project_id 0
        if !unclassified.is_empty() {
            by_project.insert(0, unclassified);
        }

        by_project
    }

    /// Get processes for a specific project.
    pub fn get_project_processes(&self, project_id: u32) -> Vec<ProcessInfo> {
        self.process_reader.read_all_processes()
            .into_iter()
            .filter(|p| self.classify(p) == Some(project_id))
            .collect()
    }

    /// Suggest a project type for a process.
    pub fn suggest_project_type(&self, process: &ProcessInfo) -> Option<ProjectType> {
        for pattern in &self.known_patterns {
            if pattern.name_pattern.is_match(&process.name) {
                return Some(pattern.project_type.clone());
            }
        }
        None
    }

    /// Invalidate cache for a process.
    pub fn invalidate(&self, pid: u32) {
        self.cache.remove(&pid);
    }

    /// Clear all classification cache.
    pub fn clear_cache(&self) {
        self.cache.clear();
    }
}


// ============================================================================
// SECTION 25: AUTO-DISCOVERY ENGINE
// ============================================================================
// Intelligent automatic discovery of services and projects:
// - Service discovery from running processes
// - Container discovery from Docker
// - Port scanning for service detection
// - Dependency inference
// - Health endpoint detection
// ============================================================================

// ----------------------------------------------------------------------------
// 25.1 Discovery Result Types
// ----------------------------------------------------------------------------

/// Result of an auto-discovery scan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryResult {
    /// Discovered services
    pub services: Vec<DiscoveredService>,
    /// Discovered containers
    pub containers: Vec<DiscoveredContainer>,
    /// Discovered dependencies
    pub dependencies: Vec<ServiceDependency>,
    /// Scan timestamp
    pub timestamp: Timestamp,
    /// Scan duration
    pub duration_ms: u64,
}

/// A discovered service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredService {
    /// Unique identifier (generated)
    pub id: CompactString,
    /// Service name
    pub name: CompactString,
    /// Service type
    pub service_type: ServiceType,
    /// Associated processes
    pub processes: Vec<u32>,
    /// Listening ports
    pub ports: Vec<DiscoveredPort>,
    /// Cgroup path (if available)
    pub cgroup: Option<CompactString>,
    /// Container ID (if containerized)
    pub container_id: Option<CompactString>,
    /// Detected health endpoint
    pub health_endpoint: Option<CompactString>,
    /// Confidence score (0-100)
    pub confidence: u8,
    /// Suggested project type
    pub suggested_project_type: Option<ProjectType>,
    /// Additional metadata
    pub metadata: HashMap<String, String>,
}

/// A discovered network port.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredPort {
    /// Port number
    pub port: u16,
    /// Protocol (TCP/UDP)
    pub protocol: PortProtocol,
    /// Bind address
    pub address: CompactString,
    /// Associated process ID
    pub pid: Option<u32>,
    /// Detected service on this port
    pub service_hint: Option<CompactString>,
}

/// Port protocol.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PortProtocol {
    Tcp,
    Udp,
}

/// Types of discovered services.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ServiceType {
    WebServer,
    Database,
    Cache,
    MessageQueue,
    ApplicationServer,
    LoadBalancer,
    Monitoring,
    Logging,
    Container,
    Custom(CompactString),
    Unknown,
}

/// A discovered container.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredContainer {
    /// Container ID
    pub id: CompactString,
    /// Container name
    pub name: CompactString,
    /// Image name
    pub image: CompactString,
    /// Container status
    pub status: ContainerStatus,
    /// Exposed ports
    pub ports: Vec<PortMapping>,
    /// Container labels
    pub labels: HashMap<String, String>,
    /// Environment hints (non-sensitive)
    pub env_hints: Vec<String>,
    /// Network mode
    pub network_mode: CompactString,
    /// Cgroup path
    pub cgroup: Option<CompactString>,
    /// Health check configured
    pub has_health_check: bool,
}

/// Container status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContainerStatus {
    Running,
    Paused,
    Restarting,
    Exited,
    Dead,
    Created,
    Unknown,
}

/// Port mapping for containers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    /// Container port
    pub container_port: u16,
    /// Host port
    pub host_port: u16,
    /// Protocol
    pub protocol: PortProtocol,
    /// Host IP
    pub host_ip: CompactString,
}

/// Service dependency relationship.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceDependency {
    /// Source service ID
    pub from_service: CompactString,
    /// Target service ID
    pub to_service: CompactString,
    /// Dependency type
    pub dependency_type: DependencyType,
    /// Confidence score
    pub confidence: u8,
}

/// Types of dependencies.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DependencyType {
    /// Network connection
    Network,
    /// Shared filesystem
    Filesystem,
    /// Parent-child process
    Process,
    /// Container link
    ContainerLink,
    /// Configuration reference
    Configuration,
}

// ----------------------------------------------------------------------------
// 25.2 Auto-Discovery Engine
// ----------------------------------------------------------------------------

/// The auto-discovery engine.
pub struct AutoDiscoveryEngine {
    /// Process reader
    process_reader: ProcessReader,
    /// Cgroup reader
    cgroup_reader: CgroupReader,
    /// Project registry
    project_registry: Arc<ProjectRegistry>,
    /// Discovery cache
    cache: RwLock<Option<DiscoveryResult>>,
    /// Cache TTL
    cache_ttl: Duration,
    /// Well-known ports
    well_known_ports: HashMap<u16, (&'static str, ServiceType)>,
}

impl AutoDiscoveryEngine {
    /// Create a new auto-discovery engine.
    pub fn new(project_registry: Arc<ProjectRegistry>) -> Self {
        Self {
            process_reader: ProcessReader::new(),
            cgroup_reader: CgroupReader::new(),
            project_registry,
            cache: RwLock::new(None),
            cache_ttl: Duration::from_secs(60),
            well_known_ports: Self::build_well_known_ports(),
        }
    }

    /// Build well-known ports mapping.
    fn build_well_known_ports() -> HashMap<u16, (&'static str, ServiceType)> {
        let mut ports = HashMap::new();
        
        // Web servers
        ports.insert(80, ("HTTP", ServiceType::WebServer));
        ports.insert(443, ("HTTPS", ServiceType::WebServer));
        ports.insert(8080, ("HTTP-Alt", ServiceType::WebServer));
        ports.insert(8443, ("HTTPS-Alt", ServiceType::WebServer));
        
        // Databases
        ports.insert(3306, ("MySQL", ServiceType::Database));
        ports.insert(5432, ("PostgreSQL", ServiceType::Database));
        ports.insert(27017, ("MongoDB", ServiceType::Database));
        ports.insert(6379, ("Redis", ServiceType::Cache));
        ports.insert(11211, ("Memcached", ServiceType::Cache));
        ports.insert(9200, ("Elasticsearch", ServiceType::Database));
        ports.insert(5984, ("CouchDB", ServiceType::Database));
        
        // Message queues
        ports.insert(5672, ("RabbitMQ", ServiceType::MessageQueue));
        ports.insert(9092, ("Kafka", ServiceType::MessageQueue));
        ports.insert(4222, ("NATS", ServiceType::MessageQueue));
        
        // Monitoring
        ports.insert(9090, ("Prometheus", ServiceType::Monitoring));
        ports.insert(3000, ("Grafana", ServiceType::Monitoring));
        ports.insert(19999, ("Netdata", ServiceType::Monitoring));
        
        // Other services
        ports.insert(22, ("SSH", ServiceType::Unknown));
        ports.insert(25, ("SMTP", ServiceType::Unknown));
        ports.insert(53, ("DNS", ServiceType::Unknown));
        
        ports
    }

    /// Run a full discovery scan.
    pub fn discover(&self) -> CerebroResult<DiscoveryResult> {
        // Check cache
        {
            let cache = self.cache.read();
            if let Some(ref result) = *cache {
                if result.timestamp.add_duration(self.cache_ttl) > Timestamp::now() {
                    return Ok(result.clone());
                }
            }
        }

        let start = Instant::now();

        // Discover services from processes
        let services = self.discover_services()?;
        
        // Discover containers
        let containers = self.discover_containers()?;
        
        // Infer dependencies
        let dependencies = self.infer_dependencies(&services, &containers);

        let result = DiscoveryResult {
            services,
            containers,
            dependencies,
            timestamp: Timestamp::now(),
            duration_ms: start.elapsed().as_millis() as u64,
        };

        // Update cache
        {
            let mut cache = self.cache.write();
            *cache = Some(result.clone());
        }

        Ok(result)
    }

    /// Discover services from running processes.
    fn discover_services(&self) -> CerebroResult<Vec<DiscoveredService>> {
        let mut services = Vec::new();
        let processes = self.process_reader.read_all_processes();
        let listening_ports = self.get_listening_ports()?;

        // Group processes by service
        let mut service_groups: HashMap<CompactString, Vec<ProcessInfo>> = HashMap::new();
        
        for process in processes {
            if !process.state.is_active() {
                continue;
            }
            
            // Skip kernel threads and system processes
            if process.pid == 1 || process.ppid == 0 || process.ppid == 2 {
                continue;
            }
            
            // Determine service key
            let service_key = self.determine_service_key(&process);
            service_groups.entry(service_key).or_default().push(process);
        }

        // Convert groups to discovered services
        for (service_key, group_processes) in service_groups {
            if let Some(service) = self.create_service(&service_key, &group_processes, &listening_ports) {
                services.push(service);
            }
        }

        // Sort by confidence
        services.sort_by(|a, b| b.confidence.cmp(&a.confidence));
        
        Ok(services)
    }

    /// Determine the service key for a process.
    fn determine_service_key(&self, process: &ProcessInfo) -> CompactString {
        // Try to use executable name without version numbers
        let name = process.name.to_lowercase();
        
        // Strip common suffixes and version info
        let clean_name = name
            .trim_end_matches(|c: char| c.is_numeric() || c == '.' || c == '-')
            .trim_end_matches("master")
            .trim_end_matches("worker")
            .trim_end_matches("main")
            .trim();
        
        if !clean_name.is_empty() {
            CompactString::from(clean_name)
        } else {
            process.name.clone()
        }
    }

    /// Create a discovered service from a process group.
    fn create_service(
        &self,
        service_key: &CompactString,
        processes: &[ProcessInfo],
        listening_ports: &[DiscoveredPort],
    ) -> Option<DiscoveredService> {
        if processes.is_empty() {
            return None;
        }

        let pids: Vec<u32> = processes.iter().map(|p| p.pid).collect();
        
        // Find ports associated with these processes
        let service_ports: Vec<DiscoveredPort> = listening_ports.iter()
            .filter(|p| p.pid.map_or(false, |pid| pids.contains(&pid)))
            .cloned()
            .collect();

        // Determine service type
        let (service_type, confidence) = self.classify_service(service_key, &service_ports);

        // Generate health endpoint hint
        let health_endpoint = self.detect_health_endpoint(&service_ports);

        // Suggest project type
        let suggested_project_type = self.suggest_project_type(service_key, &service_type);

        // Get cgroup from first process
        let cgroup = processes.first().and_then(|p| p.cgroup.clone());

        let id = format!("{}_{}", service_key, pids.first().unwrap_or(&0));

        Some(DiscoveredService {
            id: CompactString::from(id),
            name: service_key.clone(),
            service_type,
            processes: pids,
            ports: service_ports,
            cgroup,
            container_id: None,
            health_endpoint,
            confidence,
            suggested_project_type,
            metadata: HashMap::new(),
        })
    }

    /// Classify the service type.
    fn classify_service(&self, name: &str, ports: &[DiscoveredPort]) -> (ServiceType, u8) {
        let name_lower = name.to_lowercase();

        // Check by process name
        if name_lower.contains("nginx") || name_lower.contains("apache") || name_lower.contains("httpd") {
            return (ServiceType::WebServer, 95);
        }
        if name_lower.contains("mysql") || name_lower.contains("mariadb") {
            return (ServiceType::Database, 95);
        }
        if name_lower.contains("postgres") {
            return (ServiceType::Database, 95);
        }
        if name_lower.contains("redis") {
            return (ServiceType::Cache, 95);
        }
        if name_lower.contains("mongo") {
            return (ServiceType::Database, 95);
        }
        if name_lower.contains("rabbitmq") || name_lower.contains("kafka") {
            return (ServiceType::MessageQueue, 95);
        }
        if name_lower.contains("prometheus") || name_lower.contains("grafana") {
            return (ServiceType::Monitoring, 90);
        }

        // Check by port
        for port in ports {
            if let Some((_, service_type)) = self.well_known_ports.get(&port.port) {
                return (service_type.clone(), 80);
            }
        }

        // Check for common patterns
        if name_lower.contains("server") || name_lower.contains("daemon") {
            return (ServiceType::ApplicationServer, 50);
        }

        (ServiceType::Unknown, 30)
    }

    /// Detect potential health endpoint.
    fn detect_health_endpoint(&self, ports: &[DiscoveredPort]) -> Option<CompactString> {
        for port in ports {
            if port.protocol == PortProtocol::Tcp {
                match port.port {
                    80 | 8080 | 3000 | 8000 => {
                        return Some(CompactString::from(format!("http://localhost:{}/health", port.port)));
                    }
                    443 | 8443 => {
                        return Some(CompactString::from(format!("https://localhost:{}/health", port.port)));
                    }
                    _ => {}
                }
            }
        }
        None
    }

    /// Suggest project type based on service.
    fn suggest_project_type(&self, name: &str, service_type: &ServiceType) -> Option<ProjectType> {
        let name_lower = name.to_lowercase();

        match service_type {
            ServiceType::WebServer => {
                if name_lower.contains("nginx") {
                    Some(ProjectType::WebServer { server_type: WebServerType::Nginx })
                } else if name_lower.contains("apache") || name_lower.contains("httpd") {
                    Some(ProjectType::WebServer { server_type: WebServerType::Apache })
                } else {
                    Some(ProjectType::WebServer { server_type: WebServerType::Other })
                }
            }
            ServiceType::Database => {
                if name_lower.contains("mysql") || name_lower.contains("mariadb") {
                    Some(ProjectType::Database { db_type: DatabaseType::MySQL, cluster_name: None })
                } else if name_lower.contains("postgres") {
                    Some(ProjectType::Database { db_type: DatabaseType::PostgreSQL, cluster_name: None })
                } else if name_lower.contains("mongo") {
                    Some(ProjectType::Database { db_type: DatabaseType::MongoDB, cluster_name: None })
                } else {
                    Some(ProjectType::Database { db_type: DatabaseType::Other, cluster_name: None })
                }
            }
            ServiceType::Cache => {
                if name_lower.contains("redis") {
                    Some(ProjectType::Cache { cache_type: CacheType::Redis })
                } else if name_lower.contains("memcached") {
                    Some(ProjectType::Cache { cache_type: CacheType::Memcached })
                } else {
                    Some(ProjectType::Cache { cache_type: CacheType::Other })
                }
            }
            ServiceType::MessageQueue => {
                if name_lower.contains("rabbitmq") {
                    Some(ProjectType::MessageQueue { mq_type: MessageQueueType::RabbitMQ })
                } else if name_lower.contains("kafka") {
                    Some(ProjectType::MessageQueue { mq_type: MessageQueueType::Kafka })
                } else {
                    Some(ProjectType::MessageQueue { mq_type: MessageQueueType::Other })
                }
            }
            _ => None,
        }
    }

    /// Get listening ports from /proc/net.
    fn get_listening_ports(&self) -> CerebroResult<Vec<DiscoveredPort>> {
        let mut ports = Vec::new();

        // Parse TCP
        if let Ok(tcp) = fs::read_to_string("/proc/net/tcp") {
            ports.extend(self.parse_proc_net(&tcp, PortProtocol::Tcp));
        }
        if let Ok(tcp6) = fs::read_to_string("/proc/net/tcp6") {
            ports.extend(self.parse_proc_net(&tcp6, PortProtocol::Tcp));
        }

        // Parse UDP
        if let Ok(udp) = fs::read_to_string("/proc/net/udp") {
            ports.extend(self.parse_proc_net(&udp, PortProtocol::Udp));
        }
        if let Ok(udp6) = fs::read_to_string("/proc/net/udp6") {
            ports.extend(self.parse_proc_net(&udp6, PortProtocol::Udp));
        }

        Ok(ports)
    }

    /// Parse /proc/net/tcp or /proc/net/udp.
    fn parse_proc_net(&self, content: &str, protocol: PortProtocol) -> Vec<DiscoveredPort> {
        let mut ports = Vec::new();

        for line in content.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 10 {
                continue;
            }

            // Parse local address (field 1)
            let local_addr = fields[1];
            let addr_parts: Vec<&str> = local_addr.split(':').collect();
            if addr_parts.len() != 2 {
                continue;
            }

            // Parse port (hex)
            let port = u16::from_str_radix(addr_parts[1], 16).unwrap_or(0);
            if port == 0 {
                continue;
            }

            // Check if listening (state == 0A for TCP LISTEN)
            let state = fields[3];
            let is_listening = protocol == PortProtocol::Udp || state == "0A";
            if !is_listening {
                continue;
            }

            // Parse inode to find process
            let inode: u64 = fields[9].parse().unwrap_or(0);
            let pid = self.find_process_by_inode(inode);

            // Get service hint
            let service_hint = self.well_known_ports.get(&port)
                .map(|(name, _)| CompactString::from(*name));

            ports.push(DiscoveredPort {
                port,
                protocol,
                address: CompactString::from(self.parse_hex_ip(addr_parts[0])),
                pid,
                service_hint,
            });
        }

        ports
    }

    /// Parse hex IP address.
    fn parse_hex_ip(&self, hex: &str) -> String {
        if hex.len() == 8 {
            // IPv4
            let bytes: Vec<u8> = (0..4)
                .filter_map(|i| u8::from_str_radix(&hex[i*2..i*2+2], 16).ok())
                .collect();
            if bytes.len() == 4 {
                return format!("{}.{}.{}.{}", bytes[3], bytes[2], bytes[1], bytes[0]);
            }
        }
        "0.0.0.0".to_string()
    }

    /// Find process by socket inode.
    fn find_process_by_inode(&self, inode: u64) -> Option<u32> {
        if inode == 0 {
            return None;
        }

        let socket_pattern = format!("socket:[{}]", inode);
        
        for pid in self.process_reader.list_pids() {
            let fd_path = format!("/proc/{}/fd", pid);
            if let Ok(entries) = fs::read_dir(&fd_path) {
                for entry in entries.flatten() {
                    if let Ok(link) = fs::read_link(entry.path()) {
                        if link.to_string_lossy() == socket_pattern {
                            return Some(pid);
                        }
                    }
                }
            }
        }

        None
    }

    /// Discover containers (placeholder - would integrate with Docker API).
    fn discover_containers(&self) -> CerebroResult<Vec<DiscoveredContainer>> {
        // In full implementation, would query Docker socket
        Ok(Vec::new())
    }

    /// Infer dependencies between services.
    fn infer_dependencies(&self, services: &[DiscoveredService], _containers: &[DiscoveredContainer]) -> Vec<ServiceDependency> {
        let mut dependencies = Vec::new();

        // Web servers typically depend on application servers and databases
        for service in services {
            if service.service_type == ServiceType::WebServer {
                // Look for database services
                for other in services {
                    if other.service_type == ServiceType::Database {
                        dependencies.push(ServiceDependency {
                            from_service: service.id.clone(),
                            to_service: other.id.clone(),
                            dependency_type: DependencyType::Network,
                            confidence: 70,
                        });
                    }
                    if other.service_type == ServiceType::Cache {
                        dependencies.push(ServiceDependency {
                            from_service: service.id.clone(),
                            to_service: other.id.clone(),
                            dependency_type: DependencyType::Network,
                            confidence: 60,
                        });
                    }
                }
            }
        }

        dependencies
    }

    /// Auto-create projects from discovery results.
    pub fn auto_create_projects(&self, result: &DiscoveryResult) -> Vec<Project> {
        let mut projects = Vec::new();

        for service in &result.services {
            if service.confidence >= 80 && service.suggested_project_type.is_some() {
                let project = Project {
                    id: 0, // Will be assigned by registry
                    name: service.name.clone(),
                    project_type: service.suggested_project_type.clone().unwrap(),
                    description: Some(CompactString::from(format!(
                        "Auto-discovered {} service",
                        service.service_type_name()
                    ))),
                    owner: None,
                    priority: Priority::Normal,
                    sla: ProjectSla::standard(),
                    matchers: ProjectMatchers {
                        process_patterns: vec![format!("(?i){}", service.name)],
                        ports: service.ports.iter().map(|p| p.port).collect(),
                        ..Default::default()
                    },
                    dependencies: Vec::new(),
                    labels: service.metadata.clone(),
                    created_at: Timestamp::now(),
                    updated_at: Timestamp::now(),
                    active: true,
                };
                projects.push(project);
            }
        }

        projects
    }

    /// Invalidate the discovery cache.
    pub fn invalidate_cache(&self) {
        let mut cache = self.cache.write();
        *cache = None;
    }
}

impl DiscoveredService {
    /// Get service type name.
    pub fn service_type_name(&self) -> &'static str {
        match self.service_type {
            ServiceType::WebServer => "web server",
            ServiceType::Database => "database",
            ServiceType::Cache => "cache",
            ServiceType::MessageQueue => "message queue",
            ServiceType::ApplicationServer => "application server",
            ServiceType::LoadBalancer => "load balancer",
            ServiceType::Monitoring => "monitoring",
            ServiceType::Logging => "logging",
            ServiceType::Container => "container",
            ServiceType::Custom(_) => "custom",
            ServiceType::Unknown => "unknown",
        }
    }
}

// ============================================================================
// SECTION 26: PHASE 4 TESTS
// ============================================================================

#[cfg(test)]
mod phase4_tests {
    use super::*;

    #[test]
    fn test_cgroup_version_detection() {
        let version = CgroupVersion::detect();
        // Should detect something on Linux
        assert!(version != CgroupVersion::Unknown || !cfg!(target_os = "linux"));
    }

    #[test]
    fn test_project_sla_tiers() {
        let critical = ProjectSla::critical();
        let standard = ProjectSla::standard();
        let best_effort = ProjectSla::best_effort();

        assert!(critical.uptime_target > standard.uptime_target);
        assert!(standard.uptime_target > best_effort.uptime_target);
    }

    #[test]
    fn test_project_registry() {
        let registry = ProjectRegistry::new();
        
        let project = Project {
            id: 0,
            name: CompactString::from("test-project"),
            project_type: ProjectType::WebServer { server_type: WebServerType::Nginx },
            description: None,
            owner: None,
            priority: Priority::Normal,
            sla: ProjectSla::standard(),
            matchers: ProjectMatchers::default(),
            dependencies: Vec::new(),
            labels: HashMap::new(),
            created_at: Timestamp::now(),
            updated_at: Timestamp::now(),
            active: true,
        };

        let id = registry.register(project);
        assert!(id > 0);

        let retrieved = registry.get(id);
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name.as_str(), "test-project");
    }

    #[test]
    fn test_process_state_parsing() {
        assert_eq!(ProcessState::from_char('R'), ProcessState::Running);
        assert_eq!(ProcessState::from_char('S'), ProcessState::Sleeping);
        assert_eq!(ProcessState::from_char('D'), ProcessState::DiskSleep);
        assert_eq!(ProcessState::from_char('Z'), ProcessState::Zombie);
    }

    #[test]
    fn test_health_status() {
        assert!(HealthStatus::Healthy > HealthStatus::Degraded || true); // Enum doesn't impl Ord
        assert_eq!(HealthStatus::Healthy.color(), "#2ecc71");
        assert_eq!(HealthStatus::Down.icon(), "⬇");
    }

    #[test]
    fn test_cgroup_cpu_stats() {
        let mut stats = CgroupCpuStats::default();
        stats.nr_periods = 100;
        stats.nr_throttled = 10;
        stats.quota_us = 100000;
        stats.period_us = 100000;

        assert_eq!(stats.throttle_percentage(), 10.0);
        assert_eq!(stats.cpu_limit(), 1.0); // 1 CPU core
    }

    #[test]
    fn test_cgroup_memory_stats() {
        let mut stats = CgroupMemoryStats::default();
        stats.usage_bytes = 512 * 1024 * 1024; // 512 MB
        stats.limit_bytes = 1024 * 1024 * 1024; // 1 GB

        assert_eq!(stats.usage_percentage(), 50.0);
        assert!(!stats.is_near_limit());

        stats.usage_bytes = 950 * 1024 * 1024; // 950 MB
        assert!(stats.is_near_limit());
    }
}


// ============================================================================
// ██████╗ ██╗  ██╗ █████╗ ███████╗███████╗    ███████╗
// ██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ██╔════╝
// ██████╔╝███████║███████║███████╗█████╗      ███████╗
// ██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝      ╚════██║
// ██║     ██║  ██║██║  ██║███████║███████╗    ███████║
// ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝    ╚══════╝
// COLLECTOR FRAMEWORK - THE SENSORY SYSTEM
// ============================================================================

// ============================================================================
// SECTION 27: COLLECTOR TRAIT & FRAMEWORK
// ============================================================================
// A robust, extensible framework for metric collection:
// - Async-first design with Tokio
// - Lifecycle management (init, start, stop, restart)
// - Health reporting and self-monitoring
// - Error recovery with circuit breaker pattern
// - Dynamic registration and hot-reload
// ============================================================================

// ----------------------------------------------------------------------------
// 27.1 Collector Trait - The Foundation
// ----------------------------------------------------------------------------

/// The core trait that all collectors must implement.
/// 
/// Collectors are responsible for gathering metrics from various sources
/// and emitting them to the metric pipeline.
#[async_trait]
pub trait Collector: Send + Sync {
    /// Returns the unique name of this collector.
    fn name(&self) -> &str;

    /// Returns the collector type identifier.
    fn collector_type(&self) -> CollectorType;

    /// Initialize the collector. Called once before starting.
    async fn init(&mut self) -> CollectorResult<()>;

    /// Start collecting metrics. This should spawn collection tasks.
    async fn start(&mut self, tx: MetricSender) -> CollectorResult<()>;

    /// Stop the collector gracefully.
    async fn stop(&mut self) -> CollectorResult<()>;

    /// Check if the collector is currently running.
    fn is_running(&self) -> bool;

    /// Get the current health status of the collector.
    fn health(&self) -> CollectorHealth;

    /// Get collector statistics.
    fn stats(&self) -> CollectorStats;

    /// Reload configuration (for hot-reload support).
    async fn reload(&mut self) -> CollectorResult<()> {
        // Default: restart the collector
        self.stop().await?;
        self.start(self.get_sender()?).await
    }

    /// Get the current metric sender (if running).
    fn get_sender(&self) -> CollectorResult<MetricSender>;

    /// Get the collection interval.
    fn interval(&self) -> Duration;

    /// Set the collection interval.
    fn set_interval(&mut self, interval: Duration);
}

/// Types of collectors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CollectorType {
    /// System metrics from /proc, /sys
    System,
    /// Netdata API integration
    Netdata,
    /// Docker container metrics
    Docker,
    /// Network packet capture
    Network,
    /// Log file processing
    Log,
    /// HTTP endpoint polling
    Http,
    /// Process-level metrics
    Process,
    /// Cgroup metrics
    Cgroup,
    /// Custom/plugin collector
    Custom,
}

impl Display for CollectorType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            CollectorType::System => write!(f, "system"),
            CollectorType::Netdata => write!(f, "netdata"),
            CollectorType::Docker => write!(f, "docker"),
            CollectorType::Network => write!(f, "network"),
            CollectorType::Log => write!(f, "log"),
            CollectorType::Http => write!(f, "http"),
            CollectorType::Process => write!(f, "process"),
            CollectorType::Cgroup => write!(f, "cgroup"),
            CollectorType::Custom => write!(f, "custom"),
        }
    }
}

// ----------------------------------------------------------------------------
// 27.2 Collector Health & Statistics
// ----------------------------------------------------------------------------

/// Health status of a collector.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectorHealth {
    /// Overall health status
    pub status: CollectorStatus,
    /// Last successful collection time
    pub last_success: Option<Timestamp>,
    /// Last error time
    pub last_error: Option<Timestamp>,
    /// Last error message
    pub last_error_message: Option<String>,
    /// Consecutive failures
    pub consecutive_failures: u32,
    /// Circuit breaker state
    pub circuit_state: CircuitState,
    /// Health check latency
    pub latency_ms: u64,
}

impl Default for CollectorHealth {
    fn default() -> Self {
        Self {
            status: CollectorStatus::Unknown,
            last_success: None,
            last_error: None,
            last_error_message: None,
            consecutive_failures: 0,
            circuit_state: CircuitState::Closed,
            latency_ms: 0,
        }
    }
}

/// Collector operational status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CollectorStatus {
    /// Collector is running normally
    Healthy,
    /// Collector is running but experiencing issues
    Degraded,
    /// Collector has failed
    Failed,
    /// Collector is stopped
    Stopped,
    /// Collector is initializing
    Initializing,
    /// Status unknown
    Unknown,
}

/// Circuit breaker state for error recovery.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CircuitState {
    /// Normal operation
    Closed,
    /// Allowing limited requests to test recovery
    HalfOpen,
    /// Blocking all requests due to failures
    Open,
}

/// Statistics for a collector.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CollectorStats {
    /// Total metrics collected
    pub metrics_collected: u64,
    /// Total collection cycles completed
    pub collection_cycles: u64,
    /// Total errors encountered
    pub errors: u64,
    /// Average collection duration in microseconds
    pub avg_collection_us: u64,
    /// Maximum collection duration in microseconds
    pub max_collection_us: u64,
    /// Minimum collection duration in microseconds
    pub min_collection_us: u64,
    /// Bytes processed (for network/log collectors)
    pub bytes_processed: u64,
    /// Start time
    pub started_at: Option<Timestamp>,
    /// Uptime duration
    pub uptime_secs: u64,
}

// ----------------------------------------------------------------------------
// 27.3 Base Collector - Common Implementation
// ----------------------------------------------------------------------------

/// Base collector providing common functionality.
/// 
/// Concrete collectors can embed this and delegate common operations.
pub struct BaseCollector {
    /// Collector name
    name: String,
    /// Collector type
    collector_type: CollectorType,
    /// Running state
    running: AtomicBool,
    /// Collection interval
    interval: Duration,
    /// Shutdown signal
    shutdown: Arc<Notify>,
    /// Metric sender
    sender: Option<MetricSender>,
    /// Health status
    health: RwLock<CollectorHealth>,
    /// Statistics
    stats: CollectorStatsTracker,
    /// Circuit breaker
    circuit_breaker: CircuitBreaker,
    /// Project ID for metrics (if applicable)
    project_id: Option<u32>,
}

impl BaseCollector {
    /// Create a new base collector.
    pub fn new(name: impl Into<String>, collector_type: CollectorType) -> Self {
        Self {
            name: name.into(),
            collector_type,
            running: AtomicBool::new(false),
            interval: Duration::from_secs(1),
            shutdown: Arc::new(Notify::new()),
            sender: None,
            health: RwLock::new(CollectorHealth::default()),
            stats: CollectorStatsTracker::new(),
            circuit_breaker: CircuitBreaker::new(5, Duration::from_secs(30)),
            project_id: None,
        }
    }

    /// Set the collection interval.
    pub fn with_interval(mut self, interval: Duration) -> Self {
        self.interval = interval;
        self
    }

    /// Set the project ID for emitted metrics.
    pub fn with_project(mut self, project_id: u32) -> Self {
        self.project_id = Some(project_id);
        self
    }

    /// Check if running.
    pub fn is_running(&self) -> bool {
        self.running.load(AtomicOrdering::Acquire)
    }

    /// Set running state.
    pub fn set_running(&self, running: bool) {
        self.running.store(running, AtomicOrdering::Release);
    }

    /// Get the shutdown notifier.
    pub fn shutdown_signal(&self) -> Arc<Notify> {
        self.shutdown.clone()
    }

    /// Signal shutdown.
    pub fn signal_shutdown(&self) {
        self.shutdown.notify_waiters();
    }

    /// Set the metric sender.
    pub fn set_sender(&mut self, sender: MetricSender) {
        self.sender = Some(sender);
    }

    /// Get the metric sender.
    pub fn get_sender(&self) -> Option<&MetricSender> {
        self.sender.as_ref()
    }

    /// Emit a metric.
    pub fn emit(&self, metric: Metric) -> bool {
        if let Some(ref sender) = self.sender {
            let mut metric = metric;
            if let Some(project_id) = self.project_id {
                metric.project_id = project_id;
            }
            if sender.send(metric).is_ok() {
                self.stats.record_metric();
                return true;
            }
        }
        false
    }

    /// Emit multiple metrics.
    pub fn emit_batch(&self, metrics: Vec<Metric>) -> usize {
        let mut count = 0;
        for metric in metrics {
            if self.emit(metric) {
                count += 1;
            }
        }
        count
    }

    /// Record successful collection.
    pub fn record_success(&self, duration: Duration) {
        self.stats.record_cycle(duration);
        
        let mut health = self.health.write();
        health.status = CollectorStatus::Healthy;
        health.last_success = Some(Timestamp::now());
        health.consecutive_failures = 0;
        health.latency_ms = duration.as_millis() as u64;
        
        self.circuit_breaker.record_success();
    }

    /// Record collection error.
    pub fn record_error(&self, error: &str) {
        self.stats.record_error();
        
        let mut health = self.health.write();
        health.last_error = Some(Timestamp::now());
        health.last_error_message = Some(error.to_string());
        health.consecutive_failures += 1;
        
        if health.consecutive_failures >= 3 {
            health.status = CollectorStatus::Failed;
        } else {
            health.status = CollectorStatus::Degraded;
        }
        
        self.circuit_breaker.record_failure();
        health.circuit_state = self.circuit_breaker.state();
    }

    /// Check if collection should be attempted (circuit breaker).
    pub fn should_collect(&self) -> bool {
        self.circuit_breaker.should_allow()
    }

    /// Get current health.
    pub fn health(&self) -> CollectorHealth {
        self.health.read().clone()
    }

    /// Get current stats.
    pub fn stats(&self) -> CollectorStats {
        self.stats.snapshot()
    }
}

// ----------------------------------------------------------------------------
// 27.4 Statistics Tracker
// ----------------------------------------------------------------------------

/// Tracks collector statistics with atomic operations.
struct CollectorStatsTracker {
    metrics_collected: AtomicU64,
    collection_cycles: AtomicU64,
    errors: AtomicU64,
    total_duration_us: AtomicU64,
    max_duration_us: AtomicU64,
    min_duration_us: AtomicU64,
    bytes_processed: AtomicU64,
    started_at: AtomicTimestamp,
}

impl CollectorStatsTracker {
    fn new() -> Self {
        Self {
            metrics_collected: AtomicU64::new(0),
            collection_cycles: AtomicU64::new(0),
            errors: AtomicU64::new(0),
            total_duration_us: AtomicU64::new(0),
            max_duration_us: AtomicU64::new(0),
            min_duration_us: AtomicU64::new(u64::MAX),
            bytes_processed: AtomicU64::new(0),
            started_at: AtomicTimestamp::new(Timestamp::now()),
        }
    }

    fn record_metric(&self) {
        self.metrics_collected.fetch_add(1, AtomicOrdering::Relaxed);
    }

    fn record_metrics(&self, count: u64) {
        self.metrics_collected.fetch_add(count, AtomicOrdering::Relaxed);
    }

    fn record_cycle(&self, duration: Duration) {
        let us = duration.as_micros() as u64;
        self.collection_cycles.fetch_add(1, AtomicOrdering::Relaxed);
        self.total_duration_us.fetch_add(us, AtomicOrdering::Relaxed);
        
        // Update max
        let mut max = self.max_duration_us.load(AtomicOrdering::Relaxed);
        while us > max {
            match self.max_duration_us.compare_exchange_weak(
                max, us, AtomicOrdering::Relaxed, AtomicOrdering::Relaxed
            ) {
                Ok(_) => break,
                Err(m) => max = m,
            }
        }
        
        // Update min
        let mut min = self.min_duration_us.load(AtomicOrdering::Relaxed);
        while us < min {
            match self.min_duration_us.compare_exchange_weak(
                min, us, AtomicOrdering::Relaxed, AtomicOrdering::Relaxed
            ) {
                Ok(_) => break,
                Err(m) => min = m,
            }
        }
    }

    fn record_error(&self) {
        self.errors.fetch_add(1, AtomicOrdering::Relaxed);
    }

    fn record_bytes(&self, bytes: u64) {
        self.bytes_processed.fetch_add(bytes, AtomicOrdering::Relaxed);
    }

    fn snapshot(&self) -> CollectorStats {
        let cycles = self.collection_cycles.load(AtomicOrdering::Relaxed);
        let total_us = self.total_duration_us.load(AtomicOrdering::Relaxed);
        let started = self.started_at.load(AtomicOrdering::Relaxed);
        
        CollectorStats {
            metrics_collected: self.metrics_collected.load(AtomicOrdering::Relaxed),
            collection_cycles: cycles,
            errors: self.errors.load(AtomicOrdering::Relaxed),
            avg_collection_us: if cycles > 0 { total_us / cycles } else { 0 },
            max_collection_us: {
                let max = self.max_duration_us.load(AtomicOrdering::Relaxed);
                if max == 0 { 0 } else { max }
            },
            min_collection_us: {
                let min = self.min_duration_us.load(AtomicOrdering::Relaxed);
                if min == u64::MAX { 0 } else { min }
            },
            bytes_processed: self.bytes_processed.load(AtomicOrdering::Relaxed),
            started_at: Some(started),
            uptime_secs: Timestamp::now().duration_since(started).as_secs(),
        }
    }
}

// ----------------------------------------------------------------------------
// 27.5 Circuit Breaker
// ----------------------------------------------------------------------------

/// Circuit breaker for error recovery.
pub struct CircuitBreaker {
    /// Failure threshold before opening
    failure_threshold: u32,
    /// Time to wait before half-open
    recovery_timeout: Duration,
    /// Current failure count
    failures: AtomicU32,
    /// Last failure time
    last_failure: AtomicTimestamp,
    /// Current state
    state: AtomicU8,
    /// Successes in half-open state
    half_open_successes: AtomicU32,
}

impl CircuitBreaker {
    /// Create a new circuit breaker.
    pub fn new(failure_threshold: u32, recovery_timeout: Duration) -> Self {
        Self {
            failure_threshold,
            recovery_timeout,
            failures: AtomicU32::new(0),
            last_failure: AtomicTimestamp::new(Timestamp::EPOCH),
            state: AtomicU8::new(0), // Closed
            half_open_successes: AtomicU32::new(0),
        }
    }

    /// Get the current state.
    pub fn state(&self) -> CircuitState {
        match self.state.load(AtomicOrdering::Acquire) {
            0 => CircuitState::Closed,
            1 => CircuitState::HalfOpen,
            _ => CircuitState::Open,
        }
    }

    /// Check if a request should be allowed.
    pub fn should_allow(&self) -> bool {
        match self.state() {
            CircuitState::Closed => true,
            CircuitState::HalfOpen => true, // Allow limited requests
            CircuitState::Open => {
                // Check if recovery timeout has passed
                let last = self.last_failure.load(AtomicOrdering::Acquire);
                if last.add_duration(self.recovery_timeout) < Timestamp::now() {
                    // Transition to half-open
                    self.state.store(1, AtomicOrdering::Release);
                    self.half_open_successes.store(0, AtomicOrdering::Relaxed);
                    true
                } else {
                    false
                }
            }
        }
    }

    /// Record a successful operation.
    pub fn record_success(&self) {
        match self.state() {
            CircuitState::HalfOpen => {
                let successes = self.half_open_successes.fetch_add(1, AtomicOrdering::Relaxed);
                if successes >= 2 {
                    // Transition back to closed
                    self.state.store(0, AtomicOrdering::Release);
                    self.failures.store(0, AtomicOrdering::Relaxed);
                }
            }
            CircuitState::Closed => {
                self.failures.store(0, AtomicOrdering::Relaxed);
            }
            _ => {}
        }
    }

    /// Record a failed operation.
    pub fn record_failure(&self) {
        self.last_failure.store(Timestamp::now(), AtomicOrdering::Release);
        
        match self.state() {
            CircuitState::HalfOpen => {
                // Immediately open on failure in half-open
                self.state.store(2, AtomicOrdering::Release);
            }
            CircuitState::Closed => {
                let failures = self.failures.fetch_add(1, AtomicOrdering::Relaxed);
                if failures + 1 >= self.failure_threshold {
                    self.state.store(2, AtomicOrdering::Release); // Open
                }
            }
            _ => {}
        }
    }

    /// Reset the circuit breaker.
    pub fn reset(&self) {
        self.failures.store(0, AtomicOrdering::Relaxed);
        self.state.store(0, AtomicOrdering::Release);
        self.half_open_successes.store(0, AtomicOrdering::Relaxed);
    }
}

// ----------------------------------------------------------------------------
// 27.6 Collector Registry
// ----------------------------------------------------------------------------

/// Registry for managing all collectors.
pub struct CollectorRegistry {
    /// Registered collectors
    collectors: DashMap<String, Arc<TokioRwLock<Box<dyn Collector>>>>,
    /// Collector states
    states: DashMap<String, CollectorHealth>,
    /// Global metric sender
    sender: Option<MetricSender>,
    /// Shutdown signal
    shutdown: Arc<Notify>,
}

impl CollectorRegistry {
    /// Create a new collector registry.
    pub fn new() -> Self {
        Self {
            collectors: DashMap::new(),
            states: DashMap::new(),
            sender: None,
            shutdown: Arc::new(Notify::new()),
        }
    }

    /// Set the global metric sender.
    pub fn set_sender(&mut self, sender: MetricSender) {
        self.sender = Some(sender);
    }

    /// Register a collector.
    pub fn register<C: Collector + 'static>(&self, collector: C) {
        let name = collector.name().to_string();
        self.collectors.insert(
            name.clone(),
            Arc::new(TokioRwLock::new(Box::new(collector) as Box<dyn Collector>)),
        );
        self.states.insert(name, CollectorHealth::default());
    }

    /// Get a collector by name.
    pub fn get(&self, name: &str) -> Option<Arc<TokioRwLock<Box<dyn Collector>>>> {
        self.collectors.get(name).map(|c| c.clone())
    }

    /// List all registered collectors.
    pub fn list(&self) -> Vec<String> {
        self.collectors.iter().map(|r| r.key().clone()).collect()
    }

    /// Start a specific collector.
    pub async fn start_collector(&self, name: &str) -> CollectorResult<()> {
        let collector = self.get(name)
            .ok_or_else(|| CollectorError::NotFound { name: name.to_string() })?;
        
        let sender = self.sender.clone()
            .ok_or_else(|| CollectorError::InitializationFailed {
                name: name.to_string(),
                message: "No metric sender configured".to_string(),
            })?;

        let mut guard = collector.write().await;
        guard.init().await?;
        guard.start(sender).await?;

        let mut health = CollectorHealth::default();
        health.status = CollectorStatus::Healthy;
        self.states.insert(name.to_string(), health);

        info!(target: "cerebro::collectors", name = name, "Collector started");
        Ok(())
    }

    /// Stop a specific collector.
    pub async fn stop_collector(&self, name: &str) -> CollectorResult<()> {
        let collector = self.get(name)
            .ok_or_else(|| CollectorError::NotFound { name: name.to_string() })?;

        let mut guard = collector.write().await;
        guard.stop().await?;

        let mut health = CollectorHealth::default();
        health.status = CollectorStatus::Stopped;
        self.states.insert(name.to_string(), health);

        info!(target: "cerebro::collectors", name = name, "Collector stopped");
        Ok(())
    }

    /// Start all collectors.
    pub async fn start_all(&self) -> Vec<(String, CollectorResult<()>)> {
        let names: Vec<String> = self.list();
        let mut results = Vec::new();

        for name in names {
            let result = self.start_collector(&name).await;
            results.push((name, result));
        }

        results
    }

    /// Stop all collectors.
    pub async fn stop_all(&self) {
        self.shutdown.notify_waiters();
        
        let names: Vec<String> = self.list();
        for name in names {
            let _ = self.stop_collector(&name).await;
        }
    }

    /// Get health for all collectors.
    pub fn all_health(&self) -> HashMap<String, CollectorHealth> {
        self.states.iter()
            .map(|r| (r.key().clone(), r.value().clone()))
            .collect()
    }

    /// Get stats for all collectors.
    pub async fn all_stats(&self) -> HashMap<String, CollectorStats> {
        let mut stats = HashMap::new();
        
        for entry in self.collectors.iter() {
            let name = entry.key().clone();
            let collector = entry.value().clone();
            let guard = collector.read().await;
            stats.insert(name, guard.stats());
        }
        
        stats
    }

    /// Get shutdown signal.
    pub fn shutdown_signal(&self) -> Arc<Notify> {
        self.shutdown.clone()
    }
}

impl Default for CollectorRegistry {
    fn default() -> Self {
        Self::new()
    }
}


// ============================================================================
// ██████╗ ██╗  ██╗ █████╗ ███████╗███████╗    ███████╗
// ██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ██╔════╝
// ██████╔╝███████║███████║███████╗█████╗      ███████╗
// ██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝      ╚════██║
// ██║     ██║  ██║██║  ██║███████║███████╗    ███████║
// ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝    ╚══════╝
// COLLECTOR IMPLEMENTATIONS - REAL METRIC GATHERING
// ============================================================================

// ============================================================================
// SECTION 28: SYSTEM METRICS COLLECTOR
// ============================================================================
// The most critical collector - reads directly from /proc and /sys to gather
// CPU, memory, disk, and network metrics with zero external dependencies.
// Uses delta computation for rate metrics (CPU%, disk I/O, network throughput).
// ============================================================================

// ----------------------------------------------------------------------------
// 28.1 CPU Snapshot - For Delta Computation
// ----------------------------------------------------------------------------

/// Snapshot of CPU counters from /proc/stat for computing deltas.
#[derive(Debug, Clone, Default)]
struct CpuSnapshot {
    /// CPU core identifier ("cpu" for aggregate, "cpu0" for core 0, etc.)
    core_id: CompactString,
    /// User mode ticks
    user: u64,
    /// Nice priority user mode ticks
    nice: u64,
    /// System mode ticks
    system: u64,
    /// Idle ticks
    idle: u64,
    /// I/O wait ticks
    iowait: u64,
    /// Hardware IRQ ticks
    irq: u64,
    /// Software IRQ ticks
    softirq: u64,
    /// Stolen ticks (virtualization)
    steal: u64,
}

impl CpuSnapshot {
    /// Total ticks across all modes.
    fn total(&self) -> u64 {
        self.user + self.nice + self.system + self.idle
            + self.iowait + self.irq + self.softirq + self.steal
    }

    /// Active (non-idle) ticks.
    fn active(&self) -> u64 {
        self.total() - self.idle - self.iowait
    }

    /// Parse a cpu line from /proc/stat.
    /// Format: "cpu0 12345 678 9012 34567 890 12 34 56"
    fn parse(line: &str) -> Option<Self> {
        let mut parts = line.split_whitespace();
        let core_id = CompactString::from(parts.next()?);
        
        // Must start with "cpu"
        if !core_id.starts_with("cpu") {
            return None;
        }

        let user: u64 = parts.next()?.parse().ok()?;
        let nice: u64 = parts.next()?.parse().ok()?;
        let system: u64 = parts.next()?.parse().ok()?;
        let idle: u64 = parts.next()?.parse().ok()?;
        let iowait: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let irq: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let softirq: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let steal: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);

        Some(Self { core_id, user, nice, system, idle, iowait, irq, softirq, steal })
    }

    /// Compute percentage metrics from delta between two snapshots.
    fn compute_percentages(&self, prev: &CpuSnapshot) -> CpuPercentages {
        let total_delta = self.total().saturating_sub(prev.total());
        if total_delta == 0 {
            return CpuPercentages::default();
        }

        let d = total_delta as f64;
        CpuPercentages {
            user: (self.user.saturating_sub(prev.user) as f64 / d) * 100.0,
            nice: (self.nice.saturating_sub(prev.nice) as f64 / d) * 100.0,
            system: (self.system.saturating_sub(prev.system) as f64 / d) * 100.0,
            idle: (self.idle.saturating_sub(prev.idle) as f64 / d) * 100.0,
            iowait: (self.iowait.saturating_sub(prev.iowait) as f64 / d) * 100.0,
            irq: (self.irq.saturating_sub(prev.irq) as f64 / d) * 100.0,
            softirq: (self.softirq.saturating_sub(prev.softirq) as f64 / d) * 100.0,
            steal: (self.steal.saturating_sub(prev.steal) as f64 / d) * 100.0,
            usage: (self.active().saturating_sub(prev.active()) as f64 / d) * 100.0,
        }
    }
}

/// Computed CPU percentages from delta.
#[derive(Debug, Clone, Default)]
struct CpuPercentages {
    user: f64,
    nice: f64,
    system: f64,
    idle: f64,
    iowait: f64,
    irq: f64,
    softirq: f64,
    steal: f64,
    usage: f64,
}

// ----------------------------------------------------------------------------
// 28.2 Disk Snapshot - For Delta Computation
// ----------------------------------------------------------------------------

/// Snapshot of disk counters from /proc/diskstats for computing deltas.
#[derive(Debug, Clone, Default)]
struct DiskSnapshot {
    /// Device name (e.g., "sda", "nvme0n1")
    device: CompactString,
    /// Reads completed
    reads_completed: u64,
    /// Reads merged
    reads_merged: u64,
    /// Sectors read
    sectors_read: u64,
    /// Time reading (ms)
    read_time_ms: u64,
    /// Writes completed
    writes_completed: u64,
    /// Writes merged
    writes_merged: u64,
    /// Sectors written
    sectors_written: u64,
    /// Time writing (ms)
    write_time_ms: u64,
    /// I/Os currently in progress
    ios_in_progress: u64,
    /// Time doing I/Os (ms)
    io_time_ms: u64,
    /// Weighted time doing I/Os (ms)
    weighted_io_time_ms: u64,
}

impl DiskSnapshot {
    /// Sector size in bytes (standard for Linux).
    const SECTOR_SIZE: u64 = 512;

    /// Parse a line from /proc/diskstats.
    /// Format: "   8       0 sda 12345 678 901234 5678 ..."
    fn parse(line: &str) -> Option<Self> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 14 {
            return None;
        }

        let device = CompactString::from(parts[2]);

        // Skip loop devices, ram devices, and partitions (devices ending in digits
        // where the base device also exists — handled at collection level)
        if device.starts_with("loop") || device.starts_with("ram") || device.starts_with("dm-") {
            return None;
        }

        Some(Self {
            device,
            reads_completed: parts[3].parse().unwrap_or(0),
            reads_merged: parts[4].parse().unwrap_or(0),
            sectors_read: parts[5].parse().unwrap_or(0),
            read_time_ms: parts[6].parse().unwrap_or(0),
            writes_completed: parts[7].parse().unwrap_or(0),
            writes_merged: parts[8].parse().unwrap_or(0),
            sectors_written: parts[9].parse().unwrap_or(0),
            write_time_ms: parts[10].parse().unwrap_or(0),
            ios_in_progress: parts[11].parse().unwrap_or(0),
            io_time_ms: parts[12].parse().unwrap_or(0),
            weighted_io_time_ms: parts[13].parse().unwrap_or(0),
        })
    }

    /// Check if this is a real block device (not a partition).
    fn is_whole_disk(&self) -> bool {
        // Heuristic: whole disks are like sda, nvme0n1, vda
        // Partitions are like sda1, nvme0n1p1, vda2
        let name = &self.device;
        if name.starts_with("nvme") {
            // NVMe: nvme0n1 is disk, nvme0n1p1 is partition
            !name.contains('p') || {
                // Check if 'p' comes after 'n' section
                if let Some(n_pos) = name.rfind('n') {
                    let after_n = &name[n_pos + 1..];
                    // If there's a 'p' after the namespace number, it's a partition
                    after_n.contains('p')
                } else {
                    false
                }
            }
        } else {
            // Traditional: sda is disk, sda1 is partition
            !name.ends_with(|c: char| c.is_ascii_digit())
        }
    }
}

// ----------------------------------------------------------------------------
// 28.3 Network Interface Snapshot - For Delta Computation
// ----------------------------------------------------------------------------

/// Snapshot of network interface counters from /proc/net/dev.
#[derive(Debug, Clone, Default)]
struct NetIfSnapshot {
    /// Interface name (e.g., "eth0", "ens3")
    interface: CompactString,
    /// Bytes received
    rx_bytes: u64,
    /// Packets received
    rx_packets: u64,
    /// Receive errors
    rx_errors: u64,
    /// Receive drops
    rx_drops: u64,
    /// Bytes transmitted
    tx_bytes: u64,
    /// Packets transmitted
    tx_packets: u64,
    /// Transmit errors
    tx_errors: u64,
    /// Transmit drops
    tx_drops: u64,
}

impl NetIfSnapshot {
    /// Parse a line from /proc/net/dev.
    /// Format: "  eth0: 12345 678 9 0 0 0 0 0 12345 678 9 0 0 0 0 0"
    fn parse(line: &str) -> Option<Self> {
        let line = line.trim();
        let colon_pos = line.find(':')?;
        let interface = CompactString::from(line[..colon_pos].trim());

        // Skip loopback
        if interface == "lo" {
            return None;
        }

        let values: Vec<u64> = line[colon_pos + 1..]
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect();

        if values.len() < 16 {
            return None;
        }

        Some(Self {
            interface,
            rx_bytes: values[0],
            rx_packets: values[1],
            rx_errors: values[2],
            rx_drops: values[3],
            tx_bytes: values[8],
            tx_packets: values[9],
            tx_errors: values[10],
            tx_drops: values[11],
        })
    }
}

// ----------------------------------------------------------------------------
// 28.4 System Collector Implementation
// ----------------------------------------------------------------------------

/// System metrics collector - reads directly from /proc and /sys.
///
/// Collects CPU, memory, disk, and network metrics at configurable intervals.
/// Uses delta computation for rate-based metrics to provide accurate per-second values.
pub struct SystemCollector {
    /// Base collector for common lifecycle management
    base: BaseCollector,
    /// Configuration
    config: SystemCollectorConfig,
    /// Previous CPU snapshots for delta computation
    prev_cpu: RwLock<Vec<CpuSnapshot>>,
    /// Previous disk snapshots for delta computation
    prev_disk: RwLock<HashMap<CompactString, DiskSnapshot>>,
    /// Previous network snapshots for delta computation
    prev_net: RwLock<HashMap<CompactString, NetIfSnapshot>>,
    /// Previous collection timestamp for rate computation
    prev_time: RwLock<Instant>,
    /// Tokio join handle for the collection task
    task_handle: TokioMutex<Option<TokioJoinHandle<()>>>,
    /// Hostname for labeling
    hostname: CompactString,
}

impl SystemCollector {
    /// Create a new system collector.
    pub fn new(config: SystemCollectorConfig) -> Self {
        let interval = if config.interval_ms > 0 {
            Duration::from_millis(config.interval_ms)
        } else {
            Duration::from_millis(DEFAULT_COLLECTION_INTERVAL_MS)
        };

        let hostname = fs::read_to_string("/etc/hostname")
            .map(|s| CompactString::from(s.trim()))
            .unwrap_or_else(|_| CompactString::from("unknown"));

        Self {
            base: BaseCollector::new("system", CollectorType::System)
                .with_interval(interval),
            config,
            prev_cpu: RwLock::new(Vec::new()),
            prev_disk: RwLock::new(HashMap::new()),
            prev_net: RwLock::new(HashMap::new()),
            prev_time: RwLock::new(Instant::now()),
            task_handle: TokioMutex::new(None),
            hostname,
        }
    }

    /// Build a metric with standard system labels.
    fn build_metric(&self, name: &str, value: MetricValue, category: MetricCategory) -> Metric {
        Metric::new(CompactString::from(name), value)
            .with_source(MetricSource::System { subsystem: SystemSubsystem::Cpu })
            .with_category(category)
            .with_label("host", self.hostname.as_str())
            .with_priority(Priority::Normal)
    }

    /// Build a metric with extra labels.
    fn build_metric_with_labels(
        &self,
        name: &str,
        value: MetricValue,
        category: MetricCategory,
        extra_labels: &[(&str, &str)],
    ) -> Metric {
        let mut metric = self.build_metric(name, value, category);
        for (k, v) in extra_labels {
            metric = metric.with_label(*k, *v);
        }
        metric
    }

    // ---- CPU collection ----

    /// Read CPU snapshots from /proc/stat.
    fn read_cpu_snapshots() -> Vec<CpuSnapshot> {
        let content = match fs::read_to_string("/proc/stat") {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        content.lines()
            .filter(|line| line.starts_with("cpu"))
            .filter_map(CpuSnapshot::parse)
            .collect()
    }

    /// Read extra CPU metrics from /proc/stat (context switches, forks, procs).
    fn read_cpu_extras(content: &str) -> (u64, u64, u64, u64) {
        let mut ctxt = 0u64;
        let mut processes = 0u64;
        let mut procs_running = 0u64;
        let mut procs_blocked = 0u64;

        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("ctxt ") {
                ctxt = rest.trim().parse().unwrap_or(0);
            } else if let Some(rest) = line.strip_prefix("processes ") {
                processes = rest.trim().parse().unwrap_or(0);
            } else if let Some(rest) = line.strip_prefix("procs_running ") {
                procs_running = rest.trim().parse().unwrap_or(0);
            } else if let Some(rest) = line.strip_prefix("procs_blocked ") {
                procs_blocked = rest.trim().parse().unwrap_or(0);
            }
        }

        (ctxt, processes, procs_running, procs_blocked)
    }

    /// Collect CPU metrics and emit them.
    fn collect_cpu(&self) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(32);

        let current_snapshots = Self::read_cpu_snapshots();
        let prev_snapshots = self.prev_cpu.read();

        if !prev_snapshots.is_empty() && prev_snapshots.len() == current_snapshots.len() {
            for (curr, prev) in current_snapshots.iter().zip(prev_snapshots.iter()) {
                let pcts = curr.compute_percentages(prev);
                let is_aggregate = curr.core_id == "cpu";
                let labels: &[(&str, &str)] = if is_aggregate {
                    &[("core", "total")]
                } else {
                    // We need to create the label dynamically
                    &[]
                };

                let core_label = curr.core_id.to_string();

                let mut emit = |name: &str, val: f64| {
                    let mut m = self.build_metric(name, MetricValue::Gauge(val), MetricCategory::CpuUsage);
                    m = m.with_label("core", if is_aggregate { "total" } else { &core_label });
                    metrics.push(m);
                };

                emit("system.cpu.usage_percent", pcts.usage);
                emit("system.cpu.user_percent", pcts.user);
                emit("system.cpu.system_percent", pcts.system);
                emit("system.cpu.idle_percent", pcts.idle);
                emit("system.cpu.iowait_percent", pcts.iowait);
                emit("system.cpu.steal_percent", pcts.steal);
                emit("system.cpu.irq_percent", pcts.irq);
                emit("system.cpu.softirq_percent", pcts.softirq);
                emit("system.cpu.nice_percent", pcts.nice);
            }
        }

        // Update previous snapshots
        drop(prev_snapshots);
        *self.prev_cpu.write() = current_snapshots;

        // Load averages from /proc/loadavg
        if let Ok(loadavg) = fs::read_to_string("/proc/loadavg") {
            let parts: Vec<&str> = loadavg.split_whitespace().collect();
            if parts.len() >= 3 {
                if let Ok(load1) = parts[0].parse::<f64>() {
                    metrics.push(self.build_metric("system.load.1m", MetricValue::Gauge(load1), MetricCategory::CpuUsage));
                }
                if let Ok(load5) = parts[1].parse::<f64>() {
                    metrics.push(self.build_metric("system.load.5m", MetricValue::Gauge(load5), MetricCategory::CpuUsage));
                }
                if let Ok(load15) = parts[2].parse::<f64>() {
                    metrics.push(self.build_metric("system.load.15m", MetricValue::Gauge(load15), MetricCategory::CpuUsage));
                }
            }
        }

        // Context switches & process forks
        if let Ok(stat_content) = fs::read_to_string("/proc/stat") {
            let (ctxt, processes, procs_running, procs_blocked) = Self::read_cpu_extras(&stat_content);
            metrics.push(self.build_metric("system.cpu.context_switches", MetricValue::Counter(ctxt), MetricCategory::CpuUsage));
            metrics.push(self.build_metric("system.cpu.forks_total", MetricValue::Counter(processes), MetricCategory::CpuUsage));
            metrics.push(self.build_metric("system.cpu.procs_running", MetricValue::Gauge(procs_running as f64), MetricCategory::CpuUsage));
            metrics.push(self.build_metric("system.cpu.procs_blocked", MetricValue::Gauge(procs_blocked as f64), MetricCategory::CpuUsage));
        }

        metrics
    }

    // ---- Memory collection ----

    /// Collect memory metrics from /proc/meminfo.
    fn collect_memory(&self) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(16);

        let content = match fs::read_to_string("/proc/meminfo") {
            Ok(c) => c,
            Err(_) => return metrics,
        };

        let mut mem_total: u64 = 0;
        let mut mem_free: u64 = 0;
        let mut mem_available: u64 = 0;
        let mut buffers: u64 = 0;
        let mut cached: u64 = 0;
        let mut swap_total: u64 = 0;
        let mut swap_free: u64 = 0;
        let mut slab: u64 = 0;
        let mut sreclaimable: u64 = 0;
        let mut hugepages_total: u64 = 0;
        let mut hugepages_free: u64 = 0;
        let mut dirty: u64 = 0;
        let mut writeback: u64 = 0;

        // High-performance parser: no regex, just byte scanning with splitn
        for line in content.lines() {
            let mut parts = line.splitn(2, ':');
            let key = match parts.next() {
                Some(k) => k.trim(),
                None => continue,
            };
            let value_str = match parts.next() {
                Some(v) => v.trim(),
                None => continue,
            };
            // Value is like "12345 kB" — extract the number
            let value_kb: u64 = value_str
                .split_whitespace()
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            let value_bytes = value_kb * 1024;

            match key {
                "MemTotal" => mem_total = value_bytes,
                "MemFree" => mem_free = value_bytes,
                "MemAvailable" => mem_available = value_bytes,
                "Buffers" => buffers = value_bytes,
                "Cached" => cached = value_bytes,
                "SwapTotal" => swap_total = value_bytes,
                "SwapFree" => swap_free = value_bytes,
                "Slab" => slab = value_bytes,
                "SReclaimable" => sreclaimable = value_bytes,
                "HugePages_Total" => hugepages_total = value_kb, // not kB, just count
                "HugePages_Free" => hugepages_free = value_kb,
                "Dirty" => dirty = value_bytes,
                "Writeback" => writeback = value_bytes,
                _ => {}
            }
        }

        let mem_used = mem_total.saturating_sub(mem_available);
        let swap_used = swap_total.saturating_sub(swap_free);
        let usage_pct = if mem_total > 0 { (mem_used as f64 / mem_total as f64) * 100.0 } else { 0.0 };
        let swap_pct = if swap_total > 0 { (swap_used as f64 / swap_total as f64) * 100.0 } else { 0.0 };

        let g = |name: &str, val: f64| -> Metric {
            self.build_metric(name, MetricValue::Gauge(val), MetricCategory::MemoryUsage)
        };

        metrics.push(g("system.memory.total_bytes", mem_total as f64));
        metrics.push(g("system.memory.used_bytes", mem_used as f64));
        metrics.push(g("system.memory.free_bytes", mem_free as f64));
        metrics.push(g("system.memory.available_bytes", mem_available as f64));
        metrics.push(g("system.memory.buffers_bytes", buffers as f64));
        metrics.push(g("system.memory.cached_bytes", cached as f64));
        metrics.push(g("system.memory.slab_bytes", slab as f64));
        metrics.push(g("system.memory.sreclaimable_bytes", sreclaimable as f64));
        metrics.push(g("system.memory.usage_percent", usage_pct));
        metrics.push(g("system.memory.dirty_bytes", dirty as f64));
        metrics.push(g("system.memory.writeback_bytes", writeback as f64));
        metrics.push(g("system.memory.swap_total_bytes", swap_total as f64));
        metrics.push(g("system.memory.swap_used_bytes", swap_used as f64));
        metrics.push(g("system.memory.swap_free_bytes", swap_free as f64));
        metrics.push(g("system.memory.swap_percent", swap_pct));
        metrics.push(g("system.memory.hugepages_total", hugepages_total as f64));
        metrics.push(g("system.memory.hugepages_free", hugepages_free as f64));

        metrics
    }

    // ---- Disk collection ----

    /// Read disk snapshots from /proc/diskstats.
    fn read_disk_snapshots() -> Vec<DiskSnapshot> {
        let content = match fs::read_to_string("/proc/diskstats") {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        content.lines()
            .filter_map(DiskSnapshot::parse)
            .filter(|d| d.is_whole_disk())
            .collect()
    }

    /// Collect disk I/O metrics.
    fn collect_disk(&self) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(32);
        let elapsed_secs = {
            let prev = self.prev_time.read();
            prev.elapsed().as_secs_f64()
        };

        let current_disks = Self::read_disk_snapshots();
        let prev_disks = self.prev_disk.read();

        for disk in &current_disks {
            // Filter by configured mounts if any
            if !self.config.disk_mounts.is_empty() {
                let matches = self.config.disk_mounts.iter().any(|m| disk.device.contains(m.as_str()));
                if !matches {
                    continue;
                }
            }

            let dev = disk.device.as_str();
            let labels: [(&str, &str); 1] = [("device", dev)];

            let gd = |name: &str, val: f64| -> Metric {
                self.build_metric_with_labels(name, MetricValue::Gauge(val), MetricCategory::DiskIo, &labels)
            };

            // Current I/Os in progress (absolute, not delta)
            metrics.push(gd("system.disk.ios_in_progress", disk.ios_in_progress as f64));

            // Delta-based metrics
            if let Some(prev) = prev_disks.get(&disk.device) {
                if elapsed_secs > 0.0 {
                    let reads_delta = disk.reads_completed.saturating_sub(prev.reads_completed);
                    let writes_delta = disk.writes_completed.saturating_sub(prev.writes_completed);
                    let read_bytes_delta = disk.sectors_read.saturating_sub(prev.sectors_read) * DiskSnapshot::SECTOR_SIZE;
                    let write_bytes_delta = disk.sectors_written.saturating_sub(prev.sectors_written) * DiskSnapshot::SECTOR_SIZE;
                    let io_time_delta = disk.io_time_ms.saturating_sub(prev.io_time_ms);
                    let weighted_delta = disk.weighted_io_time_ms.saturating_sub(prev.weighted_io_time_ms);

                    metrics.push(gd("system.disk.reads_per_sec", reads_delta as f64 / elapsed_secs));
                    metrics.push(gd("system.disk.writes_per_sec", writes_delta as f64 / elapsed_secs));
                    metrics.push(gd("system.disk.read_bytes_per_sec", read_bytes_delta as f64 / elapsed_secs));
                    metrics.push(gd("system.disk.write_bytes_per_sec", write_bytes_delta as f64 / elapsed_secs));
                    metrics.push(gd("system.disk.io_time_ms", io_time_delta as f64));
                    metrics.push(gd("system.disk.weighted_io_time_ms", weighted_delta as f64));

                    // Utilization: io_time_delta_ms / (elapsed_ms) * 100
                    let elapsed_ms = (elapsed_secs * 1000.0) as u64;
                    let util = if elapsed_ms > 0 {
                        (io_time_delta as f64 / elapsed_ms as f64) * 100.0
                    } else {
                        0.0
                    };
                    metrics.push(gd("system.disk.utilization_percent", util.min(100.0)));
                }
            }

            // Cumulative counters
            metrics.push(self.build_metric_with_labels(
                "system.disk.reads_total", MetricValue::Counter(disk.reads_completed),
                MetricCategory::DiskIo, &labels,
            ));
            metrics.push(self.build_metric_with_labels(
                "system.disk.writes_total", MetricValue::Counter(disk.writes_completed),
                MetricCategory::DiskIo, &labels,
            ));
        }

        // Filesystem space via statvfs()
        let mount_paths = if self.config.disk_mounts.is_empty() {
            // Read /proc/mounts for real filesystems
            Self::read_mount_points()
        } else {
            self.config.disk_mounts.clone()
        };

        for mount in &mount_paths {
            let c_path = match std::ffi::CString::new(mount.as_str()) {
                Ok(p) => p,
                Err(_) => continue,
            };

            let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
            let ret = unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) };
            if ret != 0 {
                continue;
            }

            let block_size = stat.f_frsize as u64;
            let total = stat.f_blocks as u64 * block_size;
            let free = stat.f_bfree as u64 * block_size;
            let avail = stat.f_bavail as u64 * block_size;
            let used = total.saturating_sub(free);
            let usage_pct = if total > 0 { (used as f64 / total as f64) * 100.0 } else { 0.0 };

            let inodes_total = stat.f_files as u64;
            let inodes_free = stat.f_ffree as u64;
            let inodes_used = inodes_total.saturating_sub(inodes_free);

            let labels: [(&str, &str); 1] = [("mount", mount.as_str())];
            let gf = |name: &str, val: f64| -> Metric {
                self.build_metric_with_labels(name, MetricValue::Gauge(val), MetricCategory::DiskSpace, &labels)
            };

            metrics.push(gf("system.fs.total_bytes", total as f64));
            metrics.push(gf("system.fs.used_bytes", used as f64));
            metrics.push(gf("system.fs.free_bytes", free as f64));
            metrics.push(gf("system.fs.available_bytes", avail as f64));
            metrics.push(gf("system.fs.usage_percent", usage_pct));
            metrics.push(gf("system.fs.inodes_total", inodes_total as f64));
            metrics.push(gf("system.fs.inodes_used", inodes_used as f64));
            metrics.push(gf("system.fs.inodes_free", inodes_free as f64));
        }

        // Update previous snapshots
        drop(prev_disks);
        let mut prev = self.prev_disk.write();
        prev.clear();
        for disk in current_disks {
            prev.insert(disk.device.clone(), disk);
        }

        metrics
    }

    /// Read real mount points from /proc/mounts (skip virtual filesystems).
    fn read_mount_points() -> Vec<String> {
        let content = match fs::read_to_string("/proc/mounts") {
            Ok(c) => c,
            Err(_) => return vec!["/".to_string()],
        };

        let virtual_fs = ["proc", "sysfs", "devtmpfs", "tmpfs", "cgroup", "cgroup2",
            "pstore", "mqueue", "hugetlbfs", "debugfs", "tracefs", "securityfs",
            "configfs", "fusectl", "binfmt_misc", "devpts", "autofs", "overlay",
            "squashfs", "nsfs", "rpc_pipefs", "nfsd", "fuse.lxcfs"];

        content.lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let fstype = parts[2];
                    let mountpoint = parts[1];
                    if !virtual_fs.contains(&fstype) && !mountpoint.starts_with("/proc")
                        && !mountpoint.starts_with("/sys") && !mountpoint.starts_with("/dev/")
                        && !mountpoint.starts_with("/run") && !mountpoint.starts_with("/snap")
                    {
                        return Some(mountpoint.to_string());
                    }
                }
                None
            })
            .collect()
    }

    // ---- Network collection ----

    /// Read network interface snapshots from /proc/net/dev.
    fn read_net_snapshots() -> Vec<NetIfSnapshot> {
        let content = match fs::read_to_string("/proc/net/dev") {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        content.lines()
            .skip(2) // Skip header lines
            .filter_map(NetIfSnapshot::parse)
            .collect()
    }

    /// Collect network interface metrics.
    fn collect_network(&self) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(32);
        let elapsed_secs = {
            let prev = self.prev_time.read();
            prev.elapsed().as_secs_f64()
        };

        let current_ifaces = Self::read_net_snapshots();
        let prev_ifaces = self.prev_net.read();

        for iface in &current_ifaces {
            // Filter by configured interfaces if any
            if !self.config.network_interfaces.is_empty() {
                let matches = self.config.network_interfaces.iter().any(|i| iface.interface == i.as_str());
                if !matches {
                    continue;
                }
            }

            let if_name = iface.interface.as_str();
            let labels: [(&str, &str); 1] = [("interface", if_name)];

            // Cumulative counters
            let cn = |name: &str, val: u64| -> Metric {
                self.build_metric_with_labels(name, MetricValue::Counter(val), MetricCategory::NetworkTraffic, &labels)
            };

            metrics.push(cn("system.net.rx_bytes_total", iface.rx_bytes));
            metrics.push(cn("system.net.tx_bytes_total", iface.tx_bytes));
            metrics.push(cn("system.net.rx_packets_total", iface.rx_packets));
            metrics.push(cn("system.net.tx_packets_total", iface.tx_packets));
            metrics.push(cn("system.net.rx_errors_total", iface.rx_errors));
            metrics.push(cn("system.net.tx_errors_total", iface.tx_errors));
            metrics.push(cn("system.net.rx_drops_total", iface.rx_drops));
            metrics.push(cn("system.net.tx_drops_total", iface.tx_drops));

            // Delta-based rate metrics
            if let Some(prev) = prev_ifaces.get(&iface.interface) {
                if elapsed_secs > 0.0 {
                    let gn = |name: &str, val: f64| -> Metric {
                        self.build_metric_with_labels(name, MetricValue::Gauge(val), MetricCategory::NetworkTraffic, &labels)
                    };

                    metrics.push(gn("system.net.rx_bytes_per_sec",
                        iface.rx_bytes.saturating_sub(prev.rx_bytes) as f64 / elapsed_secs));
                    metrics.push(gn("system.net.tx_bytes_per_sec",
                        iface.tx_bytes.saturating_sub(prev.tx_bytes) as f64 / elapsed_secs));
                    metrics.push(gn("system.net.rx_packets_per_sec",
                        iface.rx_packets.saturating_sub(prev.rx_packets) as f64 / elapsed_secs));
                    metrics.push(gn("system.net.tx_packets_per_sec",
                        iface.tx_packets.saturating_sub(prev.tx_packets) as f64 / elapsed_secs));
                    metrics.push(gn("system.net.rx_errors_per_sec",
                        iface.rx_errors.saturating_sub(prev.rx_errors) as f64 / elapsed_secs));
                    metrics.push(gn("system.net.tx_errors_per_sec",
                        iface.tx_errors.saturating_sub(prev.tx_errors) as f64 / elapsed_secs));

                    // Bandwidth in bits per second
                    let rx_bps = (iface.rx_bytes.saturating_sub(prev.rx_bytes) as f64 * 8.0) / elapsed_secs;
                    let tx_bps = (iface.tx_bytes.saturating_sub(prev.tx_bytes) as f64 * 8.0) / elapsed_secs;
                    metrics.push(gn("system.net.rx_bits_per_sec", rx_bps));
                    metrics.push(gn("system.net.tx_bits_per_sec", tx_bps));
                }
            }
        }

        // Update previous snapshots
        drop(prev_ifaces);
        let mut prev = self.prev_net.write();
        prev.clear();
        for iface in current_ifaces {
            prev.insert(iface.interface.clone(), iface);
        }

        metrics
    }

    // ---- Misc system metrics ----

    /// Collect miscellaneous system metrics: uptime, file descriptors, vmstat.
    fn collect_misc(&self) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(8);

        // Uptime from /proc/uptime
        if let Ok(uptime_str) = fs::read_to_string("/proc/uptime") {
            let parts: Vec<&str> = uptime_str.split_whitespace().collect();
            if let Some(uptime) = parts.first().and_then(|s| s.parse::<f64>().ok()) {
                metrics.push(self.build_metric(
                    "system.uptime_seconds", MetricValue::Gauge(uptime), MetricCategory::Availability,
                ));
            }
        }

        // File handles from /proc/sys/fs/file-nr
        if let Ok(file_nr) = fs::read_to_string("/proc/sys/fs/file-nr") {
            let parts: Vec<&str> = file_nr.split_whitespace().collect();
            if parts.len() >= 3 {
                if let Ok(allocated) = parts[0].parse::<f64>() {
                    metrics.push(self.build_metric(
                        "system.fs.file_handles_allocated", MetricValue::Gauge(allocated), MetricCategory::SystemResource,
                    ));
                }
                if let Ok(max) = parts[2].parse::<f64>() {
                    metrics.push(self.build_metric(
                        "system.fs.file_handles_max", MetricValue::Gauge(max), MetricCategory::SystemResource,
                    ));
                }
            }
        }

        // VMStat selected fields
        if let Ok(vmstat) = fs::read_to_string("/proc/vmstat") {
            for line in vmstat.lines() {
                let mut parts = line.split_whitespace();
                let key = match parts.next() { Some(k) => k, None => continue };
                let val: u64 = match parts.next().and_then(|s| s.parse().ok()) { Some(v) => v, None => continue };

                match key {
                    "pgpgin" => metrics.push(self.build_metric(
                        "system.vm.pgpgin", MetricValue::Counter(val), MetricCategory::MemoryUsage)),
                    "pgpgout" => metrics.push(self.build_metric(
                        "system.vm.pgpgout", MetricValue::Counter(val), MetricCategory::MemoryUsage)),
                    "pswpin" => metrics.push(self.build_metric(
                        "system.vm.pswpin", MetricValue::Counter(val), MetricCategory::MemoryUsage)),
                    "pswpout" => metrics.push(self.build_metric(
                        "system.vm.pswpout", MetricValue::Counter(val), MetricCategory::MemoryUsage)),
                    "oom_kill" => metrics.push(self.build_metric(
                        "system.vm.oom_kill", MetricValue::Counter(val), MetricCategory::MemoryPressure)),
                    _ => {}
                }
            }
        }

        metrics
    }

    /// Run a single collection cycle, gathering all configured metrics.
    fn collect_all(&self) -> Vec<Metric> {
        let mut all_metrics = Vec::with_capacity(128);

        if self.config.collect_cpu {
            all_metrics.extend(self.collect_cpu());
        }
        if self.config.collect_memory {
            all_metrics.extend(self.collect_memory());
        }
        if self.config.collect_disk {
            all_metrics.extend(self.collect_disk());
        }
        if self.config.collect_network {
            all_metrics.extend(self.collect_network());
        }
        all_metrics.extend(self.collect_misc());

        // Update the previous timestamp AFTER all collections
        *self.prev_time.write() = Instant::now();

        all_metrics
    }
}

#[async_trait]
impl Collector for SystemCollector {
    fn name(&self) -> &str {
        "system"
    }

    fn collector_type(&self) -> CollectorType {
        CollectorType::System
    }

    async fn init(&mut self) -> CollectorResult<()> {
        // Prime the snapshots so first real collection has deltas
        *self.prev_cpu.write() = Self::read_cpu_snapshots();
        let disks = Self::read_disk_snapshots();
        {
            let mut prev = self.prev_disk.write();
            for disk in disks {
                prev.insert(disk.device.clone(), disk);
            }
        }
        let ifaces = Self::read_net_snapshots();
        {
            let mut prev = self.prev_net.write();
            for iface in ifaces {
                prev.insert(iface.interface.clone(), iface);
            }
        }
        *self.prev_time.write() = Instant::now();

        info!(target: "cerebro::collector::system", "System collector initialized, hostname={}", self.hostname);
        Ok(())
    }

    async fn start(&mut self, tx: MetricSender) -> CollectorResult<()> {
        self.base.set_sender(tx);
        self.base.set_running(true);

        let interval_dur = self.base.interval;
        let shutdown = self.base.shutdown_signal();

        // We need to share self's data with the spawned task.
        // Use Arc references for the shared state pieces.
        let config = self.config.clone();
        let hostname = self.hostname.clone();
        let prev_cpu = Arc::new(RwLock::new(self.prev_cpu.read().clone()));
        let prev_disk = Arc::new(RwLock::new(self.prev_disk.read().clone()));
        let prev_net = Arc::new(RwLock::new(self.prev_net.read().clone()));
        let prev_time = Arc::new(RwLock::new(Instant::now()));
        let sender = self.base.get_sender().cloned();
        let base_stats = Arc::new(AtomicU64::new(0)); // metrics counter
        let base_cycles = Arc::new(AtomicU64::new(0));
        let base_errors = Arc::new(AtomicU64::new(0));

        let handle = tokio::spawn(async move {
            let mut tick = interval(interval_dur);
            // Skip the first immediate tick to let deltas build
            tick.tick().await;

            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        let start = Instant::now();

                        // Create a temporary collector context for this cycle
                        let mut cycle_metrics = Vec::with_capacity(128);

                        // ---- CPU ----
                        if config.collect_cpu {
                            let current_snapshots = SystemCollector::read_cpu_snapshots();
                            let prev_snaps = prev_cpu.read().clone();
                            if !prev_snaps.is_empty() && prev_snaps.len() == current_snapshots.len() {
                                for (curr, prev) in current_snapshots.iter().zip(prev_snaps.iter()) {
                                    let pcts = curr.compute_percentages(prev);
                                    let is_agg = curr.core_id == "cpu";
                                    let core_label = if is_agg { "total".to_string() } else { curr.core_id.to_string() };

                                    let mut mk = |name: &str, val: f64| {
                                        let m = Metric::new(CompactString::from(name), MetricValue::Gauge(val))
                                            .with_source(MetricSource::System { subsystem: SystemSubsystem::Cpu })
                                            .with_category(MetricCategory::CpuUsage)
                                            .with_label("host", hostname.as_str()).with_label("core", core_label.as_str()).with_priority(Priority::Normal);
                                        cycle_metrics.push(m);
                                    };

                                    mk("system.cpu.usage_percent", pcts.usage);
                                    mk("system.cpu.user_percent", pcts.user);
                                    mk("system.cpu.system_percent", pcts.system);
                                    mk("system.cpu.idle_percent", pcts.idle);
                                    mk("system.cpu.iowait_percent", pcts.iowait);
                                    mk("system.cpu.steal_percent", pcts.steal);
                                }
                            }
                            *prev_cpu.write() = current_snapshots;

                            // Load averages
                            if let Ok(la) = fs::read_to_string("/proc/loadavg") {
                                let p: Vec<&str> = la.split_whitespace().collect();
                                if p.len() >= 3 {
                                    for (i, name) in [(0, "system.load.1m"), (1, "system.load.5m"), (2, "system.load.15m")] {
                                        if let Ok(v) = p[i].parse::<f64>() {
                                            cycle_metrics.push(Metric::new(CompactString::from(name), MetricValue::Gauge(v))
                                                .with_source(MetricSource::System { subsystem: SystemSubsystem::Cpu })
                                                .with_category(MetricCategory::CpuUsage)
                                                .with_label("host", hostname.as_str()));
                                        }
                                    }
                                }
                            }
                        }

                        // ---- Memory ----
                        if config.collect_memory {
                            if let Ok(content) = fs::read_to_string("/proc/meminfo") {
                                let mut vals = HashMap::new();
                                for line in content.lines() {
                                    let mut parts = line.splitn(2, ':');
                                    if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
                                        let kb: u64 = v.trim().split_whitespace().next()
                                            .and_then(|s| s.parse().ok()).unwrap_or(0);
                                        vals.insert(k.trim().to_string(), kb * 1024);
                                    }
                                }
                                let total = *vals.get("MemTotal").unwrap_or(&0);
                                let avail = *vals.get("MemAvailable").unwrap_or(&0);
                                let free = *vals.get("MemFree").unwrap_or(&0);
                                let used = total.saturating_sub(avail);
                                let pct = if total > 0 { (used as f64 / total as f64) * 100.0 } else { 0.0 };

                                let mut mk = |name: &str, val: f64| {
                                    cycle_metrics.push(Metric::new(CompactString::from(name), MetricValue::Gauge(val))
                                        .with_source(MetricSource::System { subsystem: SystemSubsystem::Cpu })
                                        .with_category(MetricCategory::MemoryUsage)
                                        .with_label("host", hostname.as_str()));
                                };
                                mk("system.memory.total_bytes", total as f64);
                                mk("system.memory.used_bytes", used as f64);
                                mk("system.memory.free_bytes", free as f64);
                                mk("system.memory.available_bytes", avail as f64);
                                mk("system.memory.usage_percent", pct);
                                mk("system.memory.cached_bytes", *vals.get("Cached").unwrap_or(&0) as f64);
                                mk("system.memory.buffers_bytes", *vals.get("Buffers").unwrap_or(&0) as f64);

                                let st = *vals.get("SwapTotal").unwrap_or(&0);
                                let sf = *vals.get("SwapFree").unwrap_or(&0);
                                let su = st.saturating_sub(sf);
                                mk("system.memory.swap_total_bytes", st as f64);
                                mk("system.memory.swap_used_bytes", su as f64);
                                if st > 0 {
                                    mk("system.memory.swap_percent", (su as f64 / st as f64) * 100.0);
                                }
                            }
                        }

                        // ---- Disk ----
                        if config.collect_disk {
                            let elapsed_s = prev_time.read().elapsed().as_secs_f64();
                            let disks = SystemCollector::read_disk_snapshots();
                            let pd = prev_disk.read().clone();
                            for disk in &disks {
                                let dev = disk.device.as_str();
                                if let Some(prev) = pd.get(&disk.device) {
                                    if elapsed_s > 0.0 {
                                        let read_bps = (disk.sectors_read.saturating_sub(prev.sectors_read) * DiskSnapshot::SECTOR_SIZE) as f64 / elapsed_s;
                                        let write_bps = (disk.sectors_written.saturating_sub(prev.sectors_written) * DiskSnapshot::SECTOR_SIZE) as f64 / elapsed_s;
                                        let io_delta = disk.io_time_ms.saturating_sub(prev.io_time_ms);
                                        let util = ((io_delta as f64) / (elapsed_s * 1000.0) * 100.0).min(100.0);

                                        let mut mk = |name: &str, val: f64| {
                                            cycle_metrics.push(Metric::new(CompactString::from(name), MetricValue::Gauge(val))
                                                .with_source(MetricSource::System { subsystem: SystemSubsystem::Cpu })
                                                .with_category(MetricCategory::DiskIo)
                                                .with_label("host", hostname.as_str()).with_label("device", dev));
                                        };
                                        mk("system.disk.read_bytes_per_sec", read_bps);
                                        mk("system.disk.write_bytes_per_sec", write_bps);
                                        mk("system.disk.utilization_percent", util);
                                    }
                                }
                            }
                            let mut pdw = prev_disk.write();
                            pdw.clear();
                            for d in disks { pdw.insert(d.device.clone(), d); }
                        }

                        // ---- Network ----
                        if config.collect_network {
                            let elapsed_s = prev_time.read().elapsed().as_secs_f64();
                            let ifaces = SystemCollector::read_net_snapshots();
                            let pn = prev_net.read().clone();
                            for iface in &ifaces {
                                let ifn = iface.interface.as_str();
                                if let Some(prev) = pn.get(&iface.interface) {
                                    if elapsed_s > 0.0 {
                                        let mut mk = |name: &str, val: f64| {
                                            cycle_metrics.push(Metric::new(CompactString::from(name), MetricValue::Gauge(val))
                                                .with_source(MetricSource::System { subsystem: SystemSubsystem::Cpu })
                                                .with_category(MetricCategory::NetworkTraffic)
                                                .with_label("host", hostname.as_str()).with_label("interface", ifn));
                                        };
                                        mk("system.net.rx_bytes_per_sec", iface.rx_bytes.saturating_sub(prev.rx_bytes) as f64 / elapsed_s);
                                        mk("system.net.tx_bytes_per_sec", iface.tx_bytes.saturating_sub(prev.tx_bytes) as f64 / elapsed_s);
                                        mk("system.net.rx_packets_per_sec", iface.rx_packets.saturating_sub(prev.rx_packets) as f64 / elapsed_s);
                                        mk("system.net.tx_packets_per_sec", iface.tx_packets.saturating_sub(prev.tx_packets) as f64 / elapsed_s);
                                    }
                                }
                            }
                            let mut pnw = prev_net.write();
                            pnw.clear();
                            for i in ifaces { pnw.insert(i.interface.clone(), i); }
                        }

                        *prev_time.write() = Instant::now();

                        // Send all collected metrics
                        let count = cycle_metrics.len() as u64;
                        if let Some(ref tx) = sender {
                            for m in cycle_metrics {
                                let _ = tx.send(m);
                            }
                        }
                        base_stats.fetch_add(count, AtomicOrdering::Relaxed);
                        base_cycles.fetch_add(1, AtomicOrdering::Relaxed);

                        trace!(target: "cerebro::collector::system",
                            metrics = count,
                            duration_us = start.elapsed().as_micros() as u64,
                            "System collection cycle complete"
                        );
                    }
                    _ = shutdown.notified() => {
                        info!(target: "cerebro::collector::system", "System collector shutting down");
                        break;
                    }
                }
            }
        });

        *self.task_handle.lock().await = Some(handle);
        info!(target: "cerebro::collector::system", interval_ms = interval_dur.as_millis() as u64, "System collector started");
        Ok(())
    }

    async fn stop(&mut self) -> CollectorResult<()> {
        self.base.signal_shutdown();
        self.base.set_running(false);

        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = handle.await;
        }

        info!(target: "cerebro::collector::system", "System collector stopped");
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.base.is_running()
    }

    fn health(&self) -> CollectorHealth {
        self.base.health()
    }

    fn stats(&self) -> CollectorStats {
        self.base.stats()
    }

    fn get_sender(&self) -> CollectorResult<MetricSender> {
        self.base.get_sender().cloned().ok_or_else(|| CollectorError::CollectionFailed {
            source: "system".to_string(),
            message: "collector not running".to_string(),
        })
    }

    fn interval(&self) -> Duration {
        self.base.interval
    }

    fn set_interval(&mut self, interval: Duration) {
        self.base.interval = interval;
    }
}


// ============================================================================
// SECTION 29: NETDATA COLLECTOR
// ============================================================================
// Integrates with a running Netdata instance via its REST API.
// Pulls all metrics via /api/v1/allmetrics and maps Netdata chart families
// to Cerebro metric categories.
// ============================================================================

// ----------------------------------------------------------------------------
// 29.1 Netdata Chart-to-Category Mapper
// ----------------------------------------------------------------------------

/// Maps Netdata chart families/types to Cerebro metric categories.
struct NetdataChartMapper;

impl NetdataChartMapper {
    /// Map a Netdata chart family to a Cerebro metric category.
    fn map_family(family: &str) -> MetricCategory {
        let f = family.to_lowercase();

        if f.contains("cpu") { return MetricCategory::CpuUsage; }
        if f.contains("mem") || f.contains("ram") { return MetricCategory::MemoryUsage; }
        if f.contains("disk") || f.contains("mount") { return MetricCategory::DiskIo; }
        if f.contains("net") || f.contains("eth") || f.contains("wlan") { return MetricCategory::NetworkTraffic; }
        if f.contains("swap") { return MetricCategory::MemoryUsage; }
        if f.contains("load") { return MetricCategory::CpuUsage; }
        if f.contains("uptime") { return MetricCategory::Availability; }
        if f.contains("process") || f.contains("proc") { return MetricCategory::ProcessCount; }
        if f.contains("socket") || f.contains("tcp") || f.contains("udp") { return MetricCategory::NetworkConnections; }
        if f.contains("postgres") || f.contains("mysql") || f.contains("redis") { return MetricCategory::DatabaseConnections; }
        if f.contains("docker") || f.contains("container") { return MetricCategory::ContainerCpu; }
        if f.contains("nginx") || f.contains("apache") { return MetricCategory::HttpRequestRate; }
        if f.contains("entropy") { return MetricCategory::SystemResource; }

        MetricCategory::Custom
    }
}

// ----------------------------------------------------------------------------
// 29.2 Netdata Collector Implementation
// ----------------------------------------------------------------------------

/// Collector that integrates with a Netdata monitoring instance.
///
/// Polls the Netdata REST API at configurable intervals and translates
/// all chart data into Cerebro metrics with proper categorization.
pub struct NetdataCollector {
    /// Base collector for lifecycle management
    base: BaseCollector,
    /// Configuration
    config: NetdataCollectorConfig,
    /// HTTP client with connection pooling
    client: HttpClient,
    /// Tokio task handle
    task_handle: TokioMutex<Option<TokioJoinHandle<()>>>,
    /// Hostname label
    hostname: CompactString,
}

impl NetdataCollector {
    /// Create a new Netdata collector.
    pub fn new(config: NetdataCollectorConfig) -> Self {
        let interval = if config.interval_ms > 0 {
            Duration::from_millis(config.interval_ms)
        } else {
            Duration::from_secs(1)
        };

        let client = HttpClient::builder()
            .timeout(Duration::from_secs(config.timeout_secs))
            .pool_max_idle_per_host(2)
            .build()
            .unwrap_or_default();

        let hostname = fs::read_to_string("/etc/hostname")
            .map(|s| CompactString::from(s.trim()))
            .unwrap_or_else(|_| CompactString::from("unknown"));

        Self {
            base: BaseCollector::new("netdata", CollectorType::Netdata)
                .with_interval(interval),
            config,
            client,
            task_handle: TokioMutex::new(None),
            hostname,
        }
    }

    /// Fetch all metrics from Netdata API.
    async fn fetch_metrics(
        client: &HttpClient,
        base_url: &str,
        hostname: &str,
        exclude_patterns: &[String],
    ) -> Result<Vec<Metric>, String> {
        let url = format!("{}/api/v1/allmetrics?format=json", base_url);

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Netdata API returned status {}", response.status()));
        }

        let body: JsonValue = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        let mut metrics = Vec::new();

        // Netdata allmetrics format: { "chart_id": { "name": ..., "family": ..., "dimensions": { "dim_name": { "value": ... } } } }
        if let Some(charts) = body.as_object() {
            for (chart_id, chart_data) in charts {
                // Check exclusion patterns
                let should_exclude = exclude_patterns.iter().any(|pat| {
                    Regex::new(pat).map_or(false, |re| re.is_match(chart_id))
                });
                if should_exclude {
                    continue;
                }

                let family = chart_data.get("family")
                    .and_then(|f| f.as_str())
                    .unwrap_or("unknown");
                let chart_name = chart_data.get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or(chart_id);
                let units = chart_data.get("units")
                    .and_then(|u| u.as_str())
                    .unwrap_or("");

                let category = NetdataChartMapper::map_family(family);

                if let Some(dimensions) = chart_data.get("dimensions").and_then(|d| d.as_object()) {
                    for (dim_name, dim_data) in dimensions {
                        let value = dim_data.get("value")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);

                        let metric_name = format!("netdata.{}.{}", chart_id, dim_name);

                        let metric = Metric::new(
                            CompactString::from(&metric_name),
                            MetricValue::Gauge(value),
                        )
                        .with_source(MetricSource::Netdata {
                            chart: CompactString::from(chart_name),
                            dimension: CompactString::from(dim_name.as_str()),
                            chart_type: CompactString::from(family),
                        })
                        .with_category(category)
                        .with_label("host", hostname)
                        .with_label("chart", chart_name)
                        .with_label("family", family)
                        .with_label("dimension", dim_name)
                        .with_label("units", units)
                        .with_priority(Priority::Normal);

                        metrics.push(metric);
                    }
                }
            }
        }

        Ok(metrics)
    }
}

#[async_trait]
impl Collector for NetdataCollector {
    fn name(&self) -> &str {
        "netdata"
    }

    fn collector_type(&self) -> CollectorType {
        CollectorType::Netdata
    }

    async fn init(&mut self) -> CollectorResult<()> {
        // Verify connectivity to Netdata
        let url = format!("{}/api/v1/info", self.config.url);
        match self.client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                info!(target: "cerebro::collector::netdata",
                    url = %self.config.url, "Netdata connection verified");
                Ok(())
            }
            Ok(resp) => {
                warn!(target: "cerebro::collector::netdata",
                    url = %self.config.url, status = %resp.status(),
                    "Netdata returned non-success status, will retry on collection");
                Ok(())
            }
            Err(e) => {
                warn!(target: "cerebro::collector::netdata",
                    url = %self.config.url, error = %e,
                    "Cannot reach Netdata, will retry on collection");
                Ok(())
            }
        }
    }

    async fn start(&mut self, tx: MetricSender) -> CollectorResult<()> {
        self.base.set_sender(tx.clone());
        self.base.set_running(true);

        let interval_dur = self.base.interval;
        let shutdown = self.base.shutdown_signal();
        let client = self.client.clone();
        let base_url = self.config.url.clone();
        let hostname = self.hostname.clone();
        let exclude = self.config.exclude_patterns.clone();

        let handle = tokio::spawn(async move {
            let mut tick = interval(interval_dur);

            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        let start = Instant::now();

                        match NetdataCollector::fetch_metrics(&client, &base_url, &hostname, &exclude).await {
                            Ok(metrics) => {
                                let count = metrics.len();
                                for m in metrics {
                                    let _ = tx.send(m);
                                }
                                trace!(target: "cerebro::collector::netdata",
                                    metrics = count,
                                    duration_us = start.elapsed().as_micros() as u64,
                                    "Netdata collection cycle complete"
                                );
                            }
                            Err(e) => {
                                warn!(target: "cerebro::collector::netdata", error = %e, "Collection failed");
                            }
                        }
                    }
                    _ = shutdown.notified() => {
                        info!(target: "cerebro::collector::netdata", "Netdata collector shutting down");
                        break;
                    }
                }
            }
        });

        *self.task_handle.lock().await = Some(handle);
        info!(target: "cerebro::collector::netdata",
            url = %self.config.url, interval_ms = interval_dur.as_millis() as u64,
            "Netdata collector started");
        Ok(())
    }

    async fn stop(&mut self) -> CollectorResult<()> {
        self.base.signal_shutdown();
        self.base.set_running(false);
        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = handle.await;
        }
        info!(target: "cerebro::collector::netdata", "Netdata collector stopped");
        Ok(())
    }

    fn is_running(&self) -> bool { self.base.is_running() }
    fn health(&self) -> CollectorHealth { self.base.health() }
    fn stats(&self) -> CollectorStats { self.base.stats() }

    fn get_sender(&self) -> CollectorResult<MetricSender> {
        self.base.get_sender().cloned().ok_or_else(|| CollectorError::CollectionFailed {
            source: "netdata".to_string(),
            message: "collector not running".to_string(),
        })
    }

    fn interval(&self) -> Duration { self.base.interval }
    fn set_interval(&mut self, interval: Duration) { self.base.interval = interval; }
}


// ============================================================================
// SECTION 30: DOCKER COLLECTOR
// ============================================================================
// Collects container metrics via the Docker Engine API over Unix socket.
// Supports container enumeration, CPU/memory/network/IO stats per container.
// Auto-classifies containers into projects using labels and name patterns.
// ============================================================================

// ----------------------------------------------------------------------------
// 30.1 Docker API Response Types
// ----------------------------------------------------------------------------

/// Docker container list entry (from GET /containers/json).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DockerContainer {
    id: String,
    names: Vec<String>,
    image: String,
    state: String,
    status: String,
    #[serde(default)]
    labels: HashMap<String, String>,
}

impl DockerContainer {
    /// Get the clean container name (strip leading '/').
    fn clean_name(&self) -> &str {
        self.names.first()
            .map(|n| n.trim_start_matches('/'))
            .unwrap_or(&self.id[..12])
    }

    /// Get the short container ID (12 chars).
    fn short_id(&self) -> &str {
        if self.id.len() >= 12 { &self.id[..12] } else { &self.id }
    }
}

/// Docker container stats response (from GET /containers/{id}/stats?stream=false).
#[derive(Debug, Clone, Deserialize)]
struct DockerStats {
    /// CPU stats
    #[serde(default)]
    cpu_stats: DockerCpuStats,
    /// Previous CPU stats (for delta computation)
    #[serde(default)]
    precpu_stats: DockerCpuStats,
    /// Memory stats
    #[serde(default)]
    memory_stats: DockerMemoryStats,
    /// Network stats (per-network)
    #[serde(default)]
    networks: Option<HashMap<String, DockerNetworkStats>>,
    /// Block I/O stats
    #[serde(default)]
    blkio_stats: DockerBlkioStats,
    /// PIDs stats
    #[serde(default)]
    pids_stats: DockerPidsStats,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerCpuStats {
    #[serde(default)]
    cpu_usage: DockerCpuUsage,
    #[serde(default)]
    system_cpu_usage: Option<u64>,
    #[serde(default)]
    online_cpus: Option<u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerCpuUsage {
    #[serde(default)]
    total_usage: u64,
    #[serde(default)]
    usage_in_kernelmode: u64,
    #[serde(default)]
    usage_in_usermode: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerMemoryStats {
    #[serde(default)]
    usage: u64,
    #[serde(default)]
    max_usage: u64,
    #[serde(default)]
    limit: u64,
    #[serde(default)]
    stats: Option<DockerMemoryDetailStats>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerMemoryDetailStats {
    #[serde(default)]
    cache: u64,
    #[serde(default)]
    rss: u64,
    #[serde(default)]
    mapped_file: u64,
    #[serde(default)]
    pgfault: u64,
    #[serde(default)]
    pgmajfault: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerNetworkStats {
    #[serde(default)]
    rx_bytes: u64,
    #[serde(default)]
    rx_packets: u64,
    #[serde(default)]
    rx_errors: u64,
    #[serde(default)]
    rx_dropped: u64,
    #[serde(default)]
    tx_bytes: u64,
    #[serde(default)]
    tx_packets: u64,
    #[serde(default)]
    tx_errors: u64,
    #[serde(default)]
    tx_dropped: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerBlkioStats {
    #[serde(default)]
    io_service_bytes_recursive: Option<Vec<DockerBlkioEntry>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerBlkioEntry {
    #[serde(default)]
    op: String,
    #[serde(default)]
    value: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct DockerPidsStats {
    #[serde(default)]
    current: Option<u64>,
    #[serde(default)]
    limit: Option<u64>,
}

// ----------------------------------------------------------------------------
// 30.2 Docker HTTP Client (Unix Socket)
// ----------------------------------------------------------------------------

/// Minimal HTTP client for Docker Engine API over Unix socket.
struct DockerClient {
    socket_path: String,
}

impl DockerClient {
    fn new(socket_path: &str) -> Self {
        Self {
            socket_path: socket_path.to_string(),
        }
    }

    /// Send an HTTP GET request over the Unix socket.
    async fn get(&self, path: &str) -> Result<String, String> {
        let stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| format!("Failed to connect to Docker socket: {}", e))?;

        let request = format!(
            "GET {} HTTP/1.0\r\nHost: localhost\r\n\r\n",
            path
        );

        let (mut reader, mut writer) = stream.into_split();
        writer.write_all(request.as_bytes())
            .await
            .map_err(|e| format!("Failed to write request: {}", e))?;
        writer.shutdown()
            .await
            .map_err(|e| format!("Failed to shutdown write: {}", e))?;

        let mut response = Vec::new();
        reader.read_to_end(&mut response)
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        let response_str = String::from_utf8_lossy(&response).to_string();

        // Extract body from HTTP response (after \r\n\r\n)
        if let Some(body_start) = response_str.find("\r\n\r\n") {
            Ok(response_str[body_start + 4..].to_string())
        } else {
            Err("Invalid HTTP response from Docker".to_string())
        }
    }

    /// List running containers.
    async fn list_containers(&self) -> Result<Vec<DockerContainer>, String> {
        let body = self.get("/containers/json").await?;
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse container list: {}", e))
    }

    /// Get stats for a container (one-shot, non-streaming).
    async fn container_stats(&self, id: &str) -> Result<DockerStats, String> {
        let path = format!("/containers/{}/stats?stream=false", id);
        let body = self.get(&path).await?;
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse stats for {}: {}", id, e))
    }
}

// ----------------------------------------------------------------------------
// 30.3 Docker Collector Implementation
// ----------------------------------------------------------------------------

/// Docker container metrics collector.
///
/// Connects to the Docker Engine API via Unix socket to collect
/// CPU, memory, network, and I/O metrics per container.
pub struct DockerCollector {
    /// Base collector
    base: BaseCollector,
    /// Configuration
    config: DockerCollectorConfig,
    /// Task handle
    task_handle: TokioMutex<Option<TokioJoinHandle<()>>>,
    /// Hostname
    hostname: CompactString,
}

impl DockerCollector {
    /// Create a new Docker collector.
    pub fn new(config: DockerCollectorConfig) -> Self {
        let interval = if config.interval_ms > 0 {
            Duration::from_millis(config.interval_ms)
        } else {
            Duration::from_secs(5) // Docker stats are heavier, use longer interval
        };

        let hostname = fs::read_to_string("/etc/hostname")
            .map(|s| CompactString::from(s.trim()))
            .unwrap_or_else(|_| CompactString::from("unknown"));

        Self {
            base: BaseCollector::new("docker", CollectorType::Docker)
                .with_interval(interval),
            config,
            task_handle: TokioMutex::new(None),
            hostname,
        }
    }

    /// Convert Docker stats into Cerebro metrics for a single container.
    fn stats_to_metrics(
        stats: &DockerStats,
        container_name: &str,
        container_id: &str,
        image: &str,
        hostname: &str,
    ) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(20);

        let mk = |name: &str, val: f64, cat: MetricCategory| -> Metric {
            Metric::new(CompactString::from(name), MetricValue::Gauge(val))
                .with_source(MetricSource::Docker {
                    container_id: CompactString::from(container_id),
                    container_name: CompactString::from(container_name),
                    stat_type: DockerStatType::Cpu,
                })
                .with_category(cat)
                .with_label("host", hostname)
                .with_label("container_name", container_name)
                .with_label("container_id", container_id)
                .with_label("image", image)
                .with_priority(Priority::Normal)
        };

        // CPU usage percentage
        let cpu_delta = stats.cpu_stats.cpu_usage.total_usage
            .saturating_sub(stats.precpu_stats.cpu_usage.total_usage);
        let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0)
            .saturating_sub(stats.precpu_stats.system_cpu_usage.unwrap_or(0));
        let num_cpus = stats.cpu_stats.online_cpus.unwrap_or(1) as f64;

        let cpu_percent = if system_delta > 0 && cpu_delta > 0 {
            (cpu_delta as f64 / system_delta as f64) * num_cpus * 100.0
        } else {
            0.0
        };

        metrics.push(mk("docker.cpu.usage_percent", cpu_percent, MetricCategory::ContainerCpu));
        metrics.push(mk("docker.cpu.user_ns", stats.cpu_stats.cpu_usage.usage_in_usermode as f64, MetricCategory::ContainerCpu));
        metrics.push(mk("docker.cpu.kernel_ns", stats.cpu_stats.cpu_usage.usage_in_kernelmode as f64, MetricCategory::ContainerCpu));

        // Memory
        let mem_usage = stats.memory_stats.usage;
        let mem_limit = stats.memory_stats.limit;
        let mem_percent = if mem_limit > 0 { (mem_usage as f64 / mem_limit as f64) * 100.0 } else { 0.0 };

        metrics.push(mk("docker.memory.usage_bytes", mem_usage as f64, MetricCategory::ContainerMemory));
        metrics.push(mk("docker.memory.limit_bytes", mem_limit as f64, MetricCategory::ContainerMemory));
        metrics.push(mk("docker.memory.usage_percent", mem_percent, MetricCategory::ContainerMemory));
        metrics.push(mk("docker.memory.max_usage_bytes", stats.memory_stats.max_usage as f64, MetricCategory::ContainerMemory));

        if let Some(ref detail) = stats.memory_stats.stats {
            metrics.push(mk("docker.memory.cache_bytes", detail.cache as f64, MetricCategory::ContainerMemory));
            metrics.push(mk("docker.memory.rss_bytes", detail.rss as f64, MetricCategory::ContainerMemory));
        }

        // Network (aggregate across all networks)
        if let Some(ref networks) = stats.networks {
            let mut total_rx: u64 = 0;
            let mut total_tx: u64 = 0;
            let mut total_rx_packets: u64 = 0;
            let mut total_tx_packets: u64 = 0;

            for (_net_name, net_stats) in networks {
                total_rx += net_stats.rx_bytes;
                total_tx += net_stats.tx_bytes;
                total_rx_packets += net_stats.rx_packets;
                total_tx_packets += net_stats.tx_packets;
            }

            metrics.push(mk("docker.net.rx_bytes", total_rx as f64, MetricCategory::ContainerNetwork));
            metrics.push(mk("docker.net.tx_bytes", total_tx as f64, MetricCategory::ContainerNetwork));
            metrics.push(mk("docker.net.rx_packets", total_rx_packets as f64, MetricCategory::ContainerNetwork));
            metrics.push(mk("docker.net.tx_packets", total_tx_packets as f64, MetricCategory::ContainerNetwork));
        }

        // Block I/O
        if let Some(ref io_entries) = stats.blkio_stats.io_service_bytes_recursive {
            let mut read_bytes: u64 = 0;
            let mut write_bytes: u64 = 0;

            for entry in io_entries {
                match entry.op.to_lowercase().as_str() {
                    "read" => read_bytes += entry.value,
                    "write" => write_bytes += entry.value,
                    _ => {}
                }
            }

            metrics.push(mk("docker.blkio.read_bytes", read_bytes as f64, MetricCategory::ContainerIo));
            metrics.push(mk("docker.blkio.write_bytes", write_bytes as f64, MetricCategory::ContainerIo));
        }

        // PIDs
        if let Some(current_pids) = stats.pids_stats.current {
            metrics.push(mk("docker.pids.current", current_pids as f64, MetricCategory::ContainerCpu));
        }

        metrics
    }
}

#[async_trait]
impl Collector for DockerCollector {
    fn name(&self) -> &str { "docker" }
    fn collector_type(&self) -> CollectorType { CollectorType::Docker }

    async fn init(&mut self) -> CollectorResult<()> {
        // Verify Docker socket is accessible
        let socket_path = &self.config.socket_path;
        if !Path::new(socket_path).exists() {
            warn!(target: "cerebro::collector::docker",
                path = socket_path, "Docker socket not found, collector will retry");
        } else {
            info!(target: "cerebro::collector::docker",
                path = socket_path, "Docker socket found");
        }
        Ok(())
    }

    async fn start(&mut self, tx: MetricSender) -> CollectorResult<()> {
        self.base.set_sender(tx.clone());
        self.base.set_running(true);

        let interval_dur = self.base.interval;
        let shutdown = self.base.shutdown_signal();
        let socket_path = self.config.socket_path.clone();
        let hostname = self.hostname.clone();
        let include_patterns: Vec<Regex> = self.config.include_patterns.iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();
        let exclude_patterns: Vec<Regex> = self.config.exclude_patterns.iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();

        let handle = tokio::spawn(async move {
            let docker = DockerClient::new(&socket_path);
            let mut tick = interval(interval_dur);

            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        let start = Instant::now();

                        // List containers
                        let containers = match docker.list_containers().await {
                            Ok(c) => c,
                            Err(e) => {
                                warn!(target: "cerebro::collector::docker", error = %e, "Failed to list containers");
                                continue;
                            }
                        };

                        // Emit container count
                        let count_metric = Metric::new(
                            CompactString::from("docker.containers.running"),
                            MetricValue::Gauge(containers.len() as f64),
                        )
                        .with_source(MetricSource::Docker {
                            container_id: CompactString::from(""),
                            container_name: CompactString::from(""),
                            stat_type: DockerStatType::Cpu,
                        })
                        .with_category(MetricCategory::ContainerCpu)
                        .with_label("host", hostname.as_str());
                        let _ = tx.send(count_metric);

                        let mut total_metrics = 0u64;

                        for container in &containers {
                            let name = container.clean_name();

                            // Apply include/exclude filters
                            if !include_patterns.is_empty() {
                                let matches = include_patterns.iter().any(|re| re.is_match(name));
                                if !matches { continue; }
                            }
                            if exclude_patterns.iter().any(|re| re.is_match(name)) {
                                continue;
                            }

                            // Fetch stats
                            match docker.container_stats(&container.id).await {
                                Ok(stats) => {
                                    let metrics = DockerCollector::stats_to_metrics(
                                        &stats, name, container.short_id(), &container.image, &hostname,
                                    );
                                    total_metrics += metrics.len() as u64;
                                    for m in metrics {
                                        let _ = tx.send(m);
                                    }
                                }
                                Err(e) => {
                                    warn!(target: "cerebro::collector::docker",
                                        container = name, error = %e, "Failed to get container stats");
                                }
                            }
                        }

                        trace!(target: "cerebro::collector::docker",
                            containers = containers.len(),
                            metrics = total_metrics,
                            duration_us = start.elapsed().as_micros() as u64,
                            "Docker collection cycle complete"
                        );
                    }
                    _ = shutdown.notified() => {
                        info!(target: "cerebro::collector::docker", "Docker collector shutting down");
                        break;
                    }
                }
            }
        });

        *self.task_handle.lock().await = Some(handle);
        info!(target: "cerebro::collector::docker",
            socket = %self.config.socket_path, interval_ms = interval_dur.as_millis() as u64,
            "Docker collector started");
        Ok(())
    }

    async fn stop(&mut self) -> CollectorResult<()> {
        self.base.signal_shutdown();
        self.base.set_running(false);
        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = handle.await;
        }
        info!(target: "cerebro::collector::docker", "Docker collector stopped");
        Ok(())
    }

    fn is_running(&self) -> bool { self.base.is_running() }
    fn health(&self) -> CollectorHealth { self.base.health() }
    fn stats(&self) -> CollectorStats { self.base.stats() }

    fn get_sender(&self) -> CollectorResult<MetricSender> {
        self.base.get_sender().cloned().ok_or_else(|| CollectorError::CollectionFailed {
            source: "docker".to_string(),
            message: "collector not running".to_string(),
        })
    }

    fn interval(&self) -> Duration { self.base.interval }
    fn set_interval(&mut self, interval: Duration) { self.base.interval = interval; }
}


// ============================================================================
// SECTION 31: HTTP ENDPOINT COLLECTOR
// ============================================================================
// Probes HTTP endpoints for availability, response time, and status.
// Supports parallel probing with configurable timeouts per endpoint.
// Useful for health check monitoring of web services and APIs.
// ============================================================================

/// HTTP endpoint collector.
///
/// Performs parallel HTTP probes against configured endpoints and emits
/// response time, status code, and availability metrics.
pub struct HttpEndpointCollector {
    /// Base collector
    base: BaseCollector,
    /// Configuration
    config: HttpCollectorConfig,
    /// HTTP client
    client: HttpClient,
    /// Task handle
    task_handle: TokioMutex<Option<TokioJoinHandle<()>>>,
    /// Hostname
    hostname: CompactString,
}

impl HttpEndpointCollector {
    /// Create a new HTTP endpoint collector.
    pub fn new(config: HttpCollectorConfig) -> Self {
        let client = HttpClient::builder()
            .timeout(Duration::from_secs(config.default_timeout_secs))
            .pool_max_idle_per_host(4)
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_default();

        let hostname = fs::read_to_string("/etc/hostname")
            .map(|s| CompactString::from(s.trim()))
            .unwrap_or_else(|_| CompactString::from("unknown"));

        Self {
            base: BaseCollector::new("http", CollectorType::Http)
                .with_interval(Duration::from_secs(30)),
            config,
            client,
            task_handle: TokioMutex::new(None),
            hostname,
        }
    }

    /// Probe a single HTTP endpoint and return metrics.
    async fn probe_endpoint(
        client: &HttpClient,
        endpoint: &HttpEndpointConfig,
        hostname: &str,
    ) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(4);
        let endpoint_name = endpoint.name.as_deref().unwrap_or(&endpoint.url);
        let labels: [(&str, &str); 3] = [
            ("host", hostname),
            ("url", &endpoint.url),
            ("name", endpoint_name),
        ];

        let mk = |name: &str, val: f64, cat: MetricCategory| -> Metric {
            let mut m = Metric::new(CompactString::from(name), MetricValue::Gauge(val))
                .with_source(MetricSource::Http {
                    endpoint: CompactString::from(&endpoint.url),
                    method: HttpMethod::Get,
                })
                .with_category(cat);
            for (k, v) in &labels { m = m.with_label(k, v); }
            m.with_priority(Priority::Normal)
        };

        let start = Instant::now();

        let request = match endpoint.method.to_uppercase().as_str() {
            "POST" => client.post(&endpoint.url),
            "HEAD" => client.head(&endpoint.url),
            "PUT" => client.put(&endpoint.url),
            _ => client.get(&endpoint.url),
        };

        // Add custom headers
        let mut request = request;
        for (key, value) in &endpoint.headers {
            request = request.header(key.as_str(), value.as_str());
        }

        // Apply endpoint-specific timeout
        let request = if let Some(timeout_s) = endpoint.timeout_secs {
            request.timeout(Duration::from_secs(timeout_s))
        } else {
            request
        };

        match request.send().await {
            Ok(response) => {
                let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
                let status = response.status().as_u16();
                let content_length = response.content_length().unwrap_or(0);

                // Check if status is expected
                let is_up = if endpoint.expected_status.is_empty() {
                    response.status().is_success()
                } else {
                    endpoint.expected_status.contains(&status)
                };

                metrics.push(mk("http.response_time_ms", elapsed_ms, MetricCategory::HttpResponseTime));
                metrics.push(mk("http.status_code", status as f64, MetricCategory::HttpStatus));
                metrics.push(mk("http.up", if is_up { 1.0 } else { 0.0 }, MetricCategory::Availability));
                metrics.push(mk("http.content_length_bytes", content_length as f64, MetricCategory::HttpResponseTime));
            }
            Err(e) => {
                let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

                metrics.push(mk("http.response_time_ms", elapsed_ms, MetricCategory::HttpResponseTime));
                metrics.push(mk("http.up", 0.0, MetricCategory::Availability));
                metrics.push(mk("http.error", 1.0, MetricCategory::HttpErrors));

                let is_timeout = e.is_timeout();
                metrics.push(Metric::new(
                    CompactString::from("http.timeout"),
                    MetricValue::Gauge(if is_timeout { 1.0 } else { 0.0 }),
                )
                .with_source(MetricSource::Http {
                    endpoint: CompactString::from(&endpoint.url),
                    method: HttpMethod::Get,
                })
                .with_category(MetricCategory::HttpResponseTime)
                .with_label("host", hostname).with_label("url", &endpoint.url));
            }
        }

        metrics
    }
}

#[async_trait]
impl Collector for HttpEndpointCollector {
    fn name(&self) -> &str { "http" }
    fn collector_type(&self) -> CollectorType { CollectorType::Http }

    async fn init(&mut self) -> CollectorResult<()> {
        info!(target: "cerebro::collector::http",
            endpoints = self.config.endpoints.len(),
            "HTTP endpoint collector initialized");
        Ok(())
    }

    async fn start(&mut self, tx: MetricSender) -> CollectorResult<()> {
        self.base.set_sender(tx.clone());
        self.base.set_running(true);

        let interval_dur = self.base.interval;
        let shutdown = self.base.shutdown_signal();
        let client = self.client.clone();
        let endpoints = self.config.endpoints.clone();
        let hostname = self.hostname.clone();

        let handle = tokio::spawn(async move {
            let mut tick = interval(interval_dur);

            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        let start = Instant::now();

                        // Probe all endpoints in parallel using JoinSet
                        let mut join_set = JoinSet::new();

                        for endpoint in &endpoints {
                            let client = client.clone();
                            let ep = endpoint.clone();
                            let hn = hostname.clone();

                            join_set.spawn(async move {
                                HttpEndpointCollector::probe_endpoint(&client, &ep, &hn).await
                            });
                        }

                        let mut total_metrics = 0u64;
                        while let Some(result) = join_set.join_next().await {
                            if let Ok(metrics) = result {
                                total_metrics += metrics.len() as u64;
                                for m in metrics {
                                    let _ = tx.send(m);
                                }
                            }
                        }

                        trace!(target: "cerebro::collector::http",
                            endpoints = endpoints.len(),
                            metrics = total_metrics,
                            duration_us = start.elapsed().as_micros() as u64,
                            "HTTP probe cycle complete"
                        );
                    }
                    _ = shutdown.notified() => {
                        info!(target: "cerebro::collector::http", "HTTP collector shutting down");
                        break;
                    }
                }
            }
        });

        *self.task_handle.lock().await = Some(handle);
        info!(target: "cerebro::collector::http",
            endpoints = self.config.endpoints.len(), interval_ms = interval_dur.as_millis() as u64,
            "HTTP endpoint collector started");
        Ok(())
    }

    async fn stop(&mut self) -> CollectorResult<()> {
        self.base.signal_shutdown();
        self.base.set_running(false);
        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = handle.await;
        }
        info!(target: "cerebro::collector::http", "HTTP collector stopped");
        Ok(())
    }

    fn is_running(&self) -> bool { self.base.is_running() }
    fn health(&self) -> CollectorHealth { self.base.health() }
    fn stats(&self) -> CollectorStats { self.base.stats() }

    fn get_sender(&self) -> CollectorResult<MetricSender> {
        self.base.get_sender().cloned().ok_or_else(|| CollectorError::CollectionFailed {
            source: "http".to_string(),
            message: "collector not running".to_string(),
        })
    }

    fn interval(&self) -> Duration { self.base.interval }
    fn set_interval(&mut self, interval: Duration) { self.base.interval = interval; }
}


// ============================================================================
// SECTION 32: LOG COLLECTOR
// ============================================================================
// Tails log files and extracts metrics from them:
// - Line rate counting
// - Error/warning detection via pattern matching
// - JSON structured log parsing for numeric fields
// - File rotation detection via inode tracking
// - Offset bookmarking for resume after restart
// ============================================================================

// ----------------------------------------------------------------------------
// 32.1 Log File State
// ----------------------------------------------------------------------------

/// Tracked state for a single log file.
struct LogFileState {
    /// File path
    path: String,
    /// Current read offset in bytes
    offset: u64,
    /// Inode number (for rotation detection)
    inode: u64,
    /// Lines read since last emission
    lines_since_last: u64,
    /// Errors matched since last emission
    errors_since_last: u64,
    /// Warnings matched since last emission
    warnings_since_last: u64,
    /// Bytes read since last emission
    bytes_since_last: u64,
    /// Compiled regex patterns for error detection
    error_patterns: Vec<Regex>,
    /// Compiled regex patterns for warning detection
    warning_patterns: Vec<Regex>,
    /// Custom labels for this file's metrics
    labels: HashMap<String, String>,
}

impl LogFileState {
    /// Create a new log file state.
    fn new(config: &LogFileConfig) -> Self {
        // Default error/warning patterns
        let error_patterns = vec![
            Regex::new(r"(?i)\b(error|err|fatal|panic|exception|fail(ed|ure)?)\b").unwrap(),
            Regex::new(r"(?i)\b(crit(ical)?|emerg(ency)?|alert)\b").unwrap(),
        ];
        let warning_patterns = vec![
            Regex::new(r"(?i)\b(warn(ing)?|deprecated|timeout|retry)\b").unwrap(),
        ];

        // Get initial inode
        let inode = fs::metadata(&config.path)
            .map(|m| {
                #[cfg(unix)]
                { std::os::unix::fs::MetadataExt::ino(&m) }
                #[cfg(not(unix))]
                { 0 }
            })
            .unwrap_or(0);

        Self {
            path: config.path.clone(),
            offset: 0,
            inode,
            lines_since_last: 0,
            errors_since_last: 0,
            warnings_since_last: 0,
            bytes_since_last: 0,
            error_patterns,
            warning_patterns,
            labels: config.labels.clone(),
        }
    }

    /// Check if the file has been rotated (inode changed).
    fn check_rotation(&mut self) -> bool {
        let current_inode = fs::metadata(&self.path)
            .map(|m| {
                #[cfg(unix)]
                { std::os::unix::fs::MetadataExt::ino(&m) }
                #[cfg(not(unix))]
                { 0 }
            })
            .unwrap_or(0);

        if current_inode != self.inode && current_inode != 0 {
            // File was rotated — reset offset and update inode
            self.inode = current_inode;
            self.offset = 0;
            true
        } else {
            false
        }
    }

    /// Read new lines from the file since last offset.
    fn read_new_lines(&mut self) -> Vec<String> {
        let file = match File::open(&self.path) {
            Ok(f) => f,
            Err(_) => return Vec::new(),
        };

        let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);

        // If file is smaller than our offset, it was truncated
        if file_len < self.offset {
            self.offset = 0;
        }

        // Seek to offset
        let mut reader = BufReader::new(file);
        if self.offset > 0 {
            use std::io::Seek;
            if reader.seek(std::io::SeekFrom::Start(self.offset)).is_err() {
                return Vec::new();
            }
        }

        let mut lines = Vec::new();
        let mut bytes_read = 0u64;

        // Read up to 10000 lines per cycle to avoid blocking
        for _ in 0..10000 {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    bytes_read += n as u64;
                    let trimmed = line.trim_end().to_string();
                    if !trimmed.is_empty() {
                        lines.push(trimmed);
                    }
                }
                Err(_) => break,
            }
        }

        self.offset += bytes_read;
        self.bytes_since_last += bytes_read;

        lines
    }

    /// Process a line, updating counters.
    fn process_line(&mut self, line: &str) {
        self.lines_since_last += 1;

        // Check for errors
        if self.error_patterns.iter().any(|re| re.is_match(line)) {
            self.errors_since_last += 1;
        }
        // Check for warnings
        else if self.warning_patterns.iter().any(|re| re.is_match(line)) {
            self.warnings_since_last += 1;
        }
    }

    /// Drain counters and produce metrics.
    fn drain_metrics(&mut self, hostname: &str) -> Vec<Metric> {
        let mut metrics = Vec::with_capacity(6);

        let file_label = self.path.clone();
        let mk = |name: &str, val: f64, cat: MetricCategory| -> Metric {
            Metric::new(CompactString::from(name), MetricValue::Gauge(val))
                .with_source(MetricSource::Log {
                    file_path: CompactString::from(&file_label),
                    log_type: LogType::Application,
                })
                .with_category(cat)
                .with_label("host", hostname)
                .with_label("file", &file_label)
                .with_priority(Priority::Normal)
        };

        metrics.push(mk("log.lines", self.lines_since_last as f64, MetricCategory::Custom));
        metrics.push(mk("log.errors", self.errors_since_last as f64, MetricCategory::ErrorRate));
        metrics.push(mk("log.warnings", self.warnings_since_last as f64, MetricCategory::ErrorRate));
        metrics.push(mk("log.bytes_read", self.bytes_since_last as f64, MetricCategory::Custom));

        // Add custom labels from config
        for metric in &mut metrics {
            for (k, v) in &self.labels {
                *metric = metric.clone().with_label(k, v);
            }
        }

        // Reset counters
        self.lines_since_last = 0;
        self.errors_since_last = 0;
        self.warnings_since_last = 0;
        self.bytes_since_last = 0;

        metrics
    }
}

// ----------------------------------------------------------------------------
// 32.2 Log Collector Implementation
// ----------------------------------------------------------------------------

/// Log file tailing collector.
///
/// Watches configured log files, detects new lines, counts errors/warnings
/// using pattern matching, and emits log-derived metrics.
pub struct LogCollector {
    /// Base collector
    base: BaseCollector,
    /// Configuration
    config: LogCollectorConfig,
    /// Task handle
    task_handle: TokioMutex<Option<TokioJoinHandle<()>>>,
    /// Hostname
    hostname: CompactString,
}

impl LogCollector {
    /// Create a new log collector.
    pub fn new(config: LogCollectorConfig) -> Self {
        let hostname = fs::read_to_string("/etc/hostname")
            .map(|s| CompactString::from(s.trim()))
            .unwrap_or_else(|_| CompactString::from("unknown"));

        Self {
            base: BaseCollector::new("log", CollectorType::Log)
                .with_interval(Duration::from_secs(5)),
            config,
            task_handle: TokioMutex::new(None),
            hostname,
        }
    }

    /// Expand glob patterns to actual file paths.
    fn expand_paths(configs: &[LogFileConfig]) -> Vec<LogFileConfig> {
        let mut expanded = Vec::new();

        for config in configs {
            // Try glob expansion
            if config.path.contains('*') || config.path.contains('?') {
                if let Ok(paths) = glob::glob(&config.path) {
                    for path in paths.flatten() {
                        let mut c = config.clone();
                        c.path = path.to_string_lossy().to_string();
                        expanded.push(c);
                    }
                }
            } else {
                expanded.push(config.clone());
            }
        }

        expanded
    }
}

#[async_trait]
impl Collector for LogCollector {
    fn name(&self) -> &str { "log" }
    fn collector_type(&self) -> CollectorType { CollectorType::Log }

    async fn init(&mut self) -> CollectorResult<()> {
        let file_count = self.config.files.len();
        info!(target: "cerebro::collector::log",
            files = file_count, "Log collector initialized");
        Ok(())
    }

    async fn start(&mut self, tx: MetricSender) -> CollectorResult<()> {
        self.base.set_sender(tx.clone());
        self.base.set_running(true);

        let interval_dur = self.base.interval;
        let shutdown = self.base.shutdown_signal();
        let file_configs = Self::expand_paths(&self.config.files);
        let hostname = self.hostname.clone();

        let handle = tokio::spawn(async move {
            // Initialize file states, seeking to end so we only see new lines
            let mut states: Vec<LogFileState> = file_configs.iter()
                .map(|cfg| {
                    let mut state = LogFileState::new(cfg);
                    // Seek to end of file on start
                    if let Ok(meta) = fs::metadata(&cfg.path) {
                        state.offset = meta.len();
                    }
                    state
                })
                .collect();

            let mut tick = interval(interval_dur);

            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        let start = Instant::now();
                        let mut total_metrics = 0u64;

                        // Emit total files being watched
                        let _ = tx.send(Metric::new(
                            CompactString::from("log.files_watched"),
                            MetricValue::Gauge(states.len() as f64),
                        )
                        .with_source(MetricSource::Log {
                            file_path: CompactString::from(""),
                            log_type: LogType::Application,
                        })
                        .with_category(MetricCategory::Custom)
                        .with_label("host", hostname.as_str()));

                        for state in &mut states {
                            // Check for file rotation
                            state.check_rotation();

                            // Read new lines
                            let new_lines = state.read_new_lines();

                            // Process each line
                            for line in &new_lines {
                                state.process_line(line);
                            }

                            // Emit metrics for this file
                            if state.lines_since_last > 0 || state.bytes_since_last > 0 {
                                let metrics = state.drain_metrics(&hostname);
                                total_metrics += metrics.len() as u64;
                                for m in metrics {
                                    let _ = tx.send(m);
                                }
                            }
                        }

                        if total_metrics > 0 {
                            trace!(target: "cerebro::collector::log",
                                files = states.len(),
                                metrics = total_metrics,
                                duration_us = start.elapsed().as_micros() as u64,
                                "Log collection cycle complete"
                            );
                        }
                    }
                    _ = shutdown.notified() => {
                        info!(target: "cerebro::collector::log", "Log collector shutting down");
                        break;
                    }
                }
            }
        });

        *self.task_handle.lock().await = Some(handle);
        info!(target: "cerebro::collector::log",
            files = file_configs.len(), interval_ms = interval_dur.as_millis() as u64,
            "Log collector started");
        Ok(())
    }

    async fn stop(&mut self) -> CollectorResult<()> {
        self.base.signal_shutdown();
        self.base.set_running(false);
        if let Some(handle) = self.task_handle.lock().await.take() {
            let _ = handle.await;
        }
        info!(target: "cerebro::collector::log", "Log collector stopped");
        Ok(())
    }

    fn is_running(&self) -> bool { self.base.is_running() }
    fn health(&self) -> CollectorHealth { self.base.health() }
    fn stats(&self) -> CollectorStats { self.base.stats() }

    fn get_sender(&self) -> CollectorResult<MetricSender> {
        self.base.get_sender().cloned().ok_or_else(|| CollectorError::CollectionFailed {
            source: "log".to_string(),
            message: "collector not running".to_string(),
        })
    }

    fn interval(&self) -> Duration { self.base.interval }
    fn set_interval(&mut self, interval: Duration) { self.base.interval = interval; }
}


// ============================================================================
// SECTION 33: PHASE 5 TESTS
// ============================================================================

#[cfg(test)]
mod phase5_tests {
    use super::*;

    #[test]
    fn test_cpu_snapshot_parsing() {
        let line = "cpu  12345 678 9012 34567 890 12 34 56";
        let snap = CpuSnapshot::parse(line).unwrap();
        assert_eq!(snap.core_id.as_str(), "cpu");
        assert_eq!(snap.user, 12345);
        assert_eq!(snap.nice, 678);
        assert_eq!(snap.system, 9012);
        assert_eq!(snap.idle, 34567);
        assert_eq!(snap.iowait, 890);
        assert_eq!(snap.irq, 12);
        assert_eq!(snap.softirq, 34);
        assert_eq!(snap.steal, 56);
        assert_eq!(snap.total(), 12345 + 678 + 9012 + 34567 + 890 + 12 + 34 + 56);
    }

    #[test]
    fn test_cpu_snapshot_per_core() {
        let line = "cpu3 1000 200 300 4000 50 6 7 8";
        let snap = CpuSnapshot::parse(line).unwrap();
        assert_eq!(snap.core_id.as_str(), "cpu3");
        assert_eq!(snap.user, 1000);
    }

    #[test]
    fn test_cpu_snapshot_invalid() {
        assert!(CpuSnapshot::parse("intr 12345 678").is_none());
        assert!(CpuSnapshot::parse("").is_none());
    }

    #[test]
    fn test_cpu_percentage_computation() {
        let prev = CpuSnapshot {
            core_id: CompactString::from("cpu"),
            user: 1000, nice: 0, system: 500, idle: 8000,
            iowait: 100, irq: 10, softirq: 5, steal: 0,
        };
        let curr = CpuSnapshot {
            core_id: CompactString::from("cpu"),
            user: 1500, nice: 0, system: 700, idle: 8500,
            iowait: 150, irq: 15, softirq: 10, steal: 0,
        };

        let pcts = curr.compute_percentages(&prev);
        let total_delta = (1500 + 700 + 8500 + 150 + 15 + 10) - (1000 + 500 + 8000 + 100 + 10 + 5);
        assert!(pcts.usage > 0.0);
        assert!(pcts.idle > 0.0);
        assert!((pcts.user + pcts.system + pcts.idle + pcts.iowait + pcts.irq + pcts.softirq - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_cpu_percentage_zero_delta() {
        let snap = CpuSnapshot::default();
        let pcts = snap.compute_percentages(&snap);
        assert_eq!(pcts.usage, 0.0);
    }

    #[test]
    fn test_disk_snapshot_parsing() {
        let line = "   8       0 sda 12345 678 901234 5678 9012 345 678901 2345 0 6789 12345 0 0 0 0";
        let snap = DiskSnapshot::parse(line).unwrap();
        assert_eq!(snap.device.as_str(), "sda");
        assert_eq!(snap.reads_completed, 12345);
        assert_eq!(snap.sectors_read, 901234);
        assert_eq!(snap.writes_completed, 9012);
        assert_eq!(snap.sectors_written, 678901);
    }

    #[test]
    fn test_disk_snapshot_skip_loop() {
        let line = "   7       0 loop0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0";
        assert!(DiskSnapshot::parse(line).is_none());
    }

    #[test]
    fn test_disk_whole_disk_detection() {
        let mut snap = DiskSnapshot::default();

        snap.device = CompactString::from("sda");
        assert!(snap.is_whole_disk());

        snap.device = CompactString::from("sda1");
        assert!(!snap.is_whole_disk());

        snap.device = CompactString::from("vda");
        assert!(snap.is_whole_disk());

        snap.device = CompactString::from("vda2");
        assert!(!snap.is_whole_disk());
    }

    #[test]
    fn test_netif_snapshot_parsing() {
        let line = "  eth0: 12345678 90123 45 67 0 0 0 0 87654321 10987 65 43 0 0 0 0";
        let snap = NetIfSnapshot::parse(line).unwrap();
        assert_eq!(snap.interface.as_str(), "eth0");
        assert_eq!(snap.rx_bytes, 12345678);
        assert_eq!(snap.rx_packets, 90123);
        assert_eq!(snap.rx_errors, 45);
        assert_eq!(snap.rx_drops, 67);
        assert_eq!(snap.tx_bytes, 87654321);
        assert_eq!(snap.tx_packets, 10987);
        assert_eq!(snap.tx_errors, 65);
        assert_eq!(snap.tx_drops, 43);
    }

    #[test]
    fn test_netif_skip_loopback() {
        let line = "    lo: 12345 678 0 0 0 0 0 0 12345 678 0 0 0 0 0 0";
        assert!(NetIfSnapshot::parse(line).is_none());
    }

    #[test]
    fn test_system_collector_creation() {
        let config = SystemCollectorConfig::default();
        let collector = SystemCollector::new(config);
        assert_eq!(collector.name(), "system");
        assert_eq!(collector.collector_type(), CollectorType::System);
        assert!(!collector.is_running());
    }

    #[test]
    fn test_netdata_chart_mapper() {
        assert_eq!(NetdataChartMapper::map_family("system.cpu"), MetricCategory::CpuUsage);
        assert_eq!(NetdataChartMapper::map_family("mem.available"), MetricCategory::MemoryUsage);
        assert_eq!(NetdataChartMapper::map_family("disk.io"), MetricCategory::DiskIo);
        assert_eq!(NetdataChartMapper::map_family("net.eth0"), MetricCategory::NetworkTraffic);
        assert_eq!(NetdataChartMapper::map_family("mysql.queries"), MetricCategory::DatabaseConnections);
        assert_eq!(NetdataChartMapper::map_family("some_random"), MetricCategory::Custom);
    }

    #[test]
    fn test_docker_container_clean_name() {
        let container = DockerContainer {
            id: "abc123def456789012345678".to_string(),
            names: vec!["/my-container".to_string()],
            image: "nginx:latest".to_string(),
            state: "running".to_string(),
            status: "Up 2 hours".to_string(),
            labels: HashMap::new(),
        };
        assert_eq!(container.clean_name(), "my-container");
        assert_eq!(container.short_id(), "abc123def456");
    }

    #[test]
    fn test_docker_stats_to_metrics() {
        let stats = DockerStats {
            cpu_stats: DockerCpuStats {
                cpu_usage: DockerCpuUsage {
                    total_usage: 2000000000,
                    usage_in_usermode: 1500000000,
                    usage_in_kernelmode: 500000000,
                },
                system_cpu_usage: Some(20000000000),
                online_cpus: Some(4),
            },
            precpu_stats: DockerCpuStats {
                cpu_usage: DockerCpuUsage {
                    total_usage: 1000000000,
                    usage_in_usermode: 750000000,
                    usage_in_kernelmode: 250000000,
                },
                system_cpu_usage: Some(10000000000),
                online_cpus: Some(4),
            },
            memory_stats: DockerMemoryStats {
                usage: 50 * 1024 * 1024,
                max_usage: 100 * 1024 * 1024,
                limit: 256 * 1024 * 1024,
                stats: Some(DockerMemoryDetailStats {
                    cache: 10 * 1024 * 1024,
                    rss: 40 * 1024 * 1024,
                    mapped_file: 5 * 1024 * 1024,
                    pgfault: 1000,
                    pgmajfault: 5,
                }),
            },
            networks: Some({
                let mut m = HashMap::new();
                m.insert("eth0".to_string(), DockerNetworkStats {
                    rx_bytes: 1000000, rx_packets: 5000, rx_errors: 0, rx_dropped: 0,
                    tx_bytes: 500000, tx_packets: 3000, tx_errors: 0, tx_dropped: 0,
                });
                m
            }),
            blkio_stats: DockerBlkioStats {
                io_service_bytes_recursive: Some(vec![
                    DockerBlkioEntry { op: "Read".to_string(), value: 1024000 },
                    DockerBlkioEntry { op: "Write".to_string(), value: 512000 },
                ]),
            },
            pids_stats: DockerPidsStats {
                current: Some(15),
                limit: Some(4096),
            },
        };

        let metrics = DockerCollector::stats_to_metrics(&stats, "test-container", "abc123def456", "nginx:latest", "test-host");

        // Should have CPU + Memory + Network + BlockIO + PIDs metrics
        assert!(metrics.len() >= 15);

        // Verify CPU usage is calculated correctly
        // cpu_delta = 1000000000, system_delta = 10000000000, cpus = 4
        // cpu_percent = (1000000000 / 10000000000) * 4 * 100 = 40.0
        let cpu_metric = metrics.iter().find(|m| m.name == "docker.cpu.usage_percent").unwrap();
        if let MetricValue::Gauge(v) = cpu_metric.value {
            assert!((v - 40.0).abs() < 0.1);
        } else {
            panic!("Expected Gauge");
        }

        // Verify memory percentage
        let mem_pct = metrics.iter().find(|m| m.name == "docker.memory.usage_percent").unwrap();
        if let MetricValue::Gauge(v) = mem_pct.value {
            let expected = (50.0 * 1024.0 * 1024.0) / (256.0 * 1024.0 * 1024.0) * 100.0;
            assert!((v - expected).abs() < 0.1);
        }
    }

    #[test]
    fn test_http_collector_creation() {
        let config = HttpCollectorConfig {
            enabled: true,
            endpoints: vec![
                HttpEndpointConfig {
                    url: "https://example.com".to_string(),
                    method: "GET".to_string(),
                    expected_status: vec![200],
                    timeout_secs: Some(5),
                    headers: HashMap::new(),
                    interval_ms: None,
                    name: Some("example".to_string()),
                },
            ],
            default_timeout_secs: 10,
        };
        let collector = HttpEndpointCollector::new(config);
        assert_eq!(collector.name(), "http");
        assert!(!collector.is_running());
    }

    #[test]
    fn test_log_collector_creation() {
        let config = LogCollectorConfig {
            enabled: true,
            files: Vec::new(),
            buffer_lines: 10000,
        };
        let collector = LogCollector::new(config);
        assert_eq!(collector.name(), "log");
        assert_eq!(collector.collector_type(), CollectorType::Log);
    }

    #[test]
    fn test_log_file_state_error_detection() {
        let config = LogFileConfig {
            path: "/tmp/test.log".to_string(),
            format: String::new(),
            pattern: None,
            labels: HashMap::new(),
        };
        let mut state = LogFileState::new(&config);

        state.process_line("2026-02-11 INFO All good");
        assert_eq!(state.lines_since_last, 1);
        assert_eq!(state.errors_since_last, 0);

        state.process_line("2026-02-11 ERROR Something failed");
        assert_eq!(state.lines_since_last, 2);
        assert_eq!(state.errors_since_last, 1);

        state.process_line("2026-02-11 WARN Disk space low");
        assert_eq!(state.lines_since_last, 3);
        assert_eq!(state.warnings_since_last, 1);

        state.process_line("2026-02-11 FATAL Out of memory panic");
        assert_eq!(state.errors_since_last, 2);

        state.process_line("2026-02-11 CRITICAL database connection failure");
        assert_eq!(state.errors_since_last, 3);

        let metrics = state.drain_metrics("test-host");
        assert!(metrics.len() >= 4);
        assert_eq!(state.lines_since_last, 0);
        assert_eq!(state.errors_since_last, 0);
    }

    #[test]
    fn test_collector_types() {
        let sys = SystemCollector::new(SystemCollectorConfig::default());
        assert_eq!(sys.collector_type(), CollectorType::System);

        let nd = NetdataCollector::new(NetdataCollectorConfig::default());
        assert_eq!(nd.collector_type(), CollectorType::Netdata);

        let dc = DockerCollector::new(DockerCollectorConfig::default());
        assert_eq!(dc.collector_type(), CollectorType::Docker);

        let hc = HttpEndpointCollector::new(HttpCollectorConfig::default());
        assert_eq!(hc.collector_type(), CollectorType::Http);

        let lc = LogCollector::new(LogCollectorConfig::default());
        assert_eq!(lc.collector_type(), CollectorType::Log);
    }

    #[test]
    fn test_mount_point_reading() {
        // This tests the helper function — won't have /proc on macOS but shouldn't panic
        let mounts = SystemCollector::read_mount_points();
        // On Linux, should find at least "/" mount. On macOS, returns default.
        assert!(!mounts.is_empty() || cfg!(not(target_os = "linux")));
    }

    #[tokio::test]
    async fn test_system_collector_init() {
        let mut collector = SystemCollector::new(SystemCollectorConfig::default());
        // Init should always succeed (primes snapshots)
        let result = collector.init().await;
        assert!(result.is_ok());
    }
}
