# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- Host-driven Blender orchestration for Codex and Claude subscription sessions.
- Read-only Scene Inspector and propose-only Material Specialist reports with
  compact, isolated context packets.
- Configurable model classes and an optional API-backed orchestration mode for
  unattended use; host-driven mode is the default and needs no API key.
- Structured operation validation, bounded orchestration configuration, and
  run-level observability/usage reporting when a provider exposes usage.
- Richer Blender snapshots: material assignments and Principled BSDF values,
  lights, cameras, render settings, and last preview location.
- `render_blender_preview`, which returns a temporary PNG to the MCP host while
  restoring the scene's prior render output path.
- Codex and Claude orchestration skills/director templates.
- Desktop-launcher reference-image attachments for OpenAI, Gemini, Codex CLI,
  and Claude Code prompts.

### Changed

- Documentation now distinguishes subscription-hosted orchestration from the
  optional API bridge.
- MCP smoke and unit coverage now includes orchestration routing, material
  validation, context isolation, and render-preview script safety.

## 0.2.9 — 2026-05-27

### Added

- Integrated desktop agent chat workspace.

## 0.2.8 — 2026-02-27

### Added

- Windows desktop MVP support and packaging scripts.

## 1.0.0 — 2025-02-18

### Added

- Initial MCP-to-Blender auto-execution workflow.
- Object lock/preserve controls, generated-object collection management, and
  copyable error reporting.
- Support for meshes, curves, cameras, animation, and materials.

Earlier release details are available in the Git tag history.
