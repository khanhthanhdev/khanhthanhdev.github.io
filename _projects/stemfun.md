---
layout: post
title: "StemFun Project Architecture and Workflow"
date: 2025-02-15 10:00:00
description: "Detailed project workflow for StemFun: classic generation, render repair, queue management, and multi-agent Studio sessions."
tags: [typescript, react, express, manim, ai-agents, education, workflow]
category: work
github: https://github.com/khanhthanhdev/StemFun
toc:
  sidebar: true
mermaid:
  enabled: true
---

StemFun started from a simple teaching problem: STEM subjects often become difficult not because the formulas are unavailable, but because learners cannot see why those formulas emerge. Many online learning platforms provide exercises, worked answers, and recorded explanation videos, yet the path from a real-world situation to a model, equation, diagram, or algorithm is still hard to follow. This gap is especially visible in math, physics, chemistry, and programming topics where learners need motion, structure, and step-by-step visual reasoning rather than static text.

The research direction behind StemFun was to combine generative AI with deterministic scientific animation. General AI video tools can quickly create marketing-style clips or avatar-led lessons, but they struggle with precise graphs, geometric relationships, symbolic transformations, simulations, and code execution traces. Instead of relying on diffusion-style video generation, StemFun uses large language models to plan an explanation and generate Manim code, then renders the output through a controllable Python animation pipeline. This keeps the creative flexibility of AI while preserving the precision needed for educational content.

The core idea is to let a learner or teacher describe a STEM concept in natural language, then have the system produce an animated explanation that shows the reasoning process. For example, a physics problem can be decomposed into forces, variables, equations, and visual transitions; a calculus idea can be shown as a changing curve; and a programming tutorial can visualize control flow and data changes over time. The system is designed not only to produce a final video, but also to support inspection, repair, and iterative editing of the generated code.

Technically, StemFun is a full-stack AI rendering platform. It uses a React frontend, an Express/TypeScript backend, a Redis-backed Bull queue for asynchronous jobs, AI generation and repair services, and a Python/Manim runtime for video or image rendering. The project has two main product modes:

1. **Workflow Mode**: one-shot generation through an async job pipeline.
2. **Agent Mode**: long-lived Studio sessions where an AI agent can read files, write code, request permissions, run checks, render outputs, and spawn reviewer or designer subagents.

---

## System Overview

<video src="/assets/video/stemfun.mp4" controls width="100%"></video>

StemFun is a full-stack application with a React frontend, Express/TypeScript backend, Redis-backed Bull queue, Python/Manim render runtime, and optional Supabase persistence.

```mermaid
graph TB
    subgraph Frontend["Frontend: React 19 + Vite"]
        Classic["Classic Generator UI"]
        Studio["Studio Workspace"]
        Pages["Workspace, metrics, settings"]
    end

    subgraph Backend["Backend: Express + TypeScript"]
        Routes["API Routes"]
        Services["Services Layer"]
        Queue["Bull Queue: video-generation"]
        Agent["Studio Agent Runtime"]
    end

    subgraph Runtime["Render Runtime"]
        Python["Python"]
        Manim["ManimCE"]
        Latex["LaTeX"]
        FFmpeg["ffmpeg"]
    end

    subgraph Storage["Storage"]
        Redis[("Redis")]
        Files["public/videos, public/images, media"]
        Supabase[("Supabase optional")]
    end

    subgraph External["External Services"]
        AI["OpenAI-compatible AI Providers"]
    end

    Classic -->|HTTP| Routes
    Studio -->|HTTP + SSE| Routes
    Routes --> Services
    Routes --> Agent
    Services --> Queue
    Queue --> Redis
    Services --> AI
    Agent --> AI
    Queue --> Python
    Python --> Manim
    Manim --> Latex
    Manim --> FFmpeg
    Services --> Files
    Services --> Supabase
    Agent --> Supabase
```

Main backend entry points:

