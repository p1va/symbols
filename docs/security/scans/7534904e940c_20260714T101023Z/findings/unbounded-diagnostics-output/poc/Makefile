SYMBOLS_REPO ?= ../../symbols
ERRORS ?= 10000

.PHONY: run smoke

run:
	$(SYMBOLS_REPO)/node_modules/.bin/tsx ./diagnostics-amplification.ts --repo $(SYMBOLS_REPO) --errors $(ERRORS)

smoke:
	$(MAKE) run ERRORS=1000
