"""
Network Packet Sniffer Module for AIOps
Captures network packets and identifies suspicious activity
Requires sudo/root privileges to capture raw packets
"""

import threading
import time
import ipaddress
from collections import deque, defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Any
import logging

logger = logging.getLogger(__name__)

# Try to import scapy (optional - will gracefully degrade if not available)
try:
    from scapy.all import sniff, IP, TCP, UDP, ICMP, Raw, conf
    SCAPY_AVAILABLE = True
    conf.verb = 0  # Disable scapy verbosity
except ImportError:
    SCAPY_AVAILABLE = False
    logger.warning("Scapy not available - network sniffing disabled")

# RFC1918 Private IP ranges
PRIVATE_NETWORKS = [
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('127.0.0.0/8'),
]

# Suspicious ports commonly targeted in attacks
SUSPICIOUS_PORTS = {
    22: 'SSH',
    23: 'Telnet',
    445: 'SMB',
    3389: 'RDP',
    4444: 'Metasploit',
    5555: 'Android Debug',
    6666: 'IRC Bot',
    6667: 'IRC',
    8080: 'Proxy',
    31337: 'Back Orifice',
}

# Suspicious payload patterns (hex-encoded to avoid false positives in code)
SUSPICIOUS_PATTERNS = [
    b'/etc/passwd',
    b'/etc/shadow',
    b'SELECT * FROM',
    b'UNION SELECT',
    b'<script>',
    b'cmd.exe',
    b'powershell',
    b'/bin/sh',
    b'/bin/bash',
    b'eval(',
    b'base64_decode',
]


