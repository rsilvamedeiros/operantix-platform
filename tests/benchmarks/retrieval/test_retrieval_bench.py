"""Tests for the pure parts of the retrieval benchmark. Run: uv run --with numpy --with pytest pytest"""

import numpy as np
import pytest

from corpus import build_corpus, exact_top_k, recall_at_k, tenant_sizes


def test_tenant_sizes_are_skewed_and_sum_to_the_total() -> None:
    sizes = tenant_sizes(tenants=20, total=20_000, seed=1)
    assert len(sizes) == 20 and sum(sizes) == 20_000
    assert max(sizes) >= 5 * min(sizes), "a few big tenants and many small ones"
    assert min(sizes) >= 50


def test_the_corpus_is_deterministic_for_a_seed() -> None:
    a = build_corpus(sizes=[40, 60], dim=16, seed=7)
    b = build_corpus(sizes=[40, 60], dim=16, seed=7)
    assert np.array_equal(a.vectors, b.vectors)
    assert a.vectors.shape == (100, 16)
    assert list(a.tenant_of[:40]) == [0] * 40 and list(a.tenant_of[40:]) == [1] * 60


def test_vectors_are_unit_length_so_cosine_equals_dot_product() -> None:
    corpus = build_corpus(sizes=[30], dim=16, seed=3)
    assert np.allclose(np.linalg.norm(corpus.vectors, axis=1), 1.0, atol=1e-5)


def test_exact_top_k_only_returns_rows_of_the_tenant() -> None:
    corpus = build_corpus(sizes=[30, 30], dim=16, seed=3)
    query = corpus.vectors[0]
    top = exact_top_k(corpus, tenant=0, query=query, k=5)
    assert all(corpus.tenant_of[i] == 0 for i in top)
    assert top[0] == 0, "the query vector itself is its own nearest neighbour"


def test_exact_top_k_returns_fewer_when_the_tenant_is_small() -> None:
    corpus = build_corpus(sizes=[3, 30], dim=16, seed=3)
    assert len(exact_top_k(corpus, tenant=0, query=corpus.vectors[0], k=10)) == 3


def test_recall_is_the_share_of_true_neighbours_found() -> None:
    assert recall_at_k(truth=[1, 2, 3, 4], got=[1, 2, 9, 8]) == 0.5
    assert recall_at_k(truth=[1, 2], got=[2, 1]) == 1.0


def test_recall_of_an_empty_truth_is_an_error_not_a_free_pass() -> None:
    with pytest.raises(ValueError):
        recall_at_k(truth=[], got=[1])
