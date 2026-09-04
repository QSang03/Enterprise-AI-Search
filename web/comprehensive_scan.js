const fs = require('fs');
const path = require('path');

function scanDir(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.next', '.git', '__tests__', 'tests'].includes(entry.name)) {
      scanDir(fp, results);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      if (entry.name.includes('.test.') || entry.name.includes('.spec.') || entry.name.includes('.stories.')) continue;
      const content = fs.readFileSync(fp, 'utf8');
      
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Skip comments, imports, logs
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('import') || trimmed.includes('console.log')) return;
        
        // Match string literals in JSX: >Text here<
        // Also match placeholder="Text here" or tooltip="Text here" or label="Text here"
        const jsxTextMatch = trimmed.match(/>\s*([A-Z][a-zA-Z\s,.'"!?-]{3,})\s*</);
        if (jsxTextMatch) {
          const text = jsxTextMatch[1].trim();
          if (!text.includes('{') && !text.includes('}') && !text.includes('className') && !text.includes('style=')) {
            results.push(`${fp.replace(/\\/g, '/')}:${index + 1}: [JSX TEXT] ${text}`);
          }
        }

        const propMatch = trimmed.match(/(?:placeholder|tooltip|label|title|description)\s*=\s*["']([A-Z][a-zA-Z\s,.'"!?-]{3,})["']/);
        if (propMatch) {
          const text = propMatch[1].trim();
          if (!text.includes('{') && !text.includes('}')) {
            results.push(`${fp.replace(/\\/g, '/')}:${index + 1}: [PROP] ${text}`);
          }
        }
      });
    }
  }
  return results;
}

const r = scanDir('src');
r.forEach(line => console.log(line));
console.log('Total potential untranslated strings found:', r.length);