| Area           | Files                                                                | Purpose                                                                      |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Server boot    | `src/server.ts`, `src/server/bootstrap.ts`                           | Express app, middleware, static files, route registration                    |
| Routes         | `src/routes/*.route.ts`                                              | Generation, modification, status, cancellation, Studio API, history, metrics |
| Queue          | `src/config/bull.ts`, `src/queues/processors/video.processor.ts`     | Async generation and render jobs                                             |
| AI generation  | `src/services/concept-designer.ts`, `src/services/concept-designer/` | Scene design and Manim code generation                                       |
| Static guard   | `src/services/static-guard/`                                         | Python syntax/type checks and AI patch loop                                  |
| Render retry   | `src/services/code-retry/`                                           | AI-assisted repair after Manim render failure                                |
| Studio runtime | `src/studio-agent/`                                                  | Agent sessions, tools, permissions, runs, tasks, work results                |

---

## Product Modes

```mermaid
flowchart LR
    User["User"] --> Choice{"Mode"}
    Choice --> Classic["Workflow Mode"]
    Choice --> Studio["Agent Mode"]

    Classic --> W1["Submit concept"]
    W1 --> W2["Queue job"]
    W2 --> W3["Generate code"]
    W3 --> W4["Static guard"]
    W4 --> W5["Render"]
    W5 --> W6["Return video/image"]

    Studio --> A1["Create session"]
    A1 --> A2["Start run"]
    A2 --> A3["Agent tool loop"]
    A3 --> A4["Read/write/check/render/review"]
    A4 --> A5["Stream events to UI"]
    A5 --> A6["Continue in same workspace"]
```

| Dimension        | Workflow Mode                    | Agent Mode                                            |
| ---------------- | -------------------------------- | ----------------------------------------------------- |
| Interaction      | Single request, async job result | Multi-turn session                                    |
| State            | Job-based, temporary             | Session-based, workspace-backed                       |
| Frontend updates | Polling                          | Server-Sent Events                                    |
| AI behavior      | Pipeline stages                  | Tool-using agent loop                                 |
| Review           | Static guard and render retry    | Static check, AI review, reviewer subagent            |
| Workspace        | Generated temp code/media        | Persistent session directory                          |
| Best for         | Direct video/image generation    | Iterative creation, code editing, review, longer work |

---

## Workflow Mode

Workflow Mode starts from `POST /api/generate`. The route validates the request, stores initial job state, enqueues a Bull job, and returns a `jobId`. The frontend then polls job status until completion.

```mermaid
sequenceDiagram
    participant User
    participant FE as Classic UI
    participant API as generate.route.ts
    participant Store as job-store
    participant Queue as Bull queue
    participant Worker as video.processor.ts
    participant AI as AI provider
    participant Guard as static-guard
    participant Render as Manim executor

    User->>FE: Enter concept and settings
    FE->>API: POST /api/generate
    API->>API: Validate request and sanitize concept
    API->>Store: storeJobStage(jobId, analyzing)
    API->>Queue: videoQueue.add(jobData)
    API-->>FE: 202 Accepted with jobId

    loop Poll status
        FE->>API: GET /api/jobs/:jobId
        API->>Store: Read tracking/result state
        API-->>FE: status, stage, revision
    end

    Queue->>Worker: Process job
    Worker->>AI: Scene design and code generation
    AI-->>Worker: Manim Python code
    Worker->>Guard: py_compile + mypy + patch loop
    Guard-->>Worker: Refined code
    Worker->>Render: Render video or image
    Render-->>Worker: Output paths or error
    Worker->>Store: Store completed/failed result
```

### Request Shape

```typescript
{
  concept: string
  problemPlan?: ProblemFramingPlan
  outputMode: 'video' | 'image'
  quality: 'low' | 'medium' | 'high'
  code?: string
  customApiConfig?: { apiUrl: string; apiKey: string; model: string }
  promptOverrides?: PromptOverrides
  videoConfig?: VideoConfig
  referenceImages?: ReferenceImage[]
  renderCacheKey?: string
}
```

