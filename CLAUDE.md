# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeBridge is a WhatsApp-to-Claude Code bridge that enables coding via WhatsApp chat. It's an MCP (Model Context Protocol) server that manages multi-user sessions, allowing developers to code from anywhere by sending messages through WhatsApp.

**Current Status**: Design phase complete, implementation not yet started.

## Architecture

The system uses a three-tier architecture:

1. **Baileys Gateway (External)**: Handles WhatsApp session management via Baileys library
2. **CodeBridge MCP Server**: Core bridge layer with session management, command parsing, and MCP protocol implementation
3. **Claude Code Instances**: Per-user isolated instances with project-specific context

**Key Design Principle**: One Claude instance per active user, with automatic cleanup of idle sessions.

## Development Commands

### Running the Application

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Production with PM2
npm run start:prod
pm2 stop codebridge
pm2 restart codebridge
pm2 logs codebridge
```

### Testing & Quality

```bash
# Run tests
npm test

# Lint code
npm run lint

# Initial setup script
npm run setup
```

## Project Structure

This project follows a modular structure with clear separation of concerns:

- `src/mcp-server/`: MCP protocol implementation (server.js, tools.js, resources.js)
- `src/whatsapp/`: WhatsApp integration via Baileys (client.js, webhook.js)
- `src/claude/`: Claude Code process management (instance.js, session.js)
- `src/commands/`: Command parser and handlers (index.js, project.js, system.js)
- `src/utils/`: Shared utilities (message-queue.js, logger.js, config.js)
- `config/`: Configuration files (projects.json, settings.json, .env)
- `data/`: Runtime data - sessions state and logs (gitignored)

## Configuration

### projects.json

Defines available projects with paths and settings. Each project entry needs:
- `path`: Absolute path to project directory
- `description`: Human-readable description
- `default`: Boolean indicating default project
- `settings.autoCommit`: Auto-commit changes
- `settings.autoTest`: Auto-run tests

### settings.json

Bridge-level configuration:
- `bridge.instanceMode`: Always "per-user" for isolation
- `whatsapp.pollingInterval`: Message polling frequency (2000ms)
- `whatsapp.useWebhook`: false for polling, true for webhook mode
- `claude.responseTimeout`: Max wait time for Claude response (120000ms)
- `security.requireWhitelist`: Enforce phone number whitelist

### Environment Variables

Critical environment variables in .env:
- `BAILEYS_URL`: Baileys gateway endpoint
- `ALLOWED_NUMBERS`: Comma-separated whitelist of phone numbers
- `CLAUDE_API_KEY`: Anthropic API key
- `SESSION_IDLE_TIMEOUT`: Idle timeout before cleanup (1800000ms = 30min)
- `MAX_CONCURRENT_SESSIONS`: Max concurrent users (10)
- `LOG_LEVEL`: Logging verbosity (info, debug, warn, error)

## Session Management

The session manager maintains a mapping of `userId → { claudeInstance, projectPath, conversationHistory }`:

- Sessions spawn on first message from a user
- Idle sessions auto-cleanup after `SESSION_IDLE_TIMEOUT`
- Session state persists to `data/sessions/{userId}.json`
- On new message after cleanup, session restores from disk
- Concurrent session limit enforced via `MAX_CONCURRENT_SESSIONS`

## Command System

Commands start with `/` and are handled separately from coding prompts:

**Project Management**: `/projects`, `/switch <name>`, `/current`
**Session Management**: `/status`, `/reset`, `/history`
**System**: `/help`

Non-slash messages are treated as coding prompts and forwarded directly to the Claude instance.

## Implementation Roadmap

The project follows a phased implementation approach defined in docs/ROADMAP.md:

**Phase 1 (MVP)**: Core infrastructure - utils, WhatsApp client, command parser, Claude instance manager, MCP server (2-3 weeks)

**Phase 2 (Enhancement)**: Security hardening, session persistence, auto-cleanup, error handling (2-3 weeks)

**Phase 3 (Advanced)**: Web dashboard, code formatting, file operations, git integration (3-4 weeks)

**Phase 4 (Scale)**: Multi-server deployment, database integration, monitoring, auto-scaling (2-3 weeks)

When implementing, follow the order defined in ROADMAP.md Phase 1:
1. Utils & Infrastructure (config, logger, message-queue)
2. WhatsApp Client
3. Command Parser
4. Claude Instance Manager & Session Manager
5. MCP Server Core
6. Integration & Testing

## Security Considerations

- **Whitelist Enforcement**: All incoming messages must be from `ALLOWED_NUMBERS`
- **Rate Limiting**: Per-user rate limiting (10 messages/minute configurable)
- **Input Sanitization**: Escape special characters before forwarding to Claude
- **File Access Control**: Claude instances restricted to assigned project directories only
- **Audit Logging**: Log all security events, rejected attempts, and user actions

## Key Technical Decisions

### Why MCP Protocol?

Using MCP instead of direct Claude API provides:
- File operation capabilities through Claude Code
- Automatic conversation context management
- Access to Claude Code's tool ecosystem
- Better coding assistant experience

### Why Per-User Instances?

One Claude instance per user (not shared) ensures:
- Context isolation between users
- No security risks from context mixing
- Independent project contexts
- Scalable resource management via cleanup

### Baileys vs Direct WhatsApp API

Using Baileys library via external gateway provides:
- No official API dependency
- Lower cost than WhatsApp Business API
- More control over session management
- Separation of concerns (WhatsApp logic external)

## Error Handling Strategy

The system uses retry strategies with exponential backoff:

- **Baileys Gateway Down**: Queue messages, retry every 30s
- **Claude Timeout**: Kill and restart instance
- **Out of Memory**: Cleanup all idle sessions
- **Rate Limit Hit**: Queue message, notify user
- **Session Limit Reached**: Cleanup oldest idle session

All errors should return user-friendly messages with actionable suggestions.

## Testing Approach

For Phase 1 MVP, focus on:
- Unit tests for utils (config, logger, message queue)
- Integration tests for WhatsApp client
- Manual end-to-end testing scenarios documented in ROADMAP.md section 1.7
- Mock Claude instance for development until Claude Code CLI interface is confirmed

## Notes for Implementation

- The Claude Code CLI interface specification is not yet confirmed. Plan to create a mock implementation for development and have a fallback to direct Claude API.
- Session persistence uses file-based storage in Phase 1, can migrate to Redis in Phase 4 for multi-server deployment.
- WhatsApp message format is limited - responses may need chunking for long code outputs.
- Conversation history should be trimmed after a certain length to avoid context window issues.
- PM2 configuration is in `scripts/pm2.config.js` for production deployment.
