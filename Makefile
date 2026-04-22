.PHONY: test build docker-build k8s-deploy k8s-status logs dev clean help

## ── Help ──────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## ── Development ───────────────────────────────────────────────────────────────

dev: ## Start development server with hot-reload
	npm run dev

build: ## Compile TypeScript to dist/
	npx tsc

clean: ## Remove compiled output
	rm -rf dist/ coverage/

## ── Testing ───────────────────────────────────────────────────────────────────

test: ## Run tests with coverage
	npx jest --coverage

test-watch: ## Run tests in watch mode
	npx jest --watch

test-ci: ## Run tests in CI mode (coverage + thresholds)
	npx jest --coverage --coverageReporters=lcov,text-summary

## ── Docker ────────────────────────────────────────────────────────────────────

docker-build: ## Build Docker image tagged as :local
	docker build -f k8s/Dockerfile -t fishing-game-server:local .

docker-run: ## Run the local Docker image (port 2567)
	docker run --rm -p 2567:2567 \
		-e NODE_ENV=development \
		fishing-game-server:local

## ── Kubernetes ────────────────────────────────────────────────────────────────

k8s-deploy: ## Apply all k8s manifests via kustomize
	kubectl apply -k k8s/

k8s-status: ## Show all resources in the fishing-game namespace
	kubectl get all -n fishing-game

logs: ## Tail server logs (last 100 lines, follow)
	kubectl logs -n fishing-game -l app=fishing-game-server --tail=100 -f

k8s-rollback: ## Undo the last deployment rollout
	kubectl rollout undo deployment/fishing-game-server -n fishing-game

k8s-restart: ## Restart the server deployment (rolling)
	kubectl rollout restart deployment/fishing-game-server -n fishing-game