### Processor Flow Types

The queue processor dispatches into three flows:

| Flow               | Trigger                              | Behavior                                          |
| ------------------ | ------------------------------------ | ------------------------------------------------- |
| Generation flow    | Default                              | Design scene, generate code, static guard, render |
| Pre-generated flow | `code` provided                      | Skip AI generation, check/render supplied code    |
| Edit flow          | Existing code plus edit instructions | AI edits code, static guard, render               |

```mermaid
flowchart TD
    Job["Bull job"] --> Kind{"Job kind"}
    Kind -->|preGeneratedCode| Pre["Pre-generated flow"]
    Kind -->|editCode + editInstructions| Edit["Edit flow"]
    Kind -->|default| Gen["Generation flow"]

    Pre --> Guard["Static guard"]
    Edit --> EditAI["AI code edit"]
    EditAI --> Guard
    Gen --> Design["Scene design stage"]
    Design --> Code["Code generation stage"]
    Code --> Guard

    Guard --> Render["Render step"]
    Render --> Result{"Success?"}
    Result -->|yes| Store["Store result"]
    Result -->|no| Retry["Code retry"]
    Retry --> Guard
```

---

## Problem Framing

Problem framing is an optional pre-generation step exposed by `POST /api/problem-frame`. It turns a raw concept into a structured teaching plan that can be reviewed by the user before generation.

```mermaid
sequenceDiagram
    participant User
    participant FE as Frontend
    participant API as problem-frame.route.ts
    participant AI as Problem framing model

    User->>FE: Enter concept
    FE->>API: concept, locale, feedback, reference images
    API->>AI: Dedicated problemFraming prompt
    AI-->>API: ProblemFramingPlan
    API-->>FE: Plan
    User->>FE: Approve or give feedback
    FE->>API: Generate with problemPlan
```

`ProblemFramingPlan` fields:

| Field          | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `mode`         | `clarify` for a specific prompt, `invent` when the prompt needs structure |
| `headline`     | Short title for the generation plan                                       |
| `summary`      | Brief teaching objective                                                  |
| `steps`        | Up to six planned explanation steps                                       |
| `visualMotif`  | Repeated visual metaphor or style                                         |
| `designerHint` | Downstream guidance for the scene design stage                            |

When passed to generation, the plan is merged into the concept text as problem framing context.

---

## Two-Stage AI Generation

StemFun separates creative planning from precise code generation.

```mermaid
flowchart TD
    Prompt["Concept + settings + optional problem plan/images"] --> Design["Stage 1: Scene design"]
    Design --> Plan["Structured visual plan"]
    Plan --> CodeGen["Stage 2: Code generation"]
    CodeGen --> Code["Manim Python code"]
    Code --> Guard["Static guard"]
```

### Stage 1: Scene Design

Implemented in `src/services/concept-designer/scene-design-stage.ts`.

- Uses the `conceptDesigner` system prompt.
- Receives concept, output mode, seed, and optional reference images.
- Produces a scene design plan describing objects, motion, pacing, visual structure, and teaching story.
- Supports vision input by attaching uploaded reference images as `image_url` message parts.
- Falls back to text-only input if a provider rejects images.
- Defaults: `DESIGNER_TEMPERATURE=0.8`, `DESIGNER_MAX_TOKENS=12000`, `DESIGNER_THINKING_TOKENS=20000`.

### Stage 2: Code Generation

Implemented in `src/services/concept-designer/code-from-design-stage.ts`.

- Uses the `codeGeneration` system prompt.
- Receives the concept, seed, scene design, and output mode.
- Produces Manim Python code.
- Video mode extracts code from `### START ###` / `### END ###` anchors or markdown code fences.
- Image mode strips thinking tags and preserves raw output.
- Defaults: `AI_TEMPERATURE=0.7`, `AI_MAX_TOKENS=12000`.

