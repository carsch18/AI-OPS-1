# =============================================================================
# BRAIN API DOCKERFILE
# Production-grade Python FastAPI container
# =============================================================================

FROM python:3.12-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# =============================================================================
# PRODUCTION IMAGE
# =============================================================================
FROM python:3.12-slim

WORKDIR /app

# Create non-root user
RUN groupadd -r aiops && useradd -r -g aiops aiops

# Copy installed packages from builder
COPY --from=builder /root/.local /home/aiops/.local

# Copy application code
COPY . .

# Set ownership
RUN chown -R aiops:aiops /app

# Switch to non-root user
USER aiops

# Add local packages to PATH
ENV PATH=/home/aiops/.local/bin:$PATH

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
