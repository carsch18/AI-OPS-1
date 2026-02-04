"""
AIOps Email Notification Service
Sends email alerts for warnings and critical issues like Uptime Kuma
"""

import os
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict

# Email Configuration from environment variables
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "aiops@localhost")
SMTP_TO = os.getenv("SMTP_TO", "admin@localhost")  # Comma-separated list

# Enable/disable email notifications
EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "false").lower() == "true"


class EmailNotificationService:
    """Handles email notifications for alerts and incidents"""
    
    def __init__(self):
        self.enabled = EMAIL_ENABLED
        self.smtp_host = SMTP_HOST
        self.smtp_port = SMTP_PORT
        self.smtp_user = SMTP_USER
        self.smtp_password = SMTP_PASSWORD
        self.from_email = SMTP_FROM
        self.to_emails = [e.strip() for e in SMTP_TO.split(",") if e.strip()]
        
        # Rate limiting: track sent alerts to prevent spam
        self.sent_alerts: Dict[str, datetime] = {}
        self.cooldown_minutes = 15  # Don't repeat same alert for 15 mins
        
        # Track active incidents for recovery emails with timestamps
        # Key: metric_name, Value: {started_at, severity, category, cause, remediation}
        self.active_incidents: Dict[str, Dict] = {}
        
        # Alert queue for batching
        self.alert_queue: List[Dict] = []
        self.max_queue_size = 5  # Send batch email after 5 alerts
        self.last_batch_time = datetime.now()
        
    def is_configured(self) -> bool:
        """Check if email is properly configured"""
        return bool(self.smtp_user and self.smtp_password and self.to_emails)
    
    def _should_send(self, alert_key: str) -> bool:
        """Check if we should send this alert (rate limiting)"""
        if alert_key in self.sent_alerts:
            last_sent = self.sent_alerts[alert_key]
            if datetime.now() - last_sent < timedelta(minutes=self.cooldown_minutes):
                return False
        return True
    
    def _mark_sent(self, alert_key: str):
        """Mark an alert as sent"""
        self.sent_alerts[alert_key] = datetime.now()
        # Cleanup old entries
        cutoff = datetime.now() - timedelta(hours=1)
        self.sent_alerts = {k: v for k, v in self.sent_alerts.items() if v > cutoff}
    
    def _get_severity_emoji(self, severity: str) -> str:
        """Get emoji for severity level"""
        return {
            "CRITICAL": "🔴",
            "WARNING": "🟡",
            "INFO": "🔵",
            "OK": "✅"
        }.get(severity.upper(), "⚪")
    
    def _get_severity_color(self, severity: str) -> str:
        """Get color for severity level (for HTML emails)"""
        return {
            "CRITICAL": "#dc3545",
            "WARNING": "#ffc107",
            "INFO": "#17a2b8",
            "OK": "#28a745"
        }.get(severity.upper(), "#6c757d")
    
    async def send_alert(
        self,
        metric_name: str,
        severity: str,
        value: any,
        threshold: any,
        category: str,
        description: str = "",
        metadata: Dict = None
    ):
        """Send an alert email (with rate limiting)"""
        if not self.enabled or not self.is_configured():
            print(f"📧 Email not configured - skipping alert: {metric_name}")
            return False
        
        alert_key = f"{category}:{metric_name}:{severity}"
        
        if not self._should_send(alert_key):
            print(f"📧 Rate limited - skipping duplicate alert: {metric_name}")
            return False
        
        try:
            emoji = self._get_severity_emoji(severity)
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            subject = f"{emoji} [{severity}] AIOps Alert: {metric_name}"
            
            # Create HTML email
            html_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <div style="background: {self._get_severity_color(severity)}; color: white; padding: 15px; border-radius: 5px;">
                    <h2 style="margin: 0;">{emoji} {severity} Alert</h2>
                </div>
                
                <div style="padding: 20px; background: #f8f9fa; margin-top: 10px; border-radius: 5px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; font-weight: bold; width: 150px;">Metric:</td>
                            <td style="padding: 8px;">{metric_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">Category:</td>
                            <td style="padding: 8px;">{category}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">Current Value:</td>
                            <td style="padding: 8px; color: {self._get_severity_color(severity)}; font-weight: bold;">{value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">Threshold:</td>
                            <td style="padding: 8px;">{threshold}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">Timestamp:</td>
                            <td style="padding: 8px;">{timestamp}</td>
                        </tr>
                    </table>
                    
                    {f'<p style="margin-top: 15px;"><strong>Description:</strong> {description}</p>' if description else ''}
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px;">
                    <p style="margin: 0; font-size: 12px; color: #6c757d;">
                        This alert was generated by AIOps Brain Monitoring Service.<br>
                        Dashboard: <a href="http://localhost:3001">http://localhost:3001</a>
                    </p>
                </div>
            </body>
            </html>
            """
            
            # Plain text version
            text_body = f"""
{severity} ALERT: {metric_name}
{'=' * 50}

Category: {category}
Current Value: {value}
Threshold: {threshold}
Timestamp: {timestamp}

{f'Description: {description}' if description else ''}

---
AIOps Brain Monitoring Service
Dashboard: http://localhost:3001
            """
            
            # Send email in a thread to not block async
            await asyncio.get_event_loop().run_in_executor(
                None, 
                self._send_email_sync, 
                subject, 
                text_body, 
                html_body
            )
            
            self._mark_sent(alert_key)
            
            # Track this incident for recovery email
            self.active_incidents[metric_name] = {
                "started_at": datetime.now(),
                "severity": severity.upper(),
                "category": category,
                "cause": description or f"{metric_name} threshold breached",
                "value": value,
                "threshold": threshold,
                "remediation": self._get_remediation_protocol(category, metric_name)
            }
            
            print(f"📧 Email sent: {subject}")
            return True
            
        except Exception as e:
            print(f"📧 Email error: {e}")
            return False
    
    def _get_remediation_protocol(self, category: str, metric_name: str) -> str:
        """Get remediation protocol based on category and metric"""
        remediation_map = {
            "availability": {
                "default": "1. Check service logs for errors\n2. Verify network connectivity\n3. Restart the service if unresponsive\n4. Check for resource exhaustion (CPU/Memory)",
                "Frontend": "1. Check frontend service logs\n2. Restart web server: 'bun run dev' or equivalent\n3. Verify port 3001 is not blocked\n4. Check for JavaScript/build errors",
                "Brain": "1. Check brain service logs\n2. Restart: 'sudo .venv/bin/python main.py'\n3. Verify database connectivity\n4. Check for Python exceptions",
                "Netdata": "1. Check Netdata container status: 'docker ps'\n2. Restart container: 'docker restart netdata'\n3. SSH tunnel may need reconnection\n4. Verify port 19999 is accessible",
                "DDEV": "1. Check DDEV status: 'ddev describe'\n2. Restart DDEV: 'ddev restart'\n3. Check Docker resources\n4. Verify DNS resolution",
            },
            "performance": {
                "default": "1. Monitor resource usage\n2. Check for slow queries or API calls\n3. Clear application cache\n4. Consider scaling resources",
            },
            "infrastructure": {
                "default": "1. Identify resource-heavy processes: 'top' or 'htop'\n2. Kill unnecessary processes\n3. Clear disk space if needed\n4. Consider resource scaling",
            },
            "incidents": {
                "default": "1. Review service logs for root cause\n2. Check recent deployments or changes\n3. Verify external dependencies\n4. Escalate if not resolved in SLA",
            }
        }
        
        cat_map = remediation_map.get(category, {"default": "Review logs and restart service if needed"})
        
        # Check for specific metric name match
        for key in cat_map:
            if key.lower() in metric_name.lower():
                return cat_map[key]
        
        return cat_map.get("default", "Review logs and restart service if needed")
    
    def _send_email_sync(self, subject: str, text_body: str, html_body: str):
        """Synchronous email sending (run in executor)"""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self.from_email
        msg["To"] = ", ".join(self.to_emails)
        
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))
        
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            server.send_message(msg)
    
    async def send_recovery_notification(
        self,
        metric_name: str,
        category: str,
        previous_severity: str,
        description: str = ""
    ):
        """Send recovery notification when issue is resolved with full incident details"""
        if not self.enabled or not self.is_configured():
            return False
        
        try:
            recovered_at = datetime.now()
            recovered_timestamp = recovered_at.strftime("%Y-%m-%d %H:%M:%S")
            
            # Get incident details from tracking
            incident = self.active_incidents.get(metric_name, {})
            started_at = incident.get("started_at", recovered_at - timedelta(minutes=5))
            started_timestamp = started_at.strftime("%Y-%m-%d %H:%M:%S")
            
            # Calculate duration
            duration = recovered_at - started_at
            duration_str = self._format_duration(duration)
            
            # Get cause and remediation
            cause = incident.get("cause", description or "Service unavailable")
            remediation = incident.get("remediation", self._get_remediation_protocol(category, metric_name))
            original_value = incident.get("value", "N/A")
            threshold = incident.get("threshold", "N/A")
            
            subject = f"✅ [RECOVERED] AIOps: {metric_name}"
            
            # Enhanced HTML body with full incident timeline
            html_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <div style="background: #28a745; color: white; padding: 15px; border-radius: 5px;">
                    <h2 style="margin: 0;">✅ Service Recovered</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Downtime: {duration_str}</p>
                </div>
                
                <div style="padding: 20px; background: #f8f9fa; margin-top: 10px; border-radius: 5px;">
                    <h3 style="margin-top: 0; color: #333;">Incident Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px; font-weight: bold; width: 180px; border-bottom: 1px solid #ddd;">Service:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #ddd;">{metric_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">Category:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #ddd;">{category}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">Previous Status:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #ddd; color: #dc3545; font-weight: bold;">🔴 {previous_severity}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">Current Status:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #ddd; color: #28a745; font-weight: bold;">✅ HEALTHY</td>
                        </tr>
                    </table>
                </div>
                
                <div style="padding: 20px; background: #fff3cd; margin-top: 10px; border-radius: 5px; border-left: 4px solid #ffc107;">
                    <h3 style="margin-top: 0; color: #856404;">📋 Timeline</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; font-weight: bold; width: 180px;">🔴 Issue Started:</td>
                            <td style="padding: 8px;">{started_timestamp}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">✅ Issue Resolved:</td>
                            <td style="padding: 8px;">{recovered_timestamp}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">⏱️ Total Downtime:</td>
                            <td style="padding: 8px; font-weight: bold; color: #856404;">{duration_str}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="padding: 20px; background: #f8d7da; margin-top: 10px; border-radius: 5px; border-left: 4px solid #dc3545;">
                    <h3 style="margin-top: 0; color: #721c24;">🔍 Cause</h3>
                    <p style="margin: 0;">{cause}</p>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
                        Triggered Value: {original_value} | Threshold: {threshold}
                    </p>
                </div>
                
                <div style="padding: 20px; background: #d4edda; margin-top: 10px; border-radius: 5px; border-left: 4px solid #28a745;">
                    <h3 style="margin-top: 0; color: #155724;">🔧 Remediation Protocol</h3>
                    <pre style="margin: 0; white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #155724;">{remediation}</pre>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px;">
                    <p style="margin: 0; font-size: 12px; color: #6c757d;">
                        AIOps Brain Monitoring Service<br>
                        Dashboard: <a href="http://localhost:3001">http://localhost:3001</a>
                    </p>
                </div>
            </body>
            </html>
            """
            
            text_body = f"""
RECOVERED: {metric_name}
{'=' * 50}

Status: HEALTHY ✅
Category: {category}

TIMELINE:
- Issue Started: {started_timestamp}
- Issue Resolved: {recovered_timestamp} 
- Total Downtime: {duration_str}

CAUSE:
{cause}
(Value: {original_value}, Threshold: {threshold})

REMEDIATION PROTOCOL:
{remediation}

---
AIOps Brain Monitoring Service
Dashboard: http://localhost:3001
            """
            
            await asyncio.get_event_loop().run_in_executor(
                None, 
                self._send_email_sync, 
                subject, 
                text_body, 
                html_body
            )
            
            # Clear the alert from sent tracking so future alerts can be sent
            alert_keys = [k for k in self.sent_alerts if metric_name in k]
            for key in alert_keys:
                del self.sent_alerts[key]
            
            # Remove from active incidents
            if metric_name in self.active_incidents:
                del self.active_incidents[metric_name]
            
            print(f"📧 Recovery email sent: {subject} (Downtime: {duration_str})")
            return True
            
        except Exception as e:
            print(f"📧 Recovery email error: {e}")
            return False
    
    def _format_duration(self, duration: timedelta) -> str:
        """Format duration in human-readable format"""
        total_seconds = int(duration.total_seconds())
        if total_seconds < 60:
            return f"{total_seconds} seconds"
        elif total_seconds < 3600:
            minutes = total_seconds // 60
            seconds = total_seconds % 60
            return f"{minutes}m {seconds}s"
        else:
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            return f"{hours}h {minutes}m"
    
    async def send_daily_digest(self, alerts_summary: Dict):
        """Send daily digest of all alerts"""
        if not self.enabled or not self.is_configured():
            return False
        
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d")
            subject = f"📊 AIOps Daily Alert Digest - {timestamp}"
            
            # Build summary table
            summary_rows = ""
            for category, alerts in alerts_summary.items():
                for alert in alerts:
                    severity_color = self._get_severity_color(alert.get("severity", "INFO"))
                    summary_rows += f"""
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">{category}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">{alert.get('metric_name', 'N/A')}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; color: {severity_color};">{alert.get('severity', 'N/A')}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">{alert.get('count', 1)}</td>
                    </tr>
                    """
            
            html_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <div style="background: #343a40; color: white; padding: 15px; border-radius: 5px;">
                    <h2 style="margin: 0;">📊 Daily Alert Digest</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">{timestamp}</p>
                </div>
                
                <div style="padding: 20px; background: #f8f9fa; margin-top: 10px; border-radius: 5px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #e9ecef;">
                                <th style="padding: 10px; text-align: left;">Category</th>
                                <th style="padding: 10px; text-align: left;">Metric</th>
                                <th style="padding: 10px; text-align: left;">Severity</th>
                                <th style="padding: 10px; text-align: left;">Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary_rows if summary_rows else '<tr><td colspan="4" style="padding: 20px; text-align: center;">No alerts today! 🎉</td></tr>'}
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px;">
                    <p style="margin: 0; font-size: 12px; color: #6c757d;">
                        AIOps Brain Monitoring Service<br>
                        Dashboard: <a href="http://localhost:3001">http://localhost:3001</a>
                    </p>
                </div>
            </body>
            </html>
            """
            
            text_body = f"AIOps Daily Alert Digest - {timestamp}\n\n"
            for category, alerts in alerts_summary.items():
                for alert in alerts:
                    text_body += f"[{alert.get('severity')}] {category}: {alert.get('metric_name')} (x{alert.get('count', 1)})\n"
            
            await asyncio.get_event_loop().run_in_executor(
                None, 
                self._send_email_sync, 
                subject, 
                text_body, 
                html_body
            )
            
            print(f"📧 Daily digest email sent")
            return True
            
        except Exception as e:
            print(f"📧 Daily digest email error: {e}")
            return False


# Singleton instance
email_service = EmailNotificationService()
