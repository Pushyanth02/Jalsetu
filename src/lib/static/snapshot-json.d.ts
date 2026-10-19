// Ambient module type for the committed demo dataset. Declaring the module
// keeps TypeScript from inferring the full literal type of a 400+ KB JSON file
// (slow, and prone to "type instantiation is excessively deep"); the loader in
// src/lib/static/db.ts casts to the structured SnapshotFile type instead.
declare module "@/data/snapshot.json" {
  const snapshot: unknown;
  export default snapshot;
}
