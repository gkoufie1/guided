"""Read settings from environment variables and secrets from SSM Parameter Store.

Secrets are cached per Lambda container for CACHE_SECONDS so a rotated value
is picked up within minutes without a redeploy.
"""

import json
import os
import time

CACHE_SECONDS = 300
_cache = {}
_ssm = None


def env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"environment variable {name} is not set")
    return value


def secret(name):
    global _ssm
    cached = _cache.get(name)
    if cached and time.time() - cached[1] < CACHE_SECONDS:
        return cached[0]
    if _ssm is None:
        import boto3

        _ssm = boto3.client("ssm")
    value = _ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
    _cache[name] = (value, time.time())
    return value


def secret_json(name):
    return json.loads(secret(name))