---

## Static Guard

The static guard validates generated or edited code before rendering. It reduces wasted render attempts and gives the AI a constrained patch loop.

```mermaid
flowchart TD
    Code["Generated code"] --> Py["py_compile"]
    Py --> Syntax{"Syntax/import issue?"}
    Syntax -->|yes| Patch["AI patch prompt"]
    Syntax -->|no| Mypy["mypy"]
    Mypy --> Type{"Type/common issue?"}
    Type -->|yes| Hardcoded["Known hardcoded fixes"]
    Hardcoded --> Remaining{"Issues remain?"}
    Remaining -->|yes| Patch
    Remaining -->|no| Pass["Guard passed"]
    Type -->|no| Pass
    Patch --> Apply["Apply [[PATCH]] blocks"]
    Apply --> Py
```

The guard runs:

1. Python compile validation.
2. `mypy` validation with line/column diagnostics.
3. Known hardcoded repairs, such as Manim list-to-tuple parameter fixes.
4. AI patch repair using `[[PATCH]]`, `[[SEARCH]]`, `[[REPLACE]]`, `[[END]]` blocks.
5. Re-validation up to `STATIC_GUARD_MAX_PASSES`, default `3`.

For image mode with multiple `YON_IMAGE` blocks, each scene block is checked separately and diagnostics are mapped back to original line offsets.

---

## Render Pipeline

The render step converts validated Manim code into final media. It supports video and image output paths.

```mermaid
flowchart TD
    Ready["Guarded code"] --> Mode{"Output mode"}
    Mode -->|video| Video["renderVideo"]
    Mode -->|image| Image["renderImages"]

    Video --> Exec["Manim executor"]
    Image --> Exec
    Exec --> OK{"Render OK?"}
    OK -->|yes video| BGM["Optional BGM mix"]
    OK -->|yes image| Done["Store image result"]
    BGM --> DoneVideo["Store video result"]
    OK -->|no| Retry["Code retry manager"]
    Retry --> RetryMode{"Repair mode"}
    RetryMode -->|patch| Guard["Static guard again"]
    RetryMode -->|full_code| Exec
    Guard --> Exec
```

The Manim executor:

- Spawns a Manim subprocess through `src/utils/manim-executor.ts`.
- Supports low, medium, and high resolution settings.
- Applies request-level and default timeout settings.
- Registers active processes so cancellation can terminate them.
- Monitors peak memory and logs render progress.

Video output may be mixed with background music using `src/audio/bgm-mixer.ts`. If mixing fails, the original video remains valid.

---

## Render Repair and Retry

Static validation cannot catch every Manim runtime problem. The code retry manager repairs render failures using error context from Manim stderr.

```mermaid
stateDiagram-v2
    [*] --> RenderAttempt
    RenderAttempt --> Success: Manim exits cleanly
    RenderAttempt --> ExtractError: Manim fails
    ExtractError --> PatchMode: early attempt and patchable error
    ExtractError --> FullCodeMode: repeated error, syntax error, or late attempt
    PatchMode --> StaticGuard: apply targeted patch
    StaticGuard --> RenderAttempt
    FullCodeMode --> RenderAttempt: regenerate full file
    RenderAttempt --> Failed: retry budget exhausted
    Success --> [*]
    Failed --> [*]
```

Retry behavior:

| Mechanism           | Detail                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Max retries         | `CODE_RETRY_MAX_RETRIES`, default `4`                                                                          |
| Patch mode          | AI returns targeted patch blocks around the failing code                                                       |
| Full-code mode      | AI regenerates the whole file                                                                                  |
| Escalation triggers | Attempt >= 3, `SyntaxError`, `IndentationError`, failed patch application, repeated normalized error signature |
| Temperature         | `CODE_RETRY_TEMPERATURE`, default `0.1`                                                                        |

