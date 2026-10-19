/**
 * agent-rewind: time travel for agents. Snapshot state into a branching
 * timeline, rewind to any checkpoint, fork alternate futures, and replay
 * recorded tool runs deterministically — no flux capacitor required.
 *
 *   const tl = createTimeline({ balance: 100 });
 *   tl.checkpoint("before-buy");
 *   tl.commit({ balance: 40 });
 *   tl.rewind("before-buy");           // we're rich again
 *   const alt = tl.fork("what-if");    // explore without touching main line
 */
import {
  runTool,
  type Tool,
  type ToolContext,
  type ToolResult,
} from "agent-tools";

export type Checkpoint<T> = {
  id: string;
  label: string;
  state: T;
  at: string;
  step: number;
};

export type Timeline<T> = {
  /** Current state (mutable between commits). */
  state: T;
  /** Snapshot current state under a label; returns the checkpoint id. */
  checkpoint(label?: string): string;
  /** Commit a mutation and auto-checkpoint the previous state. */
  commit(next: Partial<T> | ((prev: T) => T)): Checkpoint<T>;
  /** List all checkpoints on this branch. */
  checkpoints(): Array<Checkpoint<T>>;
  /** Restore state to a checkpoint id or label. Drops later checkpoints. */
  rewind(idOrLabel: string): T;
  /** Branch off the current state into an independent timeline. */
  fork(label?: string): Timeline<T>;
  /** Parent branch name when this timeline is a fork. */
  origin?: string;
};

export function createTimeline<T extends Record<string, unknown>>(
  initial: T,
  meta: { origin?: string } = {}
): Timeline<T> {
  let state: T = clone(initial);
  const log: Array<Checkpoint<T>> = [];
  let step = 0;
  let counter = 0;

  function snapshot(label: string): string {
    step += 1;
    const id = `chk_${step}_${(++counter).toString(36)}`;
    log.push({ id, label, state: clone(state), at: new Date().toISOString(), step });
    return id;
  }

  return {
    get state() {
      return state;
    },
    set state(next: T) {
      state = next;
    },
    checkpoint(label = `checkpoint-${step + 1}`) {
      return snapshot(label);
    },
    commit(next) {
      const prev = clone(state);
      state =
        typeof next === "function"
          ? (next as (p: T) => T)(clone(state))
          : ({ ...state, ...clone(next as Partial<T>) } as T);
      step += 1;
      const id = `chk_${step}_${(++counter).toString(36)}`;
      const cp: Checkpoint<T> = { id, label: `commit-${step}`, state: prev, at: new Date().toISOString(), step };
      log.push(cp);
      return cp;
    },
    checkpoints: () => log.map((c) => ({ ...c, state: clone(c.state) })),
    rewind(idOrLabel) {
      const index = findIndex(log, idOrLabel);
      if (index < 0) throw new Error(`No checkpoint named "${idOrLabel}".`);
      state = clone(log[index].state);
      log.length = index + 1; // the divergent future is deleted; the anchor stays
      step = log[index].step;
      return state;
    },
    fork(label = `fork-${step}`) {
      const child = createTimeline<T>(clone(state), { origin: meta.origin ?? label });
      return child;
    },
    ...(meta.origin ? { origin: meta.origin } : {}),
  };
}

/* ------------------------- deterministic replay -------------------------- */

export type RecordedCall = {
  tool: string;
  input: unknown;
  output: unknown;
};

export type Recorder = {
  calls: RecordedCall[];
};

/**
 * Wrap a tool so every (tool, input) -> output is recorded for later replay.
 */
export function record<I, O>(t: Tool<I, O>, recorder: Recorder): Tool<I, ToolResult<O>> {
  return {
    name: t.name,
    description: t.description,
    schema: t.schema,
    ...(t.inputSchema ? { inputSchema: t.inputSchema } : {}),
    async execute(input: I, ctx: ToolContext): Promise<ToolResult<O>> {
      const outcome = await runTool(t, input, ctx);
      recorder.calls.push({
        tool: t.name,
        input: clone(input),
        output: outcome.ok ? clone(outcome.value) : clone(outcome),
      });
      return outcome.ok ? outcome.value : outcome;
    },
  };
}

/**
 * Replay a recording: identical inputs return identical outputs without ever
 * touching the original side effects. Unknown inputs fail loudly.
 */
export function replay(recorder: Recorder): Tool<unknown, ToolResult<unknown>> {
  return {
    name: "replay",
    description: "Deterministically replay recorded tool outputs by tool name and input.",
    schema: {
      type: "object",
      properties: { tool: { type: "string" }, input: {} },
      required: ["tool"],
      additionalProperties: false,
    },
    async execute(input: { tool: string; input?: unknown }): Promise<ToolResult<unknown>> {
      const needle = JSON.stringify(input.input ?? null);
      const hit = recorder.calls.find(
        (c) => c.tool === input.tool && JSON.stringify(c.input ?? null) === needle
      );
      if (!hit) {
        return {
          ok: false,
          error: {
            code: "REPLAY_MISS",
            message: `No recorded call for ${input.tool} with that input.`,
            retryable: false,
          },
        };
      }
      return clone(hit.output);
    },
  };
}

function findIndex(log: Array<Checkpoint<unknown>>, idOrLabel: string): number {
  return log.findIndex((c) => c.id === idOrLabel || c.label === idOrLabel);
}

function clone<V>(value: V): V {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as V;
}