---
layout: page
title: Infi
description: AI-powered stock and portfolio research desktop app built with Rust and Tauri. Source-backed claims, structured reports, no black boxes.
importance: 1
date: 2026-04-29
category: work
github: https://github.com/khanhthanhdev/infi
---

Infi is a desktop app that lets you research stocks and portfolios using AI coding agents. The agent fetches data, structures every claim as a source-backed block, and submits it through Infi's tools — the report is assembled from those typed blocks, never parsed from free-form prose.

## Core Features

- **Structured Research** — Thesis, risks, scenarios, and final stance with source citations
- **Portfolio Analysis** — CSV import, allocation review, risk assessment, rebalancing suggestions
- **12 Data Providers** — Tavily, SEC EDGAR, Alpha Vantage, Yahoo Finance, and more
- **Export & Share** — Standalone HTML, Markdown, or publish to PageDrop.io
- **Privacy-First** — Local SQLite storage, no cloud, no telemetry

## Stack

- Rust + Tauri for the desktop app
- TypeScript + Vite + Bun for the frontend
- SQLite for local storage
- Supports Claude, Codex, Gemini, Kimi, Mistral, Qwen, and custom agents