The retry manager normalizes error signatures by removing unstable line numbers, paths, and string literals. This prevents repeating the same failed repair.

---

## Job Management

All Workflow Mode render work is asynchronous. Redis stores queue state, job stages, access metadata, cancellation flags, and final results.

```mermaid
stateDiagram-v2
    [*] --> Queued: POST /api/generate
    Queued --> Processing: worker active
    Processing --> Completed: render succeeds
    Processing --> Failed: retry exhausted
    Processing --> Cancelled: cancel active job
    Queued --> Cancelled: cancel queued job
    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]
```

Redis key patterns:

| Key                           | Purpose                               |
| ----------------------------- | ------------------------------------- |
| `job:result:<jobId>`          | Final completed/failed result         |
| `job:result:stage:<jobId>`    | Current processing stage              |
| `job:result:tracking:<jobId>` | Revision, status, attempt, timestamps |
| `job:cancel:<jobId>`          | Cancellation flag and reason          |
| `concept:cache:<hash>`        | Cached generation data                |

Processing stages:

```mermaid
flowchart LR
    A["analyzing"] --> B["generating"]
    B --> C["refining"]
    C --> D["rendering"]
    D --> E{"terminal"}
    E --> F["completed"]
    E --> G["failed"]
```

Important behavior:

- `GET /api/jobs/:jobId` checks Bull state first, then Redis result state.
- Job access is bound to API key hash and browser client ID.
- `POST /api/jobs/:jobId/cancel` marks cancellation, removes queued jobs, or kills active Manim processes.
- Job result retention defaults to 24 hours.
- Media cleanup removes old generated files from `public/images/` and `public/videos/`.

---

## Agent Mode

Agent Mode is powered by the Studio Agent runtime in `src/studio-agent/`. It is designed for iterative work where an AI agent can operate inside a session workspace.

```mermaid
graph TB
    subgraph Frontend
        Shell["StudioShell"]
        Command["StudioCommandPanel"]
        Assets["StudioAssetsPanel"]
        Pipeline["StudioPipelinePanel"]
    end

    subgraph API
        Route["studio-agent.route.ts"]
        SSE["SSE endpoint"]
    end

    subgraph Runtime
        Runner["StudioSessionRunner"]
        Builder["StudioBuilderRuntime"]
        Processor["StudioRunProcessor"]
        Loop["OpenAI tool loop"]
        Planner["TurnPlanResolver"]
    end

    subgraph Domain
        Sessions["Session store"]
        Runs["Run store"]
        Tasks["Task store"]
        Works["Work store"]
        Results["WorkResult store"]
    end

    subgraph Tools
        Registry["Tool registry"]
        FileOps["read, glob, grep, ls, write, edit, apply-patch"]
        AgentOps["task, skill, question"]
        RenderOps["render, static-check, ai-review"]
    end

    subgraph Permissions
        Permission["Permission service"]
        Policy["Permission policy"]
    end

    Shell --> Route
    Command --> Route
    Route --> Runner
    Route --> SSE
    Runner --> Builder
    Runner --> Planner
    Runner --> Loop
    Loop --> Registry
    Registry --> FileOps
    Registry --> AgentOps
    Registry --> RenderOps
    Runner --> Processor
    Processor --> Sessions
    Processor --> Runs
    Processor --> Tasks
    Processor --> Works
    Processor --> Results
    Loop --> Permission
    Permission --> Policy
    SSE --> Shell
    SSE --> Assets
    SSE --> Pipeline
```

### Session Hierarchy

```mermaid
erDiagram
    Session ||--o{ Run : has
    Session ||--o{ Message : has
    Session ||--o{ Work : has
    Session ||--o{ Task : has
    Session ||--o{ SessionEvent : emits
    Run ||--o{ Task : triggers
    Run ||--o{ Work : produces
    Work ||--o{ WorkResult : has
    Task }o--|| Work : belongs_to
```

