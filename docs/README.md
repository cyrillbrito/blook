# Docs

- [architecture.md](architecture.md): the parts of Blook and the key decisions
- [bundle-format.md](bundle-format.md): the exact bundle layout and fields. Change the export and you change this doc and the skill with it.
- [references.md](references.md): similar tools, cloned in `references/`
- [../packages/cli/README.md](../packages/cli/README.md): the replay CLI
- [cli-design.md](cli-design.md): the rules the CLI follows for agents and people
- [../skills/blook/SKILL.md](../skills/blook/SKILL.md): the agent skill

Contracts in code: `packages/core/src/types.ts` (stored rows and settings) and `packages/extension/lib/messages.ts` (messages between extension contexts).
