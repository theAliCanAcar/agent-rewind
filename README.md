# Agent Rewind

Time travel for agents: checkpoint/rewind state timelines, fork alternate branches, and deterministically replay recorded tool runs.

TypeScript package `agent-rewind`.

## Install

```sh
npm install github:theAliCanAcar/agent-rewind#main
```

## How to use

```ts
import { createTimeline } from 'agent-rewind';

const timeline = createTimeline({ step: 0, note: 'start' });
const cp = timeline.checkpoint('before-edit');
timeline.state.step = 1;
timeline.rewind(cp.id);
console.log(timeline.state);
```

## Use cases

### 1. Undo a bad tool side path

- **Scenario:** An agent took a wrong branch after step 3.
- **Outcome:** checkpoint and rewind the timeline, then continue from a safe state.

### 2. Replay recorded tool calls

- **Scenario:** You need a deterministic demo or debug session.
- **Outcome:** record tools once, then replay the transcript.

## Dependencies

- `agent-tools`: `github:theAliCanAcar/agent-tools#main`

## Scripts

```sh
npm install
npm run build
```

## Notes

- Keep API keys in environment variables or a gitignored `.env`. Never commit secrets.
- Side-effecting tools should go through approval when used with `agent-approval`.
- Related packages live in separate repositories under [theAliCanAcar](https://github.com/theAliCanAcar).

## License

MIT