| Entity     | Meaning                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Session    | Long-lived workspace context with studio kind, agent type, permissions, messages, runs, tasks, and works |
| Run        | One user interaction cycle; only one active run is allowed per session                                   |
| Message    | User, assistant, system, or tool message part                                                            |
| Task       | A concrete step such as tool execution, render, static check, review, or subagent run                    |
| Work       | A user-visible work item such as video, plot, design, review, edit, or render-fix                        |
| WorkResult | Output artifact such as render output, review report, design plan, edit result, or failure report        |

### Run Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Session: create session
    Session --> PendingRun: user sends message
    PendingRun --> Running
    Running --> TurnPlanning
    TurnPlanning --> ToolExecution: planned/direct tool call
    TurnPlanning --> AgentLoop: autonomous model turn
    AgentLoop --> ToolExecution: model requests tool
    ToolExecution --> TurnPlanning: continue
    ToolExecution --> PermissionWait: permission required
    PermissionWait --> ToolExecution: approved
    PermissionWait --> Failed: rejected
    Running --> Completed: finished
    Running --> Failed: unrecoverable error
    Running --> Cancelled: user cancels
```

### Agent Roles

| Role       | Purpose                                                                     | Tool access                      |
| ---------- | --------------------------------------------------------------------------- | -------------------------------- |
| `builder`  | Main implementation agent; writes code, edits files, renders, manages tasks | All tools                        |
| `reviewer` | Reviews code and output quality                                             | Read-only tools and review tools |
| `designer` | Produces visual concepts, scene plans, and storyboards                      | Read-only tools                  |

The builder can spawn reviewer or designer subagents through the `task` tool. Child sessions inherit parent permission rules but cannot recursively spawn more tasks.

---

## Studio Turn Planning

Before using the autonomous AI tool loop, the runtime parses user intent and may choose a direct plan.

```mermaid
flowchart TD
    Input["User input"] --> Parse["TurnPlanIntent: parse"]
    Parse --> Slash{"Slash command?"}
    Parse --> Files{"File references?"}
    Parse --> Skill{"Skill requested?"}
    Parse --> Review{"Review/design intent?"}

    Slash --> Policy["TurnPlanPolicy"]
    Files --> Policy
    Skill --> Policy
    Review --> Policy
    Policy --> Decision{"Decision"}
    Decision -->|continue-current-work| Continue["Continue active work"]
    Decision -->|task-intent| Task["Create subagent task"]
    Decision -->|direct-tool| Tool["Run direct tool"]
    Decision -->|none| Loop["Autonomous AI tool loop"]
```

This makes simple commands predictable. For example, `/read file.ts` can become a direct read tool call instead of a full autonomous model turn.

---

## Studio Tools and Permissions

Tools are registered through `src/studio-agent/tools/registry.ts`. Each tool declares name, category, permission, allowed agents, allowed studio kinds, and an execute function.

```mermaid
flowchart LR
    Agent["Agent"] --> Request["Tool request"]
    Request --> Registry["Tool registry"]
    Registry --> Allowed{"Allowed for role and studio kind?"}
    Allowed -->|no| Reject["Reject"]
    Allowed -->|yes| Permission{"Permission allowed?"}
    Permission -->|auto| Execute["Execute tool"]
    Permission -->|ask| Ask["Emit permission.asked"]
    Ask --> User["User decision"]
    User -->|approve| Execute
    User -->|reject| Reject
    Execute --> Result["Tool result event"]
