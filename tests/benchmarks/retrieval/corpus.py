"""Synthetic multi-tenant embedding corpus and exact retrieval for the benchmark (ADR-0044).

The vectors are clustered Gaussians, not real text embeddings: each tenant draws from its own few
topics, so a tenant's data sits in a small region of the space, which is what makes
tenant-filtered approximate search hard. Real embeddings could behave differently.
"""

from dataclasses import dataclass

import numpy as np

CLUSTERS = 64
CLUSTERS_PER_TENANT = 4


@dataclass(frozen=True)
class Corpus:
    vectors: np.ndarray  # (n, dim) float32, unit length
    tenant_of: np.ndarray  # (n,) tenant index of each row


def tenant_sizes(tenants: int, total: int, seed: int, minimum: int = 50) -> list[int]:
    """Log-normal sizes (a few large tenants, many small ones) that sum exactly to `total`."""
    rng = np.random.default_rng(seed)
    raw = rng.lognormal(mean=0.0, sigma=1.2, size=tenants)
    spare = total - minimum * tenants
    sizes = [minimum + int(spare * share) for share in raw / raw.sum()]
    sizes[int(np.argmax(sizes))] += total - sum(sizes)
    return sizes


def build_corpus(sizes: list[int], dim: int, seed: int) -> Corpus:
    rng = np.random.default_rng(seed)
    centers = rng.normal(size=(CLUSTERS, dim)).astype(np.float32)
    vectors, owners = [], []
    for tenant, size in enumerate(sizes):
        topics = rng.choice(CLUSTERS, size=CLUSTERS_PER_TENANT, replace=False)
        picks = rng.choice(topics, size=size)
        noise = rng.normal(scale=0.35, size=(size, dim)).astype(np.float32)
        vectors.append(centers[picks] + noise)
        owners.append(np.full(size, tenant))
    stacked = np.concatenate(vectors)
    stacked /= np.linalg.norm(stacked, axis=1, keepdims=True)
    return Corpus(vectors=stacked.astype(np.float32), tenant_of=np.concatenate(owners))


def exact_top_k(corpus: Corpus, tenant: int, query: np.ndarray, k: int) -> list[int]:
    """Row indexes of the k nearest neighbours of `query` among one tenant's rows (cosine)."""
    rows = np.flatnonzero(corpus.tenant_of == tenant)
    scores = corpus.vectors[rows] @ query
    best = np.argsort(-scores, kind="stable")[:k]
    return [int(rows[i]) for i in best]


def recall_at_k(truth: list[int], got: list[int]) -> float:
    if not truth:
        raise ValueError("no ground truth to compare with")
    return len(set(truth) & set(got)) / len(truth)
