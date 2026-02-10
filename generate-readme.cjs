const fs = require('fs');
const path = require('path');

const pluginDir = path.join(__dirname, 'plugins');
const pluginFolders = fs.readdirSync(pluginDir).filter(name =>
  fs.statSync(path.join(pluginDir, name)).isDirectory()
);

const summaries = [];

for (const folder of pluginFolders) {
  const packageJsonPath = path.join(pluginDir, folder, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const name = pkg.name || folder;
    const description = pkg.description || 'No description provided.';
    const version = pkg.version || '0.0.0';
    const author = typeof pkg.author === 'string'
      ? pkg.author
      : (pkg.author?.name || 'Unknown');

    summaries.push(`### ${name}
- **Description**: ${description}
- **Version**: ${version}
- **Author**: ${author}`);
  }
}

const readmeContent = `# Plugin Overview

This README is auto-generated from the plugin metadata in the \`plugins/\` folder.

${summaries.join('\n\n')}
`;

fs.writeFileSync('README.md', readmeContent);
