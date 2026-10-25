UUID := veld-monitor-controls@veldhost.eu
EXT_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DIST_DIR := dist
BUILD_DIR := .build
SCHEMA_FILE := schemas/org.gnome.shell.extensions.veld-monitor-controls.gschema.xml
RUNTIME_SOURCES := extension.js prefs.js metadata.json src LICENSE

.PHONY: all lint schemas test check install uninstall pack release check-package clean logs dev

all: check

lint:
	@for file in extension.js prefs.js $$(find src dev -name '*.js' -print); do \
		node --check "$$file"; \
	done

schemas:
	glib-compile-schemas schemas

test:
	gjs -m tests/run.js

check: test lint schemas
	glib-compile-schemas --strict --dry-run schemas

install: schemas
	rm -rf "$(EXT_DIR)"
	mkdir -p "$(EXT_DIR)"
	cp -a $(RUNTIME_SOURCES) README.md schemas "$(EXT_DIR)/"
	glib-compile-schemas "$(EXT_DIR)/schemas"
	@echo "Installed to $(EXT_DIR)"
	@echo "Enable with: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions disable $(UUID) 2>/dev/null || true
	rm -rf "$(EXT_DIR)"
	@echo "Removed $(EXT_DIR)"

release: check
	rm -rf "$(BUILD_DIR)"
	mkdir -p "$(BUILD_DIR)/schemas" "$(DIST_DIR)"
	cp -a $(RUNTIME_SOURCES) "$(BUILD_DIR)/"
	cp -a "$(SCHEMA_FILE)" "$(BUILD_DIR)/schemas/"
	rm -f "$(DIST_DIR)/$(UUID).shell-extension.zip"
	gnome-extensions pack --force --out-dir="$(DIST_DIR)" \
		--extra-source=src \
		--extra-source=LICENSE \
		"$(BUILD_DIR)"
	rm -rf "$(BUILD_DIR)"
	./scripts/check-release.sh "$(DIST_DIR)/$(UUID).shell-extension.zip"
	@ls -l "$(DIST_DIR)/$(UUID).shell-extension.zip"

pack: release

check-package:
	./scripts/check-release.sh "$(DIST_DIR)/$(UUID).shell-extension.zip"

clean:
	rm -rf "$(DIST_DIR)" "$(BUILD_DIR)" schemas/gschemas.compiled

logs:
	journalctl -f -o cat /usr/bin/gnome-shell

dev:
	./dev/run-nested.sh
