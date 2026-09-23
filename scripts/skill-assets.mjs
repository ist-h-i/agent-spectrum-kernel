import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

// One inventory for installation, canonical input hashing and managed assets.
// Only SKILL.md and references/ belong to this textual projection contract.
export function skillAssets(repoRoot, selectedSkills) {
  const root = resolve(repoRoot, "skills");
  const assets = [];
  const directory = (path) => {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Skill asset directory must be a real directory: ${path}`);
  };
  directory(root);
  for (const skill of [...new Set(selectedSkills)].sort()) {
    if (typeof skill !== "string" || !SKILL_NAME.test(skill)) throw new Error(`Invalid skill name: ${skill}`);
    const skillRoot = resolve(root, skill);
    directory(skillRoot);
    const collect = (relativePath) => {
      const sourcePath = `skills/${skill}/${relativePath}`;
      const absolutePath = resolve(repoRoot, sourcePath);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`Skill asset symlinks are not supported: ${sourcePath}`);
      if (stat.isDirectory()) {
        for (const name of readdirSync(absolutePath).sort()) {
          if (name.includes("\\")) throw new Error(`Invalid skill asset name: ${sourcePath}/${name}`);
          collect(`${relativePath}/${name}`);
        }
      } else if (stat.isFile()) {
        // Fail before any installer writes rather than replacing invalid bytes.
        new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(absolutePath));
        assets.push({ skill, relativePath, sourcePath });
      } else {
        throw new Error(`Skill asset must be a regular file: ${sourcePath}`);
      }
    };
    const entry = lstatSync(resolve(skillRoot, "SKILL.md"));
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Skill entry must be a regular file: ${skill}/SKILL.md`);
    collect("SKILL.md");
    const references = lstatSync(resolve(skillRoot, "references"), { throwIfNoEntry: false });
    if (references) {
      directory(resolve(skillRoot, "references"));
      collect("references");
    }
  }
  return assets;
}
