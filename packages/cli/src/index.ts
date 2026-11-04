// Library entry for wrappers (e.g. a future MCP server): keep one ReplayEngine
// alive, open() a TabReplay per bundle+tab, then call screenshot/dom/pointer.
export * from './bundle.ts';
export * from './replay.ts';
