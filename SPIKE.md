# Spike: The Center-Back Mindset

## Philosophy

Fast-moving teams generate code quickly. The bottleneck isn't implementation—it's *direction*. When you can spin up features in hours, the expensive mistakes are:

1. Building the wrong thing
2. Building something that can't evolve
3. Painting yourself into architectural corners

A center-back doesn't just react to what's happening now—they read the game, anticipate where it's going, and position the team accordingly.

## This Project's Spike

My spike isn't a flashy feature. It's a documentation structure that demonstrates **architectural foresight**.

### How I Enable Pivotability

Each component in this project has a DESIGN.md that defines:
1. **The API contract** — What goes in, what comes out
2. **Where tradeoffs were made** — So they can be unmade later
3. **How future features would affect it** — Tagged by evolution path

When a new feature idea emerges:
1. Check which components need to change
2. Look at the interfaces between them
3. Find the tagged tradeoffs that might need revisiting

If a tradeoff was made that blocks the new feature, it's documented. You know exactly what to undo.

### The Mechanism: Clear Boundaries

This foresight is powered by a simple principle: define clear interfaces between components.

Each component can be as complex as it needs to be internally. What matters is the contract: what it exposes, what it expects, and what it promises. When every component is agnostic to its callers:
- New components slot in without surgery
- Changes isolate to specific boundaries
- You can reason about the system without reading every line

This isn't new — separation of concerns is a classic principle. But it's especially critical when AI accelerates development. Packages grow fast. The interfaces are what keep humans in control.

## Anticipated Evolution Paths

I've identified four directions this project could evolve:

| Path | What Changes |
|------|--------------|
| **ACCOUNTS** | Player identity, auth, profiles |
| **STREAMING** | Spectators, one-to-many broadcast |
| **POWERUPS** | New action types, game variants |
| **UNKNOWN** | Whatever we haven't thought of |

Each component's DESIGN.md tags decisions by which paths they affect.

### Example: Adding STREAMING

Say we want to add spectator mode—100 viewers watching a game live.

1. **Check docs/DESIGN.md** — Cross-cutting concerns, message format
2. **Check server/DESIGN.md** — Tagged tradeoff: "broadcasts to 2 connections, would need fan-out for N"
3. **Check infrastructure/DESIGN.md** — Tagged tradeoff: "Lambda-per-broadcast expensive at scale, would add SNS"
4. **Check client/DESIGN.md** — Spectator needs read-only view, different component variant

The path forward is visible before writing any code.

## Why This Matters

Anyone can build Battleship. The spike demonstrates that I:

1. **Think beyond the immediate requirements** — What happens after v1?
2. **Structure decisions for discoverability** — Future me (or a teammate) can find relevant context fast
3. **Quantify the cost of change** — Not "we'd have to refactor" but "here's specifically what changes"
4. **Keep documentation lean** — Short, focused docs over sprawling wikis

This is the center-back mindset: read the game, anticipate the play, position the team to respond.