```

Tool groups:

| Group             | Tools                                                        |
| ----------------- | ------------------------------------------------------------ |
| File operations   | `read`, `glob`, `grep`, `ls`, `write`, `edit`, `apply-patch` |
| Agent operations  | `task`, `skill`, `question`                                  |
| Render operations | `render`, `static-check`, `ai-review`                        |

Permission levels:

| Level | Default behavior                  |
| ----- | --------------------------------- |
| `L0`  | No auto-allowed tools             |
| `L1`  | No auto-allowed tools             |
| `L2`  | Auto-allow read-only file tools   |
| `L3`  | `L2` plus more operational access |
| `L4`  | Auto-allow all tools              |

All workspace file operations resolve paths through workspace guards so tool calls cannot escape the session directory.

---

## Studio Event Flow

Agent Mode uses Server-Sent Events to keep the UI synchronized while runs execute in the background.

```mermaid
sequenceDiagram
    participant FE as Studio UI
    participant API as Studio API
    participant Runtime as Runtime
    participant Tools as Tools
    participant Bus as Event bus

    FE->>API: POST /api/studio-agent/sessions
    API-->>FE: session
    FE->>API: GET /api/studio-agent/events
    API-->>FE: studio.connected
    FE->>API: POST /api/studio-agent/runs
    API->>Runtime: startBackgroundRun
    Runtime->>Bus: run_updated
    Runtime->>Tools: execute tool call
    Tools->>Bus: tool_input_start / tool_call
    Tools-->>Runtime: result
    Runtime->>Bus: tool_result / task_updated / work_updated
    Bus-->>FE: SSE events
    Runtime->>Bus: run_updated completed
```

Common events:

| Event                | Meaning                   |
| -------------------- | ------------------------- |
| `studio.connected`   | SSE stream connected      |
| `studio.heartbeat`   | Keep-alive event          |
| `run_updated`        | Run status changed        |
| `assistant_text`     | Assistant text streamed   |
| `tool_input_start`   | Tool input started        |
| `tool_call`          | Tool call received        |
| `tool_result`        | Tool output or error      |
| `task_updated`       | Task lifecycle changed    |
| `work_updated`       | Work lifecycle changed    |
| `permission.asked`   | User approval required    |
| `permission.replied` | User approved or rejected |

---

## AI Routing

StemFun routes AI calls to OpenAI-compatible upstream providers. A request can provide `customApiConfig`; otherwise the server resolves routing by configured StemFun route keys.

```mermaid
flowchart TD
    Request["Incoming request"] --> Custom{"customApiConfig present?"}
    Custom -->|yes| UseCustom["Use request API URL/key/model"]
    Custom -->|no| Bearer["Read bearer key"]
    Bearer --> Route{"Key mapped in STEMFUN_ROUTE_*?"}
    Route -->|yes| UseRoute["Use mapped upstream config"]
    Route -->|no| Error["Reject: no upstream configured"]
    UseCustom --> Client["OpenAI-compatible client"]
    UseRoute --> Client
    Client --> Provider["Provider completion API"]
```

Routing environment variables:

| Variable                 | Purpose                         |
| ------------------------ | ------------------------------- |
| `STEMFUN_ROUTE_KEYS`     | Public keys accepted by StemFun |
| `STEMFUN_ROUTE_API_URLS` | Upstream API base URLs          |
| `STEMFUN_ROUTE_API_KEYS` | Upstream provider keys          |
| `STEMFUN_ROUTE_MODELS`   | Model names for each route      |

This lets different users or deployments route to different providers without changing code.

---

## Frontend Workflow

The frontend is a React SPA with classic generation screens and Studio workspaces.

```mermaid
flowchart TB
    App["frontend/src/App.tsx"] --> Classic["Classic generator"]
    App --> ManimStudio["Manim Studio"]
    App --> PlotStudio["Plot Studio"]
    App --> Game["Wait-state game"]

    Classic --> UseGeneration["useGeneration"]
    Classic --> ProblemFrame["useProblemFraming"]
    Classic --> Upload["Reference image upload"]
    UseGeneration --> GenerateAPI["POST /api/generate"]
    UseGeneration --> Poll["GET /api/jobs/:jobId"]

    ManimStudio --> SessionHook["useStudioSession"]
    ManimStudio --> RunHook["useStudioRun"]
    ManimStudio --> EventHook["useStudioEvents"]
    EventHook --> Store["studio-session-store"]
    Store --> Panels["Command, Assets, Pipeline panels"]
