# Docs

Short, high-level guidance. Technical detail lives next to the code.

- [architecture.md](architecture.md): how recording, the bundle, the viewer and the agent side fit together, and the key decisions
- [bundle-format.md](bundle-format.md): the exact bundle layout and fields. The agent skill is written from it, so keep it in sync with `lib/export/`.
- [../cli/README.md](../cli/README.md): the replay CLI
- [../skills/blook/SKILL.md](../skills/blook/SKILL.md): the agent skill

Background:

- [references.md](references.md): similar tools and what we borrowed. Their source is cloned in `references/`.
- [research.md](research.md): the original tool comparison and a safety review of Proofline
- [skill-research.md](skill-research.md): how other tools guide agents through recordings, which shaped the skill
