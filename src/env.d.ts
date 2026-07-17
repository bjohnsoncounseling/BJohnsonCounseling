/**
 * Fontsource packages ship CSS, not JS modules, so TypeScript has no type
 * declarations for these side-effect imports and flags ts(2882). The imports
 * are correct and the build resolves them; this just tells TS they exist.
 */
declare module '@fontsource-variable/*';