```

Classic UI:

- Creates generation jobs.
- Displays problem framing plans.
- Uploads reference images.
- Polls job status and result revisions.
- Recovers active job IDs from browser session storage.

Studio UI:

- Creates or loads Studio sessions.
- Starts background runs.
- Subscribes to SSE updates.
- Shows tasks, works, permissions, review findings, and render outputs.

---

## Long Animation and Segmented Rendering

The render system supports segmented output for longer or more complex generations. AI-generated code can include `YON_IMAGE` anchors that split the output into independently renderable segments.

```mermaid
flowchart LR
    Code["Generated code"] --> Detect["Detect YON_IMAGE anchors"]
    Detect --> Split["Split into segments"]
    Split --> Render1["Render segment 1"]
    Split --> Render2["Render segment 2"]
    Split --> RenderN["Render segment N"]
    Render1 --> Combine["Combine or return ordered outputs"]
    Render2 --> Combine
    RenderN --> Combine
    Combine --> Final["Final media result"]
```

Benefits:

- Reduces timeout risk for long scenes.
- Allows partial isolation of render failures.
- Supports image-mode multi-scene checks with line-offset diagnostics.

---

## Operational Workflow

For local development:

```bash
npm install
cd frontend && npm install
cd ..
npm run dev
```

Expected runtime dependencies:

| Dependency      | Purpose                                       |
| --------------- | --------------------------------------------- |
| Redis 7+        | Bull queue, job state, cancellation state     |
| Python 3.11+    | Manim execution                               |
| ManimCE 0.19.x  | Mathematical animation rendering              |
| LaTeX           | Equation rendering                            |
| ffmpeg          | Video output and audio mixing                 |
| AI provider key | Scene design, code generation, repair, review |

Development workflow:

```mermaid
flowchart TD
    Change["Code/doc change"] --> Read["Read README and relevant docs"]
    Read --> Implement["Implement scoped update"]
    Implement --> Check["Run targeted checks"]
    Check --> Result{"Pass?"}
    Result -->|yes| Report["Summarize changed files and verification"]
    Result -->|no| Fix["Fix syntax/runtime issue"]
    Fix --> Check
```

Recommended checks depend on scope:

| Scope                 | Check                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Backend TypeScript    | `npm run build` or targeted TypeScript check                       |
| Frontend React        | `cd frontend && npm run build`                                     |
| Studio behavior       | Relevant unit tests in `frontend/src/studio` or `src/studio-agent` |
| Manim render behavior | Run a small render job or static guard path                        |
| Docs only             | Verify Mermaid syntax and links by reading generated Markdown      |

---

## Key Design Decisions

1. **Async queue instead of synchronous rendering**: Manim renders can take minutes, so the API returns a job ID immediately and lets the frontend poll.
2. **Two-stage AI generation**: creative scene planning and precise code generation are separate model calls.
3. **Static guard before render**: syntax and type checks catch many AI code mistakes before expensive rendering.
4. **Render retry after runtime failure**: Manim stderr becomes structured context for AI repair.
5. **OpenAI-compatible routing**: deployments can use different model providers without code changes.
6. **Studio session hierarchy**: Session, Run, Task, Work, and WorkResult make long-running agent work inspectable.
7. **Tool registry**: Agent capabilities are declarative, role-scoped, and permission-gated.
8. **SSE for Agent Mode**: users see live tool calls, permissions, task progress, and work updates.
9. **Workspace sandboxing**: file tools operate inside the session workspace only.
10. **Cancellation and cleanup**: active Manim processes can be terminated, and old generated media is removed on a schedule.

---
