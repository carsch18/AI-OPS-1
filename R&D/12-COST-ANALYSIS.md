# 💰 Cost Analysis - CEREBRO

## AWS Monthly Cost Estimates

### Production Environment (Full Scale)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| **EKS** | Control plane + 20 nodes (m6i.xlarge) | $4,500 |
| **RDS PostgreSQL** | Multi-AZ r6g.xlarge | $800 |
| **ElastiCache Redis** | 3-node r6g.large cluster | $600 |
| **MSK (Kafka)** | 3 brokers m5.large | $900 |
| **OpenSearch** | 3-node cluster | $1,200 |
| **Timestream** | 100GB writes/month | $500 |
| **S3** | 10TB storage | $230 |
| **CloudFront** | 10TB transfer | $850 |
| **Bedrock (Claude)** | 10M tokens/day | $3,000 |
| **NAT Gateway** | 3 AZs | $300 |
| **ALB** | 2 load balancers | $50 |
| **Secrets Manager** | 50 secrets | $20 |
| **Other** | Misc services | $500 |
| **TOTAL** | | **~$13,500/month** |

### Startup Configuration (Reduced Scale)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| **EKS** | Control plane + 5 nodes (m6i.large) | $1,200 |
| **RDS PostgreSQL** | Single-AZ db.t3.medium | $100 |
| **ElastiCache Redis** | Single node cache.t3.medium | $50 |
| **OpenSearch** | Single node t3.small | $50 |
| **S3** | 1TB storage | $25 |
| **Bedrock (Claude)** | 1M tokens/day | $300 |
| **NAT Gateway** | 1 AZ | $100 |
| **TOTAL** | | **~$2,000/month** |

---

*This completes the R&D documentation suite.*
