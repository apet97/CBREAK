const path = require('path');
const fs = require('fs');

/**
 * Custom Jest resolver that maps .js imports to .ts source files.
 * TypeScript's ESM-style ".js" extension imports need this to resolve
 * correctly in Jest's module system.
 */
module.exports = (request, options) => {
  // If the request ends with .js, try .ts first
  if (request.endsWith('.js')) {
    const tsPath = request.replace(/\.js$/, '.ts');
    const resolvedTs = path.resolve(options.basedir, tsPath);
    if (fs.existsSync(resolvedTs)) {
      return options.defaultResolver(tsPath, options);
    }
  }
  return options.defaultResolver(request, options);
};
