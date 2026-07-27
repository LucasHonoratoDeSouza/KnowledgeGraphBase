SHELL := /usr/bin/env bash

PNPM := corepack pnpm
PYTHON_MEMBER_DIRS := $(wildcard apps/api apps/worker packages/test-fixtures/python)
RUST_MANIFESTS := $(wildcard crates/*/Cargo.toml apps/desktop/src-tauri/Cargo.toml)

.PHONY: install lock-check format lint typecheck build \
	test-contracts test-ui test-rust test-rust-integration test-python \
	test-desktop-e2e test-retrieval test-e2e test-quick test-full test-installer check

install:
	$(PNPM) install --frozen-lockfile
	uv sync --locked --all-packages

lock-check:
	$(PNPM) install --frozen-lockfile --lockfile-only
	uv lock --check
	@if [[ -n "$(RUST_MANIFESTS)" ]]; then cargo metadata --format-version 1 --locked --no-deps >/dev/null; else echo "Rust lock: no members yet"; fi

format:
	$(PNPM) -r --if-present format:check
	@if [[ -n "$(RUST_MANIFESTS)" ]]; then cargo fmt --all --check; else echo "Rust format: no members yet"; fi
	@if [[ -n "$(PYTHON_MEMBER_DIRS)" ]]; then uv run --locked ruff format --check $(PYTHON_MEMBER_DIRS); else echo "Python format: no members yet"; fi

lint:
	$(PNPM) -r --if-present lint
	@if [[ -n "$(RUST_MANIFESTS)" ]]; then cargo clippy --workspace --all-targets --locked -- -D warnings; else echo "Rust lint: no members yet"; fi
	@if [[ -n "$(PYTHON_MEMBER_DIRS)" ]]; then uv run --locked ruff check $(PYTHON_MEMBER_DIRS); else echo "Python lint: no members yet"; fi

typecheck:
	$(PNPM) -r --if-present typecheck
	@if [[ -n "$(PYTHON_MEMBER_DIRS)" ]]; then uv run --locked mypy $(PYTHON_MEMBER_DIRS); else echo "Python typecheck: no members yet"; fi

build:
	$(PNPM) -r --if-present build
	@if [[ -n "$(RUST_MANIFESTS)" ]]; then cargo build --workspace --locked; else echo "Rust build: no members yet"; fi

test-contracts:
	@if $(PNPM) --filter @knowledge-os/contracts list --depth -1 >/dev/null 2>&1; then $(PNPM) --filter @knowledge-os/contracts --filter @knowledge-os/test-fixtures test; else echo "Contract tests: no package yet"; fi

test-ui:
	@if $(PNPM) --filter @knowledge-os/desktop list --depth -1 >/dev/null 2>&1; then $(PNPM) --filter @knowledge-os/ui --filter @knowledge-os/desktop test; else echo "UI tests: no package yet"; fi

test-rust:
	@if [[ -n "$(RUST_MANIFESTS)" ]]; then cargo test --workspace --lib --locked; else echo "Rust tests: no members yet"; fi

test-rust-integration:
	@if [[ -n "$(RUST_MANIFESTS)" ]]; then cargo test --workspace --tests --locked; else echo "Rust integration tests: no members yet"; fi

test-python:
	@if [[ -n "$(PYTHON_MEMBER_DIRS)" ]]; then uv run --locked pytest $(PYTHON_MEMBER_DIRS); else echo "Python tests: no members yet"; fi

test-desktop-e2e:
	@if [[ -d tests/e2e ]]; then $(PNPM) exec playwright test; else echo "Desktop e2e: no suite yet"; fi

test-retrieval:
	@if [[ -d tests/integration/retrieval || -d tests/performance ]]; then cargo test --workspace --locked retrieval; else echo "Retrieval tests: no suite yet"; fi

test-e2e:
	@if [[ -d tests/e2e || -d tests/integration ]]; then $(PNPM) exec playwright test; else echo "Product e2e: no suite yet"; fi

test-installer:
	@if command -v docker >/dev/null 2>&1; then bash scripts/test-install.sh; else echo "test-installer: docker not available, skipping (see scripts/test-install.sh)"; fi

test-quick: test-contracts test-ui test-rust test-python

test-full: test-quick test-rust-integration test-desktop-e2e test-e2e

check: lock-check format lint typecheck test-full build