class NetworkSniffer:
    """Network packet sniffer with suspicious activity detection"""
    
    def __init__(self, max_packets: int = 100, interface: str = None):
        self.max_packets = max_packets
        self.interface = interface
        self.packets: deque = deque(maxlen=max_packets)
        self.lock = threading.Lock()
        self.running = False
        self.sniffer_thread: Optional[threading.Thread] = None
        
        # Statistics
        self.stats = {
            'total_packets': 0,
            'suspicious_count': 0,
            'protocols': defaultdict(int),
            'start_time': None,
            'external_connections': 0,
        }
        
    def is_private_ip(self, ip_str: str) -> bool:
        """Check if IP is in private range"""
        try:
            ip = ipaddress.ip_address(ip_str)
            return any(ip in network for network in PRIVATE_NETWORKS)
        except ValueError:
            return True  # Assume private if can't parse
    
    def check_suspicious_payload(self, payload: bytes) -> Optional[str]:
        """Check payload for suspicious patterns"""
        if not payload:
            return None
        
        payload_lower = payload.lower()
        for pattern in SUSPICIOUS_PATTERNS:
            if pattern.lower() in payload_lower:
                return f"Suspicious pattern: {pattern.decode('utf-8', errors='replace')}"
        return None
    
    def analyze_packet(self, pkt) -> Optional[Dict[str, Any]]:
        """Analyze a single packet and return structured data"""
        if not pkt.haslayer(IP):
            return None
        
        ip_layer = pkt[IP]
        src_ip = ip_layer.src
        dst_ip = ip_layer.dst
        
        # Determine protocol and port
        protocol = 'OTHER'
        port = 0
        
        if pkt.haslayer(TCP):
            protocol = 'TCP'
            port = pkt[TCP].dport
        elif pkt.haslayer(UDP):
            protocol = 'UDP'
            port = pkt[UDP].dport
        elif pkt.haslayer(ICMP):
            protocol = 'ICMP'
        
        # Extract payload preview
        payload = b''
        payload_preview = ''
        if pkt.haslayer(Raw):
            payload = bytes(pkt[Raw].load)
            # Sanitize and truncate payload for display
            try:
                payload_preview = payload[:50].decode('utf-8', errors='replace')
                payload_preview = ''.join(c if c.isprintable() or c.isspace() else '.' for c in payload_preview)
            except:
                payload_preview = payload[:50].hex()
        
        # Check if suspicious - NOTE: External IPs are NOT suspicious by themselves
        # Only dangerous ports and malicious payloads are truly suspicious
        is_suspicious = False
        suspicious_reasons = []
        
        # Track external IPs (but don't mark as suspicious - normal internet traffic)
        src_external = not self.is_private_ip(src_ip)
        dst_external = not self.is_private_ip(dst_ip)
        
        # Check for suspicious/dangerous ports (these ARE suspicious)
        # Exception: SSH (22) within the same private network is normal
        if port in SUSPICIOUS_PORTS:
            # For SSH, only flag if traffic is to/from external IPs
            if port == 22:
                if src_external or dst_external:
                    is_suspicious = True
                    suspicious_reasons.append(f"External SSH: {port} ({SUSPICIOUS_PORTS[port]})")
                # Internal SSH is not flagged as suspicious
            else:
                is_suspicious = True
                suspicious_reasons.append(f"Dangerous port: {port} ({SUSPICIOUS_PORTS[port]})")
        
        # Check payload for attack patterns (these ARE suspicious)
        payload_issue = self.check_suspicious_payload(payload)
        if payload_issue:
            is_suspicious = True
            suspicious_reasons.append(payload_issue)
        
        return {
            'timestamp': datetime.now().isoformat(),
            'src_ip': src_ip,
            'dst_ip': dst_ip,
            'port': port,
            'protocol': protocol,
            'payload_preview': payload_preview[:50] if payload_preview else '',
            'payload_size': len(payload),
            'is_suspicious': is_suspicious,
            'suspicious_reasons': suspicious_reasons,
            'src_external': src_external,
            'dst_external': dst_external,
        }
    
    def packet_callback(self, pkt):
        """Callback for each captured packet"""
        packet_data = self.analyze_packet(pkt)
        if packet_data:
            with self.lock:
                self.packets.append(packet_data)
                self.stats['total_packets'] += 1
                self.stats['protocols'][packet_data['protocol']] += 1
                
                if packet_data['is_suspicious']:
                    self.stats['suspicious_count'] += 1
                
                if packet_data['src_external'] or packet_data['dst_external']:
                    self.stats['external_connections'] += 1
    
    def start(self):
        """Start packet capture in background thread"""
        if not SCAPY_AVAILABLE:
            logger.error("Cannot start sniffer - scapy not available")
            return False
        
        if self.running:
            return True
        
        self.running = True
        self.stats['start_time'] = time.time()
        
        def sniffer_loop():
            try:
                logger.info(f"Starting packet capture on interface: {self.interface or 'default'}")
                sniff(
                    iface=self.interface,
                    prn=self.packet_callback,
                    store=False,
                    stop_filter=lambda _: not self.running,
                )
            except PermissionError:
                logger.error("Permission denied - packet sniffing requires sudo/root")
                self.running = False
            except Exception as e:
                logger.error(f"Sniffer error: {e}")
                self.running = False
        
        self.sniffer_thread = threading.Thread(target=sniffer_loop, daemon=True)
        self.sniffer_thread.start()
        return True
    
    def stop(self):
        """Stop packet capture"""
        self.running = False
        if self.sniffer_thread:
            self.sniffer_thread.join(timeout=2)
    
    def get_packets(self, limit: int = 50) -> List[Dict]:
        """Get recent packets"""
        with self.lock:
            packets = list(self.packets)
        # Return most recent first
        return list(reversed(packets))[:limit]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get network statistics"""
        with self.lock:
            elapsed = time.time() - self.stats['start_time'] if self.stats['start_time'] else 1
            packets_per_second = self.stats['total_packets'] / max(elapsed, 1)
            
            return {
                'total_packets': self.stats['total_packets'],
                'packets_per_second': round(packets_per_second, 2),
                'suspicious_count': self.stats['suspicious_count'],
                'external_connections': self.stats['external_connections'],
                'protocols': dict(self.stats['protocols']),
                'capture_duration_seconds': round(elapsed, 1),
                'is_running': self.running,
                'scapy_available': SCAPY_AVAILABLE,
            }


# Global sniffer instance
_network_sniffer: Optional[NetworkSniffer] = None


def get_network_sniffer() -> NetworkSniffer:
    """Get or create the global network sniffer instance"""
    global _network_sniffer
    if _network_sniffer is None:
        _network_sniffer = NetworkSniffer()
    return _network_sniffer


def start_network_capture():
    """Start network packet capture"""
    sniffer = get_network_sniffer()
    return sniffer.start()


def stop_network_capture():
    """Stop network packet capture"""
    sniffer = get_network_sniffer()
    sniffer.stop()
