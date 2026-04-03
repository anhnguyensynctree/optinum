FROM python:3.11-slim

# Install system deps: git for checkout, build tools for packages with C extensions
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends git build-essential && \
    rm -rf /var/lib/apt/lists/*

# Upgrade pip and install pytest
RUN pip install --upgrade pip --quiet && \
    pip install pytest --quiet

WORKDIR /workspace

COPY run-test.sh /usr/local/bin/run-test.sh
RUN chmod +x /usr/local/bin/run-test.sh

# Environment variables consumed by run-test.sh
# REPO_URL    — git-cloneable URL of the target repository
# BUG_COMMIT  — commit SHA where the bug exists (test should FAIL here)
# FIX_COMMIT  — commit SHA after the fix is applied (test should PASS here)
# PATCH_FILE  — optional path to a .patch file inside the container
# TEST_CODE   — pytest test source, written to /workspace/test_optinum.py

ENTRYPOINT ["/usr/local/bin/run-test.sh"]
