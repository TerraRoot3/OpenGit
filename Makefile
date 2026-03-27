# OpenGit — 常用命令与 package.json scripts 对齐
# 使用: make help | make run

.PHONY: help install dev run electron build preview \
	electron-build electron-build-mac electron-build-win electron-build-linux \
	dist release release-x64 release-all clean-cache generate-icon convert-icon

help:
	@echo "OpenGit Makefile — 与 npm scripts 对应"
	@echo ""
	@echo "  make install          npm install"
	@echo "  make dev              仅 Vite 开发服务器"
	@echo "  make run              Vite + Electron（日常开发）"
	@echo "  make electron         bash scripts/start-electron.sh"
	@echo "  make build            vite build"
	@echo "  make preview          vite preview"
	@echo "  make electron-build   build + electron-builder"
	@echo "  make electron-build-mac|win|linux   平台打包"
	@echo "  make dist             build + electron-builder --publish=never"
	@echo "  make release          bash scripts/build-release.sh"
	@echo "  make release-x64      bash scripts/build-release-x64.sh"
	@echo "  make release-all      bash scripts/build-release-all.sh"
	@echo "  make clean-cache      清理 Electron 缓存"
	@echo "  make generate-icon    node scripts/generate-icon.js"
	@echo "  make convert-icon     bash scripts/convert-icon.sh"

install:
	npm install

dev:
	npm run dev

# 本地开发：启动 Vite + Electron（package.json: electron:dev）
run:
	npm run electron:dev

electron:
	npm run electron

build:
	npm run build

preview:
	npm run preview

electron-build:
	npm run electron:build

electron-build-mac:
	npm run electron:build:mac

electron-build-win:
	npm run electron:build:win

electron-build-linux:
	npm run electron:build:linux

dist:
	npm run dist

release:
	npm run release

release-x64:
	npm run release:x64

release-all:
	npm run release:all

clean-cache:
	npm run electron:clean-cache

generate-icon:
	npm run generate-icon

convert-icon:
	npm run convert-icon
